import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { logger } from '../logger.js';

export class AuditService {
  constructor(repo = auditLogRepository) {
    this.repo = repo;
  }

  async record({
    organizationId,
    actorId = null,
    action,
    entityType,
    entityId = null,
    metadata = {},
    requestId = null,
    ip = null
  }) {
    try {
      return await this.repo.create({
        organizationId,
        actorId,
        action,
        entityType,
        entityId,
        metadata,
        requestId,
        ip
      });
    } catch (err) {
      // Audit log failures must be logged with high priority without crashing user flow
      logger.error({ err, action, organizationId }, 'Failed to record audit log entry');
      return null;
    }
  }

  async list(params) {
    return this.repo.list(params);
  }
}

export const auditService = new AuditService();
