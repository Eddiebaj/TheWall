import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_TRIP_HISTORY, SK_SAVED_BOARD } from './storageKeys';

export type FrequentRoute = {
  routeId: string;
  stopId: string;
  stopName: string;
  tripCount: number;
};

/**
 * Detect top 2-3 frequent routes from trip history + saved board stops.
 * Falls back to first 2 saved board stops if no trip history.
 */
export async function detectFrequentRoutes(): Promise<FrequentRoute[]> {
  // Load saved board stops for cross-referencing
  let boardStops: { id: string; name: string }[] = [];
  try {
    const boardRaw = await AsyncStorage.getItem(SK_SAVED_BOARD);
    if (boardRaw) {
      const board = JSON.parse(boardRaw);
      boardStops = board
        .filter((b: any) => b.type === 'bus_stop' || b.type === 'lrt_station')
        .map((b: any) => ({ id: b.id, name: b.name }));
    }
  } catch (e) { if (__DEV__) console.warn(e); }

  // Try trip history first
  try {
    const histRaw = await AsyncStorage.getItem(SK_TRIP_HISTORY);
    if (histRaw) {
      const trips: any[] = JSON.parse(histRaw).slice(-15);
      // Count route frequency  -  trips may have a routes array or single route
      const routeCounts = new Map<string, { count: number; stopId: string; stopName: string }>();

      // Score board stops by how often they appear in trip history labels
      const stopScores = new Map<string, number>();
      for (const stop of boardStops) {
        let score = 0;
        const nameLower = stop.name.toLowerCase();
        for (const trip of trips) {
          if ((trip.fromLabel || '').toLowerCase().includes(nameLower) ||
              (trip.toLabel || '').toLowerCase().includes(nameLower)) {
            score++;
          }
        }
        stopScores.set(stop.id, score);
      }
      // Sort board stops by relevance (highest trip history match first)
      const sortedBoardStops = [...boardStops].sort((a, b) =>
        (stopScores.get(b.id) || 0) - (stopScores.get(a.id) || 0)
      );

      for (const trip of trips) {
        const routes: string[] = trip.routes || (trip.route ? [trip.route] : []);
        for (const r of routes) {
          if (!r) continue;
          const existing = routeCounts.get(r);
          if (existing) {
            existing.count++;
          } else {
            // Pick the best unused stop (sorted by trip history relevance)
            const usedStopIds = new Set([...routeCounts.values()].map(v => v.stopId));
            const matchStop = sortedBoardStops.find(s => !usedStopIds.has(s.id)) || sortedBoardStops[0] || null;
            routeCounts.set(r, {
              count: 1,
              stopId: matchStop?.id || '',
              stopName: matchStop?.name || '',
            });
          }
        }
      }

      // Filter ≥2 trips, sort by frequency, take top 3
      const frequent = [...routeCounts.entries()]
        .filter(([, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3)
        .map(([routeId, v]) => ({
          routeId,
          stopId: v.stopId,
          stopName: v.stopName,
          tripCount: v.count,
        }));

      if (frequent.length > 0) return frequent;
    }
  } catch (e) { if (__DEV__) console.warn(e); }

  // Fallback: first 2 saved board stops
  if (boardStops.length > 0) {
    return boardStops.slice(0, 2).map(s => ({
      routeId: '',
      stopId: s.id,
      stopName: s.name,
      tripCount: 0,
    }));
  }

  return [];
}
