import fs from 'fs';
import path from 'path';
import { DIRS, APP_ID } from '../serverConfig';
import { HOST_IDS } from '../../shared/host';

export const DEBUG_FLAG_FILE = path.join(DIRS.logs, '.debug');
let DEBUG = false;
try { 
  DEBUG = fs.existsSync(DEBUG_FLAG_FILE);
} catch (_){ 
  DEBUG = false;
}
export const DEBUG_LOG = path.join(DIRS.logs, (APP_ID === HOST_IDS.PPRO) ? 'sync_ppro_debug.log' : (APP_ID === HOST_IDS.AEFT) ? 'sync_ae_debug.log' : 'sync_server_debug.log');

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
    await fs.promises.appendFile(DEBUG_LOG, logLine).catch(() => {
      // If file logging fails, at least we tried - outer catch will handle it
    });
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

/**
 * Sanitizes an object by removing sensitive fields like API keys before logging.
 * Returns a new object with sensitive fields replaced with '[REDACTED]'.
 */
export function sanitizeForLogging(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item));
  }
  
  const sensitiveKeys = [
    'syncApiKey',
    'elevenApiKey',
    'apiKey',
    'API_KEY',
    'api_key',
    'x-api-key',
    'xi-api-key',
    'R2_ACCESS_KEY',
    'R2_SECRET_KEY',
    'POSTHOG_KEY',
    'accessKey',
    'secretKey',
    'access_key',
    'secret_key',
    'token',
    'authorization',
    'Authorization',
    'password',
    'Password',
  ];
  
  // At this point, obj is a non-null, non-array object
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensitive => 
      lowerKey === sensitive.toLowerCase() || 
      lowerKey.includes('apikey') || 
      lowerKey.includes('api_key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      (lowerKey.includes('token') && lowerKey !== 'timestamp')
    );
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

