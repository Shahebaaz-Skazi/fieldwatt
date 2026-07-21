/**
 * diagnose_prod.js - Run against SUPABASE (production) database
 * Run: node scripts/diagnose_prod.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

// Build Supabase postgres connection from SUPABASE_URL
// Supabase DB host: db.<project-ref>.supabase.co
// The project ref is in the URL: https://kukhoapufbawfxlvmjqw.supabase.co
const SUPABASE_PROJECT = 'kukhoapufbawfxlvmjqw';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_KEY;

// Try Supabase Transaction Pooler (port 6543) or Direct (port 5432)
const pool = new Pool({
  host: `db.${SUPABASE_PROJECT}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('\n✅ Connected to Supabase production DB\n');

    console.log('=== CYCLES ===');
    const cycles = await client.query('SELECT id, label, is_active FROM cycles ORDER BY is_active DESC');
    console.table(cycles.rows);

    console.log('=== IMPORTS ===');
    const imports = await client.query(
      'SELECT file_name, billing_month, scheduled_date, total_rows FROM imports ORDER BY scheduled_date DESC'
    );
    console.table(imports.rows);

    console.log('=== READINGS COUNT by status ===');
    const rCount = await client.query('SELECT COUNT(*) as total, status_code FROM readings GROUP BY status_code');
    console.table(rCount.rows.length ? rCount.rows : [{ total: 0, status_code: 'none' }]);

    console.log('=== ASSIGNMENTS by cycle ===');
    const asgCount = await client.query(`
      SELECT c.label, COUNT(a.id) as assignment_count
      FROM assignments a
      JOIN cycles c ON a.cycle_id = c.id
      GROUP BY c.label
    `);
    console.table(asgCount.rows);

    // Cycle resolution test
    const year = 2026, month = 4;
    const cycleRes = await client.query(`
      SELECT c.id as cycle_id, c.label FROM cycles c
      WHERE c.label = (
        SELECT billing_month FROM imports i
        WHERE EXTRACT(YEAR FROM i.scheduled_date) = $1 
          AND EXTRACT(MONTH FROM i.scheduled_date) = $2
        LIMIT 1
      )
    `, [year, month]);
    const targetCycleId = cycleRes.rows[0]?.cycle_id || '00000000-0000-0000-0000-000000000000';
    console.log(`\nExport cycle resolution (year=2026, month=4): ${JSON.stringify(cycleRes.rows[0] || 'NONE')}`);
    console.log(`targetCycleId = ${targetCycleId}`);

    // Readings in that cycle
    const readInCycle = await client.query(`
      SELECT COUNT(*) as readings_in_resolved_cycle
      FROM readings r
      JOIN assignments a ON r.assignment_id = a.id
      WHERE a.cycle_id = $1
    `, [targetCycleId]);
    console.log(`Readings in resolved cycle: ${readInCycle.rows[0].readings_in_resolved_cycle}`);

    // Sample readings
    console.log('\n=== SAMPLE READINGS (top 5) ===');
    const sampleR = await client.query(`
      SELECT r.status_code, r.reading_value, r.submitted_at, c.label as cycle, p.serial_no
      FROM readings r
      JOIN assignments a ON r.assignment_id = a.id
      JOIN cycles c ON a.cycle_id = c.id
      JOIN properties p ON a.property_id = p.id
      ORDER BY r.submitted_at DESC LIMIT 5
    `);
    console.table(sampleR.rows.length ? sampleR.rows : [{ note: 'No readings' }]);

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error('Connection failed:', err.message);
  console.log('\nHint: The SUPABASE_SERVICE_KEY is not the DB password.');
  console.log('You need the actual Postgres password from Supabase Dashboard → Settings → Database → Password');
  process.exit(1);
});
