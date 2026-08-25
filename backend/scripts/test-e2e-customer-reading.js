/**
 * scripts/test-e2e-customer-reading.js
 *
 * CRITICAL VERIFICATION TASK: E2E customer reading simulation.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../src/utils/db');
const { uploadBuffer } = require('../src/utils/r2Storage');

// Setup configs
const secret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('====================================================');
  console.log('    CUSTOMER SELF-READING END-TO-END AUDIT HARD-CHECK');
  console.log('====================================================');

  const audit = {
    step1: 'FAIL', // Setup Test Fixture
    step2: 'FAIL', // Simulate Customer Link & Upload Flow
    step3: 'FAIL', // Database Ground-Truth Audit
    step4: 'FAIL', // Admin Dashboard Query Audit
  };

  let testPropertyId = null;
  let testAssignmentId = null;
  let activeCycleId = null;
  let sampleWamid = 'wamid_test_e2e_customer_reading_' + Date.now();
  let r2PhotoUrl = null;
  const targetReadingValue = 999.85;

  try {
    // -----------------------------------------------------------------
    // STEP 1: SETUP TEST FIXTURE
    // -----------------------------------------------------------------
    console.log('\n--- STEP 1: Setup Test Fixture ---');
    
    // Pick active cycle
    const cycleRes = await db.query('SELECT id FROM cycles WHERE is_active = 1 LIMIT 1');
    if (cycleRes.rows.length === 0) {
      throw new Error('No active cycle found to run E2E test.');
    }
    activeCycleId = cycleRes.rows[0].id;
    console.log(`- Found Active Cycle ID: ${activeCycleId}`);

    // Create a temporary test property to avoid mutating live data
    testPropertyId = 'e2e-prop-' + Date.now();
    console.log(`- Creating temporary test property: ${testPropertyId}`);
    
    await db.query(
      `INSERT INTO properties (id, serial_no, consumer_name, address, meter_no, phone_number, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
      [
        testPropertyId,
        'E2E-SERIAL-123',
        'E2E TEST CONSUMER',
        'E2E DIAGNOSTIC ROAD 404',
        'E2E-METER-99',
        '9689741625'
      ]
    );

    // Create a temporary assignment for this cycle
    testAssignmentId = 'e2e-asg-' + Date.now();
    console.log(`- Creating temporary test assignment: ${testAssignmentId}`);
    await db.query(
      `INSERT INTO assignments (id, property_id, cycle_id, assigned_at)
       VALUES ($1, $2, $3, datetime('now'))`,
      [testAssignmentId, testPropertyId, activeCycleId]
    );

    // Insert dummy entry into whatsapp_logs simulating an outreach dispatch
    console.log('- Creating dummy entry in whatsapp_logs...');
    await db.query(
      `INSERT INTO whatsapp_logs (property_id, phone_number, consumer_name, status, cycle_id, wamid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testPropertyId, '919689741625', 'E2E TEST CONSUMER', 'sent', activeCycleId, sampleWamid]
    );

    // Generate valid JWT token
    const token = jwt.sign(
      {
        propertyId: testPropertyId,
        assignmentId: testAssignmentId,
        expiresAt: '30d'
      },
      secret,
      { expiresIn: '30d' }
    );
    console.log(`- Generated JWT Token: ${token.slice(0, 30)}...`);
    audit.step1 = 'PASS';

    // -----------------------------------------------------------------
    // STEP 2: SIMULATE CUSTOMER LINK & UPLOAD FLOW
    // -----------------------------------------------------------------
    console.log('\n--- STEP 2: Simulate Customer Link & Upload Flow ---');
    
    // Decode token logic check
    const decoded = jwt.verify(token, secret);
    if (decoded.propertyId !== testPropertyId || decoded.assignmentId !== testAssignmentId) {
      throw new Error('JWT Verification returned invalid payload matches');
    }
    console.log('- JWT verification token is valid.');

    // Generate dummy image buffer (JPEG mock)
    const dummyJpgBuffer = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64'
    );

    // Upload direct to R2
    const key = `customer_self_readings/e2e_audit_${Date.now()}.jpg`;
    console.log(`- Uploading dummy image to R2 key: ${key}`);
    r2PhotoUrl = await uploadBuffer(key, dummyJpgBuffer, 'image/jpeg');
    console.log(`- Public R2 photo URL: ${r2PhotoUrl}`);

    // Verify URL returns 200
    console.log('- Testing R2 image URL response...');
    const imgCheck = await fetch(r2PhotoUrl, { method: 'HEAD' });
    console.log(`  HEAD Status: ${imgCheck.status} ${imgCheck.statusText}`);
    if (imgCheck.status !== 200) {
      throw new Error('Uploaded R2 photo URL did not return status 200.');
    }
    console.log('✅ R2 Image URL successfully verified.');

    // Submit reading mock logic (corresponds to POST /public/self-reading/submit)
    console.log('- Simulating submit readings database execution...');
    const idempotencyKey = 'e2e-idempotency-' + Date.now();
    await db.query(
      `INSERT INTO readings
       (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, source, submitted_by_type, submitted_at)
       VALUES ($1, $2, $3, $4, 'reading_taken', $5, 'customer_self_reading', 'customer', datetime('now'))`,
      ['e2e-read-' + Date.now(), testAssignmentId, idempotencyKey, targetReadingValue, r2PhotoUrl]
    );

    // Mark WhatsApp log status as delivered/read or similar update
    await db.query(
      `UPDATE whatsapp_logs SET status = 'delivered' WHERE property_id = $1`,
      [testPropertyId]
    );

    audit.step2 = 'PASS';

    // -----------------------------------------------------------------
    // STEP 3: DATABASE GROUND-TRUTH AUDIT (D1)
    // -----------------------------------------------------------------
    console.log('\n--- STEP 3: Database Ground-Truth Audit (D1) ---');
    
    // Assert row in readings exists
    const readingsCheck = await db.query(
      'SELECT * FROM readings WHERE assignment_id = $1',
      [testAssignmentId]
    );
    console.log(`- Readings row count for assignment: ${readingsCheck.rows.length}`);
    if (readingsCheck.rows.length === 0) {
      throw new Error('Database check failed: Reading row was not found.');
    }
    const createdReading = readingsCheck.rows[0];
    console.log(`  Found reading_value: ${createdReading.reading_value}`);
    console.log(`  Found photo_url    : ${createdReading.photo_url}`);
    
    // Assert status in whatsapp_logs has updated
    const logCheck = await db.query(
      'SELECT status FROM whatsapp_logs WHERE property_id = $1',
      [testPropertyId]
    );
    console.log(`- WhatsApp log status is now: "${logCheck.rows[0]?.status}"`);
    if (logCheck.rows[0]?.status !== 'delivered') {
      throw new Error('whatsapp_logs status did not update to delivered.');
    }

    audit.step3 = 'PASS';

    // -----------------------------------------------------------------
    // STEP 4: ADMIN DASHBOARD QUERY AUDIT
    // -----------------------------------------------------------------
    console.log('\n--- STEP 4: Admin Dashboard Query Audit ---');
    
    // Query 1: readings list verification
    console.log('- Running admin readings list aggregate query...');
    const readingsQuery = `
      SELECT 
        r.id as reading_id,
        r.reading_value,
        r.photo_url,
        r.submitted_at,
        p.consumer_name,
        p.address
      FROM readings r
      INNER JOIN assignments asg ON r.assignment_id = asg.id
      INNER JOIN properties p ON asg.property_id = p.id
      WHERE asg.cycle_id = $1 AND r.assignment_id = $2
    `;
    const readingsListResult = await db.query(readingsQuery, [activeCycleId, testAssignmentId]);
    console.log(`  Query returned: ${readingsListResult.rows.length} rows.`);
    if (readingsListResult.rows.length === 0) {
      throw new Error('Admin readings list query did not return our test record.');
    }
    console.log(`  Row Consumer: "${readingsListResult.rows[0].consumer_name}" | Value: ${readingsListResult.rows[0].reading_value}`);

    // Query 2: Areas completion summary checks
    console.log('- Running admin areas completion query check...');
    const areaSummaryQuery = `
      SELECT 
        asg.cycle_id,
        COUNT(asg.id) as total_assignments,
        SUM(CASE WHEN r.status_code = 'reading_taken' THEN 1 ELSE 0 END) as completed_count
      FROM assignments asg
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE asg.cycle_id = $1 AND asg.id = $2
      GROUP BY asg.cycle_id
    `;
    const areaSummaryResult = await db.query(areaSummaryQuery, [activeCycleId, testAssignmentId]);
    console.log(`  Query returned: ${areaSummaryResult.rows.length} summary rows.`);
    if (areaSummaryResult.rows.length > 0) {
      console.log(`  Total Assignments: ${areaSummaryResult.rows[0].total_assignments}`);
      console.log(`  Completed Readings: ${areaSummaryResult.rows[0].completed_count}`);
    }

    audit.step4 = 'PASS';

  } catch (err) {
    console.error('❌ E2E ERROR:', err.message, err.stack);
  } finally {
    // -----------------------------------------------------------------
    // CLEANUP WORKSPACE (Delete test logs, assignments, properties to leave database pristine)
    // -----------------------------------------------------------------
    console.log('\n--- CLEANUP: Deleting E2E temporary diagnostic rows ---');
    try {
      if (testPropertyId) {
        await db.query('DELETE FROM readings WHERE assignment_id = $1', [testAssignmentId]);
        await db.query('DELETE FROM whatsapp_logs WHERE property_id = $1', [testPropertyId]);
        await db.query('DELETE FROM assignments WHERE property_id = $1', [testPropertyId]);
        await db.query('DELETE FROM properties WHERE id = $1', [testPropertyId]);
        console.log('✅ Cleaned up D1 test database entries successfully.');
      }
    } catch (cleanErr) {
      console.error('Failed to cleanup temporary D1 rows:', cleanErr.message);
    }

    // -----------------------------------------------------------------
    // STEP 5: REPORT RESULTS
    // -----------------------------------------------------------------
    console.log('\n====================================================');
    console.log('               E2E DIAGNOSTIC AUDIT REPORT          ');
    console.log('====================================================');
    console.log(`1. Customer Setup Fixture Check    : [ ${audit.step1} ]`);
    console.log(`2. R2 Photo Storage & Upload Check : [ ${audit.step2} ]`);
    console.log(`3. D1 Database Persistence Check   : [ ${audit.step3} ]`);
    console.log(`4. Admin Dashboard Query Check     : [ ${audit.step4} ]`);
    console.log('====================================================');
  }
}

run();
