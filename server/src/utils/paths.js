import fs from 'fs';
import path from 'path';
import { DIRS } from '../config.js';

const COPY_DIR = DIRS.cache;

export function toReadableLocalPath(p){
  try{
    if (!p || typeof p !== 'string') return '';
    const abs = path.resolve(p);
    if (abs.indexOf('/TemporaryItems/') === -1) return path.normalize(abs);
    try { if (!fs.existsSync(COPY_DIR)) fs.mkdirSync(COPY_DIR, { recursive: true }); } catch(e){}
    const dest = path.join(COPY_DIR, path.basename(abs));
    try { fs.copyFileSync(abs, dest); return dest; } catch(_){ return abs; }
  }catch(_){ return String(p||''); }
}

export async function resolveSafeLocalPath(p){
  try{
    if (!p || typeof p !== 'string') return p;
    if (!path.isAbsolute(p)) throw new Error('Only absolute paths allowed');
    const isTempItems = p.indexOf('/TemporaryItems/') !== -1;
    if (!isTempItems) return p;
    const docs = DIRS.uploads;
    try {
      await fs.promises.access(docs);
    } catch {
      await fs.promises.mkdir(docs, { recursive: true });
    }
    const target = path.join(docs, path.basename(p));
    try { 
      await fs.promises.copyFile(p, target); 
      return target; 
    } catch(e){ 
      return p; 
    }
  }catch(e){ 
    throw e;
  }
}

export async function normalizePaths(obj){
  if (!obj) return obj;
  if (obj.videoPath) obj.videoPath = await resolveSafeLocalPath(obj.videoPath);
  if (obj.audioPath) obj.audioPath = await resolveSafeLocalPath(obj.audioPath);
  return obj;
}

export function normalizeOutputDir(p){
  try{
    if (!p || typeof p !== 'string') return '';
    const abs = path.resolve(p);
    return path.normalize(abs);
  }catch(_){ return ''; }
}

export function guessMime(p){
  const ext = String(p||'').toLowerCase().split('.').pop();
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'mxf') return 'application/octet-stream';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'aac' || ext==='m4a') return 'audio/aac';
  if (ext === 'aif' || ext === 'aiff') return 'audio/aiff';
  return 'application/octet-stream';
}
