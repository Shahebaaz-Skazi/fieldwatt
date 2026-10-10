const db = require('./src/db');
async function check() {
  const r = await db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='readings'");
  console.log(r.rows);
}
check();
