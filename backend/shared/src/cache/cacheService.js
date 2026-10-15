import crypto from 'node:crypto';
import { getRedisClient } from '../redis.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

export class CacheService {
  constructor({ redis = null, config = null } = {}) {
    this.redis = redis; // lazily fetched if null
    this.config = config || getConfig();
    this.env = this.config.NODE_ENV || 'development';
  }

  _getClient() {
    return this.redis || getRedisClient();
  }

  /**
   * Deterministic hash of query parameters.
   */
  _hashQuery(query = {}) {
    if (!query || Object.keys(query).length === 0) {
      return 'default';
    }
    const sorted = Object.keys(query)
      .sort()
      .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== '')
      .map((k) => `${k}=${String(query[k]).trim()}`)
      .join('&');

    if (!sorted) return 'default';
    return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 16);
  }

  _hashText(text = '') {
    return crypto.createHash('sha256').update((text || '').trim().toLowerCase()).digest('hex').slice(0, 16);
  }

  /**
   * Safe Redis operation wrapper implementing fail-open pattern.
   * If Redis is down, returns fallback without throwing.
   */
  async _safe(operation, fallback = null) {
    try {
      const client = this._getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      return await operation(client);
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis cache operation failed; failing open');
      return fallback;
    }
  }

  // --- Version Counters ---

  async _getTicketVersion(orgId, userId = null) {
    const key = userId
      ? `sf:${this.env}:v1:org:${orgId}:user:${userId}:tickets:ver`
      : `sf:${this.env}:v1:org:${orgId}:tickets:ver`;
    const ver = await this._safe((r) => r.get(key), '1');
    return ver || '1';
  }

  async _getDocumentVersion(orgId) {
    const key = `sf:${this.env}:v1:org:${orgId}:docs:ver`;
    const ver = await this._safe((r) => r.get(key), '1');
    return ver || '1';
  }

  // --- Ticket Caching (30s TTL) ---

  async getCustomerTicketList(orgId, userId, query) {
    const ver = await this._getTicketVersion(orgId, userId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:user:${userId}:tickets:list:ver:${ver}:${qHash}`;
    const raw = await this._safe((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setCustomerTicketList(orgId, userId, query, data, ttlSeconds = 30) {
    const ver = await this._getTicketVersion(orgId, userId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:user:${userId}:tickets:list:ver:${ver}:${qHash}`;
    await this._safe((r) => r.setex(key, ttlSeconds, JSON.stringify(data)));
  }

  async getStaffTicketList(orgId, role, query) {
    const ver = await this._getTicketVersion(orgId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:staff:tickets:list:role:${role}:ver:${ver}:${qHash}`;
    const raw = await this._safe((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setStaffTicketList(orgId, role, query, data, ttlSeconds = 30) {
    const ver = await this._getTicketVersion(orgId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:staff:tickets:list:role:${role}:ver:${ver}:${qHash}`;
    await this._safe((r) => r.setex(key, ttlSeconds, JSON.stringify(data)));
  }

  /**
   * Invalidates ticket caches by incrementing the org and customer version counters.
   * Renders old keys unreachable without running key scans.
   */
  async invalidateTickets(orgId, customerId = null) {
    await this._safe(async (r) => {
      const pipeline = r.pipeline();
      pipeline.incr(`sf:${this.env}:v1:org:${orgId}:tickets:ver`);
      if (customerId) {
        pipeline.incr(`sf:${this.env}:v1:org:${orgId}:user:${customerId}:tickets:ver`);
      }
      await pipeline.exec();
    });
  }

  // --- Document Caching (60s TTL) ---

  async getDocumentList(orgId, query) {
    const ver = await this._getDocumentVersion(orgId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:docs:list:ver:${ver}:${qHash}`;
    const raw = await this._safe((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setDocumentList(orgId, query, data, ttlSeconds = 60) {
    const ver = await this._getDocumentVersion(orgId);
    const qHash = this._hashQuery(query);
    const key = `sf:${this.env}:v1:org:${orgId}:docs:list:ver:${ver}:${qHash}`;
    await this._safe((r) => r.setex(key, ttlSeconds, JSON.stringify(data)));
  }

  /**
   * Invalidates document lists by incrementing the document version counter.
   */
  async invalidateDocuments(orgId) {
    await this._safe((r) => r.incr(`sf:${this.env}:v1:org:${orgId}:docs:ver`));
  }

  // --- Admin Stats (60s TTL) ---

  async getAdminStats(orgId) {
    const key = `sf:${this.env}:v1:org:${orgId}:admin:stats`;
    const raw = await this._safe((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setAdminStats(orgId, stats, ttlSeconds = 60) {
    const key = `sf:${this.env}:v1:org:${orgId}:admin:stats`;
    await this._safe((r) => r.setex(key, ttlSeconds, JSON.stringify(stats)));
  }

  // --- Query Embeddings Caching (1h TTL) ---

  async getQueryEmbedding(orgId, configId, text) {
    const textHash = this._hashText(text);
    const key = `sf:${this.env}:v1:org:${orgId}:embeddings:cfg:${configId}:${textHash}`;
    const raw = await this._safe((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setQueryEmbedding(orgId, configId, text, vector, ttlSeconds = 3600) {
    const textHash = this._hashText(text);
    const key = `sf:${this.env}:v1:org:${orgId}:embeddings:cfg:${configId}:${textHash}`;
    await this._safe((r) => r.setex(key, ttlSeconds, JSON.stringify(vector)));
  }
}

export const cacheService = new CacheService();
