require('dotenv').config();
const db = require('./src/utils/db');

async function run() {
  const CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e';
  const p = await db.query('SELECT id FROM properties WHERE json_extract(raw_sap_data, \'$.\"BP No.\"\') LIKE \'%50510146%\' LIMIT 1');
  const prop_id = p.rows[0].id;
  const db_asg = await db.query('SELECT id FROM assignments WHERE property_id = ? AND cycle_id = ?', [prop_id, CYCLE_ID]);
  console.log('DB has assignment:', db_asg.rows.length);
  
  // mock the python request
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/'+CF_ACCOUNT_ID+'/d1/database/'+CF_DB_ID+'/query', {
    method: 'POST',
    headers: {'Authorization': 'Bearer '+CF_TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({sql: 'SELECT id, property_id FROM assignments WHERE cycle_id = ?', params: [CYCLE_ID]})
  });
  const data = await r.json();
  const res = data.result[0].results;
  console.log('Total bulk assignments (HTTP API):', res.length);
  const found = res.filter(a => a.property_id === prop_id);
  console.log('Found in bulk:', found.length);
}
run();
