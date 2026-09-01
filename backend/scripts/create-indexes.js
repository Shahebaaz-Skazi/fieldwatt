/**
 * Script to create SQLite indexes on Cloudflare D1 to eliminate full table scans.
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function createIndexes() {
  console.log('=== CREATING CLOUDFLARE D1 DATABASE INDEXES ===');

  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area_id);',
    'CREATE INDEX IF NOT EXISTS idx_properties_import ON properties(import_id);',
    'CREATE INDEX IF NOT EXISTS idx_properties_society ON properties(society);',
    'CREATE INDEX IF NOT EXISTS idx_assignments_agent_cycle ON assignments(agent_id, cycle_id);',
    'CREATE INDEX IF NOT EXISTS idx_assignments_prop_cycle ON assignments(property_id, cycle_id);',
    'CREATE INDEX IF NOT EXISTS idx_readings_assignment ON readings(assignment_id);',
    'CREATE INDEX IF NOT EXISTS idx_readings_status ON readings(status_code);',
    'CREATE INDEX IF NOT EXISTS idx_readings_anomalous ON readings(is_anomalous);',
    'CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_property ON whatsapp_logs(property_id);',
    'CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs(status);',
    'CREATE INDEX IF NOT EXISTS idx_cycles_is_active ON cycles(is_active);'
  ];

  for (const sql of indexStatements) {
    try {
      console.log('Executing:', sql);
      await db.query(sql);
      console.log('✓ Success');
    } catch (err) {
      console.error('❌ Error executing index:', err.message);
    }
  }

  console.log('\n=== INDEX CREATION COMPLETE ===');
}

createIndexes().finally(() => process.exit(0));
