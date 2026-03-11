import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { AppProvider } from '../context/AppContext';

function RootNav() {
  useEffect(() => {
    AsyncStorage.getItem('routeo_onboarded').then(val => {
      if (!val) {
        router.replace('/onboarding' as any);
      }
    }).catch(() => {
      // Storage error — show onboarding as safe default
      router.replace('/onboarding' as any);
    });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <RootNav />
    </AppProvider>
  );
}