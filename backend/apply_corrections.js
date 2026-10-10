const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config();
const db = require('./src/utils/db');

const EXCEL_PATH = path.join(__dirname, '../FieldWatt_Corrected_Readings_2026-09-24.xlsx');

async function applyCorrections() {
  console.log('1. Reading Excel file...');
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  const correctedRows = data.filter(r => 
    r['Corrected MR'] !== undefined && 
    r['Corrected MR'] !== null && 
    String(r['Corrected MR']).trim() !== ''
  );

  console.log(`   Found ${correctedRows.length} corrected rows in Excel.`);

  console.log('2. Fetching reading_id mappings from database...');
  const rcRes = await db.query('SELECT reading_id, serial_no FROM reading_corrections');
  const serialToReadingId = new Map();
  rcRes.rows.forEach(r => serialToReadingId.set(String(r.serial_no), r.reading_id));

  const updates = [];
  for (const row of correctedRows) {
    const serial = String(row['MR ORDER ID']);
    const readingId = serialToReadingId.get(serial);
    const correctedValue = String(row['Corrected MR']).trim();

    if (readingId) {
      updates.push({ readingId, serial, correctedValue });
    } else {
      console.warn(`   Warning: No reading_id found for serial ${serial}`);
    }
  }

  console.log(`   Matched ${updates.length} updates ready to apply to D1.`);

  // Batch updates in chunks of 25 to respect D1's 100 parameter limit
  // (25 * 2 for CASE + 25 for WHERE = 75 parameters per query)
  const BATCH_SIZE = 25;
  const totalBatches = Math.ceil(updates.length / BATCH_SIZE);
  console.log(`3. Executing ${totalBatches} batched updates on Cloudflare D1...`);

  let appliedCount = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // Build CASE statement for batch UPDATE on readings table
    const whenClauses = [];
    const params = [];
    const idPlaceholders = [];

    // Part 1: CASE WHEN id = ? THEN ?
    for (const item of batch) {
      whenClauses.push('WHEN ? THEN ?');
      params.push(item.readingId, item.correctedValue);
    }

    // Part 2: WHERE id IN (?, ?, ...)
    for (const item of batch) {
      idPlaceholders.push('?');
      params.push(item.readingId);
    }

    const updateSql = `
      UPDATE readings
      SET reading_value = CASE id
        ${whenClauses.join(' ')}
      END
      WHERE id IN (${idPlaceholders.join(', ')})
    `;

    await db.query(updateSql, params);

    // Also update reading_corrections status to 'corrected'
    const rcPlaceholders = batch.map(() => '?').join(', ');
    const rcParams = batch.map(b => b.readingId);
    await db.query(`
      UPDATE reading_corrections
      SET status = 'corrected'
      WHERE reading_id IN (${rcPlaceholders})
    `, rcParams);

    appliedCount += batch.length;

    if (appliedCount % 200 === 0 || appliedCount === updates.length) {
      console.log(`   Progress: ${appliedCount} / ${updates.length} records updated in database.`);
    }
  }

  console.log('4. Verifying updates in database...');
  const testSample = await db.query('SELECT r.id, r.reading_value, rc.serial_no FROM readings r JOIN reading_corrections rc ON r.id = rc.reading_id WHERE rc.serial_no = ?', ['16462632']);
  console.log('   Sample verification (16462632):', testSample.rows[0]);

  const summary = await db.query('SELECT status, count(*) as count FROM reading_corrections GROUP BY status');
  console.log('   reading_corrections status breakdown:', summary.rows);

  console.log(`\nSUCCESS! All ${appliedCount} meter readings have been updated in the database and software.`);
}

applyCorrections().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
