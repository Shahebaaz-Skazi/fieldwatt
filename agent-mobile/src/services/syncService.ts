import { getUnsyncedReadings, markReadingsAsSynced } from '../db/sqlite';
import api from '../utils/api';
import * as FileSystem from 'expo-file-system/legacy';

let isSyncing = false;

// Upload local photo to Supabase before syncing the reading
const uploadLocalPhoto = async (uri: string): Promise<string> => {
  if (uri.startsWith('http')) return uri;

  const filename = `meter_${Date.now()}.jpg`;

  // Get presigned upload URL from backend
  const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
    filename,
    contentType: 'image/jpeg'
  });

  // FileSystem.uploadAsync is the most reliable upload method on Android
  // No blob conversion needed — reads directly from local filesystem
  const result = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'image/jpeg',
    },
  });

  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Upload failed: status ${result.status}`);
  }

  console.log('✔ Photo uploaded successfully:', photoUrl);
  return photoUrl;
};

export const syncOfflineReadings = async (): Promise<{ success: boolean; count: number; error?: string }> => {
  if (isSyncing) {
    return { success: true, count: 0 };
  }
  isSyncing = true;
  try {
    const readings = (await getUnsyncedReadings()) as any[];
    if (readings.length === 0) {
      isSyncing = false;
      return { success: true, count: 0 };
    }

    const BATCH_SIZE = 50;
    let syncedCount = 0;

    for (let i = 0; i < readings.length; i += BATCH_SIZE) {
      const chunk = readings.slice(i, i + BATCH_SIZE);
      
      // Process and upload local images inside the chunk sequence
      const payload = [];
      for (const r of chunk) {
        let finalPhotoUrl = r.photo_url || null;
        if (finalPhotoUrl && !finalPhotoUrl.startsWith('http')) {
          try {
            finalPhotoUrl = await uploadLocalPhoto(finalPhotoUrl);
          } catch (uploadErr) {
            console.warn('Photo upload failed, syncing reading without photo:', uploadErr);
            finalPhotoUrl = null; // sync the reading even if photo fails
          }
        }

        payload.push({
          assignment_id: r.assignment_id,
          idempotency_key: r.idempotency_key,
          reading_value: r.reading_value !== null ? r.reading_value.toString() : null,
          status_code: r.status_code,
          photo_url: finalPhotoUrl,
          note: r.note || null,
          gps_lat: r.gps_lat !== null ? parseFloat(r.gps_lat.toString()) : null,
          gps_lng: r.gps_lng !== null ? parseFloat(r.gps_lng.toString()) : null,
          gps_accuracy: r.gps_accuracy !== null ? parseFloat(r.gps_accuracy.toString()) : null,
          submitted_at: r.submitted_at
        });
      }

      try {
        const response = await api.post('/sync/batch', { readings: payload });
        
        // If response is successful, update SQLite to remove synced items
        const syncedKeys = chunk.map(r => r.idempotency_key);
        await markReadingsAsSynced(syncedKeys);
        syncedCount += chunk.length;
      } catch (err: any) {
        console.error('Batch sync failure:', err.message);
        isSyncing = false;
        return { success: false, count: syncedCount, error: err.message };
      }
    }

    return { success: true, count: syncedCount };
  } catch (error: any) {
    console.error('Sync pipeline crash:', error);
    return { success: false, count: 0, error: error.message };
  } finally {
    isSyncing = false;
  }
};
