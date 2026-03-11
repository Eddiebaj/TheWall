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
  const autoCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {};


  // ── Load saved routes ─────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ROUTES_KEY).then(val => {
      try { if (val) setSavedRoutes(JSON.parse(val)); } catch (e) { console.warn('JSON parse saved routes failed:', e); }
    }).catch(() => {});
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
          } catch (e) { console.warn('get current location failed:', e); }
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
      const resp = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const results: PlaceResult[] = data.results || [];
      field === 'from' ? setFromResults(results) : setToResults(results);
    } catch (e) { console.warn('autocomplete fetch failed:', e); }
  }, []);

  const resolvePlace = async (place: PlaceResult): Promise<PlaceResult> => {
    if (place.lat && place.lng) return place;
    try {
      const resp = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(place.label)}&type=geocode`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const result = data.results?.[0];
      if (result?.lat) return { ...place, lat: result.lat, lng: result.lng, label: result.label };
    } catch (e) { console.warn('geocode resolve failed:', e); }
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
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
    } catch (e) {
      setError(t('Could not connect to trip planner. Check your connection.', 'Connexion au planificateur impossible. Verifiez votre connexion.'));
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
        const r = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(fromText)}&type=geocode`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedFrom = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setFromPlace(resolvedFrom); setFromText(result.label); }
      } catch (e) { console.warn('geocode from-address failed:', e); }
    }
    if (toText && !toPlace?.lat) {
      try {
        const r = await fetch(`${GEOCODE_URL}?input=${encodeURIComponent(toText)}&type=geocode`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const result = d.results?.[0];
        if (result?.lat) { resolvedTo = { placeId: 'geo', label: result.label, lat: result.lat, lng: result.lng }; setToPlace(resolvedTo); setToText(result.label); }
      } catch (e) { console.warn('geocode to-address failed:', e); }
    }

    if (!resolvedFrom?.lat || !resolvedTo?.lat) {
      Alert.alert(t('Missing locations', 'Adresses manquantes'), t('Could not find one or both addresses. Try selecting from the dropdown.', 'Impossible de trouver une ou les deux adresses. Essayez de selectionner dans la liste.'));
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
            const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
          } catch (e) { console.warn('isochrone stop query failed:', e); }
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
      } catch (e) { console.warn('schedule departure notification failed:', e); }

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
      } catch (e) { console.warn('schedule boarding notification failed:', e); }
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
      } catch (e) { console.warn('schedule arrival notification failed:', e); }
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
    } catch (e) { console.warn('start location tracking failed:', e); }
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
              >
                <Ionicons name={tracking ? 'stop-circle' : 'navigate'} size={14} color={tracking ? '#ff3b30' : colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: tracking ? '#ff3b30' : colours.accent }}>
                  {tracking ? t('Stop', 'Arreter') : t('Go', 'Aller')}
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
              placeholder={t('To...', 'Vers...')}
              placeholderTextColor={colours.muted}
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
                  onPress={() => { setArriveBy(ab); setShowTimePicker(true); }}
                  style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: active ? colours.accent : colours.border, backgroundColor: active ? colours.accent + '15' : colours.surface }, cardShadow]}
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
                onPress={() => { setDepartTime(new Date()); setShowTimePicker(false); }}
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15', marginBottom: 12 }}
              >
                <Ionicons name="locate-outline" size={13} color={colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>{t('Now', 'Maintenant')}</Text>
              </TouchableOpacity>

              {/* Hour & Minute pickers */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {/* Hours */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, marginBottom: 6 }}>{t('HOUR', 'HEURE')}</Text>
                  <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {Array.from({ length: 24 }, (_, i) => i).map(h => {
                        const isActive = departTime.getHours() === h;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => { const d = new Date(departTime); d.setHours(h); setDepartTime(d); }}
                            style={{ width: 40, paddingVertical: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, backgroundColor: isActive ? colours.accent + '18' : colours.bg }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: isActive ? '800' : '500', color: isActive ? colours.accent : colours.text }}>{String(h).padStart(2, '0')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                {/* Minutes */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, marginBottom: 6 }}>{t('MINUTE', 'MINUTE')}</Text>
                  <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {Array.from({ length: 12 }, (_, i) => i * 5).map(m => {
                        const isActive = departTime.getMinutes() === m;
                        return (
                          <TouchableOpacity
                            key={m}
                            onPress={() => { const d = new Date(departTime); d.setMinutes(m, 0, 0); setDepartTime(d); }}
                            style={{ width: 40, paddingVertical: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, backgroundColor: isActive ? colours.accent + '18' : colours.bg }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: isActive ? '800' : '500', color: isActive ? colours.accent : colours.text }}>{String(m).padStart(2, '0')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>

              {/* Date picker strip */}
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, marginBottom: 6 }}>{t('DATE', 'DATE')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    d.setHours(departTime.getHours(), departTime.getMinutes(), 0, 0);
                    const isActive = departTime.toLocaleDateString('en-CA') === d.toLocaleDateString('en-CA');
                    const dayName = i === 0 ? t('Today', 'Aujourd\'hui') : i === 1 ? t('Tomorrow', 'Demain') : d.toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-US', { weekday: 'short' });
                    const dateLabel = d.toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-US', { month: 'short', day: 'numeric' });
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => {
                          const updated = new Date(departTime);
                          updated.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                          setDepartTime(updated);
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, backgroundColor: isActive ? colours.accent + '18' : colours.bg, alignItems: 'center', minWidth: 64 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? colours.accent : colours.muted }}>{dayName}</Text>
                        <Text style={{ fontSize: 12, fontWeight: isActive ? '800' : '500', color: isActive ? colours.accent : colours.text, marginTop: 2 }}>{dateLabel}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Done button */}
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={{ marginTop: 12, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 20, backgroundColor: colours.accent }}
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
                  <TouchableOpacity onPress={() => setIsoVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
        {!loading && searched && error ? (
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
              >
                <Ionicons name={isRouteSaved() ? 'bookmark' : 'bookmark-outline'} size={14} color={isRouteSaved() ? colours.accent : colours.muted} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: isRouteSaved() ? colours.accent : colours.muted }}>
                  {isRouteSaved() ? t('Saved', 'Enregistre') : t('Save route', 'Enregistrer le trajet')}
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
            <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, textAlign: 'center' }}>{t('Plan your trip', 'Planifiez votre trajet')}</Text>
            <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              {t('Real OC Transpo routing with transfers,\nwalk times, and live schedules.', 'Itineraires OC Transpo reels avec correspondances,\ntemps de marche et horaires en direct.')}
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

