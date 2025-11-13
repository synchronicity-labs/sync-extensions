import fs from 'fs';
import path from 'path';
import { DIRS, APP_ID } from '../serverConfig';
import { HOST_APP_IDS } from '../../shared/host';

export const DEBUG_FLAG_FILE = path.join(DIRS.logs, '.debug');
// Debug logging is disabled by default. Enable it by creating logs/.debug flag file.
// Per debug.md: Without the flag file, UI and host log files are not written.
let DEBUG = false;
try { 
  DEBUG = fs.existsSync(DEBUG_FLAG_FILE);
} catch (_){ 
  DEBUG = false;
}
export const DEBUG_LOG = path.join(DIRS.logs, (APP_ID === HOST_APP_IDS.PREMIERE) ? 'sync_ppro_debug.log' : (APP_ID === HOST_APP_IDS.AE) ? 'sync_ae_debug.log' : 'sync_server_debug.log');

// Log rotation - max 10MB per file, keep 3 rotated files
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROTATED_FILES = 3;

export function rotateLogIfNeeded(logFile: string): void {
  try {
    if (!fs.existsSync(logFile)) return;
    
    const stats = fs.statSync(logFile);
    if (stats.size < MAX_LOG_SIZE) return;
    
    // Rotate existing logs
    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const oldFile = `${logFile}.${i}`;
      const newFile = `${logFile}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }
    
    // Move current log to .1
    if (fs.existsSync(logFile)) {
      fs.renameSync(logFile, `${logFile}.1`);
    }
  } catch (e) {
    // Silently fail - don't break logging if rotation fails
  }
}

export async function tlog(...args: unknown[]): Promise<void> {
  if (!DEBUG) return;
  try { 
    rotateLogIfNeeded(DEBUG_LOG);
    
    const timestamp = new Date().toISOString();
    const message = args.map(a => String(a)).join(' ');
    const logLine = `[${timestamp}] [server] ${message}\n`;
    await fs.promises.appendFile(DEBUG_LOG, logLine).catch(() => {});
  } catch (e){ }
}

export function tlogSync(...args: unknown[]): void {
  if (!DEBUG) return;
  try { 
    rotateLogIfNeeded(DEBUG_LOG);
    
    const timestamp = new Date().toISOString();
    const message = args.map(a => String(a)).join(' ');
    const logLine = `[${timestamp}] [server] ${message}\n`;
    fs.appendFileSync(DEBUG_LOG, logLine);
  } catch (e){}
}

