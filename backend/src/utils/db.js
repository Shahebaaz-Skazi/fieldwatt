/**
 * Cloudflare D1 HTTP API utility.
 * Drop-in replacement for the old PostgreSQL `db.query(text, params)` interface.
 * D1 uses positional ? placeholders instead of $1/$2; this wrapper converts them.
 */
require('dotenv').config();

// Trim and strip wrapping quotes from env vars to prevent malformed UUID errors
const cleanEnvVal = (val) => (val || '').trim().replace(/^["']|["']$/g, '');
const ACCOUNT_ID  = cleanEnvVal(process.env.CLOUDFLARE_ACCOUNT_ID);
const DATABASE_ID = cleanEnvVal(process.env.CLOUDFLARE_D1_DATABASE_ID);
const API_TOKEN   = cleanEnvVal(process.env.CLOUDFLARE_API_TOKEN);

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
 * Convert Postgres-style placeholders ($1, $2 …) and SQL dialects to D1-compatible SQLite syntax.
 */
function convertPg(sql) {
  let s = sql;
  
  // 1. Remove ::jsonb or other PostgreSQL casts
  s = s.replace(/::jsonb/gi, '');
  s = s.replace(/::text/gi, '');
  
  // 2. Placeholders: $1, $2 ... -> ?
  s = s.replace(/\$\d+/g, '?');
  
  // 3. date_trunc / DATE_TRUNC -> strftime
  s = s.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*(.*?)\)/gi, "strftime('%Y-%m-01', $1)");
  s = s.replace(/date_trunc\s*\(\s*'month'\s*,\s*(.*?)\)/gi, "strftime('%Y-%m-01', $1)");
  
  // 4. NOW() -> datetime('now')
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
  
  // 5. CURRENT_DATE modifications
  s = s.replace(/\bCURRENT_DATE\s*\+\s*1\b/gi, "date('now', '+1 day')");
  s = s.replace(/\bCURRENT_DATE\s*-\s*5\b/gi, "date('now', '-5 days')");
  s = s.replace(/\bCURRENT_DATE\s*\+\s*25\b/gi, "date('now', '+25 days')");
  s = s.replace(/\bCURRENT_DATE\b(?!\s*[\+\-])/gi, "date('now')");
  
  // 6. INTERVAL clauses
  s = s.replace(/datetime\('now'\)\s*-\s*INTERVAL\s*'7 days'/gi, "datetime('now', '-7 days')");
  
  // 7. gen_random_uuid() -> D1 RFC4122 v4 UUID generator
  s = s.replace(/\bgen_random_uuid\(\)/gi, "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))");

  return s;
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
 * Execute multiple SQL statements in a single batch request (D1 transaction).
 * Each element: { sql, params }
 * Returns array of { rows, rowCount } results.
 */
async function batch(statements) {
  checkConfig();

  const endpoint = d1Url('/query');
  const body = {
    batch: statements.map(s => ({
      sql: convertPg(s.sql),
      params: s.params ?? [],
    })),
  };

  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + API_TOKEN, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = (json.errors || []).map(e => e.message).join(', ') || response.statusText;
    console.error('[D1] batch failed — endpoint:', endpoint);
    console.error('[D1] response body:', JSON.stringify(json));
    throw new Error('D1 batch failed: ' + errors);
  }

  return json.result.map(r => ({
    rows:     r.results ?? [],
    rowCount: r.results?.length ?? 0,
  }));
}

module.exports = { query, batch };
