import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, Platform, Text, TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

// ── Types ──────────────────────────────────────────────────────
type WalkStep = { distance: number; relativeDirection: string; streetName: string; instruction?: string | null };
type Leg = {
  mode: string;
  startTime: number;
  endTime: number;
  duration: number;
  distance: number;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  agencyId?: string;
  routeShortName: string | null;
  routeLongName: string | null;
  headsign: string | null;
  intermediateStops: string[];
  steps: WalkStep[];
  legGeometry?: { points: string };
};
type Itinerary = {
  duration: number;
  startTime: number;
  endTime: number;
  transfers: number;
  walkDistance: number;
  legs: Leg[];
};

const LEG_COLOURS: Record<string, string> = {
  WALK: '#9aaabb', BUS: '#00A78D', TRAM: '#0057B8', RAIL: '#0057B8', SUBWAY: '#0057B8', FERRY: '#7b5ea7', CAR: '#e8a020', BICYCLE: '#34c759',
};
const LEG_ICONS: Record<string, string> = {
  WALK: 'walk', BUS: 'bus', TRAM: 'train', RAIL: 'train', SUBWAY: 'train', FERRY: 'boat', CAR: 'car', BICYCLE: 'bicycle',
};

function fmtTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m}${h >= 12 ? 'pm' : 'am'}`;
}
function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDistance(metres: number) {
  if (metres < 100) return `${Math.round(metres)}m`;
  if (metres < 1000) return `${Math.round(metres / 10) * 10}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}
function cleanStopName(name: string) {
  return name.replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, '');
}
function distMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  return Math.sqrt(
    Math.pow((lat1 - lat2) * 111000, 2) +
    Math.pow((lon1 - lon2) * 111000 * Math.cos(lat2 * Math.PI / 180), 2)
  );
}

// Decode Google-encoded polyline to coordinate array
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

// Lazy-load optional modules
let Location: any = null;
let Notifications: any = null;
let Haptics: any = null;
let RNMaps: any = null;
try { Location = require('expo-location'); } catch {}
try { Notifications = require('expo-notifications'); } catch {}
try { Haptics = require('expo-haptics'); } catch {}
try { RNMaps = require('react-native-maps'); } catch {}
const MapView = RNMaps?.default ?? null;
const Marker = (RNMaps as any)?.Marker ?? null;
const Polyline = (RNMaps as any)?.Polyline ?? null;

// ── Component ──────────────────────────────────────────────────
type ActiveTripProps = {
  visible: boolean;
  itinerary: Itinerary;
  onEnd: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  reducedMotion?: boolean;
  batterySaver?: boolean;
};

export default function ActiveTrip({ visible, itinerary, onEnd, colours, fonts, t, reducedMotion, batterySaver }: ActiveTripProps) {
  const [activeLeg, setActiveLeg] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveArrival, setLiveArrival] = useState<number | null>(null);
  const [transferWarning, setTransferWarning] = useState<string | null>(null);
  const [getOffAlert, setGetOffAlert] = useState(false);
  const [tripEnded, setTripEnded] = useState(false);
  const [altRoutes, setAltRoutes] = useState<string[]>([]);
  const [busDisappeared, setBusDisappeared] = useState(false);
  const [busDisappearedAt, setBusDisappearedAt] = useState<number | null>(null);
  const [switchedRoute, setSwitchedRoute] = useState<string | null>(null);

  const locationSubRef = useRef<any>(null);
  const arrivalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifIds = useRef<string[]>([]);
  const mapRef = useRef<any>(null);

  const legs = itinerary.legs;
  const currentLeg = legs[activeLeg];
  const nextLeg = activeLeg < legs.length - 1 ? legs[activeLeg + 1] : null;
  const isLastLeg = activeLeg === legs.length - 1;

  // ── Manual advance leg ───────────────────────────────────────
  const advanceLeg = () => {
    if (activeLeg >= legs.length - 1) return;
    setActiveLeg(prev => prev + 1);
    setGetOffAlert(false);
    setLiveArrival(null);
    setTransferWarning(null);
    setAltRoutes([]);
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Clock tick every second ──────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // ── Location tracking ────────────────────────────────────────
  useEffect(() => {
    if (!visible || !Location) return;
    let sub: any = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: batterySaver ? Location.Accuracy.Balanced : Location.Accuracy.BestForNavigation, distanceInterval: batterySaver ? 30 : 10 },
          (pos: any) => {
            const { latitude, longitude } = pos.coords;
            setUserCoords({ lat: latitude, lon: longitude });
          }
        );
        locationSubRef.current = sub;
      } catch {}
    })();
    return () => { sub?.remove(); locationSubRef.current = null; };
  }, [visible]);

  // ── Auto-advance legs based on location ──────────────────────
  useEffect(() => {
    if (!userCoords || !currentLeg) return;
    const destDist = distMetres(userCoords.lat, userCoords.lon, currentLeg.to.lat, currentLeg.to.lon);

    if (currentLeg.mode !== 'WALK' && destDist < 200 && !getOffAlert) {
      setGetOffAlert(true);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
      fireNotification(t('Get off soon', 'Descendez bientot'), t('Your stop is approaching', 'Votre arret approche'));
    }

    if (destDist < 50 && activeLeg < legs.length - 1) {
      setActiveLeg(prev => prev + 1);
      setGetOffAlert(false);
      setLiveArrival(null);
      setTransferWarning(null);
      setAltRoutes([]);
      Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isLastLeg && destDist < 60 && !tripEnded) {
      setTripEnded(true);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
      fireNotification(t('You have arrived', 'Vous etes arrive'), cleanStopName(currentLeg.to.name));
    }
  }, [userCoords, activeLeg, currentLeg]);

  // ── Poll arrivals for current transit leg ────────────────────
  const pollArrivals = useCallback(async () => {
    if (!currentLeg || currentLeg.mode === 'WALK' || currentLeg.mode === 'CAR' || currentLeg.mode === 'BICYCLE') return;
    const stopName = currentLeg.from.name;
    const routeId = switchedRoute || currentLeg.routeShortName;
    if (!routeId) return;

    try {
      const resp = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/arrivals?stop=${encodeURIComponent(stopName)}`
      );
      if (!resp.ok) return;
      const data = await resp.json();
      const arrivals = data.arrivals || [];

      // Find our tracked route's arrival
      const match = arrivals.find((a: any) =>
        String(a.routeId || a.route || '').replace(/-.*/,'') === String(routeId).replace(/-.*/,'')
      );
      if (match) {
        // Bus found — clear disappearance state
        setBusDisappeared(false);
        setBusDisappearedAt(null);
        const arrMs = match.expectedMs || match.scheduledMs || match.expected_ms || match.scheduled_ms;
        if (arrMs) {
          setLiveArrival(arrMs);
          if (nextLeg && nextLeg.mode !== 'WALK') {
            const buffer = arrMs + currentLeg.duration - nextLeg.startTime;
            const bufferMin = Math.round(buffer / 60000);
            if (bufferMin > -5 && bufferMin < 3) {
              setTransferWarning(t(
                `Transfer at risk — ${Math.abs(bufferMin)} min buffer`,
                `Correspondance a risque — ${Math.abs(bufferMin)} min de marge`
              ));
            } else {
              setTransferWarning(null);
            }
          }
        }
      } else {
        // Bus not found — 3 min grace period before warning
        const now = Date.now();
        if (!busDisappearedAt) {
          setBusDisappearedAt(now);
        } else if (now - busDisappearedAt > 180000) {
          setBusDisappeared(true);
        }
      }

      // Find alternative routes within ±5 min of planned departure
      const plannedMs = match
        ? (match.expectedMs || match.scheduledMs || match.expected_ms || match.scheduled_ms || currentLeg.startTime)
        : currentLeg.startTime;
      const destName = (currentLeg.headsign || currentLeg.to.name || '').toLowerCase();
      const windowMs = 5 * 60 * 1000;
      const alts: string[] = [];

      for (const a of arrivals) {
        const aRoute = String(a.routeId || a.route || '').replace(/-.*/,'');
        if (aRoute === String(routeId).replace(/-.*/,'')) continue;
        const aMs = a.expectedMs || a.scheduledMs || a.expected_ms || a.scheduled_ms;
        if (!aMs) continue;
        if (Math.abs(aMs - plannedMs) > windowMs) continue;
        const aHeadsign = String(a.headsign || a.destination || '').toLowerCase();
        if (aHeadsign && destName && aHeadsign.includes(destName.split('/')[0].trim().slice(0, 8))) {
          if (!alts.includes(aRoute)) alts.push(aRoute);
        }
      }
      setAltRoutes(alts);
    } catch {}
  }, [currentLeg, nextLeg, activeLeg, switchedRoute, busDisappearedAt]);

  useEffect(() => {
    if (!visible) return;
    pollArrivals();
    arrivalPollRef.current = setInterval(pollArrivals, batterySaver ? 60000 : 30000);
    return () => { if (arrivalPollRef.current) clearInterval(arrivalPollRef.current); };
  }, [visible, activeLeg, pollArrivals]);

  // ── Schedule notifications on mount ──────────────────────────
  useEffect(() => {
    if (!visible || !Notifications) return;
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: s2 } = await Notifications.requestPermissionsAsync();
          if (s2 !== 'granted') return;
        }
      } catch { return; }

      const ids: string[] = [];
      const nowMs = Date.now();

      for (const leg of legs) {
        if (leg.mode === 'WALK') continue;
        const route = leg.routeShortName ? `Route ${leg.routeShortName}` : leg.mode === 'TRAM' || leg.mode === 'RAIL' ? 'O-Train' : 'Bus';
        const stop = cleanStopName(leg.from.name);
        const headsign = leg.headsign ? ` → ${leg.headsign}` : '';

        const warnAt = leg.startTime - 2 * 60 * 1000;
        if (warnAt > nowMs) {
          try {
            const id = await Notifications.scheduleNotificationAsync({
              content: { title: `${route} in 2 min`, body: `Board at ${stop}${headsign}`, sound: true },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(warnAt) },
            });
            ids.push(id);
          } catch {}
        }
      }
      notifIds.current = ids;
    })();

    return () => {
      for (const id of notifIds.current) {
        Notifications?.cancelScheduledNotificationAsync?.(id).catch(() => {});
      }
      notifIds.current = [];
    };
  }, [visible]);

  // ── Cleanup on unmount ───────────────────────────────────────
  const handleEnd = () => {
    if (tripEnded) {
      cleanup();
      return;
    }
    Alert.alert(
      t('End trip?', 'Terminer le trajet?'),
      t('Are you sure you want to end this trip?', 'Voulez-vous vraiment terminer ce trajet?'),
      [
        { text: t('Cancel', 'Annuler'), style: 'cancel' },
        { text: t('End Trip', 'Terminer'), style: 'destructive', onPress: cleanup },
      ]
    );
  };

  const cleanup = () => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    if (arrivalPollRef.current) clearInterval(arrivalPollRef.current);
    for (const id of notifIds.current) {
      Notifications?.cancelScheduledNotificationAsync?.(id).catch(() => {});
    }
    notifIds.current = [];
    onEnd();
  };

  const fireNotification = async (title: string, body: string) => {
    if (!Notifications) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: null,
      });
    } catch {}
  };

  // ── Pulse animation for countdown <5 min ────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!currentLeg) return;
    const isTransitLeg = currentLeg.mode !== 'WALK' && currentLeg.mode !== 'CAR' && currentLeg.mode !== 'BICYCLE';
    const depMs = liveArrival || currentLeg.startTime;
    const hasDeparted = depMs <= now;
    const minLeft = Math.floor(Math.max(0, (depMs - now) / 1000) / 60);
    if (!isTransitLeg || hasDeparted || minLeft >= 5 || reducedMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [currentLeg, liveArrival, now]);

  // ── Derived values ───────────────────────────────────────────
  if (!currentLeg) return null;

  const isWalk = currentLeg.mode === 'WALK';
  const isCar = currentLeg.mode === 'CAR';
  const isBike = currentLeg.mode === 'BICYCLE';
  const isTransit = !isWalk && !isCar && !isBike;
  const legColor = LEG_COLOURS[currentLeg.mode] || '#00A78D';
  const legIcon = LEG_ICONS[currentLeg.mode] || 'bus';
  const departureMs = liveArrival || currentLeg.startTime;
  const countdownSec = Math.max(0, Math.round((departureMs - now) / 1000));
  const countdownMin = Math.floor(countdownSec / 60);
  const countdownRemSec = countdownSec % 60;
  const departed = departureMs <= now;

  // Step description
  const trackedRoute = switchedRoute || currentLeg.routeShortName;
  const routeLabel = (() => {
    if (!isTransit) return '';
    const primary = trackedRoute || 'Bus';
    if (switchedRoute) return `Route ${primary}`;
    if (altRoutes.length === 0) return currentLeg.routeShortName ? `Route ${primary}` : 'Bus';
    const all = [primary, ...altRoutes];
    if (all.length === 2) return `Route ${all[0]} ${t('or', 'ou')} ${all[1]}`;
    return `Route ${all.slice(0, -1).join(', ')}, ${t('or', 'ou')} ${all[all.length - 1]}`;
  })();
  const stepTitle = isWalk
    ? `${t('Walk to', 'Marchez vers')} ${cleanStopName(currentLeg.to.name)}`
    : isCar
    ? `${t('Drive to', 'Conduisez vers')} ${cleanStopName(currentLeg.to.name)}`
    : isBike
    ? `${t('Cycle to', 'Pedalez vers')} ${cleanStopName(currentLeg.to.name)}`
    : `${t('Board', 'Montez')} ${routeLabel} → ${currentLeg.headsign || cleanStopName(currentLeg.to.name)}`;

  const stepSubtitle = isWalk || isCar || isBike
    ? `${fmtDistance(currentLeg.distance)} · ${fmtDuration(currentLeg.duration)}`
    : `${t('From', 'De')} ${cleanStopName(currentLeg.from.name)}`;

  const nextStepTitle = nextLeg
    ? nextLeg.mode === 'WALK'
      ? `${t('Walk to', 'Marchez vers')} ${cleanStopName(nextLeg.to.name)}`
      : nextLeg.mode === 'CAR'
      ? `${t('Drive to', 'Conduisez vers')} ${cleanStopName(nextLeg.to.name)}`
      : nextLeg.mode === 'BICYCLE'
      ? `${t('Cycle to', 'Pedalez vers')} ${cleanStopName(nextLeg.to.name)}`
      : `${t('Board', 'Montez')} ${nextLeg.routeShortName ? `Route ${nextLeg.routeShortName}` : 'Bus'} → ${nextLeg.headsign || cleanStopName(nextLeg.to.name)}`
    : t('Arrive at destination', 'Arrivee a destination');

  // Advance button label
  const advanceLabel = isWalk
    ? t("I'm at the stop →", "Je suis a l'arret →")
    : isCar
    ? t('Arrived →', 'Arrive →')
    : isBike
    ? t('Arrived →', 'Arrive →')
    : t('I got off →', 'Je suis descendu →');

  // Progress
  const progressFraction = (activeLeg + 1) / legs.length;

  // Map data for current leg
  const legPolyline = currentLeg.legGeometry?.points ? decodePolyline(currentLeg.legGeometry.points) : null;
  const mapCenter = userCoords
    ? { latitude: userCoords.lat, longitude: userCoords.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: currentLeg.from.lat, longitude: currentLeg.from.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleEnd}>
      <View style={{ flex: 1, backgroundColor: '#0d1117' }}>
        {/* Safe area spacer */}
        <View style={{ height: Platform.OS === 'ios' ? 56 : 36 }} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#34c759', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="navigate" size={18} color="#fff" />
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>{t('Active Trip', 'Trajet actif')}</Text>
              <Text style={{ fontSize: 12, color: '#8b949e' }}>
                {t('Arrives', 'Arrivee')} {fmtTime(itinerary.endTime)} · {fmtDuration(itinerary.endTime - now)}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#8b949e' }}>
            {t('Leg', 'Etape')} {activeLeg + 1}/{legs.length}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={{ marginHorizontal: 20, height: 4, borderRadius: 2, backgroundColor: '#21262d', marginBottom: 16 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: '#34c759', width: `${Math.round(progressFraction * 100)}%` as any }} />
        </View>

        {/* Transfer warning */}
        {transferWarning && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e8a020' + '22', borderWidth: 1, borderColor: '#e8a020', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Ionicons name="warning" size={18} color="#e8a020" />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#e8a020' }}>{transferWarning}</Text>
          </View>
        )}

        {/* Bus disappeared from feed */}
        {busDisappeared && isTransit && !departed && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF9500' + '22', borderWidth: 1, borderColor: '#FF9500', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Ionicons name="alert-circle" size={18} color="#FF9500" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FF9500' }}>
                {t('Bus disappeared from feed', 'Bus disparu du flux')}
              </Text>
              <Text style={{ fontSize: 11, color: '#FF9500', marginTop: 2 }}>
                {t('May be cancelled or GPS lost — check alternatives below', 'Possiblement annulé ou GPS perdu — voir les alternatives')}
              </Text>
            </View>
          </View>
        )}

        {/* Get off alert */}
        {getOffAlert && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ff3b30' + '22', borderWidth: 1, borderColor: '#ff3b30', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Ionicons name="notifications" size={18} color="#ff3b30" />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: '#ff3b30' }}>
              {t('Get off soon!', 'Descendez bientot!')}
            </Text>
          </View>
        )}

        {/* Trip completed */}
        {tripEnded && (
          <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#34c759' + '22', borderWidth: 1, borderColor: '#34c759', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Ionicons name="checkmark-circle" size={18} color="#34c759" />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: '#34c759' }}>
              {t('You have arrived!', 'Vous etes arrive!')}
            </Text>
          </View>
        )}

        {/* Current step — large card */}
        <View style={{ marginHorizontal: 20, borderRadius: 16, backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', padding: 20, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: legColor + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: legColor + '55' }}>
              <Ionicons name={legIcon as any} size={22} color={legColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                {t('Now', 'Maintenant')}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', lineHeight: 22 }} numberOfLines={2}>{stepTitle}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: '#8b949e', marginBottom: altRoutes.length > 0 ? 4 : 14 }}>{stepSubtitle}</Text>
          {altRoutes.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#58a6ff', marginBottom: 8 }}>
                {t('Any of these routes work for this trip', 'Toutes ces lignes fonctionnent pour ce trajet')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {altRoutes.map(alt => (
                  <TouchableOpacity
                    key={alt}
                    onPress={() => {
                      setSwitchedRoute(alt);
                      setBusDisappeared(false);
                      setBusDisappearedAt(null);
                      setLiveArrival(null);
                      Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: switchedRoute === alt ? '#58a6ff' + '33' : '#21262d', borderWidth: 1, borderColor: switchedRoute === alt ? '#58a6ff' : '#30363d' }}
                  >
                    <Ionicons name="swap-horizontal" size={12} color="#58a6ff" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#58a6ff' }}>{t('Switch to', 'Passer au')} {alt}</Text>
                  </TouchableOpacity>
                ))}
                {switchedRoute && (
                  <TouchableOpacity
                    onPress={() => {
                      setSwitchedRoute(null);
                      setLiveArrival(null);
                      Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#21262d', borderWidth: 1, borderColor: '#30363d' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#8b949e' }}>{t('Reset', 'Réinitialiser')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Countdown — only for transit legs */}
          {isTransit && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              {departed ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#34c759' + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34c759' }} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#34c759' }}>
                    {t('Departing now', 'Depart maintenant')}
                  </Text>
                </View>
              ) : (
                <Animated.View style={{ opacity: pulseAnim }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0d419d' + '44', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Ionicons name="time-outline" size={16} color="#58a6ff" />
                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#58a6ff', fontVariant: ['tabular-nums'] }}>
                      {countdownMin}:{String(countdownRemSec).padStart(2, '0')}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#8b949e', marginLeft: 4 }}>
                      {t('until departure', 'avant le depart')}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>
          )}

          {/* Non-transit travel time */}
          {!isTransit && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: legColor + '18', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name={legIcon as any} size={16} color={legColor} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: legColor }}>
                {fmtTime(currentLeg.startTime)} → {fmtTime(currentLeg.endTime)}
              </Text>
            </View>
          )}

          {/* Intermediate stops count */}
          {isTransit && currentLeg.intermediateStops.length > 0 && (
            <Text style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>
              {currentLeg.intermediateStops.length} {t('stops', 'arrets')} → {cleanStopName(currentLeg.to.name)}
            </Text>
          )}
        </View>

        {/* Manual advance button */}
        {!isLastLeg && (
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={advanceLeg}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: legColor + '60', backgroundColor: legColor + '12' }}
              accessibilityRole="button"
              accessibilityLabel={t('Advance to next step', 'Passer a la prochaine etape')}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: legColor }}>{advanceLabel}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Next step — smaller card */}
        <View style={{ marginHorizontal: 20, borderRadius: 12, backgroundColor: '#161b22', borderWidth: 1, borderColor: '#21262d', padding: 14, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {nextLeg ? (
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: (LEG_COLOURS[nextLeg.mode] || '#555') + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={(LEG_ICONS[nextLeg.mode] || 'flag') as any} size={16} color={LEG_COLOURS[nextLeg.mode] || '#555'} />
              </View>
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#34c759' + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flag" size={16} color="#34c759" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#484f58', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#c9d1d9' }} numberOfLines={1}>{nextStepTitle}</Text>
            </View>
            {nextLeg && (
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#8b949e' }}>{fmtTime(nextLeg.startTime)}</Text>
            )}
          </View>
        </View>

        {/* Map showing current leg */}
        {MapView && (
          <View style={{ marginHorizontal: 20, height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: '#21262d' }}>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={mapCenter}
              showsUserLocation={false}
              showsCompass={false}
              showsScale={false}
              userInterfaceStyle="dark"
              onLayout={() => {
                if (legPolyline && legPolyline.length > 1) {
                  mapRef.current?.fitToCoordinates(legPolyline, {
                    edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
                    animated: false,
                  });
                }
              }}
            >
              {/* Route polyline */}
              {legPolyline && Polyline && (
                <Polyline
                  coordinates={legPolyline}
                  strokeColor={legColor}
                  strokeWidth={4}
                  lineDashPattern={isWalk ? [6, 4] : undefined}
                />
              )}

              {/* Destination marker */}
              {Marker && currentLeg.to.lat != null && currentLeg.to.lon != null && (
                <Marker
                  coordinate={{ latitude: currentLeg.to.lat, longitude: currentLeg.to.lon }}
                  anchor={{ x: 0.5, y: 1.0 }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: legColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
                    <Ionicons name="flag" size={14} color="#fff" />
                  </View>
                </Marker>
              )}

              {/* User location marker */}
              {Marker && userCoords && (
                <Marker coordinate={{ latitude: userCoords.lat, longitude: userCoords.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#007AFF', borderWidth: 3, borderColor: 'white' }} />
                </Marker>
              )}
            </MapView>
          </View>
        )}

        {/* Leg pills progress */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 4, marginBottom: 8 }}>
          {legs.map((leg, i) => {
            const color = LEG_COLOURS[leg.mode] || '#555';
            const done = i < activeLeg;
            const active = i === activeLeg;
            return (
              <View key={i} style={{ flex: 1, height: 28, borderRadius: 8, backgroundColor: done ? color : active ? color + '44' : '#21262d', borderWidth: active ? 1 : 0, borderColor: color, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Ionicons name={(LEG_ICONS[leg.mode] || 'bus') as any} size={12} color={done || active ? '#fff' : '#484f58'} />
                {leg.routeShortName && (
                  <Text style={{ fontSize: 10, fontWeight: '800', color: done || active ? '#fff' : '#484f58' }}>{leg.routeShortName}</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Live indicator */}
        {liveArrival && isTransit && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34c759' }} />
            <Text style={{ fontSize: 11, color: '#8b949e', fontWeight: '600' }}>
              {t('Live arrival data', 'Donnees en temps reel')}
            </Text>
          </View>
        )}

        {/* End trip button */}
        <View style={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
          <TouchableOpacity
            onPress={handleEnd}
            style={{
              height: 52, borderRadius: 12,
              backgroundColor: tripEnded ? '#34c759' : '#ff3b30',
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel={tripEnded ? t('Done', 'Terminer') : t('End trip', 'Terminer le trajet')}
          >
            <Ionicons name={tripEnded ? 'checkmark-circle' : 'stop-circle'} size={20} color="#fff" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
              {tripEnded ? t('Done', 'Terminer') : t('End Trip', 'Terminer le trajet')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
