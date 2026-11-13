import { getUnsyncedReadings, markReadingsAsSynced, updateQueuedReadingPhoto } from '../db/sqlite';
import api from '../utils/api';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let isSyncing = false;

// Upload local photo to Cloudflare R2 via presigned URL before syncing the reading
const uploadLocalPhoto = async (uri: string): Promise<string> => {
  if (uri.startsWith('http')) return uri;

  const filename = `meter_${Date.now()}.jpg`;

  // Get presigned upload URL from backend
  const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
    filename,
    contentType: 'image/jpeg'
  });

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed: status ${putRes.status}`);
    }
  } else {
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
  }

  console.log('✔ Photo uploaded successfully to R2:', photoUrl);
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
        // Guard: purge corrupt legacy row missing assignment_id so it doesn't fail the batch
        if (!r.assignment_id) {
          console.warn('Purging corrupt queued reading without assignment_id:', r.idempotency_key);
          await markReadingsAsSynced([r.idempotency_key]);
          continue;
        }

        let finalPhotoUrl = r.photo_url || null;
        let finalNote = r.note || null;

        if (finalPhotoUrl && !finalPhotoUrl.startsWith('http')) {
          try {
            finalPhotoUrl = await uploadLocalPhoto(finalPhotoUrl);
            await updateQueuedReadingPhoto(r.idempotency_key, finalPhotoUrl);
          } catch (uploadErr: any) {
            const errStr = (uploadErr?.message || '').toLowerCase();
            // If network dropped, abort chunk so photo is NOT lost and stays in queue until online!
            if (
              errStr.includes('network') ||
              errStr.includes('failed to fetch') ||
              errStr.includes('timeout') ||
              errStr.includes('econnreset') ||
              errStr.includes('abort') ||
              errStr.includes('status 50') ||
              errStr.includes('status 429')
            ) {
              console.warn('Network issue uploading photo — keeping reading in queue for retry:', uploadErr);
              isSyncing = false;
              return { success: false, count: syncedCount, error: `Photo upload network error: ${uploadErr.message}` };
            }

            console.error('Photo permanently unreadable on device — proceeding without photo:', uploadErr);
            finalPhotoUrl = null;
            const photoFailureNote = 'Photo unreadable on device; reading synced without photo.';
            finalNote = finalNote 
              ? `${finalNote} | ${photoFailureNote}`
              : photoFailureNote;
          }
        }

        payload.push({
          assignment_id: r.assignment_id,
          idempotency_key: r.idempotency_key,
          reading_value: r.reading_value !== null ? r.reading_value.toString() : null,
          status_code: r.status_code,
          photo_url: finalPhotoUrl,
          note: finalNote,
          gps_lat: r.gps_lat !== null ? parseFloat(r.gps_lat.toString()) : null,
          gps_lng: r.gps_lng !== null ? parseFloat(r.gps_lng.toString()) : null,
          gps_accuracy: r.gps_accuracy !== null ? parseFloat(r.gps_accuracy.toString()) : null,
          submitted_at: r.submitted_at
        });
      }

      if (payload.length === 0) continue;

      try {
        const response = await api.post('/sync/batch', { readings: payload });
        
        // The backend returns { synced: string[], failed: { idempotency_key, reason }[] }
        const syncedKeys = response.synced || [];
        const failedKeys = (response.failed || []).map((f: any) => f.idempotency_key);
        
        const keysToRemove = [...syncedKeys, ...failedKeys];

        // Fallback if backend doesn't return synced/failed explicitly
        if (keysToRemove.length === 0 && !response.synced && !response.failed) {
          keysToRemove.push(...payload.map((r: any) => r.idempotency_key));
        }

        if (keysToRemove.length > 0) {
          await markReadingsAsSynced(keysToRemove);
        }
        
        syncedCount += syncedKeys.length;

        if (response.failed && response.failed.length > 0) {
          console.warn('Sync warning: server rejected some assignments:', response.failed);
        }
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
