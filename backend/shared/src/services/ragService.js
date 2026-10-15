import { getDatabasePool } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { retrievalRepository } from '../repositories/retrievalRepository.js';
import { aiResponseRepository } from '../repositories/aiResponseRepository.js';
import { indexingConfigRepository } from '../repositories/indexingConfigRepository.js';
import { ticketRepository } from '../repositories/ticketRepository.js';
import { ticketMessageRepository } from '../repositories/ticketMessageRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { getEmbeddingProvider } from '../embeddings/index.js';
import { getLlmProvider } from '../llm/index.js';
import { buildPrompt, PROMPT_VERSION } from '../rag/promptBuilder.js';
import { validateLlmResponse } from '../rag/citationValidator.js';
import { cacheService } from '../cache/cacheService.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AiProviderUnavailableError
} from '../errors.js';

export class RagService {
  constructor({
    retrievalRepo = retrievalRepository,
    aiRepo = aiResponseRepository,
    configRepo = indexingConfigRepository,
    ticketRepo = ticketRepository,
    messageRepo = ticketMessageRepository,
    auditRepo = auditLogRepository,
    pool = null,
    config = null,
    cache = null
  } = {}) {
    this.retrievalRepo = retrievalRepo;
    this.aiRepo = aiRepo;
    this.configRepo = configRepo;
    this.ticketRepo = ticketRepo;
    this.messageRepo = messageRepo;
    this.auditRepo = auditRepo;
    this.pool = pool || getDatabasePool();
    this.config = config || getConfig();
    this.cache = cache || cacheService;
  }

  /**
   * Generates an AI draft response for a ticket.
   *
   * @param {{
   *   organizationId: string,
   *   ticketId: string,
   *   userId: string,
   *   force?: boolean
   * }} options
   * @returns {Promise<{ suggestion: object, isExisting: boolean }>}
   */
  async generateSuggestion({ organizationId, ticketId, userId, force = false }) {
    // 1. Verify ticket and tenant boundary
    const ticket = await this.ticketRepo.findById(ticketId, organizationId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // 2. Fetch latest customer message (trigger message)
    const latestCustomerMessage = await this._getLatestCustomerMessage(ticketId, organizationId);
    const triggerMessageId = latestCustomerMessage ? latestCustomerMessage.id : null;
    const customerMessageText = latestCustomerMessage ? latestCustomerMessage.body : '';

    // 3. Fetch active indexing config
    const activeConfig = await this.configRepo.getActiveConfig();
    if (!activeConfig) {
      throw new Error('No active indexing configuration found');
    }

    // 4. Cost guard / Idempotency check:
    // If not forced, reuse existing pending_review suggestion for this trigger message & config
    if (!force) {
      const existing = await this.aiRepo.findLatestPendingForTicket(ticketId, organizationId, {
        triggerMessageId,
        indexingConfigId: activeConfig.id
      });
      if (existing) {
        return { suggestion: existing, isExisting: true };
      }
    }

    // 5. Build query text from ticket context
    const queryParts = [ticket.subject];
    if (customerMessageText) {
      queryParts.push(customerMessageText);
    }
    const queryText = queryParts.join(' - ').replace(/\s+/g, ' ').trim().slice(0, 500);

    // 6. Embed query using active provider (cached 1h by normalized text SHA-256)
    let queryVector = await this.cache.getQueryEmbedding(organizationId, activeConfig.id, queryText);
    if (!queryVector) {
      const embeddingProvider = getEmbeddingProvider();
      try {
        queryVector = await embeddingProvider.embedQuery(queryText);
      } catch (embErr) {
        logger.error({ err: embErr.message, ticketId }, 'Query embedding failed');
        throw new AiProviderUnavailableError(embErr.message || 'Embedding service unavailable');
      }
      await this.cache.setQueryEmbedding(organizationId, activeConfig.id, queryText, queryVector, 3600);
    }

    // 7. Retrieve tenant-scoped candidate chunks
    const candidates = await this.retrievalRepo.retrieveCandidates(
      organizationId,
      activeConfig,
      queryVector,
      {
        topK: this.config.RETRIEVAL_TOP_K,
        candidateLimit: this.config.RETRIEVAL_CANDIDATE_LIMIT,
        minSimilarity: this.config.RETRIEVAL_MIN_SIMILARITY
      }
    );

    const llmProvider = getLlmProvider();

    // 8. Empty retrieval fast path: zero LLM calls
    if (candidates.length === 0) {
      const emptySuggestion = await this.aiRepo.createWithSources({
        organizationId,
        ticketId,
        requestedBy: userId,
        indexingConfigId: activeConfig.id,
        queryText,
        triggerMessageId,
        outcome: 'insufficient_evidence',
        draftBody: null,
        suggestedCategory: null,
        suggestedPriority: null,
        provider: llmProvider.name,
        model: llmProvider.model,
        promptVersion: PROMPT_VERSION,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        topSimilarity: null,
        errorCode: null,
        sources: []
      });

      await this.auditRepo.create({
        organizationId,
        actorId: userId,
        action: 'ai.suggestion_requested',
        entityType: 'ai_response',
        entityId: emptySuggestion.id,
        metadata: {
          ticketId,
          outcome: 'insufficient_evidence',
          topSimilarity: null,
          sourceCount: 0
        }
      });

      return { suggestion: emptySuggestion, isExisting: false };
    }

    // 9. Build versioned prompt with delimited sections
    const prompt = buildPrompt({
      sources: candidates,
      ticketSubject: ticket.subject,
      customerMessageText
    });

    // 10. Call LLM provider
    let llmResult;
    try {
      llmResult = await llmProvider.generate({
        system: prompt.system,
        user: prompt.user,
        timeoutMs: this.config.LLM_TIMEOUT_MS
      });
    } catch (llmErr) {
      logger.error({ err: llmErr, ticketId }, 'LLM generation failed');

      // Persist failure row for audit tracking
      await this.aiRepo.createWithSources({
        organizationId,
        ticketId,
        requestedBy: userId,
        indexingConfigId: activeConfig.id,
        queryText,
        triggerMessageId,
        outcome: 'error',
        draftBody: null,
        provider: llmProvider.name,
        model: llmProvider.model,
        promptVersion: PROMPT_VERSION,
        topSimilarity: candidates[0]?.similarity || null,
        errorCode: llmErr.code || 'AI_PROVIDER_UNAVAILABLE',
        sources: candidates
      });

      throw new AiProviderUnavailableError(llmErr.message || 'AI service unavailable');
    }

    // 11. Validate LLM response and citations
    const validated = validateLlmResponse(llmResult.text, candidates);
    const topSimilarity = candidates.length > 0 ? candidates[0].similarity : null;

    // 12. Persist suggestion and source snapshots
    const createdSuggestion = await this.aiRepo.createWithSources({
      organizationId,
      ticketId,
      requestedBy: userId,
      indexingConfigId: activeConfig.id,
      queryText,
      triggerMessageId,
      outcome: validated.outcome,
      draftBody: validated.draftBody,
      suggestedCategory: validated.suggestedCategory,
      suggestedPriority: validated.suggestedPriority,
      provider: llmResult.provider,
      model: llmResult.model,
      promptVersion: PROMPT_VERSION,
      latencyMs: llmResult.latencyMs,
      inputTokens: llmResult.usage?.inputTokens || 0,
      outputTokens: llmResult.usage?.outputTokens || 0,
      topSimilarity,
      errorCode: validated.outcome === 'error' ? 'VALIDATION_ERROR' : null,
      sources: validated.sources
    });

    // 13. Audit log
    await this.auditRepo.create({
      organizationId,
      actorId: userId,
      action: 'ai.suggestion_requested',
      entityType: 'ai_response',
      entityId: createdSuggestion.id,
      metadata: {
        ticketId,
        outcome: validated.outcome,
        topSimilarity,
        citedCount: validated.citations.length,
        sourceCount: candidates.length
      }
    });

    return { suggestion: createdSuggestion, isExisting: false };
  }

  /**
   * Reviews an AI suggestion (approve, edit_approve, reject, dismiss).
   *
   * @param {{
   *   organizationId: string,
   *   suggestionId: string,
   *   userId: string,
   *   userRole: string,
   *   action: 'approve' | 'edit_approve' | 'reject' | 'dismiss',
   *   body?: string,
   *   reason?: string
   * }} options
   * @returns {Promise<object>}
   */
  async reviewSuggestion({
    organizationId,
    suggestionId,
    userId,
    userRole,
    action,
    body = null,
    reason = null
  }) {
    const validActions = ['approve', 'edit_approve', 'reject', 'dismiss'];
    if (!validActions.includes(action)) {
      throw new ValidationError(`Invalid review action: ${action}`);
    }

    // 1. Fetch suggestion
    const suggestion = await this.aiRepo.findById(suggestionId, organizationId);
    if (!suggestion) {
      throw new NotFoundError('AI suggestion not found');
    }

    // 2. Enforce review state machine: only pending_review suggestions can be reviewed
    if (suggestion.reviewStatus !== 'pending_review') {
      throw new ConflictError('Suggestion has already been reviewed');
    }

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');

      let updated;

      if (action === 'approve' || action === 'edit_approve') {
        if (suggestion.outcome !== 'answered') {
          throw new ValidationError('Only answered suggestions can be approved');
        }

        let finalBody;
        if (action === 'edit_approve') {
          if (!body || typeof body !== 'string' || !body.trim()) {
            throw new ValidationError('Edited body is required for edit_approve');
          }
          finalBody = body.trim();
        } else {
          finalBody = suggestion.draftBody;
        }

        const reviewStatus = action === 'approve' ? 'approved' : 'edited_approved';
        const reviewedAt = new Date();

        // Update suggestion status
        updated = await this.aiRepo.updateReview(
          suggestionId,
          organizationId,
          {
            reviewStatus,
            reviewedBy: userId,
            reviewedAt,
            finalBody
          },
          tx
        );

        // Insert message authored by reviewing human (source: ai_approved)
        // INVARIANT: Ticket status NEVER changes automatically
        await this.messageRepo.create(
          {
            ticketId: suggestion.ticketId,
            organizationId,
            authorId: userId,
            authorRole: userRole,
            body: finalBody,
            source: 'ai_approved',
            aiResponseId: suggestion.id
          },
          tx
        );

        // Audit log
        await this.auditRepo.create(
          {
            organizationId,
            actorId: userId,
            action: action === 'approve' ? 'ai.suggestion_approved' : 'ai.suggestion_edited_approved',
            entityType: 'ai_response',
            entityId: suggestion.id,
            metadata: {
              ticketId: suggestion.ticketId,
              action,
              reason: reason || null
            }
          },
          tx
        );
      } else if (action === 'reject') {
        updated = await this.aiRepo.updateReview(
          suggestionId,
          organizationId,
          {
            reviewStatus: 'rejected',
            reviewedBy: userId,
            reviewedAt: new Date(),
            finalBody: null
          },
          tx
        );

        await this.auditRepo.create(
          {
            organizationId,
            actorId: userId,
            action: 'ai.suggestion_rejected',
            entityType: 'ai_response',
            entityId: suggestion.id,
            metadata: {
              ticketId: suggestion.ticketId,
              reason: reason || null
            }
          },
          tx
        );
      } else if (action === 'dismiss') {
        updated = await this.aiRepo.updateReview(
          suggestionId,
          organizationId,
          {
            reviewStatus: 'dismissed',
            reviewedBy: userId,
            reviewedAt: new Date(),
            finalBody: null
          },
          tx
        );

        await this.auditRepo.create(
          {
            organizationId,
            actorId: userId,
            action: 'ai.suggestion_dismissed',
            entityType: 'ai_response',
            entityId: suggestion.id,
            metadata: {
              ticketId: suggestion.ticketId,
              reason: reason || null
            }
          },
          tx
        );
      }

      await tx.query('COMMIT');
      return updated;
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.release();
    }
  }

  /**
   * Fetches an AI suggestion by ID.
   */
  async getSuggestion(id, organizationId) {
    const suggestion = await this.aiRepo.findById(id, organizationId);
    if (!suggestion) {
      throw new NotFoundError('AI suggestion not found');
    }
    return suggestion;
  }

  /**
   * Lists AI suggestions for a ticket.
   */
  async listSuggestions(ticketId, organizationId, options = {}) {
    // Verify ticket exists in tenant
    const ticket = await this.ticketRepo.findById(ticketId, organizationId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    return this.aiRepo.listByTicket(ticketId, organizationId, options);
  }

  /**
   * Fetches a specific source snapshot with dynamic sourceState.
   */
  async getSource(sourceId, suggestionId, organizationId) {
    const source = await this.aiRepo.getSourceById(sourceId, suggestionId, organizationId);
    if (!source) {
      throw new NotFoundError('Source not found');
    }
    return source;
  }

  async _getLatestCustomerMessage(ticketId, organizationId) {
    const sql = `
      SELECT id, body, created_at
      FROM ticket_messages
      WHERE ticket_id = $1
        AND organization_id = $2
        AND author_role = 'customer'
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = await this.pool.query(sql, [ticketId, organizationId]);
    return res.rows[0] || null;
  }
}

export const ragService = new RagService();
