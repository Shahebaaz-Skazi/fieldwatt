require('dotenv').config();
const db = require('./src/db');
const jwt = require('jsonwebtoken');

async function run() {
  const agentRes = await db.query("SELECT id, name FROM agents WHERE name LIKE 'Vaibhav%'");
  const vaibhav = agentRes.rows[0];
  const token = jwt.sign({ id: vaibhav.id, role: 'agent', name: vaibhav.name }, process.env.JWT_SECRET || 'super_secret_key_change_me_in_production', { expiresIn: '1h' });
  
  const payload = {
    readings: [{
      assignment_id: 'asg_koth_70c1dfd5_1789544048913',
      idempotency_key: 'test_idemp_key_124',
      reading_value: '123',
      status_code: 'reading_taken',
      submitted_at: new Date().toISOString()
    }]
  };

  const r = await fetch('https://fieldwatt-backend.onrender.com/sync/batch', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('Status:', r.status);
  console.log('Response:', await r.text());
}
run();
