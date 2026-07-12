const { workerData, parentPort } = require('worker_threads');
const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const { filePath, adminId } = workerData;

// Initialize independent connection pool for the worker thread
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2, // ponytail: minimal connections for background workers
});

// ─────────────────────────────────────────────
// Normalise any string: trim, collapse spaces, uppercase
// ─────────────────────────────────────────────
const normalise = (s) => {
  if (s === null || s === undefined) return '';
  return s.toString().trim().replace(/\s+/g, ' ').toUpperCase();
};

// ─────────────────────────────────────────────
// Canonical area key: remove ALL spaces then uppercase
// "KRISHNA NAYAN" and "KRISHNANAYAN" → "KRISHNANAYAN"
// Used only for deduplication — the display name is preserved from first occurrence
// ─────────────────────────────────────────────
const areaKey = (s) => normalise(s).replace(/\s/g, '');

// ─────────────────────────────────────────────
// Map House number supplement to property_type enum
// FLAT → flat, PLOT / PLOT NO / RH / anything else → bungalow
// ─────────────────────────────────────────────
const mapPropertyType = (supplement) => {
  const v = normalise(supplement);
  if (v === 'FLAT') return 'flat';
  if (v === 'BUNGALOW') return 'bungalow';
  return 'bungalow'; // PLOT, PLOT NO, RH, blank all become bungalow
};

// ─────────────────────────────────────────────
// Build a human-readable address from address component columns
// ─────────────────────────────────────────────
const buildAddress = (row) => {
  const parts = [
    row['House number supplement'], // FLAT / PLOT
    row['House Number'],            // 1003, 10A, 2, etc.
    row['Floor in building'],       // 10TH FLOOR, GROUND FLO, etc.
    row['Street 2'],
    row['Street 3'],
    row['Street'],                  // Society / building name (primary)
    row['Location'],
  ]
    .map(normalise)
    .filter(Boolean);

  return parts.join(', ') || 'Unknown Address';
};

// ─────────────────────────────────────────────
// Detect the column layout of the incoming Excel file
// Supports two modes:
//   A) The real SAP export format ("MR ORDER ID", "BPNAME", "MRU NAME" …)
//   B) A simple generic format ("Area", "Serial No", "Consumer Name" …)
// ─────────────────────────────────────────────
const detectFormat = (headers) => {
  const h = headers.map((x) => normalise(x?.toString() || ''));
  const isSAP = h.some((x) => x === 'MR ORDER ID') || h.some((x) => x === 'MRU NAME');
  return isSAP ? 'SAP' : 'GENERIC';
};

// ─────────────────────────────────────────────
// SAP format: parse one data object (from sheet_to_json with header:1 → object mode)
// ─────────────────────────────────────────────
const parseSAPRow = (row) => {
  const mruName   = normalise(row['MRU NAME']);       // e.g. KOT006_E — used as area
  const orderId   = normalise(row['MR ORDER ID']);    // unique serial / order id
  const bpName    = normalise(row['BPNAME']);         // consumer name
  const deviceNo  = normalise(row['Device Serial No.']); // meter number
  const city      = normalise(row['city']) || 'PUNE';
  const ptype     = mapPropertyType(row['House number supplement']);
  const address   = buildAddress(row);
  const society   = normalise(row['Street']) || null; // Extract Street as society

  if (!orderId || !bpName) return null;

  return {
    area_name: mruName || 'UNKNOWN',
    city,
    serial_no: orderId,
    consumer_name: bpName,
    address,
    meter_no: deviceNo || null,
    property_type: ptype,
    society,
  };
};

// ─────────────────────────────────────────────
// Generic format: use flexible column mapping (legacy support)
// ─────────────────────────────────────────────
const getGenericMapping = (headers) => {
  const mapping = { area: -1, serial_no: -1, consumer_name: -1, address: -1, meter_no: -1, property_type: -1, society: -1 };
  headers.forEach((h, idx) => {
    const k = normalise(h?.toString() || '').replace(/[^A-Z0-9]/g, '');
    if (['AREA', 'AREANAME', 'ZONE', 'REGION'].includes(k))                         mapping.area = idx;
    else if (['SERIALNO', 'SERIALNUMBER', 'SERIAL', 'SRNO', 'SNO'].includes(k))     mapping.serial_no = idx;
    else if (['CONSUMERNAME', 'CUSTOMERNAME', 'NAME', 'CONSUMER'].includes(k))      mapping.consumer_name = idx;
    else if (['ADDRESS', 'LOCATION', 'PROPERTYADDRESS'].includes(k))                mapping.address = idx;
    else if (['METERNO', 'METERNUMBER', 'METER', 'METERCODE'].includes(k))          mapping.meter_no = idx;
    else if (['PROPERTYTYPE', 'TYPE', 'BUILDINGTYPE'].includes(k))                  mapping.property_type = idx;
    else if (['SOCIETY', 'COLONY', 'STREET'].includes(k))                           mapping.society = idx;
  });
  return mapping;
};

const parseGenericRow = (row, mapping) => {
  const get = (idx) => (idx !== -1 && row[idx] ? row[idx].toString().trim() : null);
  const serialNo = get(mapping.serial_no);
  if (!serialNo) return null;
  return {
    area_name: get(mapping.area) || 'Default Area',
    city: null,
    serial_no: serialNo,
    consumer_name: get(mapping.consumer_name) || 'Unknown',
    address: get(mapping.address) || 'Unknown Address',
    meter_no: get(mapping.meter_no) || null,
    property_type: mapPropertyType(get(mapping.property_type)),
    society: get(mapping.society) || null,
  };
};

const extractCode = (name) => {
  const match = name.toUpperCase().match(/\b(KOD|KOT|KAR)\b/);
  return match ? match[1] : 'GEN';
};

const parseScheduledDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  const str = val.toString().trim();
  const dmy = str.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})$/);
  if (dmy) {
    return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  }
  const ymd = str.match(/^(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})$/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  }
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed);
};

const getBillingMonthLabel = (date) => {
  if (!date) return 'Unknown Month';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
const processExcel = async () => {
  const { fileName } = workerData;
  const dbClient = await pool.connect();

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });

    // Pick the sheet with the most rows (handles files where Sheet4/cover comes before Sheet1 with data)
    let rawRows = [];
    let usedSheet = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      if (rows.length > rawRows.length) {
        rawRows = rows;
        usedSheet = sheetName;
      }
    }

    if (rawRows.length < 2) {
      throw new Error('Excel file does not contain any data rows.');
    }

    // Parse using first row as headers
    const headers = (rawRows[0] || []).map((h) => h?.toString() || '');
    const format = detectFormat(headers);

    // Convert remaining rows to objects keyed by header name (for SAP format)
    let dataObjects = [];
    if (format === 'SAP') {
      dataObjects = XLSX.utils.sheet_to_json(workbook.Sheets[usedSheet], { defval: null });
    }

    const genericMapping = format === 'GENERIC' ? getGenericMapping(headers) : null;

    if (format === 'GENERIC' && (genericMapping.serial_no === -1 || genericMapping.consumer_name === -1)) {
      throw new Error('Excel must contain "Serial No" and "Consumer Name" columns.');
    }

    const total = format === 'SAP' ? dataObjects.length : rawRows.length - 1;

    // Resolve date and file properties
    let rawDateVal = null;
    if (format === 'SAP' && dataObjects.length > 0) {
      rawDateVal = dataObjects[0]['Scheduled meter reading date'];
    } else if (format === 'GENERIC' && rawRows.length > 1) {
      const dateIdx = headers.findIndex(h => h && (h.toString().toLowerCase().includes('date') || h.toString().toLowerCase().includes('month')));
      if (dateIdx >= 0) {
        rawDateVal = rawRows[1][dateIdx];
      }
    }

    const schedDate = parseScheduledDate(rawDateVal) || new Date();
    const billingMonth = getBillingMonthLabel(schedDate);
    const fileCode = extractCode(fileName || 'PMC_GEN_FILE');
    const path = require('path');
    const cleanFileName = fileName ? path.basename(fileName, path.extname(fileName)) : 'Imported Spreadsheet';

    // 1. Resolve or Create Active Billing Cycle dynamically matching month label
    let cycleId = null;
    const existingCycle = await dbClient.query(
      `SELECT id FROM cycles WHERE label = $1 LIMIT 1`,
      [billingMonth]
    );
    if (existingCycle.rows.length > 0) {
      cycleId = existingCycle.rows[0].id;
    } else {
      // Create new cycle and set it as active (and others inactive)
      await dbClient.query('UPDATE cycles SET is_active = false');
      const start_date = new Date(schedDate.getFullYear(), schedDate.getMonth(), 1);
      const end_date = new Date(schedDate.getFullYear(), schedDate.getMonth() + 1, 0);
      const newCycle = await dbClient.query(
        `INSERT INTO cycles (label, start_date, end_date, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [billingMonth, start_date, end_date]
      );
      cycleId = newCycle.rows[0].id;
    }

    // 2. Insert into imports tracking table
    const importRes = await dbClient.query(
      `INSERT INTO imports (file_name, file_code, scheduled_date, billing_month, total_rows, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [cleanFileName, fileCode, schedDate, billingMonth, total, adminId]
    );
    const importId = importRes.rows[0].id;

    parentPort.postMessage({ type: 'start', total, importId });

    // ── Area deduplication cache ──────────────────────────────────────────────
    // key: areaKey(name) → { id, displayName }
    // This collapses "KRISHNA NAYAN" and "KRISHNANAYAN" into one area row
    const areaCache = {}; // canonical_key → { id, city }

    const resolveArea = async (rawName, city) => {
      const display = normalise(rawName);
      const key = areaKey(display);

      if (areaCache[key]) return areaCache[key].id;

      // Check DB first (previous imports may have created it under either spelling)
      // We normalise by stripping spaces and doing UPPER comparison
      const existing = await dbClient.query(
        `SELECT id FROM areas WHERE UPPER(REPLACE(name, ' ', '')) = $1 LIMIT 1`,
        [key]
      );

      if (existing.rows.length > 0) {
        areaCache[key] = { id: existing.rows[0].id };
        return existing.rows[0].id;
      }

      // Insert — use the normalised display name (spaces preserved, UPPER)
      const inserted = await dbClient.query(
        `INSERT INTO areas (name, city) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city
         RETURNING id`,
        [display, city || null]
      );

      const id = inserted.rows[0].id;
      areaCache[key] = { id };
      return id;
    };

    // ── Process in chunks of 200 ──────────────────────────────────────────────
    const CHUNK_SIZE = 200;
    const rows = format === 'SAP' ? dataObjects : rawRows.slice(1);

    // Warm up the area cache to avoid querying the DB for existing areas (ponytail: memory caching avoids roundtrip latency)
    const existingAreas = await dbClient.query('SELECT id, name FROM areas');
    for (const row of existingAreas.rows) {
      const key = areaKey(normalise(row.name));
      areaCache[key] = { id: row.id };
    }

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);

      await dbClient.query('BEGIN');

      const parsedChunkRows = [];

      for (const raw of chunk) {
        let parsed = null;

        if (format === 'SAP') {
          parsed = parseSAPRow(raw);
        } else {
          parsed = parseGenericRow(raw, genericMapping);
        }

        if (!parsed) continue;

        const { area_name, city, serial_no, consumer_name, address, meter_no, property_type, society } = parsed;

        // 1. Resolve area (deduplication-safe lookup from memory cache)
        const areaId = await resolveArea(area_name, city);

        parsedChunkRows.push({
          areaId,
          serial_no,
          consumer_name,
          address,
          meter_no,
          property_type,
          society
        });
      }

      if (parsedChunkRows.length > 0) {
        const values = [];
        const valueStrings = [];
        let paramCount = 1;

        for (const row of parsedChunkRows) {
          valueStrings.push(`($${paramCount}, $${paramCount+1}, $${paramCount+2}, $${paramCount+3}, $${paramCount+4}, $${paramCount+5}, $${paramCount+6}, $${paramCount+7})`);
          values.push(row.areaId, row.serial_no, row.consumer_name, row.address, row.meter_no, row.property_type, importId, row.society);
          paramCount += 8;
        }

        const bulkQuery = `
          INSERT INTO properties (area_id, serial_no, consumer_name, address, meter_no, property_type, import_id, society)
          VALUES ${valueStrings.join(', ')}
          ON CONFLICT (serial_no)
          DO UPDATE SET
            area_id        = EXCLUDED.area_id,
            consumer_name  = EXCLUDED.consumer_name,
            address        = EXCLUDED.address,
            meter_no       = EXCLUDED.meter_no,
            property_type  = EXCLUDED.property_type,
            import_id      = EXCLUDED.import_id,
            society        = EXCLUDED.society
        `;

        await dbClient.query(bulkQuery, values);
      }

      await dbClient.query('COMMIT');
      parentPort.postMessage({ type: 'progress', progress: Math.min(i + CHUNK_SIZE, total) });
    }

    parentPort.postMessage({ type: 'done', importId });
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => {});
    parentPort.postMessage({ type: 'error', error: error.message });
  } finally {
    dbClient.release();
    pool.end();
  }
};

processExcel();
