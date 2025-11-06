import fs from 'fs';
import path from 'path';
import { DIRS } from '../config.js';
import { tlog, tlogSync } from '../utils/log.js';

export async function cleanupOldFiles(dirPath, maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    try {
      await fs.promises.access(dirPath);
    } catch {
      return;
    }
    
    const files = await fs.promises.readdir(dirPath);
    const now = Date.now();
    let cleanedCount = 0;
    
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (file) => {
        const filePath = path.join(dirPath, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isFile() && (now - stats.mtime.getTime()) > maxAgeMs) {
            await fs.promises.unlink(filePath);
            cleanedCount++;
            await tlog('cleanup:removed', filePath, 'age=', Math.round((now - stats.mtime.getTime()) / 1000 / 60), 'min');
          }
        } catch (e) {
          await tlog('cleanup:error', filePath, e && e.message ? e.message : String(e));
        }
      }));
      
      if (i + batchSize < files.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    if (cleanedCount > 0) {
      await tlog('cleanup:completed', dirPath, 'removed=', cleanedCount, 'files');
    }
  } catch (e) {
    await tlog('cleanup:failed', dirPath, e && e.message ? e.message : String(e));
  }
}

export function scheduleCleanup() {
  setInterval(async () => {
    await cleanupOldFiles(DIRS.uploads, 24 * 60 * 60 * 1000);
  }, 24 * 60 * 60 * 1000);
  
  setInterval(async () => {
    await cleanupOldFiles(DIRS.cache, 6 * 60 * 60 * 1000);
  }, 6 * 60 * 60 * 1000);
  
  setTimeout(async () => {
    await cleanupOldFiles(DIRS.uploads, 24 * 60 * 60 * 1000);
    await cleanupOldFiles(DIRS.cache, 6 * 60 * 60 * 1000);
  }, 60 * 1000);
  
  tlogSync('cleanup:scheduled', 'uploads=24h', 'cache=6h');
}
