import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../context/AppContext';
import { BoardProvider } from '../context/BoardContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import NetworkBanner from '../components/NetworkBanner';
import { SK_ONBOARDED, SK_CRASH_LOG, SK_LANGUAGE } from '../lib/storageKeys';
import { initSentry, captureException } from '../lib/sentry';
import { refreshCommuteNotification } from '../lib/commuteNotifications';
import { incrementSessionCount } from '../lib/onboardingPrompts';
import { resumeWatcherIfNeeded } from '../lib/watchedBuses';

// Prevent the native splash screen from auto-hiding until our animated splash starts
SplashScreen.preventAutoHideAsync();

// Initialize Sentry as early as possible (no-op if DSN is placeholder or package missing)
initSentry();

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

// Root-level error boundary - catches JS crashes before they kill the app
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
    captureException(error);
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
    if (__DEV__) console.log('[Splash] AnimatedSplash mounted, calling SplashScreen.hideAsync()');
    SplashScreen.hideAsync().then(() => {
      if (__DEV__) console.log('[Splash] SplashScreen.hideAsync() resolved');
    }).catch(e => {
      if (__DEV__) console.log('[Splash] SplashScreen.hideAsync() error:', e);
    });

    if (__DEV__) console.log('[Splash] Starting animation sequence (400 fade-in + 600 hold + 300 fade-out)');
    // Fade in 400ms -> hold 600ms -> fade out 300ms
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (__DEV__) console.log('[Splash] Animation sequence complete, finished=', finished, ', calling onFinish()');
      onFinish();
    });
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
  const { session, profile, loading: authLoading } = useAuth();

  // Declare ref BEFORE the useEffect that assigns to it
  const animationResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (__DEV__) console.log('[RootNav] useEffect start - creating storagePromise and animationPromise');

    // Promise-based coordination: wait for both AsyncStorage check and animation
    const storagePromise = AsyncStorage.getItem(SK_ONBOARDED)
      .then(val => {
        const dest = (val ? 'tabs' : 'onboarding') as 'onboarding' | 'tabs';
        if (__DEV__) console.log('[RootNav] storagePromise resolved, SK_ONBOARDED=', val, '=> destination=', dest);
        return dest;
      })
      .catch(e => {
        if (__DEV__) console.log('[RootNav] storagePromise caught error:', e, '- defaulting to onboarding');
        return 'onboarding' as const;
      });

    const animationPromise = new Promise<void>(resolve => {
      if (__DEV__) console.log('[RootNav] animationPromise created, setting animationResolveRef.current');
      animationResolveRef.current = resolve;
    });

    if (__DEV__) console.log('[RootNav] Waiting on Promise.all([storagePromise, animationPromise])...');
    Promise.all([storagePromise, animationPromise]).then(([dest]) => {
      if (__DEV__) console.log('[RootNav] Promise.all resolved! dest=', dest, '- calling setShowSplash(false)');
      setShowSplash(false);
      setDestination(dest);
      // Increment session counter for onboarding prompts
      incrementSessionCount().catch(() => {});
      // Resume any bus approach watchers from a previous session
      resumeWatcherIfNeeded().catch(() => {});
      // Refresh morning commute notification with latest route data
      AsyncStorage.getItem(SK_LANGUAGE)
        .then(lang => refreshCommuteNotification(lang || 'en'))
        .catch(() => {});
    });
  }, []);

  const handleSplashFinish = () => {
    if (__DEV__) console.log('[RootNav] handleSplashFinish called, animationResolveRef.current=', animationResolveRef.current != null ? 'SET' : 'NULL');
    if (animationResolveRef.current) {
      animationResolveRef.current();
      if (__DEV__) console.log('[RootNav] animationResolveRef.current() called - animationPromise should now resolve');
    } else {
      if (__DEV__) console.warn('[RootNav] animationResolveRef.current is NULL - animationPromise will never resolve! Forcing splash off.');
      setShowSplash(false);
    }
  };

  useEffect(() => {
    if (__DEV__) console.log('[RootNav] showSplash/destination changed - showSplash=', showSplash, 'destination=', destination, 'authLoading=', authLoading);
    if (!showSplash && destination === 'onboarding') {
      if (__DEV__) console.log('[RootNav] Routing to /onboarding');
      setTimeout(() => {
        router.replace('/onboarding');
      }, 0);
    } else if (!showSplash && destination === 'tabs' && !authLoading) {
      if (!session) {
        if (__DEV__) console.log('[RootNav] No session - routing to /auth');
        setTimeout(() => {
          router.replace('/auth');
        }, 0);
      } else {
        (async () => {
          const setupDone = await AsyncStorage.getItem('routeo_profile_setup_done');
          if (!setupDone) {
            if (__DEV__) console.log('[RootNav] Profile setup not done - routing to /profile-setup');
            router.replace('/profile-setup');
          } else {
            if (__DEV__) console.log('[RootNav] Routing to /(tabs)/map');
            router.replace('/(tabs)/map');
          }
        })();
      }
    }
  }, [showSplash, destination, authLoading, session]);

  if (showSplash) {
    return <AnimatedSplash onFinish={handleSplashFinish} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="stop/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="insights" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/map" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="business-signup" options={{ headerShown: false }} />
      <Stack.Screen name="business-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="qr-scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
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
    </AuthProvider>
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
    width: 160,
    height: 160,
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
