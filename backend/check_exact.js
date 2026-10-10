const db = require('./src/db');
async function check() {
  try {
    const res = await db.query(`
      SELECT p.id
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = '83b91bca-44fc-46b2-abf2-31390e94189e'
      WHERE 
      EXTRACT(YEAR FROM i.scheduled_date) = 2026 
        AND EXTRACT(MONTH FROM i.scheduled_date) = 9
        AND (a.name = 'UDH004_O' OR i.file_code = 'UDH004_O') 
        AND p.society = 'MAHINDRA ANTHEIA'
    `);
    console.log(res.rows.length);
  } catch (e) {
    console.error(e);
  }
}
check();
