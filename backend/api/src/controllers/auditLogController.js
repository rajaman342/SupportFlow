import { auditService } from '@supportflow/shared';

export class AuditLogController {
  async list(req, res, next) {
    try {
      const { action, entityType, actorId, from, to, page, limit } = req.query;
      const result = await auditService.list({
        organizationId: req.user.organizationId,
        action,
        entityType,
        actorId,
        from,
        to,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20
      });

      res.status(200).json({
        data: result.auditLogs,
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
}

export const auditLogController = new AuditLogController();
