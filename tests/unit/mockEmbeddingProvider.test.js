import { describe, it, expect } from 'vitest';
import { MockEmbeddingProvider } from '@supportflow/shared';

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe('MockEmbeddingProvider Unit Tests', () => {
  it('generates deterministic vectors for identical text', async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 384, env: 'development' });
    const text = 'Customer returns must be within 30 days of purchase';

    const vec1 = await provider.embedQuery(text);
    const vec2 = await provider.embedQuery(text);

    expect(vec1).toHaveLength(384);
    expect(vec2).toHaveLength(384);
    expect(vec1).toEqual(vec2);
  });

  it('produces L2-normalized vectors (magnitude ~ 1.0)', async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 384, env: 'development' });
    const vec = await provider.embedQuery('SupportFlow order tracking policy');

    let sumSq = 0;
    for (const val of vec) {
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq);
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('yields higher cosine similarity for overlapping vocabulary than disjoint vocabulary', async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 384, env: 'development' });

    const baseText = 'Refund policy for damaged goods and returned items';
    const relatedText = 'Policy on returned items and damaged goods replacement';
    const unrelatedText = 'Deploying PostgreSQL Docker containers with BullMQ';

    const baseVec = await provider.embedQuery(baseText);
    const relatedVec = await provider.embedQuery(relatedText);
    const unrelatedVec = await provider.embedQuery(unrelatedText);

    const relatedSim = cosineSimilarity(baseVec, relatedVec);
    const unrelatedSim = cosineSimilarity(baseVec, unrelatedVec);

    expect(relatedSim).toBeGreaterThan(unrelatedSim);
  });

  it('embeds document batches maintaining ordering', async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 384, env: 'development' });
    const docs = ['First chunk', 'Second chunk', 'Third chunk'];

    const batchVectors = await provider.embedDocuments(docs);
    expect(batchVectors).toHaveLength(3);

    const singleVec2 = await provider.embedQuery('Second chunk');
    expect(batchVectors[1]).toEqual(singleVec2);
  });

  it('strictly refuses instantiation when environment is production', () => {
    expect(() => {
      new MockEmbeddingProvider({ env: 'production' });
    }).toThrow(/refused in production/i);
  });
});
