import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { tlog } from '../utils/log';
import { convertAudio } from './audio';

// Main function to extract audio from video
export async function extractAudioFromVideo(videoPath, outputFormat = 'wav', dirs = null) {
  tlog('[video] extractAudioFromVideo start', videoPath, '->', outputFormat);
  
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
    tlog('[video] extractAudioFromVideo error:', error.message);
    throw error;
  }
}

// Generic audio extraction function using FFmpeg
// Supports MP4, MOV, WebM and other formats supported by FFmpeg
async function extractAudioWithFFmpeg(videoPath, outputPath, format) {
  tlog('[video] extractAudioWithFFmpeg start', videoPath, 'format:', format);
  
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .noVideo()
      .output(outputPath)
      .on('start', (cmdline) => {
        tlog('[video] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[video] FFmpeg extraction successful');
        resolve(outputPath);
      })
      .on('error', (err) => {
        tlog('[video] FFmpeg error:', err.message);
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

// Convert WebM video to MP4
export async function convertWebmToMp4(srcPath, destPath) {
  tlog('[video] convertWebmToMp4 start', srcPath, '->', destPath || '(auto)');
  const finalPath = destPath || srcPath.replace(/\.webm$/i, '.mp4');
  
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset fast', '-crf 23'])
      .output(finalPath)
      .on('start', (cmdline) => {
        tlog('[video] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[video] FFmpeg WebM to MP4 conversion successful');
        resolve(finalPath);
      })
      .on('error', (err) => {
        tlog('[video] FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

