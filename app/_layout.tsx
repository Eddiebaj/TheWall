import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../context/AppContext';
import { BoardProvider } from '../context/BoardContext';
import NetworkBanner from '../components/NetworkBanner';
import { SK_ONBOARDED, SK_CRASH_LOG } from '../lib/storageKeys';

// Prevent the native splash screen from auto-hiding until our animated splash starts
SplashScreen.preventAutoHideAsync();

// Log startup errors to AsyncStorage for diagnostics
function logCrash(error: unknown) {
  try {
    const msg = error instanceof Error
      ? `${error.message}\n${error.stack ?? ''}`
      : String(error);
    const entry = `[${new Date().toISOString()}] ${msg}`;
    AsyncStorage.setItem(SK_CRASH_LOG, entry).catch(() => {});
  } catch {
    // nothing we can do
  }
}

// Root-level error boundary — catches JS crashes before they kill the app
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logCrash(`${error.message}\n${error.stack ?? ''}\nComponent stack: ${info.componentStack ?? ''}`);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>RouteO Crashed</Text>
            <Text style={[styles.title, { fontSize: 18, marginBottom: 12 }]}>RouteO a plant\u00e9</Text>
            <Text style={styles.subtitle}>
              Something went wrong at startup. This info can help debug the issue:
            </Text>
            <Text style={[styles.subtitle, { marginBottom: 16 }]}>
              Une erreur est survenue au d\u00e9marrage. Ces informations peuvent aider au diagnostic:
            </Text>
            <ScrollView style={styles.scroll}>
              <Text style={styles.error} selectable>
                {this.state.error.message}
              </Text>
              {this.state.error.stack ? (
                <Text style={styles.stack} selectable>
                  {this.state.error.stack}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Hide the native splash now that our animated splash is showing
    SplashScreen.hideAsync();
    // Fade in 400ms -> hold 600ms -> fade out 300ms
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, []);

  return (
    <View style={styles.splash}>
      <Animated.View style={{ opacity }}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

function RootNav() {
  const [showSplash, setShowSplash] = useState(true);
  const [destination, setDestination] = useState<'onboarding' | 'tabs' | null>(null);

  useEffect(() => {
    // Promise-based coordination: wait for both AsyncStorage check and animation
    const storagePromise = AsyncStorage.getItem(SK_ONBOARDED)
      .then(val => (val ? 'tabs' : 'onboarding') as 'onboarding' | 'tabs')
      .catch(() => 'onboarding' as const);

    const animationPromise = new Promise<void>(resolve => {
      (animationResolveRef as React.MutableRefObject<(() => void) | null>).current = resolve;
    });

    Promise.all([storagePromise, animationPromise]).then(([dest]) => {
      setShowSplash(false);
      setDestination(dest);
    });
  }, []);

  const animationResolveRef = useRef<(() => void) | null>(null);

  const handleSplashFinish = () => {
    if (animationResolveRef.current) animationResolveRef.current();
  };

  useEffect(() => {
    if (!showSplash && destination === 'onboarding') {
      setTimeout(() => {
        router.replace('/onboarding');
      }, 0);
    }
  }, [showSplash, destination]);

  if (showSplash) {
    return <AnimatedSplash onFinish={handleSplashFinish} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="stop/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="insights" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <AppProvider>
          <BoardProvider>
            <RootNav />
            <NetworkBanner />
          </BoardProvider>
        </AppProvider>
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#e94560',
  },
  title: {
    color: '#e94560',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a0a0b8',
    fontSize: 14,
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 400,
  },
  error: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  stack: {
    color: '#8888aa',
    fontSize: 11,
    fontFamily: 'Courier',
  },
});
