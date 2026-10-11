import { Router } from 'express';
import { auditLogController } from '../controllers/auditLogController.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

// All audit log queries require admin role
router.use(authenticateMiddleware);
router.use(requireRole('admin'));

router.get('/', auditLogController.list);

export default router;
