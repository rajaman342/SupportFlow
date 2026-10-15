import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockLlmProvider } from '../../backend/shared/src/llm/mockLlmProvider.js';
import { AiProviderUnavailableError } from '../../backend/shared/src/errors.js';

describe('MockLlmProvider Unit Tests', () => {
  const originalBehavior = process.env.MOCK_LLM_BEHAVIOR;

  beforeEach(() => {
    delete process.env.MOCK_LLM_BEHAVIOR;
  });

  afterEach(() => {
    if (originalBehavior !== undefined) {
      process.env.MOCK_LLM_BEHAVIOR = originalBehavior;
    } else {
      delete process.env.MOCK_LLM_BEHAVIOR;
    }
  });

  it('refuses to instantiate in production environment', () => {
    expect(() => {
      new MockLlmProvider({ env: 'production' });
    }).toThrow(/Mock LLM provider is strictly refused in production/i);
  });

  it('generates a deterministic response with citation [1] when sources exist in prompt', async () => {
    const provider = new MockLlmProvider({ env: 'test' });
    const userPrompt =
      '<sources>\n' +
      '[1] (Refund Policy, p. 1): Refunds can be requested within 30 days of purchase.\n' +
      '</sources>\n\n' +
      '<ticket>\nSubject: Can I get a refund?\n</ticket>';

    const res = await provider.generate({ system: 'system prompt', user: userPrompt });

    expect(res.provider).toBe('mock');
    expect(res.model).toBe('mock-llm-v1');
    expect(res.latencyMs).toBeGreaterThan(0);
    expect(res.usage.inputTokens).toBeGreaterThan(0);
    expect(res.usage.outputTokens).toBeGreaterThan(0);

    const parsed = JSON.parse(res.text);
    expect(parsed.outcome).toBe('answered');
    expect(parsed.citations).toEqual([1]);
    expect(parsed.answer).toContain('[1]');
    expect(parsed.suggested_category).toBe('billing');
  });

  it('returns insufficient_evidence when <sources> section is missing or empty', async () => {
    const provider = new MockLlmProvider({ env: 'test' });
    const userPrompt = '<sources>\n</sources>\n\n<ticket>\nSubject: Help me please\n</ticket>';

    const res = await provider.generate({ system: 'system prompt', user: userPrompt });
    const parsed = JSON.parse(res.text);

    expect(parsed.outcome).toBe('insufficient_evidence');
    expect(parsed.answer).toBeNull();
    expect(parsed.citations).toEqual([]);
  });

  it('honors MOCK_LLM_BEHAVIOR=fabricated_citation in test mode', async () => {
    process.env.MOCK_LLM_BEHAVIOR = 'fabricated_citation';
    const provider = new MockLlmProvider({ env: 'test' });

    const res = await provider.generate({ system: 'sys', user: '<sources>[1] text</sources>' });
    const parsed = JSON.parse(res.text);

    expect(parsed.outcome).toBe('answered');
    expect(parsed.citations).toEqual([99]);
    expect(parsed.answer).toContain('[99]');
  });

  it('honors MOCK_LLM_BEHAVIOR=malformed_json in test mode', async () => {
    process.env.MOCK_LLM_BEHAVIOR = 'malformed_json';
    const provider = new MockLlmProvider({ env: 'test' });

    const res = await provider.generate({ system: 'sys', user: 'prompt' });
    expect(res.text).toContain('{ outcome: "answered", broken json');
  });

  it('honors MOCK_LLM_BEHAVIOR=provider_error in test mode', async () => {
    process.env.MOCK_LLM_BEHAVIOR = 'provider_error';
    const provider = new MockLlmProvider({ env: 'test' });

    await expect(provider.generate({ system: 'sys', user: 'prompt' })).rejects.toThrow(
      AiProviderUnavailableError
    );
  });
});
