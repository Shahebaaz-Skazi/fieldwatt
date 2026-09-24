const db = require('./backend/src/db');
const xlsx = require('xlsx');

async function setupCorrections() {
  console.log('Creating table...');
  await db.query(`DROP TABLE IF EXISTS reading_corrections`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS reading_corrections (
      reading_id TEXT PRIMARY KEY,
      serial_no TEXT,
      original_value TEXT,
      photo_url TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);

  console.log('Reading Excel file...');
  const workbook = xlsx.readFile('f:\\fieldwatt\\reading correction 24.09.2026.xlsx');
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
  console.log(`Found ${data.length} rows in Excel.`);

  // We need to map serial_no to reading_id
  const serials = data.map(r => r['MR ORDER ID']).filter(Boolean);
  
  console.log('Fetching readings from DB...');
  // Since D1 limits variables in query, let's fetch all readings and match in memory
  const allReadings = await db.query(`
    SELECT r.id as reading_id, p.serial_no, r.reading_value, r.photo_url
    FROM readings r
    JOIN assignments a ON r.assignment_id = a.id
    JOIN properties p ON a.property_id = p.id
    WHERE r.status_code = 'reading_taken'
  `);
  
  console.log(`Fetched ${allReadings.rows.length} valid readings from DB.`);
  
  const readingMap = new Map();
  for (const row of allReadings.rows) {
    readingMap.set(String(row.serial_no), row);
  }

  const inserts = [];
  let notFound = 0;

  for (const row of data) {
    const serial = String(row['MR ORDER ID']);
    const dbRow = readingMap.get(serial);
    if (dbRow) {
      inserts.push({
        reading_id: dbRow.reading_id,
        serial_no: serial,
        original_value: String(row['Current MR']),
        photo_url: dbRow.photo_url
      });
    } else {
      notFound++;
    }
  }

  console.log(`Matched ${inserts.length} readings. Not found: ${notFound}`);

  if (inserts.length > 0) {
    console.log('Inserting into reading_corrections...');
    // Chunk inserts
    const chunkSize = 20;
    for (let i = 0; i < inserts.length; i += chunkSize) {
      const chunk = inserts.slice(i, i + chunkSize);
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const item of chunk) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 'pending')`);
        params.push(item.reading_id, item.serial_no, item.original_value, item.photo_url);
      }
      
      await db.query(`
        INSERT OR IGNORE INTO reading_corrections (reading_id, serial_no, original_value, photo_url, status)
        VALUES ${values.join(', ')}
      `, params);
      
      console.log(`Inserted chunk ${i / chunkSize + 1} / ${Math.ceil(inserts.length / chunkSize)}`);
    }
  }
  
  console.log('Done!');
}

setupCorrections().catch(console.error).finally(() => process.exit());
