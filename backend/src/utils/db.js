/**
 * Cloudflare D1 HTTP API utility.
 * Drop-in replacement for the old PostgreSQL `db.query(text, params)` interface.
 * D1 uses positional ?  placeholders instead of $1/$2; this wrapper converts them.
 */
require('dotenv').config();

const ACCOUNT_ID   = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID  = process.env.CLOUDFLARE_D1_DATABASE_ID;
const API_TOKEN    = process.env.CLOUDFLARE_API_TOKEN;
const D1_BASE      = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}`;

/**
 * Convert a Postgres-style query ($1, $2 …) to D1-style (?, ? …).
 */
function convertPgToBound(sql) {
  // Replace $1, $2, … with ? in order
  return sql.replace(/\$\d+/g, '?');
}

/**
 * Execute a single SQL statement against D1.
 * Returns an object with a `rows` array, mimicking the pg Pool result.
 */
async function query(sql, params = []) {
  if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    throw new Error('Cloudflare D1 credentials not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.');
  }

  const body = {
    sql: convertPgToBound(sql),
    params: params ?? [],
  };

  const response = await fetch(`${D1_BASE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = json.errors?.map(e => e.message).join(', ') || response.statusText;
    throw new Error(`D1 query failed: ${errors}\nSQL: ${sql}`);
  }

  // D1 returns an array of result sets (one per statement)
  const result = json.result[0];
  return {
    rows:    result?.results ?? [],
    rowCount: result?.results?.length ?? 0,
  };
}

/**
 * Execute multiple SQL statements in a single batch request (D1 transaction).
 * Each element: { sql, params }
 */
async function batch(statements) {
  if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    throw new Error('Cloudflare D1 credentials not configured.');
  }

  const body = statements.map(s => ({
    sql:    convertPgToBound(s.sql),
    params: s.params ?? [],
  }));

  const response = await fetch(`${D1_BASE}/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = json.errors?.map(e => e.message).join(', ') || response.statusText;
    throw new Error(`D1 batch failed: ${errors}`);
  }

  return json.result.map(r => ({ rows: r.results ?? [], rowCount: r.results?.length ?? 0 }));
}

module.exports = { query, batch };
