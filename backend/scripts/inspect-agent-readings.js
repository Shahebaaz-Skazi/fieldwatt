require('dotenv').config();
const db = require('../src/utils/db');

async function inspectReadings() {
  console.log('--- INSPECTING READINGS FOR ANIKET BELAWADE ---');

  const agentRes = await db.query("SELECT id, name FROM agents WHERE name LIKE '%Aniket%'");
  const agent = agentRes.rows[0];
  console.log('Agent:', agent);

  // 1. Count readings linked to assignments of this agent
  const asgReadings = await db.query(`
    SELECT r.id, r.assignment_id, r.status_code, r.reading_value, asg.agent_id, asg.cycle_id
    FROM readings r
    INNER JOIN assignments asg ON r.assignment_id = asg.id
    WHERE asg.agent_id = '${agent.id}'
  `);
  console.log('\nReadings linked via assignments.id:', asgReadings.rows.length);
  if (asgReadings.rows.length > 0) {
    console.log('Sample assignment reading:', asgReadings.rows[0]);
  }

  // 2. Count total readings in readings table
  const totalReadings = await db.query('SELECT COUNT(*) as c FROM readings');
  console.log('\nTotal readings in DB:', totalReadings.rows[0].c);

  // 3. Inspect some readings rows directly
  const sampleReadings = await db.query('SELECT * FROM readings LIMIT 5');
  console.log('\nSample raw readings in DB:', sampleReadings.rows);

  // 4. Check how Dashboard counts readings for Aniket Belawade
  const dashboardQuery = await db.query(`
    SELECT 
      a.id, a.name,
      COUNT(asg.id) as total_assigned,
      SUM(CASE WHEN r.id IS NOT NULL AND r.status_code = 'reading_taken' THEN 1 ELSE 0 END) as done_count,
      SUM(CASE WHEN r.id IS NOT NULL AND r.status_code != 'reading_taken' THEN 1 ELSE 0 END) as problem_count
    FROM agents a
    LEFT JOIN assignments asg ON asg.agent_id = a.id
    LEFT JOIN readings r ON r.assignment_id = asg.id
    WHERE a.id = '${agent.id}'
    GROUP BY a.id, a.name
  `);
  console.log('\nDashboard query result for Aniket:', dashboardQuery.rows[0]);
}

inspectReadings().finally(() => process.exit(0));
