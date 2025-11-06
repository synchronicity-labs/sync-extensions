import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { tlog } from '../utils/log.js';
import { DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_1GB, getErrorMessage } from './constants.js';

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
      tlog('Failed to create directory:', err.message);
      return res.status(500).json({ error: 'Failed to create directory' });
    }

    const filePath = path.join(saveDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const fileSize = fs.statSync(filePath).size;
    tlog('Recording saved:', filePath, 'size:', fileSize, 'type:', type);

    res.json({ ok: true, path: filePath, size: fileSize });
  } catch (e) {
    tlog('Recording save error:', getErrorMessage(e));
    if (!res.headersSent) res.status(500).json({ error: getErrorMessage(e) });
  }
});

router.get('/recording/file', async (req, res) => {
  try {
    const filePath = String(req.query.path || '');
    if (!filePath || !path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'invalid path' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'file not found' });
    }
    
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'not a file' });
    }
    
    res.download(filePath);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: getErrorMessage(e) });
  }
});

export default router;

