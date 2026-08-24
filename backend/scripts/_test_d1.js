require('dotenv').config({ path: '.env' });

const aid  = (process.env.CLOUDFLARE_ACCOUNT_ID  || '').trim();
const dbid = (process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
const tok  = (process.env.CLOUDFLARE_API_TOKEN   || '').trim();

const url = 'https://api.cloudflare.com/client/v4/accounts/' + aid + '/d1/database/' + dbid + '/query';
console.log('Testing URL (no token):', url);
console.log('Token prefix:', tok.slice(0, 10) + '...');

fetch(url, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: 'SELECT 1 as ok', params: [] })
})
.then(function(r) { return r.json(); })
.then(function(j) { console.log(JSON.stringify(j, null, 2)); })
.catch(function(e) { console.error('Fetch error:', e.message); });
