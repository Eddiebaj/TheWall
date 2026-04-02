import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Image, Platform, RefreshControl,
  ScrollView, StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { SK_SAVED_PLACES, SK_TRIP_HISTORY } from '../../lib/storageKeys';

const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const TEAL = '#00A78D';
const { width: SCREEN_W } = Dimensions.get('window');
const PAD = 16;
const GAP = 8;
const HALF_W = (SCREEN_W - PAD * 2 - GAP) / 2;
const FULL_W = SCREEN_W - PAD * 2;

type SavedStop = { id: string; name: string; agency?: string };
type SavedPlace = {
  id: string; name: string; vicinity?: string; photoRef?: string;
  categoryIcon?: string; categoryColor?: string;
  categoryLabel_en?: string; categoryLabel_fr?: string;
  lat?: number; lng?: number;
};
type TripEntry = { fromLabel: string; toLabel: string; plannedAt: string; durationMins?: number; routes?: string[] };
type StopArrival = { routeId: string; headsign: string; minsAway: number };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeAgo(dateStr: string, t: (en: string, fr: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t(`${mins}m ago`, `il y a ${mins}m`);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t(`${hrs}h ago`, `il y a ${hrs}h`);
  const days = Math.floor(hrs / 24);
  return t(`${days}d ago`, `il y a ${days}j`);
}

export default function SavedScreen() {
  const { colours, resolvedTheme, t, fonts } = useApp();
  const { savedBoard: boardItems } = useBoard();
  const isLight = resolvedTheme === 'light';
  const router = useRouter();

  const [stops, setStops] = useState<SavedStop[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [recentTrip, setRecentTrip] = useState<TripEntry | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, StopArrival[]>>({});
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [mostUsedStop, setMostUsedStop] = useState<SavedStop | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  // ── Load data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [placesRaw, tripRaw] = await Promise.all([
        AsyncStorage.getItem(SK_SAVED_PLACES),
        AsyncStorage.getItem(SK_TRIP_HISTORY),
      ]);

      // Stops from board context
      const savedStops: SavedStop[] = [];
      for (const item of boardItems) {
        if (item.type === 'bus_stop' || item.type === 'lrt_station') {
          savedStops.push({ id: item.id, name: item.name || `Stop #${item.id}`, agency: item.agency });
        }
      }
      setStops(savedStops);

      // Places
      if (placesRaw) {
        try { setPlaces(JSON.parse(placesRaw)); } catch (e) { if (__DEV__) console.warn(e); }
      }

      // Recent trip
      if (tripRaw) {
        try {
          const trips: TripEntry[] = JSON.parse(tripRaw);
          if (Array.isArray(trips) && trips.length > 0) {
            setRecentTrip(trips[0]);
          }
        } catch (e) { if (__DEV__) console.warn(e); }
      }

      // Detect most used stop — match stop IDs mentioned in trip route stops
      // Falls back to first saved stop if no trip history matches
      if (savedStops.length > 0) {
        let topStop: SavedStop = savedStops[0];
        if (tripRaw) {
          try {
            const trips: any[] = JSON.parse(tripRaw);
            const stopCounts: Record<string, number> = {};
            const nameToId = new Map(savedStops.map(s => [s.name.toLowerCase(), s.id]));
            for (const tr of trips) {
              const from = (tr.fromLabel || '').toLowerCase();
              const to = (tr.toLabel || '').toLowerCase();
              for (const [name, id] of nameToId) {
                if (from === name || to === name) {
                  stopCounts[id] = (stopCounts[id] || 0) + 1;
                }
              }
            }
            const topId = Object.entries(stopCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (topId) topStop = savedStops.find(s => s.id === topId) || savedStops[0];
          } catch (e) { if (__DEV__) console.warn(e); }
        }
        setMostUsedStop(topStop);
      }

      setLoaded(true);

      // Fetch arrivals
      if (savedStops.length > 0) {
        setArrivalsLoading(true);
        const results = await Promise.allSettled(
          savedStops.map(async s => {
            const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${s.id}`, { timeout: 8000 });
            if (!resp.ok) return { stopId: s.id, arrivals: [] as StopArrival[] };
            const data = await resp.json();
            const now = Date.now();
            const arr: StopArrival[] = (data.trips || [])
              .filter((tr: any) => tr.adjustedTime > now)
              .slice(0, 4)
              .map((tr: any) => ({
                routeId: tr.routeId || tr.route || '',
                headsign: tr.headsign || tr.destination || '',
                minsAway: Math.max(0, Math.round((tr.adjustedTime - now) / 60000)),
              }));
            return { stopId: s.id, arrivals: arr };
          })
        );
        const map: Record<string, StopArrival[]> = {};
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') map[savedStops[i].id] = r.value.arrivals;
        });
        setArrivals(map);
        setArrivalsLoading(false);
      }

      // User location for distance
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (e) { if (__DEV__) console.warn(e); }
    } catch (e) {
      if (__DEV__) console.warn('SavedScreen loadData error:', e);
      setLoaded(true);
    }
  }, []);

  // Reload data + restart interval when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadData();

      // Auto-refresh arrivals every 30s while focused
      refreshTimer.current = setInterval(() => {
        if (stops.length > 0) {
          Promise.allSettled(
            stops.map(async s => {
              const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${s.id}`, { timeout: 8000 });
              if (!resp.ok) return { stopId: s.id, arrivals: [] as StopArrival[] };
              const data = await resp.json();
              const now = Date.now();
              return {
                stopId: s.id,
                arrivals: (data.trips || [])
                  .filter((tr: any) => tr.adjustedTime > now)
                  .slice(0, 4)
                  .map((tr: any) => ({
                    routeId: tr.routeId || tr.route || '',
                    headsign: tr.headsign || tr.destination || '',
                    minsAway: Math.max(0, Math.round((tr.adjustedTime - now) / 60000)),
                  })),
              };
            })
          ).then(results => {
            const map: Record<string, StopArrival[]> = {};
            results.forEach((r, i) => {
              if (r.status === 'fulfilled') map[stops[i].id] = r.value.arrivals;
            });
            setArrivals(map);
          });
        }
      }, 30000);

      return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    }, [loadData, stops])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const isEmpty = stops.length === 0 && places.length === 0 && !recentTrip;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: PAD, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colours.text, letterSpacing: -0.5 }}>
          {t('Saved', 'Sauvegardes')}
        </Text>
      </View>

      {!loaded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : isEmpty ? (
        /* Empty state */
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <Ionicons name="bookmark-outline" size={36} color={colours.accent} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 8 }}>
            {t('Nothing saved yet', 'Rien de sauvegarde')}
          </Text>
          <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', lineHeight: 20 }}>
            {t(
              'Search for stops, places and routes on the map to save them here.',
              'Recherchez des arrets, lieux et trajets sur la carte pour les sauvegarder ici.',
            )}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: 100 }}
        >
          {/* ── Most used stop (full width) ──────────────────── */}
          {mostUsedStop && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: mostUsedStop.id } } as any)}
              style={{
                width: FULL_W,
                height: 100,
                backgroundColor: colours.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: GAP,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colours.border,
                ...cardShadow,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, flex: 1 }} numberOfLines={1}>
                  {mostUsedStop.name}
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: TEAL + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL }} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: TEAL }}>LIVE</Text>
                </View>
              </View>
              {arrivalsLoading ? (
                <ActivityIndicator size="small" color={TEAL} style={{ alignSelf: 'flex-start' }} />
              ) : (arrivals[mostUsedStop.id] || []).length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(arrivals[mostUsedStop.id] || []).map((a, i) => (
                    <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{
                        minWidth: 40, height: 26, borderRadius: 8, paddingHorizontal: 6,
                        backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '30',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.accent }}>{a.routeId}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: a.minsAway < 2 ? TEAL : colours.text }}>
                        {a.minsAway <= 0 ? '< 1' : `${a.minsAway}m`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: colours.muted, fontStyle: 'italic' }}>
                  {t('No upcoming arrivals', 'Aucune arrivee prochaine')}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* ── Recent trip (full width) ─────────────────────── */}
          {recentTrip && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({
                pathname: '/(tabs)/planner',
                params: { fromLabel: recentTrip.fromLabel, toLabel: recentTrip.toLabel },
              } as any)}
              style={{
                width: FULL_W,
                height: 80,
                backgroundColor: colours.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: GAP,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colours.border,
                ...cardShadow,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {t('Last trip', 'Dernier trajet')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, flex: 1 }} numberOfLines={1}>
                  {recentTrip.fromLabel} → {recentTrip.toLabel}
                </Text>
                <Text style={{ fontSize: 12, color: colours.muted }}>
                  {timeAgo(recentTrip.plannedAt, t)}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Saved stops grid (half width pairs) ──────────── */}
          {stops.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              {stops
                .filter(s => !mostUsedStop || s.id !== mostUsedStop.id)
                .map(stop => {
                  const stopArrivals = arrivals[stop.id] || [];
                  return (
                    <TouchableOpacity
                      key={`stop-${stop.id}`}
                      activeOpacity={0.75}
                      onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: stop.id } } as any)}
                      style={{
                        width: HALF_W,
                        height: 120,
                        backgroundColor: colours.card,
                        borderRadius: 14,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: colours.border,
                        justifyContent: 'space-between',
                        ...cardShadow,
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text }} numberOfLines={2}>
                          {stop.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>#{stop.id}</Text>
                      </View>
                      {arrivalsLoading ? (
                        <ActivityIndicator size="small" color={TEAL} style={{ alignSelf: 'flex-start' }} />
                      ) : stopArrivals.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {stopArrivals.slice(0, 2).map((a, i) => (
                            <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <View style={{
                                minWidth: 32, height: 22, borderRadius: 6, paddingHorizontal: 4,
                                backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: colours.accent }}>{a.routeId}</Text>
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: a.minsAway < 2 ? TEAL : colours.text }}>
                                {a.minsAway <= 0 ? '<1' : `${a.minsAway}m`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: colours.muted, fontStyle: 'italic' }}>
                          {t('No arrivals', 'Aucune arrivee')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          )}

          {/* ── Saved places grid (half width pairs) ─────────── */}
          {places.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: stops.length > 0 ? GAP : 0 }}>
              {places.map(place => {
                const dist = userLoc && place.lat && place.lng
                  ? haversineKm(userLoc.lat, userLoc.lng, place.lat, place.lng)
                  : null;
                const photoUrl = place.photoRef
                  ? `https://routeo-backend.vercel.app/api/places?action=photo&ref=${place.photoRef}&maxwidth=400`
                  : null;
                return (
                  <TouchableOpacity
                    key={`place-${place.id}`}
                    activeOpacity={0.75}
                    onPress={() => router.push({
                      pathname: '/(tabs)/map',
                      params: { searchPlace: place.name, placeLat: String(place.lat || ''), placeLng: String(place.lng || '') },
                    } as any)}
                    style={{
                      width: HALF_W,
                      height: 120,
                      borderRadius: 14,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: colours.border,
                      ...cardShadow,
                    }}
                  >
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        style={{ position: 'absolute', width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: colours.card }} />
                    )}
                    {/* Dark gradient overlay — stacked bands for gradient effect */}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                      <View style={{ height: 20, backgroundColor: 'rgba(0,0,0,0.1)' }} />
                      <View style={{ height: 20, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                      <View style={{ height: 30, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                    </View>
                    {/* Category icon */}
                    {place.categoryIcon && (
                      <View style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: (place.categoryColor || TEAL) + '40',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={place.categoryIcon as any} size={12} color="#fff" />
                      </View>
                    )}
                    {/* Name + distance */}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }} numberOfLines={2}>
                        {place.name}
                      </Text>
                      {dist != null && (
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                          {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
