require('dotenv').config();
const db = require('./src/db');

async function run() {
  const sql = `INSERT INTO readings (
          assignment_id, idempotency_key, reading_value, status_code, 
          photo_url, note, gps_lat, gps_lng, gps_accuracy, 
          is_anomalous, anomaly_reason, submitted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (idempotency_key) DO NOTHING`;
  const params = [
    'asg_koth_70c1dfd5_1789544048913',
    'test_idemp_key',
    '123',
    'reading_taken',
    null,
    null,
    18.5,
    73.8,
    10,
    false,
    null,
    '2026-10-08T10:00:00Z'
  ];
  
  const client = await db.pool.connect();
  try {
    const res = await client.query(sql, params);
    console.log(res);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
