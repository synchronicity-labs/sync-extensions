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
import { track, identify, setUserProperties, distinctId } from './telemetry.js';

// Modular imports
import { APP_ID, EXT_ROOT, MANIFEST_PATH, EXTENSION_LOCATION, UPDATES_REPO, UPDATES_CHANNEL, GH_TOKEN, GH_UA, BASE_DIR, DIRS, HOST, DEFAULT_PORT, PORT_RANGE, isSpawnedByUI } from './config.js';
import { tlog, tlogSync, DEBUG_LOG } from './utils/log.js';
import { safeStat, safeStatSync, safeExists, safeText, pipeToFile } from './utils/files.js';
import { toReadableLocalPath, resolveSafeLocalPath, normalizePaths, normalizeOutputDir, guessMime } from './utils/paths.js';
import { parseBundleVersion, normalizeVersion, compareSemver, getCurrentVersion } from './utils/version.js';
import { exec, execPowerShell, runRobocopy } from './utils/exec.js';
import { scheduleCleanup } from './services/cleanup.js';
import { r2Upload, r2Client } from './services/r2.js';
import { extractAudioFromVideo } from './services/video.js';
import { convertAudio } from './services/audio.js';
import { getLatestReleaseInfo, applyUpdate } from './services/update.js';
import { createGeneration, pollSyncJob, setSaveJobsCallback } from './services/generation.js';
import systemRoutes from './routes/system.js';
import apiRoutes from './routes/api.js';
import fileRoutes from './routes/files.js';
import aiRoutes from './routes/ai.js';
import audioRoutes from './routes/audio.js';
import jobsRoutes from './routes/jobs.js';
import recordingRoutes from './routes/recording.js';
import debugRoutes from './routes/debug.js';
import { DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB, SYNC_API_BASE } from './routes/constants.js';

const isSpawnedByCEP = process.stdout.isTTY === false && process.stderr.isTTY === false;

if (isSpawnedByCEP) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
}

const envPath = path.join(process.cwd(), '.env');
console.log('Looking for .env at:', envPath);
console.log('Current working directory:', process.cwd());
console.log('.env file exists:', fs.existsSync(envPath));
dotenv.config({ path: envPath });

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

app.use(express.json({ limit: '50mb' }));

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
let jobCounter = 0;
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
  jobs = jobs || [];
  jobCounter = jobs.length ? Math.max(...jobs.map(j => Number(j.id) || 0)) + 1 : 1;
}

function saveJobs() {
}

initializeJobs();

// Set up generation service callback
setSaveJobsCallback(saveJobs);

const tokenRateLimit = new Map();

function checkTokenRateLimit(ip) {
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
  req.jobCounter = () => ++jobCounter;
  req.saveJobs = saveJobs;
  next();
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
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Track upload start
    const fileStat = await safeStat(filePath);
    track('upload_started', {
      fileSize: fileStat?.size || 0,
      fileName: path.basename(filePath),
      hostApp: APP_ID
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
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

app.use((req, res, next) => {
  const publicPaths = [
    '/logs',
    '/health',
    '/auth/token',
    '/update/check',
    '/update/version',
    '/upload',
    '/debug',
    '/costs',
    '/dubbing',
    '/tts/generate',
    '/tts/voices',
    '/recording/save',
    '/recording/file',
    '/extract-audio',
    '/mp3/file',
    '/wav/file',
    '/waveform/file'
  ];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
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
    console.log('Server startup already in progress, skipping...');
    return;
  }
  startupLock = true;
  
  try {
    const PORT = 3000;
    // If an instance is already healthy on 3000, exit quickly without error
    try {
      const r = await fetch(`http://${HOST}:${PORT}/health`, { 
        method: 'GET',
        timeout: 5000 // 5 second timeout for health check
      });
      if (r && r.ok) {
        console.log(`Existing Sync Extension server detected on http://${HOST}:${PORT}`);
        // Always replace the existing server to ensure fresh code is running
        console.log(`Requesting shutdown of existing server to replace with fresh code...`);
        await fetch(`http://${HOST}:${PORT}/admin/exit`, { 
          method:'POST',
          timeout: 5000
        }).catch (()=>{});
        await new Promise(r2=>setTimeout(r2, 1000)); // Wait longer for graceful shutdown
      }
    } catch (_) { /* ignore */ }
    const srv = app.listen(PORT, HOST, () => {
      console.log(`Sync Extension server running on http://${HOST}:${PORT}`);
      console.log(`Jobs file: ${jobsFile}`);
      try { tlog('server started on', `${HOST}:${PORT}`); } catch (_){ }
      // Start cleanup scheduling
      scheduleCleanup();
    });
    srv.on('error', async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        try {
          const r = await fetch(`http://${HOST}:${PORT}/health`, { 
            method: 'GET',
            timeout: 5000
          });
          if (r && r.ok) {
            console.log(`Port ${PORT} in use by healthy server; requesting shutdown to replace...`);
            // Request shutdown of existing server to replace with fresh code
            await fetch(`http://${HOST}:${PORT}/admin/exit`, { 
              method:'POST',
              timeout: 5000
            }).catch (()=>{});
            await new Promise(r2=>setTimeout(r2, 1000));
            // Exit cleanly so any spawner (e.g., the CEP panel) doesn't leave a zombie process.
            process.exit(0);
          }
        } catch (_) {}
        console.error(`Port ${PORT} in use and health check failed`);
        process.exit(1);
      } else {
        console.error('Server error', err && err.message ? err.message : String(err));
        process.exit(1);
      }
    });
    return PORT;
  } finally {
    startupLock = false;
  }
}

startServer();

// Crash safety
process.on('uncaughtException', (err)=>{ try { console.error('uncaughtException', err && err.stack || err); tlog('uncaughtException', err && err.stack || err); } catch (_) {} });
process.on('unhandledRejection', (reason)=>{ try { console.error('unhandledRejection', reason); tlog('unhandledRejection', String(reason)); } catch (_) {} });
