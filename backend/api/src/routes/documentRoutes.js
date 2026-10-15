import { Router } from 'express';
import { z } from 'zod';
import { documentController } from '../controllers/documentController.js';
import { handlePdfUpload } from '../middleware/upload.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { documentUploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const idParamSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

const uploadBodySchema = z.object({
  title: z.string().min(1).max(200)
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['uploaded', 'processing', 'indexed', 'failed', 'superseded']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const downloadUrlQuerySchema = z.object({
  version: z.string().optional()
});

const fileDownloadQuerySchema = z.object({
  versionId: z.string().uuid(),
  token: z.string().min(16),
  exp: z.string().min(1)
});

// 1. Direct file download via HMAC signed URL token (public with valid HMAC signature)
router.get(
  '/:id/file',
  validateRequest({ params: idParamSchema, query: fileDownloadQuerySchema }),
  documentController.downloadFile
);

// All subsequent routes require authentication and agent or admin role
router.use(authenticateMiddleware);
router.use(requireRole('agent', 'admin'));

// 2. Upload new document
router.post(
  '/',
  documentUploadLimiter,
  handlePdfUpload('file'),
  validateRequest({ body: uploadBodySchema }),
  documentController.upload
);

// 3. List documents
router.get(
  '/',
  validateRequest({ query: listQuerySchema }),
  documentController.list
);

// 4. Get single document details
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  documentController.getById
);

// 5. List versions of a document
router.get(
  '/:id/versions',
  validateRequest({ params: idParamSchema }),
  documentController.listVersions
);

// 6. Replace document file (new version)
router.put(
  '/:id/file',
  documentUploadLimiter,
  validateRequest({ params: idParamSchema }),
  handlePdfUpload('file'),
  documentController.replaceFile
);

// 7. Re-index document using stored file
router.post(
  '/:id/reindex',
  documentUploadLimiter,
  validateRequest({ params: idParamSchema }),
  documentController.reindex
);

// 8. Generate signed download URL
router.get(
  '/:id/download-url',
  validateRequest({ params: idParamSchema, query: downloadUrlQuerySchema }),
  documentController.createDownloadUrl
);

// 9. Soft-delete document
router.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  documentController.delete
);

export default router;
