/**
 * Cloudflare D1 HTTP API utility.
 * Drop-in replacement for the old PostgreSQL `db.query(text, params)` interface.
 * D1 uses positional ? placeholders instead of $1/$2; this wrapper converts them.
 */
require('dotenv').config();

// Strip wrapping quotes from env var values (defends against copy-paste artifacts in dashboards)
const cleanEnvVal = (val) => (val || '').trim().replace(/^["']|["']$/g, '');

// Read lazily on each call — env vars may not be injected until after module load on some hosts
function getCreds() {
  return {
    accountId:  cleanEnvVal(process.env.CLOUDFLARE_ACCOUNT_ID),
    databaseId: cleanEnvVal(process.env.CLOUDFLARE_D1_DATABASE_ID),
    apiToken:   cleanEnvVal(process.env.CLOUDFLARE_API_TOKEN),
  };
}


// Translate Postgres $1, $2 placeholders to SQLite ? positional placeholders,
// duplicating parameter values where the same index is reused in the query.
function translateParams(sql, params = []) {
  const matches = [...sql.matchAll(/\$(\d+)/g)];
  if (matches.length === 0) {
    return { sql, params };
  }
  const newParams = [];
  matches.forEach(m => {
    const index = parseInt(m[1], 10) - 1;
    newParams.push(params[index]);
  });
  const newSql = sql.replace(/\$(\d+)/g, '?');
  return { sql: newSql, params: newParams };
}

/**
 * Convert Postgres-style SQL dialects to D1-compatible SQLite syntax.
 */
function convertPg(sql) {
  let s = sql;
  
  // 1. Remove all PostgreSQL type casts (e.g. ::int, ::text, ::jsonb, ::uuid[], etc.)
  s = s.replace(/::[a-zA-Z_0-9]+(?:\[\])?/gi, '');
  
  // 1b. Replace PostgreSQL POSIX regex matches (~ '^[0-9]+$') with standard SQLite GLOB operator
  s = s.replace(/~\s*'\^\\\[0-9\\\]\+\\$'/gi, "NOT GLOB '*[^0-9]*'");
  s = s.replace(/~\s*'\^\[0-9\]\+\$'/gi, "NOT GLOB '*[^0-9]*'");
  
  // 1c. Convert PostgreSQL timezone(), EXTRACT() and ILIKE to SQLite equivalents
  s = s.replace(/timezone\s*\(\s*'[^']*'\s*,\s*(.*?)\)/gi, '$1');
  s = s.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+(.*?)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+(.*?)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  
  // 1d. Convert Postgres boolean literals to SQLite integers (true -> 1, false -> 0)
  s = s.replace(/\bTRUE\b/gi, '1');
  s = s.replace(/\bFALSE\b/gi, '0');
  
  // 2. Placeholders: converted to positional ? (handled by translateParams first)
  s = s.replace(/\$(\d+)/g, '?');
  
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
  const { accountId, databaseId, apiToken } = getCreds();

  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'Cloudflare D1 credentials not configured. ' +
      'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.'
    );
  }

  // Translate placeholders and duplicate reused parameters for positional SQLite binding
  const translated = translateParams(sql, params ?? []);

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sql: convertPg(translated.sql), params: translated.params }),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = (json.errors || []).map(e => e.message).join(', ') || response.statusText;
    console.error('[D1] query failed — endpoint:', endpoint);
    console.error('[D1] accountId:', accountId, '| databaseId:', databaseId);
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
  const { accountId, databaseId, apiToken } = getCreds();

  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'Cloudflare D1 credentials not configured. ' +
      'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.'
    );
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const body = {
    batch: statements.map(s => {
      const translated = translateParams(s.sql, s.params ?? []);
      return {
        sql: convertPg(translated.sql),
        params: translated.params,
      };
    }),
  };

  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
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

module.exports = { query, batch, convertPg };
