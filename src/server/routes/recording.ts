import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { tlog } from '../utils/log';
import { DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_1GB, getErrorMessage } from './constants';
import { convertWebmToMp4 } from '../services/video';
import { convertWebmToMp3 } from '../services/audio';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT_1GB }
});

router.post('/recording/save', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { targetDir, type } = req.body || {};
    const fileName = req.file.originalname || `recording_${Date.now()}.webm`;

    // Recordings always go to uploads directory (temp files)
    const saveDir = (targetDir === 'documents') ? DOCS_DEFAULT_DIR : TEMP_DEFAULT_DIR;

    try {
      await fs.promises.mkdir(saveDir, { recursive: true });
    } catch (err) {
      const error = err as Error;
      tlog('Failed to create directory:', error.message);
      return res.status(500).json({ error: 'Failed to create directory' });
    }

    const filePath = path.join(saveDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const fileSize = fs.statSync(filePath).size;
    tlog('Recording saved:', filePath, 'size:', fileSize, 'type:', type);

    // Convert webm to mp4 (video) or mp3 (audio)
    let finalPath = filePath;
    try {
      if (type === 'video') {
        tlog('Converting video recording from webm to mp4...');
        finalPath = await convertWebmToMp4(filePath);
        // Delete original webm file
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          tlog('Failed to delete original webm file:', (e as Error).message);
        }
        tlog('Video recording converted to mp4:', finalPath);
      } else if (type === 'audio') {
        tlog('Converting audio recording from webm to mp3...');
        finalPath = await convertWebmToMp3(filePath);
        // Delete original webm file
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          tlog('Failed to delete original webm file:', (e as Error).message);
        }
        tlog('Audio recording converted to mp3:', finalPath);
      }
    } catch (conversionError) {
      tlog('Conversion error (using original file):', getErrorMessage(conversionError));
      // Continue with original file if conversion fails
    }

    const finalSize = fs.statSync(finalPath).size;
    res.json({ ok: true, path: finalPath, size: finalSize });
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  }
});

export default router;

