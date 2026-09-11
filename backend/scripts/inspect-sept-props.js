require('dotenv').config();
const db = require('../src/utils/db');

async function inspectSeptProps() {
  const imp = await db.query("SELECT * FROM imports WHERE file_name LIKE '%PCMCPM30%' OR billing_month = 'September 2026'");
  console.log('Import row:', imp.rows);

  if (imp.rows.length > 0) {
    const importId = imp.rows[0].id;
    const propCount = await db.query("SELECT COUNT(*) as count FROM properties WHERE import_id = $1", [importId]);
    console.log('Properties with import_id =', importId, ':', propCount.rows[0].count);

    const propSample = await db.query("SELECT id, area_id, serial_no, consumer_name, import_id FROM properties WHERE import_id = $1 LIMIT 5", [importId]);
    console.log('Sample properties:', propSample.rows);

    const totalProps = await db.query("SELECT COUNT(*) as count FROM properties");
    console.log('Total properties in DB:', totalProps.rows[0].count);

    const nullImportProps = await db.query("SELECT COUNT(*) as count FROM properties WHERE import_id IS NULL");
    console.log('Properties with import_id IS NULL:', nullImportProps.rows[0].count);
  }
}

inspectSeptProps().finally(() => process.exit(0));
