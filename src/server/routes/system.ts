import express from 'express';
import fetch from 'node-fetch';
import { track, distinctId } from '../telemetry';
import { tlog, DEBUG_FLAG_FILE, DEBUG_LOG, rotateLogIfNeeded } from '../utils/log';
import { getCurrentVersion, compareSemver } from '../utils/serverVersion';
import { getLatestReleaseInfo, applyUpdate } from '../services/update';
import { APP_ID, isSpawnedByUI, DIRS } from '../serverConfig';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import https from 'https';
import { URL } from 'url';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

function isDebugEnabled() {
  try {
    return fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    return false;
  }
}

function logCriticalError(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [CRITICAL ERROR] ` + args.map(a => String(a)).join(' ') + '\n';
  
  try {
    const errorLogPath = path.join(DIRS.logs, 'posthog-errors.log');
    fs.appendFileSync(errorLogPath, message);
  } catch (e) {
    // If that fails, try temp directory
    try {
      const tempLogPath = path.join(os.tmpdir(), 'posthog-errors.log');
      fs.appendFileSync(tempLogPath, message);
    } catch (e2) {}
  }
  
  if (isDebugEnabled()) {
    try {
      rotateLogIfNeeded(DEBUG_LOG);
      fs.appendFileSync(DEBUG_LOG, message);
    } catch (e) {}
  }
  
  try {
    tlog(...args);
  } catch (e) {}
  
  try {
    if (process.stdout.isTTY !== false) {
      console.error(message.trim());
    }
  } catch (e) {}
}

// Custom middleware to capture raw body for session-replay endpoint
// This preserves gzip-compressed data that express.json() would corrupt
const captureRawBody = (req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
};


// Rate limiting for /auth/token (1 req/sec per IP in production, disabled in dev mode)
const tokenRateLimit = new Map();
function checkTokenRateLimit(ip) {
  // In dev mode, disable rate limiting entirely (React Strict Mode causes rapid requests)
  const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DEV === 'true';
  if (isDevMode) return true; // No rate limit in dev mode
  
  // Production: 1 req/sec
  const now = Date.now();
  const last = tokenRateLimit.get(ip) || 0;
  if (now - last < 1000) return false;
  tokenRateLimit.set(ip, now);
  // Cleanup old entries every 100 requests
  if (tokenRateLimit.size > 100) {
    for (const [k, v] of tokenRateLimit.entries()) {
      if (now - v > 60000) tokenRateLimit.delete(k);
    }
  }
  return true;
}

// Middleware to require X-CEP-Panel header for non-null origins
function requireCEPHeader(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || null;
  if (!origin || origin === 'file://') return next();
  const cepHeader = req.headers['x-cep-panel'];
  if (cepHeader === 'sync') return next();
  try { tlog('requireCEPHeader: rejected request from', origin, 'missing X-CEP-Panel header'); } catch (_) {}
  sendError(res, 403, 'forbidden', 'requireCEPHeader');
}

// Public endpoints
router.get('/health', (req, res) => sendSuccess(res, { status: 'ok', ts: Date.now() }));
router.get('/', (_req, res) => sendSuccess(res, { service: 'sync-extension-server' }));

router.get('/telemetry/test', asyncHandler(async (req, res) => {
  // Debug: Check PostHog configuration
  const posthogKey = process.env.POSTHOG_KEY || '<your_project_api_key>';
  const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  const hasValidKey = posthogKey && posthogKey !== '<your_project_api_key>';
  
  // Test PostHog connectivity
  track('telemetry_test', {
    testType: 'connectivity',
    timestamp: new Date().toISOString()
  });
  
  sendSuccess(res, {
    message: 'PostHog test event sent',
    distinctId: distinctId,
    debug: {
      posthogKeyPresent: !!process.env.POSTHOG_KEY,
      posthogKeyValid: hasValidKey,
      posthogHost: posthogHost
    }
  });
}, 'telemetry/test'));

router.post('/telemetry/posthog-status', asyncHandler(async (req, res) => {
  // Log intercepted requests for debugging
  if (req.body && req.body.intercepted) {
    try {
      tlog('PostHog request intercepted:', req.body.method, req.body.url, 'hasBody:', req.body.hasBody);
    } catch (_) {}
  }
  // Log interceptor setup
  if (req.body && req.body.interceptorSetup) {
    try {
      tlog('PostHog interceptors SET UP at:', req.body.timestamp, 'userAgent:', req.body.userAgent);
    } catch (_) {}
  }
  // Log PostHog status updates
  if (req.body && (req.body.posthogLoaded || req.body.errorType)) {
    try {
      tlog('PostHog status update:', JSON.stringify({
        distinctId: req.body.distinctId,
        posthogLoaded: req.body.posthogLoaded,
        sessionRecordingEnabled: req.body.sessionRecordingEnabled,
        sessionRecordingStarted: req.body.sessionRecordingStarted,
        error: req.body.error,
        errorType: req.body.errorType
      }));
    } catch (_) {}
  }
  sendSuccess(res, { message: 'PostHog status received' });
}, 'telemetry/posthog-status'));

// Proxy endpoint for PostHog session replay uploads
// This bypasses CEP network restrictions by routing through local server
// Raw body is captured in server.js middleware (express.raw()) to preserve gzip compression
router.post('/telemetry/session-replay', async (req, res) => {
  try {
    const posthogApiKey = process.env.POSTHOG_KEY;
    const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    
    if (!posthogApiKey || posthogApiKey === '<your_project_api_key>') {
      sendError(res, 500, 'PostHog not configured', 'telemetry/session-replay');
      return;
    }
    
    // Get original URL from header
    let originalUrl = req.headers['x-posthog-original-url'];
    
    // Final fallback: use default PostHog endpoint
    if (!originalUrl) {
      originalUrl = `${posthogHost}/e/`;
    }
    
    const contentEncoding = req.headers['content-encoding'];
    
    // Build headers - preserve all original headers except host-specific ones
    const forwardHeaders = {};
    // Copy all headers except ones that shouldn't be forwarded
    const skipHeaders = ['host', 'connection', 'x-posthog-original-url'];
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.includes(lowerKey)) {
        forwardHeaders[key] = value;
      }
    }
    
    // Ensure Content-Type is set - PostHog expects application/json for session replays
    // Even though body is gzip-compressed, Content-Type should be application/json
    const contentType = req.headers['content-type'] || 'application/json';
    if (!forwardHeaders['content-type']) {
      forwardHeaders['content-type'] = contentType;
    }
    // Override to application/json if it's text/plain (common when Content-Type isn't set)
    if (forwardHeaders['content-type'] === 'text/plain') {
      forwardHeaders['content-type'] = 'application/json';
      try {
        tlog('Session replay: Changed Content-Type from text/plain to application/json');
      } catch (_) {}
    }
    
    // CRITICAL: Detect and set Content-Encoding for gzip-compressed data
    // PostHog requires this header to decompress the body
    // The client may not send this header, so we auto-detect from gzip magic bytes
    if (!forwardHeaders['content-encoding']) {
      // Check if body has gzip magic bytes (1f 8b) - indicates gzip compression
      if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length >= 2) {
        if (req.rawBody[0] === 0x1f && req.rawBody[1] === 0x8b) {
          forwardHeaders['content-encoding'] = 'gzip';
        }
      }
      // Fallback to original header if it was present
      if (contentEncoding && !forwardHeaders['content-encoding']) {
        forwardHeaders['content-encoding'] = contentEncoding;
      }
    }
    
    // PostHog requires API key in query string - verify it's present
    if (!originalUrl.includes('api_key=')) {
      const separator = originalUrl.includes('?') ? '&' : '?';
      originalUrl = `${originalUrl}${separator}api_key=${encodeURIComponent(posthogApiKey)}`;
    }
    
    // Use raw body - MUST preserve exact binary data for gzip compression
    // req.rawBody is set by server.js middleware BEFORE express.json() processes it
    let body = req.rawBody;
    
    // Fallback to req.body if rawBody somehow missing (shouldn't happen)
    if (!body) {
      body = req.body;
      // Log warning if we had to use req.body instead of rawBody
      try {
        tlog('WARNING: Using req.body instead of req.rawBody - data may be corrupted!');
      } catch (_) {}
    }
    
    // Body MUST be a Buffer to preserve binary/gzip data
    if (!Buffer.isBuffer(body)) {
      // If not a buffer, try to reconstruct (may fail for gzip)
      if (typeof body === 'string') {
        // Try to preserve binary data - use 'latin1' encoding which preserves bytes 0-255
        body = Buffer.from(body, 'latin1');
      } else if (body instanceof Uint8Array) {
        body = Buffer.from(body);
      } else {
        // Last resort - may corrupt gzip data
        body = Buffer.from(String(body || ''), 'latin1');
      }
    }
    
    if (!Buffer.isBuffer(body)) {
      sendError(res, 500, 'Failed to preserve request body format', 'telemetry/session-replay');
      return;
    }
    
    // Validate body is not empty
    if (!body || body.length === 0) {
      logCriticalError('Session replay proxy: Empty body received!', JSON.stringify({
        hasRawBody: !!req.rawBody,
        rawBodySize: req.rawBody ? req.rawBody.length : 0,
        hasBody: !!req.body,
        bodyType: typeof req.body,
        headers: req.headers
      }, null, 2));
      sendError(res, 400, 'Request body is empty', 'telemetry/session-replay');
      return;
    }
    
    // Ensure Content-Length is set correctly for the body
    // Critical: PostHog requires Content-Length to match actual body size
    forwardHeaders['content-length'] = String(body.length);
    
    // Log body info for debugging (only in debug mode to avoid spam)
    // Log AFTER Content-Type fix so we see the correct value
    try {
      if (isDebugEnabled()) {
        const bodyInfo = {
          size: body.length,
          isBuffer: Buffer.isBuffer(body),
          hasContentEncoding: !!forwardHeaders['content-encoding'],
          contentType: forwardHeaders['content-type'],
          contentLength: forwardHeaders['content-length']
        };
        tlog(`Session replay body: ${JSON.stringify(bodyInfo)}`);
      }
    } catch (_) {}
    
    // Always log headers being sent (for debugging payload issues)
    try {
      tlog(`Session replay headers: Content-Type=${forwardHeaders['content-type']}, Content-Encoding=${forwardHeaders['content-encoding'] || 'none'}, Content-Length=${forwardHeaders['content-length']}`);
      
      // If debug enabled, try to peek at decompressed content to verify format
      if (isDebugEnabled() && forwardHeaders['content-encoding'] === 'gzip' && body.length > 0) {
        try {
          const decompressed = zlib.gunzipSync(body);
          const decompressedStr = decompressed.toString('utf8');
          const preview = decompressedStr.substring(0, 300);
          tlog(`Session replay decompressed preview: ${preview}...`);
          
          // Check if it's valid JSON (PostHog expects JSON format)
          try {
            const parsed = JSON.parse(decompressedStr);
            tlog(`Session replay: Decompressed data is valid JSON, array length: ${Array.isArray(parsed) ? parsed.length : 'not an array'}`);
            
            // Check if it's a batch array (PostHog expects array of events)
            if (Array.isArray(parsed) && parsed.length > 0) {
              const firstEvent = parsed[0];
              const eventKeys = Object.keys(firstEvent || {});
              tlog(`Session replay: First event keys: ${eventKeys.join(', ')}`);
              
              // Check for api_key in events (PostHog batch might need this)
              // Note: originalUrl is defined earlier, so it's available here
              const hasApiKey = parsed.some(e => e.api_key || e.properties?.api_key);
              const urlHasApiKey = originalUrl && originalUrl.includes('api_key=');
              if (!hasApiKey && !urlHasApiKey) {
                logCriticalError('Session replay: No api_key found in payload or URL - PostHog might need this!');
              }
              
              // Verify required PostHog fields
              if (!firstEvent.event && !firstEvent.properties) {
                logCriticalError('Session replay: Event missing required fields (event or properties)');
              }
              
              // Check if batch has proper structure
              const hasRequiredFields = parsed.every(e => e.uuid && (e.event || e.properties));
              if (!hasRequiredFields) {
                logCriticalError('Session replay: Some events missing required fields (uuid, event, or properties)');
              }
            } else {
              logCriticalError('Session replay: Payload is not an array or is empty');
            }
          } catch (e) {
            logCriticalError('Session replay: Decompressed data is NOT valid JSON!', e.message);
          }
        } catch (e) {
          logCriticalError('Session replay: Failed to decompress body for inspection', e.message);
        }
      }
    } catch (_) {}
    
    // Always log if body is empty (critical error)
    if (!body || body.length === 0) {
      logCriticalError('Session replay body is EMPTY!', JSON.stringify({
        hasRawBody: !!req.rawBody,
        rawBodySize: req.rawBody ? req.rawBody.length : 0
      }));
    }
    
    // Forward session replay data to PostHog with exact original format
    // node-fetch accepts Buffer directly - it will send it as binary stream
    // IMPORTANT: Don't modify the body - send Buffer as-is to preserve gzip data
    // 
    // CRITICAL: Ensure body is actually a Buffer before sending
    if (!Buffer.isBuffer(body)) {
      logCriticalError('CRITICAL: Body is not a Buffer before fetch!', JSON.stringify({
        bodyType: typeof body,
        isBuffer: Buffer.isBuffer(body),
        bodyLength: body ? body.length : 0
      }));
      sendError(res, 500, 'Invalid body format', 'telemetry/session-replay');
      return;
    }
    
    // Verify body has data
    if (body.length === 0) {
      logCriticalError('CRITICAL: Body is empty before fetch!');
      sendError(res, 400, 'Request body is empty', 'telemetry/session-replay');
      return;
    }
    
    // node-fetch v3: Buffer should work directly, but ensure it's sent correctly
    // PostHog expects the body to be sent as binary data (gzip compressed)
    // Try using Buffer directly first (node-fetch v3 should handle it)
    // CRITICAL FIX: Use native https module instead of node-fetch
    // node-fetch may be incorrectly encoding/converting the Buffer body
    // Native https.request sends Buffer data directly as binary without modification
    const response = await new Promise((resolve, reject) => {
      try {
        const url = new URL(originalUrl);
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            ...forwardHeaders,
            'Host': url.hostname
          }
        };
        
        // Log what we're sending (debug only)
        try {
          if (isDebugEnabled()) {
            tlog(`Sending to PostHog via native https: body size=${body.length}, isBuffer=${Buffer.isBuffer(body)}, Content-Type=${forwardHeaders['content-type']}, Content-Encoding=${forwardHeaders['content-encoding'] || 'none'}, URL=${originalUrl}`);
          }
        } catch (_) {}
        
        const req = https.request(options, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const responseData = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: res.statusCode || 200,
              text: async () => responseData,
              ok: res.statusCode >= 200 && res.statusCode < 300
            });
          });
        });
        
        req.on('error', reject);
        
        // CRITICAL: Send Buffer body directly - native https sends it as binary without modification
        req.write(body);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
    
    const data = typeof response.text === 'function' ? await response.text() : response.text;
    const responseStatus = response.status;
    
    // Log proxy status with response details
    tlog(`Session replay proxy: forwarded to PostHog, status: ${responseStatus}, url: ${originalUrl}`);
    
    // Log response body for ALL status codes to see what PostHog is saying
    if (data && data.length > 0) {
      try {
        const responsePreview = data.length > 500 ? data.substring(0, 500) + '...' : data;
        tlog(`PostHog response (status ${responseStatus}): ${responsePreview}`);
        
        // Check for warnings or issues in response - look for common error patterns
        const lowerData = data.toLowerCase();
        if (lowerData.includes('missing') || lowerData.includes('error') || lowerData.includes('invalid') || 
            lowerData.includes('warning') || lowerData.includes('failed') || lowerData.includes('empty')) {
          logCriticalError(`PostHog response indicates issue: ${responsePreview}`);
          
          // Try to parse as JSON to get more details
          try {
            const jsonResponse = JSON.parse(data);
            if (jsonResponse.error || jsonResponse.warning || jsonResponse.message) {
              logCriticalError(`PostHog error details:`, JSON.stringify(jsonResponse, null, 2));
            }
          } catch (_) {}
        }
        
        // If response is just {"status":"Ok"}, that's normal but doesn't guarantee data was processed
        // PostHog may accept the request but not process it if format is wrong
        if (data === '{"status":"Ok"}' || data.trim() === '{"status":"Ok"}') {
          try {
            tlog('PostHog returned OK - request accepted but verify recordings appear in dashboard');
            // Log warning if recordings don't appear (for debugging)
            logCriticalError('PostHog returned OK but recordings not appearing - possible format issue');
          } catch (_) {}
        }
      } catch (_) {}
    }
    
    // ALWAYS log 400 errors with full details (critical for debugging)
    if (responseStatus === 400) {
      const errorDetails = {
        timestamp: new Date().toISOString(),
        status: responseStatus,
        url: originalUrl,
        responseBody: data,
        responseBodyPreview: data.substring(0, 500),
        requestHeaders: forwardHeaders,
        contentType: forwardHeaders['content-type'],
        contentEncoding: forwardHeaders['content-encoding'],
        bodySize: body ? body.length : 0,
        bodyIsBuffer: Buffer.isBuffer(body),
        originalUrlHeader: req.headers['x-posthog-original-url']
      };
      
      // Log critical error details - this always writes to posthog-errors.log
      logCriticalError('PostHog 400 Error Details:', JSON.stringify(errorDetails, null, 2));
      logCriticalError('PostHog 400 Error Response:', data);
      logCriticalError('PostHog 400 Request Headers:', JSON.stringify(forwardHeaders, null, 2));
      
      // Also try tlog for consistency
      try {
        tlog(`PostHog 400 error: ${data.substring(0, 200)}`);
      } catch (e) {}
    }
    
    // For session-replay, we need to send raw response from PostHog
    // This is a special case - PostHog returns binary/gzip data
    res.status(response.status).send(data);
  } catch (error) {
    // Log error for debugging - always log critical errors
    logCriticalError('Session replay proxy exception:', (error as Error).message);
    logCriticalError('Session replay proxy stack:', (error as Error).stack || 'No stack trace');
    
    // Also try tlog for consistency
    try {
      tlog('Session replay proxy error:', (error as Error).message, (error as Error).stack);
    } catch (_) {}
    
    sendError(res, 500, (error as Error).message, 'telemetry/session-replay');
  }
});

router.get('/auth/token', requireCEPHeader, (req, res) => {
  try {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
      tlog('/auth/token: rejected non-localhost ip', ip);
      sendError(res, 403, 'forbidden', 'auth/token');
      return;
    }
    if (!checkTokenRateLimit(ip)) {
      tlog('/auth/token: rate limit exceeded for', ip);
      sendError(res, 429, 'rate limit exceeded', 'auth/token');
      return;
    }
  } catch (e) { tlog('/auth/token: error', (e as Error).message); }
  sendSuccess(res, { token: req.authToken });
});

router.post('/admin/exit', (req, res) => {
  try {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
      sendError(res, 403, 'forbidden', 'admin/exit');
      return;
    }
  } catch (_) {}
  try { tlog('admin:exit:requested'); } catch (_) {}
  sendSuccess(res);
  setTimeout(() => { try { tlog('admin:exit:now'); } catch (_) {} process.exit(0); }, 300);
});

router.get('/update/version', asyncHandler(async (_req, res) => {
  const current = await getCurrentVersion();
  sendSuccess(res, { version: current });
}, 'update/version'));

router.get('/update/check', asyncHandler(async (_req, res) => {
  const current = await getCurrentVersion();
  const latest = await getLatestReleaseInfo();
  if (!latest) {
    sendSuccess(res, { current, latest: null, tag: null, html_url: `https://github.com`, canUpdate: false, message: 'no releases/tags found' });
    return;
  }
  const cmp = compareSemver(latest.version, current);
  sendSuccess(res, { current, latest: latest.version, tag: latest.tag, html_url: latest.html_url, canUpdate: cmp > 0 });
}, 'update/check'));

router.post('/update/apply', asyncHandler(async (req, res) => {
  const result = await applyUpdate(isSpawnedByUI);
  sendSuccess(res, result);
  // Don't exit immediately - let the panel reload first
  // The server will restart when the panel reloads, which will load the new code
  // Only exit if not spawned by UI (standalone mode)
  if (!isSpawnedByUI) {
    setTimeout(() => { 
      try { tlog('update:post:exit'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} } 
      if (isDebugEnabled()) try { tlog('Exiting server after successful update - panel should reload to use new version'); } catch (_) {} 
      process.exit(0); 
    }, 2000); // Give time for response to be sent
  }
}, 'update/apply'));

export default router;

