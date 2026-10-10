const xlsx = require('xlsx');
const db = require('./src/utils/db');
require('dotenv').config();

async function run() {
  const wb = xlsx.readFile('../meter_images/Upload reading 03.10.2026.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  const excelBps = data.map(r => String(r['BP No.']).replace(/^0+/, ''));
  
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  const fetch = require('node-fetch');
  
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/'+CF_ACCOUNT_ID+'/d1/database/'+CF_DB_ID+'/query', {
    method: 'POST',
    headers: {'Authorization': 'Bearer '+CF_TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({sql: 'SELECT LTRIM(json_extract(raw_sap_data, \'$.\"BP No.\"\'), \'0\') as bp FROM properties'})
  });
  const dbData = await r.json();
  const dbRows = dbData.result[0].results;
  const dbBps = new Set(dbRows.map(r => r.bp));
  
  let found = 0, missing = 0;
  for (const bp of excelBps) {
    if (dbBps.has(bp)) found++;
    else missing++;
  }
  console.log('Total in Excel:', excelBps.length);
  console.log('Found in DB:', found, 'Missing in DB:', missing);
}
run();
