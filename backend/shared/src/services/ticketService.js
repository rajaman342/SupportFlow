import { ticketRepository } from '../repositories/ticketRepository.js';
import { ticketMessageRepository } from '../repositories/ticketMessageRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { auditService } from './auditService.js';
import { cacheService } from '../cache/cacheService.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  AppError
} from '../errors.js';

export class TicketService {
  constructor(
    ticketRepo = ticketRepository,
    messageRepo = ticketMessageRepository,
    userRepo = userRepository,
    auditor = auditService,
    cache = cacheService
  ) {
    this.ticketRepo = ticketRepo;
    this.messageRepo = messageRepo;
    this.userRepo = userRepo;
    this.auditor = auditor;
    this.cache = cache;
  }

  async createTicket({
    organizationId,
    customerId,
    subject,
    body,
    priority = 'medium',
    ip = null,
    requestId = null
  }) {
    if (!subject || subject.length < 3 || subject.length > 200) {
      throw new ValidationError('Subject must be between 3 and 200 characters');
    }
    if (!body || body.length < 1 || body.length > 10000) {
      throw new ValidationError('Body must be between 1 and 10000 characters');
    }

    const { ticket, message } = await this.ticketRepo.createWithFirstMessage({
      organizationId,
      customerId,
      subject,
      body,
      priority
    });

    await this.auditor.record({
      organizationId,
      actorId: customerId,
      action: 'ticket.created',
      entityType: 'ticket',
      entityId: ticket.id,
      metadata: { priority, subject },
      requestId,
      ip
    });

    await this.cache.invalidateTickets(organizationId, customerId);

    return { ...ticket, firstMessage: message };
  }

  async listTickets({ organizationId, user, query = {} }) {
    const isCustomer = user.role === 'customer';
    const customerId = isCustomer ? user.id : null;

    if (isCustomer) {
      const cached = await this.cache.getCustomerTicketList(organizationId, user.id, query);
      if (cached) return cached;
    } else {
      const cached = await this.cache.getStaffTicketList(organizationId, user.role, query);
      if (cached) return cached;
    }

    const result = await this.ticketRepo.listTickets({
      organizationId,
      customerId,
      q: query.q || null,
      status: query.status || null,
      priority: query.priority || null,
      assigneeId: query.assigneeId || null,
      assignedToMe: query.assignedToMe === 'true' || query.assignedToMe === true,
      agentUserId: user.id,
      sort: query.sort || '-created_at',
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20
    });

    if (isCustomer) {
      await this.cache.setCustomerTicketList(organizationId, user.id, query, result, 30);
    } else {
      await this.cache.setStaffTicketList(organizationId, user.role, query, result, 30);
    }

    return result;
  }

  async getTicket({ ticketId, organizationId, user }) {
    const customerId = user.role === 'customer' ? user.id : null;
    const ticket = await this.ticketRepo.findById(ticketId, organizationId, customerId);

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    return ticket;
  }

  async updateTicket({ ticketId, organizationId, updates, user, ip = null, requestId = null }) {
    const ticket = await this.ticketRepo.findById(ticketId, organizationId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    const updated = await this.ticketRepo.updateTicket(ticketId, organizationId, updates);

    if (updates.priority && updates.priority !== ticket.priority) {
      await this.auditor.record({
        organizationId,
        actorId: user.id,
        action: 'ticket.priority_changed',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { oldPriority: ticket.priority, newPriority: updates.priority },
        requestId,
        ip
      });
    }

    await this.cache.invalidateTickets(organizationId, ticket.customer_id);

    return updated;
  }

  async assignTicket({ ticketId, organizationId, agentId, actor, ip = null, requestId = null }) {
    const ticket = await this.ticketRepo.findById(ticketId, organizationId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Role check: agents can only assign to themselves
    if (actor.role === 'agent' && agentId && agentId !== actor.id) {
      throw new ForbiddenError('Agents may only assign tickets to themselves');
    }

    if (agentId) {
      // Validate target assignee exists in same org with staff role
      const targetUser = await this.userRepo.findById(agentId);
      if (!targetUser || targetUser.organization_id !== organizationId) {
        throw new AppError(
          'Target agent not found in organization',
          'BUSINESS_RULE_VIOLATION',
          422
        );
      }
      if (!['agent', 'admin'].includes(targetUser.role) || !targetUser.is_active) {
        throw new AppError(
          'Tickets can only be assigned to active agents or administrators',
          'BUSINESS_RULE_VIOLATION',
          422
        );
      }
    }

    const updated = await this.ticketRepo.updateAssignee(ticketId, organizationId, agentId);

    await this.auditor.record({
      organizationId,
      actorId: actor.id,
      action: 'ticket.assigned',
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { previousAssigneeId: ticket.assigned_agent_id, assignedAgentId: agentId },
      requestId,
      ip
    });

    await this.cache.invalidateTickets(organizationId, ticket.customer_id);

    return updated;
  }

  async transitionStatus({ ticketId, organizationId, newStatus, actor, ip = null, requestId = null }) {
    const customerId = actor.role === 'customer' ? actor.id : null;
    const ticket = await this.ticketRepo.findById(ticketId, organizationId, customerId);

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    const currentStatus = ticket.status;
    if (currentStatus === newStatus) {
      return ticket; // No-op idempotent
    }

    // Status transition rules (API_SPEC.md §2.3)
    let isAllowed = false;

    if (currentStatus === 'open' && newStatus === 'in_progress') {
      isAllowed = ['agent', 'admin'].includes(actor.role);
    } else if (currentStatus === 'in_progress' && newStatus === 'open') {
      isAllowed = ['agent', 'admin'].includes(actor.role);
    } else if (currentStatus === 'in_progress' && newStatus === 'resolved') {
      isAllowed = ['agent', 'admin'].includes(actor.role);
    } else if (currentStatus === 'open' && newStatus === 'resolved') {
      // Must be agent/admin AND must have at least one agent message
      if (['agent', 'admin'].includes(actor.role)) {
        const hasAgentMsg = await this.ticketRepo.hasAgentMessage(ticketId, organizationId);
        if (!hasAgentMsg) {
          throw new AppError(
            'Cannot resolve ticket directly from open without at least one agent response',
            'INVALID_TRANSITION',
            409
          );
        }
        isAllowed = true;
      }
    } else if (currentStatus === 'resolved' && newStatus === 'open') {
      // Agent, admin, or owning customer can reopen
      isAllowed = true;
    }

    if (!isAllowed) {
      throw new AppError(
        `Invalid status transition from '${currentStatus}' to '${newStatus}' for role '${actor.role}'`,
        'INVALID_TRANSITION',
        409
      );
    }

    const resolvedAt = newStatus === 'resolved' ? new Date().toISOString() : null;
    const updated = await this.ticketRepo.updateStatus(ticketId, organizationId, newStatus, resolvedAt);

    await this.auditor.record({
      organizationId,
      actorId: actor.id,
      action: 'ticket.status_changed',
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { fromStatus: currentStatus, toStatus: newStatus },
      requestId,
      ip
    });

    await this.cache.invalidateTickets(organizationId, ticket.customer_id);

    return updated;
  }

  async addMessage({ ticketId, organizationId, body, actor, ip = null, requestId = null }) {
    if (!body || body.length < 1 || body.length > 10000) {
      throw new ValidationError('Message body must be between 1 and 10000 characters');
    }

    const customerId = actor.role === 'customer' ? actor.id : null;
    const ticket = await this.ticketRepo.findById(ticketId, organizationId, customerId);

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Invariant: Customer message on a resolved ticket reopens it (resolved -> open)
    if (actor.role === 'customer' && ticket.status === 'resolved') {
      await this.ticketRepo.updateStatus(ticketId, organizationId, 'open', null);
      await this.auditor.record({
        organizationId,
        actorId: actor.id,
        action: 'ticket.status_changed',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { fromStatus: 'resolved', toStatus: 'open', reason: 'customer_reply' },
        requestId,
        ip
      });
    }

    const message = await this.messageRepo.create({
      ticketId,
      organizationId,
      authorId: actor.id,
      authorRole: actor.role,
      body,
      source: 'human'
    });

    await this.cache.invalidateTickets(organizationId, ticket.customer_id);

    return message;
  }

  async listMessages({ ticketId, organizationId, user, page = 1, limit = 50 }) {
    const customerId = user.role === 'customer' ? user.id : null;
    const result = await this.messageRepo.listByTicketId({
      ticketId,
      organizationId,
      customerId,
      page,
      limit
    });

    if (!result) {
      throw new NotFoundError('Ticket not found');
    }

    return result;
  }
}

export const ticketService = new TicketService();
