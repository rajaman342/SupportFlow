import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../backend/shared/src/config.js';

describe('Production Hardening & Deployment Configuration Verification (Phase 8)', () => {
  const rootDir = process.cwd();
  const prodComposePath = path.join(rootDir, 'docker-compose.prod.yml');
  const ciWorkflowPath = path.join(rootDir, '.github/workflows/ci.yml');
  const envExamplePath = path.join(rootDir, '.env.example');

  describe('Production Environment Validation Guards (config.js)', () => {
    const validProdBase = {
      NODE_ENV: 'production',
      PORT: '4000',
      API_PORT: '4000',
      DATABASE_URL: 'postgres://user:pass@db:5432/supportflow',
      REDIS_URL: 'redis://:prod_redis_pass@redis:6379',
      REDIS_PASSWORD: 'prod_redis_pass',
      JWT_ACCESS_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      STORAGE_URL_SIGNING_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      COOKIE_SECURE: 'true',
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'sk-test-live-key',
      LLM_MODEL: 'gpt-4o-mini',
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_API_KEY: 'sk-test-live-key',
      EMBEDDING_MODEL: 'text-embedding-3-small',
      EMBEDDING_DIMENSIONS: '1536',
      EMBEDDING_CONFIG_NAME: 'openai-text-3-small-1536',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_DIR: '/data/storage',
      APP_BASE_URL: 'https://supportflow.example.com',
      CORS_ORIGINS: 'https://supportflow.example.com'
    };

    it('rejects NODE_ENV=production when LLM_PROVIDER is mock', () => {
      const badEnv = { ...validProdBase, LLM_PROVIDER: 'mock' };
      expect(() => loadConfig(badEnv)).toThrow(/Mock LLM provider is not permitted in production/);
    });

    it('rejects NODE_ENV=production when EMBEDDING_PROVIDER is mock', () => {
      const badEnv = { ...validProdBase, EMBEDDING_PROVIDER: 'mock' };
      expect(() => loadConfig(badEnv)).toThrow(/Mock embedding provider is not permitted in production/);
    });

    it('rejects NODE_ENV=production when COOKIE_SECURE is false', () => {
      const badEnv = { ...validProdBase, COOKIE_SECURE: 'false' };
      expect(() => loadConfig(badEnv)).toThrow(/COOKIE_SECURE must be true in production/);
    });

    it('rejects NODE_ENV=production when REDIS_PASSWORD is missing or empty', () => {
      const badEnv = { ...validProdBase, REDIS_PASSWORD: '' };
      expect(() => loadConfig(badEnv)).toThrow(/REDIS_PASSWORD is required in production/);
    });

    it('rejects short or weak JWT_ACCESS_SECRET (< 32 characters)', () => {
      const badEnv = { ...validProdBase, JWT_ACCESS_SECRET: 'short-secret' };
      expect(() => loadConfig(badEnv)).toThrow(/JWT_ACCESS_SECRET must be at least 32 characters/);
    });

    it('rejects short or weak STORAGE_URL_SIGNING_SECRET (< 32 characters)', () => {
      const badEnv = { ...validProdBase, STORAGE_URL_SIGNING_SECRET: 'weak-storage-key' };
      expect(() => loadConfig(badEnv)).toThrow(/STORAGE_URL_SIGNING_SECRET must be at least 32 characters/);
    });

    it('accepts valid production configuration when all production gates are satisfied', () => {
      const conf = loadConfig(validProdBase);
      expect(conf.NODE_ENV).toBe('production');
      expect(conf.COOKIE_SECURE).toBe(true);
      expect(conf.LLM_PROVIDER).toBe('openai');
      expect(conf.REDIS_PASSWORD).toBe('prod_redis_pass');
    });
  });

  describe('Production Docker Compose Security Blueprint (docker-compose.prod.yml)', () => {
    let prodComposeContent;

    it('confirms docker-compose.prod.yml exists and is readable', () => {
      expect(fs.existsSync(prodComposePath)).toBe(true);
      prodComposeContent = fs.readFileSync(prodComposePath, 'utf8');
      expect(prodComposeContent.length).toBeGreaterThan(100);
    });

    it('enforces network isolation: postgres and redis do NOT expose ports to host in production', () => {
      // Find postgres service block
      const postgresBlock = prodComposeContent.slice(
        prodComposeContent.indexOf('postgres:'),
        prodComposeContent.indexOf('redis:')
      );
      expect(postgresBlock).not.toMatch(/^\s+ports:/m);

      // Find redis service block
      const redisBlock = prodComposeContent.slice(
        prodComposeContent.indexOf('redis:'),
        prodComposeContent.indexOf('migrate:')
      );
      expect(redisBlock).not.toMatch(/^\s+ports:/m);
    });

    it('requires password protection for Redis in production compose', () => {
      expect(prodComposeContent).toContain('requirepass');
      expect(prodComposeContent).toContain('${REDIS_PASSWORD}');
    });

    it('enforces internal bridge network on all production services', () => {
      expect(prodComposeContent).toContain('supportflow_internal:');
      expect(prodComposeContent).toMatch(/networks:\s+- supportflow_internal/);
    });

    it('enforces health checks and restart policies on long-running services', () => {
      expect(prodComposeContent).toContain('restart: unless-stopped');
      expect(prodComposeContent).toContain('pg_isready');
      expect(prodComposeContent).toContain('redis-cli');
      expect(prodComposeContent).toContain('/health');
    });

    it('uses frontend multi-stage production Dockerfile and defines persistent volumes', () => {
      expect(prodComposeContent).toContain('frontend/Dockerfile.prod');
      expect(prodComposeContent).toContain('postgres_prod_data:');
      expect(prodComposeContent).toContain('redis_prod_data:');
      expect(prodComposeContent).toContain('storage_prod_data:');
    });
  });

  describe('Continuous Integration Pipeline Specification (.github/workflows/ci.yml)', () => {
    let ciContent;

    it('confirms CI workflow exists and triggers on main push and pull_request', () => {
      expect(fs.existsSync(ciWorkflowPath)).toBe(true);
      ciContent = fs.readFileSync(ciWorkflowPath, 'utf8');
      expect(ciContent).toContain('branches: [main]');
      expect(ciContent).toContain('pull_request:');
    });

    it('includes required validation stages: lint, unit, integration, security, frontend, eval, and build', () => {
      expect(ciContent).toContain('npm run lint');
      expect(ciContent).toContain('npm run test:unit');
      expect(ciContent).toContain('npm run migrate');
      expect(ciContent).toContain('npm run test:integration');
      expect(ciContent).toContain('npm run test:security');
      expect(ciContent).toContain('npm run test:frontend');
      expect(ciContent).toContain('npm run eval:mock');
      expect(ciContent).toContain('npm run build');
    });

    it('provisions pgvector and redis service containers for CI test execution', () => {
      expect(ciContent).toContain('image: pgvector/pgvector:pg16');
      expect(ciContent).toContain('image: redis:7-alpine');
      expect(ciContent).toContain('node-version: 22');
    });
  });

  describe('Environment Template Security (.env.example)', () => {
    let envContent;

    it('confirms .env.example exists and contains no leaked real keys', () => {
      expect(fs.existsSync(envExamplePath)).toBe(true);
      envContent = fs.readFileSync(envExamplePath, 'utf8');
      expect(envContent).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(envContent).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/);
      expect(envContent).toContain('NODE_ENV=');
      expect(envContent).toContain('JWT_ACCESS_SECRET=');
      expect(envContent).toContain('STORAGE_URL_SIGNING_SECRET=');
      expect(envContent).toContain('COOKIE_SECURE=');
    });
  });
});
