const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config();
const db = require('./src/utils/db');

const EXCEL_PATH = path.join(__dirname, '../FieldWatt_Corrected_Readings_2026-09-24.xlsx');

async function syncAllPropertyReadings() {
  console.log('1. Reading Excel to map serial_no -> Corrected MR...');
  const wb = xlsx.readFile(EXCEL_PATH);
  const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  
  const serialToVal = new Map();
  for (const r of data) {
    if (r['Corrected MR'] !== undefined && r['Corrected MR'] !== null && String(r['Corrected MR']).trim() !== '') {
      serialToVal.set(String(r['MR ORDER ID']), String(r['Corrected MR']).trim());
    }
  }

  console.log('2. Fetching all readings across all assignments for these properties...');
  const res = await db.query(`
    SELECT r.id as reading_id, p.serial_no, r.reading_value
    FROM readings r
    JOIN assignments a ON r.assignment_id = a.id
    JOIN properties p ON a.property_id = p.id
    JOIN reading_corrections rc ON rc.serial_no = p.serial_no
    WHERE rc.status = 'corrected'
  `);

  console.log(`   Found ${res.rows.length} total readings across ${serialToVal.size} properties.`);

  const toUpdate = [];
  for (const row of res.rows) {
    const targetVal = serialToVal.get(String(row.serial_no));
    if (targetVal && String(row.reading_value) !== targetVal) {
      toUpdate.push({ readingId: row.reading_id, correctedValue: targetVal });
    }
  }

  console.log(`   ${toUpdate.length} secondary/duplicate readings need updating to match corrected value.`);

  if (toUpdate.length > 0) {
    const BATCH_SIZE = 25;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const whenClauses = [];
      const params = [];
      const idPlaceholders = [];

      for (const item of batch) {
        whenClauses.push('WHEN ? THEN ?');
        params.push(item.readingId, item.correctedValue);
      }
      for (const item of batch) {
        idPlaceholders.push('?');
        params.push(item.readingId);
      }

      const sql = `
        UPDATE readings
        SET reading_value = CASE id
          ${whenClauses.join(' ')}
        END
        WHERE id IN (${idPlaceholders.join(', ')})
      `;
      await db.query(sql, params);
    }
    console.log(`   Successfully synced all ${toUpdate.length} secondary readings.`);
  }

  console.log('3. Final verification: checking property 16451083...');
  const sample = await db.query(`
    SELECT r.id, r.reading_value, p.serial_no
    FROM readings r
    JOIN assignments a ON r.assignment_id = a.id
    JOIN properties p ON a.property_id = p.id
    WHERE p.serial_no = ?
  `, ['16451083']);
  console.log('   Readings for 16451083:', sample.rows);
}

syncAllPropertyReadings().catch(console.error);
