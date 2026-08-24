const db = require('./src/utils/db');

async function test() {
  try {
    const sql = "SELECT * FROM imports WHERE id = ?1 AND id = ?1";
    const res = await db.query(sql, ['1859debf-da72-4d59-a86f-b5e84f16c67b']);
    console.log('SUCCESS:', res.rows.length);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

test();
