/**
 * Single-query phone backfill using SQLite json_extract().
 * One API call to D1 instead of 13,000 individual UPDATEs.
 * 
 * Logic:
 *  - 10-digit number → prepend "91"
 *  - 11-digit starting with 0 → strip leading 0, prepend "91"
 *  - 12-digit → use as-is
 *  - anything else → skip (likely landline or garbage)
 */
const db = require('../src/utils/db');

async function main() {
  console.log('Running single-query phone backfill via json_extract...');

  // D1/SQLite supports json_extract natively.
  // We strip non-digits, then handle length-based normalization.
  // CAST + REPLACE removes spaces/dashes from mobile numbers.
  const result = await db.query(`
    UPDATE properties
    SET phone_number = CASE
      WHEN length(CAST(CAST(json_extract(raw_sap_data, '$."Mobile No."') AS TEXT) AS TEXT)) = 0 THEN phone_number
      WHEN length(replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', '')) = 10
        THEN '91' || replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', '')
      WHEN length(replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', '')) = 11
        AND substr(replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', ''), 1, 1) = '0'
        THEN '91' || substr(replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', ''), 2)
      WHEN length(replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', '')) = 12
        THEN replace(replace(replace(replace(json_extract(raw_sap_data, '$."Mobile No."'), ' ', ''), '-', ''), '+', ''), '.0', '')
      ELSE phone_number
    END
    WHERE (phone_number IS NULL OR phone_number = '')
      AND json_extract(raw_sap_data, '$."Mobile No."') IS NOT NULL
      AND json_extract(raw_sap_data, '$."Mobile No."') != ''
      AND json_extract(raw_sap_data, '$."Mobile No."') != '0'
  `);

  console.log('Backfill query done. Checking results...');

  const [withPhone, noPhone] = await Promise.all([
    db.query("SELECT COUNT(*) as cnt FROM properties WHERE phone_number IS NOT NULL AND phone_number != ''"),
    db.query("SELECT COUNT(*) as cnt FROM properties WHERE phone_number IS NULL OR phone_number = ''"),
  ]);

  console.log(`\n=== RESULT ===`);
  console.log(`Properties WITH phone_number: ${withPhone.rows[0].cnt}`);
  console.log(`Properties WITHOUT phone:     ${noPhone.rows[0].cnt}`);

  // Show sample
  const sample = await db.query(`
    SELECT consumer_name, phone_number FROM properties
    WHERE phone_number IS NOT NULL AND phone_number != ''
    LIMIT 10
  `);
  console.log('\nSample (first 10):');
  sample.rows.forEach(r => console.log(`  ${r.consumer_name} — ${r.phone_number}`));
}

main().catch(console.error).finally(() => process.exit(0));
