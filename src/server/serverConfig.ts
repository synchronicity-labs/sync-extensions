import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { detectAppId as detectAppIdFromUtils } from './utils/serverHostDetection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve EXT_ROOT: server/config.ts -> server/ -> extension root
export const EXT_ROOT = path.resolve(__dirname, '..', '..');

// Use centralized host detection from utils/serverHostDetection.ts
// This ensures consistent host detection across the codebase
export const APP_ID = detectAppIdFromUtils();
export const MANIFEST_PATH = path.join(EXT_ROOT, 'CSXS', 'manifest.xml');

// Detect extension installation location (user vs system-wide)
function detectExtensionLocation(): 'user' | 'system' {
  try {
    if (process.platform === 'darwin') {
      if (EXT_ROOT.startsWith('/Library/Application Support/Adobe/CEP/extensions/')) {
        return 'system';
      }
    } else if (process.platform === 'win32') {
      if (EXT_ROOT.includes('Program Files') && EXT_ROOT.includes('Adobe\\CEP\\extensions')) {
        return 'system';
      }
    }
    
    const home = os.homedir();
    const EXT_FOLDER = path.basename(EXT_ROOT);
    
    if (process.platform === 'darwin') {
      if (EXT_ROOT.startsWith(path.join(home, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions'))) {
        return 'user';
      }
    } else if (process.platform === 'win32') {
      if (EXT_ROOT.includes(path.join(home, 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions'))) {
        return 'user';
      }
    }
    
    let userPath: string | undefined, systemPath: string | undefined;
    if (process.platform === 'darwin') {
      userPath = path.join(home, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', EXT_FOLDER);
      systemPath = path.join('/Library', 'Application Support', 'Adobe', 'CEP', 'extensions', EXT_FOLDER);
    } else if (process.platform === 'win32') {
      userPath = path.join(home, 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions', EXT_FOLDER);
      systemPath = path.join('C:', 'Program Files', 'Adobe', 'CEP', 'extensions', EXT_FOLDER);
    }
    
    const userExists = userPath ? fs.existsSync(userPath) : false;
    const systemExists = systemPath ? fs.existsSync(systemPath) : false;
    
    if (userExists && !systemExists) return 'user';
    if (systemExists && !userExists) return 'system';
    if (userExists && systemExists) return 'user';
    
    return 'user';
  } catch (e) {
    return 'user';
  }
}

export const EXTENSION_LOCATION = detectExtensionLocation();
export const UPDATES_REPO = process.env.UPDATES_REPO || process.env.GITHUB_REPO || 'mhadifilms/sync-extensions';
export const UPDATES_CHANNEL = process.env.UPDATES_CHANNEL || 'releases';
export const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
export const GH_UA = process.env.GITHUB_USER_AGENT || 'sync-extension-updater/1.0';

function platformAppData(appName: string): string {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Roaming', appName);
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName);
  return path.join(home, '.config', appName);
}

export const BASE_DIR = process.env.SYNC_EXTENSIONS_DIR || platformAppData('sync. extensions');
export const DIRS = {
  logs: path.join(BASE_DIR, 'logs'),
  cache: path.join(BASE_DIR, 'cache'),
  state: path.join(BASE_DIR, 'state'),
  uploads: path.join(BASE_DIR, 'uploads'),
  updates: path.join(BASE_DIR, 'updates')
};

// Initialize directories with silent logging
try { fs.mkdirSync(DIRS.logs, { recursive: true }); } catch (e){}
try { fs.mkdirSync(DIRS.cache, { recursive: true }); } catch (_){}
try { fs.mkdirSync(DIRS.state, { recursive: true }); } catch (e){}
try { fs.mkdirSync(DIRS.uploads, { recursive: true }); } catch (_){}
try { fs.mkdirSync(DIRS.updates, { recursive: true }); } catch (e){}

export const HOST = process.env.HOST || '127.0.0.1';
export const DEFAULT_PORT = 3000;
export const PORT_RANGE = [3000];
export const isSpawnedByUI = process.stdout.isTTY === false && process.stderr.isTTY === false;

