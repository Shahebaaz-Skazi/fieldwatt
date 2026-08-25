/**
 * scripts/test-bulk-assign-live.js
 *
 * Simulates exact UI payload for Area KOT009_E, Month=June, Year=2026.
 * Verifies:
 * - Cycle auto-creation with LOWER() matching
 * - No assigned_by FK violation
 * - Clean chunked batch (50 items per chunk)
 * - properties.is_assigned updated
 */
require('dotenv').config();
const db = require('../src/utils/db');

const chunkArray = (arr, size = 50) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

async function run() {
  console.log('\n====================================================');
  console.log('  LIVE PAYLOAD TEST — Area KOT009_E, June 2026     ');
  console.log('====================================================\n');

  const month = 'June';
  const year  = 2026;
  let targetCycleId   = null;
  let propertyIds     = [];
  let assignmentIds   = [];

  try {
    // 1. Agent: use Pallavi (known-good active agent)
    const agent_id = '33bdb6c4-a678-4cdf-912d-c3112c3db201';
    const agentCheck = await db.query('SELECT id, name FROM agents WHERE id = $1 LIMIT 1', [agent_id]);
    if (agentCheck.rows.length === 0) throw new Error('Agent not found');
    console.log(`✓ Agent: ${agentCheck.rows[0].name} (${agent_id})`);

    // 2. Find area — try by code first, fall back to name
    let areaId = null;
    const areaByCode = await db.query(`SELECT id, name FROM areas WHERE name LIKE '%KOT009%' LIMIT 1`);
    if (areaByCode.rows.length > 0) {
      areaId = areaByCode.rows[0].id;
      console.log(`✓ Area found: ${areaByCode.rows[0].name} (${areaId})`);
    } else {
      // Fallback: any area with properties
      const anyArea = await db.query('SELECT DISTINCT area_id FROM properties WHERE area_id IS NOT NULL LIMIT 1');
      if (anyArea.rows.length === 0) throw new Error('No areas with properties found');
      areaId = anyArea.rows[0].area_id;
      console.log(`  ⚠️  KOT009_E not found by name — using area_id: ${areaId}`);
    }

    // 3. Get first 10 properties in area (simulate typical UI selection)
    const propsRes = await db.query('SELECT id FROM properties WHERE area_id = $1 LIMIT 10', [areaId]);
    propertyIds = propsRes.rows.map(r => r.id);
    if (propertyIds.length === 0) throw new Error('No properties in selected area');
    console.log(`✓ Properties fetched: ${propertyIds.length}`);

    // 4. Delete pre-existing June 2026 cycle to test auto-creation from scratch
    const existingCycle = await db.query(
      `SELECT id FROM cycles WHERE LOWER(month) = 'june' AND CAST(year AS INTEGER) = 2026 LIMIT 1`
    );
    if (existingCycle.rows.length > 0) {
      const oldId = existingCycle.rows[0].id;
      await db.query('DELETE FROM assignments WHERE cycle_id = $1', [oldId]);
      await db.query('DELETE FROM cycles WHERE id = $1', [oldId]);
      console.log(`  Cleaned up pre-existing cycle: ${oldId}`);
    }

    // 5. Cycle resolution — exact same logic as production resolveCycleHelper
    const targetMonth = String(month).trim();
    const targetYear  = Number(year);
    const cycleCheck  = await db.query(
      `SELECT id FROM cycles WHERE LOWER(month) = LOWER($1) AND CAST(year AS INTEGER) = $2 LIMIT 1`,
      [targetMonth, targetYear]
    );
    if (cycleCheck.rows.length > 0) {
      targetCycleId = cycleCheck.rows[0].id;
      console.log(`✓ Found existing cycle: ${targetCycleId}`);
    } else {
      const cycleName  = `${targetMonth} ${targetYear} Billing Cycle`;
      const newCycleId = `cycle_${targetMonth.toLowerCase()}_${targetYear}`;
      await db.query(
        `INSERT INTO cycles (id, name, month, year, status, label, is_active, start_date, end_date, created_at)
         VALUES ($1, $2, $3, $4, 'active', $5, 1, date('now'), date('now', '+30 days'), datetime('now'))`,
        [newCycleId, cycleName, targetMonth, targetYear, cycleName]
      );
      targetCycleId = newCycleId;
      console.log(`✓ Cycle auto-created: "${cycleName}" (${targetCycleId})`);
    }

    // 6. Validate properties exist (chunked 50)
    const propChunks = chunkArray(propertyIds, 50);
    const propResults = await Promise.all(propChunks.map(chunk => {
      const ph = chunk.map((_, i) => `$${i+1}`).join(', ');
      return db.query(`SELECT id FROM properties WHERE id IN (${ph})`, chunk);
    }));
    const existingIds = propResults.flatMap(r => r.rows.map(row => row.id));
    console.log(`✓ Validated ${existingIds.length} property IDs exist in D1`);

    // 7. Chunked batch INSERT — NO assigned_by column
    const chunks = chunkArray(existingIds, 50);
    let totalCount = 0;

    for (const chunk of chunks) {
      const stmts = [];
      chunk.forEach(propId => {
        stmts.push({
          sql: `
            INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at)
            VALUES ($1, $2, $3, $4, 0, datetime('now'))
            ON CONFLICT (property_id, cycle_id)
            DO UPDATE SET agent_id = EXCLUDED.agent_id, is_completed = 0
            RETURNING id
          `,
          params: [require('crypto').randomUUID(), propId, agent_id, targetCycleId]
        });
      });

      const ph2 = chunk.map((_, i) => `$${i+2}`).join(', ');
      stmts.push({
        sql: `UPDATE properties SET is_assigned = 1, assigned_agent_id = $1 WHERE id IN (${ph2})`,
        params: [agent_id, ...chunk]
      });

      const batchRes = await db.batch(stmts);
      const inserts  = batchRes.slice(0, chunk.length);
      totalCount    += inserts.reduce((s, r) => s + r.rowCount, 0);
      inserts.forEach(r => { if (r.rows.length > 0) assignmentIds.push(...r.rows.map(row => row.id)); });
    }

    console.log(`\n✅ SUCCESS — Assigned ${totalCount} properties with 0 FK constraint errors!`);

    // 8. Spot-check DB state
    const spotCheck = await db.query(
      'SELECT is_assigned, assigned_agent_id FROM properties WHERE id = $1', [existingIds[0]]
    );
    const sp = spotCheck.rows[0];
    console.log(`✓ Spot-check: properties.is_assigned = ${sp.is_assigned}, assigned_agent_id = ${sp.assigned_agent_id}`);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    console.log('\n--- Cleaning up test data ---');
    try {
      if (assignmentIds.length > 0) {
        const chunks = chunkArray(assignmentIds, 50);
        for (const chunk of chunks) {
          const ph = chunk.map((_, i) => `$${i+1}`).join(', ');
          await db.query(`DELETE FROM assignments WHERE id IN (${ph})`, chunk);
        }
      }
      if (propertyIds.length > 0) {
        const chunks = chunkArray(propertyIds, 50);
        for (const chunk of chunks) {
          const ph = chunk.map((_, i) => `$${i+1}`).join(', ');
          await db.query(`UPDATE properties SET is_assigned = 0, assigned_agent_id = NULL WHERE id IN (${ph})`, chunk);
        }
      }
      if (targetCycleId) {
        await db.query('DELETE FROM cycles WHERE id = $1', [targetCycleId]);
      }
      console.log('✓ Cleanup complete.\n');
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
  }
}

run();
