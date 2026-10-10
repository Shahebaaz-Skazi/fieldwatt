require('dotenv').config();
const db = require('./src/db');
const bcrypt = require('bcryptjs');
async function run() {
  const hash = await bcrypt.hash('vaibhav123', 10);
  await db.query("UPDATE agents SET password_hash = ? WHERE username = 'vaibhav'", [hash]);
  console.log('Password updated for vaibhav');
}
run();
