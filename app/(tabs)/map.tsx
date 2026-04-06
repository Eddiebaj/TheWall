import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { toTitleCase } from '../../lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View
} from 'react-native';
let RNMaps: typeof import('react-native-maps') | null = null;
try { RNMaps = require('react-native-maps'); } catch {}
const MapView = RNMaps?.default ?? null;
const Marker = (RNMaps as any)?.Marker ?? null;
const Polyline = (RNMaps as any)?.Polyline ?? null;
const Circle = (RNMaps as any)?.Circle ?? null;
type Region = import('react-native-maps').Region;
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { SK_SAVED_ROUTES, SK_FAVS, SK_SAVED_NEIGHBOURHOODS, SK_SAVED_PLACES } from '../../lib/storageKeys';
import { supabase } from '../../lib/supabase';
import { NEIGHBOURHOODS } from '../../lib/neighbourhoodData';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from '../../lib/happyHourData';
import ActiveTrip from '../../components/ActiveTrip';
import BusTrackingModal from '../../components/BusTrackingModal';
import BottomSheet from '@gorhom/bottom-sheet';
import NearbyTransitSheet, { NearbyStop } from '../../components/NearbyTransitSheet';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';
import { cacheArrivals, getCachedArrivals } from '../../lib/arrivalCache';
import type { ServiceTile } from '../../components/ServicesGrid';

import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { haversineKm } from '../../lib/geo';
import { LAYER_CONFIG, LAYER_ICONS, DEFAULT_LAYERS, MapPin, LayerKey, saveLayerPrefs, loadLayerPrefs } from '../../lib/mapLayers';

const VEHICLES_URL    = 'https://routeo-backend.vercel.app/api/vehicles';
const BACKEND_URL     = 'https://routeo-backend.vercel.app/api/arrivals';
const CITY_URL        = 'https://routeo-backend.vercel.app/api/city';

function weatherCodeToText(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

function weatherCodeToIcon(code: number): string {
  if (code === 0) return 'sunny';
  if (code <= 3) return 'partly-sunny';
  if (code <= 49) return 'cloudy';
  if (code <= 59) return 'rainy';
  if (code <= 69) return 'rainy';
  if (code <= 79) return 'snow';
  if (code <= 82) return 'rainy';
  if (code <= 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'cloudy';
}

type SavedRoute = { id: string; fromLabel: string; toLabel: string; fromLat: number; fromLng: number; toLat: number; toLng: number };
type SavedFav = { id: string; name: string; icon: string };
type SavedPin = { id: string; name: string; lat: number; lng: number; kind: 'stop' | 'route_from' | 'route_to' | 'neighbourhood' | 'place'; routeLabel?: string; vicinity?: string };

const OTTAWA_REGION: Region = {
  latitude: 45.4215, longitude: -75.6972,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};

type Bus = {
  id: string; routeId: string; lat: number; lng: number;
  fromStop: string; toStop: string; progress: number;
  agency?: 'OC_TRANSPO' | 'STO';
};

type MapEvent = {
  id: string; name: string; date: string; time?: string;
  venue: string; address?: string; url: string;
  image?: string; category?: string; free?: boolean;
  source: 'ticketmaster';
  lat?: number; lng?: number;
};

type DiscoveryResult = { id: string; name: string; address: string; lat: number; lng: number; rating?: number };

type TripLeg = {
  mode: string; startTime: number; endTime: number; duration: number; distance: number;
  from: { name: string; lat: number; lon: number }; to: { name: string; lat: number; lon: number };
  agencyId?: string; routeShortName: string | null; routeLongName: string | null;
  headsign: string | null; intermediateStops: string[];
  steps: { distance: number; relativeDirection: string; streetName: string; instruction?: string | null }[];
  legGeometry?: { points: string };
};
type TripItinerary = { duration: number; startTime: number; endTime: number; transfers: number; walkDistance: number; legs: TripLeg[] };

const ROUTE_COLOURS: { [key: string]: string } = {
  '1': '#00A78D', '2': '#7b5ea7', '4': '#004890', '7': '#cc3b2a',
  '8': '#e8a020', '14': '#004890', '16': '#00A78D', '18': '#cc3b2a',
  '19': '#e8a020', '85': '#004890', '86': '#7b5ea7', '87': '#cc3b2a',
  '88': '#00A78D', '91': '#004890', '95': '#cc3b2a', '96': '#e8a020',
  '97': '#7b5ea7', '98': '#004890', '99': '#00A78D',
};
const getRouteColour = (routeId: string) => ROUTE_COLOURS[routeId.split('-')[0]] || '#004890';
const isLRT = (routeId: string) => {
  const base = routeId.split('-')[0].toLowerCase();
  return base === '1' || base === '2' || base === 'o1' || base === 'o2' ||
         base === 'confederation' || base === 'trillium' || routeId.toLowerCase().includes('lrt');
};

const validCoord = (lat: any, lng: any) => lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

// Heat zones
interface HeatZone {
  id: string;
  type: 'happy_hour' | 'sports' | 'event';
  lat: number;
  lng: number;
  radius: number;
  color: string;
  strokeColor: string;
  count?: number;
  label: string;
}

export type VenueState = 'active' | 'soon' | 'upcoming' | 'closed';

function parseTimeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function getVenueState(deal: { start: string; end: string }, currentMins: number): VenueState {
  const openMins = parseTimeToMins(deal.start);
  const closeMins = parseTimeToMins(deal.end);
  if (currentMins >= openMins && currentMins < closeMins) return 'active';
  if (currentMins >= openMins - 30 && currentMins < openMins) return 'soon';
  if (currentMins >= openMins - 180 && currentMins < openMins) return 'upcoming';
  return 'closed';
}

function getActiveDeals(venue: HappyHourVenue, dayOfWeek: number, currentMins: number): { deal: typeof venue.deals[0]; state: VenueState }[] {
  return venue.deals
    .filter(d => d.days.includes(dayOfWeek))
    .map(d => ({ deal: d, state: getVenueState(d, currentMins) }))
    .filter(d => d.state !== 'closed');
}

type ClusterResult = { centroidLat: number; centroidLng: number; count: number; venues: HappyHourVenue[] };

function clusterVenues(venues: HappyHourVenue[], radiusMeters: number): ClusterResult[] {
  const R = radiusMeters / 111000; // approximate degrees
  const used = new Set<number>();
  const clusters: ClusterResult[] = [];
  for (let i = 0; i < venues.length; i++) {
    if (used.has(i)) continue;
    const group = [venues[i]];
    used.add(i);
    for (let j = i + 1; j < venues.length; j++) {
      if (used.has(j)) continue;
      const dLat = venues[i].lat - venues[j].lat;
      const dLng = venues[i].lng - venues[j].lng;
      if (Math.sqrt(dLat * dLat + dLng * dLng) < R) {
        group.push(venues[j]);
        used.add(j);
      }
    }
    if (group.length >= 2) {
      const cLat = group.reduce((s, v) => s + v.lat, 0) / group.length;
      const cLng = group.reduce((s, v) => s + v.lng, 0) / group.length;
      clusters.push({ centroidLat: cLat, centroidLng: cLng, count: group.length, venues: group });
    }
  }
  return clusters;
}

// Styled square badge bus marker — OC red (#CE1126), STO teal (#00A78D)
// tracksViewChanges must be true for first render so the custom View is captured
// as a bitmap, then switches to false for scroll performance.
// tracksViewChanges briefly re-enables when position changes so iOS re-snapshots.
const BusMarker = React.memo(({ bus, onPress }: { bus: Bus; onPress: (b: Bus) => void }) => {
  const [tracked, setTracked] = React.useState(true);
  const prevCoord = React.useRef(`${bus.lat},${bus.lng}`);

  React.useEffect(() => {
    const coord = `${bus.lat},${bus.lng}`;
    if (coord !== prevCoord.current) {
      prevCoord.current = coord;
      setTracked(true);
    }
    const id = setTimeout(() => setTracked(false), 300);
    return () => clearTimeout(id);
  }, [bus.lat, bus.lng]);

  if (!validCoord(bus.lat, bus.lng) || !bus.routeId || bus.routeId === '?') return null;
  const isSTO = bus.agency === 'STO';
  const label = isLRT(bus.routeId) ? 'LRT' : bus.routeId.split('-')[0];
  if (!label) return null;
  const bg = isSTO ? '#00A78D' : '#CE1126';
  return (
    <Marker
      coordinate={{ latitude: bus.lat, longitude: bus.lng }}
      tracksViewChanges={tracked}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => onPress(bus)}
    >
      <View style={{ backgroundColor: bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 26, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} allowFontScaling={false}>{label}</Text>
      </View>
    </Marker>
  );
}, (prev, next) => prev.bus.id === next.bus.id && prev.bus.lat === next.bus.lat && prev.bus.lng === next.bus.lng && prev.bus.routeId === next.bus.routeId);

// Styled category marker — colored rounded square with white Ionicon inside
const PlaceMarker = React.memo(({ coordinate, icon, color, title, description, onPress }: {
  coordinate: { latitude: number; longitude: number };
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title?: string;
  description?: string;
  onPress?: () => void;
}) => {
  const [tracked, setTracked] = React.useState(true);
  React.useEffect(() => {
    const id = setTimeout(() => setTracked(false), 500);
    return () => clearTimeout(id);
  }, []);
  if (!coordinate || !validCoord(coordinate.latitude, coordinate.longitude)) return null;
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={tracked}
      anchor={{ x: 0.5, y: 1.0 }}
      title={title}
      description={description}
      onPress={onPress}
    >
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
    </Marker>
  );
});

const CATEGORY_COLORS: { [key: string]: string } = {
  'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
  'Health': '#0077b6', 'Sports': '#004890', 'Business': '#444',
  'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a',
  'Hobbies': '#7b5ea7',
};
const getCatColor = (cat?: string) => CATEGORY_COLORS[cat || ''] || '#555';

type VenuePin = HappyHourVenue;

function distAlongShape(shape: {latitude: number; longitude: number}[], lat: number, lng: number): { index: number; cumDist: number } {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d = haversineKm(lat, lng, shape[i].latitude, shape[i].longitude);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  let cumDist = 0;
  for (let i = 1; i <= bestIdx; i++) {
    cumDist += haversineKm(shape[i - 1].latitude, shape[i - 1].longitude, shape[i].latitude, shape[i].longitude);
  }
  return { index: bestIdx, cumDist };
}

const VENUE_PINS: VenuePin[] = HAPPY_HOUR_VENUES;

const VENUE_COLORS = { food: '#E67E22', happy_hour: '#8E44AD', clubs: '#E91E63', fitness: '#2ECC71' };

const DISCOVER_PLACE_TYPES: Record<string, string> = {
  food: 'restaurant', coffee: 'cafe', bars: 'bar', gyms: 'gym', grocery: 'supermarket',
};
const DISC_CAT_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  food: { icon: 'restaurant', color: '#E67E22' },
  coffee: { icon: 'cafe', color: '#795548' },
  bars: { icon: 'beer', color: '#8E44AD' },
  gyms: { icon: 'barbell', color: '#2ECC71' },
  grocery: { icon: 'cart', color: '#3498db' },
};

const venueTypeColor = (tp: string): string =>
  tp === 'fitness' ? VENUE_COLORS.fitness : tp === 'club' ? VENUE_COLORS.clubs : tp === 'restaurant' ? VENUE_COLORS.food : VENUE_COLORS.happy_hour;

const isTimeInRange = (time: string, start: string, end: string): boolean => {
  if (end < start) return time >= start || time <= end; // crosses midnight
  return time >= start && time <= end;
};

const getVenueTodayDeals = (venue: VenuePin, lang: string = 'en'): { active: string[]; upcoming: string[] } => {
  const now = new Date();
  const day = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayDeals = venue.deals.filter(d => d.days.includes(day));
  const desc = (d: typeof todayDeals[0]) => lang === 'fr' && d.description_fr ? d.description_fr : d.description;
  const active = todayDeals.filter(d => isTimeInRange(timeStr, d.start, d.end)).map(desc);
  const upcoming = todayDeals.filter(d => !isTimeInRange(timeStr, d.start, d.end) && timeStr < d.start).map(desc);
  return { active, upcoming };
};
const venueHasActiveOrUpcomingToday = (venue: VenuePin): boolean => {
  const { active, upcoming } = getVenueTodayDeals(venue);
  return active.length > 0 || upcoming.length > 0;
};

// Today filter
const getTodayStr = () => {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD in ET
};

// Grid-based clustering
type Cluster = {
  id: string;
  lat: number; lng: number;
  events: MapEvent[];
  count: number;
};

const clusterEvents = (events: MapEvent[], delta: number): Cluster[] => {
  // Grid cell size scales with zoom level
  const gridSize = delta * 0.15;
  const cells: { [key: string]: MapEvent[] } = {};
  for (const ev of events) {
    if (!ev.lat || !ev.lng) continue;
    const cellX = Math.floor(ev.lng / gridSize);
    const cellY = Math.floor(ev.lat / gridSize);
    const key = `${cellX}_${cellY}`;
    if (!cells[key]) cells[key] = [];
    cells[key].push(ev);
  }
  return Object.entries(cells).map(([key, evs]) => {
    const avgLat = evs.reduce((s, e) => s + (e.lat || 0), 0) / evs.length;
    const avgLng = evs.reduce((s, e) => s + (e.lng || 0), 0) / evs.length;
    return { id: 'cluster_' + key, lat: avgLat, lng: avgLng, events: evs, count: evs.length };
  });
};

// Module-level event cache (persists for app session)
let _eventsCache: MapEvent[] | null = null;
let _eventsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const fetchAllEvents = async (): Promise<MapEvent[]> => {
  if (_eventsCache && Date.now() - _eventsCacheTime < CACHE_TTL) return _eventsCache;

  let events: MapEvent[] = [];
  try {
    const tmResp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/ebevents?action=ticketmaster&city=Ottawa&radius=50&size=50`);
    if (tmResp.ok) {
      const d = await tmResp.json();
      const tmEvents: MapEvent[] = (d._embedded?.events || []).map((e: any) => ({
        id: 'tm_' + e.id,
        name: e.name,
        date: e.dates?.start?.localDate || '',
        time: e.dates?.start?.localTime?.slice(0, 5) || '',
        venue: e._embedded?.venues?.[0]?.name || '',
        address: e._embedded?.venues?.[0]?.address?.line1 || '',
        url: e.url,
        image: e.images?.find((img: any) => img.ratio === '16_9' && img.width > 500)?.url || e.images?.[0]?.url,
        category: e.classifications?.[0]?.segment?.name,
        source: 'ticketmaster' as const,
        lat: parseFloat(e._embedded?.venues?.[0]?.location?.latitude),
        lng: parseFloat(e._embedded?.venues?.[0]?.location?.longitude),
      })).filter((e: MapEvent) => e.lat && e.lng && !isNaN(e.lat) && !isNaN(e.lng));
      events.push(...tmEvents);
    }
  } catch (_) { if (__DEV__) console.warn('fetch events failed:', _); }
  _eventsCache = events;
  _eventsCacheTime = Date.now();
  return events;
};


export default function MapScreen() {
  const { colours, theme, resolvedTheme, t, fonts, language } = useApp();
  const { savedBoard: boardItems } = useBoard();
  const insets = useSafeAreaInsets();
  const isLight = resolvedTheme === 'light';
  const mapRef = useRef<any>(null);
  const deepLinkParams = useLocalSearchParams();

  const [buses, setBuses] = useState<Bus[]>([]);
  const [busLoading, setBusLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenuePin | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set(['all']));
  const [searchText, setSearchText] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<{ placeId: string; name: string; address: string }[]>([]);
  const [searchedPlace, setSearchedPlace] = useState<{ placeId: string; name: string; address: string; lat: number; lng: number } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<MapEvent[] | null>(null);
  const [region, setRegion] = useState<Region>(OTTAWA_REGION);
  const [debouncedDelta, setDebouncedDelta] = useState(OTTAWA_REGION.latitudeDelta);
  const appIsActive = useRef(true);
  const busIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [visibleBusCount, setVisibleBusCount] = useState(0);
  const [savedPins, setSavedPins] = useState<SavedPin[]>([]);
  const [savedRouteIds, setSavedRouteIds] = useState<Set<string>>(new Set());
  const [selectedSavedPin, setSelectedSavedPin] = useState<SavedPin | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [selectedRouteShape, setSelectedRouteShape] = useState<{latitude: number; longitude: number}[]>([]);
  const [busEtaInfo, setBusEtaInfo] = useState<{ mins: number; stopName: string; stopId: string } | null>(null);
  const [trackingBus, setTrackingBus] = useState<Bus | null>(null);

  // Tapped location ("Route here" feature)
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const tappedLocationRef = useRef<{ lat: number; lng: number; address: string } | null>(null);
  // Keep ref in sync with state so stable callbacks can read latest value
  useEffect(() => { tappedLocationRef.current = tappedLocation; }, [tappedLocation]);
  const tappedAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  // Community contribute modal
  const [contributeVisible, setContributeVisible] = useState(false);
  const [contribName, setContribName] = useState('');
  const [contribType, setContribType] = useState('');
  const [contribInfo, setContribInfo] = useState('');
  const [contribAddress, setContribAddress] = useState('');
  const [contribSending, setContribSending] = useState(false);
  const [contribSent, setContribSent] = useState(false);

  // Inline trip planning
  const [tripResults, setTripResults] = useState<TripItinerary[]>([]);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripDestLabel, setTripDestLabel] = useState('');
  const [tripDest, setTripDest] = useState<{ lat: number; lng: number } | null>(null);
  const [activeTripItinerary, setActiveTripItinerary] = useState<TripItinerary | null>(null);

  // Nearby transit sheet
  const nearbySheetRef = useRef<BottomSheet>(null);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [expandedArrivals, setExpandedArrivals] = useState<{ routeId: string; headsign: string; minsAway: number; source?: string }[]>([]);
  const [expandedArrivalsLoading, setExpandedArrivalsLoading] = useState(false);

  // City layers
  const [activeLayers, setActiveLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [layerPins, setLayerPins] = useState<Partial<Record<LayerKey, MapPin[]>>>({});
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  // Sheet data: saved board, alerts, weather, events
  const [sheetAlerts, setSheetAlerts] = useState<any[]>([]);
  const [sheetWeather, setSheetWeather] = useState<{ temp: number; condition: string; icon: string } | null>(null);
  const [sheetEvents, setSheetEvents] = useState<{ name: string; date: string; time?: string; venue: string; lat?: number; lng?: number }[]>([]);
  const [sheetSensGame, setSheetSensGame] = useState<any>(null);
  const [sheetDeals, setSheetDeals] = useState<{ id: string; venue_name: string; deal_text: string; day_of_week: number }[]>([]);

  // Discovery mode — Google Places nearby search
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(null);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResult[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [loadingLayers, setLoadingLayers] = useState<Set<LayerKey>>(new Set());
  const layerFetchedAt = useRef<Partial<Record<LayerKey, number>>>({});
  const pinCardAnim = useRef(new Animated.Value(0)).current;

  // Load layer preferences on mount
  useEffect(() => {
    loadLayerPrefs().then(prefs => setActiveLayers(prefs));
  }, []);

  // Animate pin card on selection + fetch live Foursquare data if available
  useEffect(() => {
    if (selectedPin) {
      pinCardAnim.setValue(0);
      Animated.timing(pinCardAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      // Fetch fresh venue detail from Foursquare in background
      if (selectedPin.fsqId) {
        fetchWithTimeout(`${CITY_URL}?type=venue_detail&fsqId=${selectedPin.fsqId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            setSelectedPin(prev => {
              if (!prev || prev.id !== selectedPin.id) return prev;
              return {
                ...prev,
                isOpenNow: data.isOpenNow ?? prev.isOpenNow,
                rating: data.rating ?? prev.rating,
                photoUrl: data.photoUrl ?? prev.photoUrl,
                price: data.price != null ? '$'.repeat(data.price) : prev.price,
              };
            });
          })
          .catch(() => {});
      }
    }
  }, [selectedPin?.id]);

  const fetchLayerData = useCallback(async (layer: LayerKey) => {
    const lat = region.latitude;
    const lng = region.longitude;
    const CITY = CITY_URL;
    setLoadingLayers(prev => new Set(prev).add(layer));
    try {
      let pins: MapPin[] = [];
      if (layer === 'restaurants' || layer === 'bars') {
        const r = await fetchWithTimeout(`${CITY}?type=foursquare&lat=${lat}&lng=${lng}&category=${layer}&radius=1500`);
        if (r.ok) pins = await r.json();
      } else if (layer === 'construction') {
        const r = await fetchWithTimeout(`${CITY}?type=construction`);
        if (r.ok) pins = await r.json();
      } else if (layer === 'events') {
        const now = new Date().toISOString().replace(/\.\d+Z/, 'Z');
        const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/ebevents?action=ticketmaster&city=Ottawa&size=30&startDateTime=${encodeURIComponent(now)}`);
        if (r.ok) {
          const data = await r.json();
          const evts = data.events || [];
          pins = evts
            .filter((e: any) => e.lat != null && e.lng != null)
            .map((e: any) => ({
              id: `event_${e.id}`,
              category: 'events' as LayerKey,
              name: e.name,
              subtitle: e.venue || '',
              lat: e.lat,
              lng: e.lng,
              time: e.date,
              url: e.url,
              photoUrl: e.imageUrl,
              source: 'ticketmaster' as const,
            }));
          // Also update sheetEvents for TonightCard
          setSheetEvents(evts.map((e: any) => ({ name: e.name, date: e.date, time: e.time, venue: e.venue, lat: e.lat, lng: e.lng })));
        }
      } else if (layer === 'deals') {
        // Community deals from Supabase
        const { data: deals } = await supabase
          .from('community_deals')
          .select('id, venue_name, deal_description, lat, lng, photo_url, category')
          .eq('approved', true)
          .not('lat', 'is', null);
        const communityPins: MapPin[] = (deals || []).map((d: any) => ({
          id: `deal_${d.id}`,
          category: 'deals' as LayerKey,
          name: d.venue_name,
          subtitle: d.deal_description,
          lat: d.lat,
          lng: d.lng,
          photoUrl: d.photo_url,
          source: 'community' as const,
        }));
        // Hardcoded happy hour venues with active/upcoming deals today
        const now = new Date();
        const day = now.getDay();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const venuePins: MapPin[] = HAPPY_HOUR_VENUES
          .filter(v => v.deals.some(d => d.days.includes(day) && timeStr <= d.end))
          .map(v => {
            const todayDeals = v.deals.filter(d => d.days.includes(day) && timeStr <= d.end);
            const active = todayDeals.some(d => timeStr >= d.start && timeStr < d.end);
            return {
              id: `hh_${v.name.replace(/\s+/g, '_').toLowerCase()}`,
              category: 'deals' as LayerKey,
              name: v.name,
              subtitle: (language === 'fr' && todayDeals[0]?.description_fr) ? todayDeals[0].description_fr : (todayDeals[0]?.description || ''),
              lat: v.lat,
              lng: v.lng,
              isOpenNow: active,
              time: active ? todayDeals.find(d => timeStr >= d.start)?.end : todayDeals[0]?.start,
              rating: v.rating,
              photoUrl: v.photoUrl,
              fsqId: v.fsqId,
              source: 'community' as const,
            };
          });
        pins = [...venuePins, ...communityPins];
      } else if (layer === 'ghost_buses') {
        // Fetch recent ghost bus reports grouped by stop, join with stops table for lat/lng
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: reports } = await supabase
          .from('stop_reports')
          .select('stop_id, route_id, category, created_at')
          .neq('category', 'confirmed_arrived')
          .gte('created_at', oneHourAgo);
        if (reports && reports.length > 0) {
          // Group by stop_id
          const byStop: Record<string, { routes: Set<string>; count: number }> = {};
          for (const r of reports) {
            if (!byStop[r.stop_id]) byStop[r.stop_id] = { routes: new Set(), count: 0 };
            byStop[r.stop_id].count++;
            if (r.route_id) byStop[r.stop_id].routes.add(r.route_id);
          }
          // Get stop coordinates
          const stopIds = Object.keys(byStop);
          const { data: stops } = await supabase
            .from('stops')
            .select('stop_id, stop_name, stop_lat, stop_lon')
            .in('stop_id', stopIds);
          if (stops) {
            pins = stops.map((s: any) => ({
              id: `ghost_${s.stop_id}`,
              category: 'ghost_buses' as LayerKey,
              name: s.stop_name || `Stop ${s.stop_id}`,
              subtitle: `${byStop[s.stop_id].count} report${byStop[s.stop_id].count > 1 ? 's' : ''} - ${[...byStop[s.stop_id].routes].join(', ')}`,
              lat: s.stop_lat,
              lng: s.stop_lon,
              source: 'supabase' as const,
            }));
          }
        }
      } else if (layer === 'bike_share') {
        const r = await fetchWithTimeout(`${CITY}?type=bike_share`);
        if (r.ok) pins = await r.json();
      } else if (layer === 'coffee' || layer === 'grocery' || layer === 'pharmacy' || layer === 'gyms') {
        const r = await fetchWithTimeout(`${CITY}?type=foursquare&lat=${lat}&lng=${lng}&category=${layer}&radius=1500`);
        if (r.ok) pins = await r.json();
      }
      setLayerPins(prev => ({ ...prev, [layer]: pins }));
      layerFetchedAt.current[layer] = Date.now();
    } catch (e) {
      if (__DEV__) console.warn(`Layer fetch failed: ${layer}`, e);
    } finally {
      setLoadingLayers(prev => { const s = new Set(prev); s.delete(layer); return s; });
    }
  }, [region]);

  const toggleLayer = async (key: LayerKey) => {
    hapticLight();
    const newLayers = { ...activeLayers, [key]: !activeLayers[key] };
    setActiveLayers(newLayers);
    saveLayerPrefs(newLayers).catch(e => { if (__DEV__) console.warn('Layer prefs save failed:', e); });
    if (!newLayers[key] && selectedPin?.category === key) setSelectedPin(null);
    const DYNAMIC_TTL: Partial<Record<LayerKey, number>> = { construction: 15 * 60000 };
    const ttl = DYNAMIC_TTL[key];
    const lastFetch = layerFetchedAt.current[key] || 0;
    const isStale = ttl ? Date.now() - lastFetch > ttl : !layerPins[key]?.length;
    if (newLayers[key] && isStale) { fetchLayerData(key); }
  };

  // Happening Now: time-sensitive pins within 500m
  const happeningNow = useMemo(() => {
    if (!layerPins) return [];
    const timeLayers: LayerKey[] = ['events', 'deals'];
    const allPins = timeLayers.flatMap(k => (activeLayers[k] ? (layerPins[k] || []) : []));
    // Filter to within ~500m of map center
    const R = 0.0045; // ~500m in degrees
    return allPins.filter(p =>
      Math.abs(p.lat - region.latitude) < R && Math.abs(p.lng - region.longitude) < R
    ).slice(0, 10);
  }, [layerPins, activeLayers, region.latitude, region.longitude]);

  // Current time info for heat zones + deal states (refreshes with region changes)
  const ottawaNow = useMemo(() => {
    const now = new Date();
    const dayOfWeek = parseInt(now.toLocaleDateString('en-CA', { weekday: 'narrow', timeZone: 'America/Toronto' }).replace(/[^0-6]/, '0'), 10);
    // getDay() works fine for numeric day
    const d = new Date(now.toLocaleString('en-CA', { timeZone: 'America/Toronto' }));
    const currentMins = d.getHours() * 60 + d.getMinutes();
    return { dayOfWeek: d.getDay(), currentMins };
  }, [region]); // re-evaluate when map moves (rough timer proxy)

  // Heat zones from happy hours, sports, events
  const heatZones = useMemo(() => {
    const zones: HeatZone[] = [];
    const { dayOfWeek, currentMins } = ottawaNow;

    // Happy hour zones — find active venues and cluster them
    const activeVenues = HAPPY_HOUR_VENUES.filter(v =>
      getActiveDeals(v, dayOfWeek, currentMins).length > 0
    );
    // Include community deals as virtual venues for clustering
    const communityDealPins = (layerPins?.deals ?? []).filter(p => p.id.startsWith('deal_'));
    const communityAsVenues: HappyHourVenue[] = communityDealPins.map(p => ({
      name: p.name, address: '', type: ['restaurant' as const],
      lat: p.lat, lng: p.lng,
      deals: [{ days: [dayOfWeek], start: '00:00', end: '23:59', description: p.subtitle, description_fr: p.subtitle }],
    }));
    const allActiveVenues = [...activeVenues, ...communityAsVenues];
    const clusters = clusterVenues(allActiveVenues, 800);
    clusters.forEach(cluster => {
      zones.push({
        id: `happy-${cluster.centroidLat.toFixed(4)}-${cluster.centroidLng.toFixed(4)}`,
        type: 'happy_hour',
        lat: cluster.centroidLat,
        lng: cluster.centroidLng,
        radius: 300 + (cluster.count * 50),
        color: 'rgba(255, 165, 0, 0.15)',
        strokeColor: 'rgba(255, 165, 0, 0.4)',
        count: cluster.count,
        label: `${cluster.count} deals active`,
      });
    });

    // Sports game zone
    if (sheetSensGame?.state === 'pre' || sheetSensGame?.state === 'live') {
      zones.push({
        id: 'sens-game',
        type: 'sports',
        lat: 45.2969,
        lng: -75.9272,
        radius: 600,
        color: 'rgba(200, 16, 46, 0.12)',
        strokeColor: 'rgba(200, 16, 46, 0.3)',
        label: t('Sens game tonight', 'Match des Sens ce soir'),
      });
    }

    // Event zones from Ticketmaster (events starting within 3 hours)
    const now = Date.now();
    (sheetEvents ?? []).forEach(e => {
      if (!e.lat || !e.lng || !e.date) return;
      const eventDate = new Date(`${e.date}T${e.time || '19:00'}`);
      const hoursUntil = (eventDate.getTime() - now) / (1000 * 60 * 60);
      if (hoursUntil >= -1 && hoursUntil <= 3) {
        zones.push({
          id: `event-${e.date}-${e.venue}`,
          type: 'event',
          lat: e.lat,
          lng: e.lng,
          radius: 400,
          color: 'rgba(155, 89, 182, 0.12)',
          strokeColor: 'rgba(155, 89, 182, 0.3)',
          label: e.name,
        });
      }
    });

    return zones;
  }, [ottawaNow, sheetSensGame, sheetEvents, layerPins, t]);

  // Count active deals nearby for chip badge
  const activeDealsNearby = useMemo(() => {
    const { dayOfWeek, currentMins } = ottawaNow;
    const R = 0.045; // ~5km
    return HAPPY_HOUR_VENUES.filter(v =>
      Math.abs(v.lat - region.latitude) < R &&
      Math.abs(v.lng - region.longitude) < R &&
      getActiveDeals(v, dayOfWeek, currentMins).length > 0
    ).length;
  }, [ottawaNow, region.latitude, region.longitude]);

  const fetchRouteShape = useCallback(async (routeId: string, agency?: string) => {
    try {
      const bareId = routeId.split('-')[0];
      const agencyParam = agency === 'STO' ? '&agency=STO' : '';
      if (__DEV__) console.log(`[RouteShape] fetching shape for routeId="${routeId}" bareId="${bareId}" agency="${agency}"`);
      const resp = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/route?id=${encodeURIComponent(bareId)}&action=shape${agencyParam}`,
        { timeout: 8000 }
      );
      if (!resp.ok) {
        if (__DEV__) console.log(`[RouteShape] backend returned ${resp.status}`);
        return;
      }
      const data = await resp.json();
      if (__DEV__) console.log(`[RouteShape] route=${data?.routeId} received ${data?.shape?.length ?? 0} points`);
      if (data?.shape?.length) {
        setSelectedRouteShape(data.shape);
      } else {
        if (__DEV__) console.log(`[RouteShape] no shape returned for route ${bareId}`);
      }
    } catch (e) {
      if (__DEV__) console.log('[RouteShape] error:', e);
    }
  }, []);

  const openSheet = useCallback((bus?: Bus, event?: MapEvent, clusterEvs?: MapEvent[], venue?: VenuePin) => {
    if (bus) hapticMedium(); else hapticLight();
    // Dismiss tapped location card if open
    if (tappedLocationRef.current) { setTappedLocation(null); tappedAnim.setValue(0); }
    setSelectedBus(bus || null); setSelectedEvent(event || null); setSelectedCluster(clusterEvs || null); setSelectedVenue(venue || null);
    if (!bus && !event && !clusterEvs && !venue) {
      // saved pin — selectedSavedPin is already set
    } else {
      setSelectedSavedPin(null);
    }
    if (bus?.routeId) {
      setSelectedRouteShape([]);
      fetchRouteShape(bus.routeId, bus.agency);
    } else {
      setSelectedRouteShape([]);
    }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [sheetAnim, fetchRouteShape, tappedAnim]);

  const hideSheet = useCallback(() => {
    hapticLight();
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null);
      setSelectedRouteShape([]); setBusEtaInfo(null);
    });
  }, [sheetAnim]);

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const tappedTranslate = tappedAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });

  const handleMapTap = useCallback(async (e: any) => {
    // If a sheet is open, dismiss it instead
    if (selectedBus || selectedEvent || selectedCluster || selectedVenue || selectedSavedPin || searchedPlace) {
      hideSheet();
      return;
    }
    const coord = e.nativeEvent?.coordinate;
    if (!coord) return;
    const { latitude, longitude } = coord;
    if (!validCoord(latitude, longitude)) return;
    // Show card immediately with "Loading address..."
    setTappedLocation({ lat: latitude, lng: longitude, address: '' });
    Animated.spring(tappedAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    // Reverse geocode
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results?.[0]) {
        const r = results[0];
        const parts = [r.streetNumber, r.street, r.city].filter(Boolean);
        setTappedLocation(prev => prev ? { ...prev, address: parts.join(' ') || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` } : null);
      } else {
        setTappedLocation(prev => prev ? { ...prev, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` } : null);
      }
    } catch {
      setTappedLocation(prev => prev ? { ...prev, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` } : null);
    }
  }, [selectedBus, selectedEvent, selectedCluster, selectedVenue, selectedSavedPin, searchedPlace, hideSheet, tappedAnim]);

  const dismissTapped = useCallback(() => {
    Animated.spring(tappedAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setTappedLocation(null);
    });
  }, [tappedAnim]);

  const fetchInlineTrip = useCallback(async (destLat: number, destLng: number, destLabel: string) => {
    setTripLoading(true);
    setTripResults([]);
    setTripDestLabel(destLabel);
    setTripDest({ lat: destLat, lng: destLng });
    // Dismiss other sheets
    hideSheet();
    dismissTapped();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setTripLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
      const resp = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/plan?fromLat=${loc.coords.latitude}&fromLng=${loc.coords.longitude}&fromLabel=Current+Location&toLat=${destLat}&toLng=${destLng}&toLabel=${encodeURIComponent(destLabel)}&time=${time}&date=${date}&arriveBy=false&mode=transit&maxWalk=1000`,
        { timeout: 12000 }
      );
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const itins: TripItinerary[] = data.itineraries || [];
      setTripResults(itins);
    } catch (e) { if (__DEV__) console.warn('Inline trip plan failed:', e); }
    setTripLoading(false);
  }, [hideSheet, dismissTapped]);

  const clearTripResults = useCallback(() => {
    setTripResults([]);
    setTripDest(null);
    setTripDestLabel('');
  }, []);

  // Nearby stops fetch
  const fetchNearbyStops = useCallback(async () => {
    setNearbyLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setNearbyLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const uLat = loc.coords.latitude;
      const uLng = loc.coords.longitude;

      const delta = 0.015; // ~1.5km bounding box
      const { data: stops } = await supabase
        .from('stops')
        .select('stop_id,stop_name,stop_lat,stop_lon')
        .gte('stop_lat', uLat - delta)
        .lte('stop_lat', uLat + delta)
        .gte('stop_lon', uLng - delta)
        .lte('stop_lon', uLng + delta)
        .limit(100);

      if (!stops || stops.length === 0) { setNearbyStops([]); setNearbyLoading(false); return; }

      // Sort by distance
      const sorted = stops
        .map(s => ({ ...s, dist: haversineKm(uLat, uLng, s.stop_lat, s.stop_lon) * 1000 }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 10);

      // Build initial stops with loading arrivals
      const initial: NearbyStop[] = sorted.map(s => ({
        stopId: s.stop_id,
        stopName: s.stop_name || `Stop #${s.stop_id}`,
        walkMeters: Math.round(s.dist),
        arrivals: [],
        arrivalsLoading: true,
      }));
      setNearbyStops(initial);
      setNearbyLoading(false);

      // Fetch arrivals for each stop in parallel
      const results = await Promise.allSettled(
        sorted.map(async s => {
          const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${s.stop_id}`, { timeout: 8000 });
          if (!resp.ok) return { stopId: s.stop_id, arrivals: [] };
          const data = await resp.json();
          const now = Date.now();
          const arrivals = (data.trips || [])
            .filter((tr: any) => tr.adjustedTime > now)
            .slice(0, 4)
            .map((tr: any) => ({
              routeId: tr.routeId || tr.route || '',
              headsign: tr.headsign || tr.destination || '',
              minsAway: Math.max(0, Math.round((tr.adjustedTime - now) / 60000)),
            }));
          return { stopId: s.stop_id, arrivals };
        })
      );

      // Cache successful results & fall back to cache on failure
      const updatedStops = await Promise.all(initial.map(async (stop) => {
        const idx = sorted.findIndex(s => s.stop_id === stop.stopId);
        const result = idx >= 0 ? results[idx] : undefined;
        if (result?.status === 'fulfilled' && result.value.arrivals.length > 0) {
          cacheArrivals(stop.stopId, { arrivals: result.value.arrivals, source: 'live', stopName: stop.stopName });
          return { ...stop, arrivals: result.value.arrivals, arrivalsLoading: false };
        }
        // Fetch failed or empty — try cache
        const cached = await getCachedArrivals(stop.stopId);
        if (cached && cached.arrivals.length > 0) {
          return { ...stop, arrivals: cached.arrivals, arrivalsLoading: false, cached: true, cachedAt: cached.cachedAt };
        }
        return { ...stop, arrivalsLoading: false };
      }));
      setNearbyStops(updatedStops);
    } catch (e) {
      if (__DEV__) console.warn('Nearby stops fetch failed:', e);
      setNearbyLoading(false);
    }
  }, []);

  // Fetch expanded stop arrivals
  const handleExpandStop = useCallback(async (stopId: string | null) => {
    setExpandedStopId(stopId);
    if (!stopId) { setExpandedArrivals([]); return; }
    setExpandedArrivalsLoading(true);
    try {
      const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${stopId}`, { timeout: 8000 });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const now = Date.now();
      const arrivals = (data.trips || [])
        .filter((tr: any) => tr.adjustedTime > now)
        .slice(0, 10)
        .map((tr: any) => ({
          routeId: tr.routeId || tr.route || '',
          headsign: tr.headsign || tr.destination || '',
          minsAway: Math.max(0, Math.round((tr.adjustedTime - now) / 60000)),
          source: tr.source,
        }));
      setExpandedArrivals(arrivals);
      cacheArrivals(stopId, { arrivals, source: 'expanded', stopName: null });
    } catch (e) {
      if (__DEV__) console.warn('Expanded arrivals fetch failed:', e);
      // Fall back to cached arrivals
      const cached = await getCachedArrivals(stopId);
      if (cached && cached.arrivals.length > 0) {
        setExpandedArrivals(cached.arrivals.map((a: any) => ({ ...a, cached: true, cachedAt: cached.cachedAt })));
      } else {
        setExpandedArrivals([]);
      }
    }
    setExpandedArrivalsLoading(false);
  }, []);

  // Initial nearby stops fetch
  useEffect(() => { fetchNearbyStops(); }, [fetchNearbyStops]);

  // Sheet data fetching
  useEffect(() => {
    // Alerts
    fetchWithTimeout('https://routeo-backend.vercel.app/api/alerts', { timeout: 8000 })
      .then(r => r.ok ? r.json() : { alerts: [] })
      .then(data => { setSheetAlerts(data?.alerts || []); })
      .catch(() => {});

    // Weather
    fetchWithTimeout('https://api.open-meteo.com/v1/forecast?latitude=45.4215&longitude=-75.6972&current=temperature_2m,weather_code&timezone=America/Toronto', { timeout: 6000 })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.current) {
          const code = data.current.weather_code ?? 0;
          const temp = Math.round(data.current.temperature_2m ?? 0);
          const condition = weatherCodeToText(code);
          const icon = weatherCodeToIcon(code);
          setSheetWeather({ temp, condition, icon });
        }
      })
      .catch(() => {});

    // Sens game
    fetchWithTimeout('https://api-web.nhle.com/v1/schedule/now', { timeout: 6000 })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.gameWeek) return;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
        for (const day of data.gameWeek) {
          if (day.date !== todayStr) continue;
          for (const g of day.games || []) {
            if (g.homeTeam?.abbrev === 'OTT' || g.awayTeam?.abbrev === 'OTT') {
              const state = g.gameState === 'LIVE' || g.gameState === 'CRIT' ? 'live' : g.gameState === 'FUT' || g.gameState === 'PRE' ? 'pre' : 'none';
              setSheetSensGame({
                state,
                homeAbbr: g.homeTeam?.abbrev,
                awayAbbr: g.awayTeam?.abbrev,
                homeScore: g.homeTeam?.score,
                awayScore: g.awayTeam?.score,
                opponentAbbr: g.homeTeam?.abbrev === 'OTT' ? g.awayTeam?.abbrev : g.homeTeam?.abbrev,
                startTime: g.startTimeUTC,
              });
              return;
            }
          }
        }
      })
      .catch(() => {});

    // Community deals
    supabase.from('community_deals').select('id, venue_name, deal_text, day_of_week')
      .order('submitted_at', { ascending: false }).limit(10)
      .then(({ data }: { data: any }) => { if (data) setSheetDeals(data); })
      .then(() => {}, () => {});
  }, []);

  const routeToTapped = useCallback(() => {
    if (!tappedLocation) return;
    const label = tappedLocation.address || `${tappedLocation.lat.toFixed(5)}, ${tappedLocation.lng.toFixed(5)}`;
    fetchInlineTrip(tappedLocation.lat, tappedLocation.lng, label);
  }, [tappedLocation, fetchInlineTrip]);

  const dropPinAtTapped = useCallback(async () => {
    if (!tappedLocation) return;
    const label = tappedLocation.address || `${tappedLocation.lat.toFixed(5)}, ${tappedLocation.lng.toFixed(5)}`;
    const newPin: SavedPin = { id: `pin_${Date.now()}`, name: label, lat: tappedLocation.lat, lng: tappedLocation.lng, kind: 'place' };
    setSavedPins(prev => [...prev, newPin]);
    try {
      const raw = await AsyncStorage.getItem(SK_SAVED_PLACES);
      const existing = raw ? JSON.parse(raw) : [];
      existing.push({ id: newPin.id, name: label, lat: tappedLocation.lat, lng: tappedLocation.lng, categoryId: 'pin', categoryLabel_en: 'Dropped Pin', categoryLabel_fr: 'Epingle' });
      await AsyncStorage.setItem(SK_SAVED_PLACES, JSON.stringify(existing));
    } catch (e) { if (__DEV__) console.warn(e); }
    dismissTapped();
  }, [tappedLocation, dismissTapped]);

  // Calculate ETA from bus to user's nearest stop on that route
  useEffect(() => {
    if (!selectedBus || selectedRouteShape.length < 2) { setBusEtaInfo(null); return; }
    let cancelled = false;
    (async () => {
      try {
        // Get user location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const uLat = loc.coords.latitude;
        const uLng = loc.coords.longitude;

        // Query stops near the user that are on this route
        const delta = 0.02; // ~2km bounding box
        const routeNum = selectedBus.routeId.split('-')[0];
        const { data: nearbyStops } = await supabase
          .from('stops')
          .select('stop_id,stop_name,stop_lat,stop_lon')
          .gte('stop_lat', uLat - delta)
          .lte('stop_lat', uLat + delta)
          .gte('stop_lon', uLng - delta)
          .lte('stop_lon', uLng + delta)
          .limit(200);
        if (cancelled || !nearbyStops || nearbyStops.length === 0) return;

        // Find nearest stop to user
        let bestStop: { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number } | null = null;
        let bestDist = Infinity;
        for (const s of nearbyStops) {
          const d = haversineKm(uLat, uLng, s.stop_lat, s.stop_lon);
          if (d < bestDist) { bestDist = d; bestStop = s; }
        }
        if (!bestStop || bestDist > 1.5) return; // Too far from any stop

        // Find bus position and stop position along route shape
        const busPos = distAlongShape(selectedRouteShape, selectedBus.lat, selectedBus.lng);
        const stopPos = distAlongShape(selectedRouteShape, bestStop.stop_lat, bestStop.stop_lon);

        // Only show if bus is approaching the stop (bus index < stop index along shape)
        if (stopPos.index <= busPos.index) return;

        const distKm = stopPos.cumDist - busPos.cumDist;
        if (distKm <= 0 || distKm > 30) return;

        // Express routes (95, 97, 98) average ~40km/h, others ~25km/h
        const EXPRESS_ROUTES = new Set(['95', '97', '98', '99']);
        const avgSpeed = EXPRESS_ROUTES.has(routeNum) ? 40 : 25;
        const etaMins = Math.max(1, Math.round((distKm / avgSpeed) * 60));

        if (!cancelled) {
          const cleanName = bestStop.stop_name.replace(/\s*\(\d+\)$/, '');
          setBusEtaInfo({ mins: etaMins, stopName: cleanName, stopId: bestStop.stop_id });
        }
      } catch (e) { if (__DEV__) console.warn(e); }
    })();
    return () => { cancelled = true; };
  }, [selectedBus?.id, selectedBus?.lat, selectedBus?.lng, selectedRouteShape.length]);

  const fetchBuses = async () => {
    try {
      const resp = await fetchWithTimeout(`${VEHICLES_URL}?t=${Date.now()}`, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const incoming: Bus[] = data.vehicles || [];
      // Stable merge: reuse existing bus objects when position hasn't changed
      setBuses(prev => {
        const prevMap = new Map(prev.map(b => [b.id, b]));
        return incoming.map(b => {
          const old = prevMap.get(b.id);
          if (old && old.lat === b.lat && old.lng === b.lng && old.routeId === b.routeId && old.progress === b.progress) return old;
          return b;
        });
      });
      setError('');
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
    } catch (e) { setError(String(e)); }
    finally { setBusLoading(false); }
  };

  // Pause bus polling when app is backgrounded, resume when foregrounded
  useEffect(() => {
    fetchBuses();
    if (busIntervalRef.current) clearInterval(busIntervalRef.current);
    busIntervalRef.current = setInterval(fetchBuses, 30000);

    const sub = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      appIsActive.current = active;
      if (active) {
        fetchBuses();
        if (busIntervalRef.current) clearInterval(busIntervalRef.current);
        busIntervalRef.current = setInterval(fetchBuses, 30000);
      } else {
        if (busIntervalRef.current) { clearInterval(busIntervalRef.current); busIntervalRef.current = null; }
      }
    });

    return () => {
      if (busIntervalRef.current) clearInterval(busIntervalRef.current);
      sub.remove();
    };
  }, []);

  // Handle deep-link highlightRoute param
  useEffect(() => {
    if (deepLinkParams.highlightRoute) {
      const routeId = deepLinkParams.highlightRoute as string;
      // Switch filter to bus so the route is visible
      setFilters(new Set(['bus']));
      setSearchText(routeId);
    }
  }, [deepLinkParams.highlightRoute]);

  // Debounce latitudeDelta so clusters don't recompute on every zoom frame
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDelta(region.latitudeDelta), 400);
    return () => clearTimeout(timer);
  }, [region.latitudeDelta]);

  useEffect(() => {
    if (!showEvents) return;
    setEventsLoading(true);
    fetchAllEvents().then(evs => {
      setEvents(evs);
      setEventsLoading(false);
      // Feed events to bottom sheet TonightCard
      setSheetEvents(evs.map(e => ({ name: e.name, date: e.date, time: e.time, venue: e.venue })));
    });
  }, [showEvents]);

  // Load saved stops, routes, places when "saved" filter first activated
  useEffect(() => {
    if (savedLoaded) return;
    const load = async () => {
      const pins: SavedPin[] = [];
      const routeIdSet = new Set<string>();
      const seenStopIds = new Set<string>();
      try {
        // Saved routes (trip planner)
        const routesRaw = await AsyncStorage.getItem(SK_SAVED_ROUTES);
        if (routesRaw) {
          const routes: SavedRoute[] = JSON.parse(routesRaw);
          for (const r of routes) {
            if (!r || !r.id) continue;
            if (validCoord(r.fromLat, r.fromLng)) {
              pins.push({ id: `rf_${r.id}`, name: r.fromLabel || '', lat: r.fromLat, lng: r.fromLng, kind: 'route_from', routeLabel: `${r.fromLabel || ''} → ${r.toLabel || ''}` });
            }
            if (validCoord(r.toLat, r.toLng)) {
              pins.push({ id: `rt_${r.id}`, name: r.toLabel || '', lat: r.toLat, lng: r.toLng, kind: 'route_to', routeLabel: `${r.fromLabel || ''} → ${r.toLabel || ''}` });
            }
          }
        }
        // Saved board stops (from context) + legacy favs
        const favsRaw = await AsyncStorage.getItem(SK_FAVS);
        const stopIds: { id: string; name: string }[] = [];
        for (const item of boardItems) {
          if ((item.type === 'bus_stop' || item.type === 'lrt_station') && 'id' in item) {
            if (!seenStopIds.has(item.id)) {
              seenStopIds.add(item.id);
              stopIds.push({ id: item.id, name: item.name || `Stop #${item.id}` });
            }
          }
        }
        if (favsRaw) {
          try {
            const favs: SavedFav[] = JSON.parse(favsRaw);
            for (const fav of favs) {
              if (fav?.id && !seenStopIds.has(fav.id)) {
                seenStopIds.add(fav.id);
                stopIds.push({ id: fav.id, name: fav.name || `Stop #${fav.id}` });
              }
            }
          } catch (e) { if (__DEV__) console.warn(e); }
        }
        // Fetch coordinates and route IDs for all saved stops (parallel)
        const stopResults = await Promise.allSettled(stopIds.map(async (stop) => {
          const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${stop.id}`, { timeout: 10000 });
          if (!resp.ok) return null;
          const data = await resp.json();
          return { stop, data };
        }));
        for (const result of stopResults) {
          if (result.status !== 'fulfilled' || !result.value) continue;
          const { stop, data } = result.value;
          if (data && validCoord(data.lat, data.lng)) {
            pins.push({ id: `stop_${stop.id}`, name: stop.name, lat: data.lat, lng: data.lng, kind: 'stop' });
          }
          for (const a of (data?.arrivals || [])) {
            const base = String(a?.routeId || '').split('-')[0];
            if (base) routeIdSet.add(base);
          }
        }
        // Saved places (from Explore tab)
        const placesRaw = await AsyncStorage.getItem(SK_SAVED_PLACES);
        if (placesRaw) {
          try {
            const savedPlaces: { id: string; name: string; vicinity?: string; lat?: number; lng?: number }[] = JSON.parse(placesRaw);
            for (const sp of savedPlaces) {
              if (sp.lat && sp.lng && validCoord(sp.lat, sp.lng)) {
                pins.push({ id: `place_${sp.id}`, name: sp.name, lat: sp.lat, lng: sp.lng, kind: 'place', vicinity: sp.vicinity });
              }
            }
          } catch (e) { if (__DEV__) console.warn(e); }
        }
        // Saved neighbourhoods
        const nbRaw = await AsyncStorage.getItem(SK_SAVED_NEIGHBOURHOODS);
        if (nbRaw) {
          try {
            const savedNbIds: string[] = JSON.parse(nbRaw);
            for (const nbId of savedNbIds) {
              const nb = NEIGHBOURHOODS.find(n => n.id === nbId);
              if (nb) {
                pins.push({ id: `nb_${nb.id}`, name: nb.name_en, lat: nb.lat, lng: nb.lng, kind: 'neighbourhood' });
              }
            }
          } catch (e) { if (__DEV__) console.warn(e); }
        }
      } catch (e) { if (__DEV__) console.warn('load saved pins failed:', e); }
      setSavedPins(pins);
      setSavedRouteIds(routeIdSet);
      setSavedLoaded(true);
    };
    load();
  }, [savedLoaded, boardItems]);

  const toggleFilter = (key: string) => {
    setFilters(prev => {
      if (key === 'all') {
        return prev.has('all') ? new Set<string>() : new Set(['all']);
      }
      const next = new Set(prev);
      next.delete('all');
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  };

  const hasAll = filters.has('all');
  const hasSaved = filters.has('saved');
  const showBuses = hasAll || filters.has('bus') || hasSaved;
  // Zoom level thresholds for bus visibility
  const zoomTooFar = region.latitudeDelta > 0.05;
  const zoomNeighborhood = region.latitudeDelta >= 0.02 && region.latitudeDelta <= 0.05;

  // Viewport bounds for culling (with 10% padding so buses don't pop in/out abruptly)
  const viewBounds = useMemo(() => {
    const pad = region.latitudeDelta * 0.10;
    return {
      minLat: region.latitude - region.latitudeDelta / 2 - pad,
      maxLat: region.latitude + region.latitudeDelta / 2 + pad,
      minLng: region.longitude - region.longitudeDelta / 2 - pad,
      maxLng: region.longitude + region.longitudeDelta / 2 + pad,
    };
  }, [region]);

  const filteredBuses = useMemo(() => {
    // Hide all buses when zoomed out to city-wide view
    if (!showBuses || zoomTooFar) return [];
    let result = buses.filter((b: Bus) => {
      // Viewport culling
      if (b.lat < viewBounds.minLat || b.lat > viewBounds.maxLat ||
          b.lng < viewBounds.minLng || b.lng > viewBounds.maxLng) return false;
      if (hasSaved && !hasAll && !filters.has('bus')) {
        const base = b.routeId.split('-')[0];
        return savedRouteIds.has(base);
      }
      if (!hasAll && filters.has('bus')) return !isLRT(b.routeId);
      return true;
    });
    // Cap at 25 markers when at neighborhood zoom level
    if (zoomNeighborhood && result.length > 25) result = result.slice(0, 25);
    return result;
  }, [showBuses, zoomTooFar, zoomNeighborhood, buses, hasAll, hasSaved, filters, savedRouteIds, viewBounds]);

  // Incrementally render buses in batches of 5 to prevent AIRMap crash on mount.
  // Only batch on initial load; subsequent updates show all markers immediately.
  const initialBatchDone = useRef(false);
  const batchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Reset batch flag when filters change to prevent dumping 200+ markers at once
  const prevFilterKey = useRef('');
  useEffect(() => {
    const filterKey = Array.from(filters).sort().join(',');
    if (prevFilterKey.current && filterKey !== prevFilterKey.current) {
      initialBatchDone.current = false;
    }
    prevFilterKey.current = filterKey;
  }, [filters]);
  useEffect(() => {
    if (!mapReady || filteredBuses.length === 0) { setVisibleBusCount(0); initialBatchDone.current = false; return; }
    // After initial batch, just show all markers immediately on updates
    if (initialBatchDone.current) {
      setVisibleBusCount(filteredBuses.length);
      return;
    }
    setVisibleBusCount(0);
    const timeoutId = setTimeout(() => {
      let count = 0;
      batchIntervalRef.current = setInterval(() => {
        count += 5;
        if (count >= filteredBuses.length) {
          setVisibleBusCount(filteredBuses.length);
          initialBatchDone.current = true;
          if (batchIntervalRef.current) { clearInterval(batchIntervalRef.current); batchIntervalRef.current = null; }
        } else {
          setVisibleBusCount(count);
        }
      }, 100);
    }, 500);
    return () => { clearTimeout(timeoutId); if (batchIntervalRef.current) { clearInterval(batchIntervalRef.current); batchIntervalRef.current = null; } };
  }, [mapReady, filteredBuses.length]);

  const visibleBuses = useMemo(() => filteredBuses.slice(0, visibleBusCount), [filteredBuses, visibleBusCount]);

  const showVenueFilters = hasAll || filters.has('food') || filters.has('bars') || filters.has('gyms') || filters.has('happy_hour') || filters.has('clubs') || filters.has('fitness');
  const searchLower = searchText.toLowerCase();
  const filteredVenues = useMemo(() => showVenueFilters ? VENUE_PINS.filter(v => {
    if (!venueHasActiveOrUpcomingToday(v)) return false;
    if (searchText && !v.name.toLowerCase().includes(searchLower)) return false;
    if (hasAll) return true;
    if (filters.has('food') && v.type.includes('restaurant')) return true;
    if ((filters.has('bars') || filters.has('happy_hour')) && (v.type.includes('bar') || v.type.includes('club'))) return true;
    if ((filters.has('gyms') || filters.has('fitness')) && v.type.includes('fitness')) return true;
    if (filters.has('clubs') && v.type.includes('club')) return true;
    return false;
  }) : [], [showVenueFilters, searchLower, hasAll, filters]);

  // Cluster nearby venues when very close together (~50px on screen)
  const clusteredVenueData = useMemo(() => {
    if (filteredVenues.length === 0) return { singles: [] as typeof filteredVenues, clusters: [] as { lat: number; lng: number; count: number; venues: typeof filteredVenues }[] };
    // ~50px on screen: debouncedDelta covers ~screen height in degrees, divide by screen points
    const threshold = debouncedDelta * 0.015;
    const used = new Set<number>();
    const clusters: { lat: number; lng: number; count: number; venues: typeof filteredVenues }[] = [];
    const singles: typeof filteredVenues = [];
    for (let i = 0; i < filteredVenues.length; i++) {
      if (used.has(i)) continue;
      const group = [filteredVenues[i]];
      used.add(i);
      for (let j = i + 1; j < filteredVenues.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(filteredVenues[i].lat - filteredVenues[j].lat) < threshold && Math.abs(filteredVenues[i].lng - filteredVenues[j].lng) < threshold) {
          group.push(filteredVenues[j]);
          used.add(j);
        }
      }
      if (group.length >= 3) {
        const avgLat = group.reduce((s, v) => s + v.lat, 0) / group.length;
        const avgLng = group.reduce((s, v) => s + v.lng, 0) / group.length;
        clusters.push({ lat: avgLat, lng: avgLng, count: group.length, venues: group });
      } else {
        singles.push(...group);
      }
    }
    return { singles, clusters };
  }, [filteredVenues, debouncedDelta]);

  const getVenuePinColor = (v: VenuePin): string => {
    // Time-aware coloring: active = green, soon = amber, upcoming = muted, closed = type color
    const { active, upcoming } = getVenueTodayDeals(v);
    if (active.length > 0) return '#27AE60';
    if (upcoming.length > 0) return '#FF9800';
    if (v.type.includes('fitness')) return VENUE_COLORS.fitness;
    if (v.type.includes('club')) return VENUE_COLORS.clubs;
    if (v.type.includes('restaurant')) return VENUE_COLORS.food;
    return VENUE_COLORS.happy_hour;
  };

  const centerOnOttawa = () => mapRef.current?.animateToRegion(OTTAWA_REGION, 600);

  // Google Places autocomplete search (proxied through backend)
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) { setPlaceSuggestions([]); return; }
    try {
      const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete&input=${encodeURIComponent(query)}&location=45.4215,-75.6972&radius=50000`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.predictions) {
        setPlaceSuggestions(data.predictions.slice(0, 5).map((p: any) => ({
          placeId: p.place_id,
          name: p.structured_formatting?.main_text || p.description,
          address: p.structured_formatting?.secondary_text || '',
        })));
      }
    } catch (_) { setPlaceSuggestions([]); }
  }, []);

  const selectPlace = useCallback(async (suggestion: { placeId: string; name: string; address: string }) => {
    hapticLight();
    Keyboard.dismiss();
    setPlaceSuggestions([]);
    try {
      const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=details&place_id=${suggestion.placeId}&fields=geometry,name,formatted_address`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        const place = {
          placeId: suggestion.placeId,
          name: data.result.name || suggestion.name,
          address: data.result.formatted_address || suggestion.address,
          lat, lng,
        };
        setSearchedPlace(place);
        setSearchText(place.name);
        mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
        // Open sheet for this place
        setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
        Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
      }
    } catch (_) { if (__DEV__) console.warn('Place details failed:', _); }
  }, [sheetAnim]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setPlaceSuggestions([]);
    setSearchedPlace(null);
    hideSheet();
  }, []);

  const searchDiscovery = useCallback(async (placeType: string) => {
    setDiscoveryLoading(true);
    setDiscoveryResults([]);
    try {
      const lat = region.latitude;
      const lng = region.longitude;
      // Calculate visible radius from region span, capped at 50km
      const radius = Math.min(Math.round((region.latitudeDelta / 2) * 111000), 50000);
      const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=nearby&location=${lat},${lng}&radius=${radius}&type=${placeType}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.results) {
        setDiscoveryResults(data.results.slice(0, 20).map((p: any) => ({
          id: p.place_id, name: p.name, address: p.vicinity || '',
          lat: p.geometry?.location?.lat, lng: p.geometry?.location?.lng,
          rating: p.rating,
        })).filter((p: any) => validCoord(p.lat, p.lng)));
      }
    } catch (e) { if (__DEV__) console.warn('Discovery search failed:', e); }
    setDiscoveryLoading(false);
  }, [region.latitude, region.longitude, region.latitudeDelta]);

  const clearDiscovery = useCallback(() => {
    setDiscoveryCategory(null);
    setDiscoveryResults([]);
  }, []);

  // Re-fetch discovery results when region changes while a category is active
  const discoveryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!discoveryCategory || !DISCOVER_PLACE_TYPES[discoveryCategory]) return;
    if (discoveryDebounceRef.current) clearTimeout(discoveryDebounceRef.current);
    discoveryDebounceRef.current = setTimeout(() => {
      searchDiscovery(DISCOVER_PLACE_TYPES[discoveryCategory]);
    }, 500);
    return () => { if (discoveryDebounceRef.current) clearTimeout(discoveryDebounceRef.current); };
  }, [region.latitude, region.longitude, region.latitudeDelta, discoveryCategory, searchDiscovery]);

  const hasSheet = selectedBus || selectedEvent || selectedCluster || selectedVenue || selectedSavedPin || searchedPlace;

  // Upcoming events (today + next 2 days) + clustering
  const upcomingDates = useMemo(() => {
    const dates = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.add(d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
    }
    return dates;
  }, []);
  const todayEvents = useMemo(() => events.filter(e => upcomingDates.has(e.date)), [events, upcomingDates]);
  const clusters = useMemo(() => clusterEvents(todayEvents, debouncedDelta), [todayEvents, debouncedDelta]);

  return (
    <ScreenErrorBoundary colours={colours} fonts={fonts}>
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {!MapView ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colours.muted, fontSize: 15 }}>{t('Map unavailable', 'Carte indisponible')}</Text>
        </View>
      ) : <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={OTTAWA_REGION}
        userInterfaceStyle={isLight ? 'light' : 'dark'}
        showsUserLocation
        showsCompass={false}
        onMapReady={() => setMapReady(true)}
        onPress={handleMapTap}
        onPanDrag={() => { if (tappedLocation) dismissTapped(); }}
        onRegionChangeComplete={(r) => setRegion(r)}
      >
        {/* Heat zone circles — rendered before markers so they appear behind */}
        {mapReady && Circle && heatZones.map(zone => (
          <Circle
            key={zone.id}
            center={{ latitude: zone.lat, longitude: zone.lng }}
            radius={zone.radius}
            fillColor={zone.color}
            strokeColor={zone.strokeColor}
            strokeWidth={1}
            zIndex={0}
          />
        ))}

        {/* ALL markers deferred until native map is ready to prevent AIRMap crash */}
        {mapReady && <>
          {/* Bus markers — rendered incrementally */}
          {visibleBuses.map((bus: Bus) => (
            <BusMarker key={bus.id} bus={bus} onPress={openSheet} />
          ))}

          {/* Event cluster markers */}
          {showEvents && (hasAll || filters.has('bus')) && clusters.map((cluster) => {
            if (!cluster || !validCoord(cluster.lat, cluster.lng)) return null;
            const single = cluster.count === 1 && cluster.events?.[0] ? cluster.events[0] : null;
            const title = single
              ? (single.name || 'Event')
              : `${cluster.count} events`;
            const desc = single
              ? (single.venue || '')
              : (cluster.events || []).map(e => e?.name || '').slice(0, 3).join(', ');
            return (
              <PlaceMarker
                key={cluster.id}
                coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
                icon="calendar"
                color="#026CDF"
                title={title}
                description={desc}
                onPress={() => single ? openSheet(undefined, single) : openSheet(undefined, undefined, cluster.events)}
              />
            );
          })}

          {/* Saved pin markers */}
          {hasSaved && savedPins.map((pin) => {
            if (!validCoord(pin.lat, pin.lng)) return null;
            const pinIcon: keyof typeof Ionicons.glyphMap = pin.kind === 'stop' ? 'bus' : pin.kind === 'place' ? 'location' : pin.kind === 'neighbourhood' ? 'home' : pin.kind === 'route_from' ? 'navigate' : 'flag';
            const pinColor = pin.kind === 'stop' ? '#e74c3c' : pin.kind === 'place' ? '#e8a020' : pin.kind === 'neighbourhood' ? '#7b5ea7' : pin.kind === 'route_from' ? '#2ecc71' : '#3498db';
            const kindLabel = pin.kind === 'stop' ? t('Stop', 'Arr\u00eat') : pin.kind === 'place' ? t('Place', 'Lieu') : pin.kind === 'neighbourhood' ? t('Neighbourhood', 'Quartier') : pin.kind === 'route_from' ? t('Origin', 'Origine') : t('Destination', 'Destination');
            return (
              <PlaceMarker
                key={pin.id}
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                icon={pinIcon}
                color={pinColor}
                title={pin.name}
                description={pin.routeLabel ? `${kindLabel} — ${pin.routeLabel}` : kindLabel}
                onPress={() => {
                  setSelectedSavedPin(pin);
                  openSheet();
                }}
              />
            );
          })}

          {/* Venue markers (singles + clusters) */}
          {clusteredVenueData.singles.map((v, i) => {
            if (!validCoord(v.lat, v.lng)) return null;
            const venueIcon: keyof typeof Ionicons.glyphMap = v.type.includes('bar') ? 'beer' : v.type.includes('restaurant') ? 'restaurant' : v.type.includes('club') ? 'musical-notes' : v.type.includes('fitness') ? 'barbell' : 'pint';
            const venueColor = getVenuePinColor(v);
            const { active, upcoming } = getVenueTodayDeals(v, language);
            const hasDeals = active.length > 0 || upcoming.length > 0;
            const dealDesc = active.length > 0 ? active[0] : upcoming.length > 0 ? upcoming[0] : undefined;
            return (
              <PlaceMarker
                key={`venue_${i}`}
                coordinate={{ latitude: v.lat, longitude: v.lng }}
                icon={venueIcon}
                color={venueColor}
                title={hasDeals ? v.name : undefined}
                description={dealDesc}
                onPress={() => openSheet(undefined, undefined, undefined, v)}
              />
            );
          })}
          {clusteredVenueData.clusters.map((cl, ci) => (
            <Marker
              key={`vcluster_${ci}`}
              coordinate={{ latitude: cl.lat, longitude: cl.lng }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => mapRef.current?.animateToRegion({ latitude: cl.lat, longitude: cl.lng, latitudeDelta: debouncedDelta * 0.4, longitudeDelta: debouncedDelta * 0.4 }, 400)}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7b5ea7', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{cl.count}</Text>
              </View>
            </Marker>
          ))}
        </>}

        {/* Searched place marker */}
        {searchedPlace && validCoord(searchedPlace.lat, searchedPlace.lng) && (
          <PlaceMarker
            coordinate={{ latitude: searchedPlace.lat, longitude: searchedPlace.lng }}
            icon="search"
            color="#3498db"
            title={searchedPlace.name}
            description={searchedPlace.address}
            onPress={() => {
              setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
              Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
            }}
          />
        )}

        {/* Discovery result markers */}
        {discoveryResults.map(dr => {
          const meta = DISC_CAT_META[discoveryCategory || ''] || { icon: 'location' as const, color: '#E67E22' };
          return (
            <PlaceMarker
              key={`disc_${dr.id}`}
              coordinate={{ latitude: dr.lat, longitude: dr.lng }}
              icon={meta.icon}
              color={meta.color}
              title={dr.name}
              description={dr.address}
              onPress={() => {
                mapRef.current?.animateToRegion({ latitude: dr.lat, longitude: dr.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
                setSearchedPlace({ placeId: dr.id, name: dr.name, address: dr.address, lat: dr.lat, lng: dr.lng });
                setSearchText(dr.name);
                clearDiscovery();
                setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
                Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
              }}
            />
          );
        })}

        {/* Tapped location marker */}
        {tappedLocation && Marker && (
          <Marker
            coordinate={{ latitude: tappedLocation.lat, longitude: tappedLocation.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 16, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                <Ionicons name="location" size={16} color="#fff" />
              </View>
              <View style={{ width: 2, height: 6, backgroundColor: colours.accent, marginTop: -1 }} />
            </View>
          </Marker>
        )}

        {/* City layer pins */}
        {Marker && (Object.entries(activeLayers) as [LayerKey, boolean][]).map(([key, active]) => {
          if (!active || !layerPins[key]?.length) return null;
          const config = LAYER_CONFIG[key];
          return layerPins[key]!.map(pin => (
            <Marker
              key={`layer-${key}-${pin.id}`}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              onPress={() => setSelectedPin(pin)}
              tracksViewChanges={false}
            >
              <View style={{
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: config.color,
                borderWidth: 2, borderColor: 'white',
                shadowColor: config.color,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.4, shadowRadius: 2, elevation: 3,
              }} />
            </Marker>
          ));
        })}

        {/* Route shape polyline for selected bus */}
        {Polyline && selectedRouteShape.length > 0 && (() => {
          if (__DEV__) console.log(`[RouteShape] rendering Polyline with ${selectedRouteShape.length} points, agency=${selectedBus?.agency}`);
          return (
            <Polyline
              coordinates={selectedRouteShape}
              strokeColor={selectedBus?.agency === 'STO' ? '#00A78D' : '#CE1126'}
              strokeWidth={4}
              zIndex={10}
            />
          );
        })()}
      </MapView>}

      {/* Header */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 8,
        backgroundColor: isLight ? 'rgba(240,244,248,0.92)' : 'rgba(15,20,30,0.92)',
      }}>
        {/* Search bar + bus count */}
        <View style={{ zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 24, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, height: 36 }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              style={{ flex: 1, marginLeft: 8, fontSize: 13, color: colours.text, padding: 0 }}
              placeholder={t('Search anywhere...', 'Rechercher partout...')}
              placeholderTextColor={colours.muted}
              accessibilityLabel={t('Search places on map', 'Rechercher des lieux sur la carte')}
              accessibilityRole="search"
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                if (text.length >= 3) {
                  searchTimer.current = setTimeout(() => searchPlaces(text), 300);
                } else {
                  setPlaceSuggestions([]);
                }
              }}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('Clear search', 'Effacer la recherche')}>
                <Ionicons name="close-circle" size={18} color={colours.muted} />
              </TouchableOpacity>
            )}
            </View>
            {busLoading ? <ActivityIndicator color={colours.accent} size="small" /> : error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.errorBg, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 18 }}>
                <Ionicons name="warning-outline" size={10} color={isLight ? '#DC2626' : '#F87171'} />
                <Text style={{ color: isLight ? '#DC2626' : '#F87171', fontSize: 10, fontWeight: '700' }}>
                  {t('Bus data unavailable', 'Donnees bus indisponibles')}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.tintBg, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 18 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: zoomTooFar ? colours.muted : colours.accent }} />
                <Text style={{ color: zoomTooFar ? colours.muted : colours.accent, fontSize: 10, fontWeight: '700' }}>
                  {zoomTooFar ? t('Zoom in', 'Zoomer') : `${visibleBuses.length}`}
                </Text>
              </View>
            )}
          </View>
          {lastUpdated ? <Text style={{ fontSize: 9, color: colours.muted, textAlign: 'right', marginTop: 3 }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text> : null}
          {placeSuggestions.length > 0 && (
            <View style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginTop: 4, overflow: 'hidden' }}>
              {placeSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={s.placeId}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}
                  onPress={() => selectPlace(s)}>
                  <Ionicons name="location-outline" size={16} color={colours.accent} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colours.text }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{s.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {([
            { key: 'all', label_en: 'All', label_fr: 'Tous', icon: 'apps-outline' as const, color: colours.accent },
            { key: 'bus', label_en: 'Bus', label_fr: 'Bus', icon: 'bus-outline' as const, color: '#CE1126' },
            { key: 'food', label_en: 'Food', label_fr: 'Restos', icon: 'restaurant-outline' as const, color: '#E67E22' },
            { key: 'coffee', label_en: 'Coffee', label_fr: 'Cafe', icon: 'cafe-outline' as const, color: '#795548' },
            { key: 'bars', label_en: 'Bars', label_fr: 'Bars', icon: 'beer-outline' as const, color: '#8E44AD' },
            { key: 'gyms', label_en: 'Gyms', label_fr: 'Gyms', icon: 'barbell-outline' as const, color: '#2ECC71' },
            { key: 'grocery', label_en: 'Grocery', label_fr: 'Epicerie', icon: 'cart-outline' as const, color: '#3498db' },
            { key: 'events', label_en: 'Events', label_fr: 'Evenements', icon: 'ticket-outline' as const, color: '#026CDF' },
            { key: 'saved', label_en: 'Saved', label_fr: 'Favoris', icon: 'heart' as const, color: '#e74c3c' },
          ] as const).map(f => {
            const isDiscovery = f.key in DISCOVER_PLACE_TYPES;
            const active = isDiscovery ? discoveryCategory === f.key
              : f.key === 'events' ? showEvents
              : filters.has(f.key);
            const bg = active ? f.color : colours.surface;
            const border = active ? f.color : colours.border;
            return (
              <TouchableOpacity key={f.key}
                activeOpacity={0.7}
                style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: bg, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => {
                  if (isDiscovery) {
                    if (discoveryCategory === f.key) {
                      clearDiscovery();
                    } else {
                      setDiscoveryCategory(f.key);
                      searchDiscovery(DISCOVER_PLACE_TYPES[f.key]);
                    }
                    // Also toggle the filter so venue pins show
                    if (!filters.has(f.key)) {
                      setFilters(prev => { const next = new Set(prev); next.delete('all'); next.add(f.key); return next; });
                    }
                  } else if (f.key === 'events') {
                    setShowEvents((v: boolean) => !v);
                  } else {
                    if (discoveryCategory) clearDiscovery();
                    toggleFilter(f.key);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={t(`Filter by ${f.label_en}`, `Filtrer par ${f.label_fr}`)}
                accessibilityState={{ selected: active }}>
                {f.key === 'events' && eventsLoading
                  ? <ActivityIndicator size="small" color="white" />
                  : <Ionicons name={f.icon} size={12} color={active ? 'white' : colours.muted} />}
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'white' : colours.muted }}>
                  {t(f.label_en, f.label_fr)}
                </Text>
                {f.key === 'events' && !eventsLoading && showEvents && todayEvents.length > 0 && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>({todayEvents.length})</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {error ? <Text style={{ fontSize: 11, color: isLight ? '#DC2626' : '#F87171', marginTop: 6 }}>{error}</Text> : null}
      </View>

      {/* Quick layer chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ position: 'absolute', top: Platform.OS === 'ios' ? 100 : 82, left: 0, right: 0, zIndex: 9 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row', paddingVertical: 6 }}
      >
        {(Object.entries(LAYER_CONFIG) as [LayerKey, typeof LAYER_CONFIG[LayerKey]][]).map(([key, config]) => {
          const PhIcon = LAYER_ICONS[key as LayerKey];
          const isActive = activeLayers[key];
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.7}
              style={[{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
              }, isActive
                ? { backgroundColor: config.color, borderColor: config.color }
                : { backgroundColor: colours.card, borderColor: colours.border }
              ]}
              onPress={() => toggleLayer(key)}
              accessibilityRole="button"
            >
              <PhIcon size={14} color={isActive ? 'white' : colours.muted} weight={isActive ? 'fill' : 'regular'} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? 'white' : colours.muted }}>
                {language === 'fr' ? config.labelFr : config.label}
              </Text>
              {key === 'deals' && activeDealsNearby > 0 && (
                <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : '#27AE60', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: 'white' }}>{activeDealsNearby}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Floating action buttons */}
      <View style={{ position: 'absolute', bottom: (tripResults.length > 0 || tripLoading) ? 380 : hasSheet ? 300 : (discoveryCategory && discoveryResults.length > 0) ? 320 : tappedLocation ? 160 : Platform.OS === 'ios' ? 24 : 16, right: 16, gap: 10, alignItems: 'center' }}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: '#7b5ea7', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 }, elevation: 4,
          }}
          onPress={() => { setContributeVisible(true); setContribSent(false); setContribName(''); setContribType(''); setContribInfo(''); setContribAddress(''); }}
          accessibilityRole="button"
          accessibilityLabel={t('Add a place or deal', 'Ajouter un lieu ou une offre')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 }, elevation: 4,
          }}
          onPress={centerOnOttawa}
          accessibilityRole="button"
          accessibilityLabel={t('Re-center map on Ottawa', 'Recentrer la carte sur Ottawa')}>
          <Ionicons name="locate" size={20} color={colours.accent} />
        </TouchableOpacity>
      </View>

      {/* Community contribute modal */}
      <Modal visible={contributeVisible} animationType="slide" transparent onRequestClose={() => setContributeVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 16 }} />
            {contribSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="checkmark-circle" size={48} color="#00A78D" />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginTop: 12 }}>{t('Thank you!', 'Merci!')}</Text>
                <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                  {t('Deal submitted! It will appear on the map shortly.', 'Offre soumise! Elle apparaitra bientot sur la carte.')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setContributeVisible(false)}
                  style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
                  accessibilityRole="button">
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>{t('Done', 'Fermer')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 4 }}>{t('Add a Place or Deal', 'Ajouter un lieu ou une offre')}</Text>
                <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16 }}>{t('Help fellow Ottawa riders discover great spots', 'Aidez les usagers a decouvrir de bons endroits')}</Text>

                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>{t('Place Name', 'Nom du lieu')} *</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, marginBottom: 12 }}
                  placeholder={t('e.g. The Clocktower Brew Pub', 'ex. The Clocktower Brew Pub')}
                  placeholderTextColor={colours.muted}
                  value={contribName}
                  maxLength={50}
                  onChangeText={(v) => setContribName(v.replace(/<[^>]*>/g, ''))}
                />

                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>{t('Deal Type', 'Type d\'offre')} *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {['Happy Hour', 'Food Special', 'Student Deal', 'Event', 'Other'].map(type => (
                    <TouchableOpacity
                      key={type}
                      activeOpacity={0.7}
                      onPress={() => setContribType(type)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: contribType === type }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                        borderColor: contribType === type ? '#7b5ea7' : colours.border,
                        backgroundColor: contribType === type ? colours.tintBg : colours.surface,
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: contribType === type ? '#7b5ea7' : colours.text }}>
                        {t(type, type === 'Happy Hour' ? 'Happy Hour' : type === 'Food Special' ? 'Special bouffe' : type === 'Student Deal' ? 'Offre etudiante' : type === 'Event' ? 'Evenement' : 'Autre')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>{t('Details', 'Details')} *</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, minHeight: 60, textAlignVertical: 'top', marginBottom: 12 }}
                  placeholder={t('e.g. $5 pints Mon-Fri 3-6pm', 'ex. Pintes a 5$ lun-ven 15h-18h')}
                  placeholderTextColor={colours.muted}
                  value={contribInfo}
                  maxLength={200}
                  onChangeText={(v) => setContribInfo(v.replace(/<[^>]*>/g, ''))}
                  multiline
                />

                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>{t('Address', 'Adresse')} ({t('optional', 'optionnel')})</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, marginBottom: 16 }}
                  placeholder={t('e.g. 575 Bank St', 'ex. 575 rue Bank')}
                  placeholderTextColor={colours.muted}
                  value={contribAddress}
                  onChangeText={setContribAddress}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setContributeVisible(false)}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={!contribName.trim() || !contribType.trim() || !contribInfo.trim()}
                    onPress={async () => {
                      if (!contribName.trim() || !contribType.trim() || !contribInfo.trim()) return;
                      setContribSending(true);
                      try {
                        await supabase.from('community_deals').insert({
                          venue_name: contribName.trim(),
                          deal_text: `[${contribType}] ${contribInfo.trim()}${contribAddress.trim() ? ` | ${contribAddress.trim()}` : ''}`,
                          approved: false,
                        });
                        // Notify backend about new submission
                        fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=deal.notify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ venue_name: contribName.trim(), deal_type: contribType, deal_description: contribInfo.trim(), address: contribAddress.trim() || null }),
                        }).catch(() => {});
                        setContribSent(true);
                      } catch (e) {
                        if (__DEV__) console.warn('contribute submit failed:', e);
                        Alert.alert(
                          t('Submission Failed', 'Echec de la soumission'),
                          t('Could not submit your deal. Please try again later.', 'Impossible de soumettre votre offre. Veuillez reessayer plus tard.')
                        );
                      }
                      setContribSending(false);
                    }}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: contribName.trim() && contribType.trim() && contribInfo.trim() ? '#7b5ea7' : colours.border,
                    }}>
                    {contribSending
                      ? <ActivityIndicator color="white" size="small" />
                      : <Text style={{ fontSize: 15, fontWeight: '700', color: contribName.trim() && contribType.trim() && contribInfo.trim() ? 'white' : colours.muted }}>{t('Submit', 'Soumettre')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tapped location "Route here" card */}
      {tappedLocation && (
        <Animated.View style={{
          position: 'absolute', bottom: Platform.OS === 'ios' ? 34 : 16, left: 16, right: 16,
          transform: [{ translateY: tappedTranslate }],
          backgroundColor: colours.surface,
          borderRadius: 20, borderWidth: 1, borderColor: colours.border,
          padding: 16,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 }, elevation: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colours.tintBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location" size={20} color={colours.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={2}>
                {tappedLocation.address || t('Loading address...', 'Chargement de l\'adresse...')}
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={dismissTapped} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('Dismiss', 'Fermer')}>
              <Ionicons name="close" size={20} color={colours.muted} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={dropPinAtTapped}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}
              accessibilityRole="button"
              accessibilityLabel={t('Drop pin', 'Epingler')}
            >
              <Ionicons name="pin" size={16} color={colours.text} />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.text }}>{t('Drop pin', 'Epingler')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={routeToTapped}
              style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: colours.accent }}
              accessibilityRole="button"
              accessibilityLabel={t('Route here', 'M\'y rendre')}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#fff' }}>{t('Route here', 'M\'y rendre')}</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Discovery results sheet */}
      {discoveryCategory && discoveryResults.length > 0 && !hasSheet && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderWidth: 1, borderColor: colours.border,
          maxHeight: '40%',
          paddingBottom: 34,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 }, elevation: 10,
        }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
              {discoveryResults.length} {t('Results', 'Resultats')}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={clearDiscovery} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Clear results', 'Effacer les resultats')}>
              <Ionicons name="close-circle" size={22} color={colours.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }}>
            {discoveryResults.map(dr => {
              const meta = DISC_CAT_META[discoveryCategory || ''] || { icon: 'location' as const, color: '#E67E22' };
              return (
                <TouchableOpacity
                  key={dr.id}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colours.border, gap: 12 }}
                  onPress={() => {
                    mapRef.current?.animateToRegion({ latitude: dr.lat, longitude: dr.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
                    setSearchedPlace({ placeId: dr.id, name: dr.name, address: dr.address, lat: dr.lat, lng: dr.lng });
                    setSearchText(dr.name);
                    clearDiscovery();
                    setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
                    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: meta.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>{dr.name}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted }} numberOfLines={1}>{dr.address}</Text>
                  </View>
                  {dr.rating != null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="star" size={12} color="#f5a623" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }}>{dr.rating}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Discovery loading indicator */}
      {discoveryLoading && !hasSheet && (
        <View style={{ position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: colours.surface, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colours.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
            <ActivityIndicator color={colours.accent} size="small" />
            <Text style={{ fontSize: 13, color: colours.text, fontWeight: '600' }}>{t('Searching nearby...', 'Recherche a proximite...')}</Text>
          </View>
        </View>
      )}

      {/* Bottom sheet */}
      {hasSheet && (
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          transform: [{ translateY: sheetTranslate }],
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderWidth: 1, borderColor: colours.border,
          paddingBottom: 34,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 }, elevation: 10,
        }}>
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>

          {/* Bus sheet */}
          {selectedBus && selectedBus.routeId && (() => {
            const busLrt = isLRT(selectedBus.routeId);
            const busIsSTO = selectedBus.agency === 'STO';
            const sheetIconBg = busLrt ? getRouteColour(selectedBus.routeId) : busIsSTO ? '#ffffff' : '#CE1126';
            const sheetIconBorder = busIsSTO ? '#00A78D' : undefined;
            const sheetIconText = busIsSTO ? '#00A78D' : '#ffffff';
            const agencyLabel = busIsSTO ? 'STO' : 'OC Transpo';
            return (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: sheetIconBg, alignItems: 'center', justifyContent: 'center', borderWidth: busIsSTO ? 1.5 : 0, borderColor: sheetIconBorder }}>
                    <Text style={{ color: busLrt ? '#ffffff' : sheetIconText, fontSize: 18 }}>{busLrt ? '🚊' : '🚌'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text }}>
                      {busLrt ? 'O-Train' : `${t('Route', 'Route')} ${selectedBus.routeId.split('-')[0]}`}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t('En route', 'En route')} · {selectedBus.progress}% {t('to next stop', 'vers prochain arrêt')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.fromStop}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.toStop}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: busIsSTO ? '#00A78D' : '#CE1126', width: `${Math.min(100, selectedBus.progress ?? 0)}%` as `${number}%` }} />
                </View>
                {busEtaInfo && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: colours.tintBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Ionicons name="location-outline" size={14} color={colours.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>~{busEtaInfo.mins} min</Text>
                    <Text style={{ fontSize: 12, color: colours.muted, flex: 1 }} numberOfLines={1}>
                      {t(`to ${toTitleCase(busEtaInfo.stopName)}`, `avant ${toTitleCase(busEtaInfo.stopName)}`)}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{agencyLabel}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setTrackingBus(selectedBus); }}
                  style={{ backgroundColor: busIsSTO ? '#00A78D' : '#CE1126', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Track this bus', 'Suivre ce bus')}
                >
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#fff' }}>
                    {t('Track this bus', 'Suivre ce bus')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ); })()}

          {/* Event sheet */}
          {selectedEvent && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  {/* Source + category badge */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: (selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category)) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category)) + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category) }}>
                        {selectedEvent.source === 'ticketmaster' ? 'Ticketmaster' : (selectedEvent.category || 'Community')}
                      </Text>
                    </View>
                    {selectedEvent.free && (
                      <View style={{ backgroundColor: '#2d7a3a22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#2d7a3a44' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#2d7a3a' }}>{t('FREE', 'GRATUIT')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginBottom: 4 }} numberOfLines={3}>
                    {selectedEvent.name}
                  </Text>
                  {selectedEvent.date && (
                    <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginBottom: 2 }}>
                      {new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {selectedEvent.time ? ` · ${selectedEvent.time}` : ''}
                    </Text>
                  )}
                  {selectedEvent.venue ? <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{selectedEvent.venue}</Text> : null}
                  {selectedEvent.address ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{selectedEvent.address}</Text> : null}
                </View>
                <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              {selectedEvent.url && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(selectedEvent.url).catch(() => {})}
                  style={{ marginTop: 14, backgroundColor: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category), borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  accessibilityRole="link"
                  accessibilityLabel={selectedEvent.source === 'ticketmaster' ? t('Get tickets', 'Acheter des billets') : t('View event', 'Voir l\'evenement')}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                    {selectedEvent.source === 'ticketmaster' ? t('Get Tickets', 'Acheter des billets') : t('View Event', 'Voir l\'evenement')} →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Cluster sheet — list of events in this area */}
          {selectedCluster && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
                  {selectedCluster.length} {t('Events Here', 'evenements ici')}
                </Text>
                <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {selectedCluster.map((ev) => (
                  <TouchableOpacity key={ev.id} activeOpacity={0.7} onPress={() => ev.url && Linking.openURL(ev.url).catch(() => {})}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border, gap: 10 }}
                    accessibilityRole="button">
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ev.source === 'ticketmaster' ? '#026CDF' : getCatColor(ev.category), flexShrink: 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>{ev.name}</Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{ev.venue}{ev.time ? ` · ${ev.time}` : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Venue sheet */}
          {selectedVenue && (() => {
            const { active, upcoming } = getVenueTodayDeals(selectedVenue, language);
            const color = getVenuePinColor(selectedVenue);
            return (
              <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      {selectedVenue.type.map(tp => (
                        <View key={tp} style={{ backgroundColor: venueTypeColor(tp) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: venueTypeColor(tp) + '44' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: venueTypeColor(tp), textTransform: 'capitalize' }}>
                            {tp}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginBottom: 4 }}>
                      {selectedVenue.name}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 6 }}>{selectedVenue.address}</Text>
                    {active.length > 0 && (() => {
                      // Find the soonest closing deal for "Open til X"
                      const day = new Date().getDay();
                      const todayDeals = selectedVenue.deals.filter(d => d.days.includes(day));
                      const activeDeals = todayDeals.filter(d => {
                        const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
                        return isTimeInRange(timeStr, d.start, d.end);
                      });
                      const closestEnd = activeDeals.length > 0 ? activeDeals.sort((a, b) => a.end.localeCompare(b.end))[0].end : null;
                      const endLabel = closestEnd ? closestEnd.replace(/^0/, '') : '';
                      return (
                        <View style={{ gap: 4, marginBottom: upcoming.length > 0 ? 8 : 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.tintBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Ionicons name="time-outline" size={11} color="#27AE60" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#27AE60' }}>
                                {endLabel ? `${t('Open til', "Ouvert jusqu'a")} ${endLabel}` : t('Active now', 'Actif')}
                              </Text>
                            </View>
                          </View>
                          {active.map((deal, i) => (
                            <Text key={`a${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                          ))}
                        </View>
                      );
                    })()}
                    {upcoming.length > 0 && (() => {
                      const day = new Date().getDay();
                      const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
                      const upDeals = selectedVenue.deals.filter(d => d.days.includes(day) && !isTimeInRange(timeStr, d.start, d.end) && timeStr < d.start);
                      const soonest = upDeals.length > 0 ? upDeals.sort((a, b) => a.start.localeCompare(b.start))[0] : null;
                      const startMins = soonest ? parseTimeToMins(soonest.start) : 0;
                      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
                      const minsUntil = startMins - nowMins;
                      const isSoon = minsUntil > 0 && minsUntil <= 30;
                      const badgeColor = isSoon ? '#FF9800' : colours.muted;
                      const badgeBg = isSoon ? colours.warnBg : colours.surface;
                      const startLabel = soonest ? soonest.start.replace(/^0/, '') : '';
                      return (
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: badgeBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Ionicons name="time-outline" size={11} color={badgeColor} />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>
                                {isSoon
                                  ? `${t('Starts in', 'Commence dans')} ${minsUntil} min`
                                  : `${t('Starts at', 'Commence a')} ${startLabel}`
                                }
                              </Text>
                            </View>
                          </View>
                          {upcoming.map((deal, i) => (
                            <Text key={`u${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                          ))}
                        </View>
                      );
                    })()}
                    {active.length === 0 && upcoming.length === 0 && (
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, fontStyle: 'italic' }}>{t('No deals today', 'Aucune offre aujourd\'hui')}</Text>
                    )}
                  </View>
                  <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                    <Ionicons name="close" size={16} color={colours.text} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVenue.name + ' ' + selectedVenue.address + ' Ottawa')}`).catch(() => {})}
                  style={{ marginTop: 14, backgroundColor: color, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  accessibilityRole="link"
                  accessibilityLabel={t('Open in Maps', 'Ouvrir dans Maps')}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                    {t('Open in Maps', 'Ouvrir dans Maps')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Searched place sheet */}
          {searchedPlace && !selectedBus && !selectedEvent && !selectedCluster && !selectedVenue && !selectedSavedPin && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: colours.accentAlt + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colours.accentAlt + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accentAlt }}>{t('Place', 'Lieu')}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginBottom: 4 }}>
                    {searchedPlace.name}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{searchedPlace.address}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={clearSearch} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { fetchInlineTrip(searchedPlace.lat, searchedPlace.lng, searchedPlace.name); }}
                style={{ marginTop: 14, backgroundColor: '#3498db', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('Route here', 'M\'y rendre')}>
                <Ionicons name="navigate" size={16} color="white" />
                <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                  {t('Route here', 'M\'y rendre')} →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Saved pin sheet */}
          {selectedSavedPin && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : selectedSavedPin.kind === 'neighbourhood' ? '#7b5ea7' : '#2ecc71') + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : selectedSavedPin.kind === 'neighbourhood' ? '#7b5ea7' : '#2ecc71') + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : selectedSavedPin.kind === 'neighbourhood' ? '#7b5ea7' : '#2ecc71' }}>
                        {selectedSavedPin.kind === 'stop' ? t('Saved Stop', 'Arret favori') : selectedSavedPin.kind === 'place' ? t('Saved Place', 'Lieu favori') : selectedSavedPin.kind === 'neighbourhood' ? t('Neighbourhood', 'Quartier') : t('Saved Route', 'Trajet favori')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginBottom: 4 }}>
                    {selectedSavedPin.name}
                  </Text>
                  {selectedSavedPin.routeLabel && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{selectedSavedPin.routeLabel}</Text>
                  )}
                  {selectedSavedPin.kind === 'stop' && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                      {t('Stop', 'Arret')} #{selectedSavedPin.id.replace('stop_', '')}
                    </Text>
                  )}
                  {selectedSavedPin.kind === 'place' && selectedSavedPin.vicinity && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }} numberOfLines={1}>
                      {selectedSavedPin.vicinity}
                    </Text>
                  )}
                </View>
                <TouchableOpacity activeOpacity={0.7} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selectedSavedPin.lat},${selectedSavedPin.lng}`).catch(() => {})}
                style={{ marginTop: 14, backgroundColor: selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : selectedSavedPin.kind === 'neighbourhood' ? '#7b5ea7' : '#2ecc71', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                accessibilityRole="link"
                accessibilityLabel={t('Open in Maps', 'Ouvrir dans Maps')}>
                <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                  {t('Open in Maps', 'Ouvrir dans Maps')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
      {/* Inline trip results sheet */}
      {(tripResults.length > 0 || tripLoading) && !activeTripItinerary && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderWidth: 1, borderColor: colours.border,
          paddingBottom: 34,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 }, elevation: 10,
        }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 12, color: colours.muted, fontWeight: '600' }}>{t('Routes to', 'Itineraires vers')}</Text>
              <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }} numberOfLines={1}>{tripDestLabel}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={clearTripResults} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
              <Ionicons name="close" size={16} color={colours.text} />
            </TouchableOpacity>
          </View>

          {tripLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={colours.accent} size="large" />
              <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 10 }}>{t('Finding routes...', 'Recherche d\'itineraires...')}</Text>
            </View>
          ) : tripResults.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }}>
              <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center' }}>{t('No routes found. Try the full planner for more options.', 'Aucun itineraire trouve. Essayez le planificateur complet.')}</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {tripResults.slice(0, 3).map((itin, i) => {
                const depTime = new Date(itin.startTime);
                const arrTime = new Date(itin.endTime);
                const fmt = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                const durationMin = Math.round(itin.duration / 60);
                const walkMin = Math.round(itin.walkDistance / 80);
                const transitLegs = itin.legs.filter(l => l.mode !== 'WALK');
                return (
                  <View key={i} style={{ backgroundColor: colours.bg, borderRadius: 16, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 10 }}>
                    {/* Time + duration row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                        {fmt(depTime)} → {fmt(arrTime)}
                      </Text>
                      <View style={{ backgroundColor: colours.tintBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>{durationMin} min</Text>
                      </View>
                    </View>
                    {/* Route pills */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {itin.legs.map((leg, li) => {
                        if (leg.mode === 'WALK') {
                          return (
                            <View key={li} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Ionicons name="walk" size={14} color={colours.muted} />
                              <Text style={{ fontSize: 11, color: colours.muted }}>{Math.round(leg.distance)}m</Text>
                            </View>
                          );
                        }
                        const isSTO = leg.agencyId?.includes('STO') || leg.agencyId?.includes('sto');
                        const bg = isSTO ? '#00A78D' : '#CE1126';
                        return (
                          <View key={li} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {li > 0 && itin.legs[li - 1]?.mode !== 'WALK' && <Ionicons name="arrow-forward" size={10} color={colours.muted} />}
                            <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{leg.routeShortName || leg.mode}</Text>
                            </View>
                            {leg.headsign && <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{leg.headsign}</Text>}
                          </View>
                        );
                      })}
                    </View>
                    {/* Details row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {itin.transfers > 0 && (
                          <Text style={{ fontSize: 11, color: colours.muted }}>
                            {itin.transfers} {t('transfer', 'correspondance')}{itin.transfers > 1 ? 's' : ''}
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, color: colours.muted }}>
                          {walkMin} min {t('walk', 'marche')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setActiveTripItinerary(itin)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#34c759', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Start trip', 'Demarrer le trajet')}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>GO</Text>
                        <Ionicons name="arrow-forward" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* See all / More options link */}
              {tripDest && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    clearTripResults();
                    router.push({ pathname: '/(tabs)/planner', params: { toLabel: tripDestLabel, toLat: String(tripDest.lat), toLng: String(tripDest.lng) } } as any);
                  }}
                  style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button">
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>
                    {tripResults.length > 3
                      ? t(`See all ${tripResults.length} routes`, `Voir les ${tripResults.length} itineraires`) + ' →'
                      : t('More options', 'Plus d\'options') + ' →'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Selected layer pin card */}
      {selectedPin && (
        <Animated.View style={{
          position: 'absolute', bottom: 120, left: 16, right: 16, zIndex: 999,
          backgroundColor: colours.card, borderRadius: 16, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
          opacity: pinCardAnim, transform: [{ translateY: pinCardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            {selectedPin.photoUrl ? (
              <Image
                source={{ uri: selectedPin.photoUrl }}
                style={{ width: 48, height: 48, borderRadius: 12 }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: LAYER_CONFIG[selectedPin.category].color + '22',
              }}>
                {(() => { const PinIcon = LAYER_ICONS[selectedPin.category]; return <PinIcon size={20} color={LAYER_CONFIG[selectedPin.category].color} />; })()}
              </View>
            )}
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text }} numberOfLines={1}>{selectedPin.name}</Text>
              <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{selectedPin.subtitle}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedPin(null)} accessibilityLabel="Close" accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={16} color={colours.text} />
            </TouchableOpacity>
          </View>
          {(selectedPin.rating || selectedPin.price || selectedPin.isOpenNow !== undefined) && (
            <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 4 }}>
              {selectedPin.rating ? `\u2605 ${selectedPin.rating}` : ''}{selectedPin.price ? ` \u00b7 ${selectedPin.price}` : ''}{selectedPin.isOpenNow !== undefined ? (selectedPin.isOpenNow ? ` \u00b7 ${t('Open now', 'Ouvert')}` : ` \u00b7 ${t('Closed', 'Ferm\u00e9')}`) : ''}
            </Text>
          )}
          {selectedPin.time && (
            <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 4 }}>{selectedPin.time}</Text>
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            style={{ backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 8 }}
            onPress={() => {
              const pin = selectedPin;
              setSelectedPin(null);
              router.push({ pathname: '/(tabs)/planner', params: { toLat: String(pin.lat), toLng: String(pin.lng), toLabel: pin.name, autoplan: '1' } } as any);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Route to this location', 'Itineraire vers ce lieu')}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>
              {t('Route there \u2192', 'Itin\u00e9raire \u2192')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* First-open prompt — shown when user has no saved transit stops */}
      {boardItems.filter(i => i.type === 'bus_stop' || i.type === 'lrt_station').length === 0 && !tappedLocation && !tripResults.length && (
        <View style={{
          position: 'absolute', bottom: Platform.OS === 'ios' ? 120 : 100, left: 16, right: 16, zIndex: 998,
          backgroundColor: colours.card, borderRadius: 16, padding: 20,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
          borderWidth: 1, borderColor: colours.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#00A78D20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="bus" size={22} color="#00A78D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colours.text, fontSize: 16, fontWeight: '700' }}>
                {t('Add your first stop', 'Ajoutez votre premier arr\u00eat')}
              </Text>
              <Text style={{ color: colours.muted, fontSize: 13, marginTop: 2 }}>
                {t('Tap a bus stop on the map or search above', 'Touchez un arr\u00eat sur la carte ou cherchez ci-dessus')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/saved' as any)}
            activeOpacity={0.85}
            style={{ backgroundColor: '#00A78D', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={t('Go to My Stops', 'Aller \u00e0 Mes arr\u00eats')}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {t('Go to My Stops', 'Aller \u00e0 Mes arr\u00eats')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Nearby transit bottom sheet */}
      <NearbyTransitSheet
        ref={nearbySheetRef}
        colours={colours}
        fonts={fonts}
        t={t}
        language={language}
        nearbyStops={nearbyStops}
        nearbyLoading={nearbyLoading}
        onRefreshLocation={fetchNearbyStops}
        savedBoard={boardItems}
        onBoardCardPress={() => {}}
        boardCardProps={{
          cardShadow: {},
          garbageEvents: [],
          alerts: sheetAlerts,
          sensGame: sheetSensGame,
          timeFormat: 'relative',
          campusData: null,
        }}
        expandedStopId={expandedStopId}
        onExpandStop={handleExpandStop}
        expandedArrivals={expandedArrivals}
        expandedArrivalsLoading={expandedArrivalsLoading}
        activeAlertCount={sheetAlerts.length}
        hasDisruption={sheetAlerts.some((a: any) => a.category === 'lrt' || (a.title || '').toLowerCase().includes('o-train'))}
        weather={sheetWeather}
        sensGame={sheetSensGame}
        events={sheetEvents}
        onServiceTileTap={(tile: ServiceTile) => {
          if (tile.action === 'navigate' && tile.target) {
            router.push(tile.target as any);
          } else if (tile.action === 'link' && tile.target) {
            Linking.openURL(tile.target).catch(() => {});
          }
        }}
        communityDeals={sheetDeals}
        onPlanTrip={() => router.push('/(tabs)/planner' as any)}
        activeLayers={activeLayers}
        layerPins={layerPins}
        onToggleLayer={toggleLayer}
        loadingLayers={loadingLayers}
        onRouteToPin={(pin: MapPin) => {
          router.push({ pathname: '/(tabs)/planner', params: { toLat: String(pin.lat), toLng: String(pin.lng), toLabel: pin.name, autoplan: '1' } } as any);
        }}
        happeningNow={happeningNow}
        onSubmitDeal={() => {
          router.push('/(tabs)/discover' as any);
        }}
      />

      {/* ActiveTrip overlay */}
      {activeTripItinerary && (
        <ActiveTrip
          visible={!!activeTripItinerary}
          itinerary={activeTripItinerary}
          onEnd={() => { setActiveTripItinerary(null); clearTripResults(); }}
          colours={colours}
          t={t}
          onConfirmArrival={async (routeId, stopName) => {
            try {
              const { getDeviceId } = require('../../lib/pushNotifications');
              const deviceId = await getDeviceId();
              fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=ghost.report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stop_id: stopName, route_id: routeId, report_type: 'confirmed_arrived', notes: '', device_id: deviceId }),
              }).catch(() => {});
            } catch (e) { if (__DEV__) console.warn(e); }
          }}
        />
      )}

      <BusTrackingModal
        visible={!!trackingBus}
        onClose={() => setTrackingBus(null)}
        routeId={trackingBus?.routeId ?? ''}
        headsign=""
        stopName={busEtaInfo?.stopName ?? ''}
        stopId={busEtaInfo?.stopId ?? trackingBus?.toStop ?? ''}
        minsAway={busEtaInfo?.mins ?? 0}
        isSTO={trackingBus?.agency === 'STO'}
        colours={colours}
        fonts={fonts}
        t={t}
      />
    </View>
    </ScreenErrorBoundary>
  );
}
