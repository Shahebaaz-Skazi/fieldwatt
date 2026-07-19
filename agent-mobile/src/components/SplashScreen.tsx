import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, Animated, Easing } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onAnimationEnd?: () => void;
}

export default function SplashScreen({ onAnimationEnd }: SplashScreenProps) {
  const [dotCount, setDotCount] = useState(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.95)).current;

  // Dot animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 450);
    return () => clearInterval(interval);
  }, []);

  // Center logo pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.97,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Fade out screen when finished
  const triggerFadeOut = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      if (onAnimationEnd) {
        onAnimationEnd();
      }
    });
  };

  // Expose control to layout
  useEffect(() => {
    // If not controlled externally, auto-dismiss after 3.0s for safety/testing
    const timer = setTimeout(() => {
      triggerFadeOut();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Generate grid positions
  const gridSpacing = 40;
  const numVLines = Math.ceil(width / gridSpacing);
  const numHLines = Math.ceil(height / gridSpacing);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* 1. Background grid lines */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: numVLines }).map((_, i) => (
          <View
            key={`v-${i}`}
            style={[
              styles.gridLineV,
              { left: i * gridSpacing }
            ]}
          />
        ))}
        {Array.from({ length: numHLines }).map((_, i) => (
          <View
            key={`h-${i}`}
            style={[
              styles.gridLineH,
              { top: i * gridSpacing }
            ]}
          />
        ))}
      </View>

      {/* 2. Faint diagonal energy lines (top-right and bottom-left) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Top-Right Energy Lines */}
        <View style={[styles.energyLine, { top: -100, right: -150, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { top: -50, right: -120, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { top: 0, right: -90, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { top: 50, right: -60, transform: [{ rotate: '-35deg' }] }]} />
        
        {/* Bottom-Left Energy Lines */}
        <View style={[styles.energyLine, { bottom: -100, left: -150, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { bottom: -50, left: -120, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { bottom: 0, left: -90, transform: [{ rotate: '-35deg' }] }]} />
        <View style={[styles.energyLine, { bottom: 50, left: -60, transform: [{ rotate: '-35deg' }] }]} />
      </View>

      {/* 3. Center Section: Concentric Rings & Hexagon/Logo */}
      <View style={styles.centerContainer}>
        {/* Concentric rings */}
        <View style={[styles.ring, { width: 280, height: 280, borderRadius: 140, opacity: 0.15 }]} />
        <View style={[styles.ring, { width: 240, height: 240, borderRadius: 120, opacity: 0.20 }]} />
        <View style={[styles.ring, { width: 200, height: 200, borderRadius: 100, opacity: 0.30 }]} />

        {/* Logo and Icon wrapper with subtle pulse */}
        <Animated.View style={[styles.logoWrapper, { transform: [{ scale: pulseAnim }] }]}>
          <MaterialCommunityIcons name="hexagon-outline" size={170} color="#f5a623" style={styles.hexagon} />
          
          {/* Lightning Bolt */}
          <Ionicons name="flash" size={85} color="#f5a623" style={styles.flashIcon} />

          {/* Small blue meter screen */}
          <View style={styles.meterScreen}>
            <View style={styles.meterScreenLineLong} />
            <View style={styles.meterScreenLineShort} />
          </View>
        </Animated.View>
      </View>

      {/* 4. Typography & Loading Status */}
      <View style={styles.brandingContainer}>
        <Text style={styles.titleText}>
          Field<Text style={{ color: '#f5a623' }}>Watt</Text>
        </Text>
        <Text style={styles.subtitleText}>METER READING OPERATIONS</Text>
        
        {/* Muted separator line */}
        <View style={styles.separatorLine} />

        {/* Animated loading dots */}
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, { opacity: dotCount >= 1 ? 1 : 0.2 }]} />
          <View style={[styles.dot, { opacity: dotCount >= 2 ? 1 : 0.2 }]} />
          <View style={[styles.dot, { opacity: dotCount >= 3 ? 1 : 0.2 }]} />
        </View>

        <Text style={styles.syncingText}>Syncing field data...</Text>
      </View>

      {/* 5. Corner bracket accents */}
      <View style={[styles.cornerBracket, { bottom: 40, left: 30, borderLeftWidth: 2, borderBottomWidth: 2 }]} />
      <View style={[styles.cornerBracket, { bottom: 40, right: 30, borderRightWidth: 2, borderBottomWidth: 2 }]} />

      {/* 6. Version pill at the bottom */}
      <View style={styles.versionPill}>
        <Text style={styles.versionText}>v1.0.0</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#080b12',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#ffffff',
    opacity: 0.03, // subtle dark grid lines (over dark background)
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#ffffff',
    opacity: 0.03,
  },
  energyLine: {
    position: 'absolute',
    width: 350,
    height: 1.5,
    backgroundColor: '#f5a623',
    opacity: 0.08,
  },
  centerContainer: {
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -40,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#f5a623',
  },
  logoWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hexagon: {
    position: 'absolute',
  },
  flashIcon: {
    position: 'absolute',
    top: 55,
  },
  meterScreen: {
    position: 'absolute',
    bottom: 60,
    right: 48,
    width: 24,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#4f9cf9',
    backgroundColor: '#080b12',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    gap: 2.5,
  },
  meterScreenLineLong: {
    width: '100%',
    height: 1.5,
    backgroundColor: '#4f9cf9',
    borderRadius: 1,
  },
  meterScreenLineShort: {
    width: '60%',
    height: 1.5,
    backgroundColor: '#4f9cf9',
    borderRadius: 1,
    alignSelf: 'flex-start',
  },
  brandingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  titleText: {
    fontFamily: 'Georgia',
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'normal',
  },
  subtitleText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#4a5580',
    letterSpacing: 4.5,
    marginTop: 8,
  },
  separatorLine: {
    width: 100,
    height: 1,
    backgroundColor: '#4a5580',
    opacity: 0.25,
    marginVertical: 18,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f5a623',
  },
  syncingText: {
    fontSize: 13,
    color: '#4a5580',
    letterSpacing: 0.5,
  },
  cornerBracket: {
    position: 'absolute',
    width: 40,
    height: 25,
    borderColor: '#f5a623',
    opacity: 0.22,
  },
  versionPill: {
    position: 'absolute',
    bottom: 24,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 85, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 85, 128, 0.2)',
  },
  versionText: {
    fontSize: 11,
    color: '#4a5580',
    fontWeight: '600',
  },
});
