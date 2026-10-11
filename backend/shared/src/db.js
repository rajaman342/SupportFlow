import pg from 'pg';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

let poolInstance = null;

export function getDatabasePool(customConfig = null) {
  if (!poolInstance || customConfig) {
    const config = customConfig || getConfig();
    const pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle database client');
    });

    if (!customConfig) {
      poolInstance = pool;
    } else {
      return pool;
    }
  }
  return poolInstance;
}

export async function checkDatabaseHealth(pool = null, timeoutMs = 2000) {
  const p = pool || getDatabasePool();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs)
  );

  try {
    await Promise.race([p.query('SELECT 1 AS ok'), timeoutPromise]);
    return { ok: true };
  } catch (err) {
    logger.warn({ err: err.message }, 'Database health check failed');
    return { ok: false, error: 'Database unavailable' };
  }
}

export async function closeDatabasePool(pool = null) {
  const p = pool || poolInstance;
  if (p) {
    await p.end();
    if (p === poolInstance) {
      poolInstance = null;
    }
  }
}
