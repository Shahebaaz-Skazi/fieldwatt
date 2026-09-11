const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../PCMCPM30 15.09.2026.xlsx');
const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const dataObjects = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

console.log('Total data objects:', dataObjects.length);
console.log('Sample row 0 keys:', Object.keys(dataObjects[0]));
console.log('Sample row 0 MR ORDER I:', dataObjects[0]['MR ORDER I']);
console.log('Sample row 0 MR ORDER ID:', dataObjects[0]['MR ORDER ID']);
