const { Queue } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let connection;
let syncQueue;

try {
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  });

  connection.on('error', (err) => {
    console.warn('Redis Connection Error (Sync queue disabled, falling back to sync processing):', err.message);
  });

  syncQueue = new Queue('sync-queue', { connection });
} catch (error) {
  console.warn('Failed to initialize Redis connection:', error.message);
}

module.exports = {
  syncQueue,
  connection,
};
