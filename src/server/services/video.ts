import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { tlog, tlogSync } from '../utils/log';
import { convertAudio } from './audio';

// Main function to extract audio from video
export async function extractAudioFromVideo(videoPath, outputFormat = 'wav', dirs = null) {
  tlog('[video] extractAudioFromVideo start', videoPath, '->', outputFormat);
  
  const ext = path.extname(videoPath).toLowerCase();
  const baseDir = path.dirname(videoPath);
  const outputDir = dirs && dirs.uploads ? dirs.uploads : baseDir;
  
  // Normalize and resolve the output directory to ensure proper path format
  const normalizedOutputDir = path.resolve(outputDir);
  
  // Ensure output directory exists with proper error handling
  try {
    if (!fs.existsSync(normalizedOutputDir)) {
      fs.mkdirSync(normalizedOutputDir, { recursive: true });
      tlog('[video] Created output directory', normalizedOutputDir);
    }
    
    // Verify directory is actually accessible and writable
    try {
      fs.accessSync(normalizedOutputDir, fs.constants.W_OK);
    } catch (accessError) {
      throw new Error(`Output directory is not writable: ${normalizedOutputDir}`);
    }
  } catch (error) {
    const err = error as Error;
    tlog('[video] Failed to create/access output directory', normalizedOutputDir, err.message);
    throw new Error(`Failed to create or access output directory: ${err.message}`);
  }
  
  // Generate unique filename to prevent browser caching issues
  // Pattern: inout_TIMESTAMP_RANDOM.ext (matches pattern used in ppro.ts)
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  // Use simple filename without baseName to avoid path length issues and special characters
  const outputPath = path.resolve(normalizedOutputDir, `inout_${timestamp}_${random}.${outputFormat}`);
  
  tlog('[video] extractAudioFromVideo output path', outputPath);
  tlog('[video] Output directory verified:', normalizedOutputDir);
  
  // Ensure the output path is valid and doesn't contain any problematic characters
  if (outputPath.length > 255) {
    throw new Error(`Output path too long: ${outputPath.length} characters`);
  }
  
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
  
  // Check if video has audio stream - if not, create silent audio
  const { execSync } = await import('child_process');
  let hasAudio = false;
  try {
    const audioCheck = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    hasAudio = !!audioCheck;
    if (hasAudio) {
      tlog('[video] Audio stream found:', audioCheck);
    } else {
      tlog('[video] No audio stream found - will generate silent audio');
    }
  } catch (checkError: any) {
    // ffprobe returns non-zero if no audio stream - this is expected
    tlog('[video] No audio stream detected - will generate silent audio');
    hasAudio = false;
  }
  
  // Normalize paths to ensure they're absolute and properly formatted
  // Use path.resolve first, then try to get real path if possible
  const resolvedVideoPath = path.resolve(videoPath);
  const resolvedOutputPath = path.resolve(outputPath);
  
  let normalizedVideoPath: string;
  let normalizedOutputPath: string;
  
  // Get real path for input (handles symlinks, case-insensitivity)
  try {
    normalizedVideoPath = fs.realpathSync(resolvedVideoPath);
  } catch (error) {
    normalizedVideoPath = resolvedVideoPath;
  }
  
  // For output, ensure directory exists first, then use resolved path directly
  // Don't use realpathSync - it can cause issues with ffmpeg on macOS
  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Use the resolved path directly - path.resolve() already handles normalization
  normalizedOutputPath = resolvedOutputPath;
  
  // Verify the output directory exists
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output directory does not exist: ${outputDir}`);
  }
  
  // Verify input file exists
  if (!fs.existsSync(normalizedVideoPath)) {
    throw new Error(`Input video file not found: ${normalizedVideoPath}`);
  }
  
  // Verify output directory exists and is writable (reuse outputDir from above)
  const finalOutputDir = path.dirname(normalizedOutputPath);
  if (!fs.existsSync(finalOutputDir)) {
    throw new Error(`Output directory does not exist: ${finalOutputDir}`);
  }
  
  try {
    fs.accessSync(finalOutputDir, fs.constants.W_OK);
  } catch (accessError) {
    throw new Error(`Output directory is not writable: ${finalOutputDir}`);
  }
  
  // Remove output file if it already exists (might be locked or corrupted)
  if (fs.existsSync(normalizedOutputPath)) {
    try {
      fs.unlinkSync(normalizedOutputPath);
      tlog('[video] Removed existing output file:', normalizedOutputPath);
    } catch (unlinkError) {
      tlog('[video] Warning: Could not remove existing output file:', normalizedOutputPath, unlinkError);
      // Continue anyway - ffmpeg might overwrite it
    }
  }
  
  tlog('[video] Normalized paths - input:', normalizedVideoPath, 'output:', normalizedOutputPath);
  tlog('[video] Output directory verified:', finalOutputDir);
  
  return new Promise((resolve, reject) => {
    // Verify the output path is valid before passing to ffmpeg
    if (normalizedOutputPath.length > 255) {
      reject(new Error(`Output path too long: ${normalizedOutputPath.length} characters (max 255)`));
      return;
    }
    
    // Double-check the output directory exists and is writable right before ffmpeg runs
    const outputDirCheck = path.dirname(normalizedOutputPath);
    if (!fs.existsSync(outputDirCheck)) {
      reject(new Error(`Output directory disappeared: ${outputDirCheck}`));
      return;
    }
    
    // Verify write permissions one more time
    try {
      fs.accessSync(outputDirCheck, fs.constants.W_OK);
    } catch (accessError) {
      reject(new Error(`Output directory is not writable: ${outputDirCheck}`));
      return;
    }
    
    // Build ffmpeg command - handle videos with and without audio streams
    let command;
    if (!hasAudio) {
      // Video has no audio - generate silent audio using lavfi
      tlog('[video] Generating silent audio (video has no audio stream)');
      const duration = await new Promise<number>((resolve) => {
        try {
          const durationStr = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${normalizedVideoPath}"`,
            { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
          ).trim();
          resolve(parseFloat(durationStr) || 0.1);
        } catch {
          resolve(0.1); // Default to 0.1 seconds if can't get duration
        }
      });
      
      command = ffmpeg()
        .input(`lavfi:sine=frequency=1000:duration=${duration}`)
        .audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('wav');
    } else {
      // Video has audio - extract it
      command = ffmpeg(normalizedVideoPath)
        .noVideo(); // Remove video stream (-vn)
      
      // Set format and codec options
      if (format === 'mp3') {
        command
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .audioFrequency(44100)
          .format('mp3');
      } else if (format === 'wav') {
        // CRITICAL: Always re-encode to PCM WAV (format 1) for browser compatibility
        command
          .audioCodec('pcm_s16le') // Explicit PCM 16-bit little-endian
          .audioFrequency(44100) // Standard sample rate
          .audioChannels(2) // Stereo
          .format('wav'); // Explicit WAV format
      } else {
        command
          .audioCodec('pcm_s16le')
          .audioFrequency(44100)
          .audioChannels(2)
          .format('wav');
      }
    }
    
    // Set output() LAST - fluent-ffmpeg handles path quoting automatically
    command.output(normalizedOutputPath)
      .on('start', (cmdline) => {
        tlog('[video] FFmpeg command:', cmdline);
        tlog('[video] Input path:', normalizedVideoPath);
        tlog('[video] Output path:', normalizedOutputPath);
      })
      .on('end', () => {
        tlog('[video] FFmpeg extraction successful');
        // Verify output file exists and has content
        if (!fs.existsSync(normalizedOutputPath)) {
          reject(new Error('Output file was not created'));
          return;
        }
        const stats = fs.statSync(normalizedOutputPath);
        if (stats.size === 0) {
          reject(new Error('Output file is empty'));
          return;
        }
        resolve(normalizedOutputPath);
      })
      .on('error', (err) => {
        // Use sync logging for errors to ensure they're written immediately
        tlogSync('[video] FFmpeg error:', err.message);
        tlogSync('[video] FFmpeg error details:', JSON.stringify(err, null, 2));
        tlogSync('[video] Input path:', normalizedVideoPath);
        tlogSync('[video] Output path:', normalizedOutputPath);
        tlogSync('[video] FFmpeg stderr:', err.stderr || 'no stderr');
        reject(err);
      });
    
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

