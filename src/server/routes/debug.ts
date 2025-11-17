import express from 'express';
import path from 'path';
import fs from 'fs';
import { DEBUG_LOG, DEBUG_FLAG_FILE, rotateLogIfNeeded, sanitizeForLogging } from '../utils/log';
import { DIRS } from '../serverConfig';
import { HOST_IDS } from '../../shared/host';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

function isDebugEnabled(): boolean {
  try {
    return fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    return false;
  }
}

router.post('/debug', asyncHandler(async (req, res) => {
  if (!isDebugEnabled()) {
    sendSuccess(res, { logged: false, message: 'Debug logging disabled' });
    return;
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
  
  sendSuccess(res, { logged: true });
}, 'debug'));

export default router;

