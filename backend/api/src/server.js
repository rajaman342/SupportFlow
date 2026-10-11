import { app } from './app.js';
import { getConfig, logger, closeDatabasePool, closeRedis } from '@supportflow/shared';

const config = getConfig();
const port = config.API_PORT;

const server = app.listen(port, () => {
  logger.info({ port, env: config.NODE_ENV }, 'SupportFlow API server started');
});

let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated for API');

  server.close(async () => {
    logger.info('HTTP server closed, closing database and redis connections');
    try {
      await Promise.all([closeDatabasePool(), closeRedis()]);
      logger.info('All connections cleanly closed');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during API graceful shutdown');
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
