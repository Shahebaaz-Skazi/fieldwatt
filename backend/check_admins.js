const db = require('./src/db');
async function check() {
  // First get columns of agents table
  const cols = await db.query("PRAGMA table_info(agents)");
  console.log('Agent columns:', cols.rows.map(r => r.name));
  const res = await db.query("SELECT * FROM agents LIMIT 3");
  console.log('Sample agents:', res.rows);
}
check().catch(console.error);
