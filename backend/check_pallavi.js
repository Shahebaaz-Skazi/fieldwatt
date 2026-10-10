require("dotenv").config();
const db = require("./src/db");

async function checkPallavi() {
  const agentId = '33bdb6c4-a678-4cdf-912d-c3112c3db201';
  try {
    const res = await db.query(`
      SELECT COUNT(*) as total_assignments, 
             SUM(is_completed) as completed, 
             SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) as incomplete 
      FROM assignments 
      WHERE agent_id = $1
    `, [agentId]);
    console.log("Pallavi Assignments:", res.rows[0]);

    const res2 = await db.query(`
      SELECT COUNT(*) as total_readings
      FROM readings r
      INNER JOIN assignments a ON r.assignment_id = a.id
      WHERE a.agent_id = $1
    `, [agentId]);
    console.log("Pallavi Readings:", res2.rows[0]);

    // Check recent readings
    const res3 = await db.query(`
      SELECT p.serial_no, p.raw_sap_data->>'BP No.' as bp_no, r.status_code, r.photo_url, r.submitted_at
      FROM readings r
      INNER JOIN assignments a ON r.assignment_id = a.id
      INNER JOIN properties p ON a.property_id = p.id
      WHERE a.agent_id = $1
      ORDER BY r.synced_at DESC
      LIMIT 5
    `, [agentId]);
    console.log("Recent 5 readings uploaded:", res3.rows);

  } catch (err) {
    console.error(err);
  }
}
checkPallavi();
