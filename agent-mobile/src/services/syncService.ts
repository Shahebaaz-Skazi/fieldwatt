import { getUnsyncedReadings, markReadingsAsSynced } from '../db/sqlite';
import api from '../utils/api';
import * as ImageManipulator from 'expo-image-manipulator';

let isSyncing = false;

// Upload local photo to Supabase before syncing the reading
const uploadLocalPhoto = async (uri: string): Promise<string> => {
  if (uri.startsWith('http')) return uri;
  
  // Compress photo first to save bandwidth and storage
  let finalUri = uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [], // no resize — preserve original dimensions
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
    );
    finalUri = result.uri;
  } catch (err) {
    console.warn('Sync photo compression failed, uploading raw:', err);
  }

  const filename = `meter_${Date.now()}.jpg`;
  
  // Get presigned upload URL from backend
  const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
    filename,
    contentType: 'image/jpeg'
  });

  // PUT binary file directly to signed URL using native XMLHttpRequest
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve(photoUrl);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send({ uri: finalUri, type: 'image/jpeg', name: filename } as any);
  });
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
            console.log('Syncing: Uploading local photo to Supabase:', finalPhotoUrl);
            finalPhotoUrl = await uploadLocalPhoto(finalPhotoUrl);
          } catch (uploadErr: any) {
            console.error('Failed to upload photo during sync:', uploadErr.message);
            isSyncing = false;
            return { success: false, count: syncedCount, error: `Photo upload failed: ${uploadErr.message}` };
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
