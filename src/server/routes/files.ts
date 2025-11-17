import express from 'express';
import fs from 'fs';
import path from 'path';
import { toReadableLocalPath } from '../utils/paths';
import { tlog } from '../utils/log';
import fetch from 'node-fetch';

const router = express.Router();

router.get('/wav/file', async (req, res) => {
  try {
    const p = String(req.query.path || '');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error: 'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch (_) { real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error: 'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error: 'not a file' });
    
    const fileSize = stat.size;
    const range = req.headers.range;
    
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    // Prevent browser caching of audio metadata
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Generate unique ETag based on file path + mtime + size to prevent ETag-based caching
    const etag = `"${Buffer.from(real + stat.mtimeMs + stat.size).toString('base64').substring(0, 27)}"`;
    res.setHeader('ETag', etag);
    
    // Handle Range requests for faster metadata loading
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // Generate unique ETag for range requests too
      const etag = `"${Buffer.from(real + stat.mtimeMs + stat.size).toString('base64').substring(0, 27)}"`;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
        // CRITICAL: Include cache headers in writeHead - it overwrites previous headers!
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'ETag': etag,
      });
      
      const s = fs.createReadStream(real, { start, end });
      s.pipe(res);
    } else {
      const s = fs.createReadStream(real);
      s.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/mp3/file', async (req, res) => {
  try {
    const p = String(req.query.path || '');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error: 'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch (_) { real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error: 'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error: 'not a file' });
    
    const fileSize = stat.size;
    const range = req.headers.range;
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    // Prevent browser caching of audio metadata
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Generate unique ETag based on file path + mtime + size to prevent ETag-based caching
    const etag = `"${Buffer.from(real + stat.mtimeMs + stat.size).toString('base64').substring(0, 27)}"`;
    res.setHeader('ETag', etag);
    
    // Handle Range requests for faster metadata loading
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // Generate unique ETag for range requests too
      const etag = `"${Buffer.from(real + stat.mtimeMs + stat.size).toString('base64').substring(0, 27)}"`;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
        // CRITICAL: Include cache headers in writeHead - it overwrites previous headers!
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'ETag': etag,
      });
      
      const s = fs.createReadStream(real, { start, end });
      s.pipe(res);
    } else {
      const s = fs.createReadStream(real);
      s.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/waveform/file', async (req, res) => {
  try {
    const p = String(req.query.path || '');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error: 'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch (_) { real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error: 'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error: 'not a file' });
    res.setHeader('Content-Type', 'application/octet-stream');
    // Prevent browser caching of waveform data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/video/file', async (req, res) => {
  try {
    const p = String(req.query.path || '');
    if (!p || !path.isAbsolute(p)) return res.status(400).json({ error: 'invalid path' });
    let real = '';
    try { real = fs.realpathSync(p); } catch (_) { real = p; }
    const wasTemp = real.indexOf('/TemporaryItems/') !== -1;
    real = toReadableLocalPath(real);
    if (!fs.existsSync(real)) return res.status(404).json({ error: 'not found' });
    const stat = fs.statSync(real);
    if (!stat.isFile()) return res.status(400).json({ error: 'not a file' });
    
    // Determine content type from file extension
    const ext = path.extname(real).toLowerCase();
    let contentType = 'video/mp4';
    if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.mkv') contentType = 'video/x-matroska';
    
    const fileSize = stat.size;
    const range = req.headers.range;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    
    // Handle Range requests for faster metadata loading
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      
      const s = fs.createReadStream(real, { start, end });
      s.pipe(res);
    } else {
      const s = fs.createReadStream(real);
      s.pipe(res);
    }
    
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => { });
        }
      } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

// Video proxy endpoint - fetches external videos and serves them with CORS headers
// This allows canvas export to work (no taint) because video appears to come from same origin
router.get('/video/proxy', async (req, res) => {
  try {
    const videoUrl = String(req.query.url || '');
    if (!videoUrl || (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://'))) {
      return res.status(400).json({ error: 'Invalid video URL' });
    }

    tlog('[video/proxy] Proxying video:', videoUrl.substring(0, 100));

    // Fetch video from external URL
    const videoResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!videoResponse.ok) {
      return res.status(videoResponse.status).json({ error: `Failed to fetch video: ${videoResponse.statusText}` });
    }

    // Get content type from response or guess from URL
    let contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    if (!contentType.startsWith('video/')) {
      // Guess from URL extension
      const urlLower = videoUrl.toLowerCase();
      if (urlLower.includes('.mov')) contentType = 'video/quicktime';
      else if (urlLower.includes('.webm')) contentType = 'video/webm';
      else if (urlLower.includes('.avi')) contentType = 'video/x-msvideo';
      else if (urlLower.includes('.mkv')) contentType = 'video/x-matroska';
      else contentType = 'video/mp4';
    }

    // Get content length if available
    const contentLength = videoResponse.headers.get('content-length');
    
    // Set CORS headers so canvas export works (even though it's same-origin, explicit CORS helps)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Handle Range requests for video seeking
    const range = req.headers.range;
    if (range && contentLength) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : parseInt(contentLength, 10) - 1;
      const chunksize = (end - start) + 1;

      // Fetch with range header
      const rangeResponse = await fetch(videoUrl, {
        headers: {
          'Range': `bytes=${start}-${end}`,
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (rangeResponse.status === 206) {
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${contentLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
        });
        rangeResponse.body?.pipe(res);
        return;
      }
    }

    // Stream full video
    videoResponse.body?.pipe(res);
  } catch (e) {
    const error = e as Error;
    tlog('[video/proxy] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

export default router;

