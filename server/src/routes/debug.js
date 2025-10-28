import express from 'express';
import path from 'path';
import fs from 'fs';
import { DEBUG_LOG, DEBUG_FLAG_FILE } from '../utils/log.js';
import { DIRS } from '../config.js';

const router = express.Router();

// Check if debug logging is enabled
function isDebugEnabled() {
  try {
    return fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    return false;
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
    
    const logMsg = `[${timestamp}] ${body.message || JSON.stringify(body)}\n`;
    
    try {
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

