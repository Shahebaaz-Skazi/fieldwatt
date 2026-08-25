/**
 * scripts/test-self-reading-local.js
 *
 * Verifies if the D1 self-reading database query works successfully.
 */
require('dotenv').config();
const db = require('../src/utils/db');

const propertyId = '507298b6-c34a-4ecb-98d8-7acdddfa2ce9';

async function run() {
  console.log('====================================================');
  console.log('       TESTING SELF-READING DATABASE QUERY LOCAL     ');
  console.log('====================================================');

  try {
    const result = await db.query(
      `SELECT p.id as property_id, p.consumer_name, p.address, p.meter_no, p.serial_no as bp_no, p.society, a.name as area_name
       FROM properties p
       LEFT JOIN areas a ON a.id = p.area_id
       WHERE p.id = $1`,
      [propertyId]
    );

    console.log('Query result:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0) {
      console.log('✅ SUCCESS: Database query completed successfully and returned the property details!');
    } else {
      console.log('❌ FAILED: Property not found in database.');
    }
  } catch (err) {
    console.error('❌ QUERY ERROR:', err.message, err.stack);
  }
}

run();
