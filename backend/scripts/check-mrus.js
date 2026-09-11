require('dotenv').config();
const db = require('../src/utils/db');

async function checkMrus() {
  const sept = await db.query(`
    SELECT DISTINCT a.name 
    FROM areas a 
    JOIN properties p ON p.area_id = a.id 
    JOIN imports i ON p.import_id = i.id 
    WHERE i.billing_month = 'September 2026'
    LIMIT 10
  `);
  console.log('September 2026 MRUs (sample):', sept.rows.map(r => r.name));

  const june = await db.query(`
    SELECT DISTINCT a.name 
    FROM areas a 
    JOIN properties p ON p.area_id = a.id 
    JOIN imports i ON p.import_id = i.id 
    WHERE i.billing_month = 'June 2026'
    LIMIT 10
  `);
  console.log('June 2026 MRUs (sample):', june.rows.map(r => r.name));
}

checkMrus().finally(() => process.exit(0));
