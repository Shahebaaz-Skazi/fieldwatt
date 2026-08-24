const db = require('../src/db');

async function run() {
  console.log('====================================================');
  console.log('       FIELDWATT DASHBOARD QUERIES DIAGNOSTICS      ');
  console.log('====================================================');

  try {
    // 1. Get Active Cycle
    const cycleRes = await db.query("SELECT id, label FROM cycles WHERE is_active = 1 LIMIT 1");
    const cycle = cycleRes.rows[0];
    console.log('Active Cycle Lookup:');
    console.log(`  - Found: ${cycle ? `${cycle.label} (${cycle.id})` : 'None'}`);
    if (!cycle) {
      console.error('❌ ERROR: No active cycle found! Diagnostics cannot run without an active cycle.');
      process.exit(1);
    }
    const cycleId = cycle.id;

    // 2. Query 1: General Dashboard Summary
    console.log('\nQuery 1: Dashboard Agents & Counts...');
    const q1Sql = `
      SELECT 
        a.id,
        a.name,
        a.phone,
        a.is_active,
        att.login_time,
        att.last_active,
        att.is_on_leave,
        COUNT(asg.id)::int as assigned_count,
        COUNT(CASE WHEN r.status_code = 'reading_taken' THEN 1 END)::int as done_count,
        COUNT(CASE WHEN r.id IS NOT NULL AND r.status_code != 'reading_taken' THEN 1 END)::int as problem_count,
        COUNT(CASE WHEN asg.id IS NOT NULL AND r.id IS NULL THEN 1 END)::int as pending_count
      FROM agents a
      LEFT JOIN attendance att ON att.agent_id = a.id AND att.date = CURRENT_DATE
      LEFT JOIN assignments asg ON asg.agent_id = a.id AND asg.cycle_id = $1
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE a.is_active = true
      GROUP BY a.id, att.id
      ORDER BY a.name ASC
    `;
    const q1Res = await db.query(q1Sql, [cycleId]);
    console.log(`  ✔ Returned: ${q1Res.rows.length} rows`);
    if (q1Res.rows.length > 0) {
      console.log('    Sample Row:', q1Res.rows[0]);
    }

    // 3. Query 2: Areas Browser List
    console.log('\nQuery 2: Areas Browser List...');
    const q2Sql = `
      SELECT 
        a.id, 
        a.name, 
        a.city,
        COUNT(p.id)::int as total_properties,
        COUNT(CASE WHEN p.property_type = 'flat' THEN 1 END)::int as flat_count,
        COUNT(CASE WHEN p.property_type = 'bungalow' THEN 1 END)::int as bungalow_count,
        COUNT(CASE WHEN p.property_type = 'raw_house' THEN 1 END)::int as raw_house_count
      FROM areas a
      LEFT JOIN properties p ON a.id = p.area_id
      GROUP BY a.id
      ORDER BY a.name ASC
    `;
    const q2Res = await db.query(q2Sql);
    console.log(`  ✔ Returned: ${q2Res.rows.length} rows`);
    if (q2Res.rows.length > 0) {
      console.log('    Sample Row:', q2Res.rows[0]);
    }

    // 4. Query 3: MRU Area Names (Distinct Society/Area check)
    console.log('\nQuery 3: Distinct MRU Names...');
    const q3Res = await db.query(
      "SELECT DISTINCT name FROM areas WHERE name IS NOT NULL AND name <> '' ORDER BY name ASC"
    );
    console.log(`  ✔ Returned: ${q3Res.rows.length} rows`);
    if (q3Res.rows.length > 0) {
      console.log('    Sample MRUs:', q3Res.rows.map(r => r.name).slice(0, 5));
    }

    // 5. Query 4: Search Properties
    console.log('\nQuery 4: Search Properties...');
    const q4Sql = `
      SELECT 
        p.id,
        p.serial_no,
        p.raw_sap_data->>'BP No.' AS bp_no,
        p.consumer_name,
        p.address,
        p.meter_no,
        p.property_type,
        p.society,
        a.name as area_name,
        asg.id as assignment_id,
        asg.agent_id,
        ag.name as agent_name,
        r.status_code,
        r.reading_value
      FROM properties p
      INNER JOIN areas a ON p.area_id = a.id
      INNER JOIN imports i ON p.import_id = i.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
      LEFT JOIN agents ag ON asg.agent_id = ag.id
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE EXTRACT(YEAR FROM i.scheduled_date) = $2 
        AND EXTRACT(MONTH FROM i.scheduled_date) = $3
      LIMIT 5
    `;
    const q4Res = await db.query(q4Sql, [cycleId, 2026, 4]);
    console.log(`  ✔ Returned: ${q4Res.rows.length} rows`);
    if (q4Res.rows.length > 0) {
      console.log('    Sample Row:', q4Res.rows[0]);
    }

    // 6. Query 5: Manage Agents List
    console.log('\nQuery 5: Manage Agents List...');
    const q5Sql = `
      SELECT 
        a.id, 
        a.name, 
        a.phone, 
        a.email, 
        a.username,
        a.is_active, 
        a.last_login,
        a.created_at
      FROM agents a
      ORDER BY a.name ASC
    `;
    const q5Res = await db.query(q5Sql);
    console.log(`  ✔ Returned: ${q5Res.rows.length} rows`);
    if (q5Res.rows.length > 0) {
      console.log('    Sample Row:', q5Res.rows[0]);
    }

    // 7. Query 6: WhatsApp Usage Status
    console.log('\nQuery 6: WhatsApp Usage Status...');
    const q6Sql = `
      SELECT COUNT(*) as total_sent 
      FROM whatsapp_logs 
      WHERE sent_at >= date_trunc('month', NOW())
      AND status = 'sent'
    `;
    const q6Res = await db.query(q6Sql);
    console.log(`  ✔ Returned: ${q6Res.rows.length} rows`);
    console.log('    Usage:', q6Res.rows[0]);

    // 8. Query 7: WhatsApp Logs List
    console.log('\nQuery 7: WhatsApp Logs...');
    const q7Sql = `
      SELECT id, property_id, phone_number, consumer_name, status, sent_at, cycle_id
      FROM whatsapp_logs
      ORDER BY sent_at DESC
      LIMIT 5
    `;
    const q7Res = await db.query(q7Sql);
    console.log(`  ✔ Returned: ${q7Res.rows.length} rows`);
    if (q7Res.rows.length > 0) {
      console.log('    Sample Row:', q7Res.rows[0]);
    }

    console.log('\n====================================================');
    console.log('                DIAGNOSTICS COMPLETED               ');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ DIAGNOSTICS FAILED:', err);
    process.exit(1);
  }
}

run();
