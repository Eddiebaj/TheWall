import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import { useLocalSearchParams } from 'expo-router';
import { toTitleCase } from '../../lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Keyboard, KeyboardAvoidingView,
  Linking, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, RefreshControl, ScrollView, Share,
  Text,
  TextInput, TouchableOpacity, View
} from 'react-native';
let RNMaps: typeof import('react-native-maps') | null = null;
try { RNMaps = require('react-native-maps'); } catch {}
const MapView = RNMaps?.default ?? null;
const Marker = (RNMaps as any)?.Marker ?? null;
const Polyline = (RNMaps as any)?.Polyline ?? null;
const PROVIDER_DEFAULT = (RNMaps as any)?.PROVIDER_DEFAULT ?? null;
import { useApp } from '../../context/AppContext';
import { ItinerarySkeleton } from '../../components/Shimmer';
import ActiveTrip from '../../components/ActiveTrip';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { supabase } from '../../lib/supabase';

// ── Error Boundary ───────────────────────────────────────────────
class PlannerErrorBoundary extends React.Component<
  { children: React.ReactNode; colours: any; fonts: any; t: (en: string, fr: string) => string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { if (__DEV__) console.warn('PlannerErrorBoundary caught:', error); }
  render() {
    if (this.state.hasError) {
      const { colours, fonts, t } = this.props;
      return (
        <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="navigate-outline" size={48} color={colours.muted} />
          <Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            {t('Something went wrong', 'Une erreur s\'est produite')}
          </Text>
          <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 8, textAlign: 'center' }}>
            {t('The planner ran into an issue', 'Le planificateur a rencontr\u00e9 un probl\u00e8me')}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Tap to retry', 'Appuyez pour r\u00e9essayer')}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.md }}>{t('Tap to retry', 'Appuyez pour r\u00e9essayer')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
import { SK_PLANNER_PREFS, SK_SAVED_ROUTES, SK_TRIP_HISTORY, SK_LEAVE_REMINDERS, SK_ACCESSIBILITY_ROUTING, SK_MOTION, SK_WALK_PREFERENCE, SK_WALK_PACE, SK_BATTERY_SAVER, SK_CAMPUS, SK_CLASS_SCHEDULE } from '../../lib/storageKeys';
import { CAMPUSES, CampusConfig } from '../../lib/campusData';
import { ClassSchedule, nextClass, fmt12h as schedFmt12h } from '../../lib/scheduleData';

const CAMPUS_LOGOS: Record<string, any> = {
  carleton: require('../../assets/schools/carleton.png'),
  uottawa: require('../../assets/schools/uottawa.png'),
  algonquin: require('../../assets/schools/algonquin.png'),
};

const PLAN_URL = 'https://routeo-backend.vercel.app/api/plan';
const PLACES_URL = 'https://routeo-backend.vercel.app/api/places';

// Canadian Tire Centre coords (Sens home)
const CTC_LAT = 45.2973;
const CTC_LNG = -75.9267;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type PlaceResult = { placeId: string; label: string; lat?: number; lng?: number };
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

type SavedRoute = {
  id: string;
  fromLabel: string;
  toLabel: string;
  fromLat: number; fromLng: number;
  toLat: number; toLng: number;
  savedAt: number;
};

type TripRecord = {
  id: string;
  fromLabel: string; fromLat: number; fromLng: number;
  toLabel: string; toLat: number; toLng: number;
  durationMins: number;
  plannedAt: string; // ISO string
};

const SAVED_ROUTES_KEY = SK_SAVED_ROUTES;
const MAX_TRIP_HISTORY = 15;

const LEG_COLOURS: Record<string, string> = {
  WALK: '#9aaabb',
  BUS: '#00A78D',
  TRAM: '#0057B8',
  RAIL: '#0057B8',
  SUBWAY: '#0057B8',
  FERRY: '#7b5ea7',
  CAR: '#e8a020',
  BICYCLE: '#34c759',
};

const LEG_ICONS: Record<string, string> = {
  WALK: 'walk',
  BUS: 'bus',
  TRAM: 'train',
  RAIL: 'train',
  SUBWAY: 'train',
  FERRY: 'boat',
  CAR: 'car',
  BICYCLE: 'bicycle',
};

function fmtTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m}${ampm}`;
}

function fmtDuration(secs: number) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtWalk(metres: number) {
  if (metres < 100) return `${Math.round(metres)}m walk`;
  if (metres < 1000) return `${Math.round(metres / 10) * 10}m walk`;
  return `${(metres / 1000).toFixed(1)}km walk`;
}

function fmtDistance(metres: number) {
  if (metres < 100) return `${Math.round(metres)}m`;
  if (metres < 1000) return `${Math.round(metres / 10) * 10}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

// ── Custom Wheel Picker ─────────────────────────────────────────
const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;

function WheelColumn({ items, selectedIndex, onSelect, width, colours }: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  colours: any;
}) {
  const flatRef = useRef<FlatList>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: selectedIndex * WHEEL_ITEM_H, animated: false });
    }, 50);
  }, []);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    onSelect(clamped);
  }, [items.length, onSelect]);

  const padCount = Math.floor(WHEEL_VISIBLE / 2);
  const padded = useMemo(() => [
    ...Array(padCount).fill(''),
    ...items,
    ...Array(padCount).fill(''),
  ], [items, padCount]);

  const renderItem = useCallback(({ item, index }: { item: string; index: number }) => {
    const realIdx = index - padCount;
    const isSelected = realIdx === selectedIndex;
    return (
      <View style={{ height: WHEEL_ITEM_H, justifyContent: 'center', alignItems: 'center', width }}>
        <Text style={{
          fontSize: isSelected ? 18 : 14,
          fontWeight: isSelected ? '700' : '400',
          color: isSelected ? colours.text : colours.muted,
          opacity: item === '' ? 0 : (isSelected ? 1 : 0.5),
        }}>{item}</Text>
      </View>
    );
  }, [selectedIndex, width, colours]);

  return (
    <View style={{ width, height: WHEEL_ITEM_H * WHEEL_VISIBLE }}>
      <FlatList
        ref={flatRef}
        data={padded}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({ length: WHEEL_ITEM_H, offset: WHEEL_ITEM_H * index, index })}
      />
      {/* Selection highlight band */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: WHEEL_ITEM_H * padCount,
        left: 0,
        right: 0,
        height: WHEEL_ITEM_H,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colours.accent + '40',
        backgroundColor: colours.accent + '10',
        borderRadius: 8,
      }} />
    </View>
  );
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i));
const MINUTES_60 = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const AM_PM = ['AM', 'PM'];

// Strip ", Canada" and redundant province from place labels, truncate to street-level
function shortenLabel(label: string): string {
  let s = label
    .replace(/, Canada$/i, '')
    .replace(/, ON$/i, '')
    .replace(/, QC$/i, '')
    .replace(/, Ottawa, ON/i, '')
    .replace(/, Gatineau, QC/i, '')
    .replace(/, Ottawa$/i, '')
    .replace(/, Gatineau$/i, '')
    .replace(/, ON,/i, ',')
    .replace(/, QC,/i, ',')
    .trim();
  // Deduplicate adjacent identical segments (e.g. "Bank St, Bank St" → "Bank St")
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped.length === 0 || deduped[deduped.length - 1].toLowerCase() !== p.toLowerCase()) deduped.push(p);
  }
  // Keep only first two parts to stay concise
  if (deduped.length > 2) return deduped.slice(0, 2).join(', ');
  return deduped.join(', ');
}

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

function legCoords(leg: Leg): { latitude: number; longitude: number }[] {
  if ((leg as any).legGeometry?.points) {
    const decoded = decodePolyline((leg as any).legGeometry.points);
    if (decoded.length > 0) return decoded;
  }
  if (!leg.from?.lat || !leg.to?.lat) return [];
  return [
    { latitude: leg.from.lat, longitude: leg.from.lon },
    { latitude: leg.to.lat, longitude: leg.to.lon },
  ];
}

function getBounds(coords: { latitude: number; longitude: number }[]) {
  const lats = coords.map(c => c.latitude);
  const lngs = coords.map(c => c.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.25, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.25, 0.008),
  };
}

const SCREEN_H = Dimensions.get('window').height;

function directionIcon(dir: string): string {
  const map: Record<string, string> = {
    LEFT: 'arrow-back', SLIGHTLY_LEFT: 'arrow-back',
    RIGHT: 'arrow-forward', SLIGHTLY_RIGHT: 'arrow-forward',
    CONTINUE: 'arrow-up', HARD_LEFT: 'arrow-back',
    HARD_RIGHT: 'arrow-forward', U_TURN_LEFT: 'return-up-back',
    U_TURN_RIGHT: 'return-up-forward',
  };
  return map[dir] || 'arrow-up';
}

function PlannerScreenInner() {
  const { colours, fonts, t, language } = useApp();
  const params = useLocalSearchParams();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState<PlaceResult | null>(null);
  const [toPlace, setToPlace] = useState<PlaceResult | null>(null);
  const [fromResults, setFromResults] = useState<PlaceResult[]>([]);
  const [toResults, setToResults] = useState<PlaceResult[]>([]);
  const [waypoints, setWaypoints] = useState<{ text: string; place: PlaceResult | null }[]>([]);
  const [waypointResults, setWaypointResults] = useState<{ [idx: number]: PlaceResult[] }>({});
  const [activeInput, setActiveInput] = useState<'from' | 'to' | `waypoint_${number}` | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [departTime, setDepartTime] = useState<Date>(new Date());
  const [arriveBy, setArriveBy] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [travelMode, setTravelMode] = useState<'transit' | 'driving' | 'bicycling' | 'walking'>('transit');
  const [walkPreference, setWalkPreference] = useState<500 | 1000 | 2000>(1000);
  const [walkPace, setWalkPace] = useState<'slow' | 'normal' | 'fast'>('normal');

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<{ routes: string[]; title: string }[]>([]);
  const [searched, setSearched] = useState(false);
  const [transferReliability, setTransferReliability] = useState<Record<string, { onTimePercent: number; avgDelay: number }>>({});
  const [walkAlt, setWalkAlt] = useState<{ walkMins: number; transitMins: number; transitWait: number; temp: number | null; precip: boolean } | null>(null);

  const [expandedItinerary, setExpandedItinerary] = useState<Itinerary | null>(null);
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);
  const [activeLeg, setActiveLeg] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [activeTripItinerary, setActiveTripItinerary] = useState<Itinerary | null>(null);
  const mapRef = useRef<any>(null);
  const locationSubRef = useRef<any>(null);
  const stepsScrollRef = useRef<ScrollView>(null);

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [accessibleRouting, setAccessibleRouting] = useState(false);
  const [sensGameTonight, setSensGameTonight] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [batterySaverMode, setBatterySaverMode] = useState(false);
  const [plannerCampus, setPlannerCampus] = useState<CampusConfig | null>(null);
  const [plannerSchedule, setPlannerSchedule] = useState<ClassSchedule | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reminderModal, setReminderModal] = useState<{ itin: Itinerary; idx: number } | null>(null);
  const [reminderTime, setReminderTime] = useState<Date>(new Date());
  const [leaveReminders, setLeaveReminders] = useState<{ id: string; destination: string; departAt: number; notifId: string }[]>([]);

  // Override time/arriveBy for schedule GO button (ref avoids stale closure)
  const timeOverride = useRef<{ time: Date; arriveBy: boolean } | null>(null);
  // Holds Expo notification IDs so we can cancel them on stopTracking
  const transitNotifIds = useRef<string[]>([]);
  const autoCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itinLayoutMap = useRef<Record<number, number>>({});
  const mainScrollRef = useRef<ScrollView>(null);
  const itinListYOffset = useRef(0);

  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : { shadowColor: '#ffffff', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 };


  // ── Load saved routes + trip history ──────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ROUTES_KEY).then(val => {
      try { if (val) setSavedRoutes(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved routes failed:', e); }
    }).catch(() => {});
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      try { if (val) setTripHistory(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse trip history failed:', e); }
    }).catch(() => {});
    // Load leave reminders and clean up past ones
    AsyncStorage.getItem(SK_LEAVE_REMINDERS).then(val => {
      try {
        if (!val) return;
        const all: { id: string; destination: string; departAt: number; notifId: string }[] = JSON.parse(val);
        const now = Date.now();
        const active = all.filter(r => r.departAt > now);
        if (active.length !== all.length) {
          AsyncStorage.setItem(SK_LEAVE_REMINDERS, JSON.stringify(active)).catch(() => {});
        }
        setLeaveReminders(active);
      } catch (e) { if (__DEV__) console.warn('JSON parse leave reminders failed:', e); }
    }).catch(() => {});
    // Load accessibility routing preference
    AsyncStorage.getItem(SK_ACCESSIBILITY_ROUTING).then(val => {
      if (val === 'true') setAccessibleRouting(true);
    }).catch(() => {});
    // Load walk distance preference
    AsyncStorage.getItem(SK_WALK_PREFERENCE).then(val => {
      if (val) { const n = parseInt(val, 10); if (n === 500 || n === 1000 || n === 2000) setWalkPreference(n); }
    }).catch(() => {});
    // Load walk pace preference
    AsyncStorage.getItem(SK_WALK_PACE).then(val => {
      if (val === 'slow' || val === 'fast') setWalkPace(val);
    }).catch(() => {});
    // Load reduced motion preference
    AsyncStorage.getItem(SK_MOTION).then(val => {
      if (val === 'true') setReducedMotion(true);
    }).catch(() => {});
    AsyncStorage.getItem(SK_BATTERY_SAVER).then(val => {
      if (val === 'true') setBatterySaverMode(true);
    }).catch(() => {});
    AsyncStorage.getItem(SK_CAMPUS).then(val => {
      if (val) { const c = CAMPUSES.find(x => x.id === val); if (c) setPlannerCampus(c); }
    }).catch(() => {});
    AsyncStorage.getItem(SK_CLASS_SCHEDULE).then(val => {
      try { if (val) setPlannerSchedule(JSON.parse(val)); } catch {}
    }).catch(() => {});
    // Check for Sens game tonight
    fetchWithTimeout('https://api-web.nhle.com/v1/schedule/now').then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const today = new Date().toLocaleDateString('en-CA');
      const todayEntry = (data.gameWeek || []).find((d: any) => d.date === today);
      const game = (todayEntry?.games || []).find((g: any) =>
        g.awayTeam?.abbrev === 'OTT' || g.homeTeam?.abbrev === 'OTT'
      );
      if (game) setSensGameTonight(true);
    }).catch(() => {});
  }, []);

  // ── Fetch alerts for transfer warnings ─────────────────────────
  useEffect(() => {
    fetchWithTimeout('https://routeo-backend.vercel.app/api/alerts')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.alerts) setAlerts(data.alerts); })
      .catch(() => {});
  }, []);

  // ── Load planner prefs (hour, minute, arriveBy) ──────────────
  useEffect(() => {
    AsyncStorage.getItem(SK_PLANNER_PREFS).then(val => {
      try {
        if (!val) return;
        const prefs = JSON.parse(val);
        if (typeof prefs.hour === 'number' && typeof prefs.minute === 'number') {
          const d = new Date();
          d.setHours(prefs.hour, prefs.minute, 0, 0);
          setDepartTime(d);
        }
        if (typeof prefs.arriveBy === 'boolean') setArriveBy(prefs.arriveBy);
      } catch (e) { if (__DEV__) console.warn('JSON parse planner prefs failed:', e); }
    }).catch(() => {});
  }, []);

  // ── Save planner prefs when they change ──────────────────────
  const savePlannerPrefs = useCallback((time: Date, ab: boolean) => {
    AsyncStorage.setItem(SK_PLANNER_PREFS, JSON.stringify({
      hour: time.getHours(),
      minute: time.getMinutes(),
      arriveBy: ab,
    })).catch(() => {});
  }, []);

  // ── Cleanup location subscription on unmount ──────────────────
  useEffect(() => {
    return () => {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      cancelTransitNotifications();
    };
  }, []);

  // ── Handle deep-link params from home screen ──────────────────
  // Auto-plan immediately when arriving from a saved route or schedule GO
  useEffect(() => {
    if (params.toLabel && params.toLat) {
      const to: PlaceResult = {
        placeId: 'saved',
        label: params.toLabel as string,
        lat: parseFloat(params.toLat as string),
        lng: parseFloat(params.toLng as string),
      };

      // Handle arriveBy + time params (from class schedule GO button)
      if (params.time && params.date) {
        const [month, day, year] = (params.date as string).split('-').map(Number);
        const [h, m] = (params.time as string).split(':').map(Number);
        const d = new Date(year, month - 1, day, h, m, 0);
        timeOverride.current = { time: d, arriveBy: params.arriveBy === 'true' };
      } else if (params.arriveBy === 'true') {
        timeOverride.current = { time: new Date(), arriveBy: true };
      }

      if (params.fromLabel && params.fromLat) {
        // Both from + to provided (saved route with known origin) — plan immediately
        const from: PlaceResult = {
          placeId: 'saved',
          label: params.fromLabel as string,
          lat: parseFloat(params.fromLat as string),
          lng: parseFloat(params.fromLng as string),
        };
        setFromPlace(from); setFromText(shortenLabel(from.label));
        setToPlace(to); setToText(shortenLabel(to.label));
        // Auto-trigger plan after state settles
        setTimeout(() => planWithPlaces(from, to), 200);
      } else {
        // No origin — get current location then auto-plan
        setToPlace(to); setToText(shortenLabel(to.label));
        (async () => {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              setFromText(''); // let user fill in manually
              return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude: lat, longitude: lng } = pos.coords;
            const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            const label = geo[0] ? [geo[0].name, geo[0].street, geo[0].city].filter(Boolean).join(', ') : 'My Location';
            const from: PlaceResult = { placeId: 'current', label, lat, lng };
            setFromPlace(from); setFromText(shortenLabel(label));
            // Auto-trigger plan — longer delay for arriveBy state to settle
            setTimeout(() => planWithPlaces(from, to), 200);
          } catch (e) { if (__DEV__) console.warn('get current location failed:', e); }
        })();
      }
    }
  }, [params.toLabel, params.toLat]);

  // ── Handle deep-link text params (routeo://planner?from=X&to=Y) ──
  useEffect(() => {
    if (params.from || params.to) {
      // Only handle text-only deep links (no lat/lng already handled above)
      if (params.toLabel || params.toLat) return;
      const geocodeAndFill = async () => {
        try {
          if (params.from) {
            const fromStr = params.from as string;
            setFromText(fromStr);
            const resp = await fetchWithTimeout(`${PLACES_URL}?action=autocomplete-geocode&input=${encodeURIComponent(fromStr)}`);
            if (resp.ok) {
              const data = await resp.json();
              const result = data.results?.[0];
              if (result) {
                const from: PlaceResult = { placeId: result.placeId || 'deeplink', label: result.label || fromStr, lat: result.lat, lng: result.lng };
                setFromPlace(from);
                setFromText(shortenLabel(from.label));
              }
            }
          }
          if (params.to) {
            const toStr = params.to as string;
            setToText(toStr);
            const resp = await fetchWithTimeout(`${PLACES_URL}?action=autocomplete-geocode&input=${encodeURIComponent(toStr)}`);
            if (resp.ok) {
              const data = await resp.json();
              const result = data.results?.[0];
              if (result) {
                const to: PlaceResult = { placeId: result.placeId || 'deeplink', label: result.label || toStr, lat: result.lat, lng: result.lng };
                setToPlace(to);
                setToText(shortenLabel(to.label));
              }
            }
          }
        } catch (e) { if (__DEV__) console.warn('deep-link geocode failed:', e); }
      };
      geocodeAndFill();
    }
  }, [params.from, params.to]);

  // ── Autocomplete ─────────────────────────────────────────────
  const autocomplete = useCallback(async (text: string, field: 'from' | 'to' | `waypoint_${number}`) => {
    if (text.length < 2) {
      if (field === 'from') setFromResults([]);
      else if (field === 'to') setToResults([]);
      else setWaypointResults(prev => { const next = { ...prev }; delete next[parseInt(field.split('_')[1])]; return next; });
      setAutoLoading(false);
      return;
    }
    setAutoLoading(true);
    try {
      const resp = await fetchWithTimeout(`${PLACES_URL}?action=autocomplete-geocode&input=${encodeURIComponent(text)}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const results: PlaceResult[] = data.results || [];
      if (field === 'from') setFromResults(results);
      else if (field === 'to') setToResults(results);
      else setWaypointResults(prev => ({ ...prev, [parseInt(field.split('_')[1])]: results }));
    } catch (e) { if (__DEV__) console.warn('autocomplete fetch failed:', e); }
    setAutoLoading(false);
  }, []);

  const resolvePlace = async (place: PlaceResult): Promise<PlaceResult> => {
    if (place.lat && place.lng) return place;
    try {
      const resp = await fetchWithTimeout(`${PLACES_URL}?action=geocode&input=${encodeURIComponent(place.label)}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const result = data.results?.[0];
      if (result?.lat) return { ...place, lat: result.lat, lng: result.lng, label: result.label };
    } catch (e) { if (__DEV__) console.warn('geocode resolve failed:', e); }
    return place;
  };

  const useMyLocation = async (field: 'from' | 'to') => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('Location required', 'Position requise'), t('Enable location in Settings.', 'Activez la localisation dans les Reglages.')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const label = geo[0] ? [geo[0].name, geo[0].street, geo[0].city].filter(Boolean).join(', ') : 'My Location';
      const place: PlaceResult = { placeId: 'current', label, lat, lng };
      const short = shortenLabel(label);
      if (field === 'from') { setFromPlace(place); setFromText(short); setFromResults([]); }
      else { setToPlace(place); setToText(short); setToResults([]); }
    } catch { Alert.alert(t('Error', 'Erreur'), t('Could not get location.', 'Impossible d\'obtenir la position.')); }
  };

  const swap = () => {
    const tmpPlace = fromPlace; const tmpText = fromText;
    setFromPlace(toPlace); setFromText(toText);
    setToPlace(tmpPlace); setToText(tmpText);
    setFromResults([]); setToResults([]);
  };

  // ── Plan core — accepts explicit places (used by auto-plan on deep-link) ──
  const planWithPlaces = async (resolvedFrom: PlaceResult, resolvedTo: PlaceResult) => {
    if (!resolvedFrom?.lat || !resolvedTo?.lat) return;
    setLoading(true); setError(''); setSearched(true); setItineraries([]);

    // Use override from schedule GO button if set, then clear it
    const override = timeOverride.current;
    const useArriveBy = override ? override.arriveBy : arriveBy;
    const d = override ? override.time : departTime;
    if (override) {
      setDepartTime(d);
      setArriveBy(useArriveBy);
      timeOverride.current = null;
    }

    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const month = String(d.getMonth() + 1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const dateStr = `${month}-${day}-${d.getFullYear()}`;

    const url = `${PLAN_URL}?fromLat=${resolvedFrom.lat}&fromLng=${resolvedFrom.lng}&fromLabel=${encodeURIComponent(resolvedFrom.label)}&toLat=${resolvedTo.lat}&toLng=${resolvedTo.lng}&toLabel=${encodeURIComponent(resolvedTo.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=${useArriveBy}&mode=${travelMode}${accessibleRouting ? '&wheelchair=true' : ''}${travelMode === 'transit' ? `&maxWalk=${walkPreference}&walkSpeed=${walkPace}` : ''}${travelMode === 'walking' ? `&walkSpeed=${walkPace}` : ''}`;

    try {
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      // For arriveBy schedule trips, also fetch earlier options (30min earlier)
      let earlierItins: any[] = [];
      if (useArriveBy && travelMode === 'transit') {
        try {
          const earlyD = new Date(d.getTime() - 30 * 60000);
          const earlyTimeStr = `${String(earlyD.getHours()).padStart(2, '0')}:${String(earlyD.getMinutes()).padStart(2, '0')}`;
          const earlyMonth = String(earlyD.getMonth() + 1).padStart(2, '0');
          const earlyDay = String(earlyD.getDate()).padStart(2, '0');
          const earlyDateStr = `${earlyMonth}-${earlyDay}-${earlyD.getFullYear()}`;
          const earlyUrl = `${PLAN_URL}?fromLat=${resolvedFrom.lat}&fromLng=${resolvedFrom.lng}&fromLabel=${encodeURIComponent(resolvedFrom.label)}&toLat=${resolvedTo.lat}&toLng=${resolvedTo.lng}&toLabel=${encodeURIComponent(resolvedTo.label)}&time=${encodeURIComponent(earlyTimeStr)}&date=${encodeURIComponent(earlyDateStr)}&arriveBy=true&mode=transit${accessibleRouting ? '&wheelchair=true' : ''}&maxWalk=${walkPreference}&walkSpeed=${walkPace}`;
          const earlyResp = await fetchWithTimeout(earlyUrl);
          if (earlyResp.ok) {
            const earlyData = await earlyResp.json();
            earlierItins = earlyData.itineraries || [];
          }
        } catch { /* ignore earlier fetch failure */ }
      }

      if (data.error) { setError(data.error); }
      else if (!data.itineraries?.length && !earlierItins.length) { setError(t('No routes found. Try a different time or destination.', 'Aucun trajet trouv\u00e9. Essayez une autre heure ou destination.')); }
      else {
        // Merge earlier + primary results
        const allItins = [...(data.itineraries || []), ...earlierItins];

        if (travelMode === 'transit') {
          try {
            // Filter out insane routes: any itinerary with a single transfer wait >60 min
            const sane = allItins.filter((itin: any) => {
              const legs = itin.legs || [];
              for (let i = 1; i < legs.length; i++) {
                if (legs[i - 1].mode === 'WALK' || legs[i].mode === 'WALK') continue;
                const waitMin = (legs[i].startTime - legs[i - 1].endTime) / 60000;
                if (waitMin > 60) return false;
              }
              return true;
            });
            const pool = sane.length > 0 ? sane : allItins;

            // Deduplicate by start time (within 2 min)
            const deduped = pool.filter((itin: any, idx: number) => {
              for (let j = 0; j < idx; j++) {
                if (Math.abs((itin.startTime ?? 0) - (pool[j].startTime ?? 0)) < 120000) return false;
              }
              return true;
            });

            // Sort: transit first, then by departure time (earliest first)
            const sorted = [...deduped].sort((a: any, b: any) => {
              const aWalkOnly = Array.isArray(a.legs) && a.legs.length > 0 && a.legs.every((l: any) => l.mode === 'WALK');
              const bWalkOnly = Array.isArray(b.legs) && b.legs.length > 0 && b.legs.every((l: any) => l.mode === 'WALK');
              if (aWalkOnly !== bWalkOnly) return aWalkOnly ? 1 : -1;
              return (a.startTime ?? 0) - (b.startTime ?? 0);
            });

            const transitItins = sorted.filter((i: any) => (i.legs || []).some((l: any) => l.mode !== 'WALK'));
            const walkOnlyItins = sorted.filter((i: any) => (i.legs || []).every((l: any) => l.mode === 'WALK'));
            const bestTransitEnd = transitItins[0]?.endTime ?? Infinity;
            const bestWalkDuration = walkOnlyItins[0]?.duration ?? Infinity;
            const bestWalkEnd = walkOnlyItins[0]?.endTime ?? Infinity;
            const keepWalk = transitItins.length === 0
              || bestWalkDuration <= 1200
              || bestWalkEnd <= bestTransitEnd + 1200000;

            // For arriveBy: tag the best "comfortable" option (arrives with most buffer)
            if (useArriveBy && transitItins.length > 0) {
              const targetMs = d.getTime();
              // Best = earliest arrival among those arriving before target (most buffer)
              // Already sorted by departure — first one that arrives before target is best
              let bestIdx = 0;
              for (let i = 0; i < transitItins.length; i++) {
                if ((transitItins[i].endTime ?? Infinity) <= targetMs) { bestIdx = i; break; }
              }
              // Tag for rendering — move the best option to index 0
              if (bestIdx > 0) {
                const [best] = transitItins.splice(bestIdx, 1);
                transitItins.unshift(best);
              }
            }

            setItineraries(keepWalk ? [...transitItins, ...walkOnlyItins] : transitItins);
          } catch {
            setItineraries(allItins);
          }
        } else {
          // Non-transit modes (driving, bicycling, walking): show best result only
          setItineraries((data.itineraries || []).slice(0, 1));
        }
      }
      // Auto-save to trip history
      if (data.itineraries?.length) {
        const bestItin = data.itineraries[0];
        const record: TripRecord = {
          id: `trip_${Date.now()}`,
          fromLabel: resolvedFrom.label, fromLat: resolvedFrom.lat!, fromLng: resolvedFrom.lng!,
          toLabel: resolvedTo.label, toLat: resolvedTo.lat!, toLng: resolvedTo.lng!,
          durationMins: Math.round((bestItin.duration || 0) / 60),
          plannedAt: new Date().toISOString(),
        };
        setTripHistory(prev => {
          // Deduplicate: if same from/to exists, move it to top with updated timestamp
          const existingIdx = prev.findIndex(p => p.fromLabel === record.fromLabel && p.toLabel === record.toLabel);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated.splice(existingIdx, 1);
            updated.unshift({ ...prev[existingIdx], plannedAt: record.plannedAt, durationMins: record.durationMins });
            AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
            return updated;
          }
          const updated = [record, ...prev].slice(0, MAX_TRIP_HISTORY);
          AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    } catch (e) {
      timeOverride.current = null;
      setError(t('Could not connect to trip planner. Check your connection.', 'Connexion au planificateur impossible. V\u00e9rifiez votre connexion.'));
    }
    setLoading(false);
  };

  // ── Plan — called by button, resolves text inputs first ───────
  const plan = async () => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setFromResults([]);
    setToResults([]);

    let resolvedFrom = fromPlace;
    let resolvedTo = toPlace;

    if (fromText && !fromPlace?.lat) {
      try {
        const r = await fetchWithTimeout(`${PLACES_URL}?action=geocode&input=${encodeURIComponent(fromText)}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedFrom = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setFromPlace(resolvedFrom); setFromText(shortenLabel(result.label)); }
      } catch (e) { if (__DEV__) console.warn('geocode from-address failed:', e); }
    }
    if (toText && !toPlace?.lat) {
      try {
        const r = await fetchWithTimeout(`${PLACES_URL}?action=geocode&input=${encodeURIComponent(toText)}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedTo = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setToPlace(resolvedTo); setToText(shortenLabel(result.label)); }
      } catch (e) { if (__DEV__) console.warn('geocode to-address failed:', e); }
    }

    if (!resolvedFrom?.lat || !resolvedTo?.lat) {
      Alert.alert(t('Missing locations', 'Adresses manquantes'), t('Could not find one or both addresses. Try selecting from the dropdown.', 'Impossible de trouver une ou les deux adresses. Essayez de s\u00e9lectionner dans la liste.'));
      return;
    }

    // Resolve waypoints
    const resolvedWaypoints: PlaceResult[] = [];
    for (const wp of waypoints) {
      let resolved = wp.place;
      if (wp.text && !wp.place?.lat) {
        try {
          const r = await fetchWithTimeout(`${PLACES_URL}?action=geocode&input=${encodeURIComponent(wp.text)}`);
          if (r.ok) {
            const d = await r.json();
            const result = d.results?.[0];
            if (result?.lat) resolved = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng };
          }
        } catch { /* skip */ }
      }
      if (resolved?.lat) resolvedWaypoints.push(resolved);
    }

    // All modes now use the OTP planner in-app

    // Multi-stop: chain OTP requests through waypoints
    if (resolvedWaypoints.length > 0) {
      const stops = [resolvedFrom, ...resolvedWaypoints, resolvedTo];
      setLoading(true); setError(''); setSearched(true); setItineraries([]);
      try {
        const allLegs: Leg[] = [];
        let totalDuration = 0;
        let totalWalkDistance = 0;
        let totalTransfers = 0;
        let startTime = 0;
        let endTime = 0;
        let arrivalTime = departTime;
        for (let i = 0; i < stops.length - 1; i++) {
          const from = stops[i];
          const to = stops[i + 1];
          const timeStr = `${String(arrivalTime.getHours()).padStart(2,'0')}:${String(arrivalTime.getMinutes()).padStart(2,'0')}`;
          const month = String(arrivalTime.getMonth() + 1).padStart(2,'0');
          const day = String(arrivalTime.getDate()).padStart(2,'0');
          const dateStr = `${month}-${day}-${arrivalTime.getFullYear()}`;
          const url = `${PLAN_URL}?fromLat=${from.lat}&fromLng=${from.lng}&fromLabel=${encodeURIComponent(from.label)}&toLat=${to.lat}&toLng=${to.lng}&toLabel=${encodeURIComponent(to.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=${travelMode}${accessibleRouting ? '&wheelchair=true' : ''}`;
          const resp = await fetchWithTimeout(url);
          if (!resp.ok) throw new Error(`Leg ${i + 1}: HTTP ${resp.status}`);
          const data = await resp.json();
          if (data.error || !data.itineraries?.length) {
            setError(t(`No route found for leg ${i + 1}: ${from.label} → ${to.label}`, `Aucun trajet pour le troncon ${i + 1}: ${from.label} → ${to.label}`));
            setLoading(false);
            return;
          }
          const best = data.itineraries[0];
          allLegs.push(...(best.legs || []));
          totalDuration += best.duration || 0;
          totalWalkDistance += best.walkDistance || 0;
          totalTransfers += best.transfers || 0;
          if (i === 0) startTime = best.startTime;
          endTime = best.endTime;
          arrivalTime = new Date(best.endTime);
        }
        const combined: Itinerary = { duration: totalDuration, startTime, endTime, transfers: totalTransfers, walkDistance: totalWalkDistance, legs: allLegs };
        setItineraries([combined]);
        // Save to trip history
        const record: TripRecord = {
          id: `trip_${Date.now()}`,
          fromLabel: resolvedFrom.label, fromLat: resolvedFrom.lat!, fromLng: resolvedFrom.lng!,
          toLabel: resolvedTo.label, toLat: resolvedTo.lat!, toLng: resolvedTo.lng!,
          durationMins: Math.round(totalDuration / 60),
          plannedAt: new Date().toISOString(),
        };
        setTripHistory(prev => {
          const existingIdx = prev.findIndex(p => p.fromLabel === record.fromLabel && p.toLabel === record.toLabel);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated.splice(existingIdx, 1);
            updated.unshift({ ...prev[existingIdx], plannedAt: record.plannedAt, durationMins: record.durationMins });
            AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
            return updated;
          }
          const updated = [record, ...prev].slice(0, MAX_TRIP_HISTORY);
          AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      } catch (e) {
        setError(t('Could not plan multi-stop trip. Try fewer stops.', 'Impossible de planifier le trajet multi-arrets. Essayez moins d\'arrets.'));
        if (__DEV__) console.warn('multi-stop plan failed:', e);
      }
      setLoading(false);
      return;
    }

    planWithPlaces(resolvedFrom, resolvedTo);
  };

  // Auto re-plan when travel mode or walk pace changes (if a trip was already planned)
  useEffect(() => {
    if (searched && fromPlace?.lat && toPlace?.lat && !loading) {
      planWithPlaces(fromPlace, toPlace);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelMode, walkPace]);

  // ── Fetch transfer reliability for planned itineraries ────────
  const fetchTransferReliability = useCallback(async (itins: Itinerary[]) => {
    try {
      // Collect all transit route IDs involved in transfers
      const routeIds = new Set<string>();
      for (const itin of itins) {
        const legs = itin.legs || [];
        for (let i = 1; i < legs.length; i++) {
          if (legs[i - 1].mode === 'WALK' || legs[i].mode === 'WALK') continue;
          if (legs[i - 1].routeShortName) routeIds.add(legs[i - 1].routeShortName!);
        }
      }
      if (routeIds.size === 0) { setTransferReliability({}); return; }

      const { data, error } = await supabase
        .from('route_reliability')
        .select('route_id, delta_minutes')
        .in('route_id', Array.from(routeIds));
      if (error || !data || data.length === 0) { setTransferReliability({}); return; }

      const grouped: Record<string, { onTime: number; total: number; totalDelay: number }> = {};
      for (const row of data) {
        if (!grouped[row.route_id]) grouped[row.route_id] = { onTime: 0, total: 0, totalDelay: 0 };
        grouped[row.route_id].total++;
        grouped[row.route_id].totalDelay += Math.max(0, row.delta_minutes || 0);
        if (Math.abs(row.delta_minutes || 0) <= 3) grouped[row.route_id].onTime++;
      }
      const result: Record<string, { onTimePercent: number; avgDelay: number }> = {};
      for (const [routeId, stats] of Object.entries(grouped)) {
        if (stats.total >= 5) {
          result[routeId] = {
            onTimePercent: Math.round((stats.onTime / stats.total) * 100),
            avgDelay: Math.round(stats.totalDelay / stats.total),
          };
        }
      }
      setTransferReliability(result);
    } catch { setTransferReliability({}); }
  }, []);

  // Fetch reliability data whenever itineraries change
  useEffect(() => {
    if (itineraries.length > 0) fetchTransferReliability(itineraries);
    else setTransferReliability({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraries]);

  // ── Walk or Wait? comparison ────────────────────────────────
  useEffect(() => {
    if (travelMode !== 'transit' || itineraries.length === 0 || !fromPlace?.lat || !toPlace?.lat) {
      setWalkAlt(null);
      return;
    }
    const bestTransit = itineraries[0];
    const transitMins = Math.round((bestTransit.duration || 0) / 60);
    if (transitMins < 15) { setWalkAlt(null); return; }

    // Calculate wait time (first walk leg duration before first transit leg)
    const legs = bestTransit.legs || [];
    const firstTransitIdx = legs.findIndex(l => l.mode !== 'WALK');
    const transitWait = firstTransitIdx > 0 ? Math.round(legs[0].duration / 60) : 0;

    (async () => {
      try {
        // Fetch walk-only route
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const month = String(now.getMonth() + 1).padStart(2,'0');
        const day = String(now.getDate()).padStart(2,'0');
        const dateStr = `${month}-${day}-${now.getFullYear()}`;
        const walkUrl = `${PLAN_URL}?fromLat=${fromPlace.lat}&fromLng=${fromPlace.lng}&fromLabel=${encodeURIComponent(fromPlace.label)}&toLat=${toPlace.lat}&toLng=${toPlace.lng}&toLabel=${encodeURIComponent(toPlace.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=walking`;
        const walkResp = await fetchWithTimeout(walkUrl, { timeout: 6000 });
        if (!walkResp.ok) { setWalkAlt(null); return; }
        const walkData = await walkResp.json();
        const walkItin = walkData?.itineraries?.[0];
        if (!walkItin) { setWalkAlt(null); return; }
        const walkMins = Math.round((walkItin.duration || 0) / 60);
        if (walkMins > 45) { setWalkAlt(null); return; }

        // Fetch current weather
        let temp: number | null = null;
        let precip = false;
        try {
          const wResp = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${fromPlace.lat}&longitude=${fromPlace.lng}&current=temperature_2m,weathercode&timezone=auto`, { timeout: 4000 });
          if (wResp.ok) {
            const wData = await wResp.json();
            temp = wData?.current?.temperature_2m ?? null;
            const code = wData?.current?.weathercode ?? 0;
            precip = [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code);
          }
        } catch { /* silent */ }

        setWalkAlt({ walkMins, transitMins, transitWait, temp, precip });
      } catch { setWalkAlt(null); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraries, travelMode]);

  // ── Save / unsave route ───────────────────────────────────────
  const isRouteSaved = () => {
    if (!fromPlace || !toPlace) return false;
    return savedRoutes.some(r =>
      Math.abs(r.fromLat - (fromPlace.lat ?? 0)) < 0.0001 &&
      Math.abs(r.toLat - (toPlace.lat ?? 0)) < 0.0001
    );
  };

  const toggleSaveRoute = async () => {
    if (!fromPlace?.lat || !toPlace?.lat) return;
    const already = isRouteSaved();
    let updated: SavedRoute[];
    if (already) {
      updated = savedRoutes.filter(r =>
        !(Math.abs(r.fromLat - fromPlace.lat!) < 0.0001 &&
          Math.abs(r.toLat - toPlace.lat!) < 0.0001)
      );
    } else {
      const newRoute: SavedRoute = {
        id: `${Date.now()}`,
        fromLabel: fromPlace.label,
        toLabel: toPlace.label,
        fromLat: fromPlace.lat,
        fromLng: fromPlace.lng!,
        toLat: toPlace.lat,
        toLng: toPlace.lng!,
        savedAt: Date.now(),
      };
      updated = [newRoute, ...savedRoutes].slice(0, 10);
    }
    setSavedRoutes(updated);
    await AsyncStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(updated));
  };

  // ── Isochrone: What can I reach? ──────────────────────────────
  const [isoStops, setIsoStops] = useState<{ name: string; travelTime: number; routes: string[] }[]>([]);
  const [isoLoading, setIsoLoading] = useState(false);
  const [isoVisible, setIsoVisible] = useState(false);
  const [isoPlaces, setIsoPlaces] = useState<{ name: string; category: string; icon: string; time: number }[]>([]);
  const [isoPlacesLoading, setIsoPlacesLoading] = useState(false);

  const fetchIsochrone = async () => {
    setIsoLoading(true);
    setIsoStops([]);
    setIsoVisible(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('Location required', 'Position requise'), t('Enable location in Settings.', 'Activez la localisation dans les Reglages.')); setIsoLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;

      // Use OTP isochrone endpoint to find reachable stops within 20 min
      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const month = String(d.getMonth() + 1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      const dateStr = `${month}-${day}-${d.getFullYear()}`;

      // Query multiple nearby destinations to simulate isochrone
      // We'll use the plan API to check reachable stops by querying known LRT + major bus stops
      const nearbyStops = [
        { name: 'Rideau Centre', lat: 45.4259, lng: -75.6920 },
        { name: "Tunney's Pasture", lat: 45.4032, lng: -75.7360 },
        { name: 'Hurdman', lat: 45.4120, lng: -75.6710 },
        { name: 'Blair', lat: 45.4310, lng: -75.6090 },
        { name: 'St-Laurent', lat: 45.4220, lng: -75.6260 },
        { name: 'Parliament', lat: 45.4230, lng: -75.7000 },
        { name: 'Bayview', lat: 45.4060, lng: -75.7250 },
        { name: 'Lyon', lat: 45.4200, lng: -75.7050 },
        { name: 'Pimisi', lat: 45.4110, lng: -75.7150 },
        { name: 'uOttawa', lat: 45.4225, lng: -75.6840 },
        { name: 'Lees', lat: 45.4160, lng: -75.6730 },
        { name: 'Tremblay', lat: 45.4160, lng: -75.6520 },
        { name: 'Cyrville', lat: 45.4290, lng: -75.6180 },
        { name: 'Greenboro', lat: 45.3610, lng: -75.6350 },
        { name: 'South Keys', lat: 45.3590, lng: -75.6500 },
        { name: 'Carleton', lat: 45.3850, lng: -75.6960 },
        { name: "Mooney's Bay", lat: 45.3770, lng: -75.6890 },
        { name: 'Walkley', lat: 45.3700, lng: -75.6590 },
        { name: 'Lansdowne', lat: 45.3990, lng: -75.6830 },
        { name: 'Lincoln Fields', lat: 45.3540, lng: -75.7600 },
        { name: 'Billings Bridge', lat: 45.3840, lng: -75.6800 },
        { name: 'Place d\'Orleans', lat: 45.4770, lng: -75.5170 },
        { name: 'Baseline', lat: 45.3530, lng: -75.7590 },
        { name: 'Westboro', lat: 45.3930, lng: -75.7530 },
      ];

      const results: { name: string; travelTime: number; routes: string[] }[] = [];
      const batchSize = 6;
      for (let i = 0; i < nearbyStops.length; i += batchSize) {
        const batch = nearbyStops.slice(i, i + batchSize);
        const promises = batch.map(async (stop) => {
          try {
            const url = `${PLAN_URL}?fromLat=${lat}&fromLng=${lng}&fromLabel=Me&toLat=${stop.lat}&toLng=${stop.lng}&toLabel=${encodeURIComponent(stop.name)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false`;
            const resp = await fetchWithTimeout(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (data.itineraries && data.itineraries.length > 0) {
              const best = data.itineraries[0];
              const durationMins = Math.round(best.duration / 60);
              if (durationMins <= 20) {
                const transitLegs = (best.legs || []).filter((l: any) => l.mode !== 'WALK');
                const routes = [...new Set(transitLegs.map((l: any) => l.routeShortName).filter(Boolean))] as string[];
                return { name: stop.name, travelTime: durationMins, routes };
              }
            }
          } catch (e) { if (__DEV__) console.warn('isochrone stop query failed:', e); }
          return null;
        });
        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
          if (r) results.push(r);
        }
      }

      results.sort((a, b) => a.travelTime - b.travelTime);
      setIsoStops(results);

      // Fetch nearby places within isochrone coverage
      setIsoPlacesLoading(true);
      setIsoPlaces([]);
      try {
        const PLACE_CATEGORIES: { type: string; category: string; icon: string }[] = [
          { type: 'restaurant', category: 'Food', icon: 'restaurant-outline' },
          { type: 'park', category: 'Parks', icon: 'leaf-outline' },
          { type: 'transit_station', category: 'Transit', icon: 'train-outline' },
        ];
        const placePromises = PLACE_CATEGORIES.map(async (cat) => {
          try {
            const pResp = await fetchWithTimeout(`${PLACES_URL}?action=nearby&lat=${lat}&lng=${lng}&radius=2000&type=${cat.type}`);
            if (!pResp.ok) return [];
            const pData = await pResp.json();
            return (pData.results || []).slice(0, 4).map((p: any) => {
              const dKm = haversineKm(lat, lng, p.lat || p.geometry?.location?.lat || 0, p.lng || p.geometry?.location?.lng || 0);
              const walkMin = Math.round((dKm / 1.4) * 60 / 60); // ~1.4 m/s walk speed
              return { name: p.name, category: cat.category, icon: cat.icon, time: Math.max(walkMin, 1) };
            });
          } catch { return []; }
        });
        const allResults = await Promise.all(placePromises);
        setIsoPlaces(allResults.flat());
      } catch {}
      setIsoPlacesLoading(false);
    } catch (e) {
      Alert.alert(t('Error', 'Erreur'), t('Could not fetch reachable stops.', 'Impossible de trouver les arr\u00eats accessibles.'));
    }
    setIsoLoading(false);
  };

  // ── Render helpers ────────────────────────────────────────────
  const renderLegPill = (leg: Leg, i: number) => {
    const color = LEG_COLOURS[leg.mode] || colours.accent;
    const icon = LEG_ICONS[leg.mode] || 'bus';
    return (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {i > 0 && <View style={{ width: 6, height: 1, backgroundColor: colours.border }} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: color + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Ionicons name={icon as any} size={10} color={color} />
          {leg.mode !== 'WALK' && leg.mode !== 'CAR' && leg.mode !== 'BICYCLE' && leg.routeShortName && (
            <Text style={{ fontSize: 10, fontWeight: '800', color }}>{leg.routeShortName}</Text>
          )}
          {(leg.mode === 'WALK' || leg.mode === 'CAR' || leg.mode === 'BICYCLE') && (
            <Text style={{ fontSize: 10, fontWeight: '600', color }}>{fmtDistance(leg.distance)}</Text>
          )}
        </View>
      </View>
    );
  };

  // Detect cross-border trips (OC Transpo + STO)
  const hasCrossBorderTrip = (itin: Itinerary): boolean => {
    const agencies = new Set((itin.legs || []).map(leg => leg.agencyId).filter(Boolean));
    return agencies.has('1:STO') && agencies.has('2:1');
  };

  const renderItinerary = (itin: Itinerary, idx: number) => {
    const isWalkOnly = (itin.legs || []).every(l => l.mode === 'WALK');
    const hasTransit = (itin.legs || []).some(l => l.mode === 'BUS' || l.mode === 'TRAM' || l.mode === 'RAIL' || l.mode === 'SUBWAY' || l.mode === 'FERRY');
    // BEST = first itinerary for non-walk transit, or first for drive/bike
    const isFirst = idx === 0 && (travelMode !== 'transit' || !isWalkOnly);
    const transferCount = itin.transfers;

    return (
      <TouchableOpacity
        key={idx}
        onPress={() => setExpandedItinerary(itin)}
        style={[{
          backgroundColor: colours.surface,
          borderRadius: 16,
          padding: 16,
          marginBottom: 10,
          borderWidth: isFirst ? 2 : 1,
          borderColor: isFirst ? colours.accent : isWalkOnly ? colours.border : colours.border,
        }, cardShadow]}
        activeOpacity={0.85}
      >
        {/* Badge — mode-specific */}
        {travelMode !== 'transit' && isFirst && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: (LEG_COLOURS[travelMode === 'driving' ? 'CAR' : travelMode === 'bicycling' ? 'BICYCLE' : 'WALK'] || colours.accent) + '20', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: (LEG_COLOURS[travelMode === 'driving' ? 'CAR' : travelMode === 'bicycling' ? 'BICYCLE' : 'WALK'] || colours.accent) + '40' }}>
            <Text style={{ color: LEG_COLOURS[travelMode === 'driving' ? 'CAR' : travelMode === 'bicycling' ? 'BICYCLE' : 'WALK'] || colours.accent, fontSize: 9, fontWeight: '800' }}>
              {travelMode === 'driving' ? t('DRIVE', 'AUTO') : travelMode === 'bicycling' ? t('CYCLE', 'VELO') : t('WALK', 'MARCHE')}
            </Text>
          </View>
        )}
        {travelMode === 'transit' && isFirst && !isWalkOnly && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: colours.accent, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>{arriveBy ? t('RECOMMENDED', 'RECOMMANDE') : t('FASTEST', 'PLUS RAPIDE')}</Text>
          </View>
        )}
        {travelMode === 'transit' && !isFirst && !isWalkOnly && arriveBy && (() => {
          const targetMs = departTime.getTime();
          const buffer = targetMs - (itin.endTime ?? 0);
          const bufferMin = Math.round(buffer / 60000);
          if (bufferMin < 5 && bufferMin > -30) {
            return (
              <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#e8a020' + '20', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#e8a020' + '40' }}>
                <Text style={{ color: '#e8a020', fontSize: 9, fontWeight: '800' }}>{t('TIGHT', 'SERRE')}</Text>
              </View>
            );
          }
          return null;
        })()}
        {travelMode === 'transit' && isWalkOnly && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#34c759' + '20', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#34c759' + '40' }}>
            <Text style={{ color: '#34c759', fontSize: 9, fontWeight: '800' }}>{t('FREE', 'GRATUIT')}</Text>
          </View>
        )}

        {/* Time row */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colours.text }}>{fmtDuration(itin.duration)}</Text>
          <Text style={{ fontSize: 13, color: colours.muted }}>
            {fmtTime(itin.startTime)} → {fmtTime(itin.endTime)}
          </Text>
        </View>

        {/* Leg pills — hide for single-leg non-transit */}
        {(travelMode === 'transit' || (itin.legs || []).length > 1) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {(itin.legs || []).map((leg, i) => renderLegPill(leg, i))}
          </View>
        )}

        {/* Cross-border warning — transit only */}
        {travelMode === 'transit' && hasCrossBorderTrip(itin) && (
          <View style={{ backgroundColor: '#ff9500' + '15', borderLeftWidth: 3, borderLeftColor: '#ff9500', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#ff9500', fontWeight: '600' }}>{t('Cross-Border Trip', 'Trajet interregional')}</Text>
            <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }}>{t('Separate Presto tap required ($4.10 each)', 'Paiement Presto distinct requis (4,10 $ chacun)')}</Text>
          </View>
        )}

        {/* Detour / alert warnings on planned routes */}
        {(() => {
          const affectedLegs = (itin.legs || []).filter(leg => leg.routeShortName && alerts.some(a => a.routes.includes(leg.routeShortName!)));
          if (affectedLegs.length === 0) return null;
          const affectedRoutes = [...new Set(affectedLegs.map(l => l.routeShortName))];
          const matchingAlert = alerts.find(a => affectedRoutes.some(r => a.routes.includes(r!)));
          return (
            <View style={{ backgroundColor: '#cc3b2a12', borderLeftWidth: 3, borderLeftColor: '#cc3b2a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <Ionicons name="warning" size={12} color="#cc3b2a" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#cc3b2a' }}>{t('Service alert on this route', 'Alerte de service sur ce trajet')}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={2}>{t(`Route ${affectedRoutes.join(', ')}`, `Ligne ${affectedRoutes.join(', ')}`)} — {matchingAlert?.title || ''}</Text>
            </View>
          );
        })()}

        {/* Transfer warnings with reliability data — transit only */}
        {travelMode === 'transit' && (itin.legs || []).map((leg, i, arr) => {
          if (i === 0) return null;
          const prevLeg = arr[i - 1];
          if (prevLeg.mode === 'WALK' || leg.mode === 'WALK') return null;
          const connectionMin = Math.round((leg.startTime - prevLeg.endTime) / 60000);
          const incomingRoute = prevLeg.routeShortName;
          const connectingRoute = leg.routeShortName;
          const hasAlert = connectingRoute && alerts.some(a => a.routes.includes(connectingRoute));
          const reliability = incomingRoute ? transferReliability[incomingRoute] : null;
          const transferStop = prevLeg.to?.name || '';
          const warnings: { text: string; textFr: string; color: string }[] = [];

          // Very tight transfer (<3 min) — always warn
          if (connectionMin < 3) {
            warnings.push({
              text: `Very tight transfer — consider the next departure`,
              textFr: `Correspondance tres serree — envisagez le prochain depart`,
              color: '#cc3b2a',
            });
          }
          // Tight + unreliable (<5 min AND <80% on time)
          else if (connectionMin < 5 && reliability && reliability.onTimePercent < 80) {
            warnings.push({
              text: `Tight transfer at ${transferStop} — Route ${incomingRoute} was late ${100 - reliability.onTimePercent}% of the time this week`,
              textFr: `Correspondance serree a ${transferStop} — Route ${incomingRoute} etait en retard ${100 - reliability.onTimePercent}% du temps cette semaine`,
              color: '#F59E0B',
            });
          }
          // Route unreliable (<60% on time)
          if (reliability && reliability.onTimePercent < 60 && !warnings.some(w => w.color === '#cc3b2a')) {
            warnings.push({
              text: `Route ${incomingRoute} has been unreliable this week (${reliability.onTimePercent}% on time)`,
              textFr: `Route ${incomingRoute} a ete peu fiable cette semaine (${reliability.onTimePercent}% a l'heure)`,
              color: '#F59E0B',
            });
          }
          // Alert on connecting route
          if (hasAlert) {
            warnings.push({
              text: `Alert on connecting Route ${connectingRoute} at ${transferStop}`,
              textFr: `Alerte sur la Route ${connectingRoute} a ${transferStop}`,
              color: '#cc3b2a',
            });
          }
          // Long wait (>15 min)
          if (connectionMin > 15) {
            warnings.push({
              text: `Long wait — ${connectionMin} min at ${transferStop}`,
              textFr: `Longue attente — ${connectionMin} min a ${transferStop}`,
              color: '#ff9500',
            });
          }
          // Tight transfer (3-5 min, no reliability data or good reliability)
          if (connectionMin <= 3 && warnings.length === 0) {
            warnings.push({
              text: `Tight transfer — ${connectionMin} min`,
              textFr: `Correspondance serree — ${connectionMin} min`,
              color: '#ff9500',
            });
          }

          if (warnings.length === 0) return null;
          const topColor = warnings[0].color;
          return (
            <View key={`transfer-${i}`} style={{ backgroundColor: topColor + '12', borderLeftWidth: 3, borderLeftColor: topColor, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8, gap: 4 }}>
              {warnings.map((w, wi) => (
                <View key={wi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="warning" size={12} color={w.color} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: w.color, flex: 1 }}>{t(w.text, w.textFr)}</Text>
                </View>
              ))}
              {!warnings.some(w => w.color === '#cc3b2a' || w.color === '#F59E0B') && connectionMin <= 5 && (
                <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{t(`${transferStop} → Route ${connectingRoute || ''}`, `${transferStop} → Route ${connectingRoute || ''}`)}</Text>
              )}
            </View>
          );
        })}

        {/* Footer row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {travelMode === 'transit' && hasTransit && (
              <Text style={{ fontSize: 11, color: colours.muted }}>
                <Text style={{ fontWeight: '700' }}>{transferCount}</Text> {t(transferCount !== 1 ? 'transfers' : 'transfer', transferCount !== 1 ? 'correspondances' : 'correspondance')}
              </Text>
            )}
            {(travelMode === 'driving' || travelMode === 'bicycling') ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={travelMode === 'driving' ? 'speedometer-outline' : 'bicycle-outline'} size={13} color={colours.muted} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted }}>
                  {fmtDistance((itin.legs || []).reduce((s, l) => s + l.distance, 0))}
                </Text>
              </View>
            ) : travelMode === 'walking' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="walk-outline" size={13} color={colours.muted} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted }}>
                  {fmtDistance((itin.legs || []).reduce((s, l) => s + l.distance, 0))}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: colours.muted }}>
                {fmtWalk(itin.walkDistance)}
              </Text>
            )}
            {travelMode === 'transit' && hasTransit && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                {accessibleRouting && <Ionicons name="accessibility-outline" size={10} color={colours.accent} />}
                <Text style={{ fontSize: 10, color: colours.accent }}>🎫</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>$4.10 Presto</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setReminderModal({ itin, idx }); setReminderTime(new Date(itin.startTime - 5 * 60 * 1000)); }}
              style={{ width: 36, height: 36, borderRadius: 20, backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '30', alignItems: 'center', justifyContent: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={t('Set reminder', 'Definir un rappel')}
            >
              <Ionicons name="notifications-outline" size={16} color={colours.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium); setActiveTripItinerary(itin); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#34c759', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('Start trip', 'Demarrer le trajet')}
            >
              <Ionicons name="navigate" size={12} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>GO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Transit trip notifications ────────────────────────────────
  const requestNotifPermission = async (): Promise<boolean> => {
    if (!Notifications) return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  const cancelTransitNotifications = async () => {
    if (!Notifications) return;
    for (const id of transitNotifIds.current) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }
    transitNotifIds.current = [];
  };

  const scheduleTransitNotifications = async (itin: Itinerary) => {
    if (!Notifications) return;
    const permitted = await requestNotifPermission();
    if (!permitted) return;

    await cancelTransitNotifications();

    const now = Date.now();
    const ids: string[] = [];

    for (const leg of itin.legs) {
      if (leg.mode === 'WALK') continue;

      const boardingMs = leg.startTime;
      // Fire 2 min before boarding — enough time to walk to the stop
      const fireAt = boardingMs - 2 * 60 * 1000;
      if (fireAt <= now) continue; // leg is imminent or past — skip

      const routeName = leg.routeShortName
        ? (leg.mode === 'WALK' ? '' : `Route ${leg.routeShortName}`)
        : leg.mode === 'TRAM' || leg.mode === 'RAIL' ? 'O-Train' : 'Bus';
      const fromStop = leg.from.name
        .replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '')
        .replace(/ \/ EST$| \/ OUEST$/i, '');
      const headsign = leg.headsign ? ` → ${leg.headsign}` : '';
      const minsUntil = Math.round((boardingMs - now) / 60000);

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: t(`🚌 ${routeName} in 2 min`, `🚌 ${routeName} dans 2 min`),
            body: t(`Board at ${fromStop}${headsign}`, `Montez \u00e0 ${fromStop}${headsign}`),
            data: { type: 'transit_leg' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(fireAt),
          },
        });
        ids.push(id);
      } catch (e) { if (__DEV__) console.warn('schedule departure notification failed:', e); }

      // Also fire a heads-up at boarding time itself ("time to board")
      try {
        const id2 = await Notifications.scheduleNotificationAsync({
          content: {
            title: t(`🟢 Board now — ${routeName}`, `🟢 Montez maintenant — ${routeName}`),
            body: `${fromStop}${headsign} · ${fmtTime(boardingMs)}`,
            data: { type: 'transit_board' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(boardingMs),
          },
        });
        ids.push(id2);
      } catch (e) { if (__DEV__) console.warn('schedule boarding notification failed:', e); }
    }

    // Arrival notification
    const arrivalFireAt = itin.endTime - 60 * 1000;
    if (arrivalFireAt > now) {
      try {
        const id3 = await Notifications.scheduleNotificationAsync({
          content: {
            title: t('📍 Arriving soon', '📍 Arriv\u00e9e imminente'),
            body: t(`You reach your destination at ${fmtTime(itin.endTime)}`, `Vous arrivez \u00e0 destination \u00e0 ${fmtTime(itin.endTime)}`),
            data: { type: 'transit_arrive' },
            sound: false,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(arrivalFireAt),
          },
        });
        ids.push(id3);
      } catch (e) { if (__DEV__) console.warn('schedule arrival notification failed:', e); }
    }

    transitNotifIds.current = ids;
  };

  // ── Live tracking ─────────────────────────────────────────────
  const stopTracking = () => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    setTracking(false);
    setUserLocation(null);
    cancelTransitNotifications();
  };

  const closeExpandedModal = () => {
    stopTracking();
    setExpandedItinerary(null);
    setExpandedLeg(null);
    setActiveLeg(0);
  };

  const startTracking = async (itin: Itinerary) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setTracking(true);
      setActiveLeg(0);
      // Schedule turn-by-turn transit notifications
      scheduleTransitNotifications(itin);
      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserLocation({ latitude, longitude });
          setActiveLeg(prev => {
            const leg = (itin.legs || [])[prev];
            if (!leg?.to) return prev;
            const dest = { latitude: leg.to.lat, longitude: leg.to.lon };
            const dist = Math.sqrt(
              Math.pow((latitude - dest.latitude) * 111000, 2) +
              Math.pow((longitude - dest.longitude) * 111000 * Math.cos(dest.latitude * Math.PI / 180), 2)
            );
            if (dist < 40 && prev < (itin.legs || []).length - 1) {
              stepsScrollRef.current?.scrollTo({ y: (prev + 1) * 120, animated: true });
              return prev + 1;
            }
            return prev;
          });
          mapRef.current?.animateToRegion({
            latitude, longitude,
            latitudeDelta: 0.005, longitudeDelta: 0.005,
          }, 500);
        }
      );
    } catch (e) { if (__DEV__) console.warn('start location tracking failed:', e); }
  };

  const renderExpandedItinerary = () => {
    if (!expandedItinerary) return null;
    const allCoords = (expandedItinerary.legs || []).flatMap(leg => legCoords(leg));
    const initialRegion = getBounds(allCoords);

    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={closeExpandedModal}>
        <View style={{ flex: 1, backgroundColor: colours.bg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colours.text }}>{fmtDuration(expandedItinerary.duration)}</Text>
              <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>{fmtTime(expandedItinerary.startTime)} → {fmtTime(expandedItinerary.endTime)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Share button */}
              <TouchableOpacity
                onPress={() => {
                  const itin = expandedItinerary!;
                  const routes = itin.legs
                    .filter(l => l.mode !== 'WALK')
                    .map(l => l.routeShortName || l.mode)
                    .join(', ');
                  const message = t(
                    `RouteO Trip 🚌\n${fromText} → ${toText}\n${fmtDuration(itin.duration)} · Departs ${fmtTime(itin.startTime)} · Arrives ${fmtTime(itin.endTime)}\n${itin.transfers} transfer${itin.transfers !== 1 ? 's' : ''} · ${fmtWalk(itin.walkDistance)}\nRoute${routes ? `s: ${routes}` : ': Walk'}\nPlanned with RouteO for OC Transpo Ottawa`,
                    `Trajet RouteO 🚌\n${fromText} → ${toText}\n${fmtDuration(itin.duration)} · D\u00e9part ${fmtTime(itin.startTime)} · Arriv\u00e9e ${fmtTime(itin.endTime)}\n${itin.transfers} correspondance${itin.transfers !== 1 ? 's' : ''} · ${fmtWalk(itin.walkDistance)}\nLigne${routes ? `s: ${routes}` : ': Marche'}\nPlanifi\u00e9 avec RouteO pour OC Transpo Ottawa`
                  );
                  Share.share({ message });
                }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
                accessibilityRole="button"
                accessibilityLabel={t('Share trip', 'Partager le trajet')}
              >
                <Ionicons name="share-social-outline" size={16} color={colours.accent} />
              </TouchableOpacity>
              {/* Notification indicator — shows when trip notifications are armed */}
              {tracking && transitNotifIds.current.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#34c759' + '18', borderWidth: 1, borderColor: '#34c759' + '50' }}>
                  <Ionicons name="notifications" size={12} color="#34c759" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#34c759' }}>{t('Notifying', 'Notifications')}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
                  setActiveTripItinerary(expandedItinerary);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#34c759' }}
                accessibilityRole="button"
                accessibilityLabel={t('Start active trip', 'Demarrer le trajet actif')}
              >
                <Ionicons name="navigate" size={14} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>GO</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeExpandedModal} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close trip details', 'Fermer les details du trajet')}>
                <Ionicons name="close" size={18} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Map */}
          <View style={{ height: SCREEN_H * 0.38 }}>
            {!MapView ? <View style={{ flex: 1, backgroundColor: colours.surface }} /> : <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              provider={PROVIDER_DEFAULT}
              initialRegion={initialRegion}
              showsUserLocation={false}
              showsCompass={false}
              showsScale={false}
              onLayout={() => {
                if (!tracking) {
                  mapRef.current?.fitToCoordinates(allCoords, {
                    edgePadding: { top: 32, right: 32, bottom: 32, left: 32 },
                    animated: false,
                  });
                }
              }}
            >
              {(expandedItinerary.legs || []).map((leg, i) => {
                const coords = legCoords(leg);
                if (!coords || coords.length < 2) return null;
                const color = LEG_COLOURS[leg.mode] || colours.accent;
                const isActive = tracking && i === activeLeg;
                return (
                  <Polyline
                    key={i}
                    coordinates={coords}
                    strokeColor={color}
                    strokeWidth={isActive ? 5 : 3}
                    lineDashPattern={leg.mode === 'WALK' ? [6, 4] : undefined}
                  />
                );
              })}
              {(expandedItinerary.legs || []).filter(leg => leg.from?.lat != null).map((leg, i) => (
                <Marker key={`m${i}`} coordinate={{ latitude: leg.from.lat, longitude: leg.from.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LEG_COLOURS[leg.mode] || colours.accent, borderWidth: 2, borderColor: 'white' }} />
                </Marker>
              ))}
              <Marker
                coordinate={{ latitude: (expandedItinerary.legs || [])[((expandedItinerary.legs || []).length - 1)]?.to?.lat ?? 0, longitude: (expandedItinerary.legs || [])[((expandedItinerary.legs || []).length - 1)]?.to?.lon ?? 0 }}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={{ alignItems: 'center' }}>
                  <View style={{ backgroundColor: colours.accent, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
                    <Ionicons name="location" size={14} color="white" />
                  </View>
                  <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colours.accent }} />
                </View>
              </Marker>
              {userLocation && (
                <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#007AFF', borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4 }} />
                </Marker>
              )}
            </MapView>}
            {tracking && (
              <TouchableOpacity
                onPress={() => userLocation && mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400)}
                style={{ position: 'absolute', bottom: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4 }}
              >
                <Ionicons name="locate" size={18} color={colours.accent} />
              </TouchableOpacity>
            )}
            {tracking && (
              <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colours.surface + 'EE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colours.border }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34c759' }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }}>
                  {activeLeg < (expandedItinerary.legs || []).length
                    ? `${(expandedItinerary.legs || [])[activeLeg]?.mode === 'WALK' ? t('Walking', 'Marche') : `Route ${(expandedItinerary.legs || [])[activeLeg]?.routeShortName}`}`
                    : t('Arrived', 'Arrive')}
                </Text>
              </View>
            )}
          </View>

          {/* Steps */}
          <ScrollView ref={stepsScrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {(expandedItinerary.legs || []).map((leg, i) => {
              const color = LEG_COLOURS[leg.mode] || colours.accent;
              const icon = LEG_ICONS[leg.mode] || 'bus';
              const isExpanded = expandedLeg === i;
              const isWalk = leg.mode === 'WALK';
              const isCurrentLeg = tracking && i === activeLeg;
              return (
                <View key={i}>
                  <TouchableOpacity
                    onPress={() => setExpandedLeg(isExpanded ? null : i)}
                    style={{ backgroundColor: isCurrentLeg ? color + '12' : colours.surface, borderRadius: 12, padding: 14, borderWidth: isCurrentLeg ? 1.5 : 1, borderColor: isCurrentLeg ? color : colours.border, borderLeftWidth: 4, borderLeftColor: color }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={icon as any} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {isWalk ? (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{t('Walk', 'Marche')} {fmtDistance(leg.distance)}</Text>
                        ) : leg.mode === 'CAR' ? (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{t('Drive', 'Conduire')} {fmtDistance(leg.distance)}</Text>
                        ) : leg.mode === 'BICYCLE' ? (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{t('Cycle', 'Pedaler')} {fmtDistance(leg.distance)}</Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                              {leg.routeShortName ? `Route ${leg.routeShortName}` : leg.mode}
                              {leg.headsign ? <Text style={{ fontWeight: '500', color: colours.muted }}> → {leg.headsign}</Text> : null}
                            </Text>
                            {accessibleRouting && <Ionicons name="accessibility-outline" size={12} color="#007AFF" />}
                          </View>
                        )}
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                          {toTitleCase((leg.from?.name || '').replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, ''))} → {toTitleCase((leg.to?.name || '').replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, ''))}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{fmtTime(leg.startTime)}</Text>
                        <Text style={{ fontSize: 11, color: colours.muted }}>{fmtDuration(leg.duration)}</Text>
                      </View>
                    </View>
                    {!isWalk && (leg.intermediateStops || []).length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{(leg.intermediateStops || []).length} {t((leg.intermediateStops || []).length !== 1 ? 'stops' : 'stop', (leg.intermediateStops || []).length !== 1 ? 'arrets' : 'arret')}</Text>
                      </View>
                    )}
                    {!isWalk && isExpanded && (leg.intermediateStops || []).length > 0 && (
                      <View style={{ marginTop: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: color + '40', gap: 6 }}>
                        {(leg.intermediateStops || []).map((stop, si) => (
                          <Text key={si} style={{ fontSize: 12, color: colours.muted }}>• {stop}</Text>
                        ))}
                      </View>
                    )}
                    {(isWalk || leg.mode === 'CAR' || leg.mode === 'BICYCLE') && (leg.steps || []).length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{isExpanded
                          ? t(leg.mode === 'CAR' ? 'Hide driving directions' : leg.mode === 'BICYCLE' ? 'Hide cycling directions' : 'Hide walking directions', leg.mode === 'CAR' ? 'Masquer les directions' : leg.mode === 'BICYCLE' ? 'Masquer les directions velo' : 'Masquer les directions a pied')
                          : t(leg.mode === 'CAR' ? 'Show driving directions' : leg.mode === 'BICYCLE' ? 'Show cycling directions' : 'Show walking directions', leg.mode === 'CAR' ? 'Afficher les directions' : leg.mode === 'BICYCLE' ? 'Afficher les directions velo' : 'Afficher les directions a pied')
                        }</Text>
                      </View>
                    )}
                    {(isWalk || leg.mode === 'CAR' || leg.mode === 'BICYCLE') && isExpanded && (leg.steps || []).length > 0 && (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        {(leg.steps || []).map((step, si) => {
                          const isGeneric = !step.streetName || ['path', 'sidewalk', 'footway', 'steps', 'pedestrian'].includes(step.streetName?.toLowerCase());
                          const dirLabel: Record<string, string> = {
                            DEPART: 'Head', CONTINUE: 'Continue', LEFT: 'Turn left onto', RIGHT: 'Turn right onto',
                            SLIGHTLY_LEFT: 'Bear left onto', SLIGHTLY_RIGHT: 'Bear right onto',
                            HARD_LEFT: 'Sharp left onto', HARD_RIGHT: 'Sharp right onto',
                            UTURN_LEFT: 'U-turn onto', UTURN_RIGHT: 'U-turn onto',
                            CIRCLE_CLOCKWISE: 'Take roundabout onto', CIRCLE_COUNTERCLOCKWISE: 'Take roundabout onto',
                          };
                          const verb = dirLabel[step.relativeDirection] ?? step.relativeDirection.toLowerCase().replace(/_/g, ' ');
                          const displayText = step.instruction
                            ? `${step.instruction} (${fmtDistance(step.distance)})`
                            : isGeneric
                              ? `${step.relativeDirection === 'CONTINUE' ? 'Continue straight' : verb} (${fmtDistance(step.distance)})`
                              : `${verb}${verb.endsWith('onto') ? '' : ' on'} ${step.streetName} (${fmtDistance(step.distance)})`;
                          return (
                            <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Ionicons name={directionIcon(step.relativeDirection) as any} size={14} color={colours.muted} />
                              <Text style={{ fontSize: 12, color: colours.muted, flex: 1 }}>
                                <Text style={{ fontWeight: step.streetName && !isGeneric ? '600' : '400', color: colours.text }}>{displayText}</Text>
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {leg.mode === 'WALK' && accessibleRouting && (leg.steps || []).some(s => s.relativeDirection === 'ELEVATOR' || /stair|step|escal/i.test(s.streetName || '')) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF9500' + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 }}>
                        <Ionicons name="warning-outline" size={14} color="#FF9500" />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#FF9500' }}>{t('This route may include stairs', 'Ce trajet peut inclure des escaliers')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {i < (expandedItinerary.legs || []).length - 1 && (
                    <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                      <View style={{ width: 2, height: 14, backgroundColor: colours.border }} />
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colours.accent + '12', borderRadius: 12, borderWidth: 1, borderColor: colours.accent + '30' }}>
              <Ionicons name="location" size={18} color={colours.accent} />
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>{t('Arrive', 'Arrivee')} {fmtTime(expandedItinerary.endTime)}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>{toPlace ? shortenLabel(toPlace.label) : ''}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // (time picker is now inline — no modal needed)

  // ── Main render ───────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colours.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {renderExpandedItinerary()}
      {activeTripItinerary && (
        <ActiveTrip
          visible={!!activeTripItinerary}
          itinerary={activeTripItinerary}
          onEnd={() => { setActiveTripItinerary(null); stopTracking(); }}
          colours={colours}
          t={t}
          reducedMotion={reducedMotion}
          batterySaver={batterySaverMode}
          alerts={alerts}
        />
      )}

      <ScrollView ref={mainScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              if (!fromPlace?.lat || !toPlace?.lat) return;
              setRefreshing(true);
              await plan();
              setRefreshing(false);
            }}
            tintColor={colours.accent}
            colors={[colours.accent]}
          />
        }
      >
        {/* Input card */}
        <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, padding: 8, marginBottom: 12 }, cardShadow]}>
          {/* From */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colours.accent, backgroundColor: colours.bg }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder={t('From...', 'De...')}
              placeholderTextColor={colours.muted}
              accessibilityLabel={t('Starting location', 'Lieu de depart')}
              accessibilityRole="search"
              value={fromText}
              onChangeText={text => {
                setFromText(text);
                setFromPlace(null);
                if (autoCompleteTimer.current) clearTimeout(autoCompleteTimer.current);
                if (text.length < 2) { setFromResults([]); return; }
                autoCompleteTimer.current = setTimeout(() => { autocomplete(text, 'from'); }, 300);
              }}
              onFocus={() => {
                if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
                setActiveInput('from');
                setToResults([]);
              }}
              onBlur={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                blurTimer.current = setTimeout(() => setActiveInput(prev => prev === 'from' ? null : prev), 200);
              }}
            />
            <TouchableOpacity onPress={() => useMyLocation('from')} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('Use my location as start', 'Utiliser ma position comme depart')}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>

          {/* Divider + swap */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
            <TouchableOpacity onPress={swap} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }} accessibilityRole="button" accessibilityLabel={t('Swap start and destination', 'Inverser depart et destination')}>
              <Ionicons name="swap-vertical" size={14} color={colours.muted} />
            </TouchableOpacity>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
          </View>

          {/* Waypoints */}
          {waypoints.map((wp, idx) => (
            <View key={`wp_${idx}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colours.accentAlt + '40', borderWidth: 2, borderColor: colours.accentAlt }} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
                  placeholder={t(`Stop ${idx + 1}...`, `Arret ${idx + 1}...`)}
                  placeholderTextColor={colours.muted}
                  value={wp.text}
                  onChangeText={text => {
                    setWaypoints(prev => prev.map((w, i) => i === idx ? { text, place: null } : w));
                    if (autoCompleteTimer.current) clearTimeout(autoCompleteTimer.current);
                    autoCompleteTimer.current = setTimeout(() => { autocomplete(text, `waypoint_${idx}` as any); }, 300);
                  }}
                  onFocus={() => {
                    if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
                    setActiveInput(`waypoint_${idx}` as any); setFromResults([]); setToResults([]);
                  }}
                  onBlur={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    const field = `waypoint_${idx}`;
                    blurTimer.current = setTimeout(() => setActiveInput(prev => prev === field ? null : prev), 200);
                  }}
                />
                <TouchableOpacity onPress={() => { setWaypoints(prev => prev.filter((_, i) => i !== idx)); setWaypointResults(prev => { const next = { ...prev }; delete next[idx]; return next; }); }} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('Remove stop', 'Retirer l\'arret')}>
                  <Ionicons name="close-circle" size={18} color={colours.muted} />
                </TouchableOpacity>
              </View>
              <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 12 }} />
            </View>
          ))}

          {/* Add stop button */}
          {waypoints.length < 3 && (
            <TouchableOpacity
              onPress={() => setWaypoints(prev => [...prev, { text: '', place: null }])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colours.accent }}>{t('Add stop', 'Ajouter un arret')}</Text>
            </TouchableOpacity>
          )}

          {/* To */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <Ionicons name="location" size={12} color={colours.accent} style={{ marginLeft: -1 }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder={t('To...', 'Vers...')}
              placeholderTextColor={colours.muted}
              accessibilityLabel={t('Destination', 'Destination')}
              accessibilityRole="search"
              value={toText}
              onChangeText={text => {
                setToText(text);
                setToPlace(null);
                if (autoCompleteTimer.current) clearTimeout(autoCompleteTimer.current);
                if (text.length < 2) { setToResults([]); return; }
                autoCompleteTimer.current = setTimeout(() => { autocomplete(text, 'to'); }, 300);
              }}
              onFocus={() => {
                if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
                setActiveInput('to');
                setFromResults([]);
              }}
              onBlur={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                blurTimer.current = setTimeout(() => setActiveInput(prev => prev === 'to' ? null : prev), 200);
              }}
            />
            <TouchableOpacity onPress={() => useMyLocation('to')} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('Use my location as destination', 'Utiliser ma position comme destination')}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Autocomplete results — only show for the active field */}
        {autoLoading && fromResults.length === 0 && activeInput === 'from' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            <ActivityIndicator size="small" color={colours.accent} style={{ padding: 12 }} />
          </View>
        )}
        {fromResults.length > 0 && activeInput === 'from' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            {fromResults.map((r, i) => (
              <TouchableOpacity
                key={r.placeId}
                onPress={async () => {
                  const resolved = await resolvePlace(r);
                  setFromPlace(resolved); setFromText(shortenLabel(resolved.label)); setFromResults([]);
                  Keyboard.dismiss();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < fromResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
              >
                <Ionicons name="location-outline" size={16} color={colours.muted} />
                <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={2}>{shortenLabel(r.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {autoLoading && toResults.length === 0 && activeInput === 'to' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            <ActivityIndicator size="small" color={colours.accent} style={{ padding: 12 }} />
          </View>
        )}
        {toResults.length > 0 && activeInput === 'to' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            {toResults.map((r, i) => (
              <TouchableOpacity
                key={r.placeId}
                onPress={async () => {
                  const resolved = await resolvePlace(r);
                  setToPlace(resolved); setToText(shortenLabel(resolved.label)); setToResults([]);
                  Keyboard.dismiss();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < toResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
              >
                <Ionicons name="location-outline" size={16} color={colours.muted} />
                <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={2}>{shortenLabel(r.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Waypoint autocomplete results */}
        {waypoints.map((_, idx) => {
          const results = waypointResults[idx] || [];
          if (results.length === 0 || activeInput !== `waypoint_${idx}`) return null;
          return (
            <View key={`wpr_${idx}`} style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
              {results.map((r, i) => (
                <TouchableOpacity
                  key={r.placeId}
                  onPress={async () => {
                    const resolved = await resolvePlace(r);
                    setWaypoints(prev => prev.map((w, wi) => wi === idx ? { text: shortenLabel(resolved.label), place: resolved } : w));
                    setWaypointResults(prev => { const next = { ...prev }; delete next[idx]; return next; });
                    Keyboard.dismiss();
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
                >
                  <Ionicons name="location-outline" size={16} color={colours.muted} />
                  <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={2}>{shortenLabel(r.label)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* Travel mode selector */}
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { key: 'transit' as const, icon: 'bus-outline', label_en: 'Transit', label_fr: 'Transport' },
              { key: 'driving' as const, icon: 'car-outline', label_en: 'Drive', label_fr: 'Auto' },
              { key: 'bicycling' as const, icon: 'bicycle-outline', label_en: 'Cycle', label_fr: 'Velo' },
              { key: 'walking' as const, icon: 'walk-outline', label_en: 'Walk', label_fr: 'Marche' },
            ]).map(m => {
              const active = travelMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setTravelMode(m.key)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }}
                  accessibilityRole="button"
                  accessibilityLabel={t(m.label_en, m.label_fr)}
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={m.icon as any} size={15} color={active ? colours.accent : colours.muted} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{t(m.label_en, m.label_fr)}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Accessible routing toggle */}
            <TouchableOpacity
              onPress={() => {
                const next = !accessibleRouting;
                setAccessibleRouting(next);
                AsyncStorage.setItem(SK_ACCESSIBILITY_ROUTING, String(next)).catch(() => {});
              }}
              style={{ width: 42, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: accessibleRouting ? '#007AFF' : colours.border, backgroundColor: accessibleRouting ? '#007AFF' + '15' : colours.surface }}
              accessibilityRole="button"
              accessibilityLabel={t('Accessible routes', 'Trajets accessibles')}
              accessibilityState={{ selected: accessibleRouting }}
            >
              <Ionicons name="accessibility-outline" size={17} color={accessibleRouting ? '#007AFF' : colours.muted} />
            </TouchableOpacity>
          </View>
          {accessibleRouting && (
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#007AFF', marginTop: 4 }}>
              {t('Accessible routes only', 'Trajets accessibles uniquement')}
            </Text>
          )}
          {/* Walk preferences — shown under Walk mode */}
          {travelMode === 'walking' && (
            <View style={{ gap: 6, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="speedometer-outline" size={14} color={colours.muted} />
                <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600' }}>{t('Pace', 'Rythme')}</Text>
                {([
                  { key: 'slow' as const, label_en: 'Slow', label_fr: 'Lent' },
                  { key: 'normal' as const, label_en: 'Normal', label_fr: 'Normal' },
                  { key: 'fast' as const, label_en: 'Fast', label_fr: 'Rapide' },
                ]).map(p => {
                  const active = walkPace === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => { setWalkPace(p.key); AsyncStorage.setItem(SK_WALK_PACE, p.key).catch(() => {}); }}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{t(p.label_en, p.label_fr)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Depart at / Arrive by toggle */}
        {<View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([false, true] as const).map(ab => {
              const active = arriveBy === ab;
              return (
                <TouchableOpacity
                  key={String(ab)}
                  onPress={() => { setArriveBy(ab); savePlannerPrefs(departTime, ab); setShowTimePicker(true); }}
                  style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }, cardShadow]}
                  accessibilityRole="button"
                  accessibilityLabel={ab ? t('Arrive by', 'Arriver avant') : t('Depart at', 'Depart a')}
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={ab ? 'flag-outline' : 'time-outline'} size={14} color={active ? colours.accent : colours.muted} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{ab ? t('Arrive by', 'Arriver avant') : t('Depart at', 'Depart a')}</Text>
                  {active && <Text style={{ fontSize: 13, fontWeight: '800', color: colours.accent }}>{fmtTime(departTime.getTime())}{departTime.toLocaleDateString('en-CA') !== new Date().toLocaleDateString('en-CA') ? ` ${departTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>}

        {/* Time & Date picker */}
        {showTimePicker && (
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <View style={[{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, padding: 12 }, cardShadow]}>
              {/* Now button */}
              <TouchableOpacity
                onPress={() => { const now = new Date(); setDepartTime(now); savePlannerPrefs(now, arriveBy); setShowTimePicker(false); }}
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15', marginBottom: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('Set time to now', 'Mettre a maintenant')}
              >
                <Ionicons name="locate-outline" size={13} color={colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>{t('Now', 'Maintenant')}</Text>
              </TouchableOpacity>

              {/* Custom wheel time picker */}
              {(() => {
                const h24 = departTime.getHours();
                const h12 = h24 % 12;
                const curMin = departTime.getMinutes();
                const minIdx = Math.round(curMin / 5);
                const ampmIdx = h24 >= 12 ? 1 : 0;
                const updateTime = (hour12: number, min5Idx: number, ampm: number) => {
                  const d = new Date(departTime);
                  let h = hour12 === 0 ? 0 : hour12; // 12 maps to index 0
                  if (hour12 === 0) h = 12; // index 0 = 12
                  const h24New = ampm === 1 ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                  d.setHours(h24New, min5Idx * 5, 0, 0);
                  setDepartTime(d);
                  savePlannerPrefs(d, arriveBy);
                };
                return (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: WHEEL_ITEM_H * WHEEL_VISIBLE }}>
                    <WheelColumn
                      items={HOURS_12}
                      selectedIndex={h12 === 0 ? 0 : HOURS_12.indexOf(String(h12 === 0 ? 12 : h12))}
                      onSelect={(idx) => updateTime(idx === 0 ? 12 : idx, minIdx, ampmIdx)}
                      width={60}
                      colours={colours}
                    />
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colours.text, marginHorizontal: 2 }}>:</Text>
                    <WheelColumn
                      items={MINUTES_60}
                      selectedIndex={minIdx >= MINUTES_60.length ? MINUTES_60.length - 1 : minIdx}
                      onSelect={(idx) => updateTime(h12 === 0 ? 12 : h12, idx, ampmIdx)}
                      width={50}
                      colours={colours}
                    />
                    <WheelColumn
                      items={AM_PM}
                      selectedIndex={ampmIdx}
                      onSelect={(idx) => updateTime(h12 === 0 ? 12 : h12, minIdx, idx)}
                      width={50}
                      colours={colours}
                    />
                  </View>
                );
              })()}

              {/* Done button */}
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={{ marginTop: 8, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 20, backgroundColor: colours.accent }}
                accessibilityRole="button"
                accessibilityLabel={t('Done selecting time', 'Termine la selection de l\'heure')}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{t('Done', 'Termine')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Plan button */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={plan}
            style={{ paddingVertical: 14, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('Plan Trip', 'Planifier le trajet')}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>{t('Plan Trip', 'Planifier le trajet')}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* What can I reach? */}
        {travelMode === 'transit' && (
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={fetchIsochrone}
              disabled={isoLoading}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '12' }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('What can I reach in 20 minutes', 'Que puis-je atteindre en 20 minutes')}
            >
              <Ionicons name="locate-outline" size={16} color={colours.accent} />
              <Text style={{ color: colours.accent, fontWeight: '700', fontSize: 14 }}>{t('What can I reach in 20 min?', 'Que puis-je atteindre en 20 min?')}</Text>
            </TouchableOpacity>

            {isoVisible && (<>
              <View style={[{ marginTop: 12, backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }, cardShadow]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="compass-outline" size={16} color={colours.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{t('Reachable in 20 min', 'Accessible en 20 min')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setIsoVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Close reachable stops', 'Fermer les arrets accessibles')}>
                    <Ionicons name="close-circle" size={20} color={colours.muted} />
                  </TouchableOpacity>
                </View>
                {isoLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator color={colours.accent} />
                    <Text style={{ color: colours.muted, fontSize: 12, marginTop: 8 }}>{t('Finding reachable stops...', 'Recherche des arrets accessibles...')}</Text>
                  </View>
                ) : isoStops.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Ionicons name="location-outline" size={28} color={colours.muted} />
                    <Text style={{ color: colours.muted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>{t('No transit stops reachable within 20 minutes from your current location.', 'Aucun arret de transport en commun accessible en 20 minutes depuis votre position.')}</Text>
                  </View>
                ) : (
                  isoStops.map((stop, i) => (
                    <View key={stop.name} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{toTitleCase(stop.name)}</Text>
                        {stop.routes.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {stop.routes.map(r => (
                              <View key={r} style={{ backgroundColor: colours.accent + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: colours.accent }}>{r}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colours.accent, marginLeft: 12 }}>{stop.travelTime}m</Text>
                    </View>
                  ))
                )}
              </View>

              {/* Nearby places within isochrone */}
              {isoPlaces.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {t('Nearby places', 'Lieux a proximite')}
                  </Text>
                  {(['Food', 'Parks', 'Transit'] as const).map(cat => {
                    const items = isoPlaces.filter(p => p.category === cat);
                    if (items.length === 0) return null;
                    return (
                      <View key={cat} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <Ionicons name={(items[0].icon) as any} size={13} color={colours.accent} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }}>{t(cat, cat === 'Food' ? 'Restos' : cat === 'Parks' ? 'Parcs' : 'Transport')}</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                          {items.map((place, pi) => (
                            <View key={pi} style={{ backgroundColor: colours.surface, borderRadius: 8, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, paddingVertical: 8, minWidth: 120 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }} numberOfLines={1}>{place.name}</Text>
                              <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>~{place.time} min</Text>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })}
                </View>
              )}
              {isoPlacesLoading && (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <ActivityIndicator color={colours.accent} size="small" />
                  <Text style={{ color: colours.muted, fontSize: 11, marginTop: 4 }}>{t('Finding nearby places...', 'Recherche des lieux...')}</Text>
                </View>
              )}
            </>)}
          </View>
        )}

        {/* Results */}
        {loading && searched ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>{[0,1,2].map(i => <ItinerarySkeleton key={i} colours={colours} />)}</View>
        ) : !loading && searched && error ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
            <Ionicons name="map-outline" size={40} color={colours.muted} />
            <Text style={{ color: colours.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>{t('No routes found', 'Aucun trajet trouv\u00e9')}</Text>
            <Text style={{ color: colours.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{error}</Text>
            <TouchableOpacity
              onPress={plan}
              style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: colours.accent }}
              accessibilityRole="button"
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('Try again', 'R\u00e9essayer')}</Text>
            </TouchableOpacity>
          </View>
        ) : !loading && itineraries.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {itineraries.length} {t(itineraries.length !== 1 ? 'routes found' : 'route found', itineraries.length !== 1 ? 'trajets trouv\u00e9s' : 'trajet trouv\u00e9')}
              </Text>
              <TouchableOpacity
                onPress={toggleSaveRoute}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: isRouteSaved() ? colours.accent : colours.border, backgroundColor: isRouteSaved() ? colours.accent + '15' : colours.surface }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isRouteSaved() ? t('Remove saved route', 'Retirer le trajet enregistre') : t('Save route', 'Enregistrer le trajet')}
                accessibilityState={{ selected: isRouteSaved() }}
              >
                <Ionicons name={isRouteSaved() ? 'bookmark' : 'bookmark-outline'} size={14} color={isRouteSaved() ? colours.accent : colours.muted} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: isRouteSaved() ? colours.accent : colours.muted }}>
                  {isRouteSaved() ? t('Saved', 'Enregistre') : t('Save route', 'Enregistrer le trajet')}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Sens game warning */}
            {sensGameTonight && toPlace?.lat && haversineKm(toPlace.lat, toPlace.lng!, CTC_LAT, CTC_LNG) <= 2 && (
              <View style={{ backgroundColor: '#c8102e' + '15', borderWidth: 1, borderColor: '#c8102e' + '40', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="warning" size={18} color="#c8102e" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#c8102e' }}>
                    {t('Sens game tonight', 'Match des Sens ce soir')}
                  </Text>
                  <Text style={{ fontSize: 12, color: colours.text, marginTop: 4, lineHeight: 17 }}>
                    {t(
                      'Expect delays on routes 61/62 near Canadian Tire Centre after 10pm. Consider Fallowfield station.',
                      'Prevoyez des retards sur les lignes 61/62 pres du Centre Canadian Tire apres 22h. Pensez a la station Fallowfield.'
                    )}
                  </Text>
                </View>
              </View>
            )}
            {/* Route comparison pills */}
            {itineraries.length > 1 && (() => {
              const fastest = itineraries.reduce((best, cur, i) => cur.duration < itineraries[best].duration ? i : best, 0);
              const fewestTransfers = itineraries.reduce((best, cur, i) => cur.transfers < itineraries[best].transfers ? i : best, 0);
              const leastWalking = itineraries.reduce((best, cur, i) => cur.walkDistance < itineraries[best].walkDistance ? i : best, 0);
              const pills = [
                { label: `${t('Fastest', 'Plus rapide')}: ${fmtDuration(itineraries[fastest].duration)}`, icon: 'flash-outline' as const, idx: fastest },
                { label: `${t('Fewest transfers', 'Moins de corresp.')}: ${itineraries[fewestTransfers].transfers}`, icon: 'swap-horizontal-outline' as const, idx: fewestTransfers },
                { label: `${t('Least walking', 'Moins de marche')}: ${fmtWalk(itineraries[leastWalking].walkDistance)}`, icon: 'walk-outline' as const, idx: leastWalking },
              ];
              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                  {pills.map((pill, pi) => (
                    <TouchableOpacity
                      key={pi}
                      onPress={() => {
                        const y = itinLayoutMap.current[pill.idx];
                        if (y != null) mainScrollRef.current?.scrollTo({ y: itinListYOffset.current + y, animated: true });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colours.accent + '12', borderWidth: 1, borderColor: colours.accent + '30' }}
                      accessibilityRole="button"
                    >
                      <Ionicons name={pill.icon} size={13} color={colours.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>{pill.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              );
            })()}
            <View onLayout={(e) => { itinListYOffset.current = e.nativeEvent.layout.y; }}>
              {itineraries.map((itin, i) => (
                <View key={i} onLayout={(e) => { itinLayoutMap.current[i] = e.nativeEvent.layout.y; }}>
                  {renderItinerary(itin, i)}
                  {/* First/last mile suggestion */}
                  {i < 2 && (() => {
                    const legs = itin.legs || [];
                    const firstWalk = legs.length > 0 && legs[0].mode === 'WALK' && legs[0].distance > 800 ? legs[0] : null;
                    const lastWalk = legs.length > 1 && legs[legs.length - 1].mode === 'WALK' && legs[legs.length - 1].distance > 800 ? legs[legs.length - 1] : null;
                    const mile = firstWalk || lastWalk;
                    if (!mile) return null;
                    const isFirst = mile === firstWalk;
                    const distLabel = fmtDistance(mile.distance);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.accent + '08', borderWidth: 1, borderColor: colours.accent + '20', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: -4, marginBottom: 10 }}>
                        <Ionicons name="bulb-outline" size={14} color={colours.accent} />
                        <Text style={{ flex: 1, fontSize: 12, color: colours.text }}>
                          {isFirst ? t(`First ${distLabel} walk`, `Premiere marche de ${distLabel}`) : t(`Last ${distLabel} walk`, `Derniere marche de ${distLabel}`)}
                          {' '}{t('Uber or Bike Share nearby?', 'Uber ou Velo-partage a proximite?')}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const lat = mile.from.lat;
                            const lon = mile.from.lon;
                            Linking.openURL(`uber://?action=setPickup&pickup[latitude]=${lat}&pickup[longitude]=${lon}`).catch(() => {
                              Linking.openURL(`https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${lat}&pickup[longitude]=${lon}`).catch(() => {});
                            });
                          }}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
                          accessibilityRole="button"
                          accessibilityLabel="Uber"
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }}>Uber</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            Linking.openURL('https://velogo.ca').catch(() => {});
                          }}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
                          accessibilityRole="button"
                          accessibilityLabel={t('Bike Share', 'Velo-partage')}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }}>{t('Bike', 'Velo')}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              ))}
            </View>

            {/* Walk or Wait? card */}
            {walkAlt && travelMode === 'transit' && (
              <View style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Ionicons name="walk-outline" size={18} color={colours.accent} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text }}>{t('Walk or Wait?', 'Marcher ou attendre?')}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 0 }}>
                  {/* Wait for bus */}
                  <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
                    <Ionicons name="bus-outline" size={24} color={colours.accent} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Wait for bus', 'Attendre le bus')}</Text>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: colours.text, marginTop: 4 }}>{walkAlt.transitMins}<Text style={{ fontSize: 14, fontWeight: '600' }}> min</Text></Text>
                    {walkAlt.transitWait > 0 && (
                      <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{t(`${walkAlt.transitWait} min wait`, `${walkAlt.transitWait} min d'attente`)}</Text>
                    )}
                  </View>

                  {/* Divider */}
                  <View style={{ width: 1, backgroundColor: colours.border, marginVertical: 8 }} />

                  {/* Walk now */}
                  <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
                    <Ionicons name="walk-outline" size={24} color={walkAlt.walkMins <= walkAlt.transitMins + 5 ? '#00A78D' : colours.muted} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Walk now', 'Marcher maintenant')}</Text>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: walkAlt.walkMins <= walkAlt.transitMins + 5 ? '#00A78D' : colours.text, marginTop: 4 }}>{walkAlt.walkMins}<Text style={{ fontSize: 14, fontWeight: '600' }}> min</Text></Text>
                    {walkAlt.walkMins <= walkAlt.transitMins && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#00A78D', marginTop: 2 }}>{t('Faster!', 'Plus rapide!')}</Text>
                    )}
                    {walkAlt.walkMins > walkAlt.transitMins && walkAlt.walkMins <= walkAlt.transitMins + 5 && (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#00A78D', marginTop: 2 }}>{t('About the same', 'A peu pres pareil')}</Text>
                    )}
                  </View>
                </View>

                {/* Weather warning */}
                {walkAlt.temp !== null && (walkAlt.temp <= -10 || walkAlt.precip) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3b82f6' + '12', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 }}>
                    <Text style={{ fontSize: 14 }}>{walkAlt.temp <= -10 ? '\u2744\uFE0F' : '\u2614'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#3b82f6', flex: 1 }}>
                      {walkAlt.temp <= -10
                        ? t(`Cold today (${Math.round(walkAlt.temp)}\u00B0C) \u2014 transit recommended`, `Froid aujourd'hui (${Math.round(walkAlt.temp)}\u00B0C) \u2014 transport recommande`)
                        : t('Precipitation expected \u2014 transit recommended', 'Precipitations prevues \u2014 transport recommande')}
                    </Text>
                  </View>
                )}

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => setTravelMode('walking')}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: walkAlt.walkMins <= walkAlt.transitMins + 5 ? '#00A78D' : colours.surface, borderWidth: 1, borderColor: walkAlt.walkMins <= walkAlt.transitMins + 5 ? '#00A78D' : colours.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Walk there', 'Y aller a pied')}>
                    <Ionicons name="walk-outline" size={14} color={walkAlt.walkMins <= walkAlt.transitMins + 5 ? 'white' : colours.text} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: walkAlt.walkMins <= walkAlt.transitMins + 5 ? 'white' : colours.text }}>{t('Walk there', 'Y aller a pied')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWalkAlt(null)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Show bus routes', 'Afficher les bus')}>
                    <Ionicons name="bus-outline" size={14} color={colours.text} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{t('Show bus routes', 'Afficher les bus')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : !loading && !searched ? (
          <View style={{ paddingHorizontal: 20 }}>
            {savedRoutes.length > 0 && (
              <View style={{ paddingTop: 12, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  {t('Saved Routes', 'Trajets enregistres')}
                </Text>
                {savedRoutes.map((route) => (
                  <TouchableOpacity
                    key={route.id}
                    style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, borderColor: colours.border, borderLeftColor: colours.accent, padding: 12, marginBottom: 8, gap: 10 }, cardShadow]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setFromText(shortenLabel(route.fromLabel));
                      setFromPlace({ placeId: 'saved', label: route.fromLabel, lat: route.fromLat, lng: route.fromLng });
                      setToText(shortenLabel(route.toLabel));
                      setToPlace({ placeId: 'saved', label: route.toLabel, lat: route.toLat, lng: route.toLng });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${route.fromLabel} to ${route.toLabel}`}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="bookmark" size={18} color={colours.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                        {shortenLabel(route.fromLabel)} → {shortenLabel(route.toLabel)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {plannerCampus && plannerSchedule && plannerSchedule.classes.length > 0 && (() => {
              const nc = nextClass(plannerSchedule);
              if (!nc || nc.minsUntilLeave <= 0) return null;
              return (
                <TouchableOpacity
                  onPress={() => {
                    setToText(t(plannerCampus.name, plannerCampus.name_fr));
                    setToPlace({ placeId: 'campus', label: plannerCampus.name, lat: plannerCampus.lat, lng: plannerCampus.lng });
                  }}
                  style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: plannerCampus.accent + '12', borderRadius: 12, borderWidth: 1, borderColor: plannerCampus.accent + '30', padding: 12, marginBottom: 12, gap: 10 }, cardShadow]}
                  activeOpacity={0.7}
                >
                  {CAMPUS_LOGOS[plannerCampus.id] ? (
                    <Image source={CAMPUS_LOGOS[plannerCampus.id]} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: plannerCampus.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="school" size={18} color={plannerCampus.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: plannerCampus.accent }}>
                      {t(`Plan to ${plannerCampus.name}`, `Planifier vers ${plannerCampus.name_fr}`)}
                    </Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>
                      {nc.entry.name} · {schedFmt12h(nc.entry.startTime)}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={plannerCampus.accent} />
                </TouchableOpacity>
              );
            })()}
            {tripHistory.length === 0 && savedRoutes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="navigate" size={28} color={colours.accent} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, textAlign: 'center' }}>{t('Plan your trip', 'Planifiez votre trajet')}</Text>
                <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
                  {t('Real OC Transpo routing with transfers,\nwalk times, and live schedules.', 'Itineraires OC Transpo reels avec correspondances,\ntemps de marche et horaires en direct.')}
                </Text>
              </View>
            ) : tripHistory.length > 0 ? (
              <View style={{ paddingTop: savedRoutes.length > 0 ? 0 : 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, letterSpacing: 0.5 }}>
                    {t('Recent Trips', 'Trajets recents')}
                  </Text>
                  {tripHistory.length > 3 && (
                    <TouchableOpacity onPress={() => setShowHistory(!showHistory)} activeOpacity={0.7}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>
                        {showHistory ? t('Show less', 'Voir moins') : t('Show all', 'Voir tout')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {(showHistory ? tripHistory : tripHistory.slice(0, 3)).map((trip) => {
                  const ago = Math.round((Date.now() - new Date(trip.plannedAt).getTime()) / 60000);
                  const agoLabel = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.round(ago / 60)}h` : `${Math.round(ago / 1440)}d`;
                  return (
                    <TouchableOpacity
                      key={trip.id}
                      style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, padding: 12, marginBottom: 8, gap: 10 }, cardShadow]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setFromText(shortenLabel(trip.fromLabel));
                        setFromPlace({ placeId: 'hist', label: trip.fromLabel, lat: trip.fromLat, lng: trip.fromLng });
                        setToText(shortenLabel(trip.toLabel));
                        setToPlace({ placeId: 'hist', label: trip.toLabel, lat: trip.toLat, lng: trip.toLng });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${trip.fromLabel} to ${trip.toLabel}`}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colours.muted + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="time-outline" size={18} color={colours.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                          {shortenLabel(trip.fromLabel)} → {shortenLabel(trip.toLabel)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>
                          {trip.durationMins} min · {agoLabel} {t('ago', 'il y a')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setTripHistory(prev => {
                            const updated = prev.filter(t => t.id !== trip.id);
                            AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
                            return updated;
                          });
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="close" size={14} color={colours.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : loading ? (
          <View style={{ paddingHorizontal: 20 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[{ backgroundColor: colours.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colours.border, opacity: 1 - i * 0.25 }, cardShadow]}>
                <View style={{ width: 80 + i * 20, height: 22, backgroundColor: colours.border, borderRadius: 4, marginBottom: 10 }} />
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {[0,1,2].map(j => <View key={j} style={{ width: 40, height: 20, backgroundColor: colours.border, borderRadius: 8 }} />)}
                </View>
                <View style={{ width: 160, height: 14, backgroundColor: colours.border, borderRadius: 4 }} />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Leave Reminder Modal ──────────────────────────────────── */}
      {reminderModal && (() => {
        const itin = reminderModal.itin;
        const routeNames = (itin.legs || []).filter(l => l.mode !== 'WALK').map(l => l.routeShortName).filter(Boolean).join(', ');
        const dest = toText || t('your destination', 'votre destination');
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => setReminderModal(null)}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
                {/* Handle bar */}
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, alignSelf: 'center', marginBottom: 16 }} />

                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 4 }}>
                  {t('Leave Now Reminder', 'Rappel de depart')}
                </Text>
                <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16 }}>
                  {t("We'll notify you when it's time to leave", 'Nous vous avertirons quand il sera temps de partir')}
                </Text>

                {/* Trip summary */}
                <View style={{ backgroundColor: colours.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 4 }} numberOfLines={1}>
                    {dest}
                  </Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>
                    {fmtDuration(itin.duration)} {routeNames ? `· ${t('Route', 'Route')} ${routeNames}` : `· ${t('Walk only', 'Marche seulement')}`}
                  </Text>
                </View>

                {/* Notification time */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <Ionicons name="notifications" size={18} color={colours.accent} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text }}>
                    {t('Notification at', 'Notification a')} {fmtTime(reminderTime.getTime())}
                  </Text>
                </View>

                {/* Buttons */}
                <TouchableOpacity
                  onPress={async () => {
                    if (!Notifications) {
                      Alert.alert(t('Notifications unavailable', 'Notifications non disponibles'));
                      return;
                    }
                    const permitted = await requestNotifPermission();
                    if (!permitted) {
                      Alert.alert(t('Permission required', 'Permission requise'), t('Enable notifications in Settings.', 'Activez les notifications dans Reglages.'));
                      return;
                    }
                    const now = Date.now();
                    const triggerMs = reminderTime.getTime() - now;
                    if (triggerMs <= 0) {
                      Alert.alert(t('Time has passed', 'L\'heure est passee'), t('This departure time is in the past.', 'Cette heure de depart est passee.'));
                      return;
                    }
                    try {
                      const notifId = await Notifications.scheduleNotificationAsync({
                        content: {
                          title: t('Time to leave!', 'C\'est l\'heure de partir!'),
                          body: t(
                            `Leave now for ${dest}${routeNames ? ` \u2014 Route ${routeNames} departs in 5 min` : ''}`,
                            `Partez maintenant pour ${dest}${routeNames ? ` \u2014 Route ${routeNames} part dans 5 min` : ''}`
                          ),
                          data: { type: 'leave_reminder' },
                        },
                        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderTime },
                      });
                      const reminder = { id: String(Date.now()), destination: dest, departAt: itin.startTime, notifId };
                      const updated = [...leaveReminders, reminder];
                      setLeaveReminders(updated);
                      AsyncStorage.setItem(SK_LEAVE_REMINDERS, JSON.stringify(updated)).catch(() => {});
                      setReminderModal(null);
                      Alert.alert(
                        t('Reminder set', 'Rappel defini'),
                        t(`We'll notify you at ${fmtTime(reminderTime.getTime())}`, `Nous vous avertirons a ${fmtTime(reminderTime.getTime())}`)
                      );
                    } catch (e) {
                      if (__DEV__) console.warn('Failed to schedule leave reminder:', e);
                      Alert.alert(t('Error', 'Erreur'), t('Could not set reminder.', 'Impossible de definir le rappel.'));
                    }
                  }}
                  style={{ backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                    {t('Set Reminder', 'Definir le rappel')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setReminderModal(null)}
                  style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colours.border }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colours.muted, fontSize: 15, fontWeight: '600' }}>
                    {t('Cancel', 'Annuler')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        );
      })()}

    </KeyboardAvoidingView>
  );
}

export default function PlannerScreen() {
  const { colours, fonts, t } = useApp();
  return (
    <PlannerErrorBoundary colours={colours} fonts={fonts} t={t}>
      <PlannerScreenInner />
    </PlannerErrorBoundary>
  );
}

