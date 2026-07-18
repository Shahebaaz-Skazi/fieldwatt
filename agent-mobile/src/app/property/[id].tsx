import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, SafeAreaView, Platform, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPropertyById, queueReading } from '../../db/sqlite';
import { syncOfflineReadings } from '../../services/syncService';
import api from '../../utils/api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, Camera } from 'expo-camera';
import ViewShot from 'react-native-view-shot';
import useAuthStore from '../../store/authStore';

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

const applyWatermarkToImage = async (
  uri: string, 
  serialNo: string, 
  bpNo: string, 
  submittedAt: string
): Promise<string> => {
  // Save the clean photo to the agent's photo gallery on native
  if (Platform.OS !== 'web') {
    try {
      const MediaLibrary = require('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(uri);
        console.log('✔ Clean photo successfully saved to agent device gallery.');
      } else {
        console.warn('Media Library permission denied - skipping gallery save.');
      }
    } catch (saveErr) {
      console.warn('Failed to save clean image to device gallery:', saveErr);
    }
  }

  return uri; // Return the clean original photo uri (no watermark on phone side)
};

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [property, setProperty] = useState<any>(null);
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
      const prop = await getPropertyById(id as string);
      if (prop) {
        setProperty(prop);
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

  const handleCapturePhoto = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Camera Permission Required', 'We need access to the camera to document the reading.');
        return;
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
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
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
    const { width, height } = Dimensions.get('window');
    const agentName = useAuthStore.getState().user?.name || 'Default Agent';
    const bpNoStr = (property?.bp_no || 'N/A').toString();
    const meterNo = property?.meter_no || 'N/A';

    return (
      <View style={styles.cameraContainer}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'jpg', quality: 0.85 }}
          style={{ width, height }}
        >
          <CameraView
            style={{ flex: 1 }}
            ref={cameraRef}
            facing="back"
          />
          
          {/* Watermark overlay — visible while shooting */}
          <View style={styles.watermarkOverlay}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.watermarkText}>{agentName}</Text>
              <Text style={styles.watermarkText}>{currentTime}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.watermarkText}>Meter: {meterNo} (BP: {bpNoStr})</Text>
              <Text style={styles.watermarkText}>{cameraGps}</Text>
            </View>
          </View>
        </ViewShot>

        {/* Shutter controls */}
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.cancelCameraButton}
            onPress={() => setCameraActive(false)}
          >
            <Text style={styles.cancelCameraText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shutterButton}
            onPress={async () => {
              try {
                if (cameraRef.current && viewShotRef.current) {
                  // Trigger shutter
                  await cameraRef.current.takePictureAsync({ quality: 0.5 });
                  
                  // Capture with watermark burned in
                  const uri = await viewShotRef.current.capture();
                  console.log('✔ Captured watermarked photo path:', uri);
                  
                  // Save to gallery
                  try {
                    const MediaLibrary = require('expo-media-library');
                    const { status } = await MediaLibrary.requestPermissionsAsync();
                    if (status === 'granted') {
                      await MediaLibrary.saveToLibraryAsync(uri);
                      console.log('✔ Saved watermarked photo to gallery.');
                    }
                  } catch (e) {
                    console.warn('Failed to save to gallery:', e);
                  }
                  
                  setPhotoUri(uri);
                  setCameraActive(false);
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

  if (loading || !property) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#111827" size="large" />
      </View>
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
        <Text style={styles.headerTitle}>Sr. {property.serial_no}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Property details */}
        <View style={styles.section}>
          <Text style={styles.consumerName}>{property.consumer_name}</Text>
          <Text style={styles.address}>{property.address}</Text>
          <Text style={styles.detailText}>Meter number: <Text style={{ color: '#111827', fontWeight: '600' }}>{property.meter_no || 'N/A'}</Text></Text>
          <Text style={styles.detailText}>Type: <Text style={{ color: '#111827', fontWeight: '600', textTransform: 'capitalize' }}>{property.property_type.replace('_', ' ')}</Text></Text>
        </View>

        {/* Previous Reading History */}
        {history.length > 0 ? (
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 20 }]}>
            <Text style={styles.sectionTitle}>Reading History</Text>
            {history.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={styles.historyCycle}>{h.cycle_label || 'Past Month'}</Text>
                <Text style={styles.historyValue}>
                  {h.reading_value ? `${h.reading_value} kWh` : h.status_code.replace('_', ' ')}
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
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
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

          <TouchableOpacity 
            onPress={handleSubmit} 
            disabled={submitting}
            style={styles.submitBtn}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Operations Entry</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  consumerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 8,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusButton: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusButtonActive: {
    borderColor: '#111827',
    backgroundColor: '#f3f4f6',
  },
  statusButtonText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
  statusButtonTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
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
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
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
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 4,
    borderRadius: 4,
    overflow: 'hidden',
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
