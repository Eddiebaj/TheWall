/**
 * Morning commute notification scheduler.
 * Schedules a daily local notification at the user's chosen time
 * that prompts them to check live arrivals for their commute stops.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_COMMUTE_ALERT } from './storageKeys';
import { detectFrequentRoutes } from './frequentRoutes';
import { PREMIUM_ENABLED } from './flags';

let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}

const NOTIF_ID = 'routeo_morning_commute';

export type CommuteAlertSettings = {
  enabled: boolean;
  /** Hour in 24h format (0-23) */
  hour: number;
  /** Minute (0-59) */
  minute: number;
};

const DEFAULT_SETTINGS: CommuteAlertSettings = { enabled: false, hour: 7, minute: 15 };

export async function getCommuteAlertSettings(): Promise<CommuteAlertSettings> {
  try {
    const raw = await AsyncStorage.getItem(SK_COMMUTE_ALERT);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export async function saveCommuteAlertSettings(
  settings: CommuteAlertSettings,
  lang: string,
): Promise<void> {
  await AsyncStorage.setItem(SK_COMMUTE_ALERT, JSON.stringify(settings));
  if (settings.enabled) {
    await scheduleCommuteNotification(settings, lang);
  } else {
    await cancelCommuteNotification();
  }
}

async function scheduleCommuteNotification(
  settings: CommuteAlertSettings,
  lang: string,
): Promise<void> {
  if (!Notifications) return;

  // Cancel any existing one first
  await cancelCommuteNotification();

  // Build a contextual body from frequent routes
  let body: string;
  try {
    const routes = await detectFrequentRoutes();
    if (routes.length > 0 && routes[0].routeId) {
      const routeList = routes
        .filter(r => r.routeId)
        .slice(0, 2)
        .map(r => r.routeId)
        .join(', ');
      body = lang === 'fr'
        ? `Consultez les arrivees en direct pour ${routeList}`
        : `Check live arrivals for Route ${routeList}`;
    } else if (routes.length > 0 && routes[0].stopName) {
      body = lang === 'fr'
        ? `Consultez les arrivees a ${routes[0].stopName}`
        : `Check arrivals at ${routes[0].stopName}`;
    } else {
      body = lang === 'fr'
        ? 'Consultez vos arrivees en direct avant de partir'
        : 'Check your live arrivals before heading out';
    }
  } catch {
    body = lang === 'fr'
      ? 'Consultez vos arrivees en direct avant de partir'
      : 'Check your live arrivals before heading out';
  }

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: {
      title: lang === 'fr' ? 'Votre trajet du matin' : 'Your morning commute',
      body,
      sound: 'default',
      data: { type: 'morning_commute' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
    },
  });
}

async function cancelCommuteNotification(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID);
  } catch {}
}

// Notification types that require a premium subscription.
// Free users get the morning commute reminder only; these advanced push
// types are suppressed in the subscription sync when PREMIUM_ENABLED is true.
export const PREMIUM_NOTIF_TYPES = [
  'arrivalAlerts',
  'transferAtRisk',
  'routeCancellation',
  'significantDelay',
] as const;

export type PremiumNotifType = typeof PREMIUM_NOTIF_TYPES[number];

/**
 * Filters subscription objects before syncing with the backend.
 * When PREMIUM_ENABLED is true and the user is not premium, any
 * premium-only notification type is forced to `enabled: false`.
 */
export function filterPremiumNotifSubs<T extends { type: string; enabled: boolean }>(
  subs: T[],
  isPremium: boolean,
): T[] {
  if (!PREMIUM_ENABLED || isPremium) return subs;
  return subs.map(s =>
    (PREMIUM_NOTIF_TYPES as readonly string[]).includes(s.type)
      ? { ...s, enabled: false }
      : s,
  );
}

/** Re-schedule with fresh route data (call on app foreground). */
export async function refreshCommuteNotification(lang: string): Promise<void> {
  const settings = await getCommuteAlertSettings();
  if (!settings.enabled) return;
  await scheduleCommuteNotification(settings, lang);
}
