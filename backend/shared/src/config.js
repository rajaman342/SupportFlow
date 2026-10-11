import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file in non-production environments if present
dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    POSTGRES_USER: z.string().default('supportflow'),
    POSTGRES_PASSWORD: z.string().default('change_me_local_only'),
    POSTGRES_DB: z.string().default('supportflow'),
    POSTGRES_TEST_DB: z.string().default('supportflow_test'),

    // Redis
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    REDIS_PASSWORD: z.string().optional().default(''),

    // Auth
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
    REFRESH_FAMILY_MAX_DAYS: z.coerce.number().positive().default(30),
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().nonnegative().default(10),
    COOKIE_SECURE: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    PASSWORD_HASH_ALGORITHM: z.enum(['argon2id', 'bcrypt']).default('argon2id'),
    DEFAULT_ORGANIZATION_SLUG: z.string().default('demo-org'),

    // AI Providers
    LLM_PROVIDER: z.string().default('mock'),
    LLM_API_KEY: z.string().optional().default(''),
    LLM_MODEL: z.string().optional().default(''),
    EMBEDDING_PROVIDER: z.string().default('mock'),
    EMBEDDING_API_KEY: z.string().optional().default(''),
    EMBEDDING_MODEL: z.string().default('mock-hash-v1'),
    EMBEDDING_DIMENSIONS: z.coerce.number().positive().default(384),
    EMBEDDING_CONFIG_NAME: z.string().default('mock-hash-v1-384'),
    RETRIEVAL_TOP_K: z.coerce.number().positive().default(6),
    RETRIEVAL_CANDIDATE_LIMIT: z.coerce.number().positive().default(50),
    RETRIEVAL_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.3),
    AI_REQUESTS_PER_USER_PER_HOUR: z.coerce.number().positive().default(30),
    LLM_TIMEOUT_MS: z.coerce.number().positive().default(30000),

    // Storage
    STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./data/storage'),
    STORAGE_URL_SIGNING_SECRET: z
      .string()
      .min(32, 'STORAGE_URL_SIGNING_SECRET must be at least 32 characters'),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().positive().default(60),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
    MAX_PDF_PAGES: z.coerce.number().positive().default(300),
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),

    // Queue
    INGEST_JOB_ATTEMPTS: z.coerce.number().positive().default(4),
    INGEST_BACKOFF_MS: z.coerce.number().positive().default(5000),
    WORKER_CONCURRENCY: z.coerce.number().positive().default(2),
    RECONCILER_INTERVAL_MINUTES: z.coerce.number().positive().default(5),
    STUCK_JOB_MINUTES: z.coerce.number().positive().default(15)
  })
  .superRefine((data, ctx) => {
    // Production security guards
    if (data.NODE_ENV === 'production') {
      if (data.LLM_PROVIDER === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_PROVIDER'],
          message: 'Mock LLM provider is not permitted in production'
        });
      }
      if (data.EMBEDDING_PROVIDER === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMBEDDING_PROVIDER'],
          message: 'Mock embedding provider is not permitted in production'
        });
      }
      if (!data.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production'
        });
      }
      if (!data.REDIS_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_PASSWORD'],
          message: 'REDIS_PASSWORD is required in production'
        });
      }
    }
  });

export function loadConfig(sourceEnv = process.env) {
  const result = envSchema.safeParse(sourceEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[Configuration Error] Invalid environment configuration:\n${errorDetails}`);
  }
  return Object.freeze(result.data);
}

let cachedConfig = null;
export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export const config = getConfig();
