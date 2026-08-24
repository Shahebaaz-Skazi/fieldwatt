/**
 * scripts/reset-d1-schema.js
 * Drops all D1 tables and recreates them with proper UUID defaults.
 */
require('dotenv').config();
const d1 = require('../src/utils/db');
const schema = require('./init-d1-schema');

const tables = [
  'whatsapp_logs', 'revisits', 'attendance', 'readings', 
  'assignments', 'agents', 'properties', 'imports', 
  'admins', 'areas', 'cycles'
];

async function main() {
  console.log('🗑️  Dropping all D1 tables for schema reset...');
  for (const t of tables) {
    try {
      await d1.query(`DROP TABLE IF EXISTS ${t}`);
      console.log(`  ✔ Dropped table: ${t}`);
    } catch (e) {
      console.warn(`  ⚠️ Failed to drop ${t}: ${e.message}`);
    }
  }
  console.log('\n🚀 Redeploying schema with UUID defaults...');
  await schema.main();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
