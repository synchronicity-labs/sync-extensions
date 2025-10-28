import express from 'express';
import fs from 'fs';
import path from 'path';
import { tlog } from '../utils/log.js';
import { convertAudio } from '../services/audio.js';
import { extractAudioFromVideo } from '../services/video.js';
import { DIRS } from '../config.js';

const router = express.Router();

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
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
        res.json({ ok: true, path: out });
        return;
      } catch (e) {
        tlog('convert mp3 error:', e.message);
        return res.status(500).json({ error: String(e?.message || e) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    res.json({ ok: true, path: out });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
});

router.get('/audio/convert', async (req, res) => {
  try {
    const srcPath = String(req.query.srcPath || '');
    const format = String(req.query.format || 'wav');
    tlog('GET /audio/convert', 'format=', format, 'srcPath=', srcPath);
    if (!srcPath || !path.isAbsolute(srcPath)) {
      tlog('convert invalid path (GET)');
      return res.status(400).json({ error: 'invalid srcPath' });
    }
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'source not found' });
    const fmt = String(format || 'wav').toLowerCase();
    if (fmt === 'mp3') {
      try {
        const out = await convertAudio(srcPath, fmt);
        if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
        try { const sz = fs.statSync(out).size; tlog('convert mp3 ok', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
        res.json({ ok: true, path: out });
        return;
      } catch (e) {
        tlog('convert mp3 error:', e.message);
        return res.status(500).json({ error: String(e?.message || e) });
      }
    }
    const out = await convertAudio(srcPath, fmt);
    if (!out || !fs.existsSync(out)) return res.status(500).json({ error: 'conversion failed' });
    try { const sz = fs.statSync(out).size; tlog('convert ok (GET)', 'out=', out, 'bytes=', sz); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    res.json({ ok: true, path: out });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); }
});

router.post('/extract-audio', async (req, res) => {
  try {
    const { videoPath, videoUrl, format } = req.body || {};
    tlog('POST /extract-audio', 'format=' + format, 'videoPath=' + videoPath, 'videoUrl=' + videoUrl, 'body=' + JSON.stringify(req.body));
    
    if (!videoPath && !videoUrl) {
      return res.status(400).json({ error: 'Video path or URL required' });
    }
    
    let localVideoPath = videoPath;
    
    if (videoUrl && !videoPath) {
      try {
        const fetch = require('node-fetch');
        const response = await fetch(videoUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download video from URL' });
        }
        
        const os = require('os');
        const tempDir = os.tmpdir();
        const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        localVideoPath = path.join(tempDir, tempFileName);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localVideoPath, Buffer.from(buffer));
        
        tlog('Downloaded video to temp file', localVideoPath);
      } catch (error) {
        tlog('Video download error', error.message);
        return res.status(400).json({ error: 'Failed to download video: ' + error.message });
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
      } catch (e) {}
      
      res.json({ ok: true, audioPath: audioPath });
    } catch (e) {
      tlog('extract audio error:', e.message);
      if (!res.headersSent) return res.status(500).json({ error: String(e?.message || e) });
    }
  } catch (e) { 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); 
  }
});

export default router;

