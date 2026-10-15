import {
  getDatabasePool,
  cacheService,
  indexingConfigRepository
} from '@supportflow/shared';

export class AdminController {
  constructor({
    cache = cacheService,
    pool = null,
    configRepo = indexingConfigRepository
  } = {}) {
    this.cache = cache;
    this.pool = pool || getDatabasePool();
    this.configRepo = configRepo;
  }

  async getStats(req, res, next) {
    try {
      const organizationId = req.user.organizationId;

      // 1. Check cache (60s TTL)
      const cached = await this.cache.getAdminStats(organizationId);
      if (cached) {
        return res.status(200).json({ data: cached });
      }

      const client = await this.pool.connect();
      try {
        // 2. Ticket counts by status
        const ticketRes = await client.query(
          `SELECT status, count(*)::int AS count
           FROM tickets
           WHERE organization_id = $1
           GROUP BY status`,
          [organizationId]
        );
        const ticketCounts = { open: 0, in_progress: 0, resolved: 0, total: 0 };
        for (const row of ticketRes.rows) {
          if (row.status in ticketCounts) {
            ticketCounts[row.status] = row.count;
          }
          ticketCounts.total += row.count;
        }

        // 3. Document counts by latest version status
        const docRes = await client.query(
          `SELECT lv.status, count(*)::int AS count
           FROM knowledge_documents d
           LEFT JOIN LATERAL (
             SELECT status
             FROM knowledge_document_versions v
             WHERE v.document_id = d.id
             ORDER BY v.version_number DESC
             LIMIT 1
           ) lv ON true
           WHERE d.organization_id = $1 AND d.deleted_at IS NULL
           GROUP BY lv.status`,
          [organizationId]
        );
        const docCounts = { uploaded: 0, processing: 0, indexed: 0, failed: 0, superseded: 0, total: 0 };
        for (const row of docRes.rows) {
          if (row.status && row.status in docCounts) {
            docCounts[row.status] = row.count;
          }
          docCounts.total += row.count;
        }

        // 4. AI Suggestion counts by review_status
        const suggRes = await client.query(
          `SELECT review_status, count(*)::int AS count
           FROM ai_responses
           WHERE organization_id = $1
           GROUP BY review_status`,
          [organizationId]
        );
        const suggCounts = { pending_review: 0, approved: 0, rejected: 0, dismissed: 0, total: 0 };
        for (const row of suggRes.rows) {
          if (row.review_status in suggCounts) {
            suggCounts[row.review_status] = row.count;
          }
          suggCounts.total += row.count;
        }

        const stats = {
          tickets: ticketCounts,
          documents: docCounts,
          suggestions: suggCounts
        };

        // 5. Store in cache (60s TTL)
        await this.cache.setAdminStats(organizationId, stats, 60);

        return res.status(200).json({ data: stats });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }

  async getIndexingConfig(req, res, next) {
    try {
      const configs = await this.configRepo.listConfigs();
      res.status(200).json({
        data: configs.map((c) => ({
          id: c.id,
          name: c.name,
          provider: c.provider,
          model: c.model,
          dimensions: c.dimensions,
          chunkSizeChars: c.chunk_size_chars,
          chunkOverlapChars: c.chunk_overlap_chars,
          status: c.status,
          verifiedAt: c.verified_at,
          verificationNote: c.verification_note,
          createdAt: c.created_at
        }))
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
