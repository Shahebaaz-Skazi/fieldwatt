const path = require('path');
const { Worker } = require('worker_threads');

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node run_import.js <path_to_excel>");
  process.exit(1);
}

const workerPath = path.join(__dirname, '../src/workers/excel.worker.js');
const worker = new Worker(workerPath, {
  workerData: { 
    filePath: path.resolve(filePath), 
    fileName: path.basename(filePath),
    adminId: 'github-action-import' 
  }
});

worker.on('message', (msg) => {
  if (msg.type === 'done') {
    console.log(`Import completed successfully: ${msg.importId}`);
    process.exit(0);
  } else if (msg.type === 'error') {
    console.error(`Import failed: ${msg.error}`);
    process.exit(1);
  } else if (msg.type === 'progress') {
    if (msg.progress % 1000 === 0) console.log(`Progress: ${msg.progress} rows processed`);
  } else {
    console.log(msg);
  }
});

worker.on('error', (err) => {
  console.error('Worker thread error:', err);
  process.exit(1);
});

worker.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Worker stopped with exit code ${code}`);
    process.exit(code);
  }
});
