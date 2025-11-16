import express from 'express';
import fs from 'fs';
import path from 'path';
import { toReadableLocalPath } from '../utils/paths';
import { tlog } from '../utils/log';

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
        'Content-Type': 'audio/wav',
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
        'Content-Type': 'audio/mpeg',
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

export default router;

