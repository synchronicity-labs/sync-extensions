import express from 'express';
import path from 'path';
import { track, distinctId } from '../telemetry.js';
import { tlog } from '../utils/log.js';
import { getCurrentVersion } from '../utils/version.js';
import { getLatestReleaseInfo, applyUpdate } from '../services/update.js';
import { APP_ID, isSpawnedByUI } from '../config.js';

const router = express.Router();

// Rate limiting for /auth/token (1 req/sec per IP)
const tokenRateLimit = new Map();
function checkTokenRateLimit(ip) {
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
  return res.status(403).json({ error: 'forbidden' });
}

// Public endpoints
router.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
router.get('/', (_req, res) => res.json({ ok: true, service: 'sync-extension-server' }));

router.get('/telemetry/test', async (req, res) => {
  try {
    // Debug: Check PostHog configuration
    const posthogKey = process.env.POSTHOG_KEY || '<your_project_api_key>';
    const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    const hasValidKey = posthogKey && posthogKey !== '<your_project_api_key>';
    
    console.log('PostHog Config:', {
      keyPresent: !!process.env.POSTHOG_KEY,
      keyValue: hasValidKey ? `${posthogKey.substring(0, 10)}...` : 'INVALID/MISSING',
      host: posthogHost,
      distinctId: distinctId
    });
    
    // Test PostHog connectivity
    track('telemetry_test', {
      testType: 'connectivity',
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      ok: true, 
      message: 'PostHog test event sent',
      distinctId: distinctId,
      timestamp: new Date().toISOString(),
      debug: {
        posthogKeyPresent: !!process.env.POSTHOG_KEY,
        posthogKeyValid: hasValidKey,
        posthogHost: posthogHost
      }
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/telemetry/posthog-status', async (req, res) => {
  try {
    const status = req.body || {};
    console.log('PostHog Client Status:', JSON.stringify(status, null, 2));
    
    res.json({ 
      ok: true, 
      message: 'PostHog status logged',
      received: status
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: error.message
    });
  }
});

router.get('/auth/token', requireCEPHeader, (req, res) => {
  try {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
      tlog('/auth/token: rejected non-localhost IP', ip);
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!checkTokenRateLimit(ip)) {
      tlog('/auth/token: rate limit exceeded for', ip);
      return res.status(429).json({ error: 'rate limit exceeded' });
    }
  } catch (e) { tlog('/auth/token: error', e.message); }
  res.json({ token: req.authToken });
});

router.post('/admin/exit', (req, res) => {
  try {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!(ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
      return res.status(403).json({ error: 'forbidden' });
    }
  } catch (_) {}
  try { tlog('admin:exit:requested'); } catch (_) {}
  res.json({ ok: true });
  setTimeout(() => { try { tlog('admin:exit:now'); } catch (_) {} process.exit(0); }, 300);
});

router.get('/update/version', async (_req, res) => {
  try {
    const current = await getCurrentVersion();
    res.json({ ok: true, version: current });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
});

router.get('/update/check', async (_req, res) => {
  try {
    const current = await getCurrentVersion();
    const latest = await getLatestReleaseInfo();
    if (!latest) {
      return res.json({ ok: true, current, latest: null, tag: null, html_url: `https://github.com`, canUpdate: false, message: 'no releases/tags found' });
    }
    const cmp = compareSemver(latest.version, current);
    res.json({ ok: true, current, latest: latest.version, tag: latest.tag, html_url: latest.html_url, canUpdate: cmp > 0 });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
});

router.post('/update/apply', async (req, res) => {
  try {
    const result = await applyUpdate(isSpawnedByUI);
    res.json(result);
    setTimeout(() => { try { tlog('update:post:exit'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} } if (!isSpawnedByUI) console.log('Exiting server after successful update'); process.exit(0); }, 800);
  } catch (e) {
    if (!isSpawnedByUI) {
      console.error('Update failed:', e.message);
      console.error('Update error stack:', e.stack);
    }
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;

