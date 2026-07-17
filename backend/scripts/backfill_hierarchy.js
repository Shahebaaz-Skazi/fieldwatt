const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  const client = await pool.connect();
  try {
    console.log('Backfilling sub_society and wing_code from raw_sap_data...');
    
    const result = await client.query(`
      UPDATE properties
      SET
        sub_society = NULLIF(TRIM(raw_sap_data->>'Street 3'), ''),
        wing_code = CASE
          WHEN UPPER(TRIM(raw_sap_data->>'Building (Number or Code)')) IN
               ('', '_', '-', '.', '/', 'NA', 'N/A', 'NONE', 'NULL', 'GENERAL', 'GEN', 'GENRAL')
          THEN NULL
          ELSE UPPER(TRIM(raw_sap_data->>'Building (Number or Code)'))
        END
      WHERE raw_sap_data IS NOT NULL
    `);
    
    console.log(`✔ Backfilled ${result.rowCount} properties with sub_society and wing_code.`);
  } catch (err) {
    console.error('Backfill failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

run();
