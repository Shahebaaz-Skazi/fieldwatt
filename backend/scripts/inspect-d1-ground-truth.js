const db = require('../src/db');

const tables = [
  'admins',
  'agents',
  'cycles',
  'areas',
  'properties',
  'assignments',
  'readings',
  'attendance',
  'revisits',
  'whatsapp_logs',
  'imports'
];

async function run() {
  console.log('====================================================');
  console.log('         DATABASE GROUND-TRUTH INSPECTION          ');
  console.log('====================================================');

  for (const table of tables) {
    try {
      // 1. Get count
      const countRes = await db.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      const count = countRes.rows[0]?.cnt ?? 0;
      console.log(`Table: ${table}`);
      console.log(`  - Row count: ${count}`);

      // 2. Get samples
      if (count > 0) {
        const sampleRes = await db.query(`SELECT * FROM ${table} LIMIT 2`);
        console.log('  - Samples:', JSON.stringify(sampleRes.rows, null, 2));
      } else {
        console.log('  - (No records found)');
      }
      console.log('----------------------------------------------------');
    } catch (err) {
      console.error(`❌ Table: ${table} - failed to inspect:`, err.message);
      console.log('----------------------------------------------------');
    }
  }
}

run();
