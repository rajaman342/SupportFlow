/**
 * Base abstract interface for embedding providers.
 */
export class EmbeddingProvider {
  /**
   * @param {object} options
   * @param {string} options.name
   * @param {string} options.model
   * @param {number} options.dimensions
   */
  constructor({ name, model, dimensions }) {
    if (this.constructor === EmbeddingProvider) {
      throw new Error('EmbeddingProvider is an abstract class and cannot be instantiated directly');
    }
    this.name = name;
    this.model = model;
    this.dimensions = dimensions;
  }

  /**
   * Generates embedding vectors for a batch of documents.
   * @param {string[]} _texts
   * @returns {Promise<number[][]>}
   */
  async embedDocuments(_texts) {
    throw new Error('embedDocuments() must be implemented by subclass');
  }

  /**
   * Generates an embedding vector for a single query.
   * @param {string} _text
   * @returns {Promise<number[]>}
   */
  async embedQuery(_text) {
    throw new Error('embedQuery() must be implemented by subclass');
  }
}
