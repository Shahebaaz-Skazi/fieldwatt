/**
 * scripts/repair-null-areas.js
 *
 * Scans the database for properties where area_id is NULL.
 * Extracts the area name/MRU from the raw_sap_data JSON column,
 * resolves (or creates) the corresponding area record,
 * and updates the property records in chunks.
 *
 * Usage:
 *   node scripts/repair-null-areas.js
 */
require('dotenv').config();
const db = require('../src/utils/db');

const normalise = (s) => {
  if (s === null || s === undefined) return '';
  return s.toString().trim().replace(/\s+/g, ' ').toUpperCase();
};

const areaKey = (s) => normalise(s).replace(/\s/g, '');

async function run() {
  console.log('====================================================');
  console.log('    REPAIR PROPERTIES WITH NULL AREA_ID             ');
  console.log('====================================================\n');

  // 1. Warm up the area cache
  console.log('- Loading existing areas into memory...');
  const areaCache = {}; // canonical_key -> id
  const existingAreas = await db.query('SELECT id, name FROM areas');
  for (const row of existingAreas.rows) {
    const key = areaKey(row.name);
    areaCache[key] = row.id;
  }
  console.log(`  Cached ${Object.keys(areaCache).length} areas.`);

  const resolveArea = async (rawName) => {
    const display = normalise(rawName) || 'UNKNOWN';
    const key = areaKey(display);

    if (areaCache[key]) return areaCache[key];

    // Check DB just in case cache misses
    const existing = await db.query(
      `SELECT id FROM areas WHERE UPPER(REPLACE(name, ' ', '')) = $1 LIMIT 1`,
      [key]
    );
    if (existing.rows.length > 0) {
      areaCache[key] = existing.rows[0].id;
      return existing.rows[0].id;
    }

    // Insert new area
    console.log(`  Creating new area: "${display}"`);
    const inserted = await db.query(
      `INSERT INTO areas (name, city) VALUES ($1, 'PUNE') RETURNING id`,
      [display]
    );
    const id = inserted.rows[0].id;
    areaCache[key] = id;
    return id;
  };

  // 2. Fetch properties with null area_id in chunks
  const CHUNK_SIZE = 1000;
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  console.log('\n- Fetching properties with NULL area_id...');
  while (true) {
    const queryRes = await db.query(
      `SELECT id, raw_sap_data FROM properties WHERE area_id IS NULL LIMIT $1`,
      [CHUNK_SIZE]
    );

    const properties = queryRes.rows;
    if (properties.length === 0) {
      break;
    }

    console.log(`  Processing chunk of ${properties.length} properties...`);

    // Group properties by area name
    const updates = {}; // areaId -> [propertyIds]

    for (const p of properties) {
      let rawSap = {};
      if (typeof p.raw_sap_data === 'string') {
        try {
          rawSap = JSON.parse(p.raw_sap_data);
        } catch {}
      } else if (p.raw_sap_data) {
        rawSap = p.raw_sap_data;
      }

      // Extract area name from common import keys
      const rawAreaName = rawSap['MRU NAME'] || rawSap['Area'] || rawSap['AREANAME'] || rawSap['ZONE'] || rawSap['REGION'] || 'UNKNOWN';
      const areaId = await resolveArea(rawAreaName);

      if (!updates[areaId]) {
        updates[areaId] = [];
      }
      updates[areaId].push(p.id);
    }

    // Build batch statements
    const statements = [];
    for (const [areaId, ids] of Object.entries(updates)) {
      // D1 limit is 100 parameters, so chunk property IDs inside IN clause if they exceed 50 items
      const ID_CHUNK_SIZE = 50;
      for (let j = 0; j < ids.length; j += ID_CHUNK_SIZE) {
        const idChunk = ids.slice(j, j + ID_CHUNK_SIZE);
        const placeholders = idChunk.map((_, idx) => `$${idx + 2}`).join(', ');
        statements.push({
          sql: `UPDATE properties SET area_id = $1 WHERE id IN (${placeholders})`,
          params: [areaId, ...idChunk]
        });
      }
    }

    // Run batch update in D1
    if (statements.length > 0) {
      await db.batch(statements);
      totalUpdated += properties.length;
    }

    totalProcessed += properties.length;
    console.log(`  Processed: ${totalProcessed} properties.`);

    // If properties returned are less than CHUNK_SIZE, we are done
    if (properties.length < CHUNK_SIZE) {
      break;
    }
  }

  console.log('\n====================================================');
  console.log('                 REPAIR SUMMARY                     ');
  console.log('====================================================');
  console.log(`  Total Properties Inspected: ${totalProcessed}`);
  console.log(`  Successfully Mapped:        ${totalUpdated}`);
  console.log('====================================================\n');
}

run().catch(console.error);
