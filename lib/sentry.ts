/**
 * Sentry crash reporting helpers  -  lazy-loaded and null-guarded
 * for Expo Go compatibility (same pattern as pushNotifications.ts).
 */

let Sentry: typeof import('@sentry/react-native') | null = null;
try { Sentry = require('@sentry/react-native'); } catch {}

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let initialized = false;

/** Initialize Sentry. Safe to call even if @sentry/react-native is not installed. */
export function initSentry(): void {
  if (!Sentry || initialized) return;
  if (SENTRY_DSN.includes('YOUR_SENTRY_DSN')) {
    if (__DEV__) console.warn('[Sentry] Placeholder DSN detected  -  skipping init');
    return;
  }
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
    });
    initialized = true;
  } catch {
    if (__DEV__) console.warn('[Sentry] Failed to initialize');
  }
}

/** Report an exception to Sentry. No-op if Sentry is not available or not initialized. */
export function captureException(error: unknown): void {
  if (!Sentry || !initialized) return;
  try {
    Sentry.captureException(error);
  } catch {
    // Swallow  -  Sentry itself should never crash the app
  }
}
