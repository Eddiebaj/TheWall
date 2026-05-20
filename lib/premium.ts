import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { PREMIUM_ENABLED } from './flags';

// Lazy-load for Expo Go compatibility (native module unavailable in Go)
let Purchases: typeof import('react-native-purchases').default | null = null;
try { Purchases = require('react-native-purchases').default; } catch {}

// Set via Expo env vars  -  fill in the dashboard keys before going live
const RC_KEY_IOS     = (process.env.EXPO_PUBLIC_RC_KEY_IOS     ?? '').trim();
const RC_KEY_ANDROID = (process.env.EXPO_PUBLIC_RC_KEY_ANDROID ?? '').trim();

// RevenueCat entitlement identifier (configure in RC dashboard)
const ENTITLEMENT_ID = 'premium';

// Product identifiers (configure in App Store Connect / Play Console)
export const PRODUCT_MONTHLY = 'routeo_premium_monthly';  // $2.99 / month
export const PRODUCT_ANNUAL  = 'routeo_premium_annual';   // $19.99 / year

export function initPurchases() {
  if (!Purchases || !PREMIUM_ENABLED) return;
  const key = Platform.OS === 'ios' ? RC_KEY_IOS : RC_KEY_ANDROID;
  if (!key) {
    if (__DEV__) console.warn('[premium] RevenueCat API key missing  -  skipping configure');
    return;
  }
  try {
    Purchases.configure({ apiKey: key });
    if (__DEV__) console.log('[premium] RevenueCat configured');
  } catch (e) {
    if (__DEV__) console.warn('[premium] configure error:', e);
  }
}

export async function getOfferings() {
  if (!Purchases || !PREMIUM_ENABLED) return null;
  try {
    return await Purchases.getOfferings();
  } catch (e) {
    if (__DEV__) console.warn('[premium] getOfferings error:', e);
    return null;
  }
}

export async function purchasePackage(pkg: import('react-native-purchases').PurchasesPackage) {
  if (!Purchases) throw new Error('react-native-purchases not available');
  return Purchases.purchasePackage(pkg);
}

export async function restorePurchases() {
  if (!Purchases || !PREMIUM_ENABLED) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (e) {
    if (__DEV__) console.warn('[premium] restorePurchases error:', e);
    return null;
  }
}

export async function checkIsPremium(): Promise<boolean> {
  if (!PREMIUM_ENABLED) return true;
  if (!Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return ENTITLEMENT_ID in info.entitlements.active;
  } catch {
    return false;
  }
}

export function useIsPremium(): boolean {
  // When the flag is off, everyone is premium (beta bypass)
  const [isPremium, setIsPremium] = useState(!PREMIUM_ENABLED);

  useEffect(() => {
    if (!PREMIUM_ENABLED) { setIsPremium(true); return; }
    checkIsPremium().then(setIsPremium);
  }, []);

  return isPremium;
}

// Free-tier limits
export const FREE_CLASS_LIMIT     = 5;   // class schedule entries
export const PREMIUM_CLASS_LIMIT  = 20;
export const FREE_ARRIVAL_LIMIT   = 2;   // departures shown per stop
export const PREMIUM_ARRIVAL_LIMIT = 20;

// Named feature keys used for paywall gating and badge display
export const PREMIUM_FEATURES = {
  MULTI_STOP:      'multi_stop',
  ISOCHRONE:       'isochrone',
  CLASS_SCHEDULE:  'class_schedule',
  ARRIVAL_HISTORY: 'arrival_history',
  AI_ASSISTANT:    'ai_assistant',
} as const;

/** Alias for backwards compatibility with imports that use usePremium */
export function usePremium(): boolean { return useIsPremium(); }
