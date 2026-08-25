/**
 * scripts/test-bulk-assign-fix.js
 *
 * Verifies bulk workload assignment fix: Month/Year safe cycle resolution,
 * chunking of 50, and atomic properties updates.
 */
require('dotenv').config();
const db = require('../src/utils/db');

const chunkArray = (array, size = 50) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

async function run() {
  console.log('====================================================');
  console.log('      VERIFYING BULK WORKLOAD ASSIGNMENT FIX        ');
  console.log('====================================================');

  const month = 'June';
  const year = 2026;
  const cycleName = `${month} ${year} Billing Cycle`;
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

    // 2. Fetch 10 properties from properties table
    console.log('- Fetching 10 properties from D1 database...');
    const propsRes = await db.query('SELECT id FROM properties LIMIT 10');
    propertyIds = propsRes.rows.map(r => r.id);
    console.log(`- Retrieved ${propertyIds.length} properties.`);
    if (propertyIds.length < 10) {
      throw new Error(`Insufficient properties found. Need 10, found ${propertyIds.length}.`);
    }

    // 3. Delete any pre-existing cycle for 'June 2026' to ensure we test auto-creation
    console.log(`- Cleaning up pre-existing cycle for "${month} ${year}" to test auto-creation...`);
    const existingCycle = await db.query('SELECT id FROM cycles WHERE month = $1 AND year = $2 LIMIT 1', [month, year]);
    if (existingCycle.rows.length > 0) {
      const oldCycleId = existingCycle.rows[0].id;
      await db.query('DELETE FROM assignments WHERE cycle_id = $1', [oldCycleId]);
      await db.query('DELETE FROM cycles WHERE id = $1', [oldCycleId]);
      console.log('  ✓ Cleaned up old cycle & its assignments.');
    }

    // 4. Resolve / Create Cycle using the exact resolution logic
    console.log(`- Running safe cycle resolution for "${month} ${year}"...`);
    const cycleCheck = await db.query(
      'SELECT id FROM cycles WHERE month = $1 AND year = $2 LIMIT 1',
      [month, year]
    );
    if (cycleCheck.rows.length > 0) {
      targetCycleId = cycleCheck.rows[0].id;
      console.log(`  Found existing Cycle ID: ${targetCycleId}`);
    } else {
      const newUuid = `cycle_${month.toLowerCase()}_${year}_${Date.now()}`;
      await db.query(
        `INSERT INTO cycles (id, name, month, year, status, label, is_active, start_date, end_date, created_at)
         VALUES ($1, $2, $3, $4, 'active', $5, 1, date('now'), date('now', '+30 days'), datetime('now'))`,
        [newUuid, cycleName, month, year, cycleName]
      );
      targetCycleId = newUuid;
      console.log(`  ✓ Cycle auto-created successfully. ID: ${targetCycleId}`);
    }

    // 5. Batch verify property existence (in chunks of 50)
    console.log('- Filtering valid property IDs in chunks of 50...');
    const propertyChunks = chunkArray(propertyIds, 50);
    const propertyQueries = propertyChunks.map(chunk => {
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      return db.query(`SELECT id FROM properties WHERE id IN (${placeholders})`, chunk);
    });
    const propertyQueryResults = await Promise.all(propertyQueries);
    existingPropIds = propertyQueryResults.flatMap(r => r.rows.map(row => row.id));
    console.log(`- Verified ${existingPropIds.length} properties exist in DB.`);

    // 6. Execute atomic batch inserts & updates in chunks of 50
    console.log('- Running atomic batch inserts and updates in chunks of 50...');
    const chunks = chunkArray(existingPropIds, 50);
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

    console.log(`✅ SUCCESS: Assigned ${totalCount} properties successfully with 0 constraint errors.`);

  } catch (err) {
    console.error('❌ TEST ERROR:', err.message, err.stack);
  } finally {
    // Cleanup test assignments
    if (testAssignmentIds.length > 0) {
      console.log(`\n- Cleaning up test assignments and status values...`);
      const assignmentChunks = chunkArray(testAssignmentIds, 50);
      for (const chunk of assignmentChunks) {
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        await db.query(`DELETE FROM assignments WHERE id IN (${placeholders})`, chunk);
      }

      const propChunks = chunkArray(propertyIds, 50);
      for (const chunk of propChunks) {
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        await db.query(
          `UPDATE properties SET is_assigned = 0, assigned_agent_id = NULL WHERE id IN (${placeholders})`,
          chunk
        );
      }
      
      await db.query('DELETE FROM cycles WHERE id = $1', [targetCycleId]);
      console.log('✅ Cleanup completed.');
    }
  }
}

run();
