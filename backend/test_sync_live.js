require('dotenv').config();
const db = require('./src/db');
const jwt = require('jsonwebtoken');

async function run() {
  const agentRes = await db.query("SELECT id, name FROM agents WHERE name LIKE 'Vaibhav%'");
  const vaibhav = agentRes.rows[0];
  const jwtSecret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
  const token = jwt.sign({ id: vaibhav.id, role: 'agent', name: vaibhav.name }, jwtSecret, { expiresIn: '1h' });
  
  // Test the sync/batch endpoint with a fake reading
  const asgRes = await db.query(
    'SELECT id FROM assignments WHERE agent_id = ? AND is_completed = 0 LIMIT 1',
    [vaibhav.id]
  );
  
  if (asgRes.rows.length === 0) {
    console.log('No incomplete assignments for Vaibhav');
    return;
  }
  
  const fakeReading = {
    assignment_id: asgRes.rows[0].id,
    idempotency_key: '00000000-0000-4000-8000-000000000001',
    reading_value: '999',
    status_code: 'reading_taken',
    photo_url: null,
    note: null,
    gps_lat: 18.5,
    gps_lng: 73.8,
    gps_accuracy: 10,
    submitted_at: new Date().toISOString()
  };
  
  console.log('Testing sync with assignment:', fakeReading.assignment_id);
  
  const r = await fetch('https://fieldwatt-backend.onrender.com/sync/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ readings: [fakeReading] })
  });
  
  console.log('Sync status:', r.status);
  const text = await r.text();
  console.log('Sync response:', text.substring(0, 500));
}
run().catch(console.error);
