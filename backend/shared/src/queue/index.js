import { Queue } from 'bullmq';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

export const DOCUMENT_INGEST_QUEUE_NAME = 'document-ingest';
export const DOCUMENT_CLEANUP_QUEUE_NAME = 'document-cleanup';

let ingestQueueInstance = null;

export function getRedisConnection(overrideConfig = null) {
  const cfg = overrideConfig || getConfig();
  return {
    url: cfg.REDIS_URL,
    maxRetriesPerRequest: null
  };
}

export function getIngestQueue(overrideConfig = null) {
  if (ingestQueueInstance && !overrideConfig) {
    return ingestQueueInstance;
  }

  const connection = getRedisConnection(overrideConfig);
  const queue = new Queue(DOCUMENT_INGEST_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: (overrideConfig || getConfig()).INGEST_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: (overrideConfig || getConfig()).INGEST_BACKOFF_MS
      },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  });

  if (!overrideConfig) {
    ingestQueueInstance = queue;
  }
  return queue;
}

/**
 * Enqueues a document ingestion job idempotently.
 *
 * @param {object} params
 * @param {string} params.versionId
 * @param {string} params.organizationId
 * @param {object} [overrideConfig]
 */
export async function enqueueDocumentIngest({ versionId, organizationId }, overrideConfig = null) {
  const queue = getIngestQueue(overrideConfig);
  const jobId = `ingest_${versionId}`;

  try {
    const job = await queue.add(
      'ingest',
      { versionId, organizationId },
      {
        jobId, // Deterministic jobId for idempotency
        attempts: (overrideConfig || getConfig()).INGEST_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: (overrideConfig || getConfig()).INGEST_BACKOFF_MS
        }
      }
    );
    logger.info({ jobId: job.id, versionId, organizationId }, 'Document ingestion job enqueued');
    return job;
  } catch (err) {
    logger.error({ err: err.message, versionId, organizationId }, 'Failed to enqueue ingestion job');
    throw err;
  }
}

export async function closeQueues() {
  if (ingestQueueInstance) {
    await ingestQueueInstance.close();
    ingestQueueInstance = null;
  }
}
