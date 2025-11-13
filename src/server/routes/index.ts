import express from 'express';
import apiRoutes from './api';
import fileRoutes from './files';
import aiRoutes from './ai';
import systemRoutes from './system';

const router = express.Router();

// Mount all route modules
router.use(apiRoutes);
router.use(fileRoutes);
router.use(aiRoutes);
router.use(systemRoutes);

export default router;

