import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createServer } from 'net';
import FormData from 'form-data';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import { fileURLToPath } from 'url';

// Debug logging is handled by centralized log.js
// Per debug.md: Debug logging is disabled by default. Enable it by creating logs/.debug flag file.

// Load .env file BEFORE importing modules that depend on it
// Try multiple paths: server directory, parent directory, and root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPaths = [
  path.join(__dirname, '.env'), // Same directory as server.js
  path.join(__dirname, '..', '.env'), // Parent directory
  path.join(process.cwd(), 'src', 'server', '.env'), // From root
  path.join(process.cwd(), '.env'), // Root directory
];

let envPath = null;
for (const tryPath of envPaths) {
  if (fs.existsSync(tryPath)) {
    envPath = tryPath;
    break;
  }
}

if (envPath) {
  const dotenvResult = dotenv.config({ path: envPath });
  if (dotenvResult.error) {
    try { tlogSync('Error loading .env file:', dotenvResult.error); } catch (_) {}
  } else {
    try { tlogSync('.env file loaded successfully from:', envPath); } catch (_) {}
    try { tlogSync('R2_ACCESS_KEY present:', !!process.env.R2_ACCESS_KEY); } catch (_) {}
    try { tlogSync('R2_SECRET_KEY present:', !!process.env.R2_SECRET_KEY); } catch (_) {}
    try { tlogSync('POSTHOG_KEY present:', !!process.env.POSTHOG_KEY); } catch (_) {}
    try { tlogSync('POSTHOG_KEY valid:', !!(process.env.POSTHOG_KEY && process.env.POSTHOG_KEY !== '<your_project_api_key>')); } catch (_) {}
  }
} else {
  try { tlogSync('Warning: .env file not found. Tried paths:', envPaths.join(', ')); } catch (_) {}
}

import { track, identify, setUserProperties, distinctId } from './telemetry';

// Modular imports
import { APP_ID, EXT_ROOT, MANIFEST_PATH, EXTENSION_LOCATION, UPDATES_REPO, UPDATES_CHANNEL, GH_TOKEN, GH_UA, BASE_DIR, DIRS, HOST, DEFAULT_PORT, PORT_RANGE, isSpawnedByUI } from './serverConfig';
import { tlog, tlogSync } from './utils/log';
import { safeStat, safeStatSync, safeExists, safeText, pipeToFile } from './utils/files';
import { toReadableLocalPath, resolveSafeLocalPath, normalizePaths, normalizeOutputDir, guessMime } from './utils/paths';
import { parseBundleVersion, normalizeVersion, compareSemver, getCurrentVersion } from './utils/serverVersion';
import { exec, execPowerShell, runRobocopy } from './utils/exec';
import { scheduleCleanup } from './services/cleanup';
import { r2Upload, r2Client } from './services/r2';
import { extractAudioFromVideo } from './services/video';
import { convertAudio } from './services/audio';
import { getLatestReleaseInfo, applyUpdate } from './services/update';
import { createGeneration, pollSyncJob, setSaveJobsCallback } from './services/generation';
import systemRoutes from './routes/system';
import apiRoutes from './routes/api';
import fileRoutes from './routes/files';
import aiRoutes from './routes/ai';
import audioRoutes from './routes/audio';
import jobsRoutes from './routes/jobs';
import recordingRoutes from './routes/recording';
import debugRoutes from './routes/debug';
import { DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB, SYNC_API_BASE } from './routes/constants';

const isSpawnedByCEP = process.stdout.isTTY === false && process.stderr.isTTY === false;

if (isSpawnedByCEP) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
}

const app = express();
app.disable('x-powered-by');

// Initialize PostHog user identification
(async () => {
  try {
    const version = await getCurrentVersion();
    identify({
      extensionLocation: EXTENSION_LOCATION,
      appId: APP_ID,
      version: version,
      updatesRepo: UPDATES_REPO
    });
    await track('server_started', {
      extensionLocation: EXTENSION_LOCATION,
      appId: APP_ID,
      version: version
    });
  } catch (e) {
    // Silent fail for telemetry
  }
})();

// Health check endpoint BEFORE middleware to avoid blocking
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Conditional body parsing - skip JSON parsing for session-replay to preserve gzip
app.use((req, res, next) => {
  // Skip JSON parsing for session-replay endpoint (needs raw body for gzip)
  if (req.path === '/telemetry/session-replay' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      req.body = req.rawBody; // Set body to raw buffer
      next();
    });
  } else {
    // For all other routes, use JSON parsing
    express.json({ limit: '50mb' })(req, res, next);
  }
});

// Request timeout middleware to prevent hanging requests
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      try { tlog('request:timeout', req.method, req.path); } catch (_){}
      res.status(408).json({ error: 'Request timeout' });
    }
  }, 300000); // 5 minute timeout (aligned with dubbing timeout)
  
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// Restrict CORS to local panel (file:// → Origin null) and localhost
// Relaxed CORS: allow any origin on localhost-only service
app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true);
    cb(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'X-CEP-Panel'],
  maxAge: 86400
}));

let jobs = [];
// jobCounter removed - using Sync API IDs directly
const STATE_DIR = DIRS.state;
if (!fs.existsSync(STATE_DIR)) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch (_) {}
}
const jobsFile = path.join(STATE_DIR, 'jobs.json');
const tokenFile = path.join(STATE_DIR, 'auth_token');

async function getOrCreateToken() {
  try {
    try {
      const t = await fs.promises.readFile(tokenFile, 'utf8');
      const trimmed = t.trim();
      if (trimmed.length > 0) return trimmed;
    } catch {}
  } catch (_) {}
  const token = crypto.randomBytes(24).toString('hex');
  try {
    await fs.promises.writeFile(tokenFile, token, { mode: 0o600 });
  } catch (_) {}
  return token;
}

let AUTH_TOKEN = '';
getOrCreateToken().then(token => {
  AUTH_TOKEN = token;
}).catch (() => {
  AUTH_TOKEN = crypto.randomBytes(24).toString('hex');
});

function initializeJobs() {
  try {
    tlog('initializeJobs: checking file:', jobsFile);
    if (fs.existsSync(jobsFile)) {
      const data = fs.readFileSync(jobsFile, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data);
        jobs = Array.isArray(parsed) ? parsed : [];
        tlog(`initializeJobs: loaded ${jobs.length} jobs from file`);
      } else {
        tlog('initializeJobs: file exists but is empty');
        jobs = [];
      }
    } else {
      tlog('initializeJobs: file does not exist, creating empty array');
      jobs = [];
    }
  } catch (e) {
    tlog('initializeJobs error:', e && e.message ? e.message : String(e));
    jobs = [];
  }
  // No need to initialize jobCounter - using Sync API IDs directly
}

function saveJobs() {
  try {
    fs.writeFileSync(jobsFile, JSON.stringify(jobs || [], null, 2), 'utf8');
  } catch (e) {
    tlog('saveJobs error:', e && e.message ? e.message : String(e));
  }
}

initializeJobs();

// Set up generation service callback
setSaveJobsCallback(saveJobs);

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
  if (tokenRateLimit.size > 100) {
    for (const [k, v] of tokenRateLimit.entries()) {
      if (now - v > 60000) tokenRateLimit.delete(k);
    }
  }
  return true;
}

function requireCEPHeader(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || null;
  if (!origin || origin === 'file://') return next();
  const cepHeader = req.headers['x-cep-panel'];
  if (cepHeader === 'sync') return next();
  try {
    tlog('requireCEPHeader: rejected request from', origin, 'missing X-CEP-Panel header');
  } catch (_) {}
  return res.status(403).json({ error: 'forbidden' });
}

/**
 * Auth middleware - validates token from request
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 * @returns {void}
 */
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token === AUTH_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'authentication required' });
}

// Middleware to pass AUTH_TOKEN to routes
app.use((req, res, next) => {
  req.authToken = AUTH_TOKEN;
  req.jobs = jobs;
  // req.jobCounter removed - using Sync API IDs directly
  req.saveJobs = saveJobs;
  next();
});

// Auth middleware must run BEFORE routes to check public paths
app.use((req, res, next) => {
  const publicPaths = [
    '/logs',
    '/health',
    '/auth/token',
    '/admin/exit', // Allow localhost shutdown requests
    '/update/check',
    '/update/version',
    '/upload',
    '/debug',
    '/costs',
    '/cost/estimate',
    '/dubbing',
    '/tts/generate',
    '/tts/voices',
    '/tts/voices/create',
    '/tts/voices/delete',
    '/recording/save',
    '/recording/file',
    '/extract-audio',
    '/download',
    '/mp3/file',
    '/wav/file',
    '/waveform/file',
    '/video/file',
    '/telemetry/test',
    '/telemetry/posthog-status',
    '/telemetry/session-replay'
  ];
  // Check exact path match - Express normalizes req.path
  // Also check req.url without query string as fallback
  const requestPath = req.path || req.url.split('?')[0];
  if (publicPaths.includes(requestPath)) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Mount all routes
app.use('/', systemRoutes);
app.use('/', apiRoutes);
app.use('/', fileRoutes);
app.use('/', aiRoutes);
app.use('/', audioRoutes);
app.use('/', jobsRoutes);
app.use('/', recordingRoutes);
app.use('/', debugRoutes);

// PostHog connectivity test endpoint
app.get('/telemetry/test', async (req, res) => {
  try {
    // Test PostHog connectivity
    track('telemetry_test', {
      testType: 'connectivity',
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      ok: true, 
      message: 'PostHog test event sent',
      distinctId: distinctId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/upload', async (req, res) => {
  try {
    const { path: filePath, syncApiKey } = req.body || {};
    
    tlog('[upload] Request received', {
      hasFilePath: !!filePath,
      filePath: filePath ? filePath.substring(0, 100) : 'null',
      hasSyncApiKey: !!syncApiKey
    });
    
    if (!filePath) {
      tlog('[upload] Missing file path');
      return res.status(400).json({ error: 'File path required' });
    }
    
    if (!fs.existsSync(filePath)) {
      tlog('[upload] File not found', { filePath });
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Track upload start
    const fileStat = await safeStat(filePath);
    track('upload_started', {
      fileSize: fileStat?.size || 0,
      fileName: path.basename(filePath),
      hostApp: APP_ID
    });
    
    tlog('[upload] Starting R2 upload', {
      fileName: path.basename(filePath),
      fileSize: fileStat?.size || 0
    });
    
    // Set a timeout for the entire upload process
    const uploadTimeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Upload timeout' });
      }
    }, 300000); // 5 minute timeout for the entire upload
    
    try {
      // Upload to R2 and return the cloud URL
      const fileUrl = await r2Upload(filePath);
      
      tlog('[upload] R2 upload successful', {
        fileName: path.basename(filePath),
        url: fileUrl ? fileUrl.substring(0, 100) + '...' : 'null',
        urlLength: fileUrl ? fileUrl.length : 0
      });
      
      // Track upload success
      track('upload_completed', {
        fileSize: fileStat?.size || 0,
        fileName: path.basename(filePath),
        hostApp: APP_ID
      });
      
      clearTimeout(uploadTimeout);
      if (!res.headersSent) {
        res.json({ ok: true, url: fileUrl });
      }
    } catch (uploadError) {
      tlog('[upload] R2 upload failed', {
        fileName: path.basename(filePath),
        error: String(uploadError?.message || uploadError)
      });
      
      // Track upload failure
      track('upload_failed', {
        fileSize: fileStat?.size || 0,
        fileName: path.basename(filePath),
        error: String(uploadError?.message || uploadError),
        hostApp: APP_ID
      });
      
      clearTimeout(uploadTimeout);
      if (!res.headersSent) {
        res.status(500).json({ error: String(uploadError?.message || uploadError) });
      }
    }
  } catch (e) {
    tlog('[upload] Exception', { error: String(e?.message || e) });
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

app.post('/download', async (req, res) => {
  try {
    const { url, type } = req.body || {};
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL required' });
    }
    
    if (!type || (type !== 'video' && type !== 'audio')) {
      return res.status(400).json({ error: 'Type must be "video" or "audio"' });
    }
    
    tlog('POST /download', 'url=' + url, 'type=' + type);
    
    try {
      // Download the file from URL
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: 'Failed to download file from URL' });
      }
      
      // Determine file extension based on type and content type
      let ext = type === 'video' ? '.mp4' : '.wav';
      const contentType = response.headers.get('content-type');
      if (contentType) {
        if (contentType.includes('video/mp4')) ext = '.mp4';
        else if (contentType.includes('video/webm')) ext = '.webm';
        else if (contentType.includes('video/quicktime')) ext = '.mov';
        else if (contentType.includes('audio/wav') || contentType.includes('audio/wave')) ext = '.wav';
        else if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) ext = '.mp3';
        else if (contentType.includes('audio/mp4')) ext = '.m4a';
      }
      
      // Save to temporary directory
      const tempDir = os.tmpdir();
      const tempFileName = `downloaded_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
      const localPath = path.join(tempDir, tempFileName);
      
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(buffer));
      
      tlog('Downloaded file to', localPath);
      
      res.json({ ok: true, path: localPath });
    } catch (error) {
      tlog('Download error', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download: ' + error.message });
      }
    }
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

let PANEL_SETTINGS = null;

app.get('/settings', (req, res) => {
  res.json({ ok: true, settings: PANEL_SETTINGS });
});

app.post('/settings', (req, res) => {
  try {
    PANEL_SETTINGS = (req.body && req.body.settings) ? req.body.settings : null;
    res.json({ ok: true });
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: String(e?.message || e) });
  }
});

/**
 * Helper to convert AIFF files to WAV if needed
 * @param {string} p - Path to audio file
 * @returns {Promise<string>} - Path to WAV file (converted or original)
 */
async function convertIfAiff(p) {
  try {
    if (!p || typeof p !== 'string') return p;
    const lower = p.toLowerCase();
    if (!(lower.endsWith('.aif') || lower.endsWith('.aiff'))) return p;
    tlog('convertIfAiff', p);
    const out = await convertAudio(p, 'wav');
    if (out && fs.existsSync(out)) {
      tlog('convertIfAiff ok', out);
      return out;
    }
    tlog('convertIfAiff failed');
    return p;
  } catch (e) {
    tlog('convertIfAiff error', e && e.message ? e.message : String(e));
    return p;
  }
}

function log() {
}

const LOGS = [];

function slog() {
  const msg = Array.from(arguments).map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
  LOGS.push(new Date().toISOString() + ' ' + msg);
  if (LOGS.length > 500) LOGS.shift();
}
app.get('/logs', (_req, res) => {
  res.json({ ok: true, logs: LOGS.slice(-200) });
});

/**
 * Function to check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, HOST, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

/**
 * Function to find an available port (pinned to 3000)
 * @returns {Promise<number>} - Port number (always 3000)
 */
async function findAvailablePort() {
  return 3000;
}

/**
 * Start server on fixed port 3000 (best‑effort)
 * Handles graceful shutdown of existing instances
 * @returns {Promise<number>} - Port number on success
 */
let startupLock = false;
async function startServer() {
  if (startupLock) {
    try { tlogSync('Server startup already in progress, skipping...'); } catch (_) {}
    return;
  }
  startupLock = true;
  
  try {
    const PORT = 3000;
    // Always replace existing server to ensure fresh code is running
    try {
      const r = await fetch(`http://${HOST}:${PORT}/health`, { 
        method: 'GET',
        timeout: 2000 // Shorter timeout for health check
      });
      if (r && r.ok) {
        try { tlogSync(`Existing Sync Extension server detected on http://${HOST}:${PORT}`); } catch (_) {}
        try { tlogSync(`Requesting shutdown of existing server to replace with fresh code...`); } catch (_) {}
        
        // Try to gracefully shutdown via admin endpoint
        try {
          await fetch(`http://${HOST}:${PORT}/admin/exit`, { 
            method:'POST',
            timeout: 2000
          });
        } catch (e) {
          // If admin/exit fails, try to find and kill the process
          try { tlogSync('Admin exit failed, will attempt process kill if port still in use'); } catch (_) {}
        }
        
        // Wait for shutdown - check port availability with retries
        let portFree = false;
        for (let i = 0; i < 10; i++) {
          await new Promise(r2=>setTimeout(r2, 200));
          const available = await isPortAvailable(PORT);
          if (available) {
            portFree = true;
            break;
          }
        }
        
        if (!portFree) {
          try { tlogSync(`Port ${PORT} still in use after shutdown request, proceeding anyway (will handle EADDRINUSE)`); } catch (_) {}
        }
      }
    } catch (_) { 
      // Health check failed - server not running, proceed to start
    }
    
    // Log debug info if enabled (per debug.md: only when logs/.debug flag exists)
    try { tlog('attempting to start server on', `${HOST}:${PORT}`); } catch (_) {}
    
    let serverInstance = null;
    const srv = app.listen(PORT, HOST, () => {
      serverInstance = srv;
      try { tlogSync(`Sync Extension server running on http://${HOST}:${PORT}`); } catch (_) {}
      try { tlogSync(`Jobs file: ${jobsFile}`); } catch (_) {}
      try { tlog('server started on', `${HOST}:${PORT}`); } catch (_){ }
      
      // Start cleanup scheduling
      scheduleCleanup();
    });
    
    // Graceful shutdown handlers
    const gracefulShutdown = (signal) => {
      try { tlogSync(`${signal} received - shutting down gracefully...`); } catch (_) {}
      try { tlog(`${signal} received - shutting down`); } catch (_) {}
      
      if (serverInstance) {
        serverInstance.close(() => {
          try { tlogSync('Server closed'); } catch (_) {}
          process.exit(0);
        });
        
        // Force close after 5 seconds
        setTimeout(() => {
          try { tlogSync('Forced shutdown after timeout'); } catch (_) {}
          process.exit(1);
        }, 5000);
      } else {
        process.exit(0);
      }
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    srv.on('error', async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        // Port is in use - this shouldn't happen if shutdown worked, but handle it
        try { tlogSync(`Port ${PORT} in use - attempting to force shutdown...`); } catch (_) {}
        try {
          // Try one more time to shut down the existing server
          await fetch(`http://${HOST}:${PORT}/admin/exit`, { 
            method:'POST',
            timeout: 2000
          }).catch (()=>{});
          
          // Wait a bit longer for port to be released
          await new Promise(r2=>setTimeout(r2, 2000));
          
          // Exit - the extension will retry starting the server
          try { tlogSync(`Exiting to allow extension to retry server startup...`); } catch (_) {}
          process.exit(0);
        } catch (_) {
          try { tlogSync(`Port ${PORT} in use and cannot shut down existing server`); } catch (_) {}
          process.exit(1);
        }
      } else {
        try { tlogSync('Server error', err && err.message ? err.message : String(err)); } catch (_) {}
        process.exit(1);
      }
    });
    return PORT;
  } finally {
    startupLock = false;
  }
}

// Start server with error handling
startServer().catch((err) => {
  // Re-check debug flag using DIRS from config.ts
  try { tlogSync('startServer failed:', err && err.message ? err.message : String(err)); } catch (_) {}
});

// Crash safety - also log to server log
process.on('uncaughtException', (err)=>{ 
  try { 
    tlogSync('uncaughtException:', err && err.stack ? err.stack : String(err));
  } catch (_) {} 
});
process.on('unhandledRejection', (reason)=>{ 
  try { 
    tlogSync('unhandledRejection:', String(reason));
  } catch (_) {} 
});
