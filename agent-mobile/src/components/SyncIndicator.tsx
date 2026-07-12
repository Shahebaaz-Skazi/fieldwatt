import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getUnsyncedReadings } from '../db/sqlite';
import { syncOfflineReadings } from '../services/syncService';

export default function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const checkPending = async () => {
    try {
      const readings = await getUnsyncedReadings();
      setPendingCount(readings.length);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 5000); // Check local db state every 5s
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    if (syncing || pendingCount === 0) return;
    setSyncing(true);
    try {
      await syncOfflineReadings();
      await checkPending();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (pendingCount === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', marginRight: 6 }} />
        <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>Synced</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      onPress={handleSync} 
      style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#fef3c7', 
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fde68a'
      }}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#d97706" style={{ marginRight: 6 }} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706', marginRight: 6 }} />
      )}
      <Text style={{ fontSize: 12, color: '#d97706', fontWeight: '600' }}>
        {syncing ? 'Syncing...' : `${pendingCount} Queue`}
      </Text>
    </TouchableOpacity>
  );
}
