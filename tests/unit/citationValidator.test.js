import { describe, it, expect } from 'vitest';
import { validateLlmResponse } from '../../backend/shared/src/rag/citationValidator.js';

describe('citationValidator Unit Tests', () => {
  const mockSources = [
    { rank: 1, documentTitle: 'Refund Policy', pageNumber: 2, snippet: 'Refunds within 30 days.' },
    { rank: 2, documentTitle: 'Shipping Policy', pageNumber: 5, snippet: 'Standard delivery takes 3-5 days.' }
  ];

  it('correctly parses valid answered response and marks cited sources', () => {
    const rawJson = JSON.stringify({
      outcome: 'answered',
      answer: 'You can request a refund within 30 days of delivery [1].',
      citations: [1],
      suggested_category: 'refund',
      suggested_priority: 'medium'
    });

    const result = validateLlmResponse(rawJson, mockSources);

    expect(result.isValid).toBe(true);
    expect(result.outcome).toBe('answered');
    expect(result.draftBody).toBe('You can request a refund within 30 days of delivery [1].');
    expect(result.citations).toEqual([1]);
    expect(result.suggestedCategory).toBe('refund');
    expect(result.suggestedPriority).toBe('medium');
    expect(result.sources[0].citedInAnswer).toBe(true);
    expect(result.sources[1].citedInAnswer).toBe(false);
  });

  it('strips markdown code fences before parsing JSON', () => {
    const rawWithFences = '```json\n{"outcome":"answered","answer":"Delivery takes 3-5 days [2].","citations":[2]}\n```';

    const result = validateLlmResponse(rawWithFences, mockSources);

    expect(result.isValid).toBe(true);
    expect(result.outcome).toBe('answered');
    expect(result.citations).toEqual([2]);
    expect(result.sources[1].citedInAnswer).toBe(true);
  });

  it('strips fabricated citations outside 1..k from text and citations list', () => {
    const rawJson = JSON.stringify({
      outcome: 'answered',
      answer: 'According to our policy [1] and secret rule [99], you are eligible.',
      citations: [1, 99],
      suggested_category: 'policy'
    });

    const result = validateLlmResponse(rawJson, mockSources);

    expect(result.isValid).toBe(true);
    expect(result.outcome).toBe('answered');
    // [99] stripped, [1] preserved
    expect(result.citations).toEqual([1]);
    expect(result.draftBody).toBe('According to our policy [1] and secret rule, you are eligible.');
  });

  it('INVARIANT: downgrades to insufficient_evidence if answered has zero valid citations', () => {
    const rawJson = JSON.stringify({
      outcome: 'answered',
      answer: 'You are completely covered by our fabricated policy [99].',
      citations: [99]
    });

    const result = validateLlmResponse(rawJson, mockSources);

    expect(result.outcome).toBe('insufficient_evidence');
    expect(result.draftBody).toBeNull();
    expect(result.citations).toEqual([]);
    expect(result.sources.every((s) => !s.citedInAnswer)).toBe(true);
  });

  it('INVARIANT: downgrades to insufficient_evidence if answered has empty citations array', () => {
    const rawJson = JSON.stringify({
      outcome: 'answered',
      answer: 'Here is an answer without citations.',
      citations: []
    });

    const result = validateLlmResponse(rawJson, mockSources);

    expect(result.outcome).toBe('insufficient_evidence');
    expect(result.draftBody).toBeNull();
    expect(result.citations).toEqual([]);
  });

  it('preserves conflicting_evidence outcome and multiple citations', () => {
    const rawJson = JSON.stringify({
      outcome: 'conflicting_evidence',
      answer: 'Policy [1] says 30 days while policy [2] says 14 days.',
      citations: [1, 2]
    });

    const result = validateLlmResponse(rawJson, mockSources);

    expect(result.outcome).toBe('conflicting_evidence');
    expect(result.draftBody).toBeNull(); // non-answered outcomes strictly force draftBody = null
    expect(result.citations).toEqual([1, 2]);
    expect(result.sources[0].citedInAnswer).toBe(true);
    expect(result.sources[1].citedInAnswer).toBe(true);
  });

  it('handles malformed JSON gracefully by returning outcome error and isValid false', () => {
    const broken = '{ outcome: "answered", broken json here...';

    const result = validateLlmResponse(broken, mockSources);

    expect(result.isValid).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.draftBody).toBeNull();
    expect(result.validationError).toContain('Failed to parse LLM JSON');
  });
});
