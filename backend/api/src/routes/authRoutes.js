import { Router } from 'express';
import { z } from 'zod';
import { authController } from '../controllers/authController.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { csrfProtectionMiddleware } from '../middleware/csrf.js';

const router = Router();

const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    fullName: z.string().min(1).max(120)
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1)
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(128)
  })
  .strict();

// Public routes
router.post(
  '/register',
  validateRequest({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  validateRequest({ body: loginSchema }),
  authController.login
);

// Cookie-authenticated routes protected by CSRF Origin + custom header
router.post(
  '/refresh',
  csrfProtectionMiddleware,
  authController.refresh
);

router.post(
  '/logout',
  csrfProtectionMiddleware,
  authController.logout
);

// Authenticated routes
router.post(
  '/change-password',
  authenticateMiddleware,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

router.get(
  '/me',
  authenticateMiddleware,
  authController.me
);

export default router;
