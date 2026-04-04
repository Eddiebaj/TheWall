import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal, Platform, RefreshControl,
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
import { SK_SAVED_PLACES, SK_TRIP_HISTORY, SK_LEAVE_NOW_ALERTS } from '../../lib/storageKeys';

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

function timeAgo(dateStr: string, t: (en: string, fr: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t(`${mins}m ago`, `il y a ${mins}m`);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t(`${hrs}h ago`, `il y a ${hrs}h`);
  const days = Math.floor(hrs / 24);
  return t(`${days}d ago`, `il y a ${days}j`);
}

function SavedScreenInner() {
  const { colours, resolvedTheme, t, fonts } = useApp();
  const { savedBoard: boardItems } = useBoard();
  const isLight = resolvedTheme === 'light';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [stops, setStops] = useState<SavedStop[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [recentTrip, setRecentTrip] = useState<TripEntry | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, StopArrival[]>>({});
  const [cachedStops, setCachedStops] = useState<Record<string, number>>({});
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [mostUsedStop, setMostUsedStop] = useState<SavedStop | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [leaveAlerts, setLeaveAlerts] = useState<Record<string, { route: string; stopId: string; time: string }>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopsRef = useRef<SavedStop[]>(stops);
  const isFetchingRef = useRef(false);
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // Load saved leave-now alerts
  useEffect(() => {
    AsyncStorage.getItem(SK_LEAVE_NOW_ALERTS).then(raw => {
      if (raw) try { setLeaveAlerts(JSON.parse(raw)); } catch {}
    }).catch(() => {});
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
          t('Could not schedule notification. Please check your notification permissions.', 'Impossible de planifier la notification. Veuillez verifier vos permissions de notification.')
        );
        return;
      }

      updated[key] = { route: routeId, stopId, time: new Date(Date.now() + notifyInMs).toISOString() };
    }

    setLeaveAlerts(updated);
    await AsyncStorage.setItem(SK_LEAVE_NOW_ALERTS, JSON.stringify(updated));
  };

  // Schedule future departure alert
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
        // Schedule recurring weekday notifications (Mon-Fri)
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
        // Schedule one-time notification
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
      setLeaveAlerts(updated as any);
      await AsyncStorage.setItem(SK_LEAVE_NOW_ALERTS, JSON.stringify(updated));
    } catch (e) {
      if (__DEV__) console.warn('Schedule notification failed:', e);
      Alert.alert(
        t('Notification Error', 'Erreur de notification'),
        t('Could not schedule notification. Please check your notification permissions.', 'Impossible de planifier la notification. Veuillez verifier vos permissions de notification.')
      );
    }
    setScheduleModal(null);
  };

  const cardShadow = isLight ? sharedCardShadow : {};

  // Shared arrival-fetching helper (L1)
  const fetchArrivalsForStops = async (savedStops: SavedStop[]): Promise<{ map: Record<string, StopArrival[]>; cached: Record<string, number> }> => {
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
    const cached: Record<string, number> = {};
    await Promise.all(results.map(async (r, i) => {
      const stopId = savedStops[i].id;
      if (r.status === 'fulfilled' && r.value.arrivals.length > 0) {
        map[stopId] = r.value.arrivals;
        cacheArrivals(stopId, { arrivals: r.value.arrivals, source: 'live', stopName: savedStops[i].name });
      } else {
        const cachedData = await getCachedArrivals(stopId);
        if (cachedData && cachedData.arrivals.length > 0) {
          map[stopId] = cachedData.arrivals;
          cached[stopId] = cachedData.cachedAt;
        } else {
          map[stopId] = [];
        }
      }
    }));
    return { map, cached };
  };

  // Load data
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

      // Fetch arrivals using shared helper
      if (savedStops.length > 0) {
        setArrivalsLoading(true);
        const { map, cached } = await fetchArrivalsForStops(savedStops);
        setArrivals(map);
        setCachedStops(cached);
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
  }, [boardItems]);

  // Reload data + restart interval when tab gains focus
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
          const { map, cached } = await fetchArrivalsForStops(currentStops);
          setArrivals(map);
          setCachedStops(cached);
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
          {/* Most used stop */}
          {mostUsedStop && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: mostUsedStop.id } })}
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
                <TouchableOpacity onPress={() => router.push(`/stop/${mostUsedStop.id}` as any)} activeOpacity={0.6} style={{ flex: 1 }}>
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
                    <Text style={{ fontSize: 10, fontWeight: '700', color: TEAL }}>Live</Text>
                  </View>
                )}
              </View>
              {arrivalsLoading ? (
                <ActivityIndicator size="small" color={TEAL} style={{ alignSelf: 'flex-start' }} />
              ) : (arrivals[mostUsedStop.id] || []).length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(arrivals[mostUsedStop.id] || []).map((a, i) => (
                    <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => router.push(`/route/${a.routeId.split('-')[0]}` as any)}
                        activeOpacity={0.6}
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
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        style={{ padding: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Set departure alert. Long press to schedule.', 'Definir une alerte. Appui long pour planifier.')}
                      >
                        <Ionicons
                          name={leaveAlerts[`${mostUsedStop.id}-${a.routeId}`] || leaveAlerts[`${mostUsedStop.id}-${a.routeId}-sched`] ? 'notifications' : 'notifications-outline'}
                          size={16}
                          color={leaveAlerts[`${mostUsedStop.id}-${a.routeId}`] || leaveAlerts[`${mostUsedStop.id}-${a.routeId}-sched`] ? '#FF9500' : colours.muted}
                        />
                      </TouchableOpacity>
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

          {/* Recent trip */}
          {recentTrip && (
            <TouchableOpacity
              activeOpacity={0.75}
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
                    <TouchableOpacity
                      key={`stop-${stop.id}`}
                      activeOpacity={0.75}
                      onPress={() => router.push({ pathname: '/(tabs)/map', params: { focusStop: stop.id } })}
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
                      <TouchableOpacity onPress={() => router.push(`/stop/${stop.id}` as any)} activeOpacity={0.6}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }} numberOfLines={2}>
                          {stop.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>#{stop.id}</Text>
                      </TouchableOpacity>
                      {arrivalsLoading ? (
                        <ActivityIndicator size="small" color={TEAL} style={{ alignSelf: 'flex-start' }} />
                      ) : stopArrivals.length > 0 ? (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {stopArrivals.slice(0, 2).map((a, i) => (
                              <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <TouchableOpacity
                                  onPress={() => router.push(`/route/${a.routeId.split('-')[0]}` as any)}
                                  activeOpacity={0.6}
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
                                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                  style={{ padding: 2 }}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('Set departure alert. Long press to schedule.', 'Definir une alerte. Appui long pour planifier.')}
                                >
                                  <Ionicons
                                    name={leaveAlerts[`${stop.id}-${a.routeId}`] || leaveAlerts[`${stop.id}-${a.routeId}-sched`] ? 'notifications' : 'notifications-outline'}
                                    size={14}
                                    color={leaveAlerts[`${stop.id}-${a.routeId}`] || leaveAlerts[`${stop.id}-${a.routeId}-sched`] ? '#FF9500' : colours.muted}
                                  />
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
                    </TouchableOpacity>
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
                    activeOpacity={0.75}
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
              {t('Bus departure time', 'Heure de depart du bus')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSchedHour(h => (h - 1 + 24) % 24)} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={colours.muted} />
              </TouchableOpacity>
              <View style={{ backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colours.border, minWidth: 60, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>{String(schedHour).padStart(2, '0')}</Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>:</Text>
              <View style={{ backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colours.border, minWidth: 60, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colours.text }}>{String(schedMin).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity onPress={() => setSchedMin(m => (m + 5) % 60)} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={colours.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSchedHour(h => (h + 1) % 24)} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={16} color={colours.muted} />
              </TouchableOpacity>
              <View style={{ width: 60 }} />
              <View style={{ width: 20 }} />
              <View style={{ width: 60 }} />
              <TouchableOpacity onPress={() => setSchedMin(m => (m - 5 + 60) % 60)} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={16} color={colours.muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: colours.muted, textAlign: 'center', marginBottom: 16 }}>
              {t('We\'ll notify you 3 min before this time', 'Nous vous alerterons 3 min avant cette heure')}
            </Text>

            {/* Recurring toggle */}
            <TouchableOpacity
              onPress={() => setSchedWeekdays(!schedWeekdays)}
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
              <TouchableOpacity onPress={() => setScheduleModal(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmScheduleAlert} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF9500', alignItems: 'center' }}>
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
