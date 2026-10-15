import { MockEmbeddingProvider } from './mockEmbeddingProvider.js';
import { getConfig } from '../config.js';

let embeddingProviderInstance = null;

export function getEmbeddingProvider(overrideConfig = null) {
  if (embeddingProviderInstance && !overrideConfig) {
    return embeddingProviderInstance;
  }

  const config = overrideConfig || getConfig();

  if (config.EMBEDDING_PROVIDER === 'mock') {
    const instance = new MockEmbeddingProvider({
      name: config.EMBEDDING_PROVIDER,
      model: config.EMBEDDING_MODEL,
      dimensions: config.EMBEDDING_DIMENSIONS,
      env: config.NODE_ENV
    });
    if (!overrideConfig) {
      embeddingProviderInstance = instance;
    }
    return instance;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${config.EMBEDDING_PROVIDER}`);
}

export * from './embeddingProvider.js';
export * from './mockEmbeddingProvider.js';
