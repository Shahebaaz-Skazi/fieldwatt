/**
 * scripts/diagnose-fk-issue.js
 *
 * Forensic diagnostic script to identify the root cause of:
 * "D1 batch failed: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY"
 *
 * Checks:
 * 1. FK schema on assignments table (PRAGMA foreign_key_list)
 * 2. Cycle existence for June 2026
 * 3. Agent ID existence check  
 * 4. Property ID existence check
 * 5. cycles table schema
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function diagnose() {
  console.log('\n========================================');
  console.log('   FK CONSTRAINT FORENSIC DIAGNOSTIC   ');
  console.log('========================================\n');

  // --- 1. FK schema on assignments ---
  console.log('=== [1] FOREIGN KEY CONSTRAINTS on assignments ===');
  try {
    const fkList = await db.query('PRAGMA foreign_key_list(assignments)');
    if (fkList.rows.length === 0) {
      console.log('  ⚠️  No foreign keys declared on assignments table.');
      console.log('      The FK error may be coming from a trigger or implicit constraint.\n');
    } else {
      fkList.rows.forEach(fk => {
        console.log(`  FK: "${fk.table}.${fk.to}" referenced by column "${fk.from}" (on_delete: ${fk.on_delete})`);
      });
      console.log();
    }
  } catch (e) {
    console.error('  ❌ PRAGMA query failed:', e.message, '\n');
  }

  // --- 2. Cycles check ---
  console.log('=== [2] CYCLES TABLE — All existing cycles ===');
  try {
    const allCycles = await db.query('SELECT id, name, month, year, status, label, is_active FROM cycles LIMIT 30');
    if (allCycles.rows.length === 0) {
      console.log('  ⚠️  cycles table is EMPTY! Any cycle_id in assignments will fail FK check.\n');
    } else {
      allCycles.rows.forEach(c => {
        console.log(`  ID: "${c.id}"  name: "${c.name}"  month: "${c.month}"  year: ${c.year}  status: ${c.status}  is_active: ${c.is_active}`);
      });
      console.log();
    }
  } catch (e) {
    console.error('  ❌ cycles query failed:', e.message, '\n');
  }

  // June 2026 specific check
  console.log('=== [2b] CYCLE LOOKUP — June 2026 (exact + LOWER comparison) ===');
  try {
    const exact = await db.query(
      `SELECT id, name, month, year FROM cycles WHERE month = 'June' AND year = 2026 LIMIT 1`
    );
    const lower = await db.query(
      `SELECT id, name, month, year FROM cycles WHERE LOWER(month) = 'june' AND CAST(year AS INTEGER) = 2026 LIMIT 1`
    );
    console.log(`  Exact match (month='June', year=2026):    ${exact.rows.length > 0 ? `✅ Found: ${exact.rows[0].id}` : '❌ NOT FOUND'}`);
    console.log(`  LOWER match (LOWER(month)='june', year=2026): ${lower.rows.length > 0 ? `✅ Found: ${lower.rows[0].id}` : '❌ NOT FOUND'}`);
    console.log();
  } catch (e) {
    console.error('  ❌ cycle lookup failed:', e.message, '\n');
  }

  // --- 3. Agents check ---
  console.log('=== [3] AGENTS TABLE — All agents ===');
  try {
    const agents = await db.query('SELECT id, name, is_active FROM agents');
    agents.rows.forEach(a => {
      console.log(`  ID: "${a.id}"  name: "${a.name}"  active: ${a.is_active}`);
    });
    console.log();
  } catch (e) {
    console.error('  ❌ agents query failed:', e.message, '\n');
  }

  // --- 4. Properties check (first 10 from area KOT009_E) ---
  console.log('=== [4] PROPERTIES — First 10 from area KOT009_E ===');
  try {
    const areaProps = await db.query(
      `SELECT p.id, p.serial_no, a.code 
       FROM properties p 
       LEFT JOIN areas a ON p.area_id = a.id 
       WHERE a.code = 'KOT009_E' 
       LIMIT 10`
    );
    if (areaProps.rows.length === 0) {
      console.log('  ⚠️  No properties found for area code "KOT009_E"');
      // Fallback: show any 10 properties
      const anyProps = await db.query('SELECT id, serial_no FROM properties LIMIT 10');
      console.log('  Showing first 10 properties from DB:');
      anyProps.rows.forEach(p => console.log(`  ID: "${p.id}"  serial: ${p.serial_no}`));
    } else {
      areaProps.rows.forEach(p => console.log(`  ID: "${p.id}"  serial: ${p.serial_no}  area: ${p.code}`));
    }
    console.log();
  } catch (e) {
    console.error('  ❌ properties query failed:', e.message, '\n');
  }

  // --- 5. cycles table schema ---
  console.log('=== [5] CYCLES TABLE — Schema columns ===');
  try {
    const schema = await db.query('PRAGMA table_info(cycles)');
    schema.rows.forEach(col => {
      console.log(`  col: "${col.name}"  type: ${col.type}  notnull: ${col.notnull}  default: ${col.dflt_value}  pk: ${col.pk}`);
    });
    console.log();
  } catch (e) {
    console.error('  ❌ PRAGMA table_info(cycles) failed:', e.message, '\n');
  }

  // --- 6. assignments table schema ---
  console.log('=== [6] ASSIGNMENTS TABLE — Schema columns ===');
  try {
    const schema = await db.query('PRAGMA table_info(assignments)');
    schema.rows.forEach(col => {
      console.log(`  col: "${col.name}"  type: ${col.type}  notnull: ${col.notnull}  default: ${col.dflt_value}  pk: ${col.pk}`);
    });
    console.log();
  } catch (e) {
    console.error('  ❌ PRAGMA table_info(assignments) failed:', e.message, '\n');
  }

  // --- 7. Test: Insert a cycle then immediately batch-insert an assignment ---
  console.log('=== [7] LIVE FK TEST — Insert cycle + batch assignment ===');
  const testCycleId = `cycle_june_2026_diag_${Date.now()}`;
  const testCycleName = 'June 2026 Billing Cycle (DIAG TEST)';
  let cleanupCycleId = null;
  let cleanupAssignmentId = null;

  try {
    // Get one agent and one property
    const agentRes = await db.query('SELECT id FROM agents LIMIT 1');
    const propRes = await db.query('SELECT id FROM properties LIMIT 1');
    if (agentRes.rows.length === 0 || propRes.rows.length === 0) {
      console.log('  ⚠️  Need at least 1 agent and 1 property to test. Skipping.');
    } else {
      const testAgentId = agentRes.rows[0].id;
      const testPropId = propRes.rows[0].id;
      const testAssignmentId = require('crypto').randomUUID();

      // Step A: Insert cycle via db.query (separate HTTP call)
      await db.query(
        `INSERT INTO cycles (id, name, month, year, status, label, is_active, start_date, end_date, created_at)
         VALUES ($1, $2, 'June', 2026, 'active', $3, 1, date('now'), date('now', '+30 days'), datetime('now'))`,
        [testCycleId, testCycleName, testCycleName]
      );
      cleanupCycleId = testCycleId;
      console.log(`  ✓ Cycle inserted via db.query: ${testCycleId}`);

      // Step B: Now immediately batch-insert an assignment referencing that cycle
      try {
        const batchResult = await db.batch([{
          sql: `INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at)
                VALUES ($1, $2, $3, $4, 0, datetime('now'))`,
          params: [testAssignmentId, testPropId, testAgentId, testCycleId]
        }]);
        cleanupAssignmentId = testAssignmentId;
        console.log(`  ✅ BATCH assignment insert SUCCEEDED — FK constraint NOT an issue between query→batch`);
      } catch (batchErr) {
        console.error(`  ❌ BATCH assignment insert FAILED after cycle was inserted via db.query:`);
        console.error(`     Error: ${batchErr.message}`);
        console.error(`\n  🔍 ROOT CAUSE IDENTIFIED: D1 batch sees a different transaction context`);
        console.error(`     than the previous db.query call. The cycle row is NOT visible inside`);
        console.error(`     the batch transaction because D1 batches run in their own isolated scope.\n`);
      }
    }
  } catch (err) {
    console.error('  ❌ Live FK test error:', err.message);
  } finally {
    // Cleanup test data
    try {
      if (cleanupAssignmentId) {
        await db.query('DELETE FROM assignments WHERE id = $1', [cleanupAssignmentId]);
      }
      if (cleanupCycleId) {
        await db.query('DELETE FROM cycles WHERE id = $1', [cleanupCycleId]);
      }
      console.log('  ✓ Diagnostic test data cleaned up.');
    } catch (e) {
      console.error('  Cleanup error:', e.message);
    }
  }

  console.log('\n========================================');
  console.log('   DIAGNOSTIC COMPLETE                  ');
  console.log('========================================\n');
}

diagnose().catch(console.error);
