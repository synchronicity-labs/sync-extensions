import express from 'express';
import fs from 'fs';
import path from 'path';
import { toReadableLocalPath } from '../utils/paths';
import { tlog } from '../utils/log';

const router = express.Router();

/**
 * Validates and resolves a file path from query parameters
 * @param queryPath - Path from request query
 * @returns Resolved real path or null if invalid
 */
function validateAndResolvePath(queryPath: unknown): { real: string; wasTemp: boolean } | null {
  const p = String(queryPath || '');
  if (!p || !path.isAbsolute(p)) {
    return null;
  }
  
  let real = '';
  try {
    real = fs.realpathSync(p);
  } catch {
    real = p;
  }
  
  const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
  real = toReadableLocalPath(real);
  
  if (!fs.existsSync(real)) {
    return null;
  }
  
  const stat = fs.statSync(real);
  if (!stat.isFile()) {
    return null;
  }
  
  return { real, wasTemp };
}

/**
 * Creates cache headers for file responses
 */
function createCacheHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

/**
 * Creates ETag header from file path and stats
 */
function createETag(filePath: string, mtimeMs: number, size: number): string {
  return `"${Buffer.from(filePath + mtimeMs + size).toString('base64').substring(0, 27)}"`;
}

/**
 * GET /wav/file
 * Serves WAV audio files with range request support
 */
router.get('/wav/file', async (req, res) => {
  try {
    const pathResult = validateAndResolvePath(req.query.path);
    if (!pathResult) {
      return res.status(400).json({ error: 'invalid path or file not found' });
    }
    
    const { real, wasTemp } = pathResult;
    const stat = fs.statSync(real);
    const fileSize = stat.size;
    const range = req.headers.range;
    const etag = createETag(real, stat.mtimeMs, stat.size);
    const cacheHeaders = createCacheHeaders();
    
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader('ETag', etag);
    
    // Handle Range requests for faster metadata loading
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return res.status(416).json({ error: 'Range not satisfiable' });
      }
      
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
        ...cacheHeaders,
        'ETag': etag,
      });
      
      const stream = fs.createReadStream(real, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(real);
      stream.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) {
        try { tlog("silent catch:", (e as Error).message); } catch (_) { }
      }
    });
  } catch (e) {
    const error = e as Error;
    tlog('[wav/file] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

/**
 * GET /mp3/file
 * Serves MP3 audio files with range request support
 */
router.get('/mp3/file', async (req, res) => {
  try {
    const pathResult = validateAndResolvePath(req.query.path);
    if (!pathResult) {
      return res.status(400).json({ error: 'invalid path or file not found' });
    }
    
    const { real, wasTemp } = pathResult;
    const stat = fs.statSync(real);
    const fileSize = stat.size;
    const range = req.headers.range;
    const etag = createETag(real, stat.mtimeMs, stat.size);
    const cacheHeaders = createCacheHeaders();
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader('ETag', etag);
    
    // Handle Range requests
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return res.status(416).json({ error: 'Range not satisfiable' });
      }
      
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
        ...cacheHeaders,
        'ETag': etag,
      });
      
      const stream = fs.createReadStream(real, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(real);
      stream.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) {
        try { tlog("silent catch:", (e as Error).message); } catch (_) { }
      }
    });
  } catch (e) {
    const error = e as Error;
    tlog('[mp3/file] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

/**
 * GET /waveform/file
 * Serves waveform data files
 */
router.get('/waveform/file', async (req, res) => {
  try {
    const pathResult = validateAndResolvePath(req.query.path);
    if (!pathResult) {
      return res.status(400).json({ error: 'invalid path or file not found' });
    }
    
    const { real, wasTemp } = pathResult;
    const cacheHeaders = createCacheHeaders();
    
    res.setHeader('Content-Type', 'application/octet-stream');
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    const stream = fs.createReadStream(real);
    stream.pipe(res);
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) {
        try { tlog("silent catch:", (e as Error).message); } catch (_) { }
      }
    });
  } catch (e) {
    const error = e as Error;
    tlog('[waveform/file] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

/**
 * GET /video/file
 * Serves video files with range request support
 */
router.get('/video/file', async (req, res) => {
  try {
    const pathResult = validateAndResolvePath(req.query.path);
    if (!pathResult) {
      return res.status(400).json({ error: 'invalid path or file not found' });
    }
    
    const { real, wasTemp } = pathResult;
    const stat = fs.statSync(real);
    
    // Determine content type from file extension
    const ext = path.extname(real).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mp4': 'video/mp4'
    };
    const contentType = contentTypeMap[ext] || 'video/mp4';
    
    const fileSize = stat.size;
    const range = req.headers.range;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    
    // Handle Range requests
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return res.status(416).json({ error: 'Range not satisfiable' });
      }
      
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      
      const stream = fs.createReadStream(real, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(real);
      stream.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) {
        try { tlog("silent catch:", (e as Error).message); } catch (_) { }
      }
    });
  } catch (e) {
    const error = e as Error;
    tlog('[video/file] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

export default router;

