import crypto from 'node:crypto';
import { EmbeddingProvider } from './embeddingProvider.js';
import { EmbeddingDimensionMismatchError } from '../errors.js';

/**
 * Deterministic feature-hashing mock embedding provider for development and testing.
 * Lowercase, tokenize, hash each token into 1 of dimensions buckets with a sign, sum, L2-normalize.
 * Same text -> identical vector. Shared words -> closer vectors.
 */
export class MockEmbeddingProvider extends EmbeddingProvider {
  constructor({ name = 'mock', model = 'mock-hash-v1', dimensions = 384, env = process.env.NODE_ENV } = {}) {
    if (env === 'production') {
      throw new Error('Mock embedding provider is strictly refused in production');
    }
    super({ name, model, dimensions: Number(dimensions) });
  }

  /**
   * Embeds a list of document strings.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedDocuments(texts) {
    return texts.map((text) => this._hashText(text));
  }

  /**
   * Embeds a query string.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedQuery(text) {
    return this._hashText(text);
  }

  /**
   * Feature-hashing deterministic vector calculation.
   * @param {string} text
   * @returns {number[]}
   */
  _hashText(text) {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim();

    if (!normalized) {
      // Empty text gets normalized default vector
      vector[0] = 1.0;
      return this._validateVector(vector);
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const hash = crypto.createHash('sha256').update(token, 'utf8').digest();
      const bucket = hash.readUInt32BE(0) % this.dimensions;
      const sign = (hash.readUInt8(4) & 1) === 0 ? 1 : -1;
      vector[bucket] += sign;
    }

    // L2-normalize
    let sumSq = 0;
    for (let i = 0; i < this.dimensions; i++) {
      sumSq += vector[i] * vector[i];
    }

    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        // Round to 6 decimal places for numerical stability
        vector[i] = Number((vector[i] / norm).toFixed(6));
      }
    } else {
      vector[0] = 1.0;
    }

    return this._validateVector(vector);
  }

  _validateVector(vec) {
    if (vec.length !== this.dimensions) {
      throw new EmbeddingDimensionMismatchError(
        `Generated vector dimensions (${vec.length}) does not match expected (${this.dimensions})`
      );
    }
    return vec;
  }
}
