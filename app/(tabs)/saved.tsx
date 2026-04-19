import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Image, Modal, RefreshControl,
  ScrollView, StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary';
import { hapticLight, hapticSuccess } from '../../lib/haptics';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { haversineKm } from '../../lib/geo';
import { cardShadow as sharedCardShadow } from '../../lib/styles';
import { cacheArrivals, getCachedArrivals } from '../../lib/arrivalCache';
import { SK_SAVED_PLACES, SK_TRIP_HISTORY, SK_LEAVE_NOW_ALERTS, SK_ARRIVAL_CACHE } from '../../lib/storageKeys';
import { trackEvent } from '../../lib/analytics';
import { useIsPremium } from '../../lib/premium';
import { PREMIUM_ENABLED } from '../../lib/flags';

const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const TEAL = '#00A78D';
const { width: SCREEN_W } = Dimensions.get('window');
const PAD = 16;
const GAP = 8;
const HALF_W = (SCREEN_W - PAD * 2 - GAP) / 2;
const FULL_W = SCREEN_W - PAD * 2;

/* ── Skeleton pulse placeholder ── */
function SkeletonPulse({ width, height, borderRadius = 8, color, style }: {
  width: number | string; height: number; borderRadius?: number; color: string; style?: any;
}) {
  const opacity = React.useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: color, opacity }, style]}
    />
  );
}

type SavedStop = { id: string; name: string; agency?: string };
type SavedPlace = {
  id: string; name: string; vicinity?: string; photoRef?: string;
  categoryIcon?: string; categoryColor?: string;
  categoryLabel_en?: string; categoryLabel_fr?: string;
  lat?: number; lng?: number;
};
type TripEntry = { fromLabel: string; toLabel: string; plannedAt: string; durationMins?: number; routes?: string[] };
type StopArrival = { routeId: string; headsign: string; minsAway: number; confidence?: 'live' | 'scheduled' | 'rider-verified' };
type GhostAlert = { vanishedRoutes: { routeId: string }[]; nextAlternative: { routeId: string; minsAway: number; headsign: string } | null };
type RouteReliability = { onTimePercent: number; avgDelay: number; sampleSize: number };

function timeAgo(dateStr: string, t: (en: string, fr: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t(`${mins}m ago`, `il y a ${mins}m`);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t(`${hrs}h ago`, `il y a ${hrs}h`);
  const days = Math.floor(hrs / 24);
  return t(`${days}d ago`, `il y a ${days}j`);
}

function reliabilityColor(pct: number): string {
  if (pct >= 80) return '#27AE60';
  if (pct >= 60) return '#F59E0B';
  return '#EF4444';
}

function SavedScreenInner() {
  const { colours, resolvedTheme, t, fonts } = useApp();
  const { savedBoard: boardItems } = useBoard();
  const isLight = resolvedTheme === 'light';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isPremium = useIsPremium();

  const [stops, setStops] = useState<SavedStop[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [recentTrip, setRecentTrip] = useState<TripEntry | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, StopArrival[]>>({});
  const [cachedStops, setCachedStops] = useState<Record<string, number>>({});
  const [ghostAlerts, setGhostAlerts] = useState<Record<string, GhostAlert>>({});
  const [reliability, setReliability] = useState<Record<string, Record<string, RouteReliability>>>({});
  const [expandedReliability, setExpandedReliability] = useState<string | null>(null);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [mostUsedStop, setMostUsedStop] = useState<SavedStop | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [serviceAlerts, setServiceAlerts] = useState<{ id: number; title: string; routes: string[]; category: string }[]>([]);
  const [leaveAlerts, setLeaveAlerts] = useState<Record<string, { route: string; stopId: string; time: string; recurring?: boolean }>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopsRef = useRef<SavedStop[]>(stops);
  const isFetchingRef = useRef(false);
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  useEffect(() => {
    AsyncStorage.getItem(SK_LEAVE_NOW_ALERTS).then(raw => {
      if (raw) try { setLeaveAlerts(JSON.parse(raw)); } catch {}
    }).catch(() => {});
  }, []);

  // Instant cache hydration — show last-known arrivals before network fetch
  const cacheHydrated = useRef(false);
  useEffect(() => {
    if (cacheHydrated.current) return;
    cacheHydrated.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SK_ARRIVAL_CACHE);
        if (!raw) return;
        const cache: Record<string, { arrivals: StopArrival[]; cachedAt: number }> = JSON.parse(raw);
        const map: Record<string, StopArrival[]> = {};
        const cached: Record<string, number> = {};
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        for (const [stopId, entry] of Object.entries(cache)) {
          if (entry.cachedAt > fiveMinAgo && entry.arrivals?.length > 0) {
            map[stopId] = entry.arrivals;
            cached[stopId] = entry.cachedAt;
          }
        }
        if (Object.keys(map).length > 0) {
          setArrivals(prev => Object.keys(prev).length === 0 ? map : prev);
          setCachedStops(prev => Object.keys(prev).length === 0 ? cached : prev);
        }
      } catch {}
    })();
  }, []);

  const toggleLeaveAlert = async (stopId: string, routeId: string, minsAway: number) => {
    hapticLight();
    const key = `${stopId}-${routeId}`;
    const updated = { ...leaveAlerts };

    if (updated[key]) {
      delete updated[key];
    } else {
      const notifyInMs = Math.max(0, (minsAway - 3)) * 60000;

      try {
        const Notifs = require('expo-notifications');
        await Notifs.scheduleNotificationAsync({
          content: {
            title: t(`Route ${routeId} arriving soon`, `Route ${routeId} arrive bientot`),
            body: t(`Leave now to catch Route ${routeId}`, `Partez maintenant pour prendre la route ${routeId}`),
            data: { type: 'leave_now', stopId, routeId },
            sound: 'default',
          },
          trigger: { seconds: Math.max(30, Math.floor(notifyInMs / 1000)) },
        });
      } catch (e) {
        if (__DEV__) console.warn('Notification scheduling failed:', e);
        Alert.alert(
          t('Notification Error', 'Erreur de notification'),
          t('Notification permission needed', 'Permission de notification requise')
        );
        return;
      }

      updated[key] = { route: routeId, stopId, time: new Date(Date.now() + notifyInMs).toISOString() };
    }

    setLeaveAlerts(updated);
    await AsyncStorage.setItem(SK_LEAVE_NOW_ALERTS, JSON.stringify(updated));
  };

  const [scheduleModal, setScheduleModal] = useState<{ stopId: string; stopName: string; routeId: string } | null>(null);
  const [schedHour, setSchedHour] = useState(8);
  const [schedMin, setSchedMin] = useState(0);
  const [schedWeekdays, setSchedWeekdays] = useState(false);

  const openScheduleModal = (stopId: string, stopName: string, routeId: string) => {
    const now = new Date();
    setSchedHour(now.getHours());
    setSchedMin(Math.ceil(now.getMinutes() / 5) * 5 % 60);
    setSchedWeekdays(false);
    setScheduleModal({ stopId, stopName, routeId });
  };

  const confirmScheduleAlert = async () => {
    if (!scheduleModal) return;
    const { stopId, routeId } = scheduleModal;
    try {
      const Notifs = require('expo-notifications');

      if (schedWeekdays) {
        for (let dayOfWeek = 2; dayOfWeek <= 6; dayOfWeek++) {
          await Notifs.scheduleNotificationAsync({
            content: {
              title: t(`Time to catch Route ${routeId}`, `C'est l'heure de prendre la route ${routeId}`),
              body: t(`Leave now for your ${schedHour}:${String(schedMin).padStart(2, '0')} bus`, `Partez maintenant pour votre bus de ${schedHour}:${String(schedMin).padStart(2, '0')}`),
              data: { type: 'leave_now_scheduled', stopId, routeId },
              sound: 'default',
            },
            trigger: { type: Notifs.SchedulableTriggerInputTypes.WEEKLY, weekday: dayOfWeek, hour: schedHour, minute: Math.max(0, schedMin - 3) },
          });
        }
      } else {
        const target = new Date();
        target.setHours(schedHour, Math.max(0, schedMin - 3), 0, 0);
        if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);

        await Notifs.scheduleNotificationAsync({
          content: {
            title: t(`Time to catch Route ${routeId}`, `C'est l'heure de prendre la route ${routeId}`),
            body: t(`Leave now for your ${schedHour}:${String(schedMin).padStart(2, '0')} bus`, `Partez maintenant pour votre bus de ${schedHour}:${String(schedMin).padStart(2, '0')}`),
            data: { type: 'leave_now_scheduled', stopId, routeId },
            sound: 'default',
          },
          trigger: { type: Notifs.SchedulableTriggerInputTypes.DATE, date: target },
        });
      }

      hapticSuccess();
      const key = `${stopId}-${routeId}-sched`;
      const updated = {
        ...leaveAlerts,
        [key]: { route: routeId, stopId, time: `${schedHour}:${String(schedMin).padStart(2, '0')}`, recurring: schedWeekdays },
      };
      setLeaveAlerts(updated);
      await AsyncStorage.setItem(SK_LEAVE_NOW_ALERTS, JSON.stringify(updated));
    } catch (e) {
      if (__DEV__) console.warn('Schedule notification failed:', e);
      Alert.alert(
        t('Notification Error', 'Erreur de notification'),
        t('Notification permission needed', 'Permission de notification requise')
      );
    }
    setScheduleModal(null);
  };

  const ghostAlertKeys = useMemo(() => Object.keys(ghostAlerts).sort().join(','), [ghostAlerts]);
  useEffect(() => {
    if (ghostAlertKeys.length > 0) {
      trackEvent('ghost_alert_shown');
    }
  }, [ghostAlertKeys]);

  const cardShadow = isLight ? sharedCardShadow : {};

  const fetchArrivalsForStops = async (savedStops: SavedStop[]): Promise<{ map: Record<string, StopArrival[]>; cached: Record<string, number>; ghosts: Record<string, GhostAlert>; rel: Record<string, Record<string, RouteReliability>> }> => {
    const map: Record<string, StopArrival[]> = {};
    const cached: Record<string, number> = {};
    const ghosts: Record<string, GhostAlert> = {};
    const rel: Record<string, Record<string, RouteReliability>> = {};
    try {
      const chunks: SavedStop[][] = [];
      for (let i = 0; i < savedStops.length; i += 10) {
        chunks.push(savedStops.slice(i, i + 10));
      }
      const allResults: any[] = [];
      const responses = await Promise.all(
        chunks.map(chunk => {
          const ids = chunk.map(s => s.id).join(',');
          const premiumParam = (PREMIUM_ENABLED && isPremium) || !PREMIUM_ENABLED ? 'true' : 'false';
          return fetchWithTimeout(`${BACKEND_URL}?stops=${ids}&premium=${premiumParam}`, { timeout: 12000 }).then(r => r.ok ? r.json() : null);
        })
      );
      for (const data of responses) {
        if (data?.results) allResults.push(...data.results);
      }
      const results = allResults;
      for (const result of results) {
        const stopId = String(result.stop);
        const arr: StopArrival[] = (result.arrivals || []).slice(0, 4).map((a: any) => ({
          routeId: a.routeId || '',
          headsign: a.headsign || '',
          minsAway: typeof a.minsAway === 'number' ? a.minsAway : 0,
          confidence: a.confidence || 'scheduled',
        }));
        if (arr.length > 0) {
          map[stopId] = arr;
          const name = savedStops.find(s => s.id === stopId)?.name || '';
          cacheArrivals(stopId, { arrivals: arr, source: 'live', stopName: name });
        }
        if (result.ghostAlert) ghosts[stopId] = result.ghostAlert;
        if (result.reliability) rel[stopId] = result.reliability;
      }
    } catch (e) {
      if (__DEV__) console.warn('Batch arrivals failed:', e);
    }
    await Promise.all(savedStops.map(async s => {
      if (map[s.id]) return;
      const cachedData = await getCachedArrivals(s.id);
      if (cachedData && cachedData.arrivals.length > 0) {
        map[s.id] = cachedData.arrivals;
        cached[s.id] = cachedData.cachedAt;
      } else {
        map[s.id] = [];
      }
    }));
    return { map, cached, ghosts, rel };
  };

  const loadData = useCallback(async () => {
    try {
      const [placesRaw, tripRaw] = await Promise.all([
        AsyncStorage.getItem(SK_SAVED_PLACES),
        AsyncStorage.getItem(SK_TRIP_HISTORY),
      ]);

      const savedStops: SavedStop[] = [];
      for (const item of boardItems) {
        if (item.type === 'bus_stop' || item.type === 'lrt_station') {
          savedStops.push({ id: item.id, name: item.name || `Stop #${item.id}`, agency: item.agency });
        }
      }
      setStops(savedStops);

      if (placesRaw) {
        try { setPlaces(JSON.parse(placesRaw)); } catch (e) { if (__DEV__) console.warn(e); }
      }

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

      if (savedStops.length > 0) {
        setArrivalsLoading(true);
        const { map, cached, ghosts, rel } = await fetchArrivalsForStops(savedStops);
        setArrivals(map);
        setCachedStops(cached);
        setGhostAlerts(ghosts);
        setReliability(rel);
        setArrivalsLoading(false);
        trackEvent('arrival_viewed');

        // Fetch service alerts relevant to saved routes
        try {
          const alertResp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/alerts', { timeout: 10000 });
          if (alertResp.ok) {
            const alertData = await alertResp.json();
            const allAlerts = alertData.alerts || [];
            const savedRouteIds = new Set(
              Object.values(map).flat().map((a: any) => a.routeId.split('-')[0])
            );
            const relevant = allAlerts.filter((a: any) =>
              a.routes?.some((r: string) => savedRouteIds.has(r))
            );
            setServiceAlerts(relevant);
          }
        } catch (e) { if (__DEV__) console.warn('alert fetch failed:', e); }
      }

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
  }, [boardItems]);

  useFocusEffect(
    useCallback(() => {
      loadData();

      // Auto-refresh arrivals every 30s while focused (with race guard)
      refreshTimer.current = setInterval(async () => {
        if (isFetchingRef.current) return;
        const currentStops = stopsRef.current;
        if (currentStops.length === 0) return;
        isFetchingRef.current = true;
        try {
          const { map, cached, ghosts, rel } = await fetchArrivalsForStops(currentStops);
          setArrivals(map);
          setCachedStops(cached);
          setGhostAlerts(ghosts);
          setReliability(rel);
        } finally {
          isFetchingRef.current = false;
        }
      }, 30000);

      return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const isEmpty = stops.length === 0 && places.length === 0 && !recentTrip;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: PAD, paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '700', color: colours.text }}>
          {t('My Favourites', 'Mes favoris')}
        </Text>
      </View>

      {/* Stale data warning — shown when cached arrivals are >3 min old */}
      {loaded && Object.keys(cachedStops).length > 0 && (() => {
        const oldestMs = Math.min(...Object.values(cachedStops));
        const staleMin = Math.round((Date.now() - oldestMs) / 60000);
        return staleMin >= 3 ? (
          <View style={{ marginHorizontal: PAD, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.warnBg || '#ff9f0a18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="time-outline" size={15} color={colours.orange || '#ff9f0a'} />
            <Text style={{ flex: 1, fontSize: 12, color: colours.orange || '#ff9f0a', fontWeight: '600' }}>
              {t(`Arrivals last updated ${staleMin}m ago — pull to refresh`, `Arrivees mises a jour il y a ${staleMin}m — tirez pour actualiser`)}
            </Text>
          </View>
        ) : null;
      })()}

      {!loaded ? (
        <View style={{ flex: 1, paddingHorizontal: PAD, paddingTop: 12 }}>
          {/* Skeleton: most-used stop card */}
          <View style={{
            width: FULL_W, height: 100, borderRadius: 16, padding: 16,
            backgroundColor: colours.card, borderWidth: 1, borderColor: colours.border,
            marginBottom: GAP,
          }}>
            <SkeletonPulse width={140} height={14} borderRadius={6} color={colours.border} />
            <SkeletonPulse width={200} height={12} borderRadius={6} color={colours.border} style={{ marginTop: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
              <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
              <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
            </View>
          </View>
          {/* Skeleton: two half-width grid cards */}
          <View style={{ flexDirection: 'row', gap: GAP }}>
            {[0, 1].map(i => (
              <View key={i} style={{
                width: HALF_W, height: 120, borderRadius: 16, padding: 14,
                backgroundColor: colours.card, borderWidth: 1, borderColor: colours.border,
              }}>
                <SkeletonPulse width={100} height={12} borderRadius={6} color={colours.border} />
                <SkeletonPulse width={60} height={10} borderRadius={4} color={colours.border} style={{ marginTop: 8 }} />
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                  <SkeletonPulse width={36} height={18} borderRadius={6} color={colours.border} />
                  <SkeletonPulse width={36} height={18} borderRadius={6} color={colours.border} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : isEmpty ? (
        /* Empty state */
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Ionicons name="bookmark-outline" size={40} color={colours.muted} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
            {t('Add stops from the map to see live arrivals here', 'Ajoutez des arrets depuis la carte pour voir les arrivees ici')}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: insets.bottom + 100 }}
        >
          {/* Service alert banner */}
          {serviceAlerts.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/alerts' as any)}
              accessibilityRole="button"
              accessibilityLabel={t(`${serviceAlerts.length} service alerts affecting your routes`, `${serviceAlerts.length} alertes affectant vos lignes`)}
              style={{
                width: FULL_W, flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: isLight ? '#FEE2E2' : colours.errorBg,
                borderRadius: 12, padding: 12, marginBottom: GAP,
                borderWidth: 1, borderColor: isLight ? '#FECACA' : colours.red + '44',
              }}
            >
              <Ionicons name="alert-circle" size={20} color={colours.red} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.red }}>
                  {serviceAlerts.length} {serviceAlerts.length === 1
                    ? t('alert on your routes', 'alerte sur vos lignes')
                    : t('alerts on your routes', 'alertes sur vos lignes')}
                </Text>
                <Text style={{ fontSize: 11, color: isLight ? '#991B1B' : colours.muted, marginTop: 1 }} numberOfLines={1}>
                  {serviceAlerts[0].title}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colours.red} />
            </TouchableOpacity>
          )}

          {/* Most used stop */}
          {mostUsedStop && (
            <View
              accessibilityRole="button"
              accessibilityLabel={t(`Stop ${mostUsedStop.id}`, `Arr\u00eat ${mostUsedStop.id}`)}
              style={{
                width: FULL_W,
                minHeight: 100,
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
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: mostUsedStop.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}
              >
                <TouchableOpacity onPress={() => router.push(`/stop/${mostUsedStop.id}` as any)} activeOpacity={0.7} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t('View stop details', 'Voir les d\u00e9tails de l\'arr\u00eat')}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                    {mostUsedStop.name}
                  </Text>
                </TouchableOpacity>
                {cachedStops[mostUsedStop.id] ? (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, fontStyle: 'italic' }}>
                    {t('Cached', 'En cache')} {'\u2022'} {Math.max(1, Math.round((Date.now() - cachedStops[mostUsedStop.id]) / 60000))}m {t('ago', 'pass.')}
                  </Text>
                ) : (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: TEAL + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL }} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: TEAL }}>{t('Live', 'Direct')}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {arrivalsLoading ? (
                <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start' }}>
                  <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
                  <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
                  <SkeletonPulse width={48} height={22} borderRadius={8} color={colours.border} />
                </View>
              ) : (arrivals[mostUsedStop.id] || []).length > 0 ? (
                <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(arrivals[mostUsedStop.id] || []).map((a, i) => (
                    <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => router.push(`/route/${a.routeId.split('-')[0]}` as any)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t(`Route ${a.routeId}`, `Route ${a.routeId}`)}
                        style={{
                          minWidth: 40, height: 26, borderRadius: 8, paddingHorizontal: 6,
                          backgroundColor: colours.tintBg, borderWidth: 1, borderColor: colours.border,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>{a.routeId}</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: a.minsAway < 2 ? TEAL : colours.text }}>
                        {a.minsAway <= 0 ? '< 1' : `${a.minsAway}m`}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleLeaveAlert(mostUsedStop.id, a.routeId, a.minsAway)}
                        onLongPress={() => openScheduleModal(mostUsedStop.id, mostUsedStop.name, a.routeId)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Set departure alert. Hold for schedule.', 'D\u00e9finir une alerte. Maintenir pour planifier.')}
                      >
                        <Ionicons
                          name={leaveAlerts[`${mostUsedStop.id}-${a.routeId}`] || leaveAlerts[`${mostUsedStop.id}-${a.routeId}-sched`] ? 'notifications' : 'notifications-outline'}
                          size={16}
                          color={leaveAlerts[`${mostUsedStop.id}-${a.routeId}`] || leaveAlerts[`${mostUsedStop.id}-${a.routeId}-sched`] ? '#FF9500' : colours.muted}
                        />
                        <Ionicons name="calendar-outline" size={10} color={colours.muted} />
                      </TouchableOpacity>
                      {reliability[mostUsedStop.id]?.[a.routeId] && reliability[mostUsedStop.id][a.routeId].sampleSize >= 10 && (
                        <TouchableOpacity
                          onPress={() => { hapticLight(); trackEvent('reliability_tapped'); setExpandedReliability(prev => prev === `${mostUsedStop.id}-${a.routeId}` ? null : `${mostUsedStop.id}-${a.routeId}`); }}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          style={{ padding: 2 }}
                          accessibilityRole="button"
                          accessibilityLabel={t('Show reliability info', 'Voir la fiabilit\u00e9')}
                        >
                          <Ionicons name="information-circle-outline" size={15} color={colours.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {(arrivals[mostUsedStop.id] || []).map(a => {
                    const rKey = `${mostUsedStop.id}-${a.routeId}`;
                    const rel = reliability[mostUsedStop.id]?.[a.routeId];
                    if (expandedReliability !== rKey || !rel || rel.sampleSize < 10) return null;
                    const clr = reliabilityColor(rel.onTimePercent);
                    return (
                      <View key={`rel-${rKey}`} style={{ backgroundColor: clr + '10', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4, width: '100%' }}>
                        <Text style={{ fontSize: 11, color: colours.text }}>
                          {t(
                            `Route ${a.routeId} was on time ${rel.onTimePercent}% of the time over ${rel.sampleSize} observations in the last 30 days. Average delay: ${rel.avgDelay > 0 ? '+' : ''}${rel.avgDelay} min.`,
                            `Route ${a.routeId} : à l'heure ${rel.onTimePercent}% du temps sur ${rel.sampleSize} observations (30 jours). Retard moyen : ${rel.avgDelay > 0 ? '+' : ''}${rel.avgDelay} min.`
                          )}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: colours.muted, fontStyle: 'italic' }}>
                  {t('No upcoming arrivals', 'Aucune arrivee prochaine')}
                </Text>
              )}
            </View>
          )}

          {/* Ghost bus alerts */}
          {Object.entries(ghostAlerts).map(([sid, alert]) => {
            const vanished = alert.vanishedRoutes?.map(v => v.routeId).join(', ') || '?';
            const alt = alert.nextAlternative;
            const stopName = stops.find(s => s.id === sid)?.name || `#${sid}`;
            return (
              <View key={`ghost-${sid}`} style={{ width: FULL_W, backgroundColor: isLight ? '#FEF3C7' : colours.surface, borderRadius: 12, padding: 12, marginBottom: GAP, borderWidth: 1, borderColor: isLight ? colours.warn + '44' : colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="warning" size={14} color={isLight ? '#D97706' : colours.warn} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colours.warnText }}>
                    {t('Bus may not be coming', 'Le bus pourrait ne pas venir')}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: isLight ? '#78350F' : colours.muted }}>
                  {t(
                    `Route ${vanished} at ${stopName} dropped off the tracker.`,
                    `La route ${vanished} \u00e0 ${stopName} a disparu du suivi.`
                  )}
                </Text>
                {alt ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push(`/route/${alt.routeId}` as any)}
                    accessibilityRole="link"
                    accessibilityLabel={t(
                      `Next option: Route ${alt.routeId} in ${alt.minsAway} min`,
                      `Prochaine option : route ${alt.routeId} dans ${alt.minsAway} min`
                    )}
                  >
                    <Text style={{ fontSize: 11, color: isLight ? '#D97706' : colours.warn, fontWeight: '600', marginTop: 4 }}>
                      {t(
                        `Next option: Route ${alt.routeId} in ${alt.minsAway} min \u2192`,
                        `Prochaine option : route ${alt.routeId} dans ${alt.minsAway} min \u2192`
                      )}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          {/* Recent trip */}
          {recentTrip && (
            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('Repeat trip', 'R\u00e9p\u00e9ter le trajet')}
              onPress={() => router.push({
                pathname: '/(tabs)/planner',
                params: { fromLabel: recentTrip.fromLabel, toLabel: recentTrip.toLabel },
              })}
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
              <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>
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

          {/* Saved stops grid */}
          {stops.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              {stops
                .filter(s => !mostUsedStop || s.id !== mostUsedStop.id)
                .map(stop => {
                  const stopArrivals = arrivals[stop.id] || [];
                  return (
                    <View
                      key={`stop-${stop.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t(`Stop ${stop.id}`, `Arr\u00eat ${stop.id}`)}
                      style={{
                        width: HALF_W,
                        height: 120,
                        backgroundColor: colours.card,
                        borderRadius: 16,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: colours.border,
                        justifyContent: 'space-between',
                        ...cardShadow,
                      }}
                    >
                      <TouchableOpacity onPress={() => router.push(`/stop/${stop.id}` as any)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('View stop details', 'Voir les d\u00e9tails de l\'arr\u00eat')}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }} numberOfLines={2}>
                          {stop.name}
                        </Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: stop.id } })} activeOpacity={0.7}>
                          <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>#{stop.id}</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {arrivalsLoading ? (
                        <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }}>
                          <SkeletonPulse width={36} height={18} borderRadius={6} color={colours.border} />
                          <SkeletonPulse width={36} height={18} borderRadius={6} color={colours.border} />
                        </View>
                      ) : stopArrivals.length > 0 ? (
                        <View accessibilityLiveRegion="polite">
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {stopArrivals.slice(0, 2).map((a, i) => (
                              <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <TouchableOpacity
                                  onPress={() => router.push(`/route/${a.routeId.split('-')[0]}` as any)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                  accessibilityRole="button"
                                  accessibilityLabel={t(`Route ${a.routeId}`, `Route ${a.routeId}`)}
                                  style={{
                                    minWidth: 32, height: 22, borderRadius: 6, paddingHorizontal: 4,
                                    backgroundColor: colours.tintBg, alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>{a.routeId}</Text>
                                </TouchableOpacity>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: a.minsAway < 2 ? TEAL : colours.text }}>
                                  {a.minsAway <= 0 ? '<1' : `${a.minsAway}m`}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => toggleLeaveAlert(stop.id, a.routeId, a.minsAway)}
                                  onLongPress={() => openScheduleModal(stop.id, stop.name, a.routeId)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2 }}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('Set departure alert. Hold for schedule.', 'D\u00e9finir une alerte. Maintenir pour planifier.')}
                                >
                                  <Ionicons
                                    name={leaveAlerts[`${stop.id}-${a.routeId}`] || leaveAlerts[`${stop.id}-${a.routeId}-sched`] ? 'notifications' : 'notifications-outline'}
                                    size={14}
                                    color={leaveAlerts[`${stop.id}-${a.routeId}`] || leaveAlerts[`${stop.id}-${a.routeId}-sched`] ? '#FF9500' : colours.muted}
                                  />
                                  <Ionicons name="calendar-outline" size={9} color={colours.muted} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                          {cachedStops[stop.id] && (
                            <Text style={{ fontSize: 9, color: colours.muted, fontStyle: 'italic', marginTop: 3 }}>
                              {t('Cached', 'En cache')} {'\u2022'} {Math.max(1, Math.round((Date.now() - cachedStops[stop.id]) / 60000))}m {t('ago', 'pass.')}
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: colours.muted, fontStyle: 'italic' }}>
                          {t('No arrivals', 'Aucune arrivee')}
                        </Text>
                      )}
                    </View>
                  );
                })}
            </View>
          )}

          {/* Saved places grid */}
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
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={place.name}
                    onPress={() => router.push({
                      pathname: '/(tabs)/map',
                      params: { searchPlace: place.name, placeLat: String(place.lat || ''), placeLng: String(place.lng || '') },
                    })}
                    style={{
                      width: HALF_W,
                      height: 120,
                      borderRadius: 16,
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

      {/* Schedule Future Alert Modal */}
      <Modal visible={!!scheduleModal} transparent animationType="fade" onRequestClose={() => setScheduleModal(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setScheduleModal(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colours.card, borderRadius: 20, padding: 24, width: SCREEN_W - 48, borderWidth: 1, borderColor: colours.border }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 4 }}>
              {t('Schedule Alert', 'Planifier une alerte')}
            </Text>
            <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16 }}>
              {t(`Notify me to catch Route ${scheduleModal?.routeId}`, `M'alerter pour la route ${scheduleModal?.routeId}`)}
            </Text>

            {/* Time picker — hour + minute */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 8 }}>
              {t('Bus departure time', 'Heure de d\u00e9part du bus')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSchedHour(h => (h + 1) % 24)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Increase hour', 'Augmenter l\'heure')} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={colours.muted} />
              </TouchableOpacity>
              <View style={{ backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colours.border, minWidth: 60, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>{String(schedHour).padStart(2, '0')}</Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>:</Text>
              <View style={{ backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colours.border, minWidth: 60, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>{String(schedMin).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity onPress={() => setSchedMin(m => (m + 5) % 60)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Increase minute', 'Augmenter les minutes')} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={colours.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSchedHour(h => (h - 1 + 24) % 24)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Decrease hour', 'Diminuer l\'heure')} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={16} color={colours.muted} />
              </TouchableOpacity>
              <View style={{ width: 60 }} />
              <View style={{ width: 20 }} />
              <View style={{ width: 60 }} />
              <TouchableOpacity onPress={() => setSchedMin(m => (m - 5 + 60) % 60)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Decrease minute', 'Diminuer les minutes')} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={16} color={colours.muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: colours.muted, textAlign: 'center', marginBottom: 16 }}>
              {t('We\'ll notify you 3 min before this time', 'Nous vous alerterons 3 min avant cette heure')}
            </Text>

            {/* Recurring toggle */}
            <TouchableOpacity
              onPress={() => setSchedWeekdays(!schedWeekdays)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: schedWeekdays }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: schedWeekdays ? '#FF9500' + '15' : colours.surface, borderWidth: 1, borderColor: schedWeekdays ? '#FF9500' + '40' : colours.border, marginBottom: 20 }}
            >
              <Ionicons name={schedWeekdays ? 'checkbox' : 'square-outline'} size={20} color={schedWeekdays ? '#FF9500' : colours.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{t('Every weekday', 'Chaque jour de semaine')}</Text>
                <Text style={{ fontSize: 11, color: colours.muted }}>{t('Mon-Fri recurring alert', 'Alerte r\u00e9currente lun-ven')}</Text>
              </View>
            </TouchableOpacity>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setScheduleModal(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('Cancel', 'Annuler')} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmScheduleAlert} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('Schedule', 'Planifier')} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF9500', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('Schedule', 'Planifier')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function SavedScreen() {
  const { colours, fonts } = useApp();
  return (
    <ScreenErrorBoundary colours={colours} fonts={fonts}>
      <SavedScreenInner />
    </ScreenErrorBoundary>
  );
}
