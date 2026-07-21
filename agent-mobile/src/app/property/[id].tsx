import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, SafeAreaView, Platform, Dimensions, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPropertyById, queueReading, updatePropertyStatus } from '../../db/sqlite';
import { syncOfflineReadings } from '../../services/syncService';
import api from '../../utils/api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, Camera } from 'expo-camera';
import useAuthStore from '../../store/authStore';
import * as ScreenOrientation from 'expo-screen-orientation';

import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ViewShot from 'react-native-view-shot';
// FileSystem removed to prevent native unlinked load crash
import { sharedData } from '../../utils/sharedData';

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};



export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [property, setProperty] = useState<any>(() => {
    // Sync pre-populate from shared memory store to prevent blank screens immediately
    if (sharedData.activeProperty && (
      sharedData.activeProperty.id === id || 
      sharedData.activeProperty.property_id === id ||
      String(sharedData.activeProperty.id) === String(id)
    )) {
      return sharedData.activeProperty;
    }
    return null;
  });
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [readingValue, setReadingValue] = useState('');
  const [statusCode, setStatusCode] = useState('reading_taken');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Custom Watermark Camera States
  const [cameraActive, setCameraActive] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [cameraGps, setCameraGps] = useState('Fetching GPS...');
  const viewShotRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const watermarkShotRef = useRef<any>(null);
  const [pendingWatermarkUri, setPendingWatermarkUri] = useState<string | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = useState('');
  const [captureGps, setCaptureGps] = useState('');
  const [watermarkImageReady, setWatermarkImageReady] = useState(false);
  const watermarkImageReadyRef = useRef(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [photoAspect, setPhotoAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!cameraActive) return;
    const updateTime = () => {
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hour = String(d.getHours()).padStart(2, '0');
      const minute = String(d.getMinutes()).padStart(2, '0');
      const second = String(d.getSeconds()).padStart(2, '0');
      setCurrentTime(`${day}-${month}-${year} ${hour}:${minute}:${second}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive) return;
    let isMounted = true;
    const startGpsWatch = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (isMounted) {
            setCameraGps(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
          }
        } else {
          if (isMounted) setCameraGps('GPS Denied');
        }
      } catch (err) {
        if (isMounted) setCameraGps('GPS Unavailable');
      }
    };
    startGpsWatch();
    return () => {
      isMounted = false;
    };
  }, [cameraActive]);

  const fetchPropertyData = async () => {
    try {
      // Only hit SQLite database if memory store was empty or mismatched
      if (!property) {
        const prop = await getPropertyById(id as string);
        if (prop) {
          setProperty(prop);
        }
      }
      
      // Fetch reading history for property (last 3 months)
      try {
        const historyData = await api.get(`/agent/properties/${id}/history?_t=${Date.now()}`);
        setHistory(historyData);
      } catch (err) {
        console.warn('Could not load history from API (offline fallback active):', err);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPropertyData();
  }, [id]);

  useEffect(() => {
    return () => {
      // Ensure orientation is reset when leaving this screen
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Effect to process and burn watermark into static image after capture
  useEffect(() => {
    if (!pendingWatermarkUri) return;

    const burnWatermark = async () => {
      try {
        if (!watermarkShotRef.current) {
          setPhotoUri(pendingWatermarkUri);
          setPendingWatermarkUri(null);
          return;
        }

        // Get real photo dimensions FIRST before anything else
        const { width: imgW, height: imgH } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          Image.getSize(
            pendingWatermarkUri,
            (w, h) => resolve({ width: w, height: h }),
            reject
          );
        });

        // Use actual photo aspect ratio for ViewShot dimensions
        const aspect = imgW / imgH;
        const shotWidth = width;
        const shotHeight = Math.round(width / aspect);
        setPhotoAspect(aspect);

        // Small delay for React to apply new dimensions
        await new Promise(resolve => setTimeout(resolve, 100));

        watermarkImageReadyRef.current = false;
        setWatermarkImageReady(false);
        setCaptureMode(true);

        // Wait for image onLoad (max 5 seconds)
        const imageLoaded = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 5000);
          const checkInterval = setInterval(() => {
            if (watermarkImageReadyRef.current) {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve(true);
            }
          }, 50);
        });

        if (!imageLoaded) {
          console.warn('Image load timeout, using raw photo');
          setPhotoUri(pendingWatermarkUri!);
          setPendingWatermarkUri(null);
          setCaptureMode(false);
          return;
        }

        // 3 frames + delay for full Android render
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 150));

        const watermarkedUri = await watermarkShotRef.current.capture({
          format: 'jpg',
          quality: 0.92,
          result: 'tmpfile',
          useRenderInContext: true,
        });
        console.log('✔ Watermark burned in:', watermarkedUri);

        // Save to gallery
        try {
          await CameraRoll.saveAsset(watermarkedUri, { type: 'photo' });
          console.log('✔ Watermarked photo saved to gallery');
        } catch (e) {
          console.warn('Gallery save failed:', e);
        }

        setPhotoUri(watermarkedUri);
        setPendingWatermarkUri(null);
        setCaptureMode(false);
      } catch (err) {
        console.warn('Watermark burn failed, using raw photo:', err);
        setPhotoUri(pendingWatermarkUri!);
        setPendingWatermarkUri(null);
        setCaptureMode(false);
      }
    };

    burnWatermark();
  }, [pendingWatermarkUri]);

  const closeCamera = async () => {
    setCameraActive(false);
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (e) {
      console.warn('Failed to lock orientation on camera close:', e);
    }
  };

  const handleCapturePhoto = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Camera Permission Required', 'We need access to the camera to document the reading.');
        return;
      }
      
      // Lock orientation based on status code
      try {
        if (statusCode === 'reading_taken') {
          console.log('Locking orientation to LANDSCAPE for meter reading photo.');
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          console.log('Locking orientation to PORTRAIT_UP for door locked/other photo.');
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
        // Wait for Android to finish the rotation transition before mounting CameraView
        await new Promise(resolve => setTimeout(resolve, 350));
      } catch (orientationErr) {
        console.warn('Orientation lock failed on this device, opening camera anyway:', orientationErr);
      }
      
      setCameraActive(true);
    } catch (err) {
      console.error('Failed to request camera permission:', err);
      showAlert('Camera Error', 'Could not open the camera. Please try again.');
    }
  };

  const compressPhoto = async (uri: string) => {
    // Compress to 200KB (approx)
    if (uri.startsWith('http')) return uri; // Skip remote urls
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [], // no resize — preserve original dimensions
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (error) {
      console.warn('Failed to compress photo:', error);
      return uri;
    }
  };

  const uploadPhotoToSupabase = async (uri: string): Promise<string> => {
    if (uri.startsWith('http')) return uri;
    
    const filename = `meter_${Date.now()}.jpg`;
    
    const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
      filename,
      contentType: 'image/jpeg'
    });

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
      xhr.send({ uri, type: 'image/jpeg', name: filename } as any);
    });
  };

  const goBackSafe = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleSubmit = async () => {
    // Validations
    if (statusCode === 'reading_taken' && !readingValue) {
      showAlert('Validation Error', 'Reading value is required.');
      return;
    }

    const requiresPhoto = ['reading_taken', 'door_locked', 'meter_damaged', 'meter_not_found'].includes(statusCode);
    if (requiresPhoto && !photoUri) {
      showAlert('Validation Error', 'Photo verification is mandatory for this status.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Fetch GPS coordinates
      let gpsLat: number | null = null;
      let gpsLng: number | null = null;
      let gpsAccuracy: number | null = null;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsLat = loc.coords.latitude;
          gpsLng = loc.coords.longitude;
          gpsAccuracy = loc.coords.accuracy;
        }
      } catch (err) {
        console.warn('Location fetching failed:', err);
      }

      // 2. Queue reading locally with raw local photoUri (upload happens during background sync)
      const uuid = generateUUID();
      
      await queueReading({
        assignment_id: property.assignment_id,
        idempotency_key: uuid,
        reading_value: readingValue || null,
        status_code: statusCode,
        photo_url: photoUri || null,
        note,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        gps_accuracy: gpsAccuracy,
        submitted_at: new Date().toISOString()
      });

      // Immediately mark property as done in local SQLite so UI updates without waiting for sync
      await updatePropertyStatus(property.assignment_id, statusCode);

      // Fire auto-sync immediately in background (fails silently if offline, queue persists)
      syncOfflineReadings().catch((err) => {
        console.warn('Immediate auto-sync failure:', err.message);
      });

      showAlert('Reading Saved', 'Meter reading successfully logged to sync queue.');
      goBackSafe();
    } catch (err: any) {
      showAlert('Submission Error', err.message || 'Failed to save reading.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cameraActive) {
    const isLandscape = width > height;
    const watermarkPadding = isLandscape ? 20 : 12;
    const watermarkFontSize = isLandscape ? 13 : 11;

    const agentName = useAuthStore.getState().user?.name || 'Default Agent';
    const bpNoStr = (property?.bp_no || 'N/A').toString();
    const meterNo = property?.meter_no || 'N/A';

    return (
      <View style={styles.cameraContainer}>
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
          <CameraView
            style={{ flex: 1 }}
            ref={cameraRef}
            facing="back"
          />
          
          {/* Watermark overlay — visible while shooting, visual only */}
          <View style={[styles.watermarkOverlay, { padding: watermarkPadding }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={[styles.watermarkText, { fontSize: watermarkFontSize }]}>{agentName}</Text>
              <Text style={[styles.watermarkText, { fontSize: watermarkFontSize }]}>{currentTime}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={[styles.watermarkText, { fontSize: watermarkFontSize }]}>Meter: {meterNo}</Text>
              <Text style={[styles.watermarkText, { fontSize: watermarkFontSize }]}>BP: {bpNoStr}</Text>
            </View>
          </View>
        </View>

        {/* Shutter controls */}
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.cancelCameraButton}
            onPress={closeCamera}
          >
            <Text style={styles.cancelCameraText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shutterButton}
            onPress={async () => {
              try {
                if (cameraRef.current) {
                  // Snapshot the timestamp and GPS at the exact moment of capture
                  setCaptureTimestamp(currentTime);
                  setCaptureGps(cameraGps);
                  
                  // Take the raw photo
                  const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
                  console.log('✔ Raw photo captured:', photo.uri);


                  
                  // Close camera and trigger watermark processing
                  setCameraActive(false);
                  try {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                  } catch (e) {}
                  
                  // This triggers the useEffect that burns watermark and saves to gallery
                  setPendingWatermarkUri(photo.uri);
                }
              } catch (err) {
                console.error('Capture failed:', err);
                showAlert('Capture Error', 'Failed to take photo. Please try again.');
              }
            }}
          >
            <View style={styles.shutterButtonInner} />
          </TouchableOpacity>
          
          <View style={{ width: 60 }} />
        </View>
      </View>
    );
  }

  // Still loading and no data from nav params yet — show spinner
  if (loading && !property) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#111827" size="large" />
      </View>
    );
  }

  // Finished loading but property is genuinely not found — show error instead of blank
  if (!property) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <Text style={{ fontSize: 32 }}>⚠️</Text>
        <Text style={{ color: '#111827', fontSize: 16, fontWeight: '600' }}>Property not found</Text>
        <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
          Could not load property data. Go back and tap the flat again.
        </Text>
        <TouchableOpacity onPress={goBackSafe} style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#111827', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const statuses = [
    { code: 'reading_taken', label: 'Reading taken ✅' },
    { code: 'door_locked', label: 'Door locked 🔒' },
    { code: 'not_reachable', label: 'Not reachable 📵' },
    { code: 'access_denied', label: 'Access denied ❌' },
    { code: 'meter_not_found', label: 'Meter not found 🔍' },
    { code: 'meter_damaged', label: 'Meter damaged ⚠️' },
    { code: 'vacant_property', label: 'Vacant 🏚️' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackSafe} style={styles.backButton}>
          <Text style={{ color: '#111827', fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BP: {property.bp_no || property.serial_no}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Property details */}
        <View style={styles.section}>
          <Text style={styles.consumerName}>{property.consumer_name}</Text>
          <Text style={styles.address}>{property.address}</Text>
          <Text style={styles.detailText}>Meter number: <Text style={{ color: '#111827', fontWeight: '600' }}>{property.meter_no || 'N/A'}</Text></Text>
          <Text style={styles.detailText}>Type: <Text style={{ color: '#111827', fontWeight: '600', textTransform: 'capitalize' }}>{(property.property_type || '').replace('_', ' ')}</Text></Text>
        </View>

        {/* Previous Reading History */}
        {history.length > 0 ? (
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 20 }]}>
            <Text style={styles.sectionTitle}>Reading History</Text>
            {history.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={styles.historyCycle}>{h.cycle_label || 'Past Month'}</Text>
                <Text style={styles.historyValue}>
                  {h.reading_value ? `${h.reading_value} kWh` : (h.status_code || '').replace('_', ' ')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Form elements */}
        <View style={[styles.section, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 20 }]}>
          <Text style={styles.sectionTitle}>Submit Reading</Text>

          {/* Status selector */}
          <Text style={styles.label}>Visit Status</Text>
          <View style={styles.statusGrid}>
            {statuses.map(s => (
              <TouchableOpacity
                key={s.code}
                style={[styles.statusButton, statusCode === s.code && styles.statusButtonActive]}
                onPress={() => setStatusCode(s.code)}
              >
                <Text style={[styles.statusButtonText, statusCode === s.code && styles.statusButtonTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reading Value input */}
          {statusCode === 'reading_taken' ? (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Reading Value</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter reading..."
                placeholderTextColor="#8b9bb4"
                value={readingValue}
                onChangeText={setReadingValue}
              />
            </View>
          ) : null}

          {/* Photo attachment zone */}
          {['reading_taken', 'door_locked', 'meter_damaged', 'meter_not_found'].includes(statusCode) ? (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Verification Photo (Mandatory)</Text>
              {photoUri ? (
                <View style={styles.photoContainer}>
                  <Image
                    source={{ uri: photoUri! }}
                    style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 8, backgroundColor: '#111' }}
                    resizeMode="contain"
                    onError={(e) => console.warn('Photo preview load error:', e.nativeEvent.error)}
                  />
                  <TouchableOpacity onPress={() => setPhotoUri(null)} style={styles.removePhotoBtn}>
                    <Text style={styles.removePhotoText}>Remove & Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={handleCapturePhoto} style={styles.photoUploadBox}>
                  <Text style={{ fontSize: 24 }}>📸</Text>
                  <Text style={styles.photoUploadText}>Tap to Capture Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Note inputs */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Optional Note</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Add details, comments, access difficulties..."
              placeholderTextColor="#8b9bb4"
              multiline
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
            />
          </View>

          {pendingWatermarkUri !== null && (
            <Text style={{ color: '#f5a623', textAlign: 'center', marginBottom: 8, fontSize: 13 }}>
              ⏳ Processing photo watermark...
            </Text>
          )}

          <TouchableOpacity 
            onPress={handleSubmit} 
            disabled={submitting || pendingWatermarkUri !== null}
            style={[styles.submitBtn, (submitting || pendingWatermarkUri !== null) && { opacity: 0.6 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Operations Entry</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {pendingWatermarkUri && (
        <View style={{
          position: 'absolute',
          top: captureMode ? 0 : -9999,
          left: captureMode ? 0 : -9999,
          zIndex: captureMode ? 999 : -1,
          opacity: captureMode ? 1 : 0,
          backgroundColor: '#000',
        }}>
          <ViewShot
            ref={watermarkShotRef}
            options={{ format: 'jpg', quality: 0.92 }}
            style={{
              width: width,
              height: photoAspect ? Math.round(width / photoAspect) : height,
            }}
          >
            <View style={{ width: '100%', height: '100%' }}>
              <Image
                source={{ uri: pendingWatermarkUri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                onLoad={() => {
                  watermarkImageReadyRef.current = true;
                  setWatermarkImageReady(true);
                }}
              />
              <View style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                justifyContent: 'space-between',
                padding: 12,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.burnedWatermarkText} numberOfLines={1}>
                    {useAuthStore.getState().user?.name || 'Agent'}
                  </Text>
                  <Text style={styles.burnedWatermarkText} numberOfLines={1}>
                    {captureTimestamp}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.burnedWatermarkText} numberOfLines={1}>
                    Meter: {property?.meter_no || 'N/A'}
                  </Text>
                  <Text style={styles.burnedWatermarkText} numberOfLines={1}>
                    BP: {(property?.bp_no || property?.raw_sap_data?.['BP No.'] || 'N/A').toString()}
                  </Text>
                </View>
              </View>
            </View>
          </ViewShot>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContainer: {
    paddingVertical: 20,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  consumerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  address: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#374151',
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  historyCycle: {
    fontSize: 13,
    color: '#6b7280',
  },
  historyValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  statusButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  statusButtonTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  photoUploadBox: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoUploadText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  photoContainer: {
    alignItems: 'center',
  },
  removePhotoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
  },
  removePhotoText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  watermarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 40,
    pointerEvents: 'none',
  },
  watermarkText: {
    color: '#ffff00',
    fontSize: 11,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  burnedWatermarkText: {
    color: '#ffff00',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    flexShrink: 1,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cancelCameraButton: {
    padding: 12,
  },
  cancelCameraText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
});
