import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_ARRIVAL_CACHE } from './storageKeys';

export interface CachedArrivals {
  stopId: string;
  arrivals: any[];
  source: string;
  stopName: string | null;
  cachedAt: number; // Date.now()
}

export async function cacheArrivals(stopId: string, data: { arrivals: any[]; source: string; stopName?: string | null }): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SK_ARRIVAL_CACHE);
    const cache: Record<string, CachedArrivals> = raw ? JSON.parse(raw) : {};
    cache[stopId] = {
      stopId,
      arrivals: data.arrivals,
      source: data.source,
      stopName: data.stopName ?? null,
      cachedAt: Date.now(),
    };
    // Keep max 20 stops cached
    const keys = Object.keys(cache);
    if (keys.length > 20) {
      const sorted = keys.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt);
      for (let i = 0; i < keys.length - 20; i++) delete cache[sorted[i]];
    }
    await AsyncStorage.setItem(SK_ARRIVAL_CACHE, JSON.stringify(cache));
  } catch (e) {
    if (__DEV__) console.warn('cacheArrivals error:', e);
  }
}

export async function getCachedArrivals(stopId: string): Promise<CachedArrivals | null> {
  try {
    const raw = await AsyncStorage.getItem(SK_ARRIVAL_CACHE);
    if (!raw) return null;
    const cache: Record<string, CachedArrivals> = JSON.parse(raw);
    return cache[stopId] ?? null;
  } catch {
    return null;
  }
}

export async function getTopStopArrivals(): Promise<CachedArrivals | null> {
  try {
    const raw = await AsyncStorage.getItem(SK_ARRIVAL_CACHE);
    if (!raw) return null;
    const cache: Record<string, CachedArrivals> = JSON.parse(raw);
    const entries = Object.values(cache);
    if (entries.length === 0) return null;
    // Return most recently cached
    return entries.sort((a, b) => b.cachedAt - a.cachedAt)[0];
  } catch {
    return null;
  }
}
