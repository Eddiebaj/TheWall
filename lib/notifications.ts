/**
 * High-level notification helpers for affiche social features.
 * Wraps expo-notifications and syncs push tokens with Supabase.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';

let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
let Device: typeof import('expo-device') | null = null;
try { Device = require('expo-device'); } catch {}
let Constants: typeof import('expo-constants').default | null = null;
try { Constants = require('expo-constants').default; } catch {}

/**
 * Request permissions and return the Expo push token, or null if unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    if (__DEV__) console.warn('[notifications] Push tokens require a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: Constants?.expoConfig?.extra?.eas?.projectId,
  });

  return tokenData.data;
}

/**
 * Upsert the user's push token to the push_tokens table.
 * Conflicts on (user_id, token) are updated in-place.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );
  if (error && __DEV__) console.warn('[notifications] savePushToken error:', error.message);
}

/**
 * Schedule an immediate local notification.
 */
export async function sendLocalNotification(title: string, body: string, sound = false): Promise<void> {
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound },
    trigger: null,
  });
}
