/**
 * diagnose_export2.js - Simulate the exact export query
 * Run: node scripts/diagnose_export2.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // The import is April 2026 (year=2026, month=4)
    const year = 2026;
    const month = 4;
    const mru = 'all';

    console.log(`\n=== Simulating export for year=${year}, month=${month}, mru=${mru} ===\n`);

    // Step 1: Resolve targetCycleId (same as export route)
    const cycleRes = await client.query(`
      SELECT c.id as cycle_id, c.label FROM cycles c
      WHERE c.label = (
        SELECT billing_month FROM imports i
        WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1 
          AND EXTRACT(MONTH FROM i.scheduled_date) = $2
        LIMIT 1
      )
    `, [year, month]);

    const targetCycleId = cycleRes.rows.length > 0
      ? cycleRes.rows[0].cycle_id
      : '00000000-0000-0000-0000-000000000000';

    console.log('Resolved cycle:', cycleRes.rows[0] || 'NONE — using fallback UUID');
    console.log('targetCycleId:', targetCycleId);

    // Step 2: Count properties returned by export base query
    const propCount = await client.query(`
      SELECT COUNT(*) as property_count
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
        AND EXTRACT(MONTH FROM i.scheduled_date) = $2
    `, [year, month]);
    console.log('\nProperties returned by export query:', propCount.rows[0].property_count);

    // Step 3: Check how many have an assignment in this cycle
    const asgCount = await client.query(`
      SELECT COUNT(*) as with_assignment
      FROM properties p
      INNER JOIN imports i ON p.import_id = i.id
      JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $3
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
        AND EXTRACT(MONTH FROM i.scheduled_date) = $2
    `, [year, month, targetCycleId]);
    console.log('Properties with assignment in resolved cycle:', asgCount.rows[0].with_assignment);

    // Step 4: Check how many have a reading through that assignment
    const readingCount = await client.query(`
      SELECT COUNT(*) as with_reading
      FROM properties p
      INNER JOIN imports i ON p.import_id = i.id
      JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $3
      JOIN readings r ON r.assignment_id = asg.id
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
        AND EXTRACT(MONTH FROM i.scheduled_date) = $2
    `, [year, month, targetCycleId]);
    console.log('Properties with reading in resolved cycle:', readingCount.rows[0].with_reading);

    // Step 5: Raw reading count total
    const totalReadings = await client.query('SELECT COUNT(*) as total FROM readings');
    console.log('\nTotal readings in DB:', totalReadings.rows[0].total);

    // Step 6: Sample 5 readings with full chain
    console.log('\n=== Sample readings with full chain ===');
    const sampleReadings = await client.query(`
      SELECT 
        r.id as reading_id,
        r.status_code,
        r.reading_value,
        r.submitted_at,
        a.cycle_id,
        c.label as cycle_label,
        p.serial_no
      FROM readings r
      JOIN assignments a ON r.assignment_id = a.id
      JOIN cycles c ON a.cycle_id = c.id
      JOIN properties p ON a.property_id = p.id
      LIMIT 5
    `);
    if (sampleReadings.rows.length === 0) {
      console.log('No readings found at all.');
    } else {
      console.table(sampleReadings.rows);
    }

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
