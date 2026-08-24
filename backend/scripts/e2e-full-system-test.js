/**
 * scripts/e2e-full-system-test.js
 *
 * Comprehensive E2E system integration test for Cloudflare D1 and R2.
 * Inserts mock records across all 10 tables, performs R2 upload/fetch/delete,
 * validates integrity, and cleans up completely.
 */
require('dotenv').config();

const crypto = require('crypto');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const d1 = require('../src/utils/db');
const { uploadBuffer, BUCKET_NAME, PUBLIC_BASE_URL } = require('../src/utils/r2Storage');

// Colors for terminal log
const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const CYAN   = '\x1b[36m';

// S3 Client for direct deletion test
const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_KEY           = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET        = process.env.R2_SECRET_ACCESS_KEY;

const r2Client = new S3Client({
  region:   'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
});

// Mock Data Generators with prefix
const testPrefix = 'TEST_E2E_' + Date.now().toString().slice(-6);

const mockIds = {
  cycle:      crypto.randomUUID(),
  area:       crypto.randomUUID(),
  admin:      crypto.randomUUID(),
  import:     crypto.randomUUID(),
  agent:      crypto.randomUUID(),
  property:   crypto.randomUUID(),
  assignment: crypto.randomUUID(),
  reading:    crypto.randomUUID(),
  attendance: crypto.randomUUID(),
  whatsapp:   crypto.randomUUID(),
};

const mockData = {
  cycle: {
    id: mockIds.cycle,
    label: `${testPrefix}_CYCLE`,
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    is_active: 1,
  },
  area: {
    id: mockIds.area,
    name: `${testPrefix}_AREA`,
    city: 'TEST_CITY',
  },
  admin: {
    id: mockIds.admin,
    name: `${testPrefix}_ADMIN`,
    email: `${testPrefix}_admin@fieldwatt.com`,
    password_hash: '$2b$10$abcdefghijklmnopqrstuv',
  },
  import: {
    id: mockIds.import,
    file_name: `${testPrefix}_file.xlsx`,
    file_code: `${testPrefix}_CODE`,
    scheduled_date: '2026-08-24',
    billing_month: 'August 2026',
    total_rows: 100,
    uploaded_by: mockIds.admin,
  },
  agent: {
    id: mockIds.agent,
    name: `${testPrefix}_AGENT`,
    phone: `+9199${Date.now().toString().slice(-8)}`,
    email: `${testPrefix}_agent@fieldwatt.com`,
    username: `${testPrefix}_agent_user`,
    password_hash: '$2b$10$abcdefghijklmnopqrstuv',
    is_active: 1,
  },
  property: {
    id: mockIds.property,
    area_id: mockIds.area,
    import_id: mockIds.import,
    serial_no: `${testPrefix}_PROP_SERIAL`,
    consumer_name: `${testPrefix}_CONSUMER`,
    address: '123 E2E Test Street, FieldWatt Town',
    meter_no: `${testPrefix}_METER_123`,
    property_type: 'bungalow',
    society: 'E2E Test Society',
    sub_society: 'Sub-Society A',
    wing_code: 'W1',
    phone_number: '+919876543210',
    lat: 18.5204,
    lng: 73.8567,
    raw_sap_data: JSON.stringify({ test: 'sap_data' }),
  },
  assignment: {
    id: mockIds.assignment,
    agent_id: mockIds.agent,
    property_id: mockIds.property,
    cycle_id: mockIds.cycle,
    assigned_by: mockIds.admin,
  },
  reading: {
    id: mockIds.reading,
    assignment_id: mockIds.assignment,
    idempotency_key: crypto.randomUUID(),
    reading_value: 345.67,
    status_code: 'reading_taken',
    photo_url: null, // Will be updated after R2 upload test
    note: 'E2E verification reading notes',
    gps_lat: 18.5205,
    gps_lng: 73.8568,
    gps_accuracy: 5.4,
    is_anomalous: 0,
    anomaly_reason: null,
    source: 'customer_self_reading',
    submitted_by_type: 'customer',
    submitted_at: '2026-08-24T13:38:00.000Z',
  },
  attendance: {
    id: mockIds.attendance,
    agent_id: mockIds.agent,
    date: '2026-08-24',
    login_time: '2026-08-24T08:00:00.000Z',
    last_active: '2026-08-24T13:38:00.000Z',
    is_on_leave: 0,
  },
  whatsapp: {
    id: mockIds.whatsapp,
    property_id: mockIds.property,
    phone_number: '+919876543210',
    status: 'sent',
    token: `token-${testPrefix}`,
    consumer_name: `${testPrefix}_CONSUMER`,
    cycle_id: mockIds.cycle,
  },
};

async function runTest() {
  console.log(`\n${CYAN}====================================================${RESET}`);
  console.log(`${CYAN}         FIELDWATT E2E SYSTEM INTEGRATION TEST       ${RESET}`);
  console.log(`${CYAN}====================================================${RESET}\n`);

  const results = {
    r2: { name: 'R2 Storage Upload/Fetch', status: 'PENDING', latency: 0 },
    cycle: { name: 'Table: cycles', status: 'PENDING', latency: 0 },
    area: { name: 'Table: areas', status: 'PENDING', latency: 0 },
    admin: { name: 'Table: admins', status: 'PENDING', latency: 0 },
    import: { name: 'Table: imports', status: 'PENDING', latency: 0 },
    agent: { name: 'Table: agents', status: 'PENDING', latency: 0 },
    property: { name: 'Table: properties', status: 'PENDING', latency: 0 },
    assignment: { name: 'Table: assignments', status: 'PENDING', latency: 0 },
    reading: { name: 'Table: readings', status: 'PENDING', latency: 0 },
    attendance: { name: 'Table: attendance', status: 'PENDING', latency: 0 },
    whatsapp: { name: 'Table: whatsapp_logs', status: 'PENDING', latency: 0 },
  };

  const r2Key = `test_e2e_${Date.now()}.png`;

  try {
    // ──────────────────────────────────────────────────
    // STEP 1 & 2: R2 Storage Test
    // ──────────────────────────────────────────────────
    console.log(`${BLUE}[1/5] Testing Cloudflare R2 Upload …${RESET}`);
    const r2Start = Date.now();
    // 1x1 Transparent PNG Buffer
    const mockImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    
    const photoUrl = await uploadBuffer(r2Key, mockImageBuffer, 'image/png');
    results.r2.latency = Date.now() - r2Start;

    if (!photoUrl.startsWith(PUBLIC_BASE_URL)) {
      throw new Error(`R2 URL does not match public prefix. Returned: ${photoUrl}`);
    }
    
    // Verify readable
    const fetchRes = await fetch(photoUrl);
    if (!fetchRes.ok) {
      throw new Error(`Fetch check failed on uploaded R2 object. Status: ${fetchRes.status}`);
    }
    
    results.r2.status = 'SUCCESS';
    mockData.reading.photo_url = photoUrl;
    console.log(`      ${GREEN}✔ R2 Upload & Fetch passed (${results.r2.latency}ms) URL: ${photoUrl}${RESET}\n`);

    // ──────────────────────────────────────────────────
    // STEP 3: D1 Database Insertion Test
    // ──────────────────────────────────────────────────
    console.log(`${BLUE}[2/5] Inserting Mock Data into D1 …${RESET}`);

    // Order is critical to respect foreign key constraints
    const insertOrder = ['cycle', 'area', 'admin', 'import', 'agent', 'property', 'assignment', 'reading', 'attendance', 'whatsapp'];
    
    for (const key of insertOrder) {
      const start = Date.now();
      let sql = '';
      let params = [];
      const item = mockData[key];

      switch (key) {
        case 'cycle':
          sql = 'INSERT INTO cycles (id, label, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?)';
          params = [item.id, item.label, item.start_date, item.end_date, item.is_active];
          break;
        case 'area':
          sql = 'INSERT INTO areas (id, name, city) VALUES (?, ?, ?)';
          params = [item.id, item.name, item.city];
          break;
        case 'admin':
          sql = 'INSERT INTO admins (id, name, email, password_hash) VALUES (?, ?, ?, ?)';
          params = [item.id, item.name, item.email, item.password_hash];
          break;
        case 'import':
          sql = 'INSERT INTO imports (id, file_name, file_code, scheduled_date, billing_month, total_rows, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)';
          params = [item.id, item.file_name, item.file_code, item.scheduled_date, item.billing_month, item.total_rows, item.uploaded_by];
          break;
        case 'agent':
          sql = 'INSERT INTO agents (id, name, phone, email, username, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)';
          params = [item.id, item.name, item.phone, item.email, item.username, item.password_hash, item.is_active];
          break;
        case 'property':
          sql = 'INSERT INTO properties (id, area_id, import_id, serial_no, consumer_name, address, meter_no, property_type, society, sub_society, wing_code, phone_number, lat, lng, raw_sap_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
          params = [item.id, item.area_id, item.import_id, item.serial_no, item.consumer_name, item.address, item.meter_no, item.property_type, item.society, item.sub_society, item.wing_code, item.phone_number, item.lat, item.lng, item.raw_sap_data];
          break;
        case 'assignment':
          sql = 'INSERT INTO assignments (id, agent_id, property_id, cycle_id, assigned_by) VALUES (?, ?, ?, ?, ?)';
          params = [item.id, item.agent_id, item.property_id, item.cycle_id, item.assigned_by];
          break;
        case 'reading':
          sql = 'INSERT INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, gps_lat, gps_lng, gps_accuracy, is_anomalous, anomaly_reason, source, submitted_by_type, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
          params = [item.id, item.assignment_id, item.idempotency_key, item.reading_value, item.status_code, item.photo_url, item.note, item.gps_lat, item.gps_lng, item.gps_accuracy, item.is_anomalous, item.anomaly_reason, item.source, item.submitted_by_type, item.submitted_at];
          break;
        case 'attendance':
          sql = 'INSERT INTO attendance (id, agent_id, date, login_time, last_active, is_on_leave) VALUES (?, ?, ?, ?, ?, ?)';
          params = [item.id, item.agent_id, item.date, item.login_time, item.last_active, item.is_on_leave];
          break;
        case 'whatsapp':
          sql = 'INSERT INTO whatsapp_logs (id, property_id, phone_number, status, token, consumer_name, cycle_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
          params = [item.id, item.property_id, item.phone_number, item.status, item.token, item.consumer_name, item.cycle_id];
          break;
      }

      await d1.query(sql, params);
      results[key].latency = Date.now() - start;
      results[key].status = 'SUCCESS';
      console.log(`      ${GREEN}✔ ${results[key].name} inserted successfully (${results[key].latency}ms)${RESET}`);
    }
    console.log();

    // ──────────────────────────────────────────────────
    // STEP 4: Verification / Validation Phase
    // ──────────────────────────────────────────────────
    console.log(`${BLUE}[3/5] Verifying Data Integrity / Fetch Parity …${RESET}`);

    for (const key of insertOrder) {
      const item = mockData[key];
      let sql = '';
      switch (key) {
        case 'cycle':      sql = 'SELECT * FROM cycles WHERE id = ?'; break;
        case 'area':       sql = 'SELECT * FROM areas WHERE id = ?'; break;
        case 'admin':      sql = 'SELECT * FROM admins WHERE id = ?'; break;
        case 'import':     sql = 'SELECT * FROM imports WHERE id = ?'; break;
        case 'agent':      sql = 'SELECT * FROM agents WHERE id = ?'; break;
        case 'property':   sql = 'SELECT * FROM properties WHERE id = ?'; break;
        case 'assignment': sql = 'SELECT * FROM assignments WHERE id = ?'; break;
        case 'reading':    sql = 'SELECT * FROM readings WHERE id = ?'; break;
        case 'attendance': sql = 'SELECT * FROM attendance WHERE id = ?'; break;
        case 'whatsapp':   sql = 'SELECT * FROM whatsapp_logs WHERE id = ?'; break;
      }

      const res = await d1.query(sql, [item.id]);
      if (res.rows.length === 0) {
        throw new Error(`Data Integrity Error: Row not found in ${key} table for ID: ${item.id}`);
      }

      const dbRow = res.rows[0];
      
      // Perform key column assertions
      if (key === 'cycle' && dbRow.label !== item.label) throw new Error(`Cycle mismatch`);
      if (key === 'area' && dbRow.name !== item.name) throw new Error(`Area mismatch`);
      if (key === 'admin' && dbRow.email !== item.email) throw new Error(`Admin mismatch`);
      if (key === 'agent' && dbRow.phone !== item.phone) throw new Error(`Agent mismatch`);
      if (key === 'property' && dbRow.serial_no !== item.serial_no) throw new Error(`Property mismatch`);
      if (key === 'reading' && dbRow.photo_url !== item.photo_url) throw new Error(`Reading photo_url mismatch`);

      console.log(`      ${GREEN}✔ Integrity match verified for: ${key}${RESET}`);
    }
    console.log();

  } catch (err) {
    console.error(`\n${RED}❌ E2E Integration Test Failed: ${err.message}${RESET}`);
  } finally {
    // ──────────────────────────────────────────────────
    // STEP 5: Safe Teardown & Cleanup
    // ──────────────────────────────────────────────────
    console.log(`${BLUE}[4/5] Executing Safe Teardown & Cleanup …${RESET}`);

    // D1 Cleanup (Delete in reverse dependency order)
    const cleanupOrder = ['whatsapp', 'attendance', 'reading', 'assignment', 'property', 'agent', 'import', 'admin', 'area', 'cycle'];
    for (const key of cleanupOrder) {
      try {
        let sql = '';
        switch (key) {
          case 'cycle':      sql = 'DELETE FROM cycles WHERE id = ?'; break;
          case 'area':       sql = 'DELETE FROM areas WHERE id = ?'; break;
          case 'admin':      sql = 'DELETE FROM admins WHERE id = ?'; break;
          case 'import':     sql = 'DELETE FROM imports WHERE id = ?'; break;
          case 'agent':      sql = 'DELETE FROM agents WHERE id = ?'; break;
          case 'property':   sql = 'DELETE FROM properties WHERE id = ?'; break;
          case 'assignment': sql = 'DELETE FROM assignments WHERE id = ?'; break;
          case 'reading':    sql = 'DELETE FROM readings WHERE id = ?'; break;
          case 'attendance': sql = 'DELETE FROM attendance WHERE id = ?'; break;
          case 'whatsapp':   sql = 'DELETE FROM whatsapp_logs WHERE id = ?'; break;
        }
        await d1.query(sql, [mockIds[key]]);
        console.log(`      ${GREEN}✔ Removed ${key} test record${RESET}`);
      } catch (cleanErr) {
        console.warn(`      ${YELLOW}⚠️ Failed to delete ${key} record: ${cleanErr.message}${RESET}`);
      }
    }

    // R2 Object deletion
    try {
      await r2Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
      }));
      console.log(`      ${GREEN}✔ Removed test R2 object${RESET}`);
    } catch (r2CleanErr) {
      console.warn(`      ${YELLOW}⚠️ Failed to delete R2 test object: ${r2CleanErr.message}${RESET}`);
    }

    // ──────────────────────────────────────────────────
    // STEP 6: E2E Summary Report
    // ──────────────────────────────────────────────────
    console.log(`\n${CYAN}====================================================${RESET}`);
    console.log(`${CYAN}                 E2E SUMMARY REPORT                 ${RESET}`);
    console.log(`${CYAN}====================================================${RESET}`);

    Object.keys(results).forEach(k => {
      const step = results[k];
      const statusColor = step.status === 'SUCCESS' ? GREEN : RED;
      console.log(
        `${step.name.padEnd(30)}: [${statusColor}${step.status}${RESET}] (${step.latency}ms)`
      );
    });
    console.log(`${CYAN}====================================================${RESET}\n`);
  }
}

runTest().catch(err => {
  console.error('Fatal E2E test failure:', err);
  process.exit(1);
});
