/**
 * scripts/migrate-assignment-schema.js
 *
 * Migrates D1 database to add columns requested for the new Bulk Workload Assignment pipeline.
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function addColumnIfNotExists(table, column, definition) {
  try {
    // Check if column exists
    const info = await db.query(`PRAGMA table_info(${table})`);
    const exists = info.rows.some(r => r.name === column);
    if (!exists) {
      console.log(`- Adding column "${column}" to table "${table}"...`);
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`  ✓ Column "${column}" added successfully.`);
    } else {
      console.log(`- Column "${column}" already exists in table "${table}".`);
    }
  } catch (err) {
    console.error(`Failed to add column "${column}" to table "${table}":`, err.message);
  }
}

async function run() {
  console.log('====================================================');
  console.log('        MIGRATING ASSIGNMENTS SCHEMA FOR D1         ');
  console.log('====================================================');

  // Add columns to properties
  await addColumnIfNotExists('properties', 'is_assigned', 'INTEGER DEFAULT 0');
  await addColumnIfNotExists('properties', 'assigned_agent_id', 'TEXT');

  // Add columns to assignments
  await addColumnIfNotExists('assignments', 'is_completed', 'INTEGER DEFAULT 0');
  await addColumnIfNotExists('assignments', 'created_at', 'TEXT');

  // Add columns to cycles
  await addColumnIfNotExists('cycles', 'month', 'TEXT');
  await addColumnIfNotExists('cycles', 'year', 'INTEGER');
  await addColumnIfNotExists('cycles', 'status', 'TEXT DEFAULT \'active\'');
  await addColumnIfNotExists('cycles', 'name', 'TEXT');

  console.log('====================================================');
  console.log('             SCHEMA MIGRATION COMPLETED             ');
  console.log('====================================================');
}

run();
