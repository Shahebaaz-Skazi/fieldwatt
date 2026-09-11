require('dotenv').config();
const path = require('path');
const { Worker } = require('worker_threads');
const db = require('../src/utils/db');

async function reimportSept() {
  console.log('1. Cleaning up failed empty import record for September...');
  await db.query("DELETE FROM imports WHERE file_name LIKE '%PCMCPM30%' OR billing_month = 'September 2026'");
  console.log('Cleaned up empty import record.');

  console.log('2. Spawning Excel worker for PCMCPM30 15.09.2026.xlsx...');
  const filePath = path.join(__dirname, '../../PCMCPM30 15.09.2026.xlsx');
  const adminId = '60529973-4ca8-4a4b-9de8-3246b5a5e941';

  const workerPath = path.join(__dirname, '../src/workers/excel.worker.js');
  const worker = new Worker(workerPath, {
    workerData: { filePath, adminId, fileName: 'PCMCPM30 15.09.2026.xlsx' }
  });

  worker.on('message', (msg) => {
    console.log('[Worker Msg]:', msg);
    if (msg.type === 'done') {
      console.log('✅ IMPORT COMPLETE! Import ID:', msg.importId);
      process.exit(0);
    } else if (msg.type === 'error') {
      console.error('❌ IMPORT ERROR:', msg.error);
      process.exit(1);
    }
  });

  worker.on('error', (err) => {
    console.error('❌ Worker Exception:', err);
    process.exit(1);
  });
}

reimportSept();
