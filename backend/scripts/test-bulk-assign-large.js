/**
 * scripts/test-bulk-assign-large.js
 *
 * E2E integration test: assigns 450 properties to an agent in a single bulk operation
 * to verify D1 SQL parameter limit chunking.
 */
require('dotenv').config();
const db = require('../src/utils/db');

const chunkArray = (array, size = 80) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

async function run() {
  console.log('====================================================');
  console.log('    TESTING LARGE BULK WORKLOAD ASSIGNMENT CHUNKING  ');
  console.log('====================================================');

  let testAssignmentIds = [];
  const targetCycleId = 'b50b81c7-201f-4fcc-ada7-9d5d2c5790cf'; // active cycle ID

  try {
    // 1. Fetch an active agent
    const agentRes = await db.query('SELECT id, name FROM agents WHERE is_active = 1 LIMIT 1');
    if (agentRes.rows.length === 0) {
      throw new Error('No active agents found in database to run assignment test.');
    }
    const agent = agentRes.rows[0];
    console.log(`- Selected Agent: ${agent.name} (${agent.id})`);

    // 2. Fetch 450 property IDs from properties table
    console.log('- Fetching 450 property IDs from D1...');
    const propsRes = await db.query('SELECT id FROM properties LIMIT 450');
    const propertyIds = propsRes.rows.map(r => r.id);
    console.log(`- Retrieved ${propertyIds.length} property IDs.`);
    if (propertyIds.length < 450) {
      throw new Error(`Insufficient properties found. Need 450, found ${propertyIds.length}.`);
    }

    // 3. Filter properties that actually exist (simulating /bulk router chunking logic)
    console.log('- Verifying existing properties in D1 via chunked queries...');
    const propertyChunks = chunkArray(propertyIds, 80);
    const propertyQueries = propertyChunks.map(chunk => {
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      return db.query(`SELECT id FROM properties WHERE id IN (${placeholders})`, chunk);
    });
    
    const propertyQueryResults = await Promise.all(propertyQueries);
    const existingPropIds = propertyQueryResults.flatMap(r => r.rows.map(row => row.id));
    console.log(`- Successfully verified ${existingPropIds.length} existing properties.`);

    // 4. Build batch statement for SQLite upsert
    console.log('- Building batch statements for chunked D1 batch execution...');
    const adminId = '60529973-4ca8-4a4b-9de8-3246b5a5e941'; // default admin
    const statements = existingPropIds.map(propId => ({
      sql: `
        INSERT INTO assignments (agent_id, property_id, cycle_id, assigned_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (property_id, cycle_id) 
        DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_by = EXCLUDED.assigned_by
        RETURNING id
      `,
      params: [agent.id, propId, targetCycleId, adminId]
    }));

    // Chunk the D1 batch statements to avoid total parameter/statement limits in batch transactions
    const statementChunks = chunkArray(statements, 80);
    let totalCount = 0;
    
    console.log(`- Executing batch insertions in ${statementChunks.length} chunks of 80 statements...`);
    for (let i = 0; i < statementChunks.length; i++) {
      const chunk = statementChunks[i];
      const batchRes = await db.batch(chunk);
      totalCount += batchRes.reduce((sum, res) => sum + res.rowCount, 0);
      
      // Save created assignment IDs to cleanup list
      batchRes.forEach(r => {
        if (r.rows && r.rows.length > 0) {
          testAssignmentIds.push(...r.rows.map(row => row.id));
        }
      });
    }

    console.log(`✅ SUCCESS: Assigned ${totalCount} properties successfully in chunked batches.`);

  } catch (err) {
    console.error('❌ TEST ERROR:', err.message, err.stack);
  } finally {
    // 5. Cleanup the assignments created during E2E test
    if (testAssignmentIds.length > 0) {
      console.log(`- Cleaning up ${testAssignmentIds.length} temporary assignments...`);
      const assignmentChunks = chunkArray(testAssignmentIds, 80);
      for (const chunk of assignmentChunks) {
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        await db.query(`DELETE FROM assignments WHERE id IN (${placeholders})`, chunk);
      }
      console.log('✅ Cleanup completed.');
    }
  }
}

run();
