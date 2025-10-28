import express from 'express';
import apiRoutes from './api.js';
import fileRoutes from './files.js';
import aiRoutes from './ai.js';
import systemRoutes from './system.js';

const router = express.Router();

// Mount all route modules
router.use(apiRoutes);
router.use(fileRoutes);
router.use(aiRoutes);
router.use(systemRoutes);

export default router;

