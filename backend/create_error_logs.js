require('dotenv').config();
const db = require('./src/db');
async function run() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      message TEXT,
      stack TEXT,
      route TEXT,
      payload TEXT
    )
  `);
  console.log('error_logs table created');
}
run();
