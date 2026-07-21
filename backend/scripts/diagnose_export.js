/**
 * diagnose_export.js
 * Run: node scripts/diagnose_export.js
 * Connects to the LOCAL db and prints what the export SQL would see.
 * For production diagnosis, temporarily swap DATABASE_URL in .env.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('\n=== 1. CYCLES ===');
    const cycles = await client.query('SELECT id, label, is_active FROM cycles ORDER BY is_active DESC, label');
    console.table(cycles.rows);

    console.log('\n=== 2. IMPORTS (scheduled_date, billing_month) ===');
    const imports = await client.query(
      'SELECT id, file_name, billing_month, scheduled_date, total_rows FROM imports ORDER BY scheduled_date DESC'
    );
    console.table(imports.rows);

    console.log('\n=== 3. READINGS COUNT ===');
    const rCount = await client.query('SELECT COUNT(*) as total, status_code FROM readings GROUP BY status_code');
    console.table(rCount.rows);

    console.log('\n=== 4. ASSIGNMENTS COUNT per cycle ===');
    const asgCount = await client.query(`
      SELECT c.label, COUNT(a.id) as assignment_count
      FROM assignments a
      JOIN cycles c ON a.cycle_id = c.id
      GROUP BY c.label
    `);
    console.table(asgCount.rows);

    console.log('\n=== 5. SAMPLE: readings → assignments → properties ===');
    const sample = await client.query(`
      SELECT
        r.id as reading_id,
        r.status_code,
        r.reading_value,
        r.submitted_at,
        r.note,
        a.cycle_id,
        c.label as cycle_label,
        p.serial_no,
        p.consumer_name,
        i.billing_month,
        i.scheduled_date,
        EXTRACT(YEAR FROM i.scheduled_date) as year,
        EXTRACT(MONTH FROM i.scheduled_date) as month
      FROM readings r
      JOIN assignments a ON r.assignment_id = a.id
      JOIN cycles c ON a.cycle_id = c.id
      JOIN properties p ON a.property_id = p.id
      JOIN imports i ON p.import_id = i.id
      LIMIT 10
    `);
    console.table(sample.rows);

    console.log('\n=== 6. EXPORT CYCLE RESOLUTION TEST (for each import year/month) ===');
    const periods = await client.query(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM scheduled_date)::int as year,
        EXTRACT(MONTH FROM scheduled_date)::int as month,
        billing_month
      FROM imports
    `);
    for (const period of periods.rows) {
      const cycleRes = await client.query(`
        SELECT c.id as cycle_id, c.label FROM cycles c
        WHERE c.label = (
          SELECT billing_month FROM imports i
          WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1
            AND EXTRACT(MONTH FROM i.scheduled_date) = $2
          LIMIT 1
        )
      `, [period.year, period.month]);
      const resolved = cycleRes.rows[0] || null;
      console.log(`Year=${period.year} Month=${period.month} billing_month="${period.billing_month}" → resolved cycle: ${resolved ? `"${resolved.label}" (${resolved.cycle_id})` : 'NULL ❌'}`);

      if (resolved) {
        const readingCount = await client.query(`
          SELECT COUNT(*) as readings_in_this_cycle
          FROM readings r
          JOIN assignments a ON r.assignment_id = a.id
          WHERE a.cycle_id = $1
        `, [resolved.cycle_id]);
        console.log(`  → Readings in this cycle: ${readingCount.rows[0].readings_in_this_cycle}`);
      }
    }
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
