const https = require('https');
https.get('https://api.github.com/repos/Shahebaaz-Skazi/fieldwatt/actions/runs', {
  headers: { 'User-Agent': 'Node.js' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const recent = json.workflow_runs.slice(0, 3).map(r => ({
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.created_at
    }));
    console.log(recent);
  });
});
