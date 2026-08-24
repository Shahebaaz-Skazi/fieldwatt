/**
 * Cloudflare D1 HTTP API utility.
 * Drop-in replacement for the old PostgreSQL `db.query(text, params)` interface.
 * D1 uses positional ? placeholders instead of $1/$2; this wrapper converts them.
 */
require('dotenv').config();

// Trim all CF env vars to guard against trailing newlines from copy-paste or .env editors
const ACCOUNT_ID  = (process.env.CLOUDFLARE_ACCOUNT_ID       || '').trim();
const DATABASE_ID = (process.env.CLOUDFLARE_D1_DATABASE_ID   || '').trim();
const API_TOKEN   = (process.env.CLOUDFLARE_API_TOKEN        || '').trim();

function d1Url(path) {
  return 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/d1/database/' + DATABASE_ID + path;
}

function checkConfig() {
  if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    throw new Error(
      'Cloudflare D1 credentials not configured. ' +
      'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.'
    );
  }
}

/**
 * Convert Postgres-style placeholders ($1, $2 …) to D1-style (?, ? …).
 */
function convertPg(sql) {
  return sql.replace(/\$\d+/g, '?');
}

/**
 * Execute a single SQL statement against D1.
 * Returns { rows, rowCount } — mirrors the pg Pool result shape.
 */
async function query(sql, params = []) {
  checkConfig();

  const endpoint = d1Url('/query');
  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + API_TOKEN, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sql: convertPg(sql), params: params ?? [] }),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = (json.errors || []).map(e => e.message).join(', ') || response.statusText;
    console.error('[D1] query failed — endpoint:', endpoint);
    console.error('[D1] response body:', JSON.stringify(json));
    throw new Error('D1 query failed: ' + errors + '\nSQL: ' + sql);
  }

  const result = json.result[0];
  return {
    rows:     result?.results ?? [],
    rowCount: result?.results?.length ?? 0,
  };
}

/**
 * Execute multiple SQL statements sequentially (D1 REST only supports /query, not /batch).
 * Each element: { sql, params }
 * Returns array of { rows, rowCount } results.
 */
async function batch(statements) {
  const results = [];
  for (const s of statements) {
    results.push(await query(s.sql, s.params));
  }
  return results;
}

module.exports = { query, batch };
