import fs from 'fs';
import path from 'path';
import { DIRS, APP_ID } from '../config.js';

export const DEBUG_FLAG_FILE = path.join(DIRS.logs, 'debug.enabled');
let DEBUG = false;
try { DEBUG = fs.existsSync(DEBUG_FLAG_FILE); } catch (_){ DEBUG = false; }
export const DEBUG_LOG = path.join(DIRS.logs, (APP_ID === 'premiere') ? 'sync_ppro_debug.log' : (APP_ID === 'ae') ? 'sync_ae_debug.log' : 'sync_server_debug.log');

export async function tlog(){
  if (!DEBUG) return;
  try { 
    const logLine = `[${new Date().toISOString()}] [server] ` + Array.from(arguments).map(a=>String(a)).join(' ') + "\n";
    await fs.promises.appendFile(DEBUG_LOG, logLine).catch (() => {});
  } catch (e){ }
}

export function tlogSync(){
  if (!DEBUG) return;
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [server] ` + Array.from(arguments).map(a=>String(a)).join(' ') + "\n"); } catch (e){}
}
