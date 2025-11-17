import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { tlog, sanitizeForLogging } from '../utils/log';
import { convertAudio } from '../services/audio';
import { extractAudioFromVideo } from '../services/video';
import { DIRS } from '../serverConfig';

const router = express.Router();

// Support both GET (for ExtendScript curl calls) and POST
router.get('/audio/convert', async (req, res) => {
  try {
    const srcPath = req.query.srcPath as string;
    const format = (req.query.format as string) || 'wav';
    tlog('GET /audio/convert', 'format=', format, 'srcPath=', srcPath);
    if (!srcPath || typeof srcPath !== 'string' || !path.isAbsolute(srcPath)) {
      tlog('convert invalid path');
      return res.status(400).json({ error: 'invalid srcPath' });
    }
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'source not found' });
    const fmt = String(format || 'wav').toLowerCase();
    if (fmt === 'mp3') {
      try {
        const out = await convertAudio(srcPath, fmt);
        if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
        res.json({ ok: true, path: out });
        return;
      } catch (e) {
        const error = e as Error;
        tlog('convert mp3 error:', error.message);
        return res.status(500).json({ error: String(error?.message || error) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    res.json({ ok: true, path: out });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/audio/convert', async (req, res) => {
  try {
    const { srcPath, format } = req.body || {};
    tlog('POST /audio/convert', 'format=', format, 'srcPath=', srcPath);
    if (!srcPath || typeof srcPath !== 'string' || !path.isAbsolute(srcPath)) {
      tlog('convert invalid path');
      return res.status(400).json({ error: 'invalid srcPath' });
    }
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'source not found' });
    const fmt = String(format || 'wav').toLowerCase();
    if (fmt === 'mp3') {
      try {
        const out = await convertAudio(srcPath, fmt);
        if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
        res.json({ ok: true, path: out });
        return;
      } catch (e) {
        const error = e as Error;
        tlog('convert mp3 error:', error.message);
        return res.status(500).json({ error: String(error?.message || error) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", (e as Error).message); } catch (_) { } }
    res.json({ ok: true, path: out });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/extract-audio', async (req, res) => {
  try {
    const { videoPath, videoUrl, format } = req.body || {};
    tlog('POST /extract-audio', 'format=' + format, 'videoPath=' + videoPath, 'videoUrl=' + videoUrl, 'body=' + JSON.stringify(sanitizeForLogging(req.body)));

    if (!videoPath && !videoUrl) {
      return res.status(400).json({ error: 'Video path or URL required' });
    }

    let localVideoPath: string | undefined = videoPath;

    if (videoUrl && !videoPath) {
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download video from URL' });
        }

        const tempDir = os.tmpdir();
        const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        localVideoPath = path.join(tempDir, tempFileName);

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localVideoPath, Buffer.from(buffer));

        tlog('Downloaded video to temp file', localVideoPath);
      } catch (error) {
        const err = error as Error;
        tlog('Video download error', err.message);
        return res.status(400).json({ error: 'Failed to download video: ' + err.message });
      }
    }

    if (!localVideoPath || typeof localVideoPath !== 'string' || !path.isAbsolute(localVideoPath)) {
      tlog('extract invalid path');
      return res.status(400).json({ error: 'invalid videoPath' });
    }

    if (!fs.existsSync(localVideoPath)) {
      return res.status(404).json({ error: 'video file not found' });
    }

    const fmt = String(format || 'wav').toLowerCase();
    if (fmt !== 'wav' && fmt !== 'mp3') {
      return res.status(400).json({ error: 'Unsupported format. Use wav or mp3.' });
    }

    try {
      const audioPath = await extractAudioFromVideo(localVideoPath, fmt, DIRS);

      if (!audioPath || !fs.existsSync(audioPath)) {
        return res.status(500).json({ error: 'audio extraction failed' });
      }

      try {
        const sz = fs.statSync(audioPath).size;
        tlog('extract audio ok', 'out=' + audioPath, 'bytes=' + sz);
      } catch (e) { }

      res.json({ ok: true, audioPath: audioPath });
    } catch (e) {
      const error = e as Error;
      tlog('extract audio error:', error.message);
      if (!res.headersSent) return res.status(500).json({ error: String(error?.message || error) });
    }
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

