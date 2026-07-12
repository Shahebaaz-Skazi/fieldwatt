const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = "CREATE UNIQUE INDEX IF NOT EXISTS areas_name_nospace_key ON areas (UPPER(REPLACE(name, ' ', '')))";

pool.query(SQL)
  .then(() => { console.log('OK: dedup index created.'); })
  .catch(e => { console.error('Error:', e.message); })
  .finally(() => pool.end());
