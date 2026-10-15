import { Router } from 'express';
import { z } from 'zod';
import { aiController } from '../controllers/aiController.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

const idParamSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

const sourceParamSchema = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string().uuid()
  })
  .strict();

const reviewBodySchema = z
  .object({
    action: z.enum(['approve', 'edit_approve', 'reject', 'dismiss']),
    body: z.string().min(1).max(10000).optional(),
    reason: z.string().max(500).optional()
  })
  .strict();

// All AI routes require authentication and agent or admin role
router.use(authenticateMiddleware);
router.use(requireRole('agent', 'admin'));

// 1. Get AI suggestion by ID
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  aiController.getById
);

// 2. Review AI suggestion (approve, edit_approve, reject, dismiss)
router.post(
  '/:id/review',
  validateRequest({ params: idParamSchema, body: reviewBodySchema }),
  aiController.review
);

// 3. Get single source snapshot
router.get(
  '/:id/sources/:sourceId',
  validateRequest({ params: sourceParamSchema }),
  aiController.getSource
);

export default router;
