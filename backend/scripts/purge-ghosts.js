require('dotenv').config();
const db = require('../src/utils/db');

async function purgeGhosts() {
  await db.query("DELETE FROM cycles WHERE label NOT IN ('June 2026', 'September 2026')");
  const remaining = await db.query("SELECT id, label, is_active FROM cycles");
  console.log('REMAINING CYCLES IN DB:', remaining.rows);
}

purgeGhosts().finally(() => process.exit(0));
