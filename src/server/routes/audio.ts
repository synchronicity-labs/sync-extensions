import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { tlog, sanitizeForLogging } from '../utils/log';
import { convertAudio } from '../services/audio';
import { extractAudioFromVideo } from '../services/video';
import { DIRS } from '../serverConfig';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

/**
 * GET /audio/convert
 * Converts audio files (for ExtendScript curl calls)
 */
router.get('/audio/convert', asyncHandler(async (req, res) => {
  const srcPath = req.query.srcPath as string;
  const format = (req.query.format as string) || 'wav';
  
  if (!srcPath || typeof srcPath !== 'string' || !path.isAbsolute(srcPath)) {
    sendError(res, 400, 'invalid srcPath', 'audio/convert');
    return;
  }
  if (!fs.existsSync(srcPath)) {
    sendError(res, 404, 'source not found', 'audio/convert');
    return;
  }
  
  const fmt = String(format || 'wav').toLowerCase();
  if (fmt !== 'wav' && fmt !== 'mp3') {
    sendError(res, 400, 'Unsupported format. Use wav or mp3.', 'audio/convert');
    return;
  }
    
    tlog('GET /audio/convert', 'format=', fmt, 'srcPath=', srcPath);
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

/**
 * POST /audio/convert
 * Converts audio files
 */
router.post('/audio/convert', asyncHandler(async (req, res) => {
  const { srcPath, format } = req.body || {};
  
  if (!srcPath || typeof srcPath !== 'string' || !path.isAbsolute(srcPath)) {
    sendError(res, 400, 'invalid srcPath', 'audio/convert');
    return;
  }
  if (!fs.existsSync(srcPath)) {
    sendError(res, 404, 'source not found', 'audio/convert');
    return;
  }
  
  const fmt = String(format || 'wav').toLowerCase();
  if (fmt !== 'wav' && fmt !== 'mp3') {
    sendError(res, 400, 'Unsupported format. Use wav or mp3.', 'audio/convert');
    return;
  }
    
    tlog('POST /audio/convert', 'format=', fmt, 'srcPath=', srcPath);
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

/**
 * POST /extract-audio
 * Extracts audio from video files
 */
router.post('/extract-audio', asyncHandler(async (req, res) => {
  const { videoPath, videoUrl, format } = req.body || {};
  
  if (!videoPath && !videoUrl) {
    sendError(res, 400, 'Video path or URL required', 'extract-audio');
    return;
  }
  
  // Validate format early
  const fmt = String(format || 'wav').toLowerCase();
  if (fmt !== 'wav' && fmt !== 'mp3') {
    sendError(res, 400, 'Unsupported format. Use wav or mp3.', 'extract-audio');
    return;
  }
    
    tlog('POST /extract-audio', 'format=' + fmt, 'hasVideoPath=' + !!videoPath, 'hasVideoUrl=' + !!videoUrl);

    let localVideoPath: string | undefined = videoPath;

    if (videoUrl && !videoPath) {
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download video from URL' });
        }

        const tempDir = os.tmpdir();
        const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.mp4`;
        localVideoPath = path.join(tempDir, tempFileName);

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localVideoPath, Buffer.from(buffer));

        tlog('Downloaded video to temp file', localVideoPath);
      } catch (error) {
        const err = error as Error;
        tlog('Video download error', err.message);
        sendError(res, 400, 'Failed to download video: ' + err.message, 'extract-audio');
        return;
      }
    }

    if (!localVideoPath || typeof localVideoPath !== 'string' || !path.isAbsolute(localVideoPath)) {
      tlog('extract invalid path');
      sendError(res, 400, 'invalid videoPath', 'extract-audio');
      return;
    }

    if (!fs.existsSync(localVideoPath)) {
      sendError(res, 404, 'video file not found', 'extract-audio');
      return;
    }

    try {
      const audioPath = await extractAudioFromVideo(localVideoPath, fmt, DIRS);

      if (!audioPath || !fs.existsSync(audioPath)) {
        sendError(res, 500, 'audio extraction failed', 'extract-audio');
        return;
      }

      try {
        const sz = fs.statSync(audioPath).size;
        tlog('extract audio ok', 'out=' + audioPath, 'bytes=' + sz);
      } catch (e) { }

      sendSuccess(res, { audioPath });
    } catch (e) {
      const error = e as Error;
      tlog('extract audio error:', error.message);
      sendError(res, 500, error.message, 'extract-audio');
    }
}, 'extract-audio'));

export default router;

