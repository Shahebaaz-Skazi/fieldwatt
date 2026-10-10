const db = require('./src/db');
async function check() {
  console.time('row_number');
  try {
    await db.query(`
      SELECT p.id
      FROM properties p
      LEFT JOIN (
        SELECT id, assignment_id, reading_value FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY assignment_id ORDER BY submitted_at DESC) as _rn FROM readings
        ) WHERE _rn = 1
      ) latest_r ON latest_r.assignment_id = 'test'
      LIMIT 1
    `);
  } catch (e) {
    console.error(e);
  }
  console.timeEnd('row_number');
}
check();
