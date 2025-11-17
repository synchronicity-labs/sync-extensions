import express from 'express';
import fs from 'fs';
import path from 'path';
import { toReadableLocalPath } from '../utils/paths';
import { tlog } from '../utils/log';
import { sendError } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

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
router.get('/wav/file', asyncHandler(async (req, res) => {
  const pathResult = validateAndResolvePath(req.query.path);
  if (!pathResult) {
    sendError(res, 400, 'invalid path or file not found', 'wav/file');
    return;
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
        sendError(res, 416, 'Range not satisfiable', 'wav/file');
        return;
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
}, 'wav/file'));

/**
 * GET /mp3/file
 * Serves MP3 audio files with range request support
 */
router.get('/mp3/file', asyncHandler(async (req, res) => {
  const pathResult = validateAndResolvePath(req.query.path);
  if (!pathResult) {
    sendError(res, 400, 'invalid path or file not found', 'mp3/file');
    return;
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
        sendError(res, 416, 'Range not satisfiable', 'wav/file');
        return;
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
}, 'mp3/file'));

/**
 * GET /waveform/file
 * Serves waveform data files
 */
router.get('/waveform/file', asyncHandler(async (req, res) => {
  const pathResult = validateAndResolvePath(req.query.path);
  if (!pathResult) {
    sendError(res, 400, 'invalid path or file not found', 'waveform/file');
    return;
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
}, 'waveform/file'));

/**
 * GET /video/file
 * Serves video files with range request support
 */
router.get('/video/file', asyncHandler(async (req, res) => {
  const pathResult = validateAndResolvePath(req.query.path);
  if (!pathResult) {
    sendError(res, 400, 'invalid path or file not found', 'video/file');
    return;
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
        sendError(res, 416, 'Range not satisfiable', 'wav/file');
        return;
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
}, 'video/file'));

export default router;

