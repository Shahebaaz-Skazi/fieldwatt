require('dotenv').config();
const db = require('./src/db');
const bcrypt = require('bcryptjs');

async function run() {
  const res = await db.query('SELECT id, name, username, phone, password_hash FROM agents');
  const candidates = [
    'password123',
    'password',
    '123456',
    '12345678',
    'vaibhav',
    'vaibhav123',
    'krishna',
    'krishna123',
    '4546323224',
    '9689741625',
    'fieldwatt',
    'fieldwatt123',
    'admin123',
    'Pass@123',
    'agent123',
    'vaibhav@123'
  ];

  for (const a of res.rows) {
    let found = null;
    for (const c of candidates) {
      if (await bcrypt.compare(c, a.password_hash)) {
        found = c;
        break;
      }
    }
    console.log(`${a.name} | username: "${a.username}" | phone: "${a.phone}" | password: ${found || 'UNKNOWN'}`);
  }
}

run();
