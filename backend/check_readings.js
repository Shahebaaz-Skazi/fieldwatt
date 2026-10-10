require('dotenv').config();
const db = require('./src/db');
async function run() {
  const VAIBHAV_ID = '953ea565-dba3-4fdb-aa88-ac611c64b280';
  const readingsRes = await db.query(`
    SELECT r.id, r.assignment_id, r.idempotency_key, r.submitted_at 
    FROM readings r
    JOIN assignments a ON r.assignment_id = a.id
    WHERE a.agent_id = ?
    ORDER BY r.submitted_at DESC
    LIMIT 10
  `, [VAIBHAV_ID]);
  console.log('Recent readings in DB:', readingsRes.rows);
}
run();
