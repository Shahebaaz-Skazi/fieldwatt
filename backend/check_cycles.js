const db = require('./src/db');
async function check() {
  try {
    const res = await db.query(`
      SELECT billing_month, scheduled_date FROM imports WHERE EXTRACT(YEAR FROM scheduled_date) = 2026 AND EXTRACT(MONTH FROM scheduled_date) = 9
    `);
    console.log("Imports:", res.rows);

    const res2 = await db.query(`
      SELECT id, label, is_active FROM cycles
    `);
    console.log("Cycles:", res2.rows);
  } catch (e) {
    console.error(e);
  }
}
check();
