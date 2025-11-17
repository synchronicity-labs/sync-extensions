import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { tlog } from '../utils/log';
import { DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_1GB, getErrorMessage } from './constants';
import { convertWebmToMp4 } from '../services/video';
import { convertWebmToWav } from '../services/audio';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT_1GB }
});

/**
 * POST /recording/save
 * Saves recording files and converts them if needed
 */
router.post('/recording/save', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    sendError(res, 400, 'No file provided', 'recording/save');
    return;
  }

  const { targetDir, type } = req.body || {};
  
  // Validate type if provided
  if (type && type !== 'video' && type !== 'audio') {
    sendError(res, 400, 'Type must be "video" or "audio"', 'recording/save');
    return;
  }
  
  // Validate file size (already handled by multer, but double-check)
  if (req.file.size > FILE_SIZE_LIMIT_1GB) {
    sendError(res, 400, 'File too large (max 1GB)', 'recording/save');
    return;
  }
    
    const fileName = req.file.originalname || `recording_${Date.now()}.webm`;
    
    // Sanitize filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);

    // Recordings always go to uploads directory (temp files)
    const saveDir = (targetDir === 'documents') ? DOCS_DEFAULT_DIR : TEMP_DEFAULT_DIR;

    try {
      await fs.promises.mkdir(saveDir, { recursive: true });
    } catch (err) {
      const error = err as Error;
      tlog('Failed to create directory:', error.message);
      sendError(res, 500, 'Failed to create directory', 'recording/save');
      return;
    }

    const filePath = path.join(saveDir, sanitizedFileName);
    
    try {
      fs.writeFileSync(filePath, req.file.buffer);
    } catch (writeError) {
      const err = writeError as Error;
      tlog('Failed to write recording file:', err.message);
      sendError(res, 500, 'Failed to save recording file', 'recording/save');
      return;
    }

    let fileSize: number;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch (statError) {
      tlog('Failed to stat saved file:', (statError as Error).message);
      sendError(res, 500, 'Failed to verify saved file', 'recording/save');
      return;
    }
    
    tlog('Recording saved:', filePath, 'size:', fileSize, 'type:', type);

    // Convert webm to mp4 (video) or wav (audio)
    let finalPath = filePath;
    try {
      if (type === 'video') {
        tlog('Converting video recording from webm to mp4...');
        finalPath = await convertWebmToMp4(filePath);
        // Delete original webm file
        try {
          if (fs.existsSync(filePath) && finalPath !== filePath) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          tlog('Failed to delete original webm file:', (e as Error).message);
        }
        tlog('Video recording converted to mp4:', finalPath);
      } else if (type === 'audio') {
        tlog('Converting audio recording from webm to wav...');
        finalPath = await convertWebmToWav(filePath);
        // Delete original webm file
        try {
          if (fs.existsSync(filePath) && finalPath !== filePath) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          tlog('Failed to delete original webm file:', (e as Error).message);
        }
        tlog('Audio recording converted to wav:', finalPath);
      }
    } catch (conversionError) {
      tlog('Conversion error (using original file):', getErrorMessage(conversionError));
      // Continue with original file if conversion fails
    }

    // Verify final file exists
    if (!fs.existsSync(finalPath)) {
      sendError(res, 500, 'Final file not found after processing', 'recording/save');
      return;
    }
    
    let finalSize: number;
    try {
      finalSize = fs.statSync(finalPath).size;
    } catch (statError) {
      tlog('Failed to stat final file:', (statError as Error).message);
      sendError(res, 500, 'Failed to verify final file', 'recording/save');
      return;
    }
    
    sendSuccess(res, { path: finalPath, size: finalSize });
}, 'recording/save'));

export default router;

