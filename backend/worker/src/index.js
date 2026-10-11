import { Worker, Queue } from 'bullmq';
import { getConfig, logger, closeDatabasePool, closeRedis } from '@supportflow/shared';

const config = getConfig();

// Extract connection options from REDIS_URL
const redisConnection = {
  url: config.REDIS_URL,
  maxRetriesPerRequest: null
};

export const PING_QUEUE_NAME = 'ping';

export function createPingQueue(connection = redisConnection) {
  return new Queue(PING_QUEUE_NAME, { connection });
}

export function createWorker(connection = redisConnection) {
  const worker = new Worker(
    PING_QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Processing worker job');
      if (job.name === 'ping') {
        return { pong: true, processedAt: new Date().toISOString() };
      }
      return { handled: true };
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY || 2
    }
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
  });

  return worker;
}

// If executed directly, run the worker and dispatch an initial ping job
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  logger.info({ queue: PING_QUEUE_NAME }, 'SupportFlow BullMQ worker starting');

  const pingQueue = createPingQueue();
  const worker = createWorker();

  // Enqueue a test ping job on startup so worker activity is verified
  pingQueue
    .add('ping', { sentAt: new Date().toISOString() }, { removeOnComplete: true })
    .then((job) => {
      logger.info({ jobId: job.id }, 'Enqueued initial startup ping job');
    })
    .catch((err) => {
      logger.warn({ err: err.message }, 'Failed to enqueue startup ping job');
    });

  let isShuttingDown = false;
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated for worker');

    try {
      await worker.close();
      await pingQueue.close();
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
