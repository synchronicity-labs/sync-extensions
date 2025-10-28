import express from 'express';
import fs from 'fs';
import path from 'path';
import { toReadableLocalPath } from '../utils/paths.js';
import { tlog } from '../utils/log.js';

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
    res.setHeader('Content-Type', 'audio/wav');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => {});
        }
      } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
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
    res.setHeader('Content-Type', 'audio/mpeg');
    const s = fs.createReadStream(real);
    s.pipe(res);
    res.on('close', () => {
      try {
        if (wasTemp && real.indexOf(path.join(process.env.HOME || '', 'Library/Application Support/sync. extensions/copy')) === 0) {
          fs.unlink(real, () => {});
        }
      } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
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
          fs.unlink(real, () => {});
        }
      } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
});

export default router;

