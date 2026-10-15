import {
  indexingConfigRepository,
  closeDatabasePool,
  logger
} from '../backend/shared/src/index.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  try {
    if (command === 'list') {
      const configs = await indexingConfigRepository.listConfigs();
      console.log('\n--- SupportFlow Indexing Configurations ---');
      console.table(
        configs.map((c) => ({
          Name: c.name,
          Provider: c.provider,
          Model: c.model,
          Dimensions: c.dimensions,
          Status: c.status,
          ChunkSize: c.chunk_size_chars,
          ChunkOverlap: c.chunk_overlap_chars,
          Created: new Date(c.created_at).toISOString().slice(0, 10)
        }))
      );
    } else if (command === 'active') {
      const active = await indexingConfigRepository.getActiveConfig();
      if (!active) {
        console.log('No active indexing configuration found.');
      } else {
        console.log('\n--- Active Indexing Configuration ---');
        console.log(JSON.stringify(active, null, 2));
      }
    } else {
      console.log(`Unknown command: ${command}. Available: list, active`);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Indexing config script error');
  } finally {
    await closeDatabasePool();
  }
}

main();
