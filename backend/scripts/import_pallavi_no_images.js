const xlsx = require('xlsx');
const db = require('../src/db');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const CYCLE_ID = '83b91bca-44fc-46b2-abf2-31390e94189e';
const PALLAVI_ID = '33bdb6c4-a678-4cdf-912d-c3112c3db201';

async function run() {
  const wb = xlsx.readFile('../Pallavi Upload 05.10.2026.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`Loaded ${data.length} rows from Excel.`);
  
  const bps = data.map(r => String(r.bp_number || r['BP No.']).replace(/^0+/, '')).filter(Boolean);
  console.log(`Found ${bps.length} valid BPs.`);
  
  // Get property IDs
  const props = await db.query('SELECT id, LTRIM(json_extract(raw_sap_data, \'$.\"BP No.\"\'), \'0\') as bp_no FROM properties');
  const propMap = new Map(props.rows.filter(r => r.bp_no).map(r => [r.bp_no, r.id]));
  console.log(`Loaded ${propMap.size} properties from DB.`);
  
  // Get existing assignments
  const asgs = await db.query('SELECT id, property_id, is_completed FROM assignments WHERE cycle_id = ?', [CYCLE_ID]);
  const asgMap = new Map(asgs.rows.map(a => [a.property_id, a]));
  
  // Get existing readings
  const reads = await db.query('SELECT assignment_id FROM readings WHERE assignment_id IN (SELECT id FROM assignments WHERE cycle_id = ?)', [CYCLE_ID]);
  const readSet = new Set(reads.rows.map(r => r.assignment_id));
  
  const batch = [];
  let skipped = 0;
  
  for (const row of data) {
    const bp = String(row.bp_number || row['BP No.']).replace(/^0+/, '');
    const mr = row.meter_reading || 0;
    
    const propId = propMap.get(bp);
    if (!propId) {
      console.log(`Skipping BP ${bp}: Not found in properties`);
      continue;
    }
    
    let asgId;
    const existingAsg = asgMap.get(propId);
    
    if (existingAsg) {
      asgId = existingAsg.id;
      if (!existingAsg.is_completed) {
        batch.push({
          sql: 'UPDATE assignments SET is_completed = 1, agent_id = ? WHERE id = ?',
          params: [PALLAVI_ID, asgId]
        });
      }
    } else {
      asgId = `asg_${propId.substring(0,8)}_${Date.now()}`;
      batch.push({
        sql: 'INSERT INTO assignments (id, agent_id, property_id, cycle_id, is_completed, created_at) VALUES (?, ?, ?, ?, 1, datetime(\'now\'))',
        params: [asgId, PALLAVI_ID, propId, CYCLE_ID]
      });
      asgMap.set(propId, { id: asgId, is_completed: 1 });
    }
    
    if (readSet.has(asgId)) {
      // Update existing reading
      batch.push({
        sql: 'UPDATE readings SET reading_value = ?, photo_url = NULL, note = \'whats app reading\' WHERE assignment_id = ?',
        params: [mr, asgId]
      });
      continue;
    }
    
    const rdId = `rd_${uuidv4()}`;
    const dbTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    batch.push({
      sql: 'INSERT INTO readings (id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, submitted_at, synced_at) VALUES (?, ?, ?, ?, \'reading_taken\', NULL, \'whats app reading\', ?, datetime(\'now\'))',
      params: [rdId, asgId, rdId, mr, dbTime]
    });
    
    readSet.add(asgId);
  }
  
  console.log(`Prepared ${batch.length} SQL statements. Skipped ${skipped} already-completed readings.`);
  
  if (batch.length === 0) return;
  
  const CHUNK_SIZE = 50;
  for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
    const chunk = batch.slice(i, i + CHUNK_SIZE);
    
    console.log(`Sending chunk ${Math.floor(i/CHUNK_SIZE)+1} of ${Math.ceil(batch.length/CHUNK_SIZE)}...`);
    try {
      await db.batch(chunk);
    } catch (e) {
      console.error('D1 error:', e.message);
    }
  }
  console.log('Import complete!');
}

run().catch(console.error);
