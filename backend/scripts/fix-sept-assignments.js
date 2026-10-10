/**
 * fix-sept-assignments.js
 * 
 * This script:
 * 1. Deactivates the June 2026 cycle (stops dashboard from showing June data)
 * 2. Finds all September 2026 properties that have no assignment yet
 * 3. Assigns them to agents using the same area->agent mapping from June 2026
 * 4. Agents that had specific areas in June get the same areas in September
 * 
 * SAFE: Only inserts missing assignments. Does not touch existing ones or readings.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEPT_CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e';
const JUNE_CYCLE_ID = 'b50b81c7-201f-4fcc-ada7-9d5d2c5790cf';
const SEPT_IMPORT_ID = '4bb43110-fae1-428e-9700-16f5eb646d8c';

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== FieldWatt September Assignment Fix ===\n');

    // Step 1: Deactivate June 2026
    console.log('Step 1: Deactivating June 2026 cycle...');
    await client.query(`UPDATE cycles SET is_active = false WHERE id = $1`, [JUNE_CYCLE_ID]);
    console.log('✅ June 2026 deactivated.\n');

    // Step 2: Build area -> agent mapping from June
    console.log('Step 2: Building area→agent mapping from June 2026...');
    const juneMapping = await client.query(`
      SELECT DISTINCT asgn.agent_id, p.area_id
      FROM assignments asgn
      INNER JOIN properties p ON p.id = asgn.property_id
      WHERE asgn.cycle_id = $1
        AND p.area_id IS NOT NULL
    `, [JUNE_CYCLE_ID]);

    // Build map: area_id -> agent_id (first agent assigned to that area in June)
    const areaToAgent = {};
    for (const row of juneMapping.rows) {
      if (!areaToAgent[row.area_id]) {
        areaToAgent[row.area_id] = row.agent_id;
      }
    }
    console.log(`✅ Found ${Object.keys(areaToAgent).length} area→agent mappings from June.\n`);

    // Step 3: Find all unassigned September properties
    console.log('Step 3: Finding unassigned September 2026 properties...');
    const unassigned = await client.query(`
      SELECT p.id as property_id, p.area_id
      FROM properties p
      WHERE p.import_id = $1
        AND p.id NOT IN (
          SELECT property_id FROM assignments WHERE cycle_id = $2
        )
    `, [SEPT_IMPORT_ID, SEPT_CYCLE_ID]);

    console.log(`✅ Found ${unassigned.rows.length} unassigned properties.\n`);

    // Step 4: Group properties by area
    const byArea = {};
    let noAreaCount = 0;
    for (const row of unassigned.rows) {
      if (!row.area_id) { noAreaCount++; continue; }
      if (!byArea[row.area_id]) byArea[row.area_id] = [];
      byArea[row.area_id].push(row.property_id);
    }
    
    console.log(`Properties grouped by area: ${Object.keys(byArea).length} areas`);
    console.log(`Properties with no area: ${noAreaCount} (will be skipped)\n`);

    // Step 5: Insert assignments in batches of 500
    const BATCH = 500;
    let totalInserted = 0;
    let skippedAreas = [];

    for (const [areaId, propIds] of Object.entries(byArea)) {
      const agentId = areaToAgent[areaId];
      if (!agentId) {
        skippedAreas.push(areaId);
        continue;
      }

      for (let i = 0; i < propIds.length; i += BATCH) {
        const chunk = propIds.slice(i, i + BATCH);
        const values = chunk.map((pid, idx) => 
          `('${SEPT_CYCLE_ID}', '${agentId}', '${pid}', 'PENDING')`
        ).join(',\n');

        await client.query(`
          INSERT INTO assignments (cycle_id, agent_id, property_id, task_status)
          VALUES ${values}
          ON CONFLICT DO NOTHING
        `);
        totalInserted += chunk.length;
        process.stdout.write(`\rInserted: ${totalInserted}/${unassigned.rows.length}`);
      }
    }

    console.log(`\n\n✅ Done! Inserted ${totalInserted} new assignments.`);
    
    if (skippedAreas.length > 0) {
      console.log(`\n⚠️  Skipped ${skippedAreas.length} areas (no agent had these in June):`);
      console.log(skippedAreas.join(', '));
    }

    // Step 6: Verify final counts
    console.log('\nStep 6: Verifying final counts...');
    const verify = await client.query(`
      SELECT ag.name, COUNT(asgn.id) as total_sept
      FROM agents ag
      LEFT JOIN assignments asgn ON asgn.agent_id = ag.id AND asgn.cycle_id = $1
      GROUP BY ag.id, ag.name
      ORDER BY total_sept DESC
    `, [SEPT_CYCLE_ID]);

    console.log('\nFinal September 2026 assignment counts:');
    console.log('─'.repeat(40));
    for (const row of verify.rows) {
      if (Number(row.total_sept) > 0) {
        console.log(`  ${row.name.padEnd(25)} ${row.total_sept}`);
      }
    }

    console.log('\n✅ All done! Dashboard will now show September data correctly.');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
