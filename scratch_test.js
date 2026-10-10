const db = require('./backend/src/db');
async function test() {
  const result = await db.query(`
    SELECT p.*, r.reading_value, r.status_code, r.submitted_at
    FROM properties p
    LEFT JOIN assignments a ON p.id = a.property_id
    LEFT JOIN readings r ON a.id = r.assignment_id
    WHERE p.serial_no = '16449684'
  `);
  console.log('DB Reading:', result.rows);
}
test().catch(console.error).finally(() => process.exit());
