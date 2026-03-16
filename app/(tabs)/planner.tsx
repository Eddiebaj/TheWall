import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Keyboard, KeyboardAvoidingView,
  Linking, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Share,
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
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

// ── Error Boundary ───────────────────────────────────────────────
class PlannerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { if (__DEV__) console.warn('PlannerErrorBoundary caught:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="navigate-outline" size={48} color="#888" />
          <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
            The planner ran into an issue
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 20, backgroundColor: '#004890', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
import { SK_PLANNER_PREFS, SK_SAVED_ROUTES, SK_TRIP_HISTORY } from '../../lib/storageKeys';

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
};

const LEG_ICONS: Record<string, string> = {
  WALK: 'walk',
  BUS: 'bus',
  TRAM: 'train',
  RAIL: 'train',
  SUBWAY: 'train',
  FERRY: 'boat',
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

// Strip ", Canada" and redundant province from place labels
function shortenLabel(label: string): string {
  return label
    .replace(/, Canada$/, '')
    .replace(/, ON,/, ',')
    .replace(/, QC,/, ',')
    .trim();
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
  if ((leg as any).legGeometry?.points) return decodePolyline((leg as any).legGeometry.points);
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

  const [departTime, setDepartTime] = useState<Date>(new Date());
  const [arriveBy, setArriveBy] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [travelMode, setTravelMode] = useState<'transit' | 'driving' | 'bicycling' | 'walking'>('transit');

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<{ routes: string[]; title: string }[]>([]);
  const [searched, setSearched] = useState(false);

  const [expandedItinerary, setExpandedItinerary] = useState<Itinerary | null>(null);
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);
  const [activeLeg, setActiveLeg] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const mapRef = useRef<any>(null);
  const locationSubRef = useRef<any>(null);
  const stepsScrollRef = useRef<ScrollView>(null);

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sensGameTonight, setSensGameTonight] = useState(false);

  // Holds Expo notification IDs so we can cancel them on stopTracking
  const transitNotifIds = useRef<string[]>([]);
  const autoCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {};


  // ── Load saved routes + trip history ──────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ROUTES_KEY).then(val => {
      try { if (val) setSavedRoutes(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved routes failed:', e); }
    }).catch(() => {});
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      try { if (val) setTripHistory(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse trip history failed:', e); }
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
  // Auto-plan immediately when arriving from a saved route
  useEffect(() => {
    if (params.toLabel && params.toLat) {
      const to: PlaceResult = {
        placeId: 'saved',
        label: params.toLabel as string,
        lat: parseFloat(params.toLat as string),
        lng: parseFloat(params.toLng as string),
      };

      if (params.fromLabel && params.fromLat) {
        // Both from + to provided (saved route with known origin) — plan immediately
        const from: PlaceResult = {
          placeId: 'saved',
          label: params.fromLabel as string,
          lat: parseFloat(params.fromLat as string),
          lng: parseFloat(params.fromLng as string),
        };
        setFromPlace(from); setFromText(from.label);
        setToPlace(to); setToText(to.label);
        // Auto-trigger plan after state settles
        setTimeout(() => planWithPlaces(from, to), 100);
      } else {
        // No origin — get current location then auto-plan
        setToPlace(to); setToText(to.label);
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
            setFromPlace(from); setFromText(label);
            // Auto-trigger plan
            setTimeout(() => planWithPlaces(from, to), 100);
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
                setFromText(from.label);
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
                setToText(to.label);
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
      return;
    }
    try {
      const resp = await fetchWithTimeout(`${PLACES_URL}?action=autocomplete-geocode&input=${encodeURIComponent(text)}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const results: PlaceResult[] = data.results || [];
      if (field === 'from') setFromResults(results);
      else if (field === 'to') setToResults(results);
      else setWaypointResults(prev => ({ ...prev, [parseInt(field.split('_')[1])]: results }));
    } catch (e) { if (__DEV__) console.warn('autocomplete fetch failed:', e); }
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
      if (field === 'from') { setFromPlace(place); setFromText(label); setFromResults([]); }
      else { setToPlace(place); setToText(label); setToResults([]); }
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

    const d = departTime;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const month = String(d.getMonth() + 1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const dateStr = `${month}-${day}-${d.getFullYear()}`;

    const url = `${PLAN_URL}?fromLat=${resolvedFrom.lat}&fromLng=${resolvedFrom.lng}&fromLabel=${encodeURIComponent(resolvedFrom.label)}&toLat=${resolvedTo.lat}&toLng=${resolvedTo.lng}&toLabel=${encodeURIComponent(resolvedTo.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=${arriveBy}`;

    try {
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (data.error) { setError(data.error); }
      else if (!data.itineraries?.length) { setError(t('No routes found. Try a different time or destination.', 'Aucun trajet trouve. Essayez une autre heure ou destination.')); }
      else {
        try {
          const sorted = [...data.itineraries].sort((a: any, b: any) => {
            const aWalkOnly = Array.isArray(a.legs) && a.legs.length > 0 && a.legs.every((l: any) => l.mode === 'WALK');
            const bWalkOnly = Array.isArray(b.legs) && b.legs.length > 0 && b.legs.every((l: any) => l.mode === 'WALK');
            if (aWalkOnly !== bWalkOnly) return aWalkOnly ? 1 : -1;
            return (a.endTime ?? 0) - (b.endTime ?? 0);
          });
          const transitItins = sorted.filter((i: any) => (i.legs || []).some((l: any) => l.mode !== 'WALK'));
          const walkOnlyItins = sorted.filter((i: any) => (i.legs || []).every((l: any) => l.mode === 'WALK'));
          const bestTransitEnd = transitItins[0]?.endTime ?? Infinity;
          const bestWalkDuration = walkOnlyItins[0]?.duration ?? Infinity;
          const bestWalkEnd = walkOnlyItins[0]?.endTime ?? Infinity;
          const keepWalk = transitItins.length === 0
            || bestWalkDuration <= 1200
            || bestWalkEnd <= bestTransitEnd + 1200000;
          setItineraries(keepWalk ? sorted : transitItins);
        } catch {
          setItineraries(data.itineraries);
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
          // Deduplicate: skip if same from/to was planned in last 5 min
          const isDupe = prev.length > 0 && prev[0].fromLabel === record.fromLabel && prev[0].toLabel === record.toLabel
            && (Date.now() - new Date(prev[0].plannedAt).getTime()) < 300000;
          if (isDupe) return prev;
          const updated = [record, ...prev].slice(0, MAX_TRIP_HISTORY);
          AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    } catch (e) {
      setError(t('Could not connect to trip planner. Check your connection.', 'Connexion au planificateur impossible. Verifiez votre connexion.'));
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
        if (result?.lat) { resolvedFrom = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setFromPlace(resolvedFrom); setFromText(result.label); }
      } catch (e) { if (__DEV__) console.warn('geocode from-address failed:', e); }
    }
    if (toText && !toPlace?.lat) {
      try {
        const r = await fetchWithTimeout(`${PLACES_URL}?action=geocode&input=${encodeURIComponent(toText)}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedTo = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setToPlace(resolvedTo); setToText(result.label); }
      } catch (e) { if (__DEV__) console.warn('geocode to-address failed:', e); }
    }

    if (!resolvedFrom?.lat || !resolvedTo?.lat) {
      Alert.alert(t('Missing locations', 'Adresses manquantes'), t('Could not find one or both addresses. Try selecting from the dropdown.', 'Impossible de trouver une ou les deux adresses. Essayez de selectionner dans la liste.'));
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

    if (travelMode !== 'transit') {
      const origin = `${resolvedFrom.lat},${resolvedFrom.lng}`;
      const destination = `${resolvedTo.lat},${resolvedTo.lng}`;
      const waypointStr = resolvedWaypoints.length > 0 ? `&waypoints=${resolvedWaypoints.map(w => `${w.lat},${w.lng}`).join('|')}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointStr}&travelmode=${travelMode}`;
      Linking.openURL(url);
      return;
    }

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
          const url = `${PLAN_URL}?fromLat=${from.lat}&fromLng=${from.lng}&fromLabel=${encodeURIComponent(from.label)}&toLat=${to.lat}&toLng=${to.lng}&toLabel=${encodeURIComponent(to.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false`;
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
          const isDupe = prev.length > 0 && prev[0].fromLabel === record.fromLabel && prev[0].toLabel === record.toLabel
            && (Date.now() - new Date(prev[0].plannedAt).getTime()) < 300000;
          if (isDupe) return prev;
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
    } catch (e) {
      Alert.alert(t('Error', 'Erreur'), t('Could not fetch reachable stops.', 'Impossible de trouver les arrets accessibles.'));
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
          {leg.mode !== 'WALK' && leg.routeShortName && (
            <Text style={{ fontSize: 10, fontWeight: '800', color }}>{leg.routeShortName}</Text>
          )}
          {leg.mode === 'WALK' && (
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
    // BEST = first non-walk itinerary (already sorted by earliest arrival)
    const isFirst = idx === 0 && !isWalkOnly;
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
          borderWidth: isFirst ? 1.5 : 1,
          borderColor: isFirst ? colours.accent : isWalkOnly ? colours.border : colours.border,
        }, cardShadow]}
        activeOpacity={0.85}
      >
        {/* Badge */}
        {isFirst && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: colours.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>{t('FASTEST', 'PLUS RAPIDE')}</Text>
          </View>
        )}
        {isWalkOnly && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#34c759' + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#34c759' + '40' }}>
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

        {/* Leg pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {(itin.legs || []).map((leg, i) => renderLegPill(leg, i))}
        </View>

        {/* Cross-border warning */}
        {hasCrossBorderTrip(itin) && (
          <View style={{ backgroundColor: '#ff9500' + '15', borderLeftWidth: 3, borderLeftColor: '#ff9500', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#ff9500', fontWeight: '600' }}>{t('Cross-Border Trip', 'Trajet interregional')}</Text>
            <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }}>{t('Separate Presto tap required ($4.10 each)', 'Paiement Presto distinct requis (4,10 $ chacun)')}</Text>
          </View>
        )}

        {/* Transfer warnings */}
        {(itin.legs || []).map((leg, i, arr) => {
          if (i === 0) return null;
          const prevLeg = arr[i - 1];
          if (prevLeg.mode === 'WALK' || leg.mode === 'WALK') return null;
          const connectionMin = Math.round((leg.startTime - prevLeg.endTime) / 60000);
          if (connectionMin > 3) return null;
          // Check if connecting route has active alert
          const connectingRoute = leg.routeShortName;
          const hasAlert = connectingRoute && alerts.some(a => a.routes.includes(connectingRoute));
          return (
            <View key={`transfer-${i}`} style={{ backgroundColor: hasAlert ? '#cc3b2a15' : '#ff950015', borderLeftWidth: 3, borderLeftColor: hasAlert ? '#cc3b2a' : '#ff9500', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8 }}>
              {hasAlert ? (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#cc3b2a' }}>{t('Alert on connecting route', 'Alerte sur la correspondance')}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{t(`Route ${connectingRoute} at ${prevLeg.to?.name || ''}`, `Route ${connectingRoute} \u00e0 ${prevLeg.to?.name || ''}`)}</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#ff9500' }}>{t(`Tight transfer \u2014 ${connectionMin} min`, `Correspondance serr\u00e9e \u2014 ${connectionMin} min`)}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{t(`${prevLeg.to?.name || ''} \u2192 Route ${connectingRoute || ''}`, `${prevLeg.to?.name || ''} \u2192 Route ${connectingRoute || ''}`)}</Text>
                </>
              )}
            </View>
          );
        })}

        {/* Footer row */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {!isWalkOnly && (
            <Text style={{ fontSize: 11, color: colours.muted }}>
              <Text style={{ fontWeight: '700' }}>{transferCount}</Text> {t(transferCount !== 1 ? 'transfers' : 'transfer', transferCount !== 1 ? 'correspondances' : 'correspondance')}
            </Text>
          )}
          <Text style={{ fontSize: 11, color: colours.muted }}>{fmtWalk(itin.walkDistance)}</Text>
          {!isWalkOnly && (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, color: colours.accent }}>🎫</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>$4.10 Presto</Text>
            </View>
          )}
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
            title: `🚌 ${routeName} in 2 min`,
            body: `Board at ${fromStop}${headsign}`,
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
            title: `🟢 Board now — ${routeName}`,
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
            title: '📍 Arriving soon',
            body: `You reach your destination at ${fmtTime(itin.endTime)}`,
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Share button */}
              <TouchableOpacity
                onPress={() => {
                  const itin = expandedItinerary!;
                  const routes = itin.legs
                    .filter(l => l.mode !== 'WALK')
                    .map(l => l.routeShortName || l.mode)
                    .join(', ');
                  const message = `RouteO Trip 🚌\n${fromText} → ${toText}\n${fmtDuration(itin.duration)} · Departs ${fmtTime(itin.startTime)} · Arrives ${fmtTime(itin.endTime)}\n${itin.transfers} transfer${itin.transfers !== 1 ? 's' : ''} · ${fmtWalk(itin.walkDistance)}\nRoute${routes ? `s: ${routes}` : ': Walk'}\nPlanned with RouteO for OC Transpo Ottawa`;
                  Share.share({ message });
                }}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
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
                onPress={() => tracking ? stopTracking() : startTracking(expandedItinerary)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: tracking ? '#ff3b30' + '18' : colours.accent + '18', borderWidth: 1, borderColor: tracking ? '#ff3b30' : colours.accent }}
                accessibilityRole="button"
                accessibilityLabel={tracking ? t('Stop tracking trip', 'Arreter le suivi du trajet') : t('Start tracking trip', 'Commencer le suivi du trajet')}
              >
                <Ionicons name={tracking ? 'stop-circle' : 'navigate'} size={14} color={tracking ? '#ff3b30' : colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: tracking ? '#ff3b30' : colours.accent }}>
                  {tracking ? t('Stop', 'Arreter') : t('Go', 'Aller')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeExpandedModal} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close trip details', 'Fermer les details du trajet')}>
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
              {(expandedItinerary.legs || []).map((leg, i) => (
                <Marker key={`m${i}`} coordinate={{ latitude: leg.from.lat, longitude: leg.from.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LEG_COLOURS[leg.mode] || colours.accent, borderWidth: 2, borderColor: 'white' }} />
                </Marker>
              ))}
              <Marker
                coordinate={{ latitude: (expandedItinerary.legs || [])[((expandedItinerary.legs || []).length - 1)]?.to?.lat ?? 0, longitude: (expandedItinerary.legs || [])[((expandedItinerary.legs || []).length - 1)]?.to?.lon ?? 0 }}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={{ alignItems: 'center' }}>
                  <View style={{ backgroundColor: colours.accent, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3 }}>
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
                    style={{ backgroundColor: isCurrentLeg ? color + '12' : colours.surface, borderRadius: 14, padding: 14, borderWidth: isCurrentLeg ? 1.5 : 1, borderColor: isCurrentLeg ? color : colours.border, borderLeftWidth: 4, borderLeftColor: color }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={icon as any} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {isWalk ? (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{t('Walk', 'Marche')} {fmtDistance(leg.distance)}</Text>
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                            {leg.routeShortName ? `Route ${leg.routeShortName}` : leg.mode}
                            {leg.headsign ? <Text style={{ fontWeight: '500', color: colours.muted }}> → {leg.headsign}</Text> : null}
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                          {(leg.from?.name || '').replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, '')} → {(leg.to?.name || '').replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, '')}
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
                    {isWalk && (leg.steps || []).length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{isExpanded ? t('Hide walking directions', 'Masquer les directions a pied') : t('Show walking directions', 'Afficher les directions a pied')}</Text>
                      </View>
                    )}
                    {isWalk && isExpanded && (leg.steps || []).length > 0 && (
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
                  </TouchableOpacity>
                  {i < (expandedItinerary.legs || []).length - 1 && (
                    <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                      <View style={{ width: 2, height: 14, backgroundColor: colours.border }} />
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colours.accent + '12', borderRadius: 14, borderWidth: 1, borderColor: colours.accent + '30' }}>
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

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: colours.text, letterSpacing: -0.5 }}>
            {t('Trip', 'Planificateur')} <Text style={{ color: colours.accent }}>{t('Planner', 'de trajet')}</Text>
          </Text>
          <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>{t('OC Transpo · Real transit routing', 'OC Transpo · Itineraires en temps reel')}</Text>
        </View>

        {/* Input card */}
        <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 18, borderWidth: 1, borderColor: colours.border, padding: 4, marginBottom: 12 }, cardShadow]}>
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
                setFromResults([]);
                setToResults([]);
                if (autoCompleteTimer.current) clearTimeout(autoCompleteTimer.current);
                autoCompleteTimer.current = setTimeout(() => { autocomplete(text, 'from'); }, 300);
              }}
              onFocus={() => {
                setActiveInput('from');
                setToResults([]);   // hide to-results when from is focused
              }}
              onBlur={() => setActiveInput(null)}
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
                  onFocus={() => { setActiveInput(`waypoint_${idx}` as any); setFromResults([]); setToResults([]); }}
                  onBlur={() => setActiveInput(null)}
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
                setFromResults([]);
                if (autoCompleteTimer.current) clearTimeout(autoCompleteTimer.current);
                autoCompleteTimer.current = setTimeout(() => { autocomplete(text, 'to'); }, 300);
              }}
              onFocus={() => {
                setActiveInput('to');
                setFromResults([]);   // hide from-results when to is focused
              }}
              onBlur={() => setActiveInput(null)}
            />
            <TouchableOpacity onPress={() => useMyLocation('to')} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('Use my location as destination', 'Utiliser ma position comme destination')}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Autocomplete results — only show for the active field */}
        {fromResults.length > 0 && activeInput === 'from' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            {fromResults.map((r, i) => (
              <TouchableOpacity
                key={r.placeId}
                onPress={async () => {
                  const resolved = await resolvePlace(r);
                  setFromPlace(resolved); setFromText(resolved.label); setFromResults([]);
                  Keyboard.dismiss();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < fromResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
              >
                <Ionicons name="location-outline" size={16} color={colours.muted} />
                <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={1}>{shortenLabel(r.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {toResults.length > 0 && activeInput === 'to' && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            {toResults.map((r, i) => (
              <TouchableOpacity
                key={r.placeId}
                onPress={async () => {
                  const resolved = await resolvePlace(r);
                  setToPlace(resolved); setToText(resolved.label); setToResults([]);
                  Keyboard.dismiss();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < toResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
              >
                <Ionicons name="location-outline" size={16} color={colours.muted} />
                <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={1}>{shortenLabel(r.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Waypoint autocomplete results */}
        {waypoints.map((_, idx) => {
          const results = waypointResults[idx] || [];
          if (results.length === 0 || activeInput !== `waypoint_${idx}`) return null;
          return (
            <View key={`wpr_${idx}`} style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
              {results.map((r, i) => (
                <TouchableOpacity
                  key={r.placeId}
                  onPress={async () => {
                    const resolved = await resolvePlace(r);
                    setWaypoints(prev => prev.map((w, wi) => wi === idx ? { text: resolved.label, place: resolved } : w));
                    setWaypointResults(prev => { const next = { ...prev }; delete next[idx]; return next; });
                    Keyboard.dismiss();
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
                >
                  <Ionicons name="location-outline" size={16} color={colours.muted} />
                  <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={1}>{shortenLabel(r.label)}</Text>
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
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }}
                  accessibilityRole="button"
                  accessibilityLabel={t(m.label_en, m.label_fr)}
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={m.icon as any} size={15} color={active ? colours.accent : colours.muted} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{t(m.label_en, m.label_fr)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Depart at / Arrive by toggle */}
        {travelMode === 'transit' && <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
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
        {travelMode === 'transit' && showTimePicker && (
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <View style={[{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 12 }, cardShadow]}>
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
            style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={travelMode === 'transit' ? t('Plan Trip', 'Planifier le trajet') : t('Open in Google Maps', 'Ouvrir dans Google Maps')}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>{travelMode === 'transit' ? t('Plan Trip', 'Planifier le trajet') : t('Open in Google Maps', 'Ouvrir dans Google Maps')}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* What can I reach? */}
        {travelMode === 'transit' && (
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={fetchIsochrone}
              disabled={isoLoading}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '12' }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('What can I reach in 20 minutes', 'Que puis-je atteindre en 20 minutes')}
            >
              <Ionicons name="locate-outline" size={16} color={colours.accent} />
              <Text style={{ color: colours.accent, fontWeight: '700', fontSize: 14 }}>{t('What can I reach in 20 min?', 'Que puis-je atteindre en 20 min?')}</Text>
            </TouchableOpacity>

            {isoVisible && (
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
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{stop.name}</Text>
                        {stop.routes.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {stop.routes.map(r => (
                              <View key={r} style={{ backgroundColor: colours.accent + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
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
            )}
          </View>
        )}

        {/* Results */}
        {loading && searched ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>{[0,1,2].map(i => <ItinerarySkeleton key={i} colours={colours} />)}</View>
        ) : !loading && searched && error ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
            <Ionicons name="map-outline" size={40} color={colours.muted} />
            <Text style={{ color: colours.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>{t('No routes found', 'Aucun trajet trouve')}</Text>
            <Text style={{ color: colours.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : !loading && itineraries.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                {itineraries.length} {t(itineraries.length !== 1 ? 'routes found' : 'route found', itineraries.length !== 1 ? 'trajets trouves' : 'trajet trouve')}
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
            {itineraries.map((itin, i) => renderItinerary(itin, i))}
          </View>
        ) : !loading && !searched ? (
          <View style={{ paddingHorizontal: 20 }}>
            {tripHistory.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="navigate" size={28} color={colours.accent} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, textAlign: 'center' }}>{t('Plan your trip', 'Planifiez votre trajet')}</Text>
                <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
                  {t('Real OC Transpo routing with transfers,\nwalk times, and live schedules.', 'Itineraires OC Transpo reels avec correspondances,\ntemps de marche et horaires en direct.')}
                </Text>
              </View>
            ) : (
              <View style={{ paddingTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
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
                      style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 12, marginBottom: 8, gap: 10 }, cardShadow]}
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
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="time-outline" size={18} color={colours.accent} />
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
            )}
          </View>
        ) : loading ? (
          <View style={{ paddingHorizontal: 20 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[{ backgroundColor: colours.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colours.border, opacity: 1 - i * 0.25 }, cardShadow]}>
                <View style={{ width: 80 + i * 20, height: 22, backgroundColor: colours.border, borderRadius: 6, marginBottom: 10 }} />
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {[0,1,2].map(j => <View key={j} style={{ width: 40, height: 20, backgroundColor: colours.border, borderRadius: 8 }} />)}
                </View>
                <View style={{ width: 160, height: 14, backgroundColor: colours.border, borderRadius: 4 }} />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function PlannerScreen() {
  return (
    <PlannerErrorBoundary>
      <PlannerScreenInner />
    </PlannerErrorBoundary>
  );
}

