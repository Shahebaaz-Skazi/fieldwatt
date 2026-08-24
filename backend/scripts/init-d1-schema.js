/**
 * scripts/init-d1-schema.js
 *
 * Pushes the complete FieldWatt schema to Cloudflare D1 via the HTTP API.
 * D1 uses SQLite dialect (no pgcrypto, no TIMESTAMPTZ, no gen_random_uuid).
 *
 * Usage:
 *   node scripts/init-d1-schema.js
 *
 * Required env vars (copy from .env or Render dashboard):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN
 */
require('dotenv').config();

const cleanEnvVal = (val) => (val || '').trim().replace(/^["']|["']$/g, '');
const ACCOUNT_ID  = cleanEnvVal(process.env.CLOUDFLARE_ACCOUNT_ID);
const DATABASE_ID = cleanEnvVal(process.env.CLOUDFLARE_D1_DATABASE_ID);
const API_TOKEN   = cleanEnvVal(process.env.CLOUDFLARE_API_TOKEN);
const D1_BASE     = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/d1/database/' + DATABASE_ID;

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
  console.error('❌  Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, or CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

// RFC4122 v4 UUID generator in SQLite
const UUID_DEFAULT = "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))";

// D1 SQLite schema - mirrors the Postgres schema, adapted for SQLite dialect with automatic UUID generators
const STATEMENTS = [
  // Cycles
  `CREATE TABLE IF NOT EXISTS cycles (
    id         TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    label      TEXT NOT NULL,
    start_date TEXT,
    end_date   TEXT,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Areas
  `CREATE TABLE IF NOT EXISTS areas (
    id         TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    name       TEXT UNIQUE NOT NULL,
    city       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Admins
  `CREATE TABLE IF NOT EXISTS admins (
    id            TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  )`,

  // Imports
  `CREATE TABLE IF NOT EXISTS imports (
    id             TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    file_name      TEXT NOT NULL,
    file_code      TEXT NOT NULL,
    scheduled_date TEXT,
    billing_month  TEXT,
    total_rows     INTEGER DEFAULT 0,
    uploaded_by    TEXT REFERENCES admins(id) ON DELETE SET NULL,
    uploaded_at    TEXT DEFAULT (datetime('now'))
  )`,

  // Properties
  `CREATE TABLE IF NOT EXISTS properties (
    id            TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    area_id       TEXT REFERENCES areas(id) ON DELETE SET NULL,
    import_id     TEXT REFERENCES imports(id) ON DELETE SET NULL,
    serial_no     TEXT UNIQUE NOT NULL,
    consumer_name TEXT NOT NULL,
    address       TEXT NOT NULL,
    meter_no      TEXT,
    property_type TEXT CHECK (property_type IN ('flat','bungalow','raw_house')),
    society       TEXT,
    sub_society   TEXT,
    wing_code     TEXT,
    phone_number  TEXT,
    lat           REAL,
    lng           REAL,
    raw_sap_data  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )`,

  // Agents
  `CREATE TABLE IF NOT EXISTS agents (
    id               TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    name             TEXT NOT NULL,
    phone            TEXT UNIQUE NOT NULL,
    email            TEXT UNIQUE,
    username         TEXT UNIQUE,
    password_hash    TEXT NOT NULL,
    is_active        INTEGER DEFAULT 1,
    last_login       TEXT,
    expo_push_token  TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )`,

  // Assignments
  `CREATE TABLE IF NOT EXISTS assignments (
    id          TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    agent_id    TEXT REFERENCES agents(id) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    cycle_id    TEXT REFERENCES cycles(id) ON DELETE CASCADE,
    assigned_at TEXT DEFAULT (datetime('now')),
    assigned_by TEXT REFERENCES admins(id) ON DELETE SET NULL,
    UNIQUE(property_id, cycle_id)
  )`,

  // Readings
  `CREATE TABLE IF NOT EXISTS readings (
    id                TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    assignment_id     TEXT REFERENCES assignments(id) ON DELETE CASCADE,
    idempotency_key   TEXT UNIQUE NOT NULL,
    reading_value     REAL,
    status_code       TEXT NOT NULL CHECK (status_code IN (
      'reading_taken','door_locked','not_reachable',
      'access_denied','meter_not_found','meter_damaged',
      'revisit_needed','vacant_property'
    )),
    photo_url         TEXT,
    note              TEXT,
    gps_lat           REAL,
    gps_lng           REAL,
    gps_accuracy      REAL,
    is_anomalous      INTEGER DEFAULT 0,
    anomaly_reason    TEXT,
    source            TEXT DEFAULT 'agent',
    submitted_by_type TEXT DEFAULT 'agent',
    submitted_at      TEXT NOT NULL,
    synced_at         TEXT DEFAULT (datetime('now'))
  )`,

  // Attendance
  `CREATE TABLE IF NOT EXISTS attendance (
    id          TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    agent_id    TEXT REFERENCES agents(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    login_time  TEXT,
    last_active TEXT,
    is_on_leave INTEGER DEFAULT 0,
    UNIQUE(agent_id, date)
  )`,

  // Revisits
  `CREATE TABLE IF NOT EXISTS revisits (
    id             TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    property_id    TEXT REFERENCES properties(id) ON DELETE CASCADE,
    cycle_id       TEXT REFERENCES cycles(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    attempt_count  INTEGER DEFAULT 1,
    created_by     TEXT REFERENCES admins(id) ON DELETE SET NULL,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,

  // WhatsApp logs
  `CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id            TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    property_id   TEXT,
    phone_number  TEXT NOT NULL,
    status        TEXT DEFAULT 'sent',
    token         TEXT,
    consumer_name TEXT,
    cycle_id      TEXT,
    sent_at       TEXT DEFAULT (datetime('now'))
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_properties_society     ON properties(society)`,
  `CREATE INDEX IF NOT EXISTS idx_properties_sub_society ON properties(sub_society)`,
  `CREATE INDEX IF NOT EXISTS idx_properties_wing_code   ON properties(wing_code)`,
  `CREATE INDEX IF NOT EXISTS idx_properties_phone       ON properties(phone_number)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_property   ON assignments(property_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_agent      ON assignments(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_cycle      ON assignments(cycle_id)`,
  `CREATE INDEX IF NOT EXISTS idx_readings_assignment    ON readings(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_readings_status        ON readings(status_code)`,
  `CREATE INDEX IF NOT EXISTS idx_whatsapp_property      ON whatsapp_logs(property_id)`,
  `CREATE INDEX IF NOT EXISTS idx_whatsapp_phone         ON whatsapp_logs(phone_number)`,
  `CREATE INDEX IF NOT EXISTS idx_whatsapp_cycle         ON whatsapp_logs(cycle_id)`,
];

// D1 REST API only exposes /query (not /batch). Run each statement individually.
async function runStatement(sql) {
  const url = D1_BASE + '/query';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + API_TOKEN,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ sql, params: [] }),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errors = (json.errors || []).map(e => (typeof e === 'string' ? e : e.message)).join('\n') || response.statusText;
    console.error('[D1] runStatement failed — endpoint:', url);
    console.error('[D1] response body:', JSON.stringify(json));
    throw new Error('D1 error:\n' + errors);
  }

  return json.result;
}

async function main() {
  console.log('🚀  Pushing schema to Cloudflare D1 …');
  console.log('    Account:', ACCOUNT_ID);
  console.log('    Database:', DATABASE_ID);
  console.log('    Statements:', STATEMENTS.length);

  let ok = 0;
  for (const sql of STATEMENTS) {
    const label = sql.slice(0, 60).replace(/\s+/g, ' ').trim();
    try {
      await runStatement(sql);
      ok++;
      console.log('  ✔ ', label + ' …');
    } catch (err) {
      console.error('  ❌  Failed:', label);
      console.error('     ', err.message);
      // Don't abort — continue with remaining statements
    }
  }

  console.log('\n✅  D1 schema initialization complete! (' + ok + '/' + STATEMENTS.length + ' statements applied)');
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌  Schema init failed:', err.message);
    process.exit(1);
  });
}

module.exports = { STATEMENTS, main };
