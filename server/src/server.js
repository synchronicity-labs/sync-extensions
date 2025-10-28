import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createServer } from 'net';
import { createRequire } from 'module';
import FormData from 'form-data';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
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

const require = createRequire(import.meta.url);
const { convertAudio } = require('./audio.cjs');

// ROOT CAUSE FIX: Don't write to stdout/stderr when spawned as detached process
// The CEP panel spawns us with detached:true and pipes stdout/stderr, but stops reading them
// This causes EPIPE errors when we try to console.log. Solution: disable console output entirely.
const isSpawnedByCEP = process.stdout.isTTY === false && process.stderr.isTTY === false;

if (isSpawnedByCEP) {
  // Redirect all console output to null when spawned by CEP
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
}

// Load .env from project root
const envPath = path.join(process.cwd(), '.env');
console.log('Looking for .env at:', envPath);
console.log('Current working directory:', process.cwd());
console.log('.env file exists:', require('fs').existsSync(envPath));
dotenv.config({ path: envPath });

const app = express();
app.disable('x-powered-by');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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


function ghHeaders(extra){
  const h = Object.assign({ 'Accept': 'application/vnd.github+json', 'User-Agent': GH_UA }, extra||{});
  if (GH_TOKEN) h['Authorization'] = `Bearer ${GH_TOKEN}`;
  return h;
}

async function ghFetch(url, opts){
  return await fetch(url, Object.assign({ headers: ghHeaders() }, opts||{}));
}


async function getLatestReleaseInfo(){
  const repo = UPDATES_REPO;
  const base = `https://api.github.com/repos/${repo}`;
  // Try releases first (preferred), then fallback to tags if no releases
  async function tryReleases(){
    const r = await ghFetch(`${base}/releases/latest`);
    if (!r.ok) return null;
    const j = await r.json();
    const tag = j.tag_name || j.name || '';
    if (!tag) return null;
    
    // Look for platform+app-specific release asset (ZXP preferred, ZIP fallback)
    const isWindows = process.platform === 'win32';
    const osName = isWindows ? 'windows' : 'mac';
    const appName = (APP_ID === 'ae' || APP_ID === 'premiere') ? APP_ID : 'premiere';
    const preferredPatterns = [
      // New naming (signed ZXP per app/os)
      new RegExp(`^sync-extension-${appName}-${osName}-signed\\.zxp$`, 'i'),
      // Fallbacks: any zxp for our os
      new RegExp(`^sync-extension-([a-z]+)-${osName}-signed\\.zxp$`, 'i'),
      // Older naming (single asset per os)
      new RegExp(`^sync-extensions-${osName}-${tag}\\.zxp$`, 'i'),
      new RegExp(`^sync-extensions-${osName}-${tag}\\.zip$`, 'i')
    ];

    let asset = null;
    if (Array.isArray(j.assets)){
      for (const pat of preferredPatterns){
        asset = j.assets.find(a => pat.test(String(a.name||'')));
        if (asset) break;
      }
      // Final fallback: any .zxp for our os
      if (!asset) asset = j.assets.find(a => new RegExp(`${osName}.*\\.zxp$`, 'i').test(String(a.name||'')));
      // Last resort: any asset
      if (!asset) asset = j.assets[0];
    }
    
    if (asset) {
      return {
        tag,
        version: normalizeVersion(tag),
        html_url: j.html_url || `https://github.com/${repo}/releases/tag/${tag}`,
        zip_url: asset.browser_download_url,
        is_zxp: String(asset.name||'').toLowerCase().endsWith('.zxp')
      };
    }
    
    // Fallback to zipball if no platform-specific asset found
    return { tag, version: normalizeVersion(tag), html_url: j.html_url || `https://github.com/${repo}/releases/tag/${tag}`, zip_url: j.zipball_url || `${base}/zipball/${tag}` };
  }
  async function tryTags(){
    const r = await ghFetch(`${base}/tags`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) return null;
    const tag = j[0].name || j[0].tag_name || '';
    return { tag, version: normalizeVersion(tag), html_url: `https://github.com/${repo}/releases/tag/${tag}`, zip_url: `${base}/zipball/${tag}` };
  }
  async function tryRedirectLatest(){
    try{
      const resp = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: 'follow', headers: { 'User-Agent': GH_UA } });
      if (!resp.ok) return null;
      const finalUrl = String(resp.url || '');
      const m = /\/releases\/tag\/([^/?#]+)/.exec(finalUrl);
      const tag = m && m[1] ? decodeURIComponent(m[1]) : '';
      if (!tag) return null;
      return { tag, version: normalizeVersion(tag), html_url: finalUrl, zip_url: `https://codeload.github.com/${repo}/zip/refs/tags/${encodeURIComponent(tag)}` };
    }catch(_){ return null; }
  }
  if (UPDATES_CHANNEL === 'tags') {
    return await tryTags();
  }
  const fromReleases = await tryReleases();
  if (fromReleases) return fromReleases;
  const fromTags = await tryTags();
  if (fromTags) return fromTags;
  return await tryRedirectLatest();
}

app.use(express.json({ limit: '50mb' }));

// Request timeout middleware to prevent hanging requests
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      try { tlog('request:timeout', req.method, req.path); } catch(_){}
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
  origin: function(origin, cb){
    // CEP panels load from file:// (origin=null) - always allow
    if (!origin) return cb(null, true);
    // For non-null origins, CORS is allowed but requireCEPHeader middleware enforces header
    cb(null, true);
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-api-key','Authorization','X-CEP-Panel'],
  maxAge: 86400
}));

let jobs = [];
let jobCounter = 0;
// Store state in per-user app-data
const STATE_DIR = DIRS.state;
if (!fs.existsSync(STATE_DIR)) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch(_) {} }
const jobsFile = path.join(STATE_DIR, 'jobs.json');
const tokenFile = path.join(STATE_DIR, 'auth_token');
async function getOrCreateToken(){
  try{
    try {
      const t = await fs.promises.readFile(tokenFile, 'utf8');
      const trimmed = t.trim();
      if (trimmed.length > 0) return trimmed;
    } catch {
      // File doesn't exist or can't be read
    }
  }catch(_){ }
  const token = crypto.randomBytes(24).toString('hex');
  try { await fs.promises.writeFile(tokenFile, token, { mode: 0o600 }); } catch(_) {}
  return token;
}

// Initialize token asynchronously
let AUTH_TOKEN = '';
getOrCreateToken().then(token => {
  AUTH_TOKEN = token;
}).catch(() => {
  // Fallback to random token if file operations fail
  AUTH_TOKEN = crypto.randomBytes(24).toString('hex');
});

function loadJobs(){
  // Cloud-first: do not load persisted jobs
  jobs = jobs || [];
  jobCounter = jobs.length ? Math.max(...jobs.map(j=>Number(j.id)||0)) + 1 : 1;
}
function saveJobs(){
  // Cloud-first: disable writing jobs.json
  return;
}
loadJobs();

// Rate limiting for /auth/token (1 req/sec per IP)
const tokenRateLimit = new Map();
function checkTokenRateLimit(ip){
  const now = Date.now();
  const last = tokenRateLimit.get(ip) || 0;
  if (now - last < 1000) return false;
  tokenRateLimit.set(ip, now);
  // Cleanup old entries every 100 requests
  if (tokenRateLimit.size > 100){
    for (const [k, v] of tokenRateLimit.entries()){
      if (now - v > 60000) tokenRateLimit.delete(k);
    }
  }
  return true;
}

// Middleware to require X-CEP-Panel header for non-null origins
function requireCEPHeader(req, res, next){
  const origin = req.headers.origin || req.headers.referer || null;
  // CEP panels have no origin (null) or file:// origin - always allow
  if (!origin || origin === 'file://') return next();
  // Non-CEP requests must include custom header
  const cepHeader = req.headers['x-cep-panel'];
  if (cepHeader === 'sync') return next();
  try { tlog('requireCEPHeader: rejected request from', origin, 'missing X-CEP-Panel header'); } catch(_){}
  return res.status(403).json({ error: 'forbidden' });
}

// Public endpoints (no auth): health and token fetch
app.get('/health', (req,res)=> res.json({ status:'ok', ts: Date.now() }));
// Friendly root
app.get('/', (_req,res)=> res.json({ ok:true, service:'sync-extension-server' }));

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
app.get('/auth/token', requireCEPHeader, (req,res)=>{
  // Only serve to localhost clients with rate limiting
  try{
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')){
      tlog('/auth/token: rejected non-localhost IP', ip);
      return res.status(403).json({ error:'forbidden' });
    }
    if (!checkTokenRateLimit(ip)){
      tlog('/auth/token: rate limit exceeded for', ip);
      return res.status(429).json({ error:'rate limit exceeded' });
    }
  }catch(e){ tlog('/auth/token: error', e.message); }
  res.json({ token: AUTH_TOKEN });
});

// Public: allow localhost-only shutdown for version handover
app.post('/admin/exit', (req,res)=>{
  try{
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')){
      return res.status(403).json({ error:'forbidden' });
    }
  }catch(_){ }
  try { tlog('admin:exit:requested'); } catch(_){ }
  res.json({ ok:true });
  setTimeout(()=>{ try { tlog('admin:exit:now'); } catch(_){ } process.exit(0); }, 300);
});

// Public: AIFF -> WAV conversion (pure Node) - MP3 now handled directly in ExtendScript
app.post('/audio/convert', async (req, res) => {
  try{
    const { srcPath, format } = req.body || {};
    tlog('POST /audio/convert', 'format=', format, 'srcPath=', srcPath);
    if (!srcPath || typeof srcPath !== 'string' || !path.isAbsolute(srcPath)){
      tlog('convert invalid path');
      return res.status(400).json({ error:'invalid srcPath' });
    }
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error:'source not found' });
    const fmt = String(format||'wav').toLowerCase();
    if (fmt === 'mp3') {
      try {
        const out = await convertAudio(srcPath, fmt);
        if (!out || !fs.existsSync(out)) return res.status(500).json({ error:'conversion failed' });
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        res.json({ ok:true, path: out });
        return;
      } catch(e) {
        tlog('convert mp3 error:', e.message);
        return res.status(500).json({ error: String(e?.message||e) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error:'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok', 'out=', out, 'bytes=', sz); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    res.json({ ok:true, path: out });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Also support a simple GET form to avoid body quoting issues:
// /audio/convert?srcPath=/abs/path/file.aif&format=wav
app.get('/audio/convert', async (req, res) => {
  try{
    const srcPath = String(req.query.srcPath||'');
    const format = String(req.query.format||'wav');
    tlog('GET /audio/convert', 'format=', format, 'srcPath=', srcPath);
    if (!srcPath || !path.isAbsolute(srcPath)){
      tlog('convert invalid path (GET)');
      return res.status(400).json({ error:'invalid srcPath' });
    }
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error:'source not found' });
    const fmt = String(format||'wav').toLowerCase();
    if (fmt === 'mp3') {
      try {
        const out = await convertAudio(srcPath, fmt);
        if (!out || !fs.existsSync(out)) return res.status(500).json({ error:'conversion failed' });
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        res.json({ ok:true, path: out });
        return;
      } catch(e) {
        tlog('convert mp3 error:', e.message);
        return res.status(500).json({ error: String(e?.message||e) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error:'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok (GET)', 'out=', out, 'bytes=', sz); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    res.json({ ok:true, path: out });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});


// ElevenLabs dubbing endpoint
app.post('/dubbing', async (req, res) => {
  try {
    const { audioPath, audioUrl, targetLang, elevenApiKey } = req.body || {};
    tlog('POST /dubbing', 'targetLang='+targetLang, 'audioPath='+audioPath, 'audioUrl='+audioUrl);
    
    if (!targetLang) {
      return res.status(400).json({ error: 'Target language required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    let localAudioPath = audioPath;
    
    // If URL provided, download the audio first
    if (audioUrl && !audioPath) {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download audio from URL' });
        }
        
        // Create temporary file in uploads directory
        const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
        localAudioPath = path.join(DIRS.uploads, tempFileName);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localAudioPath, Buffer.from(buffer));
        
        tlog('Downloaded audio to temp file', localAudioPath);
      } catch (error) {
        tlog('Audio download error', error.message);
        return res.status(400).json({ error: 'Failed to download audio: ' + error.message });
      }
    }
    
    if (!localAudioPath || typeof localAudioPath !== 'string' || !path.isAbsolute(localAudioPath)){
      tlog('dubbing invalid path');
      return res.status(400).json({ error: 'invalid audioPath' });
    }
    
      if (!fs.existsSync(localAudioPath)) {
        return res.status(404).json({ error: 'audio file not found' });
      }

      // Convert WAV to MP3 for ElevenLabs compatibility (ElevenLabs rejects WAV files)
      const audioExt = path.extname(localAudioPath).toLowerCase();
      if (audioExt === '.wav') {
        try {
          const { convertAudio } = require('./audio.cjs');
          const mp3Path = localAudioPath.replace(/\.wav$/i, '.mp3');
          await convertAudio(localAudioPath, 'mp3');
          localAudioPath = mp3Path;
          tlog('Converted WAV to MP3 for ElevenLabs:', localAudioPath);
        } catch (convertError) {
          tlog('WAV to MP3 conversion failed:', convertError.message);
          return res.status(400).json({ error: 'Failed to convert WAV to MP3: ' + convertError.message });
        }
      }

      try {
      // Create ElevenLabs dubbing job
      const formData = new FormData();
      formData.append('file', fs.createReadStream(localAudioPath));
      formData.append('target_lang', targetLang);
      
      const dubbingResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });
      
      if (!dubbingResponse.ok) {
        const errorText = await dubbingResponse.text();
        tlog('ElevenLabs dubbing error:', dubbingResponse.status, errorText);
        return res.status(dubbingResponse.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const dubbingData = await dubbingResponse.json();
      const dubbingId = dubbingData.dubbing_id;
      
      if (!dubbingId) {
        return res.status(500).json({ error: 'No dubbing ID returned from ElevenLabs' });
      }
      
      tlog('ElevenLabs dubbing job created:', dubbingId);
      
      // Poll for completion
      const pollInterval = 5000; // 5 seconds
      const maxAttempts = 60; // 5 minutes max
      let attempts = 0;
      
      const pollForCompletion = async () => {
        attempts++;
        
        try {
          // Check if client is still connected
          if (res.headersSent) {
            tlog('Client disconnected, stopping dubbing poll');
            return;
          }
          
          const statusResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, {
            headers: {
              'xi-api-key': elevenApiKey,
            },
            signal: AbortSignal.timeout(10000)
          });
          
          if (!statusResponse.ok) {
            throw new Error(`Status check failed: ${statusResponse.status}`);
          }
          
          const statusData = await statusResponse.json();
          const status = statusData.status;
          
          tlog('Dubbing status check:', status, 'attempt:', attempts);
          
          if (status === 'dubbed') {
            // Get the dubbed audio
            const audioResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${targetLang}`, {
              headers: {
                'xi-api-key': elevenApiKey,
              },
              signal: AbortSignal.timeout(30000)
            });
            
            if (!audioResponse.ok) {
              throw new Error(`Failed to get dubbed audio: ${audioResponse.status}`);
            }
            
            // Save the dubbed audio to uploads directory
            const outputFileName = `dubbed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
            const outputPath = path.join(DIRS.uploads, outputFileName);
            
            const audioBuffer = await audioResponse.arrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
            
            try {
              const sz = fs.statSync(outputPath).size;
              tlog('dubbing completed', 'output='+outputPath, 'bytes='+sz);
            } catch(e){}
            
            // Only send response if client is still connected
            if (!res.headersSent) {
              res.json({ ok: true, audioPath: outputPath, dubbingId: dubbingId });
            }
            return;
          } else if (status === 'failed') {
            throw new Error('Dubbing failed');
          } else if (attempts >= maxAttempts) {
            throw new Error('Dubbing timeout');
          } else {
            // Continue polling
            setTimeout(pollForCompletion, pollInterval);
          }
        } catch (error) {
          tlog('Dubbing poll error:', error.message);
          // Only send error response if client is still connected
          if (!res.headersSent) {
            res.status(500).json({ error: String(error?.message || error) });
          }
        }
      };
      
      // Start polling
      setTimeout(pollForCompletion, pollInterval);
      
    } catch(e) {
      tlog('dubbing error:', e.message);
      return res.status(500).json({ error: String(e?.message||e) });
    }
  } catch(e){ 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); 
  }
});

// ElevenLabs TTS endpoint
app.post('/tts/generate', async (req, res) => {
  try {
    const { text, voiceId, elevenApiKey, model = 'eleven_turbo_v2_5', voiceSettings } = req.body || {};
    tlog('POST /tts/generate', 'voiceId='+voiceId, 'model='+model, 'text='+text?.substring(0, 50));
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }
    
    if (!voiceId) {
      return res.status(400).json({ error: 'Voice ID required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    // Use provided voice settings or defaults
    const settings = voiceSettings || {
      stability: 0.5,
      similarity_boost: 0.75
    };
    
    try {
      // Call ElevenLabs TTS API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: model,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: 0.0,
            use_speaker_boost: true
          }
        }),
        signal: AbortSignal.timeout(60000) // 60 second timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs TTS error:', response.status, errorText);
        return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      // Save the audio to sync extensions directory
      const ttsDir = path.join(BASE_DIR, 'tts');
      try { fs.mkdirSync(ttsDir, { recursive: true }); } catch(_){}
      const outputFileName = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const outputPath = path.join(ttsDir, outputFileName);
      
      const audioBuffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
      
      try {
        const sz = fs.statSync(outputPath).size;
        tlog('TTS completed', 'output='+outputPath, 'bytes='+sz);
      } catch(e){}
      
      res.json({ ok: true, audioPath: outputPath });
    } catch(e) {
      tlog('TTS error:', e.message);
      return res.status(500).json({ error: String(e?.message||e) });
    }
  } catch(e){ 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); 
  }
});

// ElevenLabs list voices endpoint
app.get('/tts/voices', async (req, res) => {
  try {
    const { elevenApiKey } = req.query;
    tlog('GET /tts/voices');
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': elevenApiKey,
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs voices error:', response.status, errorText);
        return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const data = await response.json();
      tlog('TTS voices fetched', 'count='+data.voices?.length);
      res.json(data);
    } catch(e) {
      tlog('TTS voices error:', e.message);
      return res.status(500).json({ error: String(e?.message||e) });
    }
  } catch(e){ 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); 
  }
});

// Video-to-audio extraction endpoint
app.post('/extract-audio', async (req, res) => {
  try{
    const { videoPath, videoUrl, format } = req.body || {};
    tlog('POST /extract-audio', 'format='+format, 'videoPath='+videoPath, 'videoUrl='+videoUrl, 'body='+JSON.stringify(req.body));
    
    if (!videoPath && !videoUrl) {
      return res.status(400).json({ error: 'Video path or URL required' });
    }
    
    let localVideoPath = videoPath;
    
    // If URL provided, download the video first
    if (videoUrl && !videoPath) {
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download video from URL' });
        }
        
        // Create temporary file
        const tempDir = os.tmpdir();
        const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        localVideoPath = path.join(tempDir, tempFileName);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localVideoPath, Buffer.from(buffer));
        
        tlog('Downloaded video to temp file', localVideoPath);
      } catch (error) {
        tlog('Video download error', error.message);
        return res.status(400).json({ error: 'Failed to download video: ' + error.message });
      }
    }
    
    if (!localVideoPath || typeof localVideoPath !== 'string' || !path.isAbsolute(localVideoPath)){
      tlog('extract invalid path');
      return res.status(400).json({ error: 'invalid videoPath' });
    }
    
    if (!fs.existsSync(localVideoPath)) {
      return res.status(404).json({ error: 'video file not found' });
    }
    
    const fmt = String(format||'wav').toLowerCase();
    if (fmt !== 'wav' && fmt !== 'mp3') {
      return res.status(400).json({ error: 'Unsupported format. Use wav or mp3.' });
    }
    
    try {
      const { extractAudioFromVideo } = require('./video-audio-extractor.cjs');
      const audioPath = await extractAudioFromVideo(localVideoPath, fmt, DIRS);
      
      if (!audioPath || !fs.existsSync(audioPath)) {
        return res.status(500).json({ error: 'audio extraction failed' });
      }
      
      try {
        const sz = fs.statSync(audioPath).size;
        tlog('extract audio ok', 'out='+audioPath, 'bytes='+sz);
      } catch(e){}
      
      res.json({ ok: true, audioPath: audioPath });
    } catch(e) {
      tlog('extract audio error:', e.message);
      return res.status(500).json({ error: String(e?.message||e) });
    }
  } catch(e){ 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); 
  }
});

// Public WAV file reader for quality testing (before auth middleware)
app.get('/wav/file', async (req, res) => {
  try{
    const p = String(req.query.path||'');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error:'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch(_){ real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error:'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error:'not a file' });
    res.setHeader('Content-Type', 'audio/wav');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', ()=>{
      try {
        // If we created a copy under COPY_DIR for TemporaryItems, delete it after serving
        if (wasTemp && real.indexOf(COPY_DIR) === 0) { fs.unlink(real, ()=>{}); }
      } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Public MP3 file reader for quality testing (before auth middleware)
app.get('/mp3/file', async (req, res) => {
  try{
    const p = String(req.query.path||'');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error:'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch(_){ real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error:'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error:'not a file' });
    res.setHeader('Content-Type', 'audio/mpeg');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', ()=>{
      try {
        // If we created a copy under COPY_DIR for TemporaryItems, delete it after serving
        if (wasTemp && real.indexOf(COPY_DIR) === 0) { fs.unlink(real, ()=>{}); }
      } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Public waveform file reader (before auth middleware)
app.get('/waveform/file', async (req, res) => {
  try{
    const p = String(req.query.path||'');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error:'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch(_){ real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error:'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error:'not a file' });
    res.setHeader('Content-Type', 'application/octet-stream');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', ()=>{
      try {
        // If we created a copy under COPY_DIR for TemporaryItems, delete it after serving
        if (wasTemp && real.indexOf(COPY_DIR) === 0) { fs.unlink(real, ()=>{}); }
      } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Updates: version and check (PUBLIC)
app.get('/update/version', async (_req,res)=>{
  try{
    const current = await getCurrentVersion();
    res.json({ ok:true, version: current });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

app.get('/update/check', async (_req,res)=>{
  try{
    const current = await getCurrentVersion();
    const latest = await getLatestReleaseInfo();
    if (!latest){
      return res.json({ ok:true, current, latest: null, tag: null, html_url: `https://github.com/${UPDATES_REPO}/releases`, canUpdate: false, repo: UPDATES_REPO, message: 'no releases/tags found' });
    }
    const cmp = (current && latest.version) ? compareSemver(latest.version, current) : 0;
    res.json({ ok:true, current, latest: latest.version, tag: latest.tag, html_url: latest.html_url, canUpdate: cmp > 0, repo: UPDATES_REPO });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Auth middleware
function requireAuth(req, res, next){
  try{
    const h = String(req.headers['authorization']||'');
    const m = /^Bearer\s+(.+)$/.exec(h);
    if (!m || m[1] !== AUTH_TOKEN) return res.status(401).json({ error:'unauthorized' });
    next();
  }catch(_){ return res.status(401).json({ error:'unauthorized' }); }
}

// Debug endpoint (PUBLIC - for UI debugging)
app.post('/debug', async (req, res) => {
  try {
    const body = req.body || {};
    const timestamp = new Date().toISOString();
    
    // Determine which log file to write to based on the debug message type
    let logFile = DEBUG_LOG; // Default to server log
    
    // If this is UI debug from AE, write to AE log
    if (body.hostConfig && body.hostConfig.isAE) {
      logFile = path.join(DIRS.logs, 'sync_ae_debug.log');
    }
    // If this is UI debug from Premiere, write to Premiere log  
    else if (body.hostConfig && body.hostConfig.hostId === 'PPRO') {
      logFile = path.join(DIRS.logs, 'sync_ppro_debug.log');
    }
    
    // Format log message for better readability
    const logMessage = `[${timestamp}] [${body.type || 'debug'}] ${JSON.stringify(body, null, 2)}`;
    
    // Write to appropriate log file (don't log to console to avoid duplication in server log)
    try { fs.appendFileSync(logFile, logMessage + "\n"); } catch(_){ }
    
    res.json({ ok: true });
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

// Recording save endpoint (PUBLIC - needed for recording)
// Use raw body parser for multipart/form-data
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
});

app.post('/recording/save', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { targetDir, type } = req.body || {};
    const fileName = req.file.originalname || `recording_${Date.now()}.webm`;

    // Determine save directory - recordings should go to uploads folder, not project folders
    let saveDir;
    if (targetDir === 'documents') {
      saveDir = DOCS_DEFAULT_DIR;
    } else if (targetDir === 'uploads') {
      // Explicit uploads folder request
      saveDir = TEMP_DEFAULT_DIR;
    } else if (targetDir && typeof targetDir === 'string' && path.isAbsolute(targetDir)) {
      // For recordings, always use uploads folder regardless of project setting
      // This prevents recordings from cluttering project folders
      saveDir = TEMP_DEFAULT_DIR; // Use uploads folder
    } else {
      saveDir = TEMP_DEFAULT_DIR; // Use uploads folder for recordings
    }

    // Ensure directory exists
    try {
      await fs.promises.mkdir(saveDir, { recursive: true });
    } catch(e) {
      tlog('recording:save:mkdir:error', e.message);
    }

    // Save file and process with FFmpeg to convert WebM to MP4
    const inputPath = path.join(saveDir, `temp_${fileName}`);
    // Convert WebM to MP4 for sync API compatibility
    const outputFileName = fileName.replace(/\.webm$/i, '.mp4');
    const outputPath = path.join(saveDir, outputFileName);
    
    // Write temporary file
    await fs.promises.writeFile(inputPath, req.file.buffer);
    
    try {
      console.log('Processing recording with FFmpeg...');
      console.log('Input file:', inputPath);
      console.log('Output file:', outputPath);
      
      // Check if input file exists and has content
      const inputStats = await fs.promises.stat(inputPath);
      console.log('Input file size:', inputStats.size);
      
      if (inputStats.size === 0) {
        throw new Error('Input file is empty');
      }
      
      // Process with FFmpeg to convert WebM to MP4 with proper metadata
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v', 'libx264',  // Use H.264 video codec for MP4
            '-c:a', 'aac',      // Use AAC audio codec for MP4
            '-preset', 'ultrafast',  // Fastest encoding preset for better playback
            '-crf', '28',       // Lower quality for smoother playback
            '-profile:v', 'baseline',  // Baseline profile for better compatibility
            '-level', '3.0',    // Lower level for smoother playback
            '-movflags', '+faststart',  // Optimize for streaming/playback
            '-avoid_negative_ts', 'make_zero',  // Fix timestamp issues
            '-fflags', '+genpts'  // Generate presentation timestamps
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            console.log('FFmpeg progress:', progress);
          })
          .on('end', () => {
            console.log('FFmpeg processing completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('FFmpeg processing error:', err);
            reject(err);
          })
          .run();
      });
      
      // Check output file
      const outputStats = await fs.promises.stat(outputPath);
      console.log('Output file size:', outputStats.size);
      
      if (outputStats.size === 0) {
        throw new Error('Output file is empty after FFmpeg processing');
      }
      
      // Cleanup temporary file
      await fs.promises.unlink(inputPath).catch(() => {});
      
      console.log('Recording processed and saved:', {
        path: outputPath,
        size: req.file.size,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname
      });
      
      tlog('recording:save:ok', 'path=', outputPath, 'size=', req.file.size);
      
      // Return file path for CEP compatibility
      res.json({ ok: true, path: outputPath });
    } catch (ffmpegError) {
      console.error('FFmpeg processing failed, saving original file:', ffmpegError);
      
      // Fallback: save original file if FFmpeg fails
      await fs.promises.writeFile(outputPath, req.file.buffer);
      await fs.promises.unlink(inputPath).catch(() => {});
      
      tlog('recording:save:fallback', 'path=', outputPath, 'size=', req.file.size);
      
      res.json({ ok: true, path: outputPath });
    }
  } catch(e) {
    tlog('recording:save:error', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

// Serve recorded files via HTTP for better metadata support
app.get('/recording/file', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    console.log('Serving recording file:', filePath);
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    if (!fs.existsSync(filePath)) {
      console.error('Recording file not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    console.log('File stats:', {
      path: filePath,
      size: stats.size,
      ext: ext
    });
    
    let contentType = 'application/octet-stream';
    if (ext === '.webm') {
      contentType = filePath.includes('audio') ? 'audio/webm' : 'video/webm';
    } else if (ext === '.mp4') {
      contentType = filePath.includes('audio') ? 'audio/mp4' : 'video/mp4';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log('Serving file with headers:', {
      'Content-Type': contentType,
      'Content-Length': stats.size
    });
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch(e) {
    console.error('Error serving recording file:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

// Duplicate endpoint removed - using unified video-audio-extractor.cjs approach

// Upload endpoint (PUBLIC - needed for file picker)
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

// Apply auth to all routes below this line
// Public routes: /logs, /health, /auth/token, /update/check, /update/version, /upload, /dubbing, /tts
app.use((req,res,next)=>{
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
  // All other routes require authentication
  return requireAuth(req,res,next);
});
const DOCS_DEFAULT_DIR = path.join(os.homedir(), 'Documents', 'sync. outputs');
const TEMP_DEFAULT_DIR = DIRS.uploads;

// Simple settings persistence for the panel (to help AE retain keys between reloads)
let PANEL_SETTINGS = null;
app.get('/settings', (req,res)=>{
  res.json({ ok:true, settings: PANEL_SETTINGS });
});
app.post('/settings', (req,res)=>{
  try{ PANEL_SETTINGS = (req.body && req.body.settings) ? req.body.settings : null; res.json({ ok:true }); }catch(e){ if (!res.headersSent) res.status(400).json({ error:String(e?.message||e) }); }
});

// Updates: apply (AUTH)
app.post('/update/apply', async (req,res)=>{
  try{
    const { tag: desiredTag } = req.body || {};
    const current = await getCurrentVersion();
    const latest = await getLatestReleaseInfo();
    if (!latest) return res.status(400).json({ error:'no releases/tags found for updates' });
    const tag = desiredTag || latest.tag;
    const latestVersion = normalizeVersion(latest.version || tag || '');
    if (current && latestVersion && compareSemver(latestVersion, current) <= 0){
      return res.json({ ok:true, updated:false, message:'Already up to date', current, latest: latestVersion });
    }
    
    // Log update start for debugging
    if (!isSpawnedByUI) {
      console.log(`Starting update process: ${current} -> ${latestVersion}`);
      console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);
    }
    try { tlog('update:start', `${current} -> ${latestVersion}`, 'platform=', process.platform, 'arch=', process.arch); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    
    // Download and extract update
    const tempDir = path.join(DIRS.updates, 'sync_extension_update_' + Date.now());
    try { fs.mkdirSync(tempDir, { recursive: true }); } catch(_){}
    
    const zipPath = path.join(tempDir, 'update.zip');
    const zipResp = await fetch(latest.zip_url);
    if (!zipResp.ok) throw new Error('Failed to download update');
    
    const zipBuffer = await zipResp.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(zipBuffer));
    try { tlog('update:downloaded', zipPath, 'bytes=', String(zipBuffer && zipBuffer.byteLength || 0)); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    
    // Extract zip/zxp (ZXP is just a ZIP with extension folders)
    const isWindows = process.platform === 'win32';
    const isZxp = latest.is_zxp;
    
    if (isWindows) {
      // Windows: Use PowerShell to extract zip/zxp
      const extractCmd = `Expand-Archive -Path "${zipPath}" -DestinationPath "${tempDir}" -Force`;
      try { tlog('update:extract:win', extractCmd); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Windows extract command:', extractCmd);
      try {
        await execPowerShell(extractCmd);
        try { tlog('update:extract:win:ok'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        if (!isSpawnedByUI) console.log('PowerShell extraction completed');
      } catch(e) {
        try { tlog('update:extract:win:fail', e.message); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        if (!isSpawnedByUI) console.log('PowerShell extraction failed:', e.message);
        throw new Error('Failed to extract zip/zxp with PowerShell: ' + e.message);
      }
    } else {
      // macOS/Linux: Use unzip
      const extractCmd = `cd "${tempDir}" && unzip -q "${zipPath}"`;
      try { tlog('update:extract:unix', extractCmd); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Unix extract command:', extractCmd);
      try {
        await exec(extractCmd);
        try { tlog('update:extract:unix:ok'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        if (!isSpawnedByUI) console.log('Unix extraction completed');
      } catch(e) {
        try { tlog('update:extract:unix:fail', e.message); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        if (!isSpawnedByUI) console.log('Unix extraction failed:', e.message);
        throw new Error('Failed to extract zip/zxp with unzip: ' + e.message);
      }
    }
    
    // Find the extracted directory (ZXP: extension folders, ZIP: sync-extensions/, zipball: repo-name-tag/)
    let allItems;
    try {
      allItems = fs.readdirSync(tempDir);
    } catch(e) {
      throw new Error('Failed to read extracted directory: ' + e.message);
    }
    try { tlog('update:extracted:items', JSON.stringify(allItems||[])); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    if (!isSpawnedByUI) console.log('Extracted items:', allItems);
    
    const extractedDirs = allItems.filter(name => {
      const fullPath = path.join(tempDir, name);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch(e) {
        try { tlog('update:extracted:check:error', name, e.message); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
        console.log('Error checking item:', name, e.message);
        return false;
      }
    });
    
    try { tlog('update:extracted:dirs', JSON.stringify(extractedDirs||[])); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    if (!isSpawnedByUI) console.log('Extracted directories:', extractedDirs);
    
    let extractedDir;
    
    if (isZxp) {
      // ZXP format: extension folders are directly in tempDir
      extractedDir = tempDir;
      try { tlog('update:format:zxp'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Using ZXP format - extension folders directly in temp dir');
    } else if (extractedDirs.includes('sync-extensions')) {
      // ZIP format: sync-extensions directory
      extractedDir = path.join(tempDir, 'sync-extensions');
      try { tlog('update:format:zip:sync-extensions'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Using sync-extensions directory from ZIP release asset');
    } else if (extractedDirs.length > 0) {
      // Fallback to GitHub zipball format (repo-name-tag/)
      extractedDir = path.join(tempDir, extractedDirs[0]);
      try { tlog('update:format:zipball', extractedDirs[0]); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Using GitHub zipball directory:', extractedDirs[0]);
    } else {
      // Try to find any directory that might contain the source code
      const possibleDirs = allItems.filter(name => {
        const fullPath = path.join(tempDir, name);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            // Check if this directory contains source files
            const contents = fs.readdirSync(fullPath);
            return contents.includes('package.json') || contents.includes('scripts') || contents.includes('extensions');
          }
        } catch(e) {
          return false;
        }
        return false;
      });
      
      try { tlog('update:format:guess:dirs', JSON.stringify(possibleDirs||[])); } catch(_){ }
      if (!isSpawnedByUI) console.log('Possible source directories:', possibleDirs);
      
      if (possibleDirs.length === 0) {
        throw new Error('No extracted directory found in zipball. Contents: ' + allItems.join(', '));
      }
      
      extractedDir = path.join(tempDir, possibleDirs[0]);
      try { tlog('update:format:guess:chosen', possibleDirs[0]); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      if (!isSpawnedByUI) console.log('Using fallback directory:', possibleDirs[0]);
    }
    try { tlog('update:extracted:dir', extractedDir); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    if (!isSpawnedByUI) console.log('Using extracted directory:', extractedDir);
    
    // Manual copy: copy extension files directly to current installation location
    // This works for both user and system-wide installations by copying over the running extension
    try { tlog('update:manual:copy:start', 'target=', EXT_ROOT); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    
    // Copy extensions (handle both ZXP and ZIP formats)
    if (isZxp) {
      // ZXP format: extracted root contains extension content (CSXS, ui, server, etc.)
      try { tlog('update:copy:zxp:target', 'dest=', EXT_ROOT); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
      let items;
      try {
        items = fs.readdirSync(extractedDir).filter(name => name !== 'META-INF' && name !== 'update.zip');
      } catch(e) {
        throw new Error('Failed to read ZXP extracted directory: ' + e.message);
      }
      for (const name of items){
        const srcPath = path.join(extractedDir, name);
        const destPath = path.join(EXT_ROOT, name);
        if (isWindows) {
          await runRobocopy(srcPath, destPath);
        } else {
          await exec(`cp -R "${srcPath}" "${destPath}"`);
        }
      }
      try { tlog('update:copy:zxp:ok', 'items=', String(items.length)); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    } else {
      // ZIP format: extensions are in extensions/ subdirectory
      const aeSrcDir = path.join(extractedDir, 'extensions', 'ae-extension');
      const pproSrcDir = path.join(extractedDir, 'extensions', 'premiere-extension');
      
      // Copy the appropriate extension based on current APP_ID
      if (APP_ID === 'ae' && fs.existsSync(aeSrcDir)) {
        if (isWindows) {
          await runRobocopy(aeSrcDir, EXT_ROOT);
          await runRobocopy(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
          await runRobocopy(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
          await runRobocopy(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
          await runRobocopy(extractedDir, EXT_ROOT, 'index.html');
          await runRobocopy(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
        } else {
          await exec(`cp -R "${aeSrcDir}"/* "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/ui "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/server "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/icons "${EXT_ROOT}/"`);
          await exec(`cp "${extractedDir}"/index.html "${EXT_ROOT}/"`);
          await exec(`cp "${extractedDir}"/lib "${EXT_ROOT}/" -R`);
        }
      } else if (APP_ID === 'premiere' && fs.existsSync(pproSrcDir)) {
        if (isWindows) {
          await runRobocopy(pproSrcDir, EXT_ROOT);
          await runRobocopy(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
          await runRobocopy(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
          await runRobocopy(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
          await runRobocopy(extractedDir, EXT_ROOT, 'index.html');
          await runRobocopy(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
          await runRobocopy(path.join(extractedDir, 'extensions', 'premiere-extension', 'epr'), path.join(EXT_ROOT, 'epr'));
        } else {
          await exec(`cp -R "${pproSrcDir}"/* "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/ui "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/server "${EXT_ROOT}/"`);
          await exec(`cp -R "${extractedDir}"/icons "${EXT_ROOT}/"`);
          await exec(`cp "${extractedDir}"/index.html "${EXT_ROOT}/"`);
          await exec(`cp "${extractedDir}"/lib "${EXT_ROOT}/" -R`);
          await exec(`cp "${extractedDir}"/extensions/premiere-extension/epr "${EXT_ROOT}/" -R`);
        }
      }
    }
    
    try { tlog('update:manual:copy:complete'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} }
    
    // Cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(_){}
    
    if (!isSpawnedByUI) console.log(`Update completed successfully: ${current} -> ${latestVersion}`);
    res.json({ ok:true, updated:true, message:'Update applied successfully', current, latest: latestVersion });
    // After confirming response was sent, exit the server so a fresh instance loads the new code on next panel start
    try {
      setTimeout(()=>{ try { tlog('update:post:exit'); } catch(e){ try { tlog("silent catch:", e.message); } catch(_){} } if (!isSpawnedByUI) console.log('Exiting server after successful update'); process.exit(0); }, 800);
    } catch(_){ }
  }catch(e){ 
    if (!isSpawnedByUI) {
      console.error('Update failed:', e.message);
      console.error('Update error stack:', e.stack);
    }
    if (!res.headersSent) res.status(500).json({ error:String(e?.message||e) }); 
  }
});


async function convertIfAiff(p){
  try{
    if (!p || typeof p !== 'string') return p;
    const lower = p.toLowerCase();
    if (!(lower.endsWith('.aif') || lower.endsWith('.aiff'))) return p;
    tlog('convertIfAiff', p);
    const out = await convertAudio(p, 'wav');
    if (out && fs.existsSync(out)) { tlog('convertIfAiff ok', out); return out; }
    tlog('convertIfAiff failed');
    return p;
  }catch(e){ tlog('convertIfAiff error', e && e.message ? e.message : String(e)); return p; }
}


const SYNC_API_BASE = 'https://api.sync.so/v2';

// Proxy models
app.get('/models', async (req, res) => {
  try{
    const { syncApiKey } = req.query;
    if (!syncApiKey) return res.status(400).json({ error: 'syncApiKey required' });
    const r = await fetch(`${SYNC_API_BASE}/models`, { headers: { 'x-api-key': String(syncApiKey) }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Proxy list generations
app.get('/generations', async (req, res) => {
  try{
    const { syncApiKey, status } = req.query;
    if (!syncApiKey) return res.status(400).json({ error: 'syncApiKey required' });
    const url = new URL(`${SYNC_API_BASE}/generations`);
    if (status) url.searchParams.set('status', String(status));
    const r = await fetch(url.toString(), { headers: { 'x-api-key': String(syncApiKey) }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

app.get('/jobs', (req,res)=> res.json(jobs));
app.get('/jobs/:id', (req,res)=>{
  const job = jobs.find(j => String(j.id) === String(req.params.id));
  if (!job) return res.status(404).json({ error:'Job not found' });
  res.json(job);
});



app.post('/jobs', async (req, res) => {
  try{
    // Log every incoming request for debugging
    console.log('[jobs:create] Request received:', JSON.stringify(req.body, null, 2));
    
    let { videoPath, audioPath, videoUrl, audioUrl, isTempVideo, isTempAudio, model, temperature, activeSpeakerOnly, detectObstructions, options = {}, syncApiKey, outputDir } = req.body || {};
    ({ videoPath, audioPath } = await normalizePaths({ videoPath, audioPath }));
    // Auto-convert AIFF from AE to WAV so the rest of the pipeline can read it
    try { if (audioPath) { audioPath = await convertIfAiff(audioPath); } } catch(_){}
    const vStat = await safeStat(videoPath); const aStat = await safeStat(audioPath);
    // Only check file size limits when using local files (not R2 URLs)
    const overLimit = (!videoUrl || !audioUrl) && ((vStat && vStat.size > 20*1024*1024) || (aStat && aStat.size > 20*1024*1024));
    slog('[jobs:create]', 'model=', model||'lipsync-2-pro', 'overLimit=', overLimit, 'v=', vStat&&vStat.size, 'a=', aStat&&aStat.size, 'r2=', true, 'bucket=', R2_BUCKET);
    
    // Track job creation
    track('sync_job_started', {
      model: model || 'lipsync-2-pro',
      temperature: temperature || 0.7,
      activeSpeakerOnly: !!activeSpeakerOnly,
      detectObstructions: !!detectObstructions,
      hasVideoUrl: !!videoUrl,
      hasAudioUrl: !!audioUrl,
      videoSize: vStat?.size || 0,
      audioSize: aStat?.size || 0,
      overLimit: overLimit,
      hostApp: APP_ID
    });
    
    if (!syncApiKey) {
      console.log('[jobs:create] Missing syncApiKey, rejecting request');
      return res.status(400).json({ error: 'syncApiKey required' });
    }
    // If URLs aren't provided, use local paths and upload to R2 (like cost estimation)
    if (!videoUrl || !audioUrl){
      if (!videoPath || !audioPath) return res.status(400).json({ error: 'Video and audio required' });
      const videoExists = await safeExists(videoPath);
      const audioExists = await safeExists(audioPath);
      if (!videoExists || !audioExists) return res.status(400).json({ error: 'Video or audio file not found' });

      console.log('[jobs:create] Uploading sources to R2 for lipsync job');
      videoUrl = await r2Upload(await resolveSafeLocalPath(videoPath));
      audioUrl = await r2Upload(await resolveSafeLocalPath(audioPath));
    } else {
      console.log('[jobs:create] Using provided R2 URLs for video and audio');
    }

    const limit1GB = 1024*1024*1024;
    // Only check file size limits when using local files (not R2 URLs)
    if ((!videoUrl || !audioUrl) && ((vStat && vStat.size > limit1GB) || (aStat && aStat.size > limit1GB))){
      return res.status(400).json({ error: 'Files over 1GB are not allowed. Please use smaller files.' });
    }

    const job = {
      id: ++jobCounter,
      videoPath,
      audioPath,
      videoUrl: videoUrl || '',
      audioUrl: audioUrl || '',
      isTempVideo: !!isTempVideo,
      isTempAudio: !!isTempAudio,
      model: model || 'lipsync-2-pro',
      temperature: temperature || 0.7,
      activeSpeakerOnly: !!activeSpeakerOnly,
      detectObstructions: !!detectObstructions,
      options: (options && typeof options === 'object') ? options : {},
      status: 'processing',
      createdAt: new Date().toISOString(),
      syncJobId: null,
      outputPath: null,
      outputDir: normalizeOutputDir(outputDir || '') || null,
      syncApiKey,
    };
    jobs.push(job);
    if (jobs.length > 500) { jobs = jobs.slice(-500); }
    saveJobs();

    // Send response immediately to prevent socket hang up
    res.json(job);
    
    // Start generation asynchronously after response is sent
    setImmediate(async () => {
      try {
        await createGeneration(job);
        // Cleanup temp inputs if present and uploaded
        try {
          if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) { 
            await fs.promises.unlink(job.videoPath); 
            job.videoPath = ''; 
          }
        } catch(e){ await tlog("silent catch:", e.message); }
        try {
          if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) { 
            await fs.promises.unlink(job.audioPath); 
            job.audioPath = ''; 
          }
        } catch(e){ await tlog("silent catch:", e.message); }
        saveJobs();
        // Start polling after generation is complete
        pollSyncJob(job);
      } catch(e) {
        slog('[jobs:create] generation error', e && e.message ? e.message : String(e));
        job.status = 'failed';
        job.error = String(e?.message||e);
        saveJobs();
        
        // Track job failure
        track('sync_job_failed', {
          jobId: job.id,
          model: job.model,
          error: String(e?.message||e),
          hostApp: APP_ID
        });
      }
    });
  }catch(e){ slog('[jobs:create] error', e && e.message ? e.message : String(e)); if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

app.get('/jobs/:id/download', async (req,res)=>{
  const job = jobs.find(j => String(j.id) === String(req.params.id));
  if (!job) return res.status(404).json({ error:'Job not found' });
  if (!job.outputPath || !(await safeExists(job.outputPath))) return res.status(404).json({ error:'Output not ready' });
  try{
    const allowed = [DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR];
    if (job.outputDir && typeof job.outputDir === 'string') allowed.push(job.outputDir);
    const realOut = fs.realpathSync(job.outputPath);
    const ok = allowed.some(root => {
      try { return realOut.startsWith(fs.realpathSync(root) + path.sep); } catch(_) { return false; }
    });
    if (!ok) return res.status(403).json({ error:'forbidden path' });
  }catch(_){ return res.status(500).json({ error:'download error' }); }
  res.download(job.outputPath);
});

app.post('/jobs/:id/save', async (req,res)=>{
  try{
    const { location = 'project', targetDir = '', syncApiKey: keyOverride } = req.body || {};
    let job = jobs.find(j => String(j.id) === String(req.params.id));
    // If not local, construct a cloud-only placeholder with sync id and syncApiKey
    if (!job) {
      if (!keyOverride) return res.status(404).json({ error:'Job not found and syncApiKey missing' });
      job = { id: String(req.params.id), syncJobId: String(req.params.id), status: 'completed', outputDir: '', syncApiKey: keyOverride };
    }

    // Enforce per-project when selected: if 'project', require targetDir; otherwise fallback to temp, not Documents
    const outDir = (location === 'documents') ? DOCS_DEFAULT_DIR : (targetDir || job.outputDir || TEMP_DEFAULT_DIR);
    try {
      await fs.promises.access(outDir);
    } catch {
      await fs.promises.mkdir(outDir, { recursive: true });
    }

    if (job.outputPath && await safeExists(job.outputPath) && path.dirname(job.outputPath) === outDir){
      return res.json({ ok:true, outputPath: job.outputPath });
    }

    if (job.outputPath && await safeExists(job.outputPath)){
      const newPath = path.join(outDir, `${job.id}_output.mp4`);
      try { await fs.promises.copyFile(job.outputPath, newPath); } catch(_){ }
      try { if (path.dirname(job.outputPath) !== outDir) await fs.promises.unlink(job.outputPath); } catch(e){ await tlog("silent catch:", e.message); }
      job.outputPath = newPath;
      saveJobs();
      return res.json({ ok:true, outputPath: job.outputPath });
    }

    // Cloud download using sync id
    const meta = await fetchGeneration(job);
    if (meta && meta.outputUrl){
      const response = await fetch(meta.outputUrl);
      if (response.ok && response.body){
        const dest = path.join(outDir, `${job.id}_output.mp4`);
        await pipeToFile(response.body, dest);
        job.outputPath = dest;
        if (!jobs.find(j => String(j.id) === String(job.id))) { jobs.unshift(job); saveJobs(); }
        return res.json({ ok:true, outputPath: job.outputPath });
      }
    }
    res.status(400).json({ error:'Output not available yet' });
  }catch(e){ if (!res.headersSent) res.status(500).json({ error: String(e?.message||e) }); }
});

// Simple GET endpoint for quick checks
app.get('/costs', (_req, res)=>{
  res.json({ ok:true, note:'POST this endpoint to estimate costs', ts: Date.now() });
});

app.post('/costs', async (req, res) => {
  try{
    slog('[costs] received POST');
    let { videoPath, audioPath, videoUrl, audioUrl, model = 'lipsync-2-pro', syncApiKey, options = {} } = req.body || {};
    ({ videoPath, audioPath } = await normalizePaths({ videoPath, audioPath }));
    if (!syncApiKey) return res.status(400).json({ error: 'syncApiKey required' });
    // If URLs aren't provided, use local paths and upload to R2
    if (!videoUrl || !audioUrl){
      if (!videoPath || !audioPath) return res.status(400).json({ error: 'Video and audio required' });
      const videoExists = await safeExists(videoPath);
      const audioExists = await safeExists(audioPath);
      if (!videoExists || !audioExists) return res.status(400).json({ error: 'Video or audio file not found' });

      slog('[costs] uploading sources to R2 for cost estimate');
      videoUrl = await r2Upload(await resolveSafeLocalPath(videoPath));
      audioUrl = await r2Upload(await resolveSafeLocalPath(audioPath));
    } else {
      slog('[costs] using provided URLs', 'videoUrl=', videoUrl, 'audioUrl=', audioUrl);
    }

    const opts = (options && typeof options === 'object') ? options : {};
    if (!opts.sync_mode) opts.sync_mode = 'loop';
    const body = {
      model: String(model||'lipsync-2-pro'),
      input: [ { type: 'video', url: videoUrl }, { type: 'audio', url: audioUrl } ],
      options: opts
    };
    try { slog('[costs] request', 'model=', body.model, 'video=', videoUrl, 'audio=', audioUrl, 'options=', JSON.stringify(opts)); } catch(_){ }
    const resp = await fetch(`${SYNC_API_BASE}/analyze/cost`, { method:'POST', headers: { 'x-api-key': syncApiKey, 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const text = await safeText(resp);
    try { slog('[costs] response', resp.status, (text||'').slice(0,200)); } catch(_){ }
    if (!resp.ok) { slog('[costs] sync api error', resp.status, text); return res.status(resp.status).json({ error: text || 'cost failed' }); }
    let raw = null; let estimate = [];
    try { raw = JSON.parse(text || '[]'); } catch(_) { raw = null; }
    if (Array.isArray(raw)) estimate = raw;
    else if (raw && typeof raw === 'object') estimate = [raw];
    else estimate = [];
    try { slog('[costs] ok estimate', JSON.stringify(estimate)); } catch(_){ }
    res.json({ ok:true, estimate });
  }catch(e){ slog('[costs] exception', String(e)); res.status(500).json({ error: String(e?.message||e) }); }
});

// Waveform helper: securely read local file bytes for the panel (same auth)
// Duplicate route removed; the public unauthenticated version above is the source of truth


async function createGeneration(job){
  const vStat = await safeStat(job.videoPath);
  const aStat = await safeStat(job.audioPath);
  const overLimit = ((vStat && vStat.size > 20*1024*1024) || (aStat && aStat.size > 20*1024*1024));
  
  // Add timeout protection to prevent hanging
  const timeoutMs = 60000; // 60 second timeout
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Generation timeout')), timeoutMs)
  );
  
  try{
    return await Promise.race([
      createGenerationInternal(job, vStat, aStat, overLimit),
      timeoutPromise
    ]);
  } catch(e) {
    try { tlog('createGeneration:error', e && e.message ? e.message : String(e)); } catch(_){}
    throw e;
  }
}

async function createGenerationInternal(job, vStat, aStat, overLimit){
  try{
    // Preferred: if panel provided URLs, use them directly
    if (job.videoUrl && job.audioUrl){
      const body = {
        model: job.model,
        input: [ { type:'video', url: job.videoUrl }, { type:'audio', url: job.audioUrl } ],
        options: (job.options && typeof job.options === 'object') ? job.options : {}
      };
      const resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: 'POST', headers: { 'x-api-key': job.syncApiKey, 'accept':'application/json', 'content-type':'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000) // 2 minute timeout
      });
      if (!resp.ok){ const t = await safeText(resp); slog('[create:url:direct] error', resp.status, t); throw new Error(`create(url) failed ${resp.status} ${t}`); }
      const data = await resp.json();
      job.syncJobId = data.id;
      return;
    }
    if (overLimit) {
      slog('[upload] using r2 url mode');
      const videoUrl = await r2Upload(await resolveSafeLocalPath(job.videoPath));
      const audioUrl = await r2Upload(await resolveSafeLocalPath(job.audioPath));
      // Cleanup temp sources if flagged
      try { if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) { await fs.promises.unlink(job.videoPath); job.videoPath = ''; } } catch(e){ await tlog("silent catch:", e.message); }
      try { if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) { await fs.promises.unlink(job.audioPath); job.audioPath = ''; } } catch(_){ }
      const body = {
        model: job.model,
        input: [ { type:'video', url: videoUrl }, { type:'audio', url: audioUrl } ],
        options: (job.options && typeof job.options === 'object') ? job.options : {}
        // in/out to be added when UI passes them
      };
      const resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: 'POST',
        headers: { 'x-api-key': job.syncApiKey, 'accept':'application/json', 'content-type':'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000) // 2 minute timeout
      });
      if (!resp.ok){ const t = await safeText(resp); slog('[create:url] error', resp.status, t); throw new Error(`create(url) failed ${resp.status} ${t}`); }
      const data = await resp.json();
      job.syncJobId = data.id;
      return;
    }
  }catch(e){ console.error('URL mode failed:', e); }
  
  // Always use R2 - no direct file uploads
  slog('[upload] using r2 url mode (forced)');
  const videoUrl = await r2Upload(await resolveSafeLocalPath(job.videoPath));
  const audioUrl = await r2Upload(await resolveSafeLocalPath(job.audioPath));
  // Cleanup temp sources if flagged
  try { if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) { await fs.promises.unlink(job.videoPath); job.videoPath = ''; } } catch(e){ await tlog("silent catch:", e.message); }
  try { if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) { await fs.promises.unlink(job.audioPath); job.audioPath = ''; } } catch(_){ }
  const body = {
    model: job.model,
    input: [ { type:'video', url: videoUrl }, { type:'audio', url: audioUrl } ],
    options: (job.options && typeof job.options === 'object') ? job.options : {}
  };
  const resp = await fetch(`${SYNC_API_BASE}/generate`, {
    method: 'POST',
    headers: { 'x-api-key': job.syncApiKey, 'accept':'application/json', 'content-type':'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000) // 2 minute timeout
  });
  if (!resp.ok){ const t = await safeText(resp); slog('[create:url] error', resp.status, t); throw new Error(`create(url) failed ${resp.status} ${t}`); }
  const data = await resp.json();
  job.syncJobId = data.id;
}

async function fetchGeneration(job){
  let resp = await fetch(`${SYNC_API_BASE}/generate/${job.syncJobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  if (!resp.ok && resp.status === 404){
    resp = await fetch(`${SYNC_API_BASE}/generations/${job.syncJobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  }
  if (!resp.ok) return null;
  return await resp.json();
}

async function downloadIfReady(job){
  const meta = await fetchGeneration(job);
  if (!meta || !meta.outputUrl) return false;
  const response = await fetch(meta.outputUrl);
  if (!response.ok || !response.body) return false;
  const outDir = (job.outputDir && typeof job.outputDir === 'string' ? normalizeOutputDir(job.outputDir) : '') || TEMP_DEFAULT_DIR;
  try {
    await fs.promises.access(outDir);
  } catch {
    await fs.promises.mkdir(outDir, { recursive: true });
  }
  const outputPath = path.join(outDir, `${job.id}_output.mp4`);
  await pipeToFile(response.body, outputPath);
  job.outputPath = outputPath;
  return true;
}

async function pollSyncJob(job){
  const pollInterval = 5000;
  const maxAttempts = 120;
  let attempts = 0;
  let pollTimeout = null;
  
  const tick = async ()=>{
    attempts++;
    try{
      if (await downloadIfReady(job)){
        job.status = 'completed';
        saveJobs();
        
        // Track job success
        const duration = Date.now() - new Date(job.createdAt).getTime();
        track('sync_job_succeeded', {
          jobId: job.id,
          model: job.model,
          duration: duration,
          attempts: attempts,
          hostApp: APP_ID
        });
        
        if (pollTimeout) clearTimeout(pollTimeout);
        return;
      }
      if (attempts < maxAttempts){ 
        pollTimeout = setTimeout(tick, pollInterval);
      } else { 
        job.status='failed'; 
        job.error='Timeout'; 
        saveJobs(); 
        
        // Track job timeout
        track('sync_job_failed', {
          jobId: job.id,
          model: job.model,
          error: 'Timeout',
          attempts: attempts,
          hostApp: APP_ID
        });
        
        if (pollTimeout) clearTimeout(pollTimeout);
      }
    }catch(e){ 
      job.status='failed'; 
      job.error=String(e?.message||e); 
      saveJobs(); 
      
      // Track job error
      track('sync_job_failed', {
        jobId: job.id,
        model: job.model,
        error: String(e?.message||e),
        attempts: attempts,
        hostApp: APP_ID
      });
      
      if (pollTimeout) clearTimeout(pollTimeout);
    }
  };
  
  // Start polling with initial timeout
  pollTimeout = setTimeout(tick, pollInterval);
  
  // Safety timeout to prevent infinite polling
  setTimeout(() => {
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
      if (job.status === 'processing') {
        job.status = 'failed';
        job.error = 'Polling timeout';
        saveJobs();
      }
    }
  }, maxAttempts * pollInterval + 30000); // Extra 30 seconds buffer
}


function log(){ 
  // Console output disabled when spawned by CEP to prevent EPIPE crashes
  // Logs are still available via /logs endpoint
}

// Simple in-memory log buffer for panel debugging
const LOGS = [];
function slog(){ 
  const msg = Array.from(arguments).map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); 
  LOGS.push(new Date().toISOString()+" "+msg); 
  if (LOGS.length>500) LOGS.shift(); 
  
  // Console output disabled when spawned by CEP to prevent EPIPE crashes
  // Logs are still available via /logs endpoint
}
app.get('/logs', (_req,res)=>{ res.json({ ok:true, logs: LOGS.slice(-200) }); });
// Keep only the slog + LOGS; public /logs is declared above

// Function to check if a port is available
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

// Function to find an available port (pinned to 3000)
async function findAvailablePort() {
  return 3000;
}

// Start server on fixed port 3000 (best‑effort)
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
        }).catch(()=>{});
        await new Promise(r2=>setTimeout(r2, 1000)); // Wait longer for graceful shutdown
      }
    } catch(_) { /* ignore */ }
    const srv = app.listen(PORT, HOST, () => {
      console.log(`Sync Extension server running on http://${HOST}:${PORT}`);
      console.log(`Jobs file: ${jobsFile}`);
      try { tlog('server started on', `${HOST}:${PORT}`); } catch(_){ }
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
            }).catch(()=>{});
            await new Promise(r2=>setTimeout(r2, 1000));
            // Exit cleanly so any spawner (e.g., the CEP panel) doesn't leave a zombie process.
            process.exit(0);
          }
        } catch(_) {}
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
process.on('uncaughtException', (err)=>{ try { console.error('uncaughtException', err && err.stack || err); tlog('uncaughtException', err && err.stack || err); } catch(_) {} });
process.on('unhandledRejection', (reason)=>{ try { console.error('unhandledRejection', reason); tlog('unhandledRejection', String(reason)); } catch(_) {} });
