import { ticketService } from '@supportflow/shared';

export class TicketController {
  async create(req, res, next) {
    try {
      const { subject, body, priority } = req.body;
      const ticket = await ticketService.createTicket({
        organizationId: req.user.organizationId,
        customerId: req.user.id,
        subject,
        body,
        priority,
        ip: req.ip,
        requestId: req.id
      });
      res.status(201).json({ data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const result = await ticketService.listTickets({
        organizationId: req.user.organizationId,
        user: req.user,
        query: req.query
      });

      res.status(200).json({
        data: result.tickets,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const ticket = await ticketService.getTicket({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        user: req.user
      });
      res.status(200).json({ data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await ticketService.updateTicket({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        updates: req.body,
        user: req.user,
        ip: req.ip,
        requestId: req.id
      });
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async assign(req, res, next) {
    try {
      const { agentId } = req.body;
      const updated = await ticketService.assignTicket({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        agentId: agentId || null,
        actor: req.user,
        ip: req.ip,
        requestId: req.id
      });
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async transitionStatus(req, res, next) {
    try {
      const { status } = req.body;
      const updated = await ticketService.transitionStatus({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        newStatus: status,
        actor: req.user,
        ip: req.ip,
        requestId: req.id
      });
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async getMessages(req, res, next) {
    try {
      const page = req.query.page ? parseInt(req.query.page, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

      const result = await ticketService.listMessages({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        user: req.user,
        page,
        limit
      });

      res.status(200).json({
        data: result.messages,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async createMessage(req, res, next) {
    try {
      const { body } = req.body;
      const message = await ticketService.addMessage({
        ticketId: req.params.id,
        organizationId: req.user.organizationId,
        body,
        actor: req.user,
        ip: req.ip,
        requestId: req.id
      });
      res.status(201).json({ data: message });
    } catch (err) {
      next(err);
    }
  }
}

export const ticketController = new TicketController();
