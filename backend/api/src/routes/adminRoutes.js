import { Router } from 'express';
import { adminController } from '../controllers/adminController.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.use(authenticateMiddleware);
router.use(requireRole('admin'));

// 1. Organization operational stats (ticket, document, AI metrics cached 60s)
router.get('/stats', adminController.getStats.bind(adminController));

// 2. Read-only indexing configs
router.get('/indexing-config', adminController.getIndexingConfig.bind(adminController));

export default router;
