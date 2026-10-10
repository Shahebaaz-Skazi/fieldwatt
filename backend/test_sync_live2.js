const payload = {
  readings: [{
    assignment_id: 'asg_koth_70c1dfd5_1789544048913',
    idempotency_key: 'test_idemp_key_125',
    reading_value: '123',
    status_code: 'reading_taken',
    submitted_at: new Date().toISOString()
  }]
};

async function run() {
  const loginRes = await fetch('https://fieldwatt-backend.onrender.com/auth/agent/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'vaibhav', password: 'vaibhav123' })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Got token');
  
  const r = await fetch('https://fieldwatt-backend.onrender.com/sync/batch', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  console.log('Sync Status:', r.status);
  console.log('Sync Response:', await r.text());
}
run();
