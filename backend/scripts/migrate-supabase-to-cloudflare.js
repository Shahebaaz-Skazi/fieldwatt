/**
 * scripts/migrate-supabase-to-cloudflare.js
 *
 * One-time migration: copies all rows from Supabase PostgreSQL + Storage → Cloudflare D1 + R2.
 *
 * What it does per table:
 *   cycles, areas, admins, imports, agents, properties,
 *   assignments, readings (with photo re-upload), attendance,
 *   revisits, whatsapp_logs
 *
 * Safety features:
 *   - INSERT OR IGNORE so re-runs are idempotent
 *   - 500ms pause between batches to respect Cloudflare rate limits
 *   - Detailed per-row error logging; failures skip the row, not the run
 *
 * Usage:
 *   node scripts/migrate-supabase-to-cloudflare.js
 *
 * Required env vars:
 *   DATABASE_URL            - Supabase Postgres connection string
 *   SUPABASE_URL            - Supabase project URL (for storage public URL building)
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN
 *   R2_ACCOUNT_ID           (or CLOUDFLARE_ACCOUNT_ID)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_PUBLIC_BASE_URL
 */
require('dotenv').config();

const { Pool }              = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ──────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────
const CF_ACCOUNT_ID  = process.env.CLOUDFLARE_ACCOUNT_ID;
const D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
const CF_API_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const D1_BASE        = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID || CF_ACCOUNT_ID;
const R2_KEY           = process.env.R2_ACCESS_KEY_ID     || '39dec7bba58fd973160bfa779356c542';
const R2_SECRET        = process.env.R2_SECRET_ACCESS_KEY || '2df4946482e6e2d1f52ad1e2f663234a1948fb579088c221dc2b57dc61cd3a11';
const R2_BUCKET        = process.env.R2_BUCKET_NAME       || 'meter-photos';
const R2_PUBLIC_BASE   = (process.env.R2_PUBLIC_BASE_URL  || 'https://pub-3de6f3ace1d04d558c47c0e7df5f333d.r2.dev').replace(/\/$/, '');

const BATCH_SIZE       = 20;   // rows per D1 batch
const PAUSE_MS         = 500;  // ms between batches

// ──────────────────────────────────────────────────
// CLIENTS
// ──────────────────────────────────────────────────
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
});

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function d1Batch(statements) {
  const res = await fetch(`${D1_BASE}/batch`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(statements),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const errs = json.errors?.map(e => e.message).join('; ') || res.statusText;
    throw new Error(`D1 batch error: ${errs}`);
  }
  return json.result;
}

async function uploadPhotoToR2(photoUrl) {
  if (!photoUrl) return null;
  try {
    const resp = await fetch(photoUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf  = Buffer.from(await resp.arrayBuffer());
    // Build key from last path segment
    const key  = `migrated/${Date.now()}_${photoUrl.split('/').pop().split('?')[0]}`;
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/jpeg' }));
    return `${R2_PUBLIC_BASE}/${key}`;
  } catch (err) {
    console.warn(`  ⚠️  Photo upload skipped (${photoUrl}): ${err.message}`);
    return photoUrl; // keep old URL as fallback
  }
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ──────────────────────────────────────────────────
// MIGRATE SIMPLE TABLES (no photo, no FK complexity)
// ──────────────────────────────────────────────────
async function migrateSimple(table, pgSql, toStatements) {
  console.log(`\n📋  Migrating: ${table}`);
  const { rows } = await pgPool.query(pgSql);
  console.log(`    ${rows.length} rows found.`);
  if (rows.length === 0) return;

  let ok = 0, fail = 0;
  for (const batch of chunks(rows, BATCH_SIZE)) {
    try {
      const stmts = batch.map(row => toStatements(row)).filter(Boolean);
      await d1Batch(stmts);
      ok += batch.length;
    } catch (err) {
      fail += batch.length;
      console.error(`  ❌  Batch failed: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`    ✔  ${ok} inserted, ${fail} failed.`);
}

// ──────────────────────────────────────────────────
// INDIVIDUAL TABLE MIGRATORS
// ──────────────────────────────────────────────────
async function migrateCycles() {
  await migrateSimple(
    'cycles',
    `SELECT id, label, start_date, end_date, is_active, created_at FROM cycles`,
    row => ({
      sql:    `INSERT OR IGNORE INTO cycles (id, label, start_date, end_date, is_active, created_at) VALUES (?,?,?,?,?,?)`,
      params: [row.id, row.label, row.start_date?.toISOString?.() ?? null, row.end_date?.toISOString?.() ?? null, row.is_active ? 1 : 0, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateAreas() {
  await migrateSimple(
    'areas',
    `SELECT id, name, city, created_at FROM areas`,
    row => ({
      sql:    `INSERT OR IGNORE INTO areas (id, name, city, created_at) VALUES (?,?,?,?)`,
      params: [row.id, row.name, row.city, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateAdmins() {
  await migrateSimple(
    'admins',
    `SELECT id, name, email, password_hash, created_at FROM admins`,
    row => ({
      sql:    `INSERT OR IGNORE INTO admins (id, name, email, password_hash, created_at) VALUES (?,?,?,?,?)`,
      params: [row.id, row.name, row.email, row.password_hash, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateImports() {
  await migrateSimple(
    'imports',
    `SELECT id, file_name, file_code, scheduled_date, billing_month, total_rows, uploaded_by, uploaded_at FROM imports`,
    row => ({
      sql:    `INSERT OR IGNORE INTO imports (id, file_name, file_code, scheduled_date, billing_month, total_rows, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)`,
      params: [row.id, row.file_name, row.file_code, row.scheduled_date?.toISOString?.() ?? null, row.billing_month, row.total_rows, row.uploaded_by, row.uploaded_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateAgents() {
  await migrateSimple(
    'agents',
    `SELECT id, name, phone, email, username, password_hash, is_active, last_login, expo_push_token, created_at FROM agents`,
    row => ({
      sql:    `INSERT OR IGNORE INTO agents (id, name, phone, email, username, password_hash, is_active, last_login, expo_push_token, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [row.id, row.name, row.phone, row.email, row.username, row.password_hash, row.is_active ? 1 : 0, row.last_login?.toISOString?.() ?? null, row.expo_push_token, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateProperties() {
  await migrateSimple(
    'properties',
    `SELECT id, area_id, import_id, serial_no, consumer_name, address, meter_no, property_type, society, sub_society, wing_code, phone_number, lat, lng, raw_sap_data::text as raw_sap_data, created_at FROM properties`,
    row => ({
      sql:    `INSERT OR IGNORE INTO properties (id, area_id, import_id, serial_no, consumer_name, address, meter_no, property_type, society, sub_society, wing_code, phone_number, lat, lng, raw_sap_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [row.id, row.area_id, row.import_id, row.serial_no, row.consumer_name, row.address, row.meter_no, row.property_type, row.society, row.sub_society, row.wing_code, row.phone_number, row.lat, row.lng, row.raw_sap_data, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateAssignments() {
  await migrateSimple(
    'assignments',
    `SELECT id, agent_id, property_id, cycle_id, assigned_at, assigned_by FROM assignments`,
    row => ({
      sql:    `INSERT OR IGNORE INTO assignments (id, agent_id, property_id, cycle_id, assigned_at, assigned_by) VALUES (?,?,?,?,?,?)`,
      params: [row.id, row.agent_id, row.property_id, row.cycle_id, row.assigned_at?.toISOString?.() ?? null, row.assigned_by],
    })
  );
}

async function migrateReadings() {
  console.log('\n📋  Migrating: readings (with photo re-upload to R2)');
  const { rows } = await pgPool.query(
    `SELECT id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note,
            gps_lat, gps_lng, gps_accuracy, is_anomalous, anomaly_reason, source,
            submitted_by_type, submitted_at, synced_at FROM readings`
  );
  console.log(`    ${rows.length} rows found.`);

  let ok = 0, fail = 0;
  for (const row of rows) {
    try {
      // Re-upload photo to R2
      const newPhotoUrl = await uploadPhotoToR2(row.photo_url);

      await d1Batch([{
        sql: `INSERT OR IGNORE INTO readings
              (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note,
               gps_lat, gps_lng, gps_accuracy, is_anomalous, anomaly_reason, source,
               submitted_by_type, submitted_at, synced_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        params: [
          row.id, row.assignment_id, row.idempotency_key, row.reading_value,
          row.status_code, newPhotoUrl, row.note,
          row.gps_lat, row.gps_lng, row.gps_accuracy,
          row.is_anomalous ? 1 : 0, row.anomaly_reason,
          row.source || 'agent', row.submitted_by_type || 'agent',
          row.submitted_at?.toISOString?.() ?? null,
          row.synced_at?.toISOString?.() ?? null,
        ],
      }]);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  ❌  reading ${row.id}: ${err.message}`);
    }
    await sleep(50); // light pause per row; photo re-upload is already slow
  }
  console.log(`    ✔  ${ok} inserted, ${fail} failed.`);
}

async function migrateAttendance() {
  await migrateSimple(
    'attendance',
    `SELECT id, agent_id, date, login_time, last_active, is_on_leave FROM attendance`,
    row => ({
      sql:    `INSERT OR IGNORE INTO attendance (id, agent_id, date, login_time, last_active, is_on_leave) VALUES (?,?,?,?,?,?)`,
      params: [row.id, row.agent_id, row.date?.toISOString?.() ?? String(row.date), row.login_time?.toISOString?.() ?? null, row.last_active?.toISOString?.() ?? null, row.is_on_leave ? 1 : 0],
    })
  );
}

async function migrateRevisits() {
  await migrateSimple(
    'revisits',
    `SELECT id, property_id, cycle_id, scheduled_date, attempt_count, created_by, created_at FROM revisits`,
    row => ({
      sql:    `INSERT OR IGNORE INTO revisits (id, property_id, cycle_id, scheduled_date, attempt_count, created_by, created_at) VALUES (?,?,?,?,?,?,?)`,
      params: [row.id, row.property_id, row.cycle_id, row.scheduled_date?.toISOString?.() ?? null, row.attempt_count, row.created_by, row.created_at?.toISOString?.() ?? null],
    })
  );
}

async function migrateWhatsappLogs() {
  await migrateSimple(
    'whatsapp_logs',
    `SELECT id, property_id, phone_number, status, token, consumer_name, cycle_id, sent_at FROM whatsapp_logs`,
    row => ({
      sql:    `INSERT OR IGNORE INTO whatsapp_logs (id, property_id, phone_number, status, token, consumer_name, cycle_id, sent_at) VALUES (?,?,?,?,?,?,?,?)`,
      params: [row.id, row.property_id, row.phone_number, row.status, row.token, row.consumer_name, row.cycle_id, row.sent_at?.toISOString?.() ?? null],
    })
  );
}

// ──────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────
async function main() {
  console.log('🚀  Starting FieldWatt → Cloudflare migration\n');

  // Run in dependency order (FK constraints)
  await migrateCycles();
  await migrateAreas();
  await migrateAdmins();
  await migrateImports();
  await migrateAgents();
  await migrateProperties();
  await migrateAssignments();
  await migrateReadings();      // heaviest — re-uploads photos to R2
  await migrateAttendance();
  await migrateRevisits();
  await migrateWhatsappLogs();

  console.log('\n🎉  Migration complete!');
  await pgPool.end();
}

main().catch(async err => {
  console.error('\n❌  Migration failed:', err.message);
  await pgPool.end();
  process.exit(1);
});
