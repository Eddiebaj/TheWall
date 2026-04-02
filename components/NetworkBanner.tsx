import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useApp } from '../context/AppContext';

type BannerState = 'hidden' | 'offline' | 'back-online';

export default function NetworkBanner() {
  const { t, colours, fonts } = useApp();
  const [banner, setBanner] = useState<BannerState>('hidden');
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const wasOffline = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false;

      if (!online) {
        wasOffline.current = true;
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
        setBanner('offline');
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } else if (wasOffline.current) {
        wasOffline.current = false;
        setBanner('back-online');
        // Ensure banner is visible for the "back online" message
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
        dismissTimer.current = setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -60,
            duration: 300,
            useNativeDriver: true,
          }).start(() => setBanner('hidden'));
          dismissTimer.current = null;
        }, 3000);
      }
    });

    return () => {
      unsubscribe();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []); // slideAnim is a ref, stable across renders

  if (banner === 'hidden') return null;

  const isOffline = banner === 'offline';
  const bgColor = isOffline ? colours.red : colours.green;
  const label = isOffline
    ? t('No internet connection', 'Pas de connexion Internet')
    : t('Back online', 'Connexion retablie');

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.inner}>
        <Text style={[styles.text, { fontSize: fonts.md, color: '#fff' }]}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 54 : 24;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: STATUS_BAR_HEIGHT,
  },
  inner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
