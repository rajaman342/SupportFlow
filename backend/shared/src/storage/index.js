import { LocalStorageProvider } from './localStorageProvider.js';
import { getConfig } from '../config.js';

let storageInstance = null;

export function getStorageProvider(overrideConfig = null) {
  if (storageInstance && !overrideConfig) {
    return storageInstance;
  }

  const config = overrideConfig || getConfig();

  if (config.STORAGE_PROVIDER === 'local') {
    const instance = new LocalStorageProvider({
      baseDir: config.LOCAL_STORAGE_DIR,
      signingSecret: config.STORAGE_URL_SIGNING_SECRET,
      ttlSeconds: config.SIGNED_URL_TTL_SECONDS
    });
    if (!overrideConfig) storageInstance = instance;
    return instance;
  }

  throw new Error(`Unsupported STORAGE_PROVIDER: ${config.STORAGE_PROVIDER}`);
}

export * from './storageProvider.js';
export * from './localStorageProvider.js';
