import path from 'path';
import os from 'os';
import { DIRS } from '../serverConfig';

export const SYNC_API_BASE = 'https://api.sync.so/v2';

// File size limits
export const FILE_SIZE_LIMIT_20MB = 20 * 1024 * 1024;
export const FILE_SIZE_LIMIT_1GB = 1024 * 1024 * 1024;

// Default directories
export const DOCS_DEFAULT_DIR = path.join(os.homedir(), 'Documents', 'sync. outputs');
export const TEMP_DEFAULT_DIR = DIRS.uploads;

// Helper to get error message consistently
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error || 'Unknown error');
}

