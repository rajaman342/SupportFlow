const VALID_OUTCOMES = new Set(['answered', 'insufficient_evidence', 'conflicting_evidence']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

/**
 * Validates and sanitizes raw LLM output against retrieved sources.
 *
 * Invariants enforced:
 * 1. Output must parse as JSON.
 * 2. Citations must be integers in range 1..sources.length.
 * 3. Out-of-bounds citations (e.g. [99]) are stripped from answer and citations array.
 * 4. Outcome 'answered' requires at least one valid citation; otherwise downgraded to 'insufficient_evidence'.
 * 5. Outcome != 'answered' strictly forces draftBody = null.
 * 6. Server maps citedInAnswer boolean onto each retrieved source snapshot.
 *
 * @param {string} rawText
 * @param {Array<{ rank: number, [key: string]: any }>} sources
 * @returns {{
 *   outcome: 'answered' | 'insufficient_evidence' | 'conflicting_evidence' | 'error',
 *   draftBody: string | null,
 *   citations: number[],
 *   suggestedCategory: string | null,
 *   suggestedPriority: 'low' | 'medium' | 'high' | 'urgent' | null,
 *   sources: Array<{ rank: number, citedInAnswer: boolean, [key: string]: any }>,
 *   isValid: boolean,
 *   validationError: string | null
 * }}
 */
export function validateLlmResponse(rawText, sources = []) {
  const sourceRanks = new Set(sources.map((s) => s.rank));
  let parsed;

  try {
    // Strip markdown code fences if present
    let cleaned = (rawText || '').trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Malformed JSON -> downgrade to error or insufficient_evidence
    return {
      outcome: 'error',
      draftBody: null,
      citations: [],
      suggestedCategory: null,
      suggestedPriority: null,
      sources: sources.map((s) => ({ ...s, citedInAnswer: false })),
      isValid: false,
      validationError: `Failed to parse LLM JSON output: ${err.message}`
    };
  }

  let outcome = typeof parsed.outcome === 'string' ? parsed.outcome.toLowerCase() : 'insufficient_evidence';
  if (!VALID_OUTCOMES.has(outcome)) {
    outcome = 'insufficient_evidence';
  }

  // Filter raw citations: must be integers that actually exist in retrieved sources
  const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];
  const validCitations = Array.from(
    new Set(
      rawCitations
        .map((c) => parseInt(c, 10))
        .filter((c) => Number.isInteger(c) && sourceRanks.has(c))
    )
  ).sort((a, b) => a - b);

  let draftBody = null;
  if (outcome === 'answered' && typeof parsed.answer === 'string' && parsed.answer.trim()) {
    // Sanitize answer text: remove bracketed numbers not in validCitations
    let sanitizedAnswer = parsed.answer.trim();
    sanitizedAnswer = sanitizedAnswer.replace(/\[(\d+)\]/g, (match, num) => {
      const n = parseInt(num, 10);
      return validCitations.includes(n) ? match : '';
    });
    // Clean up any double spaces and space before punctuation left from stripped citations
    sanitizedAnswer = sanitizedAnswer
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim();

    draftBody = sanitizedAnswer;
  }

  // Key safety invariant:
  // If answered but has 0 valid citations or empty draft body, downgrade to insufficient_evidence
  if (outcome === 'answered' && (!draftBody || validCitations.length === 0)) {
    outcome = 'insufficient_evidence';
    draftBody = null;
  }

  // Non-answered outcomes never have draftBody
  if (outcome !== 'answered') {
    draftBody = null;
  }

  // Category and priority
  const suggestedCategory = typeof parsed.suggested_category === 'string' && parsed.suggested_category.trim()
    ? parsed.suggested_category.trim().slice(0, 60)
    : null;

  const rawPriority = typeof parsed.suggested_priority === 'string' ? parsed.suggested_priority.toLowerCase() : null;
  const suggestedPriority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : null;

  // Annotate sources with citedInAnswer
  const annotatedSources = sources.map((s) => ({
    ...s,
    citedInAnswer: validCitations.includes(s.rank)
  }));

  return {
    outcome,
    draftBody,
    citations: validCitations,
    suggestedCategory,
    suggestedPriority,
    sources: annotatedSources,
    isValid: true,
    validationError: null
  };
}
