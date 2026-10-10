const https = require('https');

const TOKEN = Buffer.from('Z2hwX0tYcUd4S2F4SEhVZFBXcTh5Q2RaaGZqTUJlbFpxMUNsb2FBMg==', 'base64').toString('ascii');

const body = JSON.stringify({
  ref: 'main',
  inputs: {}
});

const options = {
  hostname: 'api.github.com',
  path: '/repos/Shahebaaz-Skazi/fieldwatt/actions/workflows/import-03oct.yml/dispatches',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Node.js',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => { if (data) console.log(data); });
});

req.on('error', console.error);
req.write(body);
req.end();
