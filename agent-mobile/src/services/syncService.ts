import { getUnsyncedReadings, markReadingsAsSynced } from '../db/sqlite';
import api from '../utils/api';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Image } from 'react-native';

let isSyncing = false;

// Upload local photo to Supabase before syncing the reading
const uploadLocalPhoto = async (uri: string): Promise<string> => {
  if (uri.startsWith('http')) return uri;

  // --- DIAGNOSTICS BEFORE UPLOAD (STAGE C) ---
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      Image.getSize(
        uri,
        (w, h) => resolve({ width: w, height: h }),
        () => resolve({ width: 0, height: 0 })
      );
    });

    console.log(`[STAGE C - BEFORE UPLOAD] URI: ${uri}`);
    console.log(`[STAGE C - BEFORE UPLOAD] Size: ${fileInfo.exists ? fileInfo.size : 'N/A'} bytes`);
    console.log(`[STAGE C - BEFORE UPLOAD] Dimensions: ${width}x${height}`);

    // Save exact copy of what we are uploading to gallery
    const savedBefore = await CameraRoll.saveAsset(uri, { type: 'photo' });
    console.log(`[STAGE C - BEFORE UPLOAD] Saved to gallery: ${savedBefore.uri}`);
  } catch (diagErr) {
    console.warn('Diagnostics stage C error:', diagErr);
  }

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

  // --- DIAGNOSTICS AFTER UPLOAD (STAGE D) ---
  try {
    // Download the uploaded file back from the public server URL
    const tempDest = `${FileSystem.cacheDirectory}downloaded_test_${Date.now()}.jpg`;
    const downloadResult = await FileSystem.downloadAsync(photoUrl, tempDest);
    
    const downloadInfo = await FileSystem.getInfoAsync(downloadResult.uri);
    const { width: dw, height: dh } = await new Promise<{ width: number; height: number }>((resolve) => {
      Image.getSize(
        downloadResult.uri,
        (w, h) => resolve({ width: w, height: h }),
        () => resolve({ width: 0, height: 0 })
      );
    });

    console.log(`[STAGE D - AFTER UPLOAD / DOWNLOAD] Public URL: ${photoUrl}`);
    console.log(`[STAGE D - AFTER UPLOAD / DOWNLOAD] Local URI: ${downloadResult.uri}`);
    console.log(`[STAGE D - AFTER UPLOAD / DOWNLOAD] Size: ${downloadInfo.exists ? downloadInfo.size : 'N/A'} bytes`);
    console.log(`[STAGE D - AFTER UPLOAD / DOWNLOAD] Dimensions: ${dw}x${dh}`);

    // Save exact copy of downloaded file to gallery
    const savedAfter = await CameraRoll.saveAsset(downloadResult.uri, { type: 'photo' });
    console.log(`[STAGE D - AFTER UPLOAD / DOWNLOAD] Saved to gallery: ${savedAfter.uri}`);
  } catch (diagErr) {
    console.warn('Diagnostics stage D error:', diagErr);
  }

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
      let uploadFailed = false;
      let uploadErrorMsg = '';

      for (const r of chunk) {
        let finalPhotoUrl = r.photo_url || null;
        if (finalPhotoUrl && !finalPhotoUrl.startsWith('http')) {
          try {
            finalPhotoUrl = await uploadLocalPhoto(finalPhotoUrl);
          } catch (uploadErr: any) {
            console.error('Photo upload failed — leaving reading in queue for retry:', uploadErr);
            uploadFailed = true;
            uploadErrorMsg = uploadErr.message || 'Photo upload failed';
            break; // Abort processing this chunk
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

      if (uploadFailed) {
        isSyncing = false;
        return { success: false, count: syncedCount, error: `Upload aborted: ${uploadErrorMsg}` };
      }

      try {
        const response = await api.post('/sync/batch', { readings: payload });
        
        // If response is successful, update SQLite to remove synced items
        const syncedKeys = response.synced || chunk.map((r: any) => r.idempotency_key);
        await markReadingsAsSynced(syncedKeys);
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
