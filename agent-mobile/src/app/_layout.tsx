import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ExpoSplashScreen from 'expo-splash-screen';
import SplashScreen from '../components/SplashScreen';

// Keep the native splash screen visible until we hide it
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  useEffect(() => {
    // Hide the native splash screen immediately when custom layout mounts
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: '#080b12' }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#080b12' }
          }}
        >
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="property/[id]" options={{ headerShown: false }} />
        </Stack>

        {showCustomSplash && (
          <SplashScreen onAnimationEnd={() => setShowCustomSplash(false)} />
        )}
      </View>
    </SafeAreaProvider>
  );
}
