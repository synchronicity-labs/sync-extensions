import fs from 'fs';
import path from 'path';
import { EXT_ROOT, MANIFEST_PATH } from '../config.js';

export function parseBundleVersion(xmlText){
  try{
    const m = /ExtensionBundleVersion\s*=\s*"([^"]+)"/i.exec(String(xmlText||''));
    if (m && m[1]) return m[1].trim();
  }catch (_){ }
  return '';
}

export function normalizeVersion(v){
  try{ return String(v||'').trim().replace(/^v/i, ''); }catch (_){ return ''; }
}

export function compareSemver(a, b){
  const pa = normalizeVersion(a).split('.').map(x=>parseInt(x,10)||0);
  const pb = normalizeVersion(b).split('.').map(x=>parseInt(x,10)||0);
  for (let i=0; i<Math.max(pa.length, pb.length); i++){
    const ai = pa[i]||0; const bi = pb[i]||0;
    if (ai > bi) return 1; if (ai < bi) return -1;
  }
  return 0;
}

export async function getCurrentVersion(){
  try{
    try {
      const xml = fs.readFileSync(MANIFEST_PATH, 'utf8');
      const version = parseBundleVersion(xml);
      if (version) return version;
    } catch (_) {}
    
    const extensionsDir = path.join(EXT_ROOT, 'extensions');
    if (fs.existsSync(extensionsDir)) {
      const subdirs = fs.readdirSync(extensionsDir);
      for (const subdir of subdirs) {
        const manifestPath = path.join(extensionsDir, subdir, 'CSXS', 'manifest.xml');
        try {
          const xml = fs.readFileSync(manifestPath, 'utf8');
          const version = parseBundleVersion(xml);
          if (version) return version;
        } catch (_) {}
      }
    }
    
    return '';
  }catch (_){ return ''; }
}
