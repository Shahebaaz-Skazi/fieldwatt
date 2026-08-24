/**
 * scripts/audit-system-health.js
 *
 * Non-destructive automated health check script for Cloudflare D1 & R2 integrations.
 * Measures exact latency, tests read/write capabilities, and verifies configurations.
 */
require('dotenv').config();

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const d1 = require('../src/utils/db');

// R2 Config
const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_KEY           = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET        = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET        = process.env.R2_BUCKET_NAME || 'fieldwatt-meter-photos';
const R2_PUBLIC_BASE   = (process.env.R2_PUBLIC_BASE_URL || 'https://pub-3de6f3ace1d04d558c47c0e7df5f333d.r2.dev').replace(/\/$/, '');

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
});

async function testD1() {
  console.log('📡  Auditing Cloudflare D1 Database Connection …');
  
  // 1. Test Select Latency
  const startSelect = Date.now();
  const selectRes = await d1.query('SELECT 1 as connection_test');
  const latencySelect = Date.now() - startSelect;

  if (!selectRes.rows || selectRes.rows[0]?.connection_test !== 1) {
    throw new Error('D1 Select validation failed: Unexpected payload response.');
  }
  console.log(`  ✔  SELECT latency: ${latencySelect}ms`);

  // 2. Test Write/Delete Transaction Cycle (Non-destructive)
  const testId = 'health-test-' + Date.now();
  
  const startInsert = Date.now();
  // Using SQLite dialect
  await d1.query(
    `INSERT INTO areas (id, name, city) VALUES (?, ?, 'HEALTH_CHECK_TEMP')`,
    [testId, 'HEALTH_TEST_AREA_' + Date.now()]
  );
  const latencyInsert = Date.now() - startInsert;
  console.log(`  ✔  INSERT latency: ${latencyInsert}ms`);

  const startDelete = Date.now();
  await d1.query('DELETE FROM areas WHERE id = ?', [testId]);
  const latencyDelete = Date.now() - startDelete;
  console.log(`  ✔  DELETE latency: ${latencyDelete}ms`);

  return { latencySelect, latencyInsert, latencyDelete };
}

async function testR2() {
  console.log('\n📡  Auditing Cloudflare R2 Object Storage Connection …');

  const testKey = `health_check_temp_${Date.now()}.txt`;
  const testContent = Buffer.from('1'); // 1-byte payload
  
  // 1. Test Upload
  const startUpload = Date.now();
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: testKey,
    Body: testContent,
    ContentType: 'text/plain',
  }));
  const latencyUpload = Date.now() - startUpload;
  console.log(`  ✔  Upload (1-byte) latency: ${latencyUpload}ms`);

  // 2. Test Read / Public Domain URL Validation
  const startRead = Date.now();
  const publicUrl = `${R2_PUBLIC_BASE}/${testKey}`;
  const response = await fetch(publicUrl);
  const latencyRead = Date.now() - startRead;
  
  if (!response.ok) {
    throw new Error(`R2 public read failed. URL: ${publicUrl}, HTTP ${response.status}`);
  }
  const body = await response.text();
  if (body !== '1') {
    throw new Error(`R2 payload validation failed. Expected "1", got "${body}"`);
  }
  console.log(`  ✔  Public read latency (${publicUrl}): ${latencyRead}ms`);

  // 3. Test Delete
  const startDelete = Date.now();
  await r2.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: testKey,
  }));
  const latencyDelete = Date.now() - startDelete;
  console.log(`  ✔  Delete latency: ${latencyDelete}ms`);

  return { latencyUpload, latencyRead, latencyDelete, publicUrl };
}

async function main() {
  console.log('====================================================');
  console.log('         FIELDWATT CLOUDFLARE SYSTEM AUDIT           ');
  console.log('====================================================');

  let d1Ok = false, r2Ok = false;
  let d1Times = {}, r2Times = {};

  try {
    d1Times = await testD1();
    d1Ok = true;
  } catch (err) {
    console.error('❌  D1 Audit Failed:', err.message);
  }

  try {
    r2Times = await testR2();
    r2Ok = true;
  } catch (err) {
    console.error('❌  R2 Audit Failed:', err.message);
  }

  console.log('\n====================================================');
  console.log('                    AUDIT REPORT                    ');
  console.log('====================================================');
  console.log(`Cloudflare D1 Database Status:   ${d1Ok ? '🟢 PASS' : '🔴 FAIL'}`);
  if (d1Ok) {
    console.log(`  - SELECT Latency:              ${d1Times.latencySelect}ms`);
    console.log(`  - INSERT Latency:              ${d1Times.latencyInsert}ms`);
    console.log(`  - DELETE Latency:              ${d1Times.latencyDelete}ms`);
  }

  console.log(`Cloudflare R2 Storage Status:    ${r2Ok ? '🟢 PASS' : '🔴 FAIL'}`);
  if (r2Ok) {
    console.log(`  - Upload Latency:              ${r2Times.latencyUpload}ms`);
    console.log(`  - Public Fetch Latency:        ${r2Times.latencyRead}ms`);
    console.log(`  - Delete Latency:              ${r2Times.latencyDelete}ms`);
    console.log(`  - Verified CDN Prefix:         ${R2_PUBLIC_BASE}`);
  }
  console.log('====================================================');

  if (!d1Ok || !r2Ok) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
