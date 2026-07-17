const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrationFilePath = path.join(__dirname, '../migrations/003_add_property_hierarchy_columns.sql');
const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

console.log('Running migration: 003_add_property_hierarchy_columns.sql...');

pool.query(migrationSql)
  .then(() => {
    console.log('Migration completed successfully.');
  })
  .catch(e => {
    console.error('Migration failed:', e.message);
  })
  .finally(() => pool.end());
