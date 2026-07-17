import { Platform } from 'react-native';

export const initDb = async () => {
  console.log('Web environment detected: SQLite mock init.');
  if (!localStorage.getItem('fieldwatt_properties')) {
    localStorage.setItem('fieldwatt_properties', JSON.stringify([]));
  }
  if (!localStorage.getItem('fieldwatt_readings_queue')) {
    localStorage.setItem('fieldwatt_readings_queue', JSON.stringify([]));
  }
  return {} as any; // mock ref
};

export const getDb = () => {
  return {} as any;
};

// Cache today's assignments locally
export const saveProperties = async (properties: any[]) => {
  localStorage.setItem('fieldwatt_properties', JSON.stringify(properties));
};

// Retrieve cached properties merged with their queued readings if any
export const getCachedProperties = async () => {
  const props = JSON.parse(localStorage.getItem('fieldwatt_properties') || '[]');
  const queue = JSON.parse(localStorage.getItem('fieldwatt_readings_queue') || '[]');
  
  const rows = props.map((p: any) => {
    const q = queue.find((item: any) => item.assignment_id === p.assignment_id);
    return {
      id: p.property_id || p.id,
      assignment_id: p.assignment_id,
      serial_no: p.serial_no,
      consumer_name: p.consumer_name,
      address: p.address,
      meter_no: p.meter_no,
      property_type: p.property_type,
      lat: p.property_lat ? parseFloat(p.property_lat) : p.lat,
      lng: p.property_lng ? parseFloat(p.property_lng) : p.lng,
      area_name: p.area_name || null,
      society: p.society || null,
      sub_society: p.sub_society || null,
      building_code: p.building_code || null,
      bp_no: p.bp_no || null,
      reading_value: q ? q.reading_value : null,
      reading_status: q ? q.status_code : null,
      photo_url: q ? q.photo_url : null,
      note: q ? q.note : null,
      is_synced: 0,
      queued_reading_id: q ? q.id : null
    };
  });

  // Sort by serial_no cast to integer
  return rows.sort((a: any, b: any) => parseInt(a.serial_no) - parseInt(b.serial_no));
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
  const queue = JSON.parse(localStorage.getItem('fieldwatt_readings_queue') || '[]');
  // Filter old entry if exists to emulate replace
  const filtered = queue.filter((item: any) => item.assignment_id !== reading.assignment_id);
  filtered.push(reading);
  localStorage.setItem('fieldwatt_readings_queue', JSON.stringify(filtered));
};

// Retrieve all unsynced readings in the queue
export const getUnsyncedReadings = async () => {
  return JSON.parse(localStorage.getItem('fieldwatt_readings_queue') || '[]');
};

// Mark matching readings as synced (or delete them to keep the file small)
export const markReadingsAsSynced = async (idempotencyKeys: string[]) => {
  const queue = JSON.parse(localStorage.getItem('fieldwatt_readings_queue') || '[]');
  const filtered = queue.filter((item: any) => !idempotencyKeys.includes(item.idempotency_key));
  localStorage.setItem('fieldwatt_readings_queue', JSON.stringify(filtered));
};

export const getPropertyById = async (id: string) => {
  const props = JSON.parse(localStorage.getItem('fieldwatt_properties') || '[]');
  const found = props.find((p: any) => p.property_id === id || p.id === id);
  if (found) {
    return {
      ...found,
      id: found.property_id || found.id
    };
  }
  return null;
};

export const getStoredAgentId = async (): Promise<string | null> => {
  return localStorage.getItem('fieldwatt_current_agent_id');
};

export const setStoredAgentId = async (agentId: string) => {
  localStorage.setItem('fieldwatt_current_agent_id', agentId);
};

export const clearPropertiesCache = async () => {
  localStorage.removeItem('fieldwatt_properties');
  localStorage.removeItem('fieldwatt_readings_queue');
  console.log('Web mock cache wiped — agent identity changed.');
};

export const clearCachedPropertiesForSociety = async (societyName: string): Promise<void> => {
  const all = (await getCachedProperties()) as any[];
  const filtered = all.filter(p => (p.society || '').trim() !== societyName.trim());
  localStorage.setItem('fieldwatt_properties', JSON.stringify(filtered));
};

export const clearReadingsQueue = async (): Promise<void> => {
  localStorage.removeItem('fieldwatt_readings_queue');
  console.log('Web readings queue wiped.');
};

export const getStoredVersion = async (): Promise<string | null> => {
  return localStorage.getItem('fieldwatt_app_build_version');
};

export const setStoredVersion = async (version: string) => {
  localStorage.setItem('fieldwatt_app_build_version', version);
};

