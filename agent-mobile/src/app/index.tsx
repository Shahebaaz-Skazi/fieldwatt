import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, RefreshControl, SafeAreaView, ActivityIndicator, Dimensions, ScrollView, Alert } from 'react-native';
import { useRouter, Redirect, useRootNavigationState, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../store/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDb, getCachedProperties, saveProperties, getStoredVersion, setStoredVersion, clearPropertiesCache, getDb, clearCachedPropertiesForSociety, clearReadingsQueue, getStoredAuth, clearStoredAuth } from '../db/sqlite';
import { syncOfflineReadings } from '../services/syncService';
import api from '../utils/api';
import SyncIndicator from '../components/SyncIndicator';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import { sharedData } from '../utils/sharedData';

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
  const rootNavigationState = useRootNavigationState();
  const [isMounted, setIsMounted] = useState(false);
  const insets = useSafeAreaInsets();
  const [initAuthDone, setInitAuthDone] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const initializeApp = async () => {
      try {
        await initDb();
        
        // Auto-invalidate cache if build version changed (for fast updates propagation)
        const storedVersion = await getStoredVersion();
        const currentVersion = '2026-07-17_v3';
        
        if (storedVersion !== currentVersion) {
          console.log(`App update detected: ${storedVersion} -> ${currentVersion}. Clearing old cache.`);
          await clearPropertiesCache();
          await initDb(); // Recreate fresh tables with latest schema
          await setStoredVersion(currentVersion);
        }

        // Try restoring local session from SQLite
        const localAuth = await getStoredAuth();
        if (localAuth && localAuth.user && localAuth.token) {
          console.log('Restoring persistent SQLite session for agent:', localAuth.user.name);
          useAuthStore.getState().login(localAuth.user, localAuth.token);
        }
      } catch (err) {
        console.error('Error during startup session restore:', err);
      } finally {
        setInitAuthDone(true);
      }
    };
    initializeApp();
  }, []);

  useEffect(() => {
    if (isMounted && initAuthDone && !token && rootNavigationState?.key) {
      router.replace('/login');
    }
  }, [token, isMounted, initAuthDone, rootNavigationState]);

  const [properties, setProperties] = useState<any[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Reload properties from SQLite every time this screen comes into focus
      // This picks up reading_status updates made from the property screen
      const reload = async () => {
        const cached = await getCachedProperties();
        if (cached && cached.length > 0) {
          setProperties(cached);
        }
      };
      reload();
    }, [])
  );
  
  // Navigation states
  const [currentNavTab, setCurrentNavTab] = useState<'assignments' | 'radar' | 'profile'>('assignments');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedSociety, setSelectedSociety] = useState<string>('All');

  // Expo OTA Updates states
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForUpdate = async (isManual = false) => {
    if (!Updates.isEnabled) {
      if (isManual) {
        Alert.alert('Not Supported', 'Updates are disabled in this environment (Development or Web).');
      }
      return;
    }
    try {
      setCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateAvailable(true);
        if (isManual) {
          Alert.alert('Update Available', 'A new update is available. Tap "Download & Install Update" to apply it.');
        }
      } else {
        if (isManual) {
          Alert.alert('You are up to date', 'No new updates available.');
        }
      }
    } catch (e: any) {
      console.warn('Update check failed:', e);
      if (isManual) {
        Alert.alert('Check failed', `Could not check for updates. ${e.message || 'Make sure you have internet.'}`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const applyUpdate = async () => {
    if (!Updates.isEnabled) return;
    try {
      setUpdateLoading(true);
      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Update Ready',
        'The update has been downloaded. The app will now restart.',
        [{ text: 'Restart Now', onPress: () => Updates.reloadAsync() }]
      );
    } catch (e) {
      Alert.alert('Update failed', 'Could not download the update. Try again.');
      setUpdateLoading(false);
    }
  };

  useEffect(() => {
    if (!__DEV__ && Updates.isEnabled) {
      checkForUpdate().catch(() => {});
    }
  }, []);

  // Auto-show update popup when update is detected
  useEffect(() => {
    if (updateAvailable) {
      Alert.alert(
        '🚀 New Update Available',
        'A new version of FieldWatt is ready. Download and install now to get the latest features and fixes.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Update Now',
            onPress: applyUpdate,
          },
        ],
        { cancelable: false }
      );
    }
  }, [updateAvailable]);
  const [search, setSearch] = useState('');
  // ponytail: only pending tab is needed
  const [activeTab] = useState<'pending'>('pending');

  // GPS Location states
  const [agentLocation, setAgentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestProperty, setNearestProperty] = useState<any | null>(null);
  const [selectedMapProperty, setSelectedMapProperty] = useState<any | null>(null);

  // Drilldown hierarchy states
  // drillSubSociety:
  //   null        = not yet at this level
  //   '__SKIP__'  = level auto-skipped (society has no Street 3)
  //   'string'    = user selected this sub-society
  // drillWingAutoSkipped: true when wing level was also auto-skipped
  // ─────────────────────────────────────────────
  const [drillLevel, setDrillLevel] = useState<'areas' | 'societies' | 'sub_societies' | 'wings' | 'flats'>('areas');
  const [drillArea, setDrillArea] = useState<string | null>(null);
  const [drillSociety, setDrillSociety] = useState<string | null>(null);
  const [drillSubSociety, setDrillSubSociety] = useState<string | null>(null);
  const [drillWing, setDrillWing] = useState<string | null>(null);
  const [drillWingAutoSkipped, setDrillWingAutoSkipped] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');

  // Sentinel: sub-society level was auto-skipped (property has no Street 3)
  const SUB_SOC_SKIP = '__SKIP__';

  // Returns only real (non-empty) Street 3 values for a society
  const getSubSocietiesForSociety = (areaName: string, societyName: string, dataSrc: any[] = properties): string[] => {
    const unique = new Set<string>();
    dataSrc.forEach(p => {
      if ((p.area_name || 'No Area').trim() !== areaName) return;
      if ((p.society || 'No Society').trim() !== societyName) return;
      const subSoc = (p.sub_society || '').trim();
      if (subSoc) unique.add(subSoc);
    });
    return Array.from(unique);
  };

  // Returns wing names for a given path.
  // subSocFilter: SUB_SOC_SKIP → match properties with NO sub_society; string → match that sub_society
  const getWingsForPath = (areaName: string, societyName: string, subSocFilter: string, dataSrc: any[] = properties): string[] => {
    const unique = new Set<string>();
    let matchCount = 0;
    let sampleProp: any = null;
    
    dataSrc.forEach(p => {
      const pArea = (p.area_name || 'No Area').trim();
      const pSoc = (p.society || 'No Society').trim();
      if (pArea !== areaName) return;
      if (pSoc !== societyName) return;
      
      matchCount++;
      if (!sampleProp) {
        sampleProp = {
          id: p.id,
          building_code: p.building_code,
          sub_society: p.sub_society,
          address: p.address
        };
      }
      
      if (subSocFilter === SUB_SOC_SKIP) {
        if ((p.sub_society || '').trim()) return; // skip those WITH sub_society
      } else {
        if ((p.sub_society || '').trim() !== subSocFilter) return;
      }
      unique.add(getWingName(p));
    });
    
    console.log('getWingsForPath stats:', {
      areaName,
      societyName,
      subSocFilter,
      matchCount,
      sampleProp,
      computedWings: Array.from(unique)
    });
    
    return Array.from(unique);
  };

  // Decide whether to go to wings screen or skip straight to flats
  const goToWingsOrFlats = (areaName: string, societyName: string, subSocFilter: string, dataSrc: any[] = properties) => {
    const wings = getWingsForPath(areaName, societyName, subSocFilter, dataSrc);
    console.log('goToWingsOrFlats decision:', {
      wings,
      shouldSkip: (wings.length === 0 || (wings.length === 1 && wings[0] === 'General'))
    });
    if (wings.length === 0 || (wings.length === 1 && wings[0] === 'General')) {
      // All flats in this path have no building code — skip wing level
      setDrillWing('General');
      setDrillWingAutoSkipped(true);
      setDrillLevel('flats');
    } else {
      setDrillWingAutoSkipped(false);
      setDrillLevel('wings');
    }
  };



  const handleAreaPress = useCallback((areaName: string) => {
    setDrillArea(areaName);
    setDrillLevel('societies');
  }, []);

  const renderAreaCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => handleAreaPress(item.name)}
      style={styles.drillCard}
    >
      <View style={styles.drillCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.drillIconWrapper}>
            <Ionicons name="folder-open" size={20} color="#10b981" />
          </View>
          <View>
            <Text style={styles.drillCardName}>{item.name}</Text>
            <Text style={styles.drillCardMeta}>{item.pending} pending of {item.total} flats</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  ), [handleAreaPress]);

  const handleSocietyPress = useCallback((societyName: string) => {
    setDrillSociety(societyName);
    // Navigate instantly from cache — pure in-memory, zero async, zero network
    const subSocs = getSubSocietiesForSociety(drillArea!, societyName, properties);
    if (subSocs.length > 0) {
      setDrillSubSociety(null);
      setDrillLevel('sub_societies');
    } else {
      setDrillSubSociety(SUB_SOC_SKIP);
      goToWingsOrFlats(drillArea!, societyName, SUB_SOC_SKIP, properties);
    }
    // NO background refresh here — data is already in SQLite from login sync
  }, [drillArea, properties]);

  const renderSocietyCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => handleSocietyPress(item.name)}
      style={styles.drillCard}
    >
      <View style={styles.drillCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.drillIconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
            <Ionicons name="business" size={20} color="#3b82f6" />
          </View>
          <View>
            <Text style={styles.drillCardName}>{item.name}</Text>
            <Text style={styles.drillCardMeta}>{item.pending} pending of {item.total} flats</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  ), [handleSocietyPress]);

  const handleSubSocietyPress = useCallback((subSocName: string) => {
    const filterVal = subSocName === 'No Sub-Society' ? SUB_SOC_SKIP : subSocName;
    setDrillSubSociety(filterVal);
    goToWingsOrFlats(drillArea!, drillSociety!, filterVal);
  }, [drillArea, drillSociety]);

  const renderSubSocietyCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => handleSubSocietyPress(item.name)}
      style={styles.drillCard}
    >
      <View style={styles.drillCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.drillIconWrapper, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
            <Ionicons name="git-branch" size={20} color="#6366f1" />
          </View>
          <View>
            <Text style={styles.drillCardName}>{item.name}</Text>
            <Text style={styles.drillCardMeta}>{item.pending} pending of {item.total} flats</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  ), [handleSubSocietyPress]);

  const handleWingPress = useCallback((wingName: string) => {
    setDrillWing(wingName);
    setDrillWingAutoSkipped(false);
    setDrillLevel('flats');
  }, []);

  const renderWingCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => handleWingPress(item.name)}
      style={styles.drillCard}
    >
      <View style={styles.drillCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.drillIconWrapper, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
            <Ionicons name="grid" size={20} color="#f59e0b" />
          </View>
          <View>
            <Text style={styles.drillCardName}>{item.name}</Text>
            <Text style={styles.drillCardMeta}>{item.pending} pending of {item.total} flats</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  ), [handleWingPress]);

  const handleFlatPress = useCallback((flatId: string, item: any) => {
    sharedData.activeProperty = item;
    router.push(`/property/${flatId}` as any);
  }, [router]);

  const renderFlatCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => handleFlatPress(item.id, item)}
      style={styles.itemCard}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemSerial}>BP: {item.bp_no || item.serial_no}</Text>
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
      <Text style={styles.itemAddress} numberOfLines={2}>{item.address}</Text>
      {item.meter_no ? (
        <Text style={styles.itemMeter}>Meter: {item.meter_no}</Text>
      ) : null}
    </TouchableOpacity>
  ), [handleFlatPress]);

  const renderPropertyCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.itemCard}
      onPress={() => {
        sharedData.activeProperty = item;
        router.push(`/property/${item.id}` as any);
      }}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemSerial}>BP: {item.bp_no || item.serial_no}</Text>
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
      <Text style={styles.itemAddress} numberOfLines={2}>{item.address}</Text>
      {item.meter_no ? (
        <Text style={styles.itemMeter}>Meter: {item.meter_no}</Text>
      ) : null}
    </TouchableOpacity>
  ), [router]);

  // Helper: return display wing name from building_code
  const getWingName = (p: any): string => {
    const code = (p.building_code || '').trim();
    if (!code) return 'General';
    if (/wing/i.test(code)) return code.replace(/\s+/g, ' ').toUpperCase();
    return `Wing ${code.toUpperCase()}`;
  };

  // LEVEL 1 — unique MRU areas
  const drillAreasList = React.useMemo(() => {
    const counts: Record<string, { total: number; pending: number }> = {};
    properties.forEach(p => {
      const area = (p.area_name || 'No Area').trim();
      if (!counts[area]) counts[area] = { total: 0, pending: 0 };
      counts[area].total++;
      if (!p.reading_status) counts[area].pending++;
    });
    return Object.keys(counts).sort().map(k => ({ name: k, ...counts[k] }));
  }, [properties]);

  // LEVEL 2 — unique societies (Street) for the selected area
  const drillSocietiesList = React.useMemo(() => {
    if (!drillArea) return [];
    const counts: Record<string, { total: number; pending: number }> = {};
    properties.forEach(p => {
      if ((p.area_name || 'No Area').trim() !== drillArea) return;
      const soc = (p.society || 'No Society').trim();
      if (!counts[soc]) counts[soc] = { total: 0, pending: 0 };
      counts[soc].total++;
      if (!p.reading_status) counts[soc].pending++;
    });
    return Object.keys(counts).sort().map(k => ({ name: k, ...counts[k] }));
  }, [properties, drillArea]);

  // LEVEL 3 — unique sub-societies (Street 3)
  const drillSubSocietiesList = React.useMemo(() => {
    if (!drillArea || !drillSociety) return [];
    const counts: Record<string, { total: number; pending: number }> = {};
    let emptySubSocCount = 0;
    let emptySubSocPending = 0;
    let hasEmptySubSoc = false;

    properties.forEach(p => {
      if ((p.area_name || 'No Area').trim() !== drillArea) return;
      if ((p.society || 'No Society').trim() !== drillSociety) return;
      const subSoc = (p.sub_society || '').trim();
      if (!subSoc) {
        hasEmptySubSoc = true;
        emptySubSocCount++;
        if (!p.reading_status) emptySubSocPending++;
        return;
      }
      if (!counts[subSoc]) counts[subSoc] = { total: 0, pending: 0 };
      counts[subSoc].total++;
      if (!p.reading_status) counts[subSoc].pending++;
    });

    const list = Object.keys(counts).sort().map(k => ({ name: k, ...counts[k] }));
    if (hasEmptySubSoc) {
      list.push({
        name: 'No Sub-Society',
        total: emptySubSocCount,
        pending: emptySubSocPending
      });
    }
    return list;
  }, [properties, drillArea, drillSociety]);

  // LEVEL 4 — unique wings (Building code) for the current path
  // Sub-society filter:
  //   SUB_SOC_SKIP → match properties that have NO sub_society (Street 3 was null)
  //   'string'     → match that specific sub_society
  const drillWingsList = React.useMemo(() => {
    if (!drillArea || !drillSociety || drillSubSociety === null) return [];
    const counts: Record<string, { total: number; pending: number }> = {};
    properties.forEach(p => {
      if ((p.area_name || 'No Area').trim() !== drillArea) return;
      if ((p.society || 'No Society').trim() !== drillSociety) return;
      if (drillSubSociety === SUB_SOC_SKIP) {
        if ((p.sub_society || '').trim()) return; // skip those WITH sub_society
      } else {
        if ((p.sub_society || '').trim() !== drillSubSociety) return;
      }
      const wing = getWingName(p);
      if (!counts[wing]) counts[wing] = { total: 0, pending: 0 };
      counts[wing].total++;
      if (!p.reading_status) counts[wing].pending++;
    });
    return Object.keys(counts).sort().map(k => ({ name: k, ...counts[k] }));
  }, [properties, drillArea, drillSociety, drillSubSociety]);

  // LEVEL 5 — flats for the fully-resolved path
  const drillFlatsList = React.useMemo(() => {
    if (!drillArea || !drillSociety || drillSubSociety === null || !drillWing) return [];
    let list = properties.filter(p => {
      if ((p.area_name || 'No Area').trim() !== drillArea) return false;
      if ((p.society || 'No Society').trim() !== drillSociety) return false;
      if (drillSubSociety === SUB_SOC_SKIP) {
        if ((p.sub_society || '').trim()) return false;
      } else {
        if ((p.sub_society || '').trim() !== drillSubSociety) return false;
      }
      // ponytail: hide completed properties from flat drilldown
      if (p.reading_status) return false;
      return getWingName(p) === drillWing;
    });
    if (drillSearch) {
      const q = drillSearch.toLowerCase();
      list = list.filter(p =>
        p.consumer_name.toLowerCase().includes(q) ||
        p.serial_no.includes(q) ||
        (p.bp_no && p.bp_no.includes(q)) ||
        (p.meter_no && p.meter_no.toLowerCase().includes(q))
      );
    }
    return list;
  }, [properties, drillArea, drillSociety, drillSubSociety, drillWing, drillSearch]);

  // Compute unique societies for selected area (old filters)
  const availableSocieties = React.useMemo(() => {
    if (!selectedArea || selectedArea === 'All') return [];
    const filteredByArea = properties.filter(item => item.area_name === selectedArea);
    const uniqueSoc = new Set<string>();
    filteredByArea.forEach(item => {
      if (item.society) uniqueSoc.add(item.society);
    });
    return ['All', ...Array.from(uniqueSoc).sort()];
  }, [properties, selectedArea]);

  // Reset society filter when area changes (old filters)
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

  // Background auto-sync (push readings) & auto-pull (refresh assignments)
  useEffect(() => {
    if (!token) return;

    // 1. Auto-push: upload any unsynced offline readings (runs every 10 seconds)
    const pushInterval = setInterval(async () => {
      try {
        const syncRes = await syncOfflineReadings();
        if (syncRes.success && syncRes.count > 0) {
          console.log(`Auto-sync (push): Synced ${syncRes.count} pending readings.`);
          // Reload sqlite cache to reflect completion badges
          const cached = await getCachedProperties();
          setProperties(cached);
        }
      } catch (err) {
        console.warn('Auto-push background task error:', err);
      }
    }, 10000);

    return () => {
      clearInterval(pushInterval);
    };
  }, [token]);

  // Fires at most once per app session — prevents repeated re-renders on navigation
  const hasRefreshedThisSession = useRef(false);

  const loadCachedData = async () => {
    try {
      const cached = (await getCachedProperties()) as any[];
      console.log(`loadCachedData: Loaded ${cached.length} properties from SQLite.`);
      setProperties(cached);
      applyFilters(cached, search, activeTab, selectedArea, selectedSociety);
      triggerSilentRefresh();
    } catch (e) {
      console.error('Error loading SQLite properties cache:', e);
    } finally {
      setLoading(false);
    }
  };

  const triggerSilentRefresh = async () => {
    if (hasRefreshedThisSession.current) return; // only once per session
    hasRefreshedThisSession.current = true;
    try {
      const freshAssignments = await api.get(`/agent/assignments?_t=${Date.now()}`);
      console.log(`triggerSilentRefresh: Fetched ${freshAssignments.length} fresh assignments from API.`);
      if (freshAssignments.length > 0) {
        console.log('triggerSilentRefresh: raw first API assignment:', JSON.stringify(freshAssignments[0]));
      }
      await saveProperties(freshAssignments, true);
      const cached = await getCachedProperties();
      setProperties(cached);
      applyFilters(cached, search, activeTab, selectedArea, selectedSociety);
    } catch (err) {
      console.warn('Silent startup sync failed:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const freshAssignments = await api.get(`/agent/assignments?_t=${Date.now()}`);
      await saveProperties(freshAssignments, true);
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
        (item.bp_no && item.bp_no.includes(q)) ||
        (item.meter_no && item.meter_no.toLowerCase().includes(q)) ||
        (item.address && item.address.toLowerCase().includes(q))
      );
    }

    // ponytail: always show only pending — completed properties hidden from agent view
    result = result.filter(item => !item.reading_status);

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
        setNearestProperty({
          ...pending[0],
          distance_m: null
        });
      }
    } else {
      setNearestProperty({
        ...pending[0],
        distance_m: null
      });
    }
  }, [properties, agentLocation]);

  if (!isMounted || !rootNavigationState?.key || !initAuthDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0d12', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  // ─────────────────────────────────────────────
  // Vector Radar Mapping Engine
  // ─────────────────────────────────────────────
  const renderRadarMap = () => {
    let centerLat = agentLocation?.lat;
    let centerLng = agentLocation?.lng;

    if (!centerLat || !centerLng) {
      const withCoords = properties.filter(p => p.lat && p.lng);
      if (withCoords.length > 0) {
        centerLat = withCoords.reduce((acc, p) => acc + p.lat, 0) / withCoords.length;
        centerLng = withCoords.reduce((acc, p) => acc + p.lng, 0) / withCoords.length;
      } else {
        centerLat = 40.7831;
        centerLng = -73.9712;
      }
    }

    const RADAR_RADIUS = 135;
    const MAX_METRES = 600;

    const mappedPins = properties.map(p => {
      if (!p.lat || !p.lng) return null;
      
      const distY = haversineDistance(centerLat!, centerLng!, p.lat, centerLng!);
      const distX = haversineDistance(centerLat!, centerLng!, centerLat!, p.lng);

      const signY = p.lat >= centerLat! ? 1 : -1;
      const signX = p.lng >= centerLng! ? 1 : -1;

      const deltaX = distX * signX;
      const deltaY = distY * signY;

      const projX = (deltaX / MAX_METRES) * RADAR_RADIUS;
      const projY = (deltaY / MAX_METRES) * RADAR_RADIUS;

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

        <View style={styles.radarScope}>
          <View style={[styles.radarRing, { width: 90, height: 90, borderRadius: 45 }]} />
          <View style={[styles.radarRing, { width: 180, height: 180, borderRadius: 90 }]} />
          <View style={[styles.radarRing, { width: 270, height: 270, borderRadius: 135 }]} />

          <View style={[styles.radarLine, { width: 270, height: 1 }]} />
          <View style={[styles.radarLine, { width: 1, height: 270 }]} />

          {mappedPins.map((pin: any) => {
            const distFromCenter = Math.sqrt(pin.x * pin.x + pin.y * pin.y);
            if (distFromCenter > RADAR_RADIUS) return null;

            const isNearest = nearestProperty && nearestProperty.id === pin.id;
            const isSelected = selectedMapProperty && selectedMapProperty.id === pin.id;

            let pinColor = '#374151';
            if (pin.reading_status === 'reading_taken') {
              pinColor = '#10b981';
            } else if (pin.reading_status && pin.reading_status !== 'reading_taken') {
              pinColor = '#f59e0b';
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

          <View style={styles.agentPin}>
            <View style={styles.agentPinCore} />
          </View>
        </View>

        {selectedMapProperty ? (
          <View style={styles.mapSheetCard}>
            <View style={styles.mapSheetHeader}>
              <Text style={styles.mapSheetSerial}>BP: {selectedMapProperty.bp_no || selectedMapProperty.serial_no}</Text>
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
                sharedData.activeProperty = selectedMapProperty;
                router.push(`/property/${selectedMapProperty.id}` as any);
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

  // ── Tab 1: Hierarchical Worklist Tab ──
  const renderWorklistTab = () => {

    // ── Back navigation ──
    const handleGoBack = () => {
      if (drillLevel === 'flats') {
        if (drillWingAutoSkipped) {
          // Wing level was auto-skipped — jump back past it
          setDrillWing(null);
          setDrillWingAutoSkipped(false);
          if (drillSubSociety !== null && drillSubSociety !== SUB_SOC_SKIP) {
            // Came through a real sub-society → go back to sub_societies list
            setDrillLevel('sub_societies');
            setDrillSubSociety(null);
          } else {
            // Sub-society was also skipped → go back to societies
            setDrillLevel('societies');
            setDrillSociety(null);
            setDrillSubSociety(null);
          }
        } else {
          // Wing was user-selected → go back to wings list
          setDrillLevel('wings');
          setDrillWing(null);
        }
      } else if (drillLevel === 'wings') {
        setDrillWing(null);
        if (drillSubSociety !== null && drillSubSociety !== SUB_SOC_SKIP) {
          // Came from a real sub-society → go back to sub_societies list
          setDrillLevel('sub_societies');
          setDrillSubSociety(null);
        } else {
          // Sub-society was skipped → go back to societies
          setDrillLevel('societies');
          setDrillSociety(null);
          setDrillSubSociety(null);
        }
      } else if (drillLevel === 'sub_societies') {
        setDrillLevel('societies');
        setDrillSociety(null);
        setDrillSubSociety(null);
      } else if (drillLevel === 'societies') {
        setDrillLevel('areas');
        setDrillArea(null);
      }
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        {/* Header bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Task Assignments</Text>
            <Text style={styles.headerSubtitle}>Drilldown list · Offline cache</Text>
          </View>
          <SyncIndicator />
        </View>

        {/* Path Navigator / Breadcrumbs */}
        {drillLevel !== 'areas' && (
          <View style={styles.pathNavigator}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={15} color="#111827" />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pathBreadcrumbs}>
              <Text style={styles.breadcrumbItem}>{drillArea}</Text>
              {drillSociety && (
                <>
                  <Ionicons name="chevron-forward" size={12} color="#94a3b8" style={{ marginHorizontal: 2 }} />
                  <Text style={styles.breadcrumbItem}>{drillSociety}</Text>
                </>
              )}
              {drillSubSociety && drillSubSociety !== SUB_SOC_SKIP && (
                <>
                  <Ionicons name="chevron-forward" size={12} color="#94a3b8" style={{ marginHorizontal: 2 }} />
                  <Text style={styles.breadcrumbItem}>{drillSubSociety}</Text>
                </>
              )}
              {drillWing && drillWing !== 'General' && (
                <>
                  <Ionicons name="chevron-forward" size={12} color="#94a3b8" style={{ marginHorizontal: 2 }} />
                  <Text style={styles.breadcrumbItem}>{drillWing}</Text>
                </>
              )}
            </ScrollView>
          </View>
        )}

        {/* Content list */}
        {loading ? (
          <View style={styles.loadingContainer}><ActivityIndicator color="#10b981" size="large" /></View>
        ) : (
          <View style={{ flex: 1 }}>

            <>
                {/* LEVEL 1 — Areas */}
                {drillLevel === 'areas' && (
                  <FlatList
                    data={drillAreasList}
                    keyExtractor={(item) => item.name}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                    initialNumToRender={10}
                    refreshControl={
                      <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10b981" />
                    }
                    ListHeaderComponent={
                      <Text style={styles.drillSectionTitle}>Select Area ({drillAreasList.length})</Text>
                    }
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No assigned areas found.</Text>
                      </View>
                    }
                    renderItem={renderAreaCard}
                  />
                )}

                {/* LEVEL 2 — Societies (Street) */}
                {drillLevel === 'societies' && (
                  <FlatList
                    data={drillSocietiesList}
                    keyExtractor={(item) => item.name}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                    initialNumToRender={10}
                    ListHeaderComponent={
                      <Text style={styles.drillSectionTitle}>Select Society ({drillSocietiesList.length})</Text>
                    }
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No societies found in this area.</Text>
                      </View>
                    }
                    renderItem={renderSocietyCard}
                  />
                )}

                {/* LEVEL 3 — Sub-Societies (Street 3) */}
                {drillLevel === 'sub_societies' && (
                  <FlatList
                    data={drillSubSocietiesList}
                    keyExtractor={(item) => item.name}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                    initialNumToRender={10}
                    ListHeaderComponent={
                      <Text style={styles.drillSectionTitle}>Select Sub-Society ({drillSubSocietiesList.length})</Text>
                    }
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No sub-societies found.</Text>
                      </View>
                    }
                    renderItem={renderSubSocietyCard}
                  />
                )}

                {/* LEVEL 4 — Wings */}
                {drillLevel === 'wings' && (
                  <FlatList
                    data={drillWingsList}
                    keyExtractor={(item) => item.name}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                    initialNumToRender={10}
                    ListHeaderComponent={
                      <Text style={styles.drillSectionTitle}>Select Wing / Building ({drillWingsList.length})</Text>
                    }
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No wings found in this society.</Text>
                      </View>
                    }
                    renderItem={renderWingCard}
                  />
                )}

                {/* LEVEL 5 — Flats */}
                {drillLevel === 'flats' && (
                  <>
                    <View style={[styles.searchBar, { marginTop: 12 }]}>
                      <Ionicons name="search" size={16} color="#8b9bb4" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search flats by name or BP no..."
                        placeholderTextColor="#8b9bb4"
                        value={drillSearch}
                        onChangeText={setDrillSearch}
                      />
                    </View>

                    <FlatList
                      data={drillFlatsList}
                      keyExtractor={(item) => item.id}
                      removeClippedSubviews={true}
                      maxToRenderPerBatch={15}
                      windowSize={5}
                      initialNumToRender={10}
                      refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10b981" />
                      }
                      ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                          <Text style={styles.emptyText}>No properties matched search query.</Text>
                        </View>
                      }
                      renderItem={renderFlatCard}
                    />
                  </>
                )}
              </>
          </View>
        )}
      </View>
    );
  };

  // ── Tab 2: GPS Scope Radar Tab ──
  const renderRadarScopeTab = () => {
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
            <Text style={styles.headerTitle}>Radar Scope View</Text>
            <Text style={styles.headerSubtitle}>{properties.length} entries allocated</Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
          <Text style={styles.areaFilterLabel}>📁 FILTER BY AREA</Text>
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
            <Text style={styles.areaFilterLabel}>🏡 FILTER BY SOCIETY</Text>
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
            onPress={() => {
              sharedData.activeProperty = nearestProperty;
              router.push(`/property/${nearestProperty.id}` as any);
            }}
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
                placeholder="Search by consumer name, BP no, meter..."
                placeholderTextColor="#8b9bb4"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {/* Filter navigation tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity 
                style={[styles.tabButton, styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>
                  Pending ({properties.filter(p => !p.reading_status).length})
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
                removeClippedSubviews={true}
                maxToRenderPerBatch={15}
                windowSize={5}
                initialNumToRender={10}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10b981" />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No properties matched search filters.</Text>
                  </View>
                }
                renderItem={renderPropertyCard}
              />
            )}
          </>
        )}
      </View>
    );
  };

  // ── Tab 3: Operator Profile Settings ──
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

          {/* App Version & Update Section */}
          <View style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            marginTop: 4,
            gap: 12
          }}>
            <View>
              <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                APP RUNTIME VERSION
              </Text>
              <Text style={{ color: '#111827', fontSize: 14, fontWeight: '700', marginTop: 4 }}>
                {Updates.runtimeVersion || 'Development Build'}
              </Text>
            </View>

            {updateAvailable ? (
              <TouchableOpacity
                onPress={applyUpdate}
                disabled={updateLoading}
                style={{
                  backgroundColor: '#d97706',
                  borderRadius: 8,
                  padding: 12,
                  alignItems: 'center',
                }}
              >
                {updateLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    Download & Install Update
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => checkForUpdate(true)}
                disabled={checkingUpdate}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 8,
                  padding: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#10b981',
                }}
              >
                {checkingUpdate ? (
                  <ActivityIndicator color="#10b981" />
                ) : (
                  <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 13 }}>
                    Check for Updates
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Clear stuck queue Action */}
          <TouchableOpacity 
            onPress={async () => {
              try {
                await clearReadingsQueue();
                if (typeof window !== 'undefined' && window.alert) {
                  window.alert('The local readings queue has been wiped successfully. You can now re-submit readings.');
                } else {
                  Alert.alert('Queue Cleared', 'The local readings queue has been wiped successfully. You can now re-submit readings.');
                }
              } catch (err: any) {
                if (typeof window !== 'undefined' && window.alert) {
                  window.alert(err.message || 'Failed to wipe queue.');
                } else {
                  Alert.alert('Wipe Failed', err.message || 'Failed to wipe queue.');
                }
              }
            }} 
            style={{
              backgroundColor: '#fffbeb',
              borderColor: '#fcd34d',
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 12
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#d97706" />
              <Text style={{ color: '#d97706', fontWeight: '700', fontSize: 14 }}>Clear Stuck Queue</Text>
            </View>
          </TouchableOpacity>

          {/* Logout Action */}
          <TouchableOpacity 
            onPress={async () => {
              try {
                await clearStoredAuth();
              } catch (e) {
                console.error(e);
              }
              logout();
            }} 
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

  const renderBottomTabBar = () => {
    return (
      <View style={[styles.bottomTab, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
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
            Worklist
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCurrentNavTab('radar')}
          style={styles.bottomTabButton}
        >
          <Ionicons 
            name={currentNavTab === 'radar' ? 'navigate' : 'navigate-outline'} 
            size={20} 
            color={currentNavTab === 'radar' ? '#111827' : '#6b7280'} 
          />
          <Text style={[styles.bottomTabText, currentNavTab === 'radar' && styles.bottomTabTextActive]}>
            Radar Scope
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
      <View style={{ flex: 1, marginBottom: 60 + (insets.bottom > 0 ? insets.bottom - 12 : 0) }}>
        {currentNavTab === 'assignments' && renderWorklistTab()}
        {currentNavTab === 'radar' && renderRadarScopeTab()}
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
    paddingTop: 10,
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
  // ── Hierarchical Path Navigation Styles ──
  pathNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  pathBreadcrumbs: {
    alignItems: 'center',
    gap: 6,
    flexDirection: 'row',
  },
  breadcrumbItem: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  drillSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  drillCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
  },
  drillCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drillIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  drillCardMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
