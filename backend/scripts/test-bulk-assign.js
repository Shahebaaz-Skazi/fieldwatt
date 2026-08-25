/**
 * scripts/test-bulk-assign.js
 *
 * Verifies bulk assignment D1 batch execution with safe cycle resolution and upsert.
 */
require('dotenv').config();
const db = require('../src/utils/db');

async function run() {
  console.log('====================================================');
  console.log('         TESTING BULK WORKLOAD ASSIGNMENT           ');
  console.log('====================================================');

  try {
    // 1. Fetch an active agent
    const agentRes = await db.query('SELECT id, name FROM agents WHERE is_active = 1 LIMIT 1');
    if (agentRes.rows.length === 0) {
      throw new Error('No active agents found in database to run assignment test.');
    }
    const agent = agentRes.rows[0];
    console.log(`- Selected Agent: ${agent.name} (${agent.id})`);

    // 2. Fetch 5 properties
    const propsRes = await db.query('SELECT id, consumer_name, import_id FROM properties LIMIT 5');
    if (propsRes.rows.length < 5) {
      throw new Error('Need at least 5 properties in database to run bulk assignment test.');
    }
    const properties = propsRes.rows;
    console.log(`- Selected ${properties.length} properties.`);

    // 3. Resolve / create cycle matching 'June 2026'
    const billingMonth = 'June 2026';
    let targetCycleId = null;
    
    console.log(`- Resolving Billing Cycle: "${billingMonth}"`);
    const cycleCheck = await db.query('SELECT id FROM cycles WHERE label = $1 LIMIT 1', [billingMonth]);
    if (cycleCheck.rows.length > 0) {
      targetCycleId = cycleCheck.rows[0].id;
      console.log(`  Found existing Cycle ID: ${targetCycleId}`);
    } else {
      const newUuid = require('crypto').randomUUID();
      await db.query(
        `INSERT INTO cycles (id, label, is_active, start_date, end_date)
         VALUES ($1, $2, 1, date('now'), date('now', '+30 days'))`,
        [newUuid, billingMonth]
      );
      targetCycleId = newUuid;
      console.log(`  Created dynamic Cycle ID: ${targetCycleId}`);
    }

    // 4. Run D1 batch assignment insert with ON CONFLICT DO UPDATE
    console.log('- Preparing batch assignment statements...');
    const adminId = '60529973-4ca8-4a4b-9de8-3246b5a5e941'; // default admin
    const statements = properties.map(p => ({
      sql: `
        INSERT INTO assignments (agent_id, property_id, cycle_id, assigned_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (property_id, cycle_id) 
        DO UPDATE SET agent_id = EXCLUDED.agent_id, assigned_by = EXCLUDED.assigned_by
        RETURNING id
      `,
      params: [agent.id, p.id, targetCycleId, adminId]
    }));

    console.log('- Executing D1 batch request...');
    const batchRes = await db.batch(statements);
    const totalCount = batchRes.reduce((sum, res) => sum + res.rowCount, 0);
    console.log(`✅ Success: Assigned ${totalCount} properties successfully.`);

    // 5. Cleanup
    console.log('- Cleaning up test assignment rows...');
    const propIds = properties.map(p => p.id);
    const placeholders = propIds.map((_, idx) => `$${idx + 2}`).join(', ');
    await db.query(
      `DELETE FROM assignments WHERE cycle_id = $1 AND property_id IN (${placeholders})`,
      [targetCycleId, ...propIds]
    );
    console.log('✅ Cleanup completed.');

  } catch (err) {
    console.error('❌ TEST ERROR:', err.message, err.stack);
  }
}

run();
