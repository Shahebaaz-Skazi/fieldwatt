const db = require('./src/db');
async function check() {
  try {
    const res1 = await db.query(`SELECT COUNT(*) as c, society FROM properties WHERE society LIKE '%Mahindra%' GROUP BY society`);
    console.log("Societies:", res1.rows);
    
    const res2 = await db.query(`SELECT COUNT(*) as c, a.name FROM assignments asg JOIN agents a ON asg.agent_id = a.id GROUP BY a.name`);
    console.log("Agents with assignments:", res2.rows);
  } catch (e) {
    console.error(e);
  }
}
check();
