// Quick dry-run: parse the Excel file and print what would be imported
// No DB writes — just console output
const XLSX = require('xlsx');

const filePath = 'F:\\firewatt\\ALL COMBAIN FILE KOD 30.04.2026..xlsx';

const normalise = (s) => {
  if (s === null || s === undefined) return '';
  return s.toString().trim().replace(/\s+/g, ' ').toUpperCase();
};

const areaKey = (s) => normalise(s).replace(/\s/g, '');

const mapPropertyType = (supplement) => {
  const v = normalise(supplement);
  if (v === 'FLAT') return 'flat';
  if (v === 'BUNGALOW') return 'bungalow';
  return 'bungalow';
};

const buildAddress = (row) => {
  const parts = [
    row['House number supplement'],
    row['House Number'],
    row['Floor in building'],
    row['Street 2'],
    row['Street 3'],
    row['Street'],
    row['Location'],
  ].map(normalise).filter(Boolean);
  return parts.join(', ') || 'Unknown Address';
};

const workbook = XLSX.readFile(filePath, { cellDates: true });
// Sheet1 has all 13487 rows; Sheet4 is the summary stub
const sheetName = 'Sheet1';
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

console.log(`Total rows: ${rows.length}`);

// Collect unique areas with key → display mapping
const areas = {};
let skipped = 0;
for (const row of rows) {
  const mruName = normalise(row['MRU NAME']);
  const orderId = normalise(row['MR ORDER ID']);
  const bpName = normalise(row['BPNAME']);
  if (!orderId || !bpName) { skipped++; continue; }

  const key = areaKey(mruName || 'UNKNOWN');
  if (!areas[key]) areas[key] = { display: mruName, count: 0 };
  areas[key].count++;
}

console.log(`\nSkipped empty rows: ${skipped}`);
console.log(`\n=== AREAS THAT WILL BE CREATED (${Object.keys(areas).length}) ===`);
for (const [k, v] of Object.entries(areas)) {
  console.log(`  KEY: "${k}"  →  DISPLAY: "${v.display}"  (${v.count} properties)`);
}

// Show 3 sample parsed properties
console.log('\n=== 3 SAMPLE PARSED PROPERTIES ===');
for (const row of rows.slice(0, 3)) {
  console.log({
    area: normalise(row['MRU NAME']),
    serial_no: normalise(row['MR ORDER ID']),
    consumer_name: normalise(row['BPNAME']),
    meter_no: normalise(row['Device Serial No.']),
    property_type: mapPropertyType(row['House number supplement']),
    address: buildAddress(row),
    city: normalise(row['city']) || 'PUNE',
  });
}
