require('dotenv').config();
const db = require('./src/db');

async function run() {
  const agentRes = await db.query("SELECT id FROM agents WHERE name LIKE 'Vaibhav%'");
  const VAIBHAV_ID = agentRes.rows[0]?.id;
  console.log('Vaibhav ID:', VAIBHAV_ID);

  const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 ORDER BY start_date DESC LIMIT 1');
  const cycleId = cycleRes.rows[0]?.id;
  console.log('Active cycle:', cycleId);

  if (!VAIBHAV_ID || !cycleId) return;

  const asgs = await db.query('SELECT COUNT(*) as total, SUM(CASE WHEN is_completed=1 THEN 1 ELSE 0 END) as done FROM assignments WHERE agent_id = ? AND cycle_id = ?', [VAIBHAV_ID, cycleId]);
  console.log('Vaibhav assignments:', asgs.rows[0]);

  // Sample the assignments query that the app runs
  const sample = await db.query(`
    SELECT asg.id as assignment_id, p.consumer_name,
      LTRIM(COALESCE(json_extract(p.raw_sap_data,'$."BP No."'), p.serial_no), '0') AS bp_no
    FROM assignments asg
    INNER JOIN properties p ON asg.property_id = p.id
    WHERE asg.agent_id = ? AND asg.cycle_id = ?
    LIMIT 3
  `, [VAIBHAV_ID, cycleId]);
  console.log('Sample assignments:', sample.rows);

  // Check if there are unsynced readings in the readings table for this agent
  const readingsRes = await db.query(`
    SELECT COUNT(*) as c FROM readings r
    JOIN assignments a ON r.assignment_id = a.id
    WHERE a.agent_id = ? AND a.cycle_id = ?
  `, [VAIBHAV_ID, cycleId]);
  console.log('Readings in DB:', readingsRes.rows[0]);
}
run().catch(console.error);
