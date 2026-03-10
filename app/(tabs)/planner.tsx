import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardAvoidingView,
  Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';

const PLACES_API_KEY = 'AIzaSyCKwAVVCbxHKsKViJ4Dq0ZQ5r6k-arue3E';
const PLAN_URL = 'https://routeo-backend.vercel.app/api/plan';
const GEOCODE_URL = 'https://routeo-backend.vercel.app/api/geocode';

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

const SAVED_ROUTES_KEY = 'routeo_saved_routes';

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

export default function PlannerScreen() {
  const { colours, fonts, t, language } = useApp();
  const params = useLocalSearchParams();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState<PlaceResult | null>(null);
  const [toPlace, setToPlace] = useState<PlaceResult | null>(null);
  const [fromResults, setFromResults] = useState<PlaceResult[]>([]);
  const [toResults, setToResults] = useState<PlaceResult[]>([]);
  const [activeInput, setActiveInput] = useState<'from' | 'to' | null>(null);

  const [departTime, setDepartTime] = useState<Date>(new Date());
  const [arriveBy, setArriveBy] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeInputText, setTimeInputText] = useState('');
  const [travelMode, setTravelMode] = useState<'transit' | 'driving' | 'bicycling' | 'walking'>('transit');

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const [expandedItinerary, setExpandedItinerary] = useState<Itinerary | null>(null);
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);
  const [activeLeg, setActiveLeg] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<any>(null);
  const stepsScrollRef = useRef<ScrollView>(null);

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

  // Holds Expo notification IDs so we can cancel them on stopTracking
  const transitNotifIds = useRef<string[]>([]);

  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {};

  useEffect(() => {
    setTimeInputText(fmtTime(departTime.getTime()));
  }, [departTime]);

  // ── Load saved routes ─────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ROUTES_KEY).then(val => {
      if (val) setSavedRoutes(JSON.parse(val));
    });
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
          } catch {}
        })();
      }
    }
  }, [params.toLabel, params.toLat]);

  // ── Autocomplete ─────────────────────────────────────────────
  const autocomplete = useCallback(async (text: string, field: 'from' | 'to') => {
    if (text.length < 2) {
      field === 'from' ? setFromResults([]) : setToResults([]);
      return;
    }
    try {
      const resp = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(text)}`);
      const data = await resp.json();
      const results: PlaceResult[] = data.results || [];
      field === 'from' ? setFromResults(results) : setToResults(results);
    } catch {}
  }, []);

  const resolvePlace = async (place: PlaceResult): Promise<PlaceResult> => {
    if (place.lat && place.lng) return place;
    try {
      const resp = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(place.label)}&type=geocode`);
      const data = await resp.json();
      const result = data.results?.[0];
      if (result?.lat) return { ...place, lat: result.lat, lng: result.lng, label: result.label };
    } catch {}
    return place;
  };

  const useMyLocation = async (field: 'from' | 'to') => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location required', 'Enable location in Settings.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const label = geo[0] ? [geo[0].name, geo[0].street, geo[0].city].filter(Boolean).join(', ') : 'My Location';
      const place: PlaceResult = { placeId: 'current', label, lat, lng };
      if (field === 'from') { setFromPlace(place); setFromText(label); setFromResults([]); }
      else { setToPlace(place); setToText(label); setToResults([]); }
    } catch { Alert.alert('Error', 'Could not get location.'); }
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
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) { setError(data.error); }
      else if (!data.itineraries?.length) { setError('No routes found. Try a different time or destination.'); }
      else {
        try {
          const sorted = [...data.itineraries].sort((a: any, b: any) => {
            const aWalkOnly = Array.isArray(a.legs) && a.legs.length > 0 && a.legs.every((l: any) => l.mode === 'WALK');
            const bWalkOnly = Array.isArray(b.legs) && b.legs.length > 0 && b.legs.every((l: any) => l.mode === 'WALK');
            if (aWalkOnly !== bWalkOnly) return aWalkOnly ? 1 : -1;
            return (a.endTime ?? 0) - (b.endTime ?? 0);
          });
          const transitItins = sorted.filter((i: any) => i.legs.some((l: any) => l.mode !== 'WALK'));
          const walkOnlyItins = sorted.filter((i: any) => i.legs.every((l: any) => l.mode === 'WALK'));
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
    } catch (e) {
      setError('Could not connect to trip planner. Check your connection.');
    }
    setLoading(false);
  };

  // ── Plan — called by button, resolves text inputs first ───────
  const plan = async () => {
    Keyboard.dismiss();
    setFromResults([]);
    setToResults([]);

    let resolvedFrom = fromPlace;
    let resolvedTo = toPlace;

    if (fromText && !fromPlace?.lat) {
      try {
        const r = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(fromText)}&type=geocode`);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedFrom = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setFromPlace(resolvedFrom); setFromText(result.label); }
      } catch {}
    }
    if (toText && !toPlace?.lat) {
      try {
        const r = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(toText)}&type=geocode`);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedTo = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setToPlace(resolvedTo); setToText(result.label); }
      } catch {}
    }

    if (!resolvedFrom?.lat || !resolvedTo?.lat) {
      Alert.alert('Missing locations', 'Could not find one or both addresses. Try selecting from the dropdown.');
      return;
    }

    if (travelMode !== 'transit') {
      const origin = `${resolvedFrom.lat},${resolvedFrom.lng}`;
      const destination = `${resolvedTo.lat},${resolvedTo.lng}`;
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelMode}`;
      Linking.openURL(url);
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

  const renderItinerary = (itin: Itinerary, idx: number) => {
    const isWalkOnly = itin.legs.every(l => l.mode === 'WALK');
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
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>FASTEST</Text>
          </View>
        )}
        {isWalkOnly && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#34c759' + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#34c759' + '40' }}>
            <Text style={{ color: '#34c759', fontSize: 9, fontWeight: '800' }}>FREE</Text>
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
          {itin.legs.map((leg, i) => renderLegPill(leg, i))}
        </View>

        {/* Footer row */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {!isWalkOnly && (
            <Text style={{ fontSize: 11, color: colours.muted }}>
              <Text style={{ fontWeight: '700' }}>{transferCount}</Text> transfer{transferCount !== 1 ? 's' : ''}
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
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  const cancelTransitNotifications = async () => {
    for (const id of transitNotifIds.current) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }
    transitNotifIds.current = [];
  };

  const scheduleTransitNotifications = async (itin: Itinerary) => {
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
      } catch {}

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
      } catch {}
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
      } catch {}
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
            const leg = itin.legs[prev];
            if (!leg) return prev;
            const dest = { latitude: leg.to.lat, longitude: leg.to.lon };
            const dist = Math.sqrt(
              Math.pow((latitude - dest.latitude) * 111000, 2) +
              Math.pow((longitude - dest.longitude) * 111000 * Math.cos(dest.latitude * Math.PI / 180), 2)
            );
            if (dist < 40 && prev < itin.legs.length - 1) {
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
    } catch {}
  };

  const renderExpandedItinerary = () => {
    if (!expandedItinerary) return null;
    const allCoords = expandedItinerary.legs.flatMap(leg => legCoords(leg));
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
              >
                <Ionicons name="share-social-outline" size={16} color={colours.accent} />
              </TouchableOpacity>
              {/* Notification indicator — shows when trip notifications are armed */}
              {tracking && transitNotifIds.current.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#34c759' + '18', borderWidth: 1, borderColor: '#34c759' + '50' }}>
                  <Ionicons name="notifications" size={12} color="#34c759" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#34c759' }}>Notifying</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => tracking ? stopTracking() : startTracking(expandedItinerary)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: tracking ? '#ff3b30' + '18' : colours.accent + '18', borderWidth: 1, borderColor: tracking ? '#ff3b30' : colours.accent }}
              >
                <Ionicons name={tracking ? 'stop-circle' : 'navigate'} size={14} color={tracking ? '#ff3b30' : colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: tracking ? '#ff3b30' : colours.accent }}>
                  {tracking ? 'Stop' : 'Go'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeExpandedModal} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Map */}
          <View style={{ height: SCREEN_H * 0.38 }}>
            <MapView
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
              {expandedItinerary.legs.map((leg, i) => {
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
              {expandedItinerary.legs.map((leg, i) => (
                <Marker key={`m${i}`} coordinate={{ latitude: leg.from.lat, longitude: leg.from.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LEG_COLOURS[leg.mode] || colours.accent, borderWidth: 2, borderColor: 'white' }} />
                </Marker>
              ))}
              <Marker
                coordinate={{ latitude: expandedItinerary.legs[expandedItinerary.legs.length - 1].to.lat, longitude: expandedItinerary.legs[expandedItinerary.legs.length - 1].to.lon }}
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
            </MapView>
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
                  {activeLeg < expandedItinerary.legs.length
                    ? `${expandedItinerary.legs[activeLeg].mode === 'WALK' ? 'Walking' : `Route ${expandedItinerary.legs[activeLeg].routeShortName}`}`
                    : 'Arrived'}
                </Text>
              </View>
            )}
          </View>

          {/* Steps */}
          <ScrollView ref={stepsScrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {expandedItinerary.legs.map((leg, i) => {
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
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>Walk {fmtDistance(leg.distance)}</Text>
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                            {leg.routeShortName ? `Route ${leg.routeShortName}` : leg.mode}
                            {leg.headsign ? <Text style={{ fontWeight: '500', color: colours.muted }}> → {leg.headsign}</Text> : null}
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                          {leg.from.name.replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, '')} → {leg.to.name.replace(/ O-TRAIN (EAST|WEST|NORTH|SOUTH).*$/i, '').replace(/ \/ EST$| \/ OUEST$/i, '')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{fmtTime(leg.startTime)}</Text>
                        <Text style={{ fontSize: 11, color: colours.muted }}>{fmtDuration(leg.duration)}</Text>
                      </View>
                    </View>
                    {!isWalk && leg.intermediateStops.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{leg.intermediateStops.length} stop{leg.intermediateStops.length !== 1 ? 's' : ''}</Text>
                      </View>
                    )}
                    {!isWalk && isExpanded && leg.intermediateStops.length > 0 && (
                      <View style={{ marginTop: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: color + '40', gap: 6 }}>
                        {leg.intermediateStops.map((stop, si) => (
                          <Text key={si} style={{ fontSize: 12, color: colours.muted }}>• {stop}</Text>
                        ))}
                      </View>
                    )}
                    {isWalk && leg.steps.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{isExpanded ? 'Hide' : 'Show'} walking directions</Text>
                      </View>
                    )}
                    {isWalk && isExpanded && leg.steps.length > 0 && (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        {leg.steps.map((step, si) => {
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
                  {i < expandedItinerary.legs.length - 1 && (
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
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>Arrive {fmtTime(expandedItinerary.endTime)}</Text>
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
            Trip <Text style={{ color: colours.accent }}>Planner</Text>
          </Text>
          <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>OC Transpo · Real transit routing</Text>
        </View>

        {/* Input card */}
        <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 18, borderWidth: 1, borderColor: colours.border, padding: 4, marginBottom: 12 }, cardShadow]}>
          {/* From */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colours.accent, backgroundColor: colours.bg }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder="From..."
              placeholderTextColor={colours.muted}
              value={fromText}
              onChangeText={text => {
                setFromText(text);
                setFromPlace(null);
                setFromResults([]);   // ✅ was setToResults([]) — fixed
                setToResults([]);     // also clear to results when from changes
                autocomplete(text, 'from');
              }}
              onFocus={() => {
                setActiveInput('from');
                setToResults([]);   // hide to-results when from is focused
              }}
              onBlur={() => setActiveInput(null)}
            />
            <TouchableOpacity onPress={() => useMyLocation('from')} style={{ padding: 6 }}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>

          {/* Divider + swap */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
            <TouchableOpacity onPress={swap} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
              <Ionicons name="swap-vertical" size={14} color={colours.muted} />
            </TouchableOpacity>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
          </View>

          {/* To */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <Ionicons name="location" size={12} color={colours.accent} style={{ marginLeft: -1 }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder="To..."
              placeholderTextColor={colours.muted}
              value={toText}
              onChangeText={text => {
                setToText(text);
                setToPlace(null);
                setFromResults([]);   // hide from-results when to changes
                autocomplete(text, 'to');
              }}
              onFocus={() => {
                setActiveInput('to');
                setFromResults([]);   // hide from-results when to is focused
              }}
              onBlur={() => setActiveInput(null)}
            />
            <TouchableOpacity onPress={() => useMyLocation('to')} style={{ padding: 6 }}>
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

        {/* Travel mode selector */}
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { key: 'transit', icon: 'bus-outline', label: 'Transit' },
              { key: 'driving', icon: 'car-outline', label: 'Drive' },
              { key: 'bicycling', icon: 'bicycle-outline', label: 'Cycle' },
              { key: 'walking', icon: 'walk-outline', label: 'Walk' },
            ] as const).map(m => {
              const active = travelMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setTravelMode(m.key)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }}
                >
                  <Ionicons name={m.icon as any} size={15} color={active ? colours.accent : colours.muted} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{m.label}</Text>
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
                  onPress={() => { setArriveBy(ab); setShowTimePicker(true); }}
                  style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }, cardShadow]}
                >
                  <Ionicons name={ab ? 'flag-outline' : 'time-outline'} size={14} color={active ? colours.accent : colours.muted} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colours.accent : colours.muted }}>{ab ? 'Arrive by' : 'Depart at'}</Text>
                  {active && <Text style={{ fontSize: 13, fontWeight: '800', color: colours.accent }}>{fmtTime(departTime.getTime())}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>}

        {/* Quick time picks */}
        {travelMode === 'transit' && showTimePicker && (
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <View style={[{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 12 }, cardShadow]}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {generateQuickTimes().map(({ label, date }) => {
                  const isActive = fmtTime(departTime.getTime()) === fmtTime(date.getTime());
                  return (
                    <TouchableOpacity key={label} onPress={() => { setDepartTime(date); setShowTimePicker(false); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, backgroundColor: isActive ? colours.accent + '15' : colours.bg }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colours.accent : colours.text }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Plan button */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={plan}
            style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>{travelMode === 'transit' ? 'Plan Trip' : 'Open in Google Maps'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Results */}
        {!loading && searched && error ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
            <Ionicons name="map-outline" size={40} color={colours.muted} />
            <Text style={{ color: colours.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>No routes found</Text>
            <Text style={{ color: colours.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : !loading && itineraries.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                {itineraries.length} route{itineraries.length !== 1 ? 's' : ''} found
              </Text>
              <TouchableOpacity
                onPress={toggleSaveRoute}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: isRouteSaved() ? colours.accent : colours.border, backgroundColor: isRouteSaved() ? colours.accent + '15' : colours.surface }}
                activeOpacity={0.8}
              >
                <Ionicons name={isRouteSaved() ? 'bookmark' : 'bookmark-outline'} size={14} color={isRouteSaved() ? colours.accent : colours.muted} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: isRouteSaved() ? colours.accent : colours.muted }}>
                  {isRouteSaved() ? 'Saved' : 'Save route'}
                </Text>
              </TouchableOpacity>
            </View>
            {itineraries.map((itin, i) => renderItinerary(itin, i))}
          </View>
        ) : !loading && !searched ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="navigate" size={28} color={colours.accent} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, textAlign: 'center' }}>Plan your trip</Text>
            <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              Real OC Transpo routing with transfers,{'\n'}walk times, and live schedules.
            </Text>
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

function generateQuickTimes(): { label: string; date: Date }[] {
  const now = new Date();
  const results = [];
  results.push({ label: 'Now', date: now });
  for (const addMins of [15, 30, 60]) {
    const d = new Date(now.getTime() + addMins * 60000);
    d.setSeconds(0, 0);
    results.push({ label: `+${addMins}m`, date: d });
  }
  for (const [h, m] of [[8,0],[9,0],[12,0],[17,0],[18,0],[20,0]]) {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d > now) {
      const ampm = h >= 12 ? 'pm' : 'am';
      const hh = h % 12 || 12;
      results.push({ label: `${hh}:${String(m).padStart(2,'0')}${ampm}`, date: d });
    }
  }
  return results.slice(0, 8);
}
