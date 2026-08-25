const db = require('../src/db');

async function run() {
  console.log('====================================================');
  console.log('         FIELDWATT ADMIN METRICS VERIFICATION        ');
  console.log('====================================================');

  try {
    // 1. Get active cycle
    const cycleRes = await db.query("SELECT id, label FROM cycles WHERE is_active = 1 LIMIT 1");
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      console.error('❌ ERROR: No active cycle found!');
      process.exit(1);
    }
    const cycleId = cycle.id;
    console.log(`Active Cycle: ${cycle.label} (${cycleId})\n`);

    // 2. Query 1: Admin Manage Agents Tab Metrics
    console.log('1. Querying Manage Agents metrics...');
    const q1Sql = `
      SELECT 
        a.name as agent_name,
        COUNT(asg.id) as assigned_count,
        SUM(CASE WHEN r.status_code = 'reading_taken' THEN 1 ELSE 0 END) as done_count,
        SUM(CASE WHEN r.id IS NOT NULL AND r.status_code != 'reading_taken' THEN 1 ELSE 0 END) as problem_count,
        SUM(CASE WHEN asg.id IS NOT NULL AND r.id IS NULL THEN 1 ELSE 0 END) as pending_count
      FROM agents a
      LEFT JOIN assignments asg ON asg.agent_id = a.id AND asg.cycle_id = $1
      LEFT JOIN readings r ON r.assignment_id = asg.id
      WHERE a.is_active = 1
      GROUP BY a.id
      ORDER BY a.name ASC
    `;
    const q1Res = await db.query(q1Sql, [cycleId]);
    console.table(q1Res.rows);

    // 3. Query 2: Bulk Assign / Coverage Metrics
    console.log('\n2. Querying Bulk Assign / Coverage metrics...');
    const q2Sql = `
      SELECT 
        a.name as area_name,
        COUNT(p.id) as total_properties,
        COUNT(asg.id) as assigned_properties,
        (COUNT(p.id) - COUNT(asg.id)) as unassigned_properties
      FROM areas a
      LEFT JOIN properties p ON p.area_id = a.id
      LEFT JOIN assignments asg ON asg.property_id = p.id AND asg.cycle_id = $1
      GROUP BY a.id
      ORDER BY a.name ASC
    `;
    const q2Res = await db.query(q2Sql, [cycleId]);
    console.table(q2Res.rows);

    // 4. Query 3: Readings / Analytics with Photo URLs
    console.log('\n3. Querying Readings / Analytics with valid photo URLs...');
    const q3Sql = `
      SELECT 
        COUNT(r.id) as readings_with_photos
      FROM readings r
      WHERE r.photo_url IS NOT NULL AND r.photo_url LIKE '%r2.dev%'
    `;
    const q3Res = await db.query(q3Sql);
    const countWithPhotos = q3Res.rows[0]?.readings_with_photos ?? 0;
    console.log(`  ✔ Found ${countWithPhotos} completed readings with valid R2 photo URLs.`);

    if (countWithPhotos > 0) {
      const q3SampleSql = `
        SELECT 
          r.id as reading_id,
          r.reading_value,
          r.status_code,
          r.photo_url,
          p.consumer_name
        FROM readings r
        JOIN assignments asg ON r.assignment_id = asg.id
        JOIN properties p ON asg.property_id = p.id
        WHERE r.photo_url IS NOT NULL AND r.photo_url LIKE '%r2.dev%'
        LIMIT 5
      `;
      const q3SampleRes = await db.query(q3SampleSql);
      console.table(q3SampleRes.rows);
    }

    console.log('\n====================================================');
    console.log('             VERIFICATION COMPLETED SUCCESS          ');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR RUNNING DIAGNOSTICS:', err.message);
    process.exit(1);
  }
}

run();
