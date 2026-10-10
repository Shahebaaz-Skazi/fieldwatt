/**
 * Post-import verification script.
 * Checks:
 *   1. 10 sample readings from Pallavi's 05.10.2026 import (photo_url set)
 *   2. 10 sample readings from 03.10.2026 import (photo_url set)
 *   3. Export query sanity check — completed + available counts for the active cycle
 */
const db = require('./src/db');

const PALLAVI_AGENT_ID = '33bdb6c4-a678-4cdf-912d-c3112c3db201';
const CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e'; // September 2026 cycle

async function run() {
  // ── 1. Pallavi's readings (last 10 inserted by her) ──────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CHECK 1: Pallavi 05.10 readings (agent watermarked)');
  console.log('═══════════════════════════════════════════════════════');
  const pallaviRes = await db.query(`
    SELECT r.id, r.reading_value, r.status_code, r.photo_url, r.submitted_at, r.note
    FROM readings r
    INNER JOIN assignments asg ON r.assignment_id = asg.id
    WHERE asg.agent_id = ? AND r.note = 'whatsapp readings data'
    ORDER BY r.synced_at DESC
    LIMIT 10
  `, [PALLAVI_AGENT_ID]);

  if (pallaviRes.rows.length === 0) {
    console.log('  ⚠️  NO READINGS found for Pallavi yet — import may still be running');
  } else {
    console.log(`  Found ${pallaviRes.rows.length} readings`);
    pallaviRes.rows.forEach((r, i) => {
      const hasPhoto = r.photo_url && r.photo_url.startsWith('https://');
      console.log(`  [${i+1}] reading=${r.reading_value} status=${r.status_code} photo=${hasPhoto ? '✅' : '❌ MISSING'} submitted=${r.submitted_at}`);
      if (!hasPhoto) console.log(`       url=${r.photo_url}`);
    });
    const missingPhotos = pallaviRes.rows.filter(r => !r.photo_url || !r.photo_url.startsWith('https://'));
    console.log(`\n  Result: ${missingPhotos.length === 0 ? '✅ ALL photos uploaded correctly' : `❌ ${missingPhotos.length} missing photos`}`);
  }

  // ── 2. 03.10.2026 import readings ─────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CHECK 2: 03.10.2026 import (SAP property data)');
  console.log('═══════════════════════════════════════════════════════');
  const oct03Res = await db.query(`
    SELECT i.file_name, COUNT(p.id) as property_count
    FROM imports i
    LEFT JOIN properties p ON p.import_id = i.id
    WHERE i.file_name LIKE '%03.10%' OR i.file_name LIKE '%reading%03%'
    GROUP BY i.id, i.file_name
  `);

  if (oct03Res.rows.length === 0) {
    console.log('  ⚠️  NO IMPORT RECORD found for 03.10 file — workflow may still be pending');
  } else {
    oct03Res.rows.forEach(r => {
      console.log(`  File: "${r.file_name}" → ${r.property_count} properties imported`);
      console.log(`  Result: ${r.property_count > 0 ? '✅ Properties ingested' : '❌ No properties found'}`);
    });
  }

  // Sample 10 properties from the most recent import
  const sampleProps = await db.query(`
    SELECT p.consumer_name, p.meter_no, p.serial_no,
           LTRIM(json_extract(p.raw_sap_data, '$.\"BP No.\"'), '0') as bp_no,
           a.name as area
    FROM properties p
    INNER JOIN imports i ON p.import_id = i.id
    LEFT JOIN areas a ON p.area_id = a.id
    ORDER BY p.created_at DESC
    LIMIT 10
  `);
  console.log('\n  Latest 10 properties in DB:');
  sampleProps.rows.forEach((p, i) => {
    console.log(`  [${i+1}] ${p.consumer_name} | meter=${p.meter_no} | bp=${p.bp_no} | area=${p.area}`);
  });

  // ── 3. Export sanity check ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CHECK 3: Export query — completed vs available counts');
  console.log('═══════════════════════════════════════════════════════');
  const exportCheck = await db.query(`
    SELECT
      COUNT(DISTINCT p.id) as total_properties,
      COUNT(DISTINCT asg.id) as total_assigned,
      SUM(CASE WHEN r.status_code IN ('reading_taken', 'completed') THEN 1 ELSE 0 END) as completed_readings,
      SUM(CASE WHEN r.status_code NOT IN ('reading_taken', 'completed') OR r.status_code IS NULL THEN 1 ELSE 0 END) as pending_readings,
      SUM(CASE WHEN r.photo_url IS NOT NULL AND r.photo_url != '' THEN 1 ELSE 0 END) as readings_with_photos
    FROM assignments asg
    LEFT JOIN properties p ON asg.property_id = p.id
    LEFT JOIN (
      SELECT assignment_id, status_code, photo_url, MAX(submitted_at) as submitted_at
      FROM readings
      GROUP BY assignment_id
    ) r ON r.assignment_id = asg.id
    WHERE asg.cycle_id = ?
  `, [CYCLE_ID]);

  const stats = exportCheck.rows[0];
  if (stats) {
    console.log(`  Total properties assigned : ${stats.total_assigned}`);
    console.log(`  Completed readings        : ${stats.completed_readings} ✅`);
    console.log(`  Pending/unread            : ${stats.pending_readings}`);
    console.log(`  Readings with photos      : ${stats.readings_with_photos} 📸`);
    const photoRate = stats.completed_readings > 0
      ? ((stats.readings_with_photos / stats.completed_readings) * 100).toFixed(1)
      : 'N/A';
    console.log(`  Photo coverage            : ${photoRate}%`);
    console.log(`\n  Result: ${stats.completed_readings > 0 ? '✅ Export data looks healthy' : '⚠️  No completed readings yet'}`);
  }

  // Verify a sample of 10 completed readings that will appear in export
  console.log('\n  Sample 10 completed readings (as they appear in export):');
  const exportSample = await db.query(`
    SELECT
      p.consumer_name,
      LTRIM(json_extract(p.raw_sap_data, '$.\"BP No.\"'), '0') as bp_no,
      ag.name as agent_name,
      r.reading_value,
      r.photo_url,
      r.submitted_at
    FROM assignments asg
    INNER JOIN properties p ON asg.property_id = p.id
    INNER JOIN agents ag ON asg.agent_id = ag.id
    LEFT JOIN (
      SELECT assignment_id, reading_value, status_code, photo_url, MAX(submitted_at) as submitted_at
      FROM readings
      WHERE status_code IN ('reading_taken', 'completed')
      GROUP BY assignment_id
    ) r ON r.assignment_id = asg.id
    WHERE asg.cycle_id = ? AND r.submitted_at IS NOT NULL
    ORDER BY r.submitted_at DESC
    LIMIT 10
  `, [CYCLE_ID]);

  exportSample.rows.forEach((r, i) => {
    const hasPhoto = r.photo_url && r.photo_url.startsWith('https://');
    console.log(`  [${i+1}] ${r.consumer_name} | bp=${r.bp_no} | agent=${r.agent_name} | reading=${r.reading_value} | photo=${hasPhoto ? '✅' : '❌'}`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
