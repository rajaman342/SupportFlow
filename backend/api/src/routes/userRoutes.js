import { Router } from 'express';
import { z } from 'zod';
import { userController } from '../controllers/userController.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

const createUserSchema = z
  .object({
    email: z.string().email().max(254),
    fullName: z.string().min(1).max(120),
    role: z.enum(['agent', 'admin', 'customer']),
    temporaryPassword: z.string().min(12).max(128)
  })
  .strict();

const updateRoleSchema = z
  .object({
    role: z.enum(['agent', 'admin', 'customer'])
  })
  .strict();

const updateActiveSchema = z
  .object({
    isActive: z.boolean()
  })
  .strict();

const idParamSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

// All user management routes require admin role
router.use(authenticateMiddleware);
router.use(requireRole('admin'));

router.post(
  '/',
  validateRequest({ body: createUserSchema }),
  userController.create
);

router.get(
  '/',
  userController.list
);

router.patch(
  '/:id/role',
  validateRequest({ params: idParamSchema, body: updateRoleSchema }),
  userController.updateRole
);

router.patch(
  '/:id/active',
  validateRequest({ params: idParamSchema, body: updateActiveSchema }),
  userController.updateActive
);

export default router;
