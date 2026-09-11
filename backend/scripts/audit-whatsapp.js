const db = require('../src/utils/db');

async function main() {
  // Check a sample of today's rows — what status are they actually?
  const [todaySample, distinctVsTotal, usageVsDistinct] = await Promise.all([
    db.query("SELECT property_id, phone_number, consumer_name, status, wamid, sent_at FROM whatsapp_logs WHERE date(sent_at) = date('now') LIMIT 5"),
    // COUNT(*) vs COUNT(DISTINCT) — the mismatch source
    db.query("SELECT COUNT(*) as total_rows, COUNT(DISTINCT property_id) as distinct_props FROM whatsapp_logs WHERE status IN ('sent','delivered','read')"),
    // Are there properties with MULTIPLE sent/delivered/read rows?
    db.query("SELECT property_id, COUNT(*) as row_count FROM whatsapp_logs WHERE status IN ('sent','delivered','read') GROUP BY property_id HAVING COUNT(*) > 1 LIMIT 5"),
  ]);

  console.log('=== TODAY ROWS SAMPLE ===');
  todaySample.rows.forEach(r => console.log(`  ${r.consumer_name} | status=${r.status} | wamid=${r.wamid ? 'present' : 'NULL'} | sent_at=${r.sent_at}`));

  console.log('\n=== COUNT(*) vs COUNT(DISTINCT property_id) ===');
  console.log('Total rows with sent/delivered/read:', usageVsDistinct.rows[0]?.total_rows || 0);
  console.log('Distinct properties contacted:       ', usageVsDistinct.rows[0]?.distinct_props || 0);

  console.log('\n=== Properties with MULTIPLE sent rows (duplicates) ===');
  if (distinctVsTotal.rows.length === 0) {
    console.log('  None — each property has exactly 1 row');
  } else {
    distinctVsTotal.rows.forEach(r => console.log(`  property_id=${r.property_id} | rows=${r.row_count}`));
  }
}

main().catch(console.error).finally(() => process.exit(0));
