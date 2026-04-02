import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_PREMIUM, SK_PREMIUM_EXPIRES } from './storageKeys';

export const PREMIUM_FEATURES = {
  AI_ASSISTANT: 'ai_assistant',
  LEAVE_NOW_ALERTS: 'leave_now_alerts',
  COMMUTE_INSIGHTS: 'commute_insights',
  OFFLINE_MAPS: 'offline_maps',
  CUSTOM_THEMES: 'custom_themes',
  CO2_TRACKER: 'co2_tracker',
} as const;

export type PremiumFeature = (typeof PREMIUM_FEATURES)[keyof typeof PREMIUM_FEATURES];

export async function isPremium(): Promise<boolean> {
  try {
    const active = await AsyncStorage.getItem(SK_PREMIUM);
    if (active !== 'true') return false;
    const expiresRaw = await AsyncStorage.getItem(SK_PREMIUM_EXPIRES);
    if (expiresRaw) {
      const expires = parseInt(expiresRaw, 10);
      if (!isNaN(expires) && Date.now() > expires) {
        await AsyncStorage.multiRemove([SK_PREMIUM, SK_PREMIUM_EXPIRES]);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function setPremium(active: boolean, expiresAt?: number): Promise<void> {
  if (active) {
    await AsyncStorage.setItem(SK_PREMIUM, 'true');
    if (expiresAt) await AsyncStorage.setItem(SK_PREMIUM_EXPIRES, String(expiresAt));
  } else {
    await AsyncStorage.multiRemove([SK_PREMIUM, SK_PREMIUM_EXPIRES]);
  }
}

/** Mock purchase — replace with RevenueCat / expo-in-app-purchases */
export async function handlePurchase(plan: 'monthly' | 'yearly'): Promise<boolean> {
  const now = Date.now();
  const duration = plan === 'monthly' ? 30 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
  await setPremium(true, now + duration);
  return true;
}

export function usePremium(): { isPremium: boolean; loading: boolean } {
  const [premium, setPremiumState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    isPremium().then(v => {
      if (mounted) { setPremiumState(v); setLoading(false); }
    });
    return () => { mounted = false; };
  }, []);

  return { isPremium: premium, loading };
}
