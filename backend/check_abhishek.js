require("dotenv").config();
const db = require("./src/db");

async function run() {
  try {
    // Find Abhishek Kawade
    const agentRes = await db.query(`SELECT id, name, username FROM agents WHERE name ILIKE '%abhishek kawade%' OR name ILIKE '%kawade%'`);
    console.log("Found Agents:", agentRes.rows);

    if (agentRes.rows.length === 0) {
      console.log("No agent found");
      return;
    }

    const agentId = agentRes.rows[0].id;
    console.log("Checking stats for:", agentId);

    // Get assignments and readings summary
    const assignmentsRes = await db.query(`
      SELECT is_completed, COUNT(*) as cnt 
      FROM assignments 
      WHERE agent_id = $1 
      GROUP BY is_completed
    `, [agentId]);
    console.log("Assignments summary:", assignmentsRes.rows);

    const readingsRes = await db.query(`
      SELECT r.status_code, COUNT(*) as cnt 
      FROM readings r 
      INNER JOIN assignments a ON r.assignment_id = a.id 
      WHERE a.agent_id = $1 
      GROUP BY r.status_code
    `, [agentId]);
    console.log("Readings summary:", readingsRes.rows);
    
    // Check error logs for sync errors
    const errorsRes = await db.query(`
      SELECT endpoint, message, created_at 
      FROM error_logs 
      WHERE agent_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [agentId]);
    console.log("Recent Error Logs:", errorsRes.rows);
  } catch (err) {
    console.error(err);
  }
}
run();
