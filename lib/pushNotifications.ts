/**
 * Push notification helpers — registers Expo push tokens, syncs with backend,
 * and manages device identity for server-side notifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Lazy-load native modules to avoid crash in Expo Go
let Device: typeof import('expo-device') | null = null;
try { Device = require('expo-device'); } catch {}
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
let Constants: typeof import('expo-constants').default | null = null;
try { Constants = require('expo-constants').default; } catch {}
import { fetchWithTimeout } from './fetchWithTimeout';
import { SK_DEVICE_ID, SK_PUSH_TOKEN } from './storageKeys';

const COMMUNITY_URL = 'https://routeo-backend.vercel.app/api/community';

/** Generate or retrieve a stable device ID (persisted in AsyncStorage). */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(SK_DEVICE_ID);
  if (id) return id;
  id = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(SK_DEVICE_ID, id);
  return id;
}

/**
 * Request notification permissions and get the Expo push token.
 * Returns the token string or null if permissions denied / not a device.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device || !Notifications) return null;

  if (!Device.isDevice) {
    if (__DEV__) console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: Constants?.expoConfig?.extra?.eas?.projectId,
  });
  return tokenData.data;
}

/**
 * Register the push token with the backend.
 * Called on app launch — only sends if token changed since last sync.
 */
export async function registerPushToken(language: string): Promise<boolean> {
  try {
    const token = await getExpoPushToken();
    if (!token) return false;

    const prevToken = await AsyncStorage.getItem(SK_PUSH_TOKEN);
    const deviceId = await getDeviceId();

    // Skip if nothing changed
    if (prevToken === token) return true;

    const resp = await fetchWithTimeout(
      `${COMMUNITY_URL}?action=push.register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expo_token: token,
          device_id: deviceId,
          platform: Platform.OS,
          language,
        }),
      }
    );

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    await AsyncStorage.setItem(SK_PUSH_TOKEN, token);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('Push token registration failed:', e);
    return false;
  }
}

/**
 * Sync notification subscription preferences with the backend.
 * Called when user toggles notification settings in account.tsx.
 */
export async function syncSubscriptions(
  subscriptions: { type: string; enabled: boolean; metadata?: any }[]
): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();

    const resp = await fetchWithTimeout(
      `${COMMUNITY_URL}?action=push.subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, subscriptions }),
      }
    );

    return resp.ok;
  } catch (e) {
    if (__DEV__) console.warn('Subscription sync failed:', e);
    return false;
  }
}

/** Configure default notification behavior (show alert + sound when foregrounded). */
export function configureNotificationHandler(): void {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
