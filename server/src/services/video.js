import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { tlog } from '../utils/log.js';
import { convertAudio } from './audio.js';

// Platform-specific app data directory
function platformAppData(appName) {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Roaming', appName);
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName);
  return path.join(home, '.config', appName);
}

const BASE_DIR = process.env.SYNC_EXTENSIONS_DIR || platformAppData('sync. extensions');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (_) {}

const DEBUG = (function() {
  try {
    const flag = path.join(LOGS_DIR, 'debug.enabled');
    return fs.existsSync(flag);
  } catch (_) { return false; }
})();

const DEBUG_LOG = path.join(LOGS_DIR, 'sync_video_extract_debug.log');

function debugLog() {
  if (!DEBUG) return;
  try {
    const line = `[${new Date().toISOString()}] [video.js] ` + Array.from(arguments).map(a => String(a)).join(' ') + '\n';
    fs.appendFileSync(DEBUG_LOG, line);
  } catch (_) {}
}

// Main function to extract audio from video
export async function extractAudioFromVideo(videoPath, outputFormat = 'wav', dirs = null) {
  debugLog('extractAudioFromVideo start', videoPath, '->', outputFormat);
  
  const ext = path.extname(videoPath).toLowerCase();
  const baseDir = path.dirname(videoPath);
  const outputDir = dirs && dirs.uploads ? dirs.uploads : baseDir;
  const outputPath = path.join(outputDir, path.basename(videoPath).replace(/\.[^.]+$/, `.${outputFormat}`));
  
  try {
    // Support MP4, MOV, and WebM
    if (ext === '.mp4') {
      return await extractAudioFromMP4(videoPath, outputPath, outputFormat);
    } else if (ext === '.mov') {
      return await extractAudioFromMOV(videoPath, outputPath, outputFormat);
    } else if (ext === '.webm') {
      return await extractAudioFromWebM(videoPath, outputPath, outputFormat);
    } else {
      throw new Error(`Unsupported video format: ${ext}. Only MP4, MOV, and WebM are supported.`);
    }
  } catch (error) {
    debugLog('extractAudioFromVideo error:', error.message);
    throw error;
  }
}

// Generic audio extraction function using FFmpeg
// Supports MP4, MOV, WebM and other formats supported by FFmpeg
async function extractAudioWithFFmpeg(videoPath, outputPath, format) {
  debugLog('extractAudioWithFFmpeg start', videoPath, 'format:', format);
  
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .noVideo()
      .output(outputPath)
      .on('start', (cmdline) => {
        debugLog('FFmpeg command:', cmdline);
      })
      .on('end', () => {
        debugLog('FFmpeg extraction successful');
        resolve(outputPath);
      })
      .on('error', (err) => {
        debugLog('FFmpeg error:', err.message);
        reject(err);
      });
    
    // For mp3 output, always re-encode to ensure compatibility
    if (format === 'mp3') {
      command.audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100);
    } else if (format === 'wav') {
      // Try copy first (instant for compatible formats)
      command.audioCodec('copy');
    } else {
      // Re-encode for other formats
      command.audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('wav');
    }
    
    command.run();
  });
}

// Extract audio from MP4 using FFmpeg
async function extractAudioFromMP4(videoPath, outputPath, format) {
  return extractAudioWithFFmpeg(videoPath, outputPath, format);
}

// Extract audio from MOV using FFmpeg
async function extractAudioFromMOV(videoPath, outputPath, format) {
  return extractAudioWithFFmpeg(videoPath, outputPath, format);
}

// Extract audio from WebM using FFmpeg
async function extractAudioFromWebM(videoPath, outputPath, format) {
  return extractAudioWithFFmpeg(videoPath, outputPath, format);
}

