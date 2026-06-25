import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostHogProvider } from 'posthog-react-native';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../context/AppContext';
import { BoardProvider } from '../context/BoardContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import NetworkBanner from '../components/NetworkBanner';
import { SK_ONBOARDED, SK_CRASH_LOG, SK_ONBOARDING_COMPLETE, SK_PROFILE_SETUP_DONE, SK_NOTIF_PERMISSION } from '../lib/storageKeys';
import { initSentry, captureException } from '../lib/sentry';
import { supabase } from '../lib/supabase';
import { incrementSessionCount } from '../lib/onboardingPrompts';
import { routeForNotification, NotificationType } from '../lib/notificationTypes';

// Prevent the native splash screen from auto-hiding until the app is ready
SplashScreen.preventAutoHideAsync();

// Initialize Sentry as early as possible (no-op if DSN is placeholder or package missing)
initSentry();

function logCrash(error: unknown) {
  try {
    const msg = error instanceof Error
      ? `${error.message}\n${error.stack ?? ''}`
      : String(error);
    const entry = `[${new Date().toISOString()}] ${msg}`;
    // Append to the log and keep the last 10 crashes
    AsyncStorage.getItem(SK_CRASH_LOG).then(existing => {
      const entries = existing ? existing.split('\n---\n') : [];
      entries.unshift(entry);
      AsyncStorage.setItem(SK_CRASH_LOG, entries.slice(0, 10).join('\n---\n')).catch(() => {});
    }).catch(() => {
      AsyncStorage.setItem(SK_CRASH_LOG, entry).catch(() => {});
    });
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
            <Text style={styles.title}>affiche Crashed</Text>
            <Text style={[styles.title, { fontSize: 18, marginBottom: 12 }]}>affiche a plant\u00e9</Text>
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

// Module-level guard: prevents the business-dashboard redirect from firing more than
// once per app session.
let businessRedirectDone = false;

export function resetBusinessRedirect() {
  businessRedirectDone = false;
}

function RootNav() {
  const [destination, setDestination] = useState<'onboarding' | 'tabs' | null>(null);
  const [claimState, setClaimState] = useState<'idle' | 'checking' | 'done'>('idle');
  const [isBusinessUser, setIsBusinessUser] = useState(false);
  const { session, loading: authLoading } = useAuth();

  const navigationDoneRef = useRef(false);
  const pendingDeepLinkRef = useRef<string | null>(null);
  const handledInitialUrlRef = useRef<string | null>(null);

  // Notification tap handler
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      const type = data?.type as NotificationType | undefined;
      if (!type) return;
      const route = routeForNotification(type, data);
      if (route) router.push(route as any);
    });
    return () => sub.remove();
  }, []);

  // Deep link handler for affiche://event/:id
  useEffect(() => {
    const dispatch = (url: string) => {
      const eventMatch = url.match(/^affiche:\/\/event\/([^/?#]+)/);
      if (eventMatch) { router.push(`/event/${eventMatch[1]}` as any); return; }
      const inviteMatch = url.match(/^affiche:\/\/invite\/([^/?#]+)/);
      if (inviteMatch) { router.push(`/invite/${inviteMatch[1]}` as any); }
    };

    const handleUrl = (url: string) => {
      if (navigationDoneRef.current) {
        dispatch(url);
      } else {
        // Save for after navigation completes (handles cold start while logged out)
        pendingDeepLinkRef.current = url;
      }
    };
    // Handle cold-start deep link
    Linking.getInitialURL().then(url => {
      if (url) { handledInitialUrlRef.current = url; handleUrl(url); }
    }).catch(() => {});
    // Handle foreground deep links — skip the URL that already fired via getInitialURL
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url === handledInitialUrlRef.current) return;
      handleUrl(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    setDestination('tabs');
    incrementSessionCount().catch(() => {});
  }, []);

  // Reset navigation gate whenever auth state settles (sign-in or sign-out)
  // so the routing effect re-evaluates with the new session state.
  useEffect(() => {
    if (!authLoading) {
      navigationDoneRef.current = false;
      // No session means no business claim check is needed
      if (!session) setClaimState('done');
    }
  }, [session, authLoading]);

  // Auto-claim business subscription on every session (restore or fresh login).
  // Idempotent: exits immediately if is_business is already true or no active subscription row exists.
  // Deps: [session] only — DB writes don't change session, so no re-trigger loop.
  // claimState gates the routing effect so it waits until this check resolves.
  useEffect(() => {
    if (!session) { setClaimState('done'); return; }
    const userEmail = session.user.email;
    if (!userEmail) { setClaimState('done'); return; }
    setClaimState('checking');
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_business')
          .eq('id', session.user.id)
          .single();
        if (prof?.is_business) {
          if (__DEV__) console.log('[RootNav] already business — setting isBusinessUser');
          setIsBusinessUser(true);
          return;
        }

        const { data: subRow } = await supabase
          .from('business_subscriptions')
          .select('venue_id')
          .eq('business_email', userEmail.toLowerCase())
          .eq('status', 'active')
          .maybeSingle();
        if (!subRow?.venue_id) return; // (2) no active subscription — no-op for normal users

        if (__DEV__) console.log('[RootNav] claim: sub found venue_id=', subRow.venue_id, '— writing profiles...');
        await supabase.from('profiles').update({
          is_business: true,
          business_email: userEmail.toLowerCase(),
          venue_id: subRow.venue_id,
        }).eq('id', session.user.id);

        const { data: venueRow } = await supabase
          .from('venues')
          .select('name')
          .eq('id', subRow.venue_id)
          .single();

        await supabase.from('business_profiles').upsert({
          user_id: session.user.id,
          venue_id: subRow.venue_id,
          business_name: venueRow?.name ?? '',
        }, { onConflict: 'user_id' });

        if (__DEV__) console.log('[RootNav] claim complete — setting isBusinessUser');
        setIsBusinessUser(true);
      } finally {
        setClaimState('done');
      }
    })();
  }, [session]);

  // Note: both `session` and `authLoading` are in deps. When session arrives,
  // this runs while authLoading is still true — `!authLoading` blocks the body so
  // nothing happens. Then authLoading flips to false, triggering a second run that
  // actually navigates. navigationDoneRef prevents any double-nav. Intentional.
  useEffect(() => {
    if (__DEV__) console.log('[RootNav] destination changed - destination=', destination, 'authLoading=', authLoading);
    if (destination === 'tabs' && !authLoading && !navigationDoneRef.current && claimState === 'done') {
      if (!session) {
        if (__DEV__) console.log('[RootNav] No session - routing to /auth');
        navigationDoneRef.current = true;
        setTimeout(() => {
          router.replace('/auth');
        }, 0);
      } else if (isBusinessUser) {
        // Nav tree is mounted and user is confirmed business — redirect once.
        if (!businessRedirectDone) {
          businessRedirectDone = true;
          navigationDoneRef.current = true;
          if (__DEV__) console.log('[RootNav] isBusinessUser — routing to /business-dashboard');
          router.replace('/business-dashboard' as any);
        }
      } else {
        (async () => {
          // Show onboarding slides if user hasn't seen them yet
          const onboarded = await AsyncStorage.getItem(SK_ONBOARDED).catch(() => null);
          if (!onboarded) {
            if (__DEV__) console.log('[RootNav] SK_ONBOARDED not set - routing to /onboarding');
            navigationDoneRef.current = true;
            router.replace('/onboarding');
            return;
          }
          // Check new completion key first; fall back to legacy SK_PROFILE_SETUP_DONE so
          // existing users who onboarded before SK_ONBOARDING_COMPLETE existed go straight to feed.
          const [[, onboardingComplete], [, setupDone]] = await AsyncStorage.multiGet([
            SK_ONBOARDING_COMPLETE,
            SK_PROFILE_SETUP_DONE,
          ]);
          const isDone = onboardingComplete === 'true' || setupDone === 'true';
          navigationDoneRef.current = true;
          if (!isDone) {
            if (__DEV__) console.log('[RootNav] Onboarding not complete - routing to /profile-setup');
            router.replace('/profile-setup');
          } else {
            if (__DEV__) console.log('[RootNav] Onboarding complete - routing to /(tabs)/index');
            router.replace('/(tabs)/index' as any);
            // Dispatch any deep link that arrived before navigation was ready
            if (pendingDeepLinkRef.current) {
              const url = pendingDeepLinkRef.current;
              pendingDeepLinkRef.current = null;
              setTimeout(() => {
                const eventMatch = url.match(/^affiche:\/\/event\/([^/?#]+)/);
                if (eventMatch) { router.push(`/event/${eventMatch[1]}` as any); return; }
                const inviteMatch = url.match(/^affiche:\/\/invite\/([^/?#]+)/);
                if (inviteMatch) { router.push(`/invite/${inviteMatch[1]}` as any); }
              }, 200);
            }
          }
          // Request push notification permissions once after login
          Notifications.getPermissionsAsync().then(({ status }) => {
            if (status !== 'granted') {
              Notifications.requestPermissionsAsync().then(({ status: newStatus }) => {
                AsyncStorage.setItem(SK_NOTIF_PERMISSION, newStatus).catch(() => {});
              });
            }
          }).catch(() => {});
        })();
      }
    }
  }, [destination, authLoading, session, claimState, isBusinessUser]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
      <Stack.Screen name="insights" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="business/index" options={{ headerShown: false }} />
      <Stack.Screen name="business-setup" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/preferences" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="onboarding/neighbourhood" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="business-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="qr-scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="invite/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="create-event" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
      <Stack.Screen name="terms-of-service" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
      <Stack.Screen name="saved-events" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="venue/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="lets-go" options={{ headerShown: false }} />
      <Stack.Screen name="category/[name]" options={{ headerShown: false }} />
      <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

function AppTree() {
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

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={POSTHOG_KEY ?? 'disabled'}
      options={{ host: 'https://us.i.posthog.com', disabled: !POSTHOG_KEY }}
    >
      <AppTree />
    </PostHogProvider>
  );
}

const styles = StyleSheet.create({
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
