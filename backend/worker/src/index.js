import { Worker, Queue } from 'bullmq';
import {
  getConfig,
  logger,
  closeDatabasePool,
  closeRedis,
  DOCUMENT_INGEST_QUEUE_NAME,
  getRedisConnection,
  enqueueDocumentIngest,
  documentVersionRepository
} from '@supportflow/shared';
import { processIngestJob } from './processors/ingestProcessor.js';

const config = getConfig();
const redisConnection = getRedisConnection();

export const PING_QUEUE_NAME = 'ping';

export function createPingQueue(connection = redisConnection) {
  return new Queue(PING_QUEUE_NAME, { connection });
}

export function createPingWorker(connection = redisConnection) {
  return new Worker(
    PING_QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Processing ping worker job');
      if (job.name === 'ping') {
        return { pong: true, processedAt: new Date().toISOString() };
      }
      return { handled: true };
    },
    { connection, concurrency: 1 }
  );
}

export function createIngestWorker(connection = redisConnection) {
  const worker = new Worker(
    DOCUMENT_INGEST_QUEUE_NAME,
    async (job) => {
      return await processIngestJob(job);
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY || 2
    }
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'Document ingestion job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Document ingestion job failed');
  });

  return worker;
}

export async function runReconciler() {
  try {
    const stuck = await documentVersionRepository.getStuckVersions(config.STUCK_JOB_MINUTES);
    if (stuck && stuck.length > 0) {
      logger.info({ count: stuck.length }, 'Reconciler found stuck document versions; re-enqueuing');
      for (const v of stuck) {
        try {
          await enqueueDocumentIngest({
            versionId: v.id,
            organizationId: v.organization_id
          });
        } catch (enqueueErr) {
          logger.warn({ versionId: v.id, err: enqueueErr.message }, 'Reconciler failed to re-enqueue version');
        }
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Error running document reconciler cycle');
  }
}

// If executed directly, run the workers and reconciler
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  logger.info({ queue: DOCUMENT_INGEST_QUEUE_NAME }, 'SupportFlow BullMQ worker starting');

  const pingQueue = createPingQueue();
  const pingWorker = createPingWorker();
  const ingestWorker = createIngestWorker();

  // Enqueue test ping
  pingQueue
    .add('ping', { sentAt: new Date().toISOString() }, { removeOnComplete: true })
    .catch((err) => {
      logger.warn({ err: err.message }, 'Failed to enqueue startup ping job');
    });

  // Reconciler interval
  const reconcilerIntervalMs = (config.RECONCILER_INTERVAL_MINUTES || 5) * 60 * 1000;
  const reconcilerTimer = setInterval(runReconciler, reconcilerIntervalMs);

  let isShuttingDown = false;
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated for worker');

    clearInterval(reconcilerTimer);

    try {
      await Promise.all([pingWorker.close(), ingestWorker.close(), pingQueue.close()]);
      await Promise.all([closeDatabasePool(), closeRedis()]);
      logger.info('Worker cleanly stopped');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
