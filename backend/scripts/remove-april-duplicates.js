/**
 * scripts/remove-april-duplicates.js
 *
 * Removes duplicate April properties from the database to restore the
 * clean June 2026 dataset (13,139 rows).
 *
 * Usage:
 *   node scripts/remove-april-duplicates.js
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function run() {
  console.log('====================================================');
  console.log('      REMOVING APRIL DUPLICATES FROM DATABASE       ');
  console.log('====================================================\n');

  // 1. Delete April properties
  console.log('- Deleting properties belonging to April 2026 schedule...');
  const delRes = await db.query(
    `DELETE FROM properties WHERE raw_sap_data LIKE '%30.04.2026%'`
  );
  console.log(`  Deleted duplicate April properties.`);

  // 2. Count remaining properties
  const countRes = await db.query('SELECT COUNT(id) as count FROM properties');
  const remaining = countRes.rows[0].count;
  console.log(`  Remaining unique properties in database: ${remaining}`);

  // 3. Reset June 2026 import row count in imports table to the original 13,139
  console.log('- Resetting June 2026 import metadata total_rows...');
  await db.query(
    `UPDATE imports SET total_rows = 13139 WHERE id = '75cf7239-e942-4708-b682-6ad12d249a21'`
  );
  console.log('  June 2026 import metadata updated.');

  console.log('\n====================================================');
  console.log('               CLEANUP COMPLETE                     ');
  console.log('====================================================\n');
}

run().catch(console.error);
