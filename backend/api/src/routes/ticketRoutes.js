import { Router } from 'express';
import { z } from 'zod';
import { ticketController } from '../controllers/ticketController.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticateMiddleware } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

const createTicketSchema = z
  .object({
    subject: z.string().min(3).max(200),
    body: z.string().min(1).max(10000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
  })
  .strict();

const updateTicketSchema = z
  .object({
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    category: z.string().max(60).optional()
  })
  .strict();

const assignTicketSchema = z
  .object({
    agentId: z.string().uuid().nullable().optional()
  })
  .strict();

const statusTransitionSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved'])
  })
  .strict();

const createMessageSchema = z
  .object({
    body: z.string().min(1).max(10000)
  })
  .strict();

const idParamSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

// All ticket routes require authentication
router.use(authenticateMiddleware);

// Create ticket (Customer only)
router.post(
  '/',
  requireRole('customer'),
  validateRequest({ body: createTicketSchema }),
  ticketController.create
);

// List tickets (Customer sees own; Agent/Admin sees org)
router.get(
  '/',
  ticketController.list
);

// Get single ticket by ID
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  ticketController.getById
);

// Update ticket attributes (Agent/Admin)
router.patch(
  '/:id',
  requireRole('agent', 'admin'),
  validateRequest({ params: idParamSchema, body: updateTicketSchema }),
  ticketController.update
);

// Assign ticket (Agent/Admin)
router.post(
  '/:id/assign',
  requireRole('agent', 'admin'),
  validateRequest({ params: idParamSchema, body: assignTicketSchema }),
  ticketController.assign
);

// Status transition (Agent/Admin or owning Customer for reopen)
router.post(
  '/:id/status',
  validateRequest({ params: idParamSchema, body: statusTransitionSchema }),
  ticketController.transitionStatus
);

// List ticket messages (Owner or Agent/Admin)
router.get(
  '/:id/messages',
  validateRequest({ params: idParamSchema }),
  ticketController.getMessages
);

// Post message on ticket (Owner or Agent/Admin)
router.post(
  '/:id/messages',
  validateRequest({ params: idParamSchema, body: createMessageSchema }),
  ticketController.createMessage
);

export default router;
