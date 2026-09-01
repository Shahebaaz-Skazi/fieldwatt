/**
 * Complete Performance Indexing Script for Cloudflare D1
 * Prevents full-table scans across all 12,977 properties and auxiliary tables.
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function createIndexes() {
  console.log('=== CREATING COMPLETE CLOUDFLARE D1 DATABASE INDEXES ===');

  const indexStatements = [
    // Properties table
    'CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area_id);',
    'CREATE INDEX IF NOT EXISTS idx_properties_import ON properties(import_id);',
    'CREATE INDEX IF NOT EXISTS idx_properties_society ON properties(society);',
    'CREATE INDEX IF NOT EXISTS idx_properties_phone ON properties(phone_number);',
    
    // Assignments table
    'CREATE INDEX IF NOT EXISTS idx_assignments_agent_cycle ON assignments(agent_id, cycle_id);',
    'CREATE INDEX IF NOT EXISTS idx_assignments_prop_cycle ON assignments(property_id, cycle_id);',
    'CREATE INDEX IF NOT EXISTS idx_assignments_property ON assignments(property_id);',
    'CREATE INDEX IF NOT EXISTS idx_assignments_cycle ON assignments(cycle_id);',
    
    // Readings table
    'CREATE INDEX IF NOT EXISTS idx_readings_assignment ON readings(assignment_id);',
    'CREATE INDEX IF NOT EXISTS idx_readings_status ON readings(status_code);',
    'CREATE INDEX IF NOT EXISTS idx_readings_anomalous ON readings(is_anomalous);',
    'CREATE INDEX IF NOT EXISTS idx_readings_submitted_type ON readings(submitted_by_type);',
    
    // WhatsApp logs table
    'CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_property ON whatsapp_logs(property_id);',
    'CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs(status);',
    'CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_cycle ON whatsapp_logs(cycle_id);',
    
    // Attendance & Cycles
    'CREATE INDEX IF NOT EXISTS idx_attendance_agent_date ON attendance(agent_id, date);',
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

  console.log('\n=== INDEX CREATION SCRIPT FINISHED ===');
}

createIndexes().finally(() => process.exit(0));
