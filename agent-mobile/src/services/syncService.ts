import { getUnsyncedReadings, markReadingsAsSynced } from '../db/sqlite';
import api from '../utils/api';

export const syncOfflineReadings = async (): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const readings = await getUnsyncedReadings();
    if (readings.length === 0) {
      return { success: true, count: 0 };
    }

    const BATCH_SIZE = 50;
    let syncedCount = 0;

    for (let i = 0; i < readings.length; i += BATCH_SIZE) {
      const chunk = readings.slice(i, i + BATCH_SIZE);
      
      // Map database row schema keys to API request payload
      const payload = chunk.map(r => ({
        assignment_id: r.assignment_id,
        idempotency_key: r.idempotency_key,
        reading_value: r.reading_value !== null ? parseFloat(r.reading_value.toString()) : null,
        status_code: r.status_code,
        photo_url: r.photo_url || null,
        note: r.note || null,
        gps_lat: r.gps_lat !== null ? parseFloat(r.gps_lat.toString()) : null,
        gps_lng: r.gps_lng !== null ? parseFloat(r.gps_lng.toString()) : null,
        gps_accuracy: r.gps_accuracy !== null ? parseFloat(r.gps_accuracy.toString()) : null,
        submitted_at: r.submitted_at
      }));

      try {
        const response = await api.post('/sync/batch', { readings: payload });
        
        // If response is successful, update SQLite to remove synced items
        const syncedKeys = chunk.map(r => r.idempotency_key);
        await markReadingsAsSynced(syncedKeys);
        syncedCount += chunk.length;
      } catch (err: any) {
        console.error('Batch sync failure:', err.message);
        return { success: false, count: syncedCount, error: err.message };
      }
    }

    return { success: true, count: syncedCount };
  } catch (error: any) {
    console.error('Sync pipeline crash:', error);
    return { success: false, count: 0, error: error.message };
  }
};
