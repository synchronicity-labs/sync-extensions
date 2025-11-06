import express from 'express';
import path from 'path';
import fs from 'fs';
import { DEBUG_LOG, DEBUG_FLAG_FILE, rotateLogIfNeeded } from '../utils/log.js';
import { DIRS } from '../config.js';

const router = express.Router();

// Check if debug logging is enabled
// In dev mode, always enable logging; otherwise check debug.enabled flag
function isDebugEnabled() {
  try {
    const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DEV === 'true';
    return isDevMode || fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DEV === 'true';
    return isDevMode; // In dev mode, default to true
  }
}

router.post('/debug', async (req, res) => {
  try {
    // Only log if debug flag file exists
    if (!isDebugEnabled()) {
      return res.json({ ok: true, logged: false, message: 'Debug logging disabled' });
    }
    
    const body = req.body || {};
    const timestamp = new Date().toISOString();
    
    let logFile = DEBUG_LOG;
    
    if (body.hostConfig && body.hostConfig.isAE) {
      logFile = path.join(DIRS.logs, 'sync_ae_debug.log');
    } else if (body.hostConfig && body.hostConfig.hostId === 'PPRO') {
      logFile = path.join(DIRS.logs, 'sync_ppro_debug.log');
    }
    
    const message = body.message || JSON.stringify(body);
    const logMsg = `[${timestamp}] ${message}\n`;
    
    try {
      rotateLogIfNeeded(logFile);
      fs.appendFileSync(logFile, logMsg);
    } catch (err) {
      // Silent failure - logging infrastructure issue shouldn't break the app
    }
    
    res.json({ ok: true, logged: true });
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

export default router;

