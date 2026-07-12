import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, RefreshControl, SafeAreaView, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../store/authStore';
import { initDb, getCachedProperties, saveProperties } from '../db/sqlite';
import api from '../utils/api';
import SyncIndicator from '../components/SyncIndicator';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────
// Haversine formula to compute distance in metres
// ─────────────────────────────────────────────
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};

export default function WorkListScreen() {
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const router = useRouter();

  const [properties, setProperties] = useState<any[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Navigation states
  const [currentNavTab, setCurrentNavTab] = useState<'dashboard' | 'assignments' | 'profile'>('dashboard');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedSociety, setSelectedSociety] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'done' | 'problem'>('pending');

  // GPS Location states
  const [agentLocation, setAgentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestProperty, setNearestProperty] = useState<any | null>(null);
  const [selectedMapProperty, setSelectedMapProperty] = useState<any | null>(null);

  // Compute unique societies for selected area
  const availableSocieties = React.useMemo(() => {
    if (!selectedArea || selectedArea === 'All') return [];
    const filteredByArea = properties.filter(item => item.area_name === selectedArea);
    const uniqueSoc = new Set<string>();
    filteredByArea.forEach(item => {
      if (item.society) uniqueSoc.add(item.society);
    });
    return ['All', ...Array.from(uniqueSoc).sort()];
  }, [properties, selectedArea]);

  // Reset society filter when area changes
  useEffect(() => {
    setSelectedSociety('All');
  }, [selectedArea]);

  // Request GPS Permissions & location
  const getAgentGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setAgentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch (err) {
      console.warn('GPS location lookup unavailable (using fallback center):', err);
    }
  };

  useEffect(() => {
    if (token) {
      getAgentGPS();
      loadCachedData();
    }
  }, [token]);

  const loadCachedData = async () => {
    try {
      await initDb();
      const cached = await getCachedProperties();
      setProperties(cached);
      applyFilters(cached, search, activeTab, selectedArea, selectedSociety);
    } catch (e) {
      console.error('Error loading SQLite properties cache:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const freshAssignments = await api.get('/agent/assignments');
      await saveProperties(freshAssignments);
      const cached = await getCachedProperties();
      setProperties(cached);
      applyFilters(cached, search, activeTab, selectedArea, selectedSociety);
      // Fetch GPS again to refresh distances
      await getAgentGPS();
    } catch (e) {
      console.warn('Network refresh failed. Serving cached operations database:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const applyFilters = (data: any[], searchVal: string, tab: 'pending' | 'done' | 'problem', areaName: string, societyName: string) => {
    let result = [...data];

    // Filter by Area (Zone)
    if (areaName && areaName !== 'All') {
      result = result.filter(item => item.area_name === areaName);
    }

    // Filter by Society / Street
    if (societyName && societyName !== 'All') {
      result = result.filter(item => item.society === societyName);
    }

    // Filter by search query
    if (searchVal) {
      const q = searchVal.toLowerCase();
      result = result.filter(item => 
        item.consumer_name.toLowerCase().includes(q) || 
        item.serial_no.includes(q) || 
        (item.meter_no && item.meter_no.toLowerCase().includes(q)) ||
        (item.address && item.address.toLowerCase().includes(q))
      );
    }

    // Filter by tab
    if (tab === 'pending') {
      result = result.filter(item => !item.reading_status);
    } else if (tab === 'done') {
      result = result.filter(item => item.reading_status === 'reading_taken');
    } else if (tab === 'problem') {
      result = result.filter(item => item.reading_status && item.reading_status !== 'reading_taken');
    }

    setFilteredProperties(result);
  };

  // Re-run filter on search, tab, selectedArea, selectedSociety, or properties state change
  useEffect(() => {
    applyFilters(properties, search, activeTab, selectedArea, selectedSociety);
  }, [search, activeTab, properties, selectedArea, selectedSociety]);

  // Compute the nearest pending assignment locally (offline-first)
  useEffect(() => {
    const pending = properties.filter(p => !p.reading_status);
    if (pending.length === 0) {
      setNearestProperty(null);
      return;
    }

    if (agentLocation) {
      let minDistance = Infinity;
      let nearest = null;

      for (const p of pending) {
        if (p.lat === null || p.lng === null || p.lat === undefined) continue;
        const dist = haversineDistance(agentLocation.lat, agentLocation.lng, p.lat, p.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = p;
        }
      }

      if (nearest) {
        setNearestProperty({
          ...nearest,
          distance_m: minDistance
        });
      } else {
        // Fallback if coordinates are not seeded yet
        setNearestProperty({
          ...pending[0],
          distance_m: null
        });
      }
    } else {
      // Fallback if GPS coordinates are not loaded yet
      setNearestProperty({
        ...pending[0],
        distance_m: null
      });
    }
  }, [properties, agentLocation]);

  if (!token) {
    return <Redirect href="/login" />;
  }

  // Calculate statistics
  const total = properties.length;
  const doneCount = properties.filter(p => p.reading_status === 'reading_taken').length;
  const problemCount = properties.filter(p => p.reading_status && p.reading_status !== 'reading_taken').length;
  const completed = doneCount + problemCount;
  const progressPercent = total > 0 ? completed / total : 0;

  // ─────────────────────────────────────────────
  // Vector Radar Mapping Engine
  // ─────────────────────────────────────────────
  // Centers the agent, and plots properties relative to them.
  // Fallbacks: If no GPS is present, center around the average coordinate of seeded properties.
  // ─────────────────────────────────────────────
  const renderRadarMap = () => {
    // 1. Establish center coordinates
    let centerLat = agentLocation?.lat;
    let centerLng = agentLocation?.lng;

    if (!centerLat || !centerLng) {
      // Fallback center: average coordinates of properties that have them
      const withCoords = properties.filter(p => p.lat && p.lng);
      if (withCoords.length > 0) {
        centerLat = withCoords.reduce((acc, p) => acc + p.lat, 0) / withCoords.length;
        centerLng = withCoords.reduce((acc, p) => acc + p.lng, 0) / withCoords.length;
      } else {
        // Manhattan fallback coordinates
        centerLat = 40.7831;
        centerLng = -73.9712;
      }
    }

    // 2. Map coordinates to pixel offsets (radius: 120 pixels max screen projection)
    const RADAR_RADIUS = 135;
    const MAX_METRES = 600; // Zoom level scale: 600m radius covers active zone

    const mappedPins = properties.map(p => {
      if (!p.lat || !p.lng) return null;
      
      // Calculate distances in meters along X and Y axes
      const distY = haversineDistance(centerLat!, centerLng!, p.lat, centerLng!);
      const distX = haversineDistance(centerLat!, centerLng!, centerLat!, p.lng);

      const signY = p.lat >= centerLat! ? 1 : -1;
      const signX = p.lng >= centerLng! ? 1 : -1;

      const deltaX = distX * signX;
      const deltaY = distY * signY;

      // Project onto pixel grid relative to center
      const projX = (deltaX / MAX_METRES) * RADAR_RADIUS;
      const projY = (deltaY / MAX_METRES) * RADAR_RADIUS;

      // Calculate absolute distance for tooltip display
      const distance = haversineDistance(centerLat!, centerLng!, p.lat, p.lng);

      return {
        ...p,
        x: projX,
        y: projY,
        distance_m: distance
      };
    }).filter(Boolean);

    return (
      <View style={styles.radarContainer}>
        <View style={styles.radarHeader}>
          <Text style={styles.radarTitle}>🛰️ VECTOR RADAR MAP</Text>
          <Text style={styles.radarSubtitle}>Concentric scope: 600m range · Offline-safe</Text>
        </View>

        {/* The radar circle grid */}
        <View style={styles.radarScope}>
          {/* Circular grids */}
          <View style={[styles.radarRing, { width: 90, height: 90, borderRadius: 45 }]} />
          <View style={[styles.radarRing, { width: 180, height: 180, borderRadius: 90 }]} />
          <View style={[styles.radarRing, { width: 270, height: 270, borderRadius: 135 }]} />

          {/* Scope crosshairs */}
          <View style={[styles.radarLine, { width: 270, height: 1 }]} />
          <View style={[styles.radarLine, { width: 1, height: 270 }]} />

          {/* Properties Pins */}
          {mappedPins.map((pin: any) => {
            // Check boundaries
            const distFromCenter = Math.sqrt(pin.x * pin.x + pin.y * pin.y);
            if (distFromCenter > RADAR_RADIUS) return null; // out of scope

            const isNearest = nearestProperty && nearestProperty.id === pin.id;
            const isSelected = selectedMapProperty && selectedMapProperty.id === pin.id;

            // Determine pin color
            let pinColor = '#374151'; // Pending (gray)
            if (pin.reading_status === 'reading_taken') {
              pinColor = '#10b981'; // Done (green)
            } else if (pin.reading_status && pin.reading_status !== 'reading_taken') {
              pinColor = '#f59e0b'; // Problem (orange)
            }

            return (
              <TouchableOpacity
                key={pin.id}
                onPress={() => setSelectedMapProperty(pin)}
                style={[
                  styles.radarPin,
                  {
                    left: RADAR_RADIUS + pin.x - 7,
                    top: RADAR_RADIUS - pin.y - 7,
                    backgroundColor: pinColor,
                    borderColor: isSelected ? '#fff' : isNearest ? '#f5a623' : '#1f2937',
                    borderWidth: isSelected || isNearest ? 2 : 1,
                  }
                ]}
              >
                {isNearest && <View style={styles.nearestPulseRing} />}
              </TouchableOpacity>
            );
          })}

          {/* Agent core indicator (center) */}
          <View style={styles.agentPin}>
            <View style={styles.agentPinCore} />
          </View>
        </View>

        {/* Selected property bottom card sheet */}
        {selectedMapProperty ? (
          <View style={styles.mapSheetCard}>
            <View style={styles.mapSheetHeader}>
              <Text style={styles.mapSheetSerial}>Sr. {selectedMapProperty.serial_no}</Text>
              <TouchableOpacity onPress={() => setSelectedMapProperty(null)}>
                <Text style={{ color: '#8b9bb4', fontSize: 16, fontWeight: '700' }}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.mapSheetName}>{selectedMapProperty.consumer_name}</Text>
            <Text style={styles.mapSheetAddress} numberOfLines={1}>{selectedMapProperty.address}</Text>

            <View style={styles.mapSheetRow}>
              <Text style={styles.mapSheetDistance}>
                📍 {selectedMapProperty.distance_m ? `${selectedMapProperty.distance_m.toFixed(0)}m away` : 'No GPS coordinate'}
              </Text>
              <View style={[
                styles.itemBadge,
                selectedMapProperty.reading_status === 'reading_taken'
                  ? styles.badgeSuccess
                  : !selectedMapProperty.reading_status
                  ? styles.badgePending
                  : styles.badgeDanger
              ]}>
                <Text style={[
                  styles.itemBadgeText,
                  selectedMapProperty.reading_status === 'reading_taken'
                    ? styles.badgeTextSuccess
                    : !selectedMapProperty.reading_status
                    ? styles.badgeTextPending
                    : styles.badgeTextDanger
                ]}>
                  {selectedMapProperty.reading_status ? selectedMapProperty.reading_status.replace('_', ' ') : 'Pending'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.mapSheetButton}
              onPress={() => {
                setSelectedMapProperty(null);
                router.push(`/property/${selectedMapProperty.id}`);
              }}
            >
              <Text style={styles.mapSheetButtonText}>Start Inspection Form</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mapSheetHelper}>
            <Text style={styles.mapSheetHelperText}>Select any node dot on the scope radar screen to target the consumer assignment.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderDashboardTab = () => {
    const total = properties.length;
    const completed = properties.filter(p => p.reading_status === 'reading_taken').length;
    const remained = properties.filter(p => !p.reading_status).length;
    const progressPercent = total > 0 ? (completed / total) : 0;

    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        {/* Header bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Hello, {user?.name?.split(' ')[0] || 'Agent'}</Text>
            <Text style={styles.headerSubtitle}>Duty Tracking Console</Text>
          </View>
          <SyncIndicator />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Progress overview card */}
          <View style={[styles.progressCard, { marginHorizontal: 0, marginTop: 0 }]}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Overall Completion Progress</Text>
              <Text style={styles.progressValue}>{completed} of {total} done</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent * 100}%` }]} />
            </View>
            <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 8, textAlign: 'right' }}>
              {Math.round(progressPercent * 100)}% Completed today
            </Text>
          </View>

          {/* Metric cards grid */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
              📌 Duty Stats (Click card to filter list)
            </Text>

            {/* Metric Card 1: Today's Assignments */}
            <TouchableOpacity
              onPress={() => {
                setCurrentNavTab('assignments');
                setActiveTab('done');
              }}
              style={{
                backgroundColor: '#ecfdf5',
                borderColor: '#a7f3d0',
                borderWidth: 1,
                borderRadius: 14,
                padding: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              activeOpacity={0.8}
            >
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>Today's Done</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#065f46', marginTop: 4 }}>{completed}</Text>
              </View>
              <Ionicons name="checkmark-circle-outline" size={32} color="#065f46" />
            </TouchableOpacity>

            {/* Metric Card 2: Total Assignments */}
            <TouchableOpacity
              onPress={() => {
                setCurrentNavTab('assignments');
                setActiveTab('pending');
              }}
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                borderRadius: 14,
                padding: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              activeOpacity={0.8}
            >
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', textTransform: 'uppercase' }}>Total Assignments</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#111827', marginTop: 4 }}>{total}</Text>
              </View>
              <Ionicons name="documents-outline" size={32} color="#111827" />
            </TouchableOpacity>

            {/* Metric Card 3: Remained Assignments */}
            <TouchableOpacity
              onPress={() => {
                setCurrentNavTab('assignments');
                setActiveTab('pending');
              }}
              style={{
                backgroundColor: '#fef2f2',
                borderColor: '#fca5a5',
                borderWidth: 1,
                borderRadius: 14,
                padding: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              activeOpacity={0.8}
            >
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#991b1b', textTransform: 'uppercase' }}>Remained Assignment</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#991b1b', marginTop: 4 }}>{remained}</Text>
              </View>
              <Ionicons name="time-outline" size={32} color="#991b1b" />
            </TouchableOpacity>
          </View>
          
          {/* Quick Action Button */}
          <TouchableOpacity
            onPress={() => {
              setCurrentNavTab('assignments');
              setViewMode('map');
            }}
            style={{
              backgroundColor: '#111827',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              marginTop: 10
            }}
          >
            <Ionicons name="navigate-outline" size={18} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Open Scope Radar Scan</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderProfileTab = () => {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Operator Profile</Text>
            <Text style={styles.headerSubtitle}>Account & Settings</Text>
          </View>
        </View>

        {/* Profile Card */}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            borderRadius: 12,
            padding: 20,
            alignItems: 'center',
            gap: 12
          }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#f3f4f6',
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: '#e5e7eb',
              borderWidth: 1
            }}>
              <Ionicons name="person" size={32} color="#111827" />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>{user?.name || 'Field Operator'}</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{user?.phone}</Text>
            </View>
          </View>

          {/* Details list */}
          <View style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            gap: 12
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 10 }}>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>Status</Text>
              <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '600' }}>Active / Duty</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 10 }}>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>System Mode</Text>
              <Text style={{ color: '#111827', fontSize: 13 }}>Offline-First Sync</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>Total Sync Entries</Text>
              <Text style={{ color: '#111827', fontSize: 13 }}>{properties.length} Cache Nodes</Text>
            </View>
          </View>

          {/* Logout Action */}
          <TouchableOpacity 
            onPress={() => logout()} 
            style={{
              backgroundColor: '#fef2f2',
              borderColor: '#fca5a5',
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 20
            }}
          >
            <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 14 }}>Log Out of Session</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderAssignmentsTab = () => {
    const total = properties.length;
    const doneCount = properties.filter(p => p.reading_status === 'reading_taken').length;
    const problemCount = properties.filter(p => p.reading_status && p.reading_status !== 'reading_taken').length;
    const completed = doneCount + problemCount;
    const progressPercent = total > 0 ? completed / total : 0;

    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        {/* Header bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Task Assignments</Text>
            <Text style={styles.headerSubtitle}>{properties.length} entries allocated</Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Toggle View mode */}
            <TouchableOpacity
              onPress={() => setViewMode(v => v === 'list' ? 'map' : 'list')}
              style={styles.viewModeToggle}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={viewMode === 'list' ? 'navigate-circle' : 'list-circle'} size={18} color="#000" />
                <Text style={styles.viewModeToggleText}>
                  {viewMode === 'list' ? 'Radar Scope' : 'List View'}
                </Text>
              </View>
            </TouchableOpacity>
            <SyncIndicator />
          </View>
        </View>

        {/* Progress tracker widget */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Completion Progress</Text>
            <Text style={styles.progressValue}>{completed} of {total} readings done</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent * 100}%` }]} />
          </View>
        </View>

        {/* Zone / Area Selector Horizontal Pills */}
        <View style={styles.areaFilterContainer}>
          <Text style={styles.areaFilterLabel}>📁 ASSIGNED AREAS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaPillsContainer}>
            {['All', ...Array.from(new Set(properties.map(p => p.area_name).filter(Boolean)))].map((areaName) => {
              const isActive = selectedArea === areaName;
              const count = areaName === 'All' 
                ? properties.length 
                : properties.filter(p => p.area_name === areaName).length;
              
              return (
                <TouchableOpacity
                  key={areaName}
                  onPress={() => setSelectedArea(areaName)}
                  style={[styles.areaPill, isActive && styles.areaPillActive]}
                >
                  <Text style={[styles.areaPillText, isActive && styles.areaPillTextActive]}>
                    {areaName} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Society / Street Selector Horizontal Pills */}
        {selectedArea && selectedArea !== 'All' && availableSocieties.length > 1 && (
          <View style={[styles.areaFilterContainer, { marginTop: -4, marginBottom: 12 }]}>
            <Text style={styles.areaFilterLabel}>🏡 SOCIETIES / COLONIES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaPillsContainer}>
              {availableSocieties.map((socName) => {
                const isActive = selectedSociety === socName;
                const count = socName === 'All'
                  ? properties.filter(p => p.area_name === selectedArea).length
                  : properties.filter(p => p.area_name === selectedArea && p.society === socName).length;

                return (
                  <TouchableOpacity
                    key={socName}
                    onPress={() => setSelectedSociety(socName)}
                    style={[styles.areaPill, isActive && styles.areaPillActive]}
                  >
                    <Text style={[styles.areaPillText, isActive && styles.areaPillTextActive]}>
                      {socName} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Next Up (Nearest) Banner Widget */}
        {nearestProperty && (
          <TouchableOpacity
            style={styles.nearestBanner}
            onPress={() => router.push(`/property/${nearestProperty.id}`)}
            activeOpacity={0.9}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: 'rgba(250, 204, 21, 0.15)',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Ionicons name="navigate" size={18} color="#f5a623" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nearestHeader}>
                  <Text style={styles.nearestTitle}>NEXT UP (NEAREST ASSIGNMENT)</Text>
                  {nearestProperty.distance_m !== null && (
                    <Text style={styles.nearestDistance}>
                      {nearestProperty.distance_m.toFixed(0)}m away
                    </Text>
                  )}
                </View>
                <Text style={styles.nearestName} numberOfLines={1}>{nearestProperty.consumer_name}</Text>
                <Text style={styles.nearestAddress} numberOfLines={1}>{nearestProperty.address}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {viewMode === 'map' ? (
          renderRadarMap()
        ) : (
          <>
            {/* Search Input bar */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color="#8b9bb4" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by consumer name, serial, meter..."
                placeholderTextColor="#8b9bb4"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {/* Filter navigation tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'pending' && styles.tabButtonActive]}
                onPress={() => setActiveTab('pending')}
              >
                <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                  Pending ({properties.filter(p => !p.reading_status).length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'done' && styles.tabButtonActive]}
                onPress={() => setActiveTab('done')}
              >
                <Text style={[styles.tabText, activeTab === 'done' && styles.tabTextActive]}>
                  Done ({doneCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'problem' && styles.tabButtonActive]}
                onPress={() => setActiveTab('problem')}
              >
                <Text style={[styles.tabText, activeTab === 'problem' && styles.tabTextActive]}>
                  Problems ({problemCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* List content area */}
            {loading ? (
              <View style={styles.loadingContainer}><ActivityIndicator color="#10b981" size="large" /></View>
            ) : (
              <FlatList
                data={filteredProperties}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10b981" />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No properties matched search filters.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.itemCard}
                    onPress={() => router.push(`/property/${item.id}`)}
                  >
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemSerial}>Sr. {item.serial_no}</Text>
                      {item.reading_status ? (
                        <View style={[
                          styles.itemBadge, 
                          item.reading_status === 'reading_taken' ? styles.badgeSuccess : styles.badgeDanger
                        ]}>
                          <Text style={[
                            styles.itemBadgeText,
                            item.reading_status === 'reading_taken' ? styles.badgeTextSuccess : styles.badgeTextDanger
                          ]}>
                            {item.reading_status.replace('_', ' ')}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.itemBadge, styles.badgePending]}>
                          <Text style={[styles.itemBadgeText, styles.badgeTextPending]}>Pending</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.itemConsumer}>{item.consumer_name}</Text>
                    <Text style={styles.itemAddress}>{item.address}</Text>

                    {item.meter_no ? (
                      <Text style={styles.itemMeter}>Meter: {item.meter_no}</Text>
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}
      </View>
    );
  };

  const renderBottomTabBar = () => {
    return (
      <View style={styles.bottomTab}>
        <TouchableOpacity
          onPress={() => setCurrentNavTab('dashboard')}
          style={styles.bottomTabButton}
        >
          <Ionicons 
            name={currentNavTab === 'dashboard' ? 'home' : 'home-outline'} 
            size={20} 
            color={currentNavTab === 'dashboard' ? '#111827' : '#6b7280'} 
          />
          <Text style={[styles.bottomTabText, currentNavTab === 'dashboard' && styles.bottomTabTextActive]}>
            Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCurrentNavTab('assignments')}
          style={styles.bottomTabButton}
        >
          <Ionicons 
            name={currentNavTab === 'assignments' ? 'checkbox' : 'checkbox-outline'} 
            size={20} 
            color={currentNavTab === 'assignments' ? '#111827' : '#6b7280'} 
          />
          <Text style={[styles.bottomTabText, currentNavTab === 'assignments' && styles.bottomTabTextActive]}>
            Assignments
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCurrentNavTab('profile')}
          style={styles.bottomTabButton}
        >
          <Ionicons 
            name={currentNavTab === 'profile' ? 'person' : 'person-outline'} 
            size={20} 
            color={currentNavTab === 'profile' ? '#111827' : '#6b7280'} 
          />
          <Text style={[styles.bottomTabText, currentNavTab === 'profile' && styles.bottomTabTextActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1, marginBottom: 60 }}>
        {currentNavTab === 'dashboard' && renderDashboardTab()}
        {currentNavTab === 'assignments' && renderAssignmentsTab()}
        {currentNavTab === 'profile' && renderProfileTab()}
      </View>
      {renderBottomTabBar()}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  viewModeToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewModeToggleText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  progressValue: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#111827',
    borderRadius: 4,
  },
  nearestBanner: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
  },
  nearestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  nearestTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 0.5,
  },
  nearestDistance: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: '#111827',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  nearestName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  nearestAddress: {
    fontSize: 12,
    color: '#6b7280',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    paddingVertical: 12,
    fontSize: 14,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#111827',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemSerial: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeSuccess: { backgroundColor: '#ecfdf5' },
  badgeTextSuccess: { color: '#065f46', fontSize: 11, fontWeight: '700' },
  badgeDanger: { backgroundColor: '#fef2f2' },
  badgeTextDanger: { color: '#991b1b', fontSize: 11, fontWeight: '700' },
  badgePending: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  badgeTextPending: { color: '#6b7280', fontSize: 11, fontWeight: '700' },
  itemBadgeText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemConsumer: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  itemAddress: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  itemMeter: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
  },
  // ── Vector Radar Styles ──
  radarContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  radarHeader: {
    alignItems: 'center',
    marginVertical: 12,
  },
  radarTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.8,
  },
  radarSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  radarScope: {
    width: 270,
    height: 270,
    borderRadius: 135,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginVertical: 10,
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#e5e7eb30',
    borderStyle: 'dashed',
  },
  radarLine: {
    position: 'absolute',
    backgroundColor: '#e5e7eb30',
  },
  radarPin: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    zIndex: 10,
  },
  nearestPulseRing: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#111827',
    opacity: 0.6,
  },
  agentPin: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentPinCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111827',
  },
  mapSheetCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  mapSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mapSheetSerial: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  mapSheetName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  mapSheetAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  mapSheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapSheetDistance: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  mapSheetButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mapSheetButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  mapSheetHelper: {
    width: '100%',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    marginTop: 10,
  },
  mapSheetHelperText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  // ── Area Selector Pills ──
  areaFilterContainer: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  areaFilterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 1,
    marginBottom: 8,
  },
  areaPillsContainer: {
    gap: 8,
    paddingRight: 16,
  },
  areaPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  areaPillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  areaPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  areaPillTextActive: {
    color: '#ffffff',
  },
  bottomTab: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingVertical: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomTabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  bottomTabText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 4,
  },
  bottomTabTextActive: {
    color: '#111827',
  },
});

