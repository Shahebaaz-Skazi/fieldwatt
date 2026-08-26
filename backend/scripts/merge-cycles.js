/**
 * scripts/merge-cycles.js
 *
 * Merges the April 2026 import data into the June 2026 billing cycle import.
 * Deletes the April 2026 import and cycle records.
 * Updates all properties to point to the June 2026 import.
 *
 * Usage:
 *   node scripts/merge-cycles.js
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function run() {
  console.log('====================================================');
  console.log('      MERGING APRIL DATA INTO JUNE 2026 CYCLE       ');
  console.log('====================================================\n');

  const juneImportId = '75cf7239-e942-4708-b682-6ad12d249a21';
  const aprilImportId = '1859debf-da72-4d59-a86f-b5e84f16c67b';

  const aprilCycleIds = [
    '5eb0b39b-56ab-45bd-8309-aaf312d53a6b',
    '470c2b49-8487-407a-b205-313e6fa0a206'
  ];

  // 1. Move all properties to the June 2026 import ID
  console.log('- Re-linking all properties to June 2026 import...');
  const propRes = await db.query(
    `UPDATE properties SET import_id = $1`,
    [juneImportId]
  );
  console.log(`  Successfully re-linked properties.`);

  // 2. Count new total properties
  const countRes = await db.query('SELECT COUNT(id) as count FROM properties');
  const totalProperties = countRes.rows[0].count;
  console.log(`  Total properties in database: ${totalProperties}`);

  // 3. Update the total_rows in June 2026 import
  console.log('- Updating June 2026 import row count...');
  await db.query(
    `UPDATE imports SET total_rows = $1 WHERE id = $2`,
    [totalProperties, juneImportId]
  );
  console.log(`  Updated June 2026 import row count to ${totalProperties}.`);

  // 4. Delete the April 2026 import record
  console.log('- Deleting April 2026 import record...');
  await db.query(
    `DELETE FROM imports WHERE id = $1`,
    [aprilImportId]
  );
  console.log('  April 2026 import record deleted.');

  // 5. Delete April 2026 cycle records
  console.log('- Deleting April 2026 cycle records...');
  for (const cycleId of aprilCycleIds) {
    await db.query(
      `DELETE FROM cycles WHERE id = $1`,
      [cycleId]
    );
  }
  console.log('  April 2026 cycle records deleted.');

  console.log('\n====================================================');
  console.log('                 MERGE COMPLETE                     ');
  console.log('====================================================\n');
}

run().catch(console.error);
