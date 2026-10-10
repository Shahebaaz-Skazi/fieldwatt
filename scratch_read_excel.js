const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('f:\\fieldwatt\\reading correction 24.09.2026.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);
  
  console.log('Total rows:', data.length);
  console.log('Headers:', Object.keys(data[0] || {}));
  console.log('First 5 rows:');
  console.log(data.slice(0, 5));
} catch (err) {
  console.error('Error reading excel file:', err);
}
