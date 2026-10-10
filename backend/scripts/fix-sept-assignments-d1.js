/**
 * fix-sept-assignments-d1.js
 * 
 * Runs against Cloudflare D1 directly via REST API.
 * 1. Deactivates June 2026 cycle
 * 2. Assigns 10,426 unassigned September properties to agents using June's area->agent mapping
 */

require('dotenv').config();
const https = require('https');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const SEPT_CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e';
const JUNE_CYCLE_ID = 'b50b81c7-201f-4fcc-ada7-9d5d2c5790cf';
const SEPT_IMPORT_ID = '4bb43110-fae1-428e-9700-16f5eb646d8c';

async function d1Query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sql, params });
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.success) {
            return reject(new Error(JSON.stringify(parsed.errors)));
          }
          resolve(parsed.result[0].results);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// D1 REST API has a 100KB body limit per request
// Use batch inserts with small chunks
async function d1Execute(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify([{ sql }]);
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/export`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    // Use query endpoint instead
    d1Query(sql).then(resolve).catch(reject);
  });
}

async function main() {
  console.log('=== FieldWatt September Assignment Fix (D1) ===\n');

  if (!ACCOUNT_ID || !DB_ID || !API_TOKEN) {
    throw new Error('Missing Cloudflare env vars. Check .env file.');
  }

  // Step 1: Deactivate June 2026
  console.log('Step 1: Deactivating June 2026 cycle...');
  await d1Query(`UPDATE cycles SET is_active = 0 WHERE id = '${JUNE_CYCLE_ID}'`);
  console.log('✅ June 2026 deactivated.\n');

  // Step 2: Get area→agent mapping from June
  console.log('Step 2: Getting area→agent mapping from June 2026...');
  const juneRows = await d1Query(`
    SELECT DISTINCT asgn.agent_id, p.area_id
    FROM assignments asgn
    INNER JOIN properties p ON p.id = asgn.property_id
    WHERE asgn.cycle_id = '${JUNE_CYCLE_ID}'
      AND p.area_id IS NOT NULL
  `);

  const areaToAgent = {};
  for (const row of juneRows) {
    if (!areaToAgent[row.area_id]) {
      areaToAgent[row.area_id] = row.agent_id;
    }
  }
  console.log(`✅ Found ${Object.keys(areaToAgent).length} area→agent mappings.\n`);
  console.log('Mapping:', JSON.stringify(areaToAgent, null, 2));

  // Step 3: Get unassigned September properties
  console.log('\nStep 3: Getting unassigned September properties...');
  const unassigned = await d1Query(`
    SELECT p.id as property_id, p.area_id
    FROM properties p
    WHERE p.import_id = '${SEPT_IMPORT_ID}'
      AND p.id NOT IN (
        SELECT property_id FROM assignments WHERE cycle_id = '${SEPT_CYCLE_ID}'
      )
    LIMIT 5000
  `);
  console.log(`✅ Found ${unassigned.length} unassigned properties (batch 1 of max 5000).\n`);

  // Group by area
  const byArea = {};
  for (const row of unassigned) {
    if (!row.area_id) continue;
    if (!byArea[row.area_id]) byArea[row.area_id] = [];
    byArea[row.area_id].push(row.property_id);
  }

  // Step 4: Insert in batches of 50 (D1 REST has small limits)
  const BATCH = 50;
  let totalInserted = 0;
  let skipped = [];

  for (const [areaId, propIds] of Object.entries(byArea)) {
    const agentId = areaToAgent[areaId];
    if (!agentId) {
      skipped.push(areaId);
      continue;
    }

    for (let i = 0; i < propIds.length; i += BATCH) {
      const chunk = propIds.slice(i, i + BATCH);
      const { randomUUID } = require('crypto');
      const values = chunk.map(pid => 
        `('${randomUUID()}', '${agentId}', '${pid}', '${SEPT_CYCLE_ID}', 0, datetime('now'))`
      ).join(', ');

      await d1Query(`
        INSERT OR IGNORE INTO assignments (id, agent_id, property_id, cycle_id, is_completed, assigned_at)
        VALUES ${values}
      `);
      totalInserted += chunk.length;
      process.stdout.write(`\rInserted: ${totalInserted}`);
    }
  }

  console.log(`\n\n✅ Batch 1 done. Inserted ${totalInserted} assignments.`);

  if (skipped.length > 0) {
    console.log(`\n⚠️  Areas with no June agent mapping (will need manual assignment):`);
    console.log(skipped.join(', '));
  }

  // Verify
  console.log('\nVerifying final September counts...');
  const verify = await d1Query(`
    SELECT ag.name, COUNT(asgn.id) as total
    FROM agents ag
    LEFT JOIN assignments asgn ON asgn.agent_id = ag.id AND asgn.cycle_id = '${SEPT_CYCLE_ID}'
    GROUP BY ag.id, ag.name
    ORDER BY total DESC
  `);

  console.log('\nFinal September 2026 counts:');
  console.log('─'.repeat(40));
  for (const row of verify) {
    if (Number(row.total) > 0) {
      console.log(`  ${String(row.name).padEnd(25)} ${row.total}`);
    }
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
