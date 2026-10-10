require('dotenv').config();
const db = require('./src/db');
const jwt = require('jsonwebtoken');

async function run() {
  const agentRes = await db.query("SELECT id, name, username FROM agents WHERE name LIKE 'Vaibhav%'");
  const vaibhav = agentRes.rows[0];
  console.log('Vaibhav:', vaibhav);

  // Generate a token for Vaibhav to test the endpoint
  const jwtSecret = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';
  const token = jwt.sign({ id: vaibhav.id, role: 'agent', name: vaibhav.name }, jwtSecret, { expiresIn: '1h' });

  // Test the assignments endpoint
  const r = await fetch('https://fieldwatt-backend.onrender.com/agent/assignments', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const status = r.status;
  const text = await r.text();
  
  console.log('Status:', status);
  if (status === 200) {
    const data = JSON.parse(text);
    console.log('Rows returned:', data.length);
    if (data.length > 0) {
      console.log('Sample row keys:', Object.keys(data[0]));
      console.log('Sample row:', data[0]);
    }
  } else {
    console.log('Error response:', text.substring(0, 500));
  }
}
run().catch(console.error);
