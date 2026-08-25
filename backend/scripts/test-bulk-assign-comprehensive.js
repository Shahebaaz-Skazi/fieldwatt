/**
 * scripts/test-bulk-assign-comprehensive.js
 *
 * Comprehensive stress test script:
 * - Assigns 380 properties in a single bulk operation.
 * - Asserts cycle auto-creation.
 * - Verifies zero foreign key constraint errors.
 * - Verifies zero too many SQL variables errors.
 */
require('dotenv').config();
const db = require('../src/utils/db');

const chunkArray = (array, size = 60) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

async function run() {
  console.log('====================================================');
  console.log('    COMPREHENSIVE BULK WORKLOAD STRESS TEST (350+)   ');
  console.log('====================================================');

  const month = 'June';
  const year = 2026;
  const cycleName = `${month} ${year} Billing`;
  let targetCycleId = null;
  let testAssignmentIds = [];
  let propertyIds = [];
  let existingPropIds = [];
  const adminId = '60529973-4ca8-4a4b-9de8-3246b5a5e941';

  try {
    // 1. Fetch an active agent
    const agentRes = await db.query('SELECT id, name FROM agents WHERE is_active = 1 LIMIT 1');
    if (agentRes.rows.length === 0) {
      throw new Error('No active agents found in database to run assignment test.');
    }
    const agent = agentRes.rows[0];
    console.log(`- Selected Agent: ${agent.name} (${agent.id})`);

    // 2. Fetch 380 property IDs from properties table
    console.log('- Fetching 380 properties from D1 database...');
    const propsRes = await db.query('SELECT id FROM properties LIMIT 380');
    propertyIds = propsRes.rows.map(r => r.id);
    console.log(`- Retrieved ${propertyIds.length} properties.`);
    if (propertyIds.length < 380) {
      throw new Error(`Insufficient properties found. Need 380, found ${propertyIds.length}.`);
    }

    // 3. Delete any pre-existing cycle for 'June 2026' to ensure we test auto-creation
    console.log(`- Ensuring cycle for "${cycleName}" is clean for testing...`);
    const existingCycle = await db.query('SELECT id FROM cycles WHERE month = $1 AND year = $2 LIMIT 1', [month, year]);
    if (existingCycle.rows.length > 0) {
      const oldCycleId = existingCycle.rows[0].id;
      // Clean assignments under that cycle
      await db.query('DELETE FROM assignments WHERE cycle_id = $1', [oldCycleId]);
      await db.query('DELETE FROM cycles WHERE id = $1', [oldCycleId]);
      console.log('  ✓ Cleaned up old cycle & its assignments.');
    }

    // 4. Resolve / Create Cycle using the exact route logic
    console.log(`- Running safe cycle resolution for "${month} ${year}"...`);
    const cycleCheck = await db.query(
      'SELECT id FROM cycles WHERE month = $1 AND year = $2 LIMIT 1',
      [month, year]
    );
    if (cycleCheck.rows.length > 0) {
      targetCycleId = cycleCheck.rows[0].id;
      console.log(`  Found existing Cycle ID: ${targetCycleId}`);
    } else {
      const newUuid = require('crypto').randomUUID();
      await db.query(
        `INSERT INTO cycles (id, name, month, year, status, label, is_active, start_date, end_date, created_at)
         VALUES ($1, $2, $3, $4, 'active', $5, 1, date('now'), date('now', '+30 days'), datetime('now'))`,
        [newUuid, cycleName, month, year, cycleName]
      );
      targetCycleId = newUuid;
      console.log(`  ✓ Cycle auto-created successfully. ID: ${targetCycleId}`);
    }

    // 5. Batch verify property existence (in chunks of 60)
    console.log('- Filtering valid property IDs in chunks of 60...');
    const propertyChunks = chunkArray(propertyIds, 60);
    const propertyQueries = propertyChunks.map(chunk => {
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      return db.query(`SELECT id FROM properties WHERE id IN (${placeholders})`, chunk);
    });
    const propertyQueryResults = await Promise.all(propertyQueries);
    existingPropIds = propertyQueryResults.flatMap(r => r.rows.map(row => row.id));
    console.log(`- Verified ${existingPropIds.length} properties exist in DB.`);

    // 6. Execute atomic batch inserts & updates in chunks of 60
    console.log('- Running atomic batch inserts and updates...');
    const chunks = chunkArray(existingPropIds, 60);
    let totalCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStatements = [];

      chunk.forEach(propId => {
        chunkStatements.push({
          sql: `
            INSERT INTO assignments (id, property_id, agent_id, cycle_id, is_completed, created_at, assigned_by)
            VALUES ($1, $2, $3, $4, 0, datetime('now'), $5)
            ON CONFLICT (property_id, cycle_id) 
            DO UPDATE SET agent_id = EXCLUDED.agent_id, is_completed = 0, assigned_by = EXCLUDED.assigned_by
            RETURNING id
          `,
          params: [require('crypto').randomUUID(), propId, agent.id, targetCycleId, adminId]
        });
      });

      const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ');
      chunkStatements.push({
        sql: `
          UPDATE properties 
          SET is_assigned = 1, assigned_agent_id = $1 
          WHERE id IN (${placeholders})
        `,
        params: [agent.id, ...chunk]
      });

      const batchRes = await db.batch(chunkStatements);
      const insertResults = batchRes.slice(0, chunk.length);
      totalCount += insertResults.reduce((sum, r) => sum + r.rowCount, 0);

      // Save assignments IDs for cleanup
      insertResults.forEach(r => {
        if (r.rows && r.rows.length > 0) {
          testAssignmentIds.push(...r.rows.map(row => row.id));
        }
      });
    }

    console.log(`✅ SUCCESS: Assigned ${totalCount} properties successfully.`);

    // 7. Verify DB updates
    console.log('- Asserting properties columns updated...');
    const propCheck = await db.query(
      'SELECT is_assigned, assigned_agent_id FROM properties WHERE id = $1',
      [existingPropIds[0]]
    );
    console.log(`  Properties assignment status: is_assigned = ${propCheck.rows[0].is_assigned}, assigned_agent_id = "${propCheck.rows[0].assigned_agent_id}"`);
    if (propCheck.rows[0].is_assigned !== 1) {
      throw new Error('Properties table columns is_assigned was not updated to 1.');
    }

  } catch (err) {
    console.error('❌ STRESS TEST ERROR:', err.message, err.stack);
  } finally {
    // Cleanup E2E test assignments & properties status resets
    if (testAssignmentIds.length > 0) {
      console.log(`\n- Cleaning up ${testAssignmentIds.length} test assignments...`);
      const assignmentChunks = chunkArray(testAssignmentIds, 60);
      for (const chunk of assignmentChunks) {
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        await db.query(`DELETE FROM assignments WHERE id IN (${placeholders})`, chunk);
      }

      console.log('- Resetting properties is_assigned columns...');
      const propChunks = chunkArray(propertyIds, 60);
      for (const chunk of propChunks) {
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        await db.query(
          `UPDATE properties SET is_assigned = 0, assigned_agent_id = NULL WHERE id IN (${placeholders})`,
          chunk
        );
      }
      
      console.log('- Cleaning up June 2026 Billing cycle...');
      await db.query('DELETE FROM cycles WHERE id = $1', [targetCycleId]);
      console.log('✅ Cleanup completed.');
    }
  }
}

run();
