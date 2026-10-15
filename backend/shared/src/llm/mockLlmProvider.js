import { LlmProvider } from './llmProvider.js';
import { AiProviderUnavailableError } from '../errors.js';

export class MockLlmProvider extends LlmProvider {
  constructor({ name = 'mock', model = 'mock-llm-v1', env = process.env.NODE_ENV } = {}) {
    if (env === 'production') {
      throw new Error('Mock LLM provider is strictly refused in production');
    }
    super({ name, model });
    this.env = env;
  }

  /**
   * Generates a deterministic mock response adhering to the SupportFlow RAG prompt format.
   *
   * @param {{ system: string, user: string, schema?: object, timeoutMs?: number }} params
   * @returns {Promise<{
   *   text: string,
   *   usage: { inputTokens: number, outputTokens: number },
   *   latencyMs: number,
   *   provider: string,
   *   model: string
   * }>}
   */
  async generate({ system = '', user = '', timeoutMs = 30000 }) {
    const startTime = Date.now();

    // Test-only switches (honored ONLY when NODE_ENV=test)
    if (this.env === 'test' && process.env.MOCK_LLM_BEHAVIOR) {
      const behavior = process.env.MOCK_LLM_BEHAVIOR;

      if (behavior === 'provider_error') {
        throw new AiProviderUnavailableError('Simulated mock LLM outage');
      }

      if (behavior === 'timeout') {
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs + 10, 200)));
        const err = new Error('LLM request timed out');
        err.name = 'TimeoutError';
        throw err;
      }

      if (behavior === 'malformed_json') {
        return {
          text: '{ outcome: "answered", broken json here...',
          usage: { inputTokens: 40, outputTokens: 10 },
          latencyMs: Date.now() - startTime,
          provider: this.name,
          model: this.model
        };
      }

      if (behavior === 'fabricated_citation') {
        const payload = {
          outcome: 'answered',
          answer: 'Based on standard protocol [99], please follow the guidance.',
          citations: [99],
          suggested_category: 'support',
          suggested_priority: 'medium'
        };
        return {
          text: JSON.stringify(payload),
          usage: { inputTokens: 50, outputTokens: 20 },
          latencyMs: Date.now() - startTime,
          provider: this.name,
          model: this.model
        };
      }

      if (behavior === 'missing_citations') {
        const payload = {
          outcome: 'answered',
          answer: 'Here is an answer without citations.',
          citations: [],
          suggested_category: 'general',
          suggested_priority: 'low'
        };
        return {
          text: JSON.stringify(payload),
          usage: { inputTokens: 50, outputTokens: 20 },
          latencyMs: Date.now() - startTime,
          provider: this.name,
          model: this.model
        };
      }

      if (behavior === 'conflicting_evidence') {
        const payload = {
          outcome: 'conflicting_evidence',
          answer: 'Source [1] states refunds are 30 days while Source [2] states refunds are 14 days.',
          citations: [1, 2],
          suggested_category: 'refund',
          suggested_priority: 'high'
        };
        return {
          text: JSON.stringify(payload),
          usage: { inputTokens: 60, outputTokens: 30 },
          latencyMs: Date.now() - startTime,
          provider: this.name,
          model: this.model
        };
      }
    }

    // Default deterministic behavior:
    // Parse <sources> section from user prompt
    const sourcesMatch = user.match(/<sources>([\s\S]*?)<\/sources>/i);
    const sourcesContent = sourcesMatch ? sourcesMatch[1].trim() : '';

    if (!sourcesContent) {
      const payload = {
        outcome: 'insufficient_evidence',
        answer: null,
        citations: [],
        suggested_category: null,
        suggested_priority: null
      };
      return {
        text: JSON.stringify(payload),
        usage: { inputTokens: Math.ceil(user.length / 4), outputTokens: 15 },
        latencyMs: Date.now() - startTime,
        provider: this.name,
        model: this.model
      };
    }

    // Extract first source snippet [1]
    const firstSourceMatch = sourcesContent.match(/\[1\]\s*\(([^)]+)\):\s*([^\n\r]+)/i);
    let answerText = '';

    if (firstSourceMatch) {
      const snippet = firstSourceMatch[2].trim();
      // Extract first sentence or chunk
      const firstSentence = snippet.split(/[.?!]/)[0].trim();
      answerText = `${firstSentence || snippet} [1].`;
    } else {
      // Just extract any text after [1]
      const fallbackMatch = sourcesContent.match(/\[1\]\s*:?\s*([^\n\r]+)/i);
      const snippet = fallbackMatch ? fallbackMatch[1].trim() : 'According to our policy';
      answerText = `${snippet} [1].`;
    }

    // Extract subject/message to infer priority/category if possible
    let category = 'support';
    let priority = 'medium';

    if (user.toLowerCase().includes('urgent') || user.toLowerCase().includes('emergency')) {
      priority = 'urgent';
    } else if (user.toLowerCase().includes('refund') || user.toLowerCase().includes('billing')) {
      category = 'billing';
    }

    const payload = {
      outcome: 'answered',
      answer: answerText,
      citations: [1],
      suggested_category: category,
      suggested_priority: priority
    };

    const text = JSON.stringify(payload);
    const latencyMs = Math.max(1, Date.now() - startTime);

    return {
      text,
      usage: {
        inputTokens: Math.max(10, Math.ceil((system.length + user.length) / 4)),
        outputTokens: Math.max(5, Math.ceil(text.length / 4))
      },
      latencyMs,
      provider: this.name,
      model: this.model
    };
  }
}
