/**
 * Base abstract class for LLM providers.
 */
export class LlmProvider {
  constructor({ name, model } = {}) {
    if (new.target === LlmProvider) {
      throw new TypeError('Cannot construct LlmProvider instances directly');
    }
    this.name = name;
    this.model = model;
  }

  /**
   * Generates a completion from system and user prompt.
   * @param {{ system: string, user: string, schema?: object, timeoutMs?: number }} params
   * @returns {Promise<{
   *   text: string,
   *   usage: { inputTokens: number, outputTokens: number },
   *   latencyMs: number,
   *   provider: string,
   *   model: string
   * }>}
   */
  async generate(_params) {
    throw new Error('generate() must be implemented by subclass');
  }
}
