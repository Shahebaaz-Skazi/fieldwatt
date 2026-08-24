const db = require('../src/db');

async function run() {
  console.log('====================================================');
  console.log('          CLIENT ENDPOINTS COMPATIBILITY CHECK       ');
  console.log('====================================================');

  try {
    // 1. Agent Login Query Compatibility Check
    console.log('1. Testing Agent Login Query...');
    const agentRes = await db.query(
      'SELECT * FROM agents WHERE (UPPER(username) = $1 OR UPPER(name) = $1 OR phone = $1) AND is_active = 1',
      ['9876543210']
    );
    const agent = agentRes.rows[0];
    console.log(`  ✔ Found agent: ${agent ? agent.name : 'None'} (${agentRes.rows.length} rows)`);
    if (!agent) {
      console.error('❌ ERROR: Seeded agent "9876543210" was not found in agents table!');
      process.exit(1);
    }
    const agentId = agent.id;

    // 2. Agent Assignments Query Check
    console.log('\n2. Testing Agent Assignments Query...');
    const cycleRes = await db.query("SELECT id FROM cycles WHERE is_active = 1 LIMIT 1");
    const cycleId = cycleRes.rows[0]?.id;
    if (!cycleId) {
      console.error('❌ ERROR: No active cycle found!');
      process.exit(1);
    }

    const assignmentsRes = await db.query(`
      SELECT 
        asg.id as assignment_id,
        p.id as property_id,
        p.serial_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.society,
        ar.name as area_name
      FROM assignments asg
      INNER JOIN properties p ON asg.property_id = p.id
      LEFT JOIN areas ar ON ar.id = p.area_id
      WHERE asg.agent_id = $1 AND asg.cycle_id = $2
    `, [agentId, cycleId]);
    console.log(`  ✔ Found ${assignmentsRes.rows.length} assignments for agent`);

    // 3. Customer Token Lookup Query Check
    console.log('\n3. Testing Customer Token Lookup Query...');
    const propRes = await db.query("SELECT id FROM properties LIMIT 1");
    const propertyId = propRes.rows[0]?.id;
    if (!propertyId) {
      console.error('❌ ERROR: No properties found!');
      process.exit(1);
    }

    const selfReadRes = await db.query(
      `SELECT p.id as property_id, p.consumer_name, p.address, p.meter_no, p.serial_no as bp_no, p.society, a.name as area_name
       FROM properties p
       LEFT JOIN areas a ON a.id = p.area_id
       WHERE p.id = $1`,
      [propertyId]
    );
    console.log(`  ✔ Property resolved: ${selfReadRes.rows[0]?.consumer_name} (ID: ${selfReadRes.rows[0]?.property_id})`);

    console.log('\n====================================================');
    console.log('            ALL CLIENT QUERIES ARE COMPATIBLE        ');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ COMPATIBILITY CHECK FAILED:', err);
    process.exit(1);
  }
}

run();
