const db = require('./src/db');
async function check() {
  try {
    const res = await db.query("SELECT * FROM imports WHERE file_name LIKE '%03.10%'");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
check();
