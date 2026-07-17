import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const initDb = async () => {
  if (db) return db;
  
  db = await SQLite.openDatabaseAsync('fieldwatt.db');
  
  // Create properties table to cache today's assignments
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      serial_no TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      address TEXT NOT NULL,
      meter_no TEXT,
      property_type TEXT,
      lat REAL,
      lng REAL,
      area_name TEXT,
      society TEXT,
      sub_society TEXT,
      building_code TEXT,
      bp_no TEXT
    );

    CREATE TABLE IF NOT EXISTS readings_queue (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      reading_value REAL,
      status_code TEXT NOT NULL,
      photo_url TEXT,
      note TEXT,
      gps_lat REAL,
      gps_lng REAL,
      gps_accuracy REAL,
      submitted_at TEXT NOT NULL,
      is_synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Handle migration upgrades for existing local db instances
  try {
    await db.execAsync('ALTER TABLE properties ADD COLUMN area_name TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await db.execAsync('ALTER TABLE properties ADD COLUMN society TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await db.execAsync('ALTER TABLE properties ADD COLUMN sub_society TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await db.execAsync('ALTER TABLE properties ADD COLUMN building_code TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await db.execAsync('ALTER TABLE properties ADD COLUMN bp_no TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  console.log('Local SQLite database initialized.');
  return db;
};

export const getDb = () => {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
};

// Get the agent ID that last populated this device's local cache
export const getStoredAgentId = async (): Promise<string | null> => {
  const database = getDb();
  const row: any = await database.getFirstAsync(
    "SELECT value FROM meta WHERE key = 'current_agent_id'"
  );
  return row ? row.value : null;
};

// Persist the agent ID into meta so we can detect agent switches on next login
export const setStoredAgentId = async (agentId: string) => {
  const database = getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('current_agent_id', ?)",
    [agentId]
  );
};

// Wipe all properties and drop database tables to force schema recreation
export const clearPropertiesCache = async () => {
  const database = getDb();
  await database.runAsync('DROP TABLE IF EXISTS properties');
  await database.runAsync('DROP TABLE IF EXISTS readings_queue');
  await database.runAsync('DROP TABLE IF EXISTS meta');
  console.log('Local cache wiped — database dropped for schema recreation.');
};

// Wipe cached properties for a specific society name
export const clearCachedPropertiesForSociety = async (societyName: string): Promise<void> => {
  const database = getDb();
  const all = (await getCachedProperties()) as any[];
  const filtered = all.filter(p => (p.society || '').trim() !== societyName.trim());
  
  // Copy exactly how clearPropertiesCache does the delete:
  await database.runAsync('DROP TABLE IF EXISTS properties');
  
  // Recreate the table schema fresh
  await initDb();
  
  // Re-save only the filtered list (all properties except the ones for the target society)
  await saveProperties(filtered);
};

// Wipe the readings queue completely (used to resolve stuck validation payloads)
export const clearReadingsQueue = async (): Promise<void> => {
  const database = getDb();
  await database.runAsync('DELETE FROM readings_queue');
  console.log('Local readings queue wiped.');
};

// Cache today's assignments locally
export const saveProperties = async (properties: any[]) => {
  const database = getDb();
  console.log(`saveProperties: Saving ${properties.length} properties to SQLite...`);
  if (properties.length > 0) {
    console.log('saveProperties: raw first item:', JSON.stringify(properties[0]));
    console.log('saveProperties: sample item:', {
      id: properties[0].property_id,
      society: properties[0].society,
      sub_society: properties[0].sub_society,
      building_code: properties[0].building_code
    });
  }
  
  // Clear old properties before caching new ones
  await database.runAsync('DELETE FROM properties');
  
  for (const prop of properties) {
    await database.runAsync(
      `INSERT INTO properties (id, assignment_id, serial_no, consumer_name, address, meter_no, property_type, lat, lng, area_name, society, sub_society, building_code, bp_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prop.property_id,
        prop.assignment_id,
        prop.serial_no,
        prop.consumer_name,
        prop.address,
        prop.meter_no || null,
        prop.property_type,
        prop.property_lat ? parseFloat(prop.property_lat) : null,
        prop.property_lng ? parseFloat(prop.property_lng) : null,
        prop.area_name || null,
        prop.society || null,
        prop.sub_society || null,
        prop.building_code || null,
        prop.bp_no || null
      ]
    );
  }
};

// Retrieve cached properties merged with their queued readings if any
export const getCachedProperties = async () => {
  const database = getDb();
  const rows = await database.getAllAsync(`
    SELECT p.*, r.reading_value, r.status_code as reading_status, r.photo_url, r.note, r.is_synced, r.id as queued_reading_id
    FROM properties p
    LEFT JOIN readings_queue r ON p.assignment_id = r.assignment_id
    ORDER BY CAST(p.serial_no AS INTEGER) ASC
  `);
  return rows;
};

// Queue a reading for offline upload
export const queueReading = async (reading: {
  assignment_id: string;
  idempotency_key: string;
  reading_value?: number | null;
  status_code: string;
  photo_url?: string | null;
  note?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_accuracy?: number | null;
  submitted_at: string;
}) => {
  const database = getDb();
  const uuid = reading.idempotency_key;
  
  await database.runAsync(
    `INSERT OR REPLACE INTO readings_queue (
      id, assignment_id, idempotency_key, reading_value, status_code, photo_url, note, gps_lat, gps_lng, gps_accuracy, submitted_at, is_synced
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      uuid,
      reading.assignment_id,
      reading.idempotency_key,
      reading.reading_value !== undefined ? reading.reading_value : null,
      reading.status_code,
      reading.photo_url || null,
      reading.note || null,
      reading.gps_lat || null,
      reading.gps_lng || null,
      reading.gps_accuracy || null,
      reading.submitted_at
    ]
  );
};

// Retrieve all unsynced readings in the queue
export const getUnsyncedReadings = async () => {
  const database = getDb();
  const rows = await database.getAllAsync(
    'SELECT * FROM readings_queue WHERE is_synced = 0'
  );
  return rows;
};

// Mark matching readings as synced (or delete them to keep the file small)
export const markReadingsAsSynced = async (idempotencyKeys: string[]) => {
  const database = getDb();
  for (const key of idempotencyKeys) {
    // ponytail: delete to save storage space on device after confirmation
    await database.runAsync(
      'DELETE FROM readings_queue WHERE idempotency_key = ?',
      [key]
    );
  }
};

export const getPropertyById = async (id: string) => {
  const database = getDb();
  const rows = await database.getAllAsync('SELECT * FROM properties WHERE id = ?', [id]);
  if (rows.length > 0) {
    return rows[0];
  }
  return null;
};

// Retrieve app build version from SQLite meta table
export const getStoredVersion = async (): Promise<string | null> => {
  const database = getDb();
  try {
    const row: any = await database.getFirstAsync(
      "SELECT value FROM meta WHERE key = 'app_build_version'"
    );
    return row ? row.value : null;
  } catch (e) {
    return null;
  }
};

// Update app build version in SQLite meta table
export const setStoredVersion = async (version: string) => {
  const database = getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('app_build_version', ?)",
    [version]
  );
};

