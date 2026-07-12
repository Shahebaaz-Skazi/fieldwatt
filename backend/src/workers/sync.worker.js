const { Worker } = require('bullmq');
const { connection } = require('../dbQueue');
const { processReadingsDirectly } = require('../routes/agent/sync');

if (connection) {
  const worker = new Worker('sync-queue', async (job) => {
    const { agentId, readings, role } = job.data;
    console.log(`Processing sync job ${job.id} for agent ${agentId} with ${readings.length} readings (role: ${role || 'agent'}).`);
    try {
      await processReadingsDirectly(agentId, readings, role || 'agent');
      console.log(`Successfully processed sync job ${job.id}.`);
    } catch (error) {
      console.error(`Error processing sync job ${job.id}:`, error);
      throw error; // Let BullMQ retry/fail the job
    }
  }, {
    connection,
    concurrency: 5, // ponytail: limit concurrent DB writes to prevent pool exhaustion
  });

  worker.on('failed', (job, err) => {
    console.error(`Sync job ${job?.id} failed with error:`, err);
  });

  console.log('BullMQ sync-queue background worker started.');
} else {
  console.log('Redis connection not available. Background sync worker disabled (running in direct sync fallback mode).');
}
