/**
 * scripts/add-area-index.js
 *
 * Adds idx_properties_area_id index to properties table to prevent full table scans.
 */
const db = require('../src/utils/db');

async function run() {
  console.log('Adding database index idx_properties_area_id on properties(area_id)...');
  await db.query('CREATE INDEX IF NOT EXISTS idx_properties_area_id ON properties(area_id)');
  console.log('Index created successfully!');
}

run().catch(console.error);
