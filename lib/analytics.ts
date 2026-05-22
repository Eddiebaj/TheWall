import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePostHog } from 'posthog-react-native';
import { SK_ANALYTICS } from './storageKeys';

export type AnalyticsEvent =
  | 'app_open'
  | 'stop_saved'
  | 'arrival_viewed'
  | 'ghost_alert_shown'
  | 'reliability_tapped'
  | 'trip_planned'
  | 'map_opened';

type AnalyticsCounts = Partial<Record<AnalyticsEvent, number>>;

/**
 * Fire-and-forget event tracker. Increments a counter in AsyncStorage.
 * Intentionally does not return a promise to callers  -  errors are silently swallowed.
 */
export function trackEvent(event: AnalyticsEvent): void {
  (async () => {
    try {
      const raw = await AsyncStorage.getItem(SK_ANALYTICS);
      const counts: AnalyticsCounts = raw ? JSON.parse(raw) : {};
      counts[event] = (counts[event] || 0) + 1;
      await AsyncStorage.setItem(SK_ANALYTICS, JSON.stringify(counts));
    } catch {
      // silent  -  analytics should never crash the app
    }
  })();
}

export function useAnalytics() {
  const posthog = usePostHog();

  function capture(event: string, properties?: object) {
    posthog.capture(event, properties);
  }

  return { capture };
}

/**
 * Returns the current analytics counts object.
 */
export async function getAnalytics(): Promise<AnalyticsCounts> {
  try {
    const raw = await AsyncStorage.getItem(SK_ANALYTICS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
