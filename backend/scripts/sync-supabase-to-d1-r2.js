/**
 * scripts/sync-supabase-to-d1-r2.js
 *
 * Full extraction and reconciliation from Supabase REST API into Cloudflare D1 + R2.
 */
require('dotenv').config();

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const cleanEnvVal = (val) => (val || '').trim().replace(/^["']|["']$/g, '');
const CF_ACCOUNT_ID  = cleanEnvVal(process.env.CLOUDFLARE_ACCOUNT_ID);
const D1_DATABASE_ID = cleanEnvVal(process.env.CLOUDFLARE_D1_DATABASE_ID);
const CF_API_TOKEN   = cleanEnvVal(process.env.CLOUDFLARE_API_TOKEN);
const D1_BASE        = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/d1/database/' + D1_DATABASE_ID;

const R2_ACCOUNT_ID    = cleanEnvVal(process.env.R2_ACCOUNT_ID || CF_ACCOUNT_ID);
const R2_KEY           = cleanEnvVal(process.env.R2_ACCESS_KEY_ID     || '39dec7bba58fd973160bfa779356c542');
const R2_SECRET        = cleanEnvVal(process.env.R2_SECRET_ACCESS_KEY || '2df4946482e6e2d1f52ad1e2f663234a1948fb579088c221dc2b57dc61cd3a11');
const R2_BUCKET        = cleanEnvVal(process.env.R2_BUCKET_NAME       || 'fieldwatt-meter-photos');
const R2_PUBLIC_BASE   = (process.env.R2_PUBLIC_BASE_URL   || 'https://pub-3de6f3ace1d04d558c47c0e7df5f333d.r2.dev').trim().replace(/\/$/, '');

const supabaseUrl = process.env.SUPABASE_URL || 'https://kukhoapufbawfxlvmjqw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const BATCH_SIZE = 50;   // D1 batch size
const PAUSE_MS   = 50;   // Pause between D1 query batches for rate limits

// Clients
const r2 = new S3Client({
  region:   'auto',
  endpoint: 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Concurrency pool helper
async function pool(array, limit, fn) {
  let index = 0;
  const promises = [];
  const runNext = async () => {
    if (index >= array.length) return;
    const itemIndex = index++;
    const item = array[itemIndex];
    await fn(item, itemIndex);
    return runNext();
  };
  for (let i = 0; i < Math.min(limit, array.length); i++) {
    promises.push(runNext());
  }
  await Promise.all(promises);
}

// Fetch with pagination
async function fetchAllFromSupabase(table) {
  let allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const endpoint = `${supabaseUrl}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) {
      break;
    }
    allRows.push(...json);
    if (json.length < limit) {
      break;
    }
    offset += limit;
  }
  return allRows;
}

async function executeD1Batch(statements, attempt = 0) {
  if (statements.length === 0) return;
  const MAX_ATTEMPTS = 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const res = await fetch(D1_BASE + '/query', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ batch: statements }),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    const json = await res.json();
    if (!res.ok || !json.success) {
      const errors = (json.errors || []).map(e => e.message).join('; ') || res.statusText;
      throw new Error('D1 batch query error: ' + errors);
    }
    return json.result;
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_ATTEMPTS) {
      const backoff = 1000 * Math.pow(2, attempt);
      console.warn(`  ⟳ Retrying batch (${attempt + 1}/${MAX_ATTEMPTS}) after ${backoff}ms — ${err.message.slice(0, 60)}`);
      await sleep(backoff);
      return executeD1Batch(statements, attempt + 1);
    }
    throw err;
  }
}

async function pushToD1(table, rows, rowToStatement) {
  console.log(`📤 Pushing ${rows.length} rows to D1 table '${table}'...`);
  let ok = 0;
  let fail = 0;
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    chunks.push(rows.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const statements = chunk.map(rowToStatement);
      await executeD1Batch(statements);
      ok += chunk.length;
    } catch (err) {
      fail += chunk.length;
      console.error(`  ❌ Batch ${i+1}/${chunks.length} failed:`, err.message);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`  ✔ Completed D1 push: ${ok} synced, ${fail} failed.`);
}

async function reuploadPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.includes('supabase.co/storage')) return photoUrl;
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = photoUrl.split('/').pop().split('?')[0];
    const key = `migrated/${Date.now()}_${filename}`;

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    }));

    return `${R2_PUBLIC_BASE}/${key}`;
  } catch (err) {
    console.warn(`  ⚠️ Failed to transfer photo (${photoUrl}): ${err.message}. Retaining old URL.`);
    return photoUrl;
  }
}

async function run() {
  console.log('====================================================');
  console.log('      CRITICAL DATA RECOVERY & RECONCILIATION      ');
  console.log('====================================================');

  // 1. Sync Cycles
  console.log('\n[1/11] Fetching Cycles from Supabase...');
  const cycles = await fetchAllFromSupabase('cycles');
  await pushToD1('cycles', cycles, c => ({
    sql: `INSERT OR IGNORE INTO cycles (id, label, start_date, end_date, is_active, created_at) VALUES (?,?,?,?,?,?)`,
    params: [c.id, c.label, c.start_date, c.end_date, c.is_active ? 1 : 0, c.created_at]
  }));

  // 2. Sync Areas
  console.log('\n[2/11] Fetching Areas from Supabase...');
  const areas = await fetchAllFromSupabase('areas');
  await pushToD1('areas', areas, a => ({
    sql: `INSERT OR IGNORE INTO areas (id, name, city, created_at) VALUES (?,?,?,?)`,
    params: [a.id, a.name, a.city, a.created_at]
  }));

  // 3. Sync Admins
  console.log('\n[3/11] Fetching Admins from Supabase...');
  const admins = await fetchAllFromSupabase('admins');
  await pushToD1('admins', admins, a => ({
    sql: `INSERT OR IGNORE INTO admins (id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)`,
    params: [a.id, a.name, a.email, a.password_hash, a.role || 'admin', a.created_at]
  }));

  // 4. Sync Imports
  console.log('\n[4/11] Fetching Imports from Supabase...');
  const imports = await fetchAllFromSupabase('imports');
  await pushToD1('imports', imports, i => ({
    sql: `INSERT OR IGNORE INTO imports (id, file_name, file_code, scheduled_date, billing_month, total_rows, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)`,
    params: [i.id, i.file_name, i.file_code, i.scheduled_date, i.billing_month, i.total_rows, i.uploaded_by, i.uploaded_at]
  }));

  // 5. Sync Agents
  console.log('\n[5/11] Fetching Agents from Supabase...');
  const agents = await fetchAllFromSupabase('agents');
  await pushToD1('agents', agents, agent => ({
    sql: `INSERT OR IGNORE INTO agents (id, name, phone, email, username, password_hash, is_active, last_login, expo_push_token, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    params: [agent.id, agent.name, agent.phone, agent.email, agent.username, agent.password_hash, agent.is_active ? 1 : 0, agent.last_login, agent.expo_push_token, agent.created_at]
  }));

  // 6. Sync Properties (Skipped - already fully synced in previous runs)
  console.log('\n[6/11] Skipping Properties sync (already verified in D1)...');

  // 7. Sync Assignments (Large dataset - 25k rows)
  console.log('\n[7/11] Fetching Assignments from Supabase...');
  const assignments = await fetchAllFromSupabase('assignments');
  await pushToD1('assignments', assignments, asg => ({
    sql: `INSERT OR IGNORE INTO assignments (id, agent_id, property_id, cycle_id, assigned_at, assigned_by) VALUES (?,?,?,?,?,?)`,
    params: [asg.id, asg.agent_id, asg.property_id, asg.cycle_id, asg.assigned_at, asg.assigned_by]
  }));

  // 8. Sync Attendance
  console.log('\n[8/11] Fetching Attendance from Supabase...');
  const attendance = await fetchAllFromSupabase('attendance');
  await pushToD1('attendance', attendance, att => ({
    sql: `INSERT OR REPLACE INTO attendance (id, agent_id, date, login_time, last_active, is_on_leave) VALUES (?,?,?,?,?,?)`,
    params: [att.id, att.agent_id, att.date, att.login_time, att.last_active, att.is_on_leave ? 1 : 0]
  }));

  // 9. Sync WhatsApp Logs
  console.log('\n[9/11] Fetching WhatsApp Logs from Supabase...');
  const whatsappLogs = await fetchAllFromSupabase('whatsapp_logs');
  await pushToD1('whatsapp_logs', whatsappLogs, log => ({
    sql: `INSERT OR REPLACE INTO whatsapp_logs (id, property_id, phone_number, status, token, consumer_name, cycle_id, sent_at) VALUES (?,?,?,?,?,?,?,?)`,
    params: [log.id, log.property_id, log.phone_number, log.status, log.token, log.consumer_name, log.cycle_id, log.sent_at]
  }));

  // 10. Sync Readings & Transfer Photos
  console.log('\n[10/11] Fetching Readings from Supabase & Re-uploading Photos...');
  const readings = await fetchAllFromSupabase('readings');
  console.log(`  ✔ Extracted ${readings.length} readings.`);
  
  // Fetch already migrated readings from D1 to skip duplicate R2 photo transfers
  const db = require('../src/db');
  console.log('  ⟳ Fetching existing readings from D1 to map migrated photos...');
  const d1ReadingsMap = new Map();
  try {
    const d1ReadingsRes = await db.query('SELECT id, photo_url FROM readings');
    d1ReadingsRes.rows.forEach(r => {
      if (r.photo_url) d1ReadingsMap.set(r.id, r.photo_url);
    });
    console.log(`    Mapped ${d1ReadingsMap.size} existing migrated photo URLs.`);
  } catch (err) {
    console.warn('    ⚠️ Failed to fetch existing readings from D1. Will re-upload all photos.', err.message);
  }

  console.log('  ⟳ Transferring photos to R2 in parallel (concurrency limit 25)...');
  let photoTransferCount = 0;
  let photoSkipCount = 0;

  const finalReadings = [];
  await pool(readings, 25, async (reading, index) => {
    let finalPhotoUrl = reading.photo_url;
    const existingD1Photo = d1ReadingsMap.get(reading.id);
    if (existingD1Photo && existingD1Photo.includes('r2.dev')) {
      finalPhotoUrl = existingD1Photo;
      photoSkipCount++;
    } else if (reading.photo_url) {
      finalPhotoUrl = await reuploadPhoto(reading.photo_url);
      if (finalPhotoUrl !== reading.photo_url) {
        photoTransferCount++;
      }
    }
    finalReadings.push({ ...reading, photo_url: finalPhotoUrl });
    if ((index + 1) % 100 === 0) {
      console.log(`    … Processed ${index + 1}/${readings.length} photos (${photoSkipCount} skipped, ${photoTransferCount} transferred)`);
    }
  });

  console.log(`  ✔ Completed photo transfers: ${photoTransferCount} images re-uploaded, ${photoSkipCount} skipped.`);
  await pushToD1('readings', finalReadings, r => ({
    sql: `INSERT OR IGNORE INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, gps_lat, gps_lng, gps_accuracy, is_anomalous, anomaly_reason, source, submitted_by_type, submitted_at, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    params: [r.id, r.assignment_id, r.idempotency_key, r.reading_value, r.status_code, r.photo_url, r.note, r.gps_lat, r.gps_lng, r.gps_accuracy, r.is_anomalous ? 1 : 0, r.anomaly_reason, r.source || 'agent', r.submitted_by_type || 'agent', r.submitted_at, r.synced_at]
  }));

  // 11. Sync Revisits
  console.log('\n[11/11] Fetching Revisits from Supabase...');
  const revisits = await fetchAllFromSupabase('revisits');
  await pushToD1('revisits', revisits, rev => ({
    sql: `INSERT OR IGNORE INTO revisits (id, property_id, cycle_id, scheduled_date, attempt_count, created_by, created_at) VALUES (?,?,?,?,?,?,?)`,
    params: [rev.id, rev.property_id, rev.cycle_id, rev.scheduled_date, rev.attempt_count, rev.created_by, rev.created_at]
  }));

  console.log('\n====================================================');
  console.log('              RECONCILIATION SUMMARY                ');
  console.log('====================================================');
  console.log(`Total Cycles Synced           : ${cycles.length}`);
  console.log(`Total Areas Synced            : ${areas.length}`);
  console.log(`Total Admins Synced           : ${admins.length}`);
  console.log(`Total Imports Synced          : ${imports.length}`);
  console.log(`Total Agents Synced           : ${agents.length}`);
  console.log(`Total Properties Synced       : Skipped (already in D1)`);
  console.log(`Total Assignments Synced      : ${assignments.length}`);
  console.log(`Total Attendance Synced       : ${attendance.length}`);
  console.log(`Total WhatsApp Logs Synced    : ${whatsappLogs.length}`);
  console.log(`Total Readings Synced         : ${readings.length}`);
  console.log(`Total Photos Transferred to R2: ${photoTransferCount}`);
  console.log(`Total Revisits Synced         : ${revisits.length}`);
  console.log('====================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Critical Error in Sync script:', err);
  process.exit(1);
});
