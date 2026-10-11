import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

describe('Config Environment Validation', () => {
  const baseValidEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://supportflow:test@localhost:5432/supportflow',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: '12345678901234567890123456789012', // 32 chars
    STORAGE_URL_SIGNING_SECRET: '12345678901234567890123456789012' // 32 chars
  };

  it('loads valid configuration successfully', () => {
    const cfg = loadConfig(baseValidEnv);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.API_PORT).toBe(4000);
    expect(cfg.LLM_PROVIDER).toBe('mock');
  });

  it('fails fast when required DATABASE_URL is missing', () => {
    const invalid = { ...baseValidEnv, DATABASE_URL: '' };
    expect(() => loadConfig(invalid)).toThrow(/DATABASE_URL is required/);
  });

  it('fails fast when JWT_ACCESS_SECRET is under 32 characters', () => {
    const invalid = { ...baseValidEnv, JWT_ACCESS_SECRET: 'too-short' };
    expect(() => loadConfig(invalid)).toThrow(/JWT_ACCESS_SECRET must be at least 32 characters/);
  });

  it('refuses mock AI provider in production', () => {
    const prodWithMock = {
      ...baseValidEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      REDIS_PASSWORD: 'secretpassword',
      LLM_PROVIDER: 'mock'
    };
    expect(() => loadConfig(prodWithMock)).toThrow(/Mock LLM provider is not permitted in production/);
  });

  it('refuses insecure cookies in production', () => {
    const prodInsecureCookie = {
      ...baseValidEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      REDIS_PASSWORD: 'secretpassword',
      LLM_PROVIDER: 'openai',
      EMBEDDING_PROVIDER: 'openai'
    };
    expect(() => loadConfig(prodInsecureCookie)).toThrow(/COOKIE_SECURE must be true in production/);
  });
});
