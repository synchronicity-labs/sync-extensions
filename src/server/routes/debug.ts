import express from 'express';
import path from 'path';
import fs from 'fs';
import { DEBUG_LOG, DEBUG_FLAG_FILE, rotateLogIfNeeded, sanitizeForLogging } from '../utils/log';
import { DIRS } from '../serverConfig';
import { HOST_IDS } from '../../shared/host';

const router = express.Router();

function isDebugEnabled(): boolean {
  try {
    return fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    return false;
  }
}

router.post('/debug', async (req, res) => {
  try {
    if (!isDebugEnabled()) {
      return res.json({ ok: true, logged: false, message: 'Debug logging disabled' });
    }
    
    const body = req.body || {};
    const timestamp = new Date().toISOString();
    
    let logFile = DEBUG_LOG;
    
    if (body.hostConfig && body.hostConfig.isAE) {
      logFile = path.join(DIRS.logs, 'sync_ae_debug.log');
    } else if (body.hostConfig && body.hostConfig.hostId === HOST_IDS.PPRO) {
      logFile = path.join(DIRS.logs, 'sync_ppro_debug.log');
    }
    
    const message = body.message || '';
    const data = body.data ? JSON.stringify(sanitizeForLogging(body.data)) : '';
    const error = body.error ? String(body.error) : '';
    const logMsg = `[${timestamp}] ${message}${data ? ' ' + data : ''}${error ? ' Error: ' + error : ''}\n`;
    
    try {
      rotateLogIfNeeded(logFile);
      fs.appendFileSync(logFile, logMsg);
    } catch (err) {
      // Ignore logging errors
    }
    
    res.json({ ok: true, logged: true });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

export default router;

