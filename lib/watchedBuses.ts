import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_WATCHED_BUSES } from './storageKeys';

let Notifications: any = null;
try { Notifications = require('expo-notifications'); } catch {}

const WATCH_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const POLL_INTERVAL_MS = 30000;              // 30 seconds

export type WatchedBus = {
  stopCode: string;
  stopName: string;
  routeId: string;
  watchedAt: number;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
// Tracks whether we already fired a notification for a given stopCode-routeId key this watch cycle
const firedKeys: Set<string> = new Set();

async function getWatched(): Promise<WatchedBus[]> {
  try {
    const raw = await AsyncStorage.getItem(SK_WATCHED_BUSES);
    const all: WatchedBus[] = raw ? JSON.parse(raw) : [];
    // Strip expired entries
    return all.filter(b => Date.now() - b.watchedAt < WATCH_EXPIRY_MS);
  } catch { return []; }
}

async function saveWatched(buses: WatchedBus[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SK_WATCHED_BUSES, JSON.stringify(buses));
  } catch {}
}

export async function watchBus(stopCode: string, stopName: string, routeId: string): Promise<void> {
  const all = await getWatched();
  const key = `${stopCode}-${routeId}`;
  if (all.some(b => `${b.stopCode}-${b.routeId}` === key)) return;
  all.push({ stopCode, stopName, routeId, watchedAt: Date.now() });
  await saveWatched(all);
  startWatcher();
}

export async function unwatchBus(stopCode: string, routeId: string): Promise<void> {
  let all = await getWatched();
  all = all.filter(b => !(b.stopCode === stopCode && b.routeId === routeId));
  await saveWatched(all);
  firedKeys.delete(`${stopCode}-${routeId}`);
  if (all.length === 0) stopWatcher();
}

export async function isWatched(stopCode: string, routeId: string): Promise<boolean> {
  const all = await getWatched();
  return all.some(b => b.stopCode === stopCode && b.routeId === routeId);
}

async function poll(): Promise<void> {
  if (!Notifications) return;
  const watched = await getWatched();
  if (watched.length === 0) { stopWatcher(); return; }

  for (const bus of watched) {
    const key = `${bus.stopCode}-${bus.routeId}`;
    if (firedKeys.has(key)) continue;
    try {
      const resp = await fetch(
        `https://routeo-backend.vercel.app/api/arrivals?stop=${encodeURIComponent(bus.stopCode)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      const arrivals: any[] = data.arrivals || [];
      const match = arrivals.find((a: any) => {
        const aRoute = String(a.routeId || a.route || '').replace(/-.*/, '');
        const target = String(bus.routeId).replace(/-.*/, '');
        return aRoute === target;
      });
      if (match && typeof match.minsAway === 'number' && match.minsAway <= 2) {
        firedKeys.add(key);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Route ${bus.routeId} arriving soon`,
            body: `${match.minsAway <= 0 ? 'Arriving now' : `~${match.minsAway} min`} at ${bus.stopName} — time to leave`,
            sound: true,
          },
          trigger: null,
        });
      }
    } catch { /* best-effort — never block */ }
  }
}

export function startWatcher(): void {
  if (pollTimer) return;
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopWatcher(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Call on app start to resume watching any buses saved from a previous session. */
export async function resumeWatcherIfNeeded(): Promise<void> {
  const watched = await getWatched();
  if (watched.length > 0) startWatcher();
}
