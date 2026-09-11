require('dotenv').config();
const db = require('../src/utils/db');

async function cleanGhostCycles() {
  console.log('Cleaning ghost cycles with no imported files or assignments...');
  const res = await db.query(`
    DELETE FROM cycles 
    WHERE NOT EXISTS (
      SELECT 1 FROM imports i WHERE i.billing_month = cycles.label
    )
    AND NOT EXISTS (
      SELECT 1 FROM assignments asg WHERE asg.cycle_id = cycles.id
    )
  `);
  console.log('Deleted ghost cycles result:', res);
}

cleanGhostCycles().finally(() => process.exit(0));
