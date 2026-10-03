import React, { useState, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ExpoSplashScreen from 'expo-splash-screen';
import SplashScreen from '../components/SplashScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Keep the native splash screen visible until we hide it
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  useEffect(() => {
    // Hide the native splash screen immediately when custom layout mounts
    ExpoSplashScreen.hideAsync().catch(() => {});
    
    // Register Service Worker for PWA on Web
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch(console.warn);
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {Platform.OS === 'web' && (
          <Head>
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
            <meta name="apple-mobile-web-app-title" content="FieldWatt" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="theme-color" content="#f5a623" />
            <link rel="manifest" href="/manifest.json" />
            <link rel="apple-touch-icon" href="/icons/icon-192.png" />
          </Head>
        )}
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
    </GestureHandlerRootView>
  );
}
