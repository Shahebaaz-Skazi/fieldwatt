const db = require('./src/db');
async function check() {
  console.time('max_trick');
  try {
    await db.query(`
      SELECT p.id
      FROM properties p
      LEFT JOIN (
        SELECT id, assignment_id, reading_value, MAX(submitted_at) as submitted_at
        FROM readings
        GROUP BY assignment_id
      ) latest_r ON latest_r.assignment_id = 'test'
      LIMIT 1
    `);
  } catch (e) {
    console.error(e);
  }
  console.timeEnd('max_trick');
}
check();
