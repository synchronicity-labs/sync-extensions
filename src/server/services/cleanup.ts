import fs from 'fs';
import path from 'path';
import { DIRS } from '../serverConfig';
import { tlog, tlogSync } from '../utils/log';

// Track active cleanup operations to prevent concurrent runs
const activeCleanups = new Set<string>();
// Store interval/timeout IDs for cleanup on shutdown
let uploadsInterval: NodeJS.Timeout | null = null;
let cacheInterval: NodeJS.Timeout | null = null;
let initialTimeout: NodeJS.Timeout | null = null;

export async function cleanupOldFiles(dirPath: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  // Prevent concurrent cleanup runs on the same directory
  if (activeCleanups.has(dirPath)) {
    await tlog('cleanup:skipped', dirPath, 'already running');
    return;
  }

  // Validate directory exists and is a directory before marking as active
  try {
    const stats = await fs.promises.stat(dirPath);
    if (!stats.isDirectory()) {
      await tlog('cleanup:failed', dirPath, 'path is not a directory');
      return;
    }
  } catch {
    await tlog('cleanup:skipped', dirPath, 'directory does not exist');
    return;
  }

  // Mark as active only after validation passes
  activeCleanups.add(dirPath);

  try {
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
          if (stats.isFile()) {
            const ageMs = now - stats.mtime.getTime();
            if (ageMs > maxAgeMs) {
              // Calculate age BEFORE deletion (bug fix)
              const ageMinutes = Math.round(ageMs / 1000 / 60);
              await fs.promises.unlink(filePath);
              cleanedCount++;
              await tlog('cleanup:removed', filePath, 'age=', ageMinutes, 'min');
            }
          }
          // Note: Subdirectories are intentionally skipped - only top-level files are cleaned
        } catch (e) {
          const error = e as NodeJS.ErrnoException;
          // Skip errors for files that were deleted between stat and unlink
          if (error.code !== 'ENOENT') {
            await tlog('cleanup:error', filePath, error && error.message ? error.message : String(error));
          }
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
    const error = e as Error;
    await tlog('cleanup:failed', dirPath, error && error.message ? error.message : String(error));
  } finally {
    activeCleanups.delete(dirPath);
  }
}

export function scheduleCleanup(): void {
  // Clear any existing intervals to prevent duplicates if scheduleCleanup is called multiple times
  if (uploadsInterval) clearInterval(uploadsInterval);
  if (cacheInterval) clearInterval(cacheInterval);
  if (initialTimeout) clearTimeout(initialTimeout);

  // Schedule periodic cleanup for uploads directory (24 hours)
  uploadsInterval = setInterval(async () => {
    try {
      await cleanupOldFiles(DIRS.uploads, 24 * 60 * 60 * 1000);
    } catch (e) {
      const error = e as Error;
      await tlog('cleanup:interval:error', 'uploads', error && error.message ? error.message : String(error));
    }
  }, 24 * 60 * 60 * 1000);

  // Schedule periodic cleanup for cache directory (6 hours)
  cacheInterval = setInterval(async () => {
    try {
      await cleanupOldFiles(DIRS.cache, 6 * 60 * 60 * 1000);
    } catch (e) {
      const error = e as Error;
      await tlog('cleanup:interval:error', 'cache', error && error.message ? error.message : String(error));
    }
  }, 6 * 60 * 60 * 1000);

  // Initial cleanup after 1 minute (runs once)
  initialTimeout = setTimeout(async () => {
    try {
      await cleanupOldFiles(DIRS.uploads, 24 * 60 * 60 * 1000);
      await cleanupOldFiles(DIRS.cache, 6 * 60 * 60 * 1000);
    } catch (e) {
      const error = e as Error;
      await tlog('cleanup:initial:error', error && error.message ? error.message : String(error));
    }
    initialTimeout = null; // Clear reference after execution
  }, 60 * 1000);

  tlogSync('cleanup:scheduled', 'uploads=24h', 'cache=6h');
}

/**
 * Stop all scheduled cleanup operations
 * Should be called during graceful shutdown
 */
export function stopCleanup(): void {
  if (uploadsInterval) {
    clearInterval(uploadsInterval);
    uploadsInterval = null;
  }
  if (cacheInterval) {
    clearInterval(cacheInterval);
    cacheInterval = null;
  }
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  tlogSync('cleanup:stopped');
}

