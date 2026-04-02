import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Modal, Platform, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { toTitleCase, decodePolyline } from '../lib/utils';

// ── Types ──────────────────────────────────────────────────────
type WalkStep = { distance: number; relativeDirection: string; streetName: string; instruction?: string | null };
type Leg = {
  mode: string;
  startTime: number;
  endTime: number;
  duration: number;
  distance: number;
  from: { name: string; lat: number; lon: number; stopCode?: string | null; stopId?: string | null };
  to: { name: string; lat: number; lon: number; stopCode?: string | null; stopId?: string | null };
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
  return toTitleCase(name.replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, ''));
}
function distMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  return Math.sqrt(
    Math.pow((lat1 - lat2) * 111000, 2) +
    Math.pow((lon1 - lon2) * 111000 * Math.cos(lat2 * Math.PI / 180), 2)
  );
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
  t: (en: string, fr: string) => string;
  reducedMotion?: boolean;
  batterySaver?: boolean;
  alerts?: { routes: string[]; title: string; description?: string }[];
  onConfirmArrival?: (routeId: string, stopId: string) => void;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function ActiveTrip({ visible, itinerary, onEnd, colours, t, reducedMotion, batterySaver, alerts, onConfirmArrival }: ActiveTripProps) {
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
  const [pollFailCount, setPollFailCount] = useState(0);
  const [busPosition, setBusPosition] = useState<{ lat: number; lng: number; routeId: string; agency: string } | null>(null);
  const [stopsExpanded, setStopsExpanded] = useState(false);
  const [liveEta, setLiveEta] = useState<number | null>(null);

  const locationSubRef = useRef<any>(null);
  const arrivalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifIds = useRef<string[]>([]);
  const notificationFired = useRef(false);
  const getOffAlertFired = useRef(false);
  const mapRef = useRef<any>(null);

  const legs = itinerary.legs;
  const currentLeg = legs[activeLeg];
  const nextLeg = activeLeg < legs.length - 1 ? legs[activeLeg + 1] : null;
  const isLastLeg = activeLeg === legs.length - 1;

  // ── Manual advance leg ───────────────────────────────────────
  const advanceLeg = () => {
    if (activeLeg >= legs.length - 1) return;
    // If advancing from walk to bus leg ("I'm at the stop"), confirm arrival
    const cl = legs[activeLeg];
    const nl = legs[activeLeg + 1];
    if (cl.mode === 'WALK' && nl && nl.mode === 'BUS' && nl.routeShortName && onConfirmArrival) {
      // Use the bus leg's boarding stop code (preferred) or fall back to stop ID / name
      const stopIdentifier = nl.from.stopCode || (nl.from.stopId ? nl.from.stopId.replace(/^2:/, '') : null) || cl.to.name || '';
      onConfirmArrival(nl.routeShortName, stopIdentifier);
    }
    setActiveLeg(prev => prev + 1);
    setGetOffAlert(false);
    setLiveArrival(null);
    setTransferWarning(null);
    setAltRoutes([]);
    getOffAlertFired.current = false;
    notificationFired.current = false;
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Reset notification refs when a new trip starts ──────────
  useEffect(() => {
    if (visible) {
      notificationFired.current = false;
      getOffAlertFired.current = false;
    }
  }, [visible]);

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
      } catch (e) { if (__DEV__) console.warn(e); }
    })();
    return () => { sub?.remove(); locationSubRef.current = null; };
  }, [visible]);

  // ── Auto-advance legs based on location ──────────────────────
  useEffect(() => {
    if (!userCoords || !currentLeg) return;
    const destDist = distMetres(userCoords.lat, userCoords.lon, currentLeg.to.lat, currentLeg.to.lon);

    if (currentLeg.mode !== 'WALK' && destDist < 200 && !getOffAlert) {
      if (getOffAlertFired.current) return;
      getOffAlertFired.current = true;
      setGetOffAlert(true);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
      fireNotification(t('Get off soon', 'Descendez bient\u00f4t'), t('Your stop is approaching', 'Votre arr\u00eat approche'));
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
      if (notificationFired.current) return;
      notificationFired.current = true;
      setTripEnded(true);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
      fireNotification(t('You have arrived', 'Vous etes arrive'), cleanStopName(currentLeg.to.name));
    }
  }, [userCoords, activeLeg, currentLeg, getOffAlert, tripEnded]);

  // ── Poll arrivals for current transit leg ────────────────────
  const pollArrivals = useCallback(async () => {
    if (!currentLeg || currentLeg.mode === 'WALK' || currentLeg.mode === 'CAR' || currentLeg.mode === 'BICYCLE') return;
    const routeId = switchedRoute || currentLeg.routeShortName;
    if (!routeId) return;
    // Use stopCode (numeric stop ID from OTP) — fall back to stopId (OTP internal), then name
    const stopParam = currentLeg.from.stopCode || (currentLeg.from.stopId ? currentLeg.from.stopId.replace(/^2:/, '') : null) || currentLeg.from.name;

    try {
      const resp = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/arrivals?stop=${encodeURIComponent(stopParam)}`
      );
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const arrivals = data.arrivals || [];
      setPollFailCount(0);

      // Find our tracked route's arrival — try exact match first, then fuzzy
      const normalizeRoute = (s: string) => String(s || '').replace(/-.*/,'');
      const normalizeStop = (s: string) => String(s || '').replace(/ Station$/i, '').toLowerCase().trim();
      let match = arrivals.find((a: any) =>
        normalizeRoute(a.routeId || a.route || '') === normalizeRoute(routeId)
      );
      if (!match) {
        // Fuzzy fallback: match if one starts with the other (avoids "4" matching "44")
        match = arrivals.find((a: any) => {
          const aRoute = normalizeRoute(a.routeId || a.route || '');
          const targetRoute = normalizeRoute(routeId);
          return aRoute === targetRoute || aRoute.startsWith(targetRoute + '-') || targetRoute.startsWith(aRoute + '-');
        });
      }
      if (match) {
        // Bus found — clear disappearance state
        setBusDisappeared(false);
        setBusDisappearedAt(null);
        // Backend returns minsAway (integer minutes) — convert to ms timestamp
        const minsAway = typeof match.minsAway === 'number' ? match.minsAway : null;
        const arrMs = minsAway !== null ? Date.now() + minsAway * 60000 : null;
        if (arrMs) {
          setLiveArrival(arrMs);
          // Calculate adjusted ETA: shift remaining trip duration by delay/early
          const scheduledDep = currentLeg.startTime;
          const delay = arrMs - scheduledDep;
          setLiveEta(itinerary.endTime + delay);
          if (nextLeg && nextLeg.mode !== 'WALK') {
            const buffer = arrMs + (currentLeg.duration * 1000) - nextLeg.startTime;
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
      const plannedMins = match && typeof match.minsAway === 'number' ? match.minsAway : null;
      const destName = (currentLeg.headsign || currentLeg.to.name || '').toLowerCase();
      const alts: string[] = [];

      for (const a of arrivals) {
        const aRoute = String(a.routeId || a.route || '').replace(/-.*/,'');
        if (aRoute === String(routeId).replace(/-.*/,'')) continue;
        const aMins = typeof a.minsAway === 'number' ? a.minsAway : null;
        if (aMins === null || plannedMins === null) continue;
        if (Math.abs(aMins - plannedMins) > 5) continue;
        const aHeadsign = String(a.headsign || a.destination || '').toLowerCase();
        if (aHeadsign && destName && aHeadsign.includes(destName.split('/')[0].trim().slice(0, 8))) {
          if (!alts.includes(aRoute)) alts.push(aRoute);
        }
      }
      setAltRoutes(alts);

      // Fetch live bus position
      const trackedRouteId = switchedRoute || currentLeg.routeShortName;
      if (trackedRouteId && currentLeg.mode !== 'WALK') {
        try {
          const vResp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/vehicles');
          if (vResp.ok) {
            const vData = await vResp.json();
            const vehicles = vData.vehicles || [];
            const normalizeR = (s: string) => String(s || '').replace(/-.*/,'');
            const matchingVehicles = vehicles.filter((v: any) => normalizeR(v.routeId) === normalizeR(trackedRouteId) && v.lat && v.lng);
            // Pick the closest vehicle to user position or boarding stop
            let bus: any = matchingVehicles[0] || null;
            if (matchingVehicles.length > 1) {
              const refLat = userCoords?.lat ?? currentLeg.from.lat;
              const refLon = userCoords?.lon ?? currentLeg.from.lon;
              matchingVehicles.sort((a: any, b: any) => distMetres(refLat, refLon, a.lat, a.lng) - distMetres(refLat, refLon, b.lat, b.lng));
              bus = matchingVehicles[0];
            }
            if (bus) {
              setBusPosition({ lat: bus.lat, lng: bus.lng, routeId: bus.routeId, agency: bus.agency || 'OC_TRANSPO' });
            } else {
              setBusPosition(null);
            }
          }
        } catch (e) { if (__DEV__) console.warn(e); }
      }
    } catch (e) {
      if (__DEV__) console.warn(e);
      setPollFailCount(prev => prev + 1);
    }
  }, [currentLeg, nextLeg, activeLeg, switchedRoute, busDisappearedAt, itinerary.endTime]);

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
      } catch (e) { if (__DEV__) console.warn(e); return; }

      const ids: string[] = [];
      const nowMs = Date.now();

      for (const leg of legs) {
        if (leg.mode === 'WALK') continue;
        const route = leg.routeShortName ? t(`Route ${leg.routeShortName}`, `Ligne ${leg.routeShortName}`) : leg.mode === 'TRAM' || leg.mode === 'RAIL' ? 'O-Train' : t('Bus', 'Bus');
        const stop = cleanStopName(leg.from.name);
        const headsign = leg.headsign ? ` → ${leg.headsign}` : '';

        const warnAt = leg.startTime - 2 * 60 * 1000;
        if (warnAt > nowMs) {
          try {
            const id = await Notifications.scheduleNotificationAsync({
              content: { title: t(`${route} in 2 min`, `${route} dans 2 min`), body: t(`Board at ${stop}${headsign}`, `Montez \u00e0 ${stop}${headsign}`), sound: true },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(warnAt) },
            });
            ids.push(id);
          } catch (e) { if (__DEV__) console.warn(e); }
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
    } catch (e) { if (__DEV__) console.warn(e); }
  };

  // ── Pulse animation for countdown <5 min ────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shouldPulse = (() => {
    if (!currentLeg) return false;
    const isTransitLeg = currentLeg.mode !== 'WALK' && currentLeg.mode !== 'CAR' && currentLeg.mode !== 'BICYCLE';
    if (!isTransitLeg || reducedMotion) return false;
    const depMs = liveArrival || currentLeg.startTime;
    const hasDeparted = depMs <= now;
    const minLeft = Math.floor(Math.max(0, (depMs - now) / 1000) / 60);
    return !hasDeparted && minLeft < 5;
  })();
  useEffect(() => {
    if (!shouldPulse) {
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
  }, [shouldPulse]);

  // ── Elevator/escalator alert for LRT legs ──────────────────
  const elevatorAlert = (() => {
    if (!alerts || !currentLeg || (currentLeg.mode !== 'TRAM' && currentLeg.mode !== 'RAIL')) return null;
    const keywords = /elevator|escalator|ascenseur|escalier roulant|hors service|out of service/i;
    return alerts.find(a => keywords.test(a.title) || keywords.test(a.description || ''));
  })();

  // ── Re-fit map when busPosition changes ─────────────────────
  useEffect(() => {
    if (!mapRef.current || !busPosition || !currentLeg) return;
    const poly = currentLeg.legGeometry?.points ? decodePolyline(currentLeg.legGeometry.points) : null;
    const fitCoords: { latitude: number; longitude: number }[] = [];
    if (poly) fitCoords.push(...poly);
    if (userCoords) fitCoords.push({ latitude: userCoords.lat, longitude: userCoords.lon });
    fitCoords.push({ latitude: busPosition.lat, longitude: busPosition.lng });
    if (fitCoords.length > 1) {
      mapRef.current.fitToCoordinates(fitCoords, {
        edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
        animated: true,
      });
    }
  }, [busPosition]);

  // ── Estimate passed stops based on time progress ───────────
  const getPassedStopCount = (): number => {
    if (!userCoords || !currentLeg || currentLeg.mode === 'WALK' || currentLeg.intermediateStops.length === 0) return 0;
    const legProgress = Math.max(0, Math.min(1, (now - currentLeg.startTime) / (currentLeg.endTime - currentLeg.startTime)));
    return Math.floor(legProgress * currentLeg.intermediateStops.length);
  };

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
    ? `${fmtDistance(currentLeg.distance)} · ${fmtDuration(currentLeg.duration * 1000)}`
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
    ? t("I'm at the stop →", "Je suis \u00e0 l'arr\u00eat →")
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

  const isLight = colours.bg === '#f0f4f8';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleEnd}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        {/* Safe area spacer */}
        <View style={{ height: Platform.OS === 'ios' ? 56 : 36 }} />

        {/* Compact header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colours.green, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="navigate" size={18} color="#fff" />
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colours.text }}>{t('Active Trip', 'Trajet actif')}</Text>
              <Text style={{ fontSize: 12, color: colours.muted }}>
                {t('Arrives', 'Arrivee')} {fmtTime(liveEta || itinerary.endTime)} · {fmtDuration((liveEta || itinerary.endTime) - now)}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted }}>
            {t('Leg', 'Etape')} {activeLeg + 1}/{legs.length}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={{ marginHorizontal: 20, height: 4, borderRadius: 2, backgroundColor: colours.border, marginBottom: 0 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colours.green, width: `${Math.round(progressFraction * 100)}%` as `${number}%` }} />
        </View>

        {/* Map section — 50% screen height */}
        <View style={{ height: SCREEN_HEIGHT * 0.50, overflow: 'hidden' }}>
          {MapView ? (
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={mapCenter}
              showsUserLocation={false}
              showsCompass={false}
              showsScale={false}
              userInterfaceStyle={isLight ? 'light' : 'dark'}
              onLayout={() => {
                const fitCoords = [...(legPolyline || [])];
                if (userCoords) fitCoords.push({ latitude: userCoords.lat, longitude: userCoords.lon });
                if (busPosition) fitCoords.push({ latitude: busPosition.lat, longitude: busPosition.lng });
                if (fitCoords.length > 1) {
                  mapRef.current?.fitToCoordinates(fitCoords, {
                    edgePadding: { top: 40, right: 40, bottom: 120, left: 40 },
                    animated: false,
                  });
                }
              }}
            >
              {legPolyline && Polyline && (
                <Polyline
                  coordinates={legPolyline}
                  strokeColor={legColor}
                  strokeWidth={4}
                  lineDashPattern={isWalk ? [6, 4] : undefined}
                />
              )}
              {Marker && currentLeg.to.lat != null && currentLeg.to.lon != null && (
                <Marker coordinate={{ latitude: currentLeg.to.lat, longitude: currentLeg.to.lon }} anchor={{ x: 0.5, y: 1.0 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: legColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
                    <Ionicons name="flag" size={14} color="#fff" />
                  </View>
                </Marker>
              )}
              {Marker && userCoords && (
                <Marker coordinate={{ latitude: userCoords.lat, longitude: userCoords.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#007AFF', borderWidth: 3, borderColor: 'white' }} />
                </Marker>
              )}
              {Marker && busPosition && (
                <Marker coordinate={{ latitude: busPosition.lat, longitude: busPosition.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ backgroundColor: busPosition.agency === 'STO' ? '#00A78D' : '#CE1126', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1.5, borderColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="bus" size={10} color="white" />
                      <Text style={{ fontSize: 9, fontWeight: '900', color: 'white' }}>{busPosition.routeId}</Text>
                    </View>
                  </View>
                </Marker>
              )}
            </MapView>
          ) : (
            <View style={{ flex: 1, backgroundColor: colours.surface }} />
          )}
        </View>

        {/* Bottom section — leg card + actions + end trip */}
        <View style={{ flex: 1, justifyContent: 'space-between' }}>

        {/* Current leg card — overlaps bottom of map */}
        <View style={{
          marginTop: -24, marginHorizontal: 16, zIndex: 10,
          borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
          backgroundColor: colours.bg, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
          borderWidth: 1, borderColor: colours.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: legColor + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: legColor + '55' }}>
                <Ionicons name={legIcon as any} size={18} color={legColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text, lineHeight: 19 }} numberOfLines={2}>{stepTitle}</Text>
                <Text style={{ fontSize: 12, color: colours.muted }} numberOfLines={2}>{stepSubtitle}</Text>
              </View>
              {/* Countdown inline */}
              {isTransit && (
                departed ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.green + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.green }} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colours.green }}>{t('Now', 'Maint.')}</Text>
                  </View>
                ) : (
                  <Animated.View style={{ opacity: pulseAnim }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colours.accentAlt + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Ionicons name="time-outline" size={12} color={colours.accentAlt} />
                      <Text style={{ fontSize: 16, fontWeight: '900', color: colours.accentAlt, fontVariant: ['tabular-nums'] }}>
                        {countdownMin}:{String(countdownRemSec).padStart(2, '0')}
                      </Text>
                    </View>
                  </Animated.View>
                )
              )}
              {!isTransit && (
                <Text style={{ fontSize: 12, fontWeight: '700', color: legColor }}>
                  {fmtTime(currentLeg.startTime)} → {fmtTime(currentLeg.endTime)}
                </Text>
              )}
            </View>

            {/* Intermediate stops — compact expandable */}
            {isTransit && currentLeg.intermediateStops.length > 0 && (
              <TouchableOpacity onPress={() => setStopsExpanded(!stopsExpanded)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 11, color: colours.muted, flex: 1 }}>
                    {(() => {
                      const passed = getPassedStopCount();
                      const total = currentLeg.intermediateStops.length;
                      const remaining = total - passed;
                      return `${remaining} ${t('stops remaining', 'arrets restants')}`;
                    })()}
                  </Text>
                  <Ionicons name={stopsExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                </View>
                {stopsExpanded && (
                  <View style={{ marginTop: 6, gap: 1 }}>
                    {currentLeg.intermediateStops.map((stop, i) => {
                      const passed = i < getPassedStopCount();
                      return (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: passed ? colours.green + '22' : colours.border, borderWidth: 1, borderColor: passed ? colours.green : colours.border, alignItems: 'center', justifyContent: 'center' }}>
                            {passed && <Ionicons name="checkmark" size={7} color={colours.green} />}
                          </View>
                          <Text style={{ fontSize: 11, color: passed ? colours.muted : colours.text, textDecorationLine: passed ? 'line-through' : 'none' }}>
                            {cleanStopName(stop)}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colours.green + '22', borderWidth: 1, borderColor: colours.green, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="flag" size={7} color={colours.green} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colours.green }}>{cleanStopName(currentLeg.to.name)}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Alt routes — compact */}
            {altRoutes.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
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
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: switchedRoute === alt ? colours.accentAlt + '33' : colours.border, borderWidth: 1, borderColor: switchedRoute === alt ? colours.accentAlt : colours.border }}
                    >
                      <Ionicons name="swap-horizontal" size={10} color={colours.accentAlt} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accentAlt }}>{alt}</Text>
                    </TouchableOpacity>
                  ))}
                  {switchedRoute && (
                    <TouchableOpacity
                      onPress={() => { setSwitchedRoute(null); setLiveArrival(null); Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colours.border }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('Reset', 'Reinit.')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
        </View>

        {/* Bottom action area */}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 0 }}>
          {/* Warning banners */}
          {transferWarning && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.orange + '22', borderWidth: 1, borderColor: colours.orange, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="warning" size={16} color={colours.orange} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colours.orange }}>{transferWarning}</Text>
            </View>
          )}
          {elevatorAlert && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.accentAlt + '22', borderWidth: 1, borderColor: colours.accentAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="accessibility-outline" size={16} color={colours.accentAlt} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accentAlt }}>{t('Elevator/escalator issue', 'Probleme ascenseur/escalier roulant')}</Text>
                <Text style={{ fontSize: 10, color: colours.accentAlt, marginTop: 1 }} numberOfLines={2}>{elevatorAlert.title}</Text>
              </View>
            </View>
          )}
          {busDisappeared && isTransit && !departed && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.orange + '22', borderWidth: 1, borderColor: colours.orange, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="alert-circle" size={16} color={colours.orange} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.orange }}>{t('Bus disappeared from feed', 'Bus disparu du flux')}</Text>
                <Text style={{ fontSize: 10, color: colours.orange, marginTop: 1 }}>{t('May be cancelled or GPS lost', 'Possiblement annule ou GPS perdu')}</Text>
              </View>
            </View>
          )}
          {pollFailCount >= 3 && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.orange + '22', borderWidth: 1, borderColor: colours.orange, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="wifi-outline" size={16} color={colours.orange} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colours.orange }}>{t('Live tracking unavailable', 'Suivi en direct indisponible')}</Text>
            </View>
          )}
          {getOffAlert && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.red + '22', borderWidth: 1, borderColor: colours.red, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="notifications" size={16} color={colours.red} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colours.red }}>{t('Get off soon!', 'Descendez bient\u00f4t!')}</Text>
            </View>
          )}
          {tripEnded && (
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.green + '22', borderWidth: 1, borderColor: colours.green, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="checkmark-circle" size={16} color={colours.green} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colours.green }}>{t('You have arrived!', 'Vous etes arrive!')}</Text>
            </View>
          )}

          {/* Advance button */}
          {!isLastLeg && (
            <View style={{ marginBottom: 8 }}>
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

          {/* Next step — compact card */}
          <View style={{ borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, padding: 12, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {nextLeg ? (
                <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: (LEG_COLOURS[nextLeg.mode] || '#555') + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={(LEG_ICONS[nextLeg.mode] || 'flag') as any} size={14} color={LEG_COLOURS[nextLeg.mode] || '#555'} />
                </View>
              ) : (
                <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: colours.green + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flag" size={14} color={colours.green} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('Next', 'Suivant')}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{nextStepTitle}</Text>
              </View>
              {nextLeg && (
                <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{fmtTime(nextLeg.startTime)}</Text>
              )}
            </View>
          </View>

          {/* Leg pills — hide when single leg */}
          {legs.length > 1 && (
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              {legs.map((leg, i) => {
                const color = LEG_COLOURS[leg.mode] || '#555';
                const done = i < activeLeg;
                const active = i === activeLeg;
                return (
                  <View key={i} style={{ flex: 1, height: 26, borderRadius: 8, backgroundColor: done ? color : active ? color + '44' : colours.border, borderWidth: active ? 1 : 0, borderColor: color, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <Ionicons name={(LEG_ICONS[leg.mode] || 'bus') as any} size={11} color={done || active ? '#fff' : colours.muted} />
                    {leg.routeShortName && (
                      <Text style={{ fontSize: 9, fontWeight: '800', color: done || active ? '#fff' : colours.muted }}>{leg.routeShortName}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Live indicator */}
          {liveArrival && isTransit && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.green }} />
              <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600' }}>{t('Live arrival data', 'Donnees en temps reel')}</Text>
            </View>
          )}
        </ScrollView>

        {/* End trip button — fixed at bottom */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <TouchableOpacity
            onPress={handleEnd}
            style={{
              height: 52, borderRadius: 12,
              backgroundColor: tripEnded ? colours.green : colours.red,
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
      </View>
    </Modal>
  );
}
