const db = require('./src/db');
async function check() {
  try {
    const res = await db.query(`
      SELECT a.name, i.file_code 
      FROM properties p
      JOIN areas a ON p.area_id = a.id
      JOIN imports i ON p.import_id = i.id
      WHERE p.society = 'MAHINDRA ANTHEIA'
      LIMIT 1
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
check();
