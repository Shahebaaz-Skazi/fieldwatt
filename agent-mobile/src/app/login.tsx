import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../store/authStore';
import api from '../utils/api';
import { initDb, saveProperties, getStoredAgentId, setStoredAgentId, clearPropertiesCache } from '../db/sqlite';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  
  const login = useAuthStore(state => state.login);
  const useRouterInstance = useRouter();

  const handleLogin = async () => {
    if (!phone || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const data = await api.post('/auth/agent/login', { phone, password });
      
      // Save auth details in global store (memory)
      login(data.user, data.token);

      // Initialize local database
      await initDb();

      // ─── CRITICAL: Agent Identity Check ───────────────────────────────────
      // If a different agent logs in on this device, we MUST wipe the local
      // SQLite cache completely so they never see the previous agent's data.
      const storedAgentId = await getStoredAgentId();
      const incomingAgentId = data.user.id;

      if (storedAgentId && storedAgentId !== incomingAgentId) {
        console.log(`Agent switch detected: ${storedAgentId} → ${incomingAgentId}. Wiping local cache.`);
        await clearPropertiesCache();
      }

      // Always sync fresh assignments from server on login — never use stale cache
      // for a freshly authenticated session.
      const properties = await api.get(`/agent/assignments?_t=${Date.now()}`);
      await saveProperties(properties);

      // Stamp this agent's ID so the next login can detect a switch
      await setStoredAgentId(incomingAgentId);

      // Route to WorkList
      useRouterInstance.replace('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials and network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Glow Effects in Background */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          
          {/* Logo & Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Ionicons name="flash" size={32} color="#fff" />
            </View>
            <Text style={styles.eyebrow}>Field operations portal</Text>
            <Text style={styles.title}>
              Field<Text style={{ color: '#6b7280' }}>Watt</Text>
            </Text>
            <Text style={styles.subtitle}>Enter credentials to retrieve today's tasks</Text>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Agent Username</Text>
            <View style={[
              styles.inputContainer,
              phoneFocused && styles.inputContainerFocused
            ]}>
              <Ionicons name="person-outline" size={18} color={phoneFocused ? '#111827' : '#8b9bb4'} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Default Agent"
                placeholderTextColor="#94a3b8"
                autoFocus
                autoCapitalize="none"
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Agent Password</Text>
            <View style={[
              styles.inputContainer,
              passFocused && styles.inputContainerFocused
            ]}>
              <Ionicons name="lock-closed-outline" size={18} color={passFocused ? '#111827' : '#8b9bb4'} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPassFocused(true)}
                onBlur={() => setPassFocused(false)}
              />
            </View>
          </View>

          <TouchableOpacity 
            style={styles.button} 
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={styles.buttonInner}>
                <Text style={styles.buttonText}>Log In to Worklist</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            )}
          </TouchableOpacity>

          {/* Demo Info Box */}
          <View style={styles.demoBox}>
            <Ionicons name="information-circle-outline" size={14} color="#6b7280" style={{ marginRight: 4 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.demoTitle}>Demo Agent Access Details:</Text>
              <Text style={styles.demoText}>Username: <Text style={{ color: '#111827', fontWeight: 'bold' }}>Default Agent</Text></Text>
              <Text style={styles.demoText}>Password: <Text style={{ color: '#111827', fontWeight: 'bold' }}>password123</Text></Text>
            </View>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputContainerFocused: {
    borderColor: '#111827',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#111827',
    paddingVertical: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  demoBox: {
    marginTop: 20,
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
  },
  demoTitle: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  demoText: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 16,
  }
});
