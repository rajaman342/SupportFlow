import { MockLlmProvider } from './mockLlmProvider.js';
import { getConfig } from '../config.js';

let llmProviderInstance = null;

export function getLlmProvider(overrideConfig = null) {
  if (llmProviderInstance && !overrideConfig) {
    return llmProviderInstance;
  }

  const config = overrideConfig || getConfig();

  if (config.LLM_PROVIDER === 'mock') {
    const instance = new MockLlmProvider({
      name: config.LLM_PROVIDER,
      model: config.LLM_MODEL || 'mock-llm-v1',
      env: config.NODE_ENV
    });
    if (!overrideConfig) {
      llmProviderInstance = instance;
    }
    return instance;
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${config.LLM_PROVIDER}`);
}

export * from './llmProvider.js';
export * from './mockLlmProvider.js';
