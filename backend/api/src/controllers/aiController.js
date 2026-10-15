import { ragService } from '@supportflow/shared';

export class AiController {
  /**
   * Generates or retrieves an existing AI suggestion for a ticket.
   * POST /tickets/:id/ai-suggestions
   */
  async generateSuggestion(req, res, next) {
    try {
      const ticketId = req.params.id;
      const { force = false } = req.body || {};

      const { suggestion, isExisting } = await ragService.generateSuggestion({
        organizationId: req.user.organizationId,
        ticketId,
        userId: req.user.id,
        force: Boolean(force)
      });

      res.status(isExisting ? 200 : 201).json({ data: suggestion });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists AI suggestions history for a ticket.
   * GET /tickets/:id/ai-suggestions
   */
  async listByTicket(req, res, next) {
    try {
      const ticketId = req.params.id;
      const { page = 1, limit = 20 } = req.query || {};

      const result = await ragService.listSuggestions(ticketId, req.user.organizationId, {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20
      });

      res.status(200).json({
        data: result.items,
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

  /**
   * Fetches single AI suggestion by ID.
   * GET /ai-suggestions/:id
   */
  async getById(req, res, next) {
    try {
      const suggestion = await ragService.getSuggestion(req.params.id, req.user.organizationId);
      res.status(200).json({ data: suggestion });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reviews an AI suggestion (approve, edit_approve, reject, dismiss).
   * POST /ai-suggestions/:id/review
   */
  async review(req, res, next) {
    try {
      const { action, body, reason } = req.body;

      const updated = await ragService.reviewSuggestion({
        organizationId: req.user.organizationId,
        suggestionId: req.params.id,
        userId: req.user.id,
        userRole: req.user.role,
        action,
        body,
        reason
      });

      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fetches snapshot of a specific source including dynamic sourceState.
   * GET /ai-suggestions/:id/sources/:sourceId
   */
  async getSource(req, res, next) {
    try {
      const source = await ragService.getSource(
        req.params.sourceId,
        req.params.id,
        req.user.organizationId
      );
      res.status(200).json({ data: source });
    } catch (err) {
      next(err);
    }
  }
}

export const aiController = new AiController();
