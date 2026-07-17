import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPropertyById, queueReading } from '../../db/sqlite';
import { syncOfflineReadings } from '../../services/syncService';
import api from '../../utils/api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const applyWatermarkToImage = async (
  uri: string, 
  serialNo: string, 
  bpNo: string, 
  submittedAt: string
): Promise<string> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return uri; // Fallback for non-web environments
  }
  
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(uri);
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      const fontSize = Math.max(Math.round(canvas.width * 0.035), 18);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#FFFF00'; // Yellow
      
      const d = new Date(submittedAt);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hour = String(d.getHours()).padStart(2, '0');
      const minute = String(d.getMinutes()).padStart(2, '0');
      const dateStr = `${day}-${month}-${year} ${hour}:${minute}`;
      
      const serialStr = serialNo || 'N/A';
      const bpStr = bpNo || 'N/A';
      
      const marginX = Math.round(canvas.width * 0.04);
      const marginY = Math.round(canvas.height * 0.04);

      // Top Right: Timestamp
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(dateStr, canvas.width - marginX, marginY);
      
      // Bottom Left: Device Serial No.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(serialStr, marginX, canvas.height - marginY);
      
      // Bottom Right: BP No.
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(bpStr, canvas.width - marginX, canvas.height - marginY);
      
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      } catch (err) {
        console.warn('Canvas toDataURL export failed:', err);
        resolve(uri);
      }
    };
    
    img.onerror = () => {
      console.warn('Failed to load image for watermarking');
      resolve(uri);
    };
    
    img.src = uri;
  });
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
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Required', 'We need access to the camera to document the reading.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        
        const bpNoStr = (property?.bp_no || 'N/A').toString();
        const watermarked = await applyWatermarkToImage(
          uri,
          property?.meter_no || 'N/A',
          bpNoStr,
          new Date().toISOString()
        );
        
        setPhotoUri(watermarked);
      }
    } catch (err) {
      console.error('Failed to launch camera:', err);
      Alert.alert('Camera Error', 'Could not open the native camera app. Please try again.');
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

  const uploadPhotoToSupabase = async (uri: string) => {
    if (uri.startsWith('http')) return uri; // Simulated remote url
    
    const filename = `meter_${Date.now()}.jpg`;
    
    // 1. Get presigned upload URL from backend
    const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
      filename,
      contentType: 'image/jpeg'
    });

    // 2. PUT binary file directly to signed URL
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'image/jpeg',
      }
    });

    if (!uploadRes.ok) {
      throw new Error('Supabase binary upload failed.');
    }

    return photoUrl; // Public URL
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
      Alert.alert('Validation Error', 'Reading value is required.');
      return;
    }

    const requiresPhoto = ['reading_taken', 'door_locked', 'meter_damaged', 'meter_not_found'].includes(statusCode);
    if (requiresPhoto && !photoUri) {
      Alert.alert('Validation Error', 'Photo verification is mandatory for this status.');
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

      // 2. Compress and upload photo directly
      let finalPhotoUrl = photoUri;
      if (photoUri) {
        const compressed = await compressPhoto(photoUri);
        finalPhotoUrl = await uploadPhotoToSupabase(compressed);
      }

      // 3. Queue reading locally
      const uuid = generateUUID();
      
      await queueReading({
        assignment_id: property.assignment_id,
        idempotency_key: uuid,
        reading_value: readingValue ? parseFloat(readingValue) : null,
        status_code: statusCode,
        photo_url: finalPhotoUrl,
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

      Alert.alert('Reading Saved', 'Meter reading successfully logged to sync queue.');
      goBackSafe();
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to save reading.');
    } finally {
      setSubmitting(false);
    }
  };

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
              <Text style={styles.label}>Reading Value (kWh)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter numbers only..."
                placeholderTextColor="#8b9bb4"
                keyboardType="numeric"
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
});
