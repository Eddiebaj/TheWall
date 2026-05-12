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
import stopsearchData from './stopsearch.json';
import { SK_SAVED_ROUTES, SK_FAVS, SK_SAVED_PLACES, SK_TRIP_HISTORY } from '../../lib/storageKeys';
import { supabase } from '../../lib/supabase';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from '../../lib/happyHourData';
import BusTrackingModal from '../../components/BusTrackingModal';
import BottomSheet from '@gorhom/bottom-sheet';
import NearbyTransitSheet, { NearbyStop } from '../../components/NearbyTransitSheet';
import ServicesGrid, { ServiceTile } from '../../components/ServicesGrid';
import TonightCard from '../../components/TonightCard';
import ActiveTrip from '../../components/ActiveTrip';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import * as ImagePicker from 'expo-image-picker';
import { getDeviceId } from '../../lib/pushNotifications';
import { cacheArrivals, getCachedArrivals } from '../../lib/arrivalCache';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { haversineKm } from '../../lib/geo';
import { LAYER_CONFIG, LAYER_ICONS, DEFAULT_LAYERS, MapPin, LayerKey, saveLayerPrefs, loadLayerPrefs } from '../../lib/mapLayers';
import { getRouteColour } from '../../lib/routeColors';
import { NEIGHBOURHOOD_GROUPS } from '../../lib/neighbourhoodGroups';
import { getPlatformForRoute, hasPlatformData } from '../../lib/platformData';
import { nearbyVenueAlert, matchVenueByName } from '../../lib/venueTransitData';

const VEHICLES_URL    = 'https://routeo-backend.vercel.app/api/vehicles';
const BACKEND_URL     = 'https://routeo-backend.vercel.app/api/arrivals';
const CITY_URL        = 'https://routeo-backend.vercel.app/api/city';

type SavedRoute = { id: string; fromLabel: string; toLabel: string; fromLat: number; fromLng: number; toLat: number; toLng: number };
type SavedFav = { id: string; name: string; icon: string };
type SavedPin = { id: string; name: string; lat: number; lng: number; kind: 'stop' | 'route_from' | 'route_to' | 'place'; routeLabel?: string; vicinity?: string };
type PlanLeg = { mode: string; startTime: number; endTime: number; duration: number; distance: number; from: { name: string; stopCode?: string | null }; to: { name: string; stopCode?: string | null }; routeShortName: string | null; headsign: string | null; legGeometry?: { points: string }; agencyId?: string | null };
type PlanItinerary = { duration: number; startTime: number; endTime: number; legs: PlanLeg[] };

const OTTAWA_REGION: Region = {
  latitude: 45.4215, longitude: -75.6972,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};

type Bus = {
  id: string; routeId: string; lat: number; lng: number;
  fromStop: string; toStop: string; progress: number;
  agency?: 'OC_TRANSPO' | 'STO';
};


const isLRT = (routeId: string) => {
  const base = routeId.split('-')[0].toLowerCase();
  return base === '1' || base === '2' || base === 'o1' || base === 'o2' ||
         base === 'confederation' || base === 'trillium' || routeId.toLowerCase().includes('lrt');
};

const validCoord = (lat: any, lng: any) => lat != null && lng != null && !isNaN(lat) && !isNaN(lng);


export type VenueState = 'active' | 'soon' | 'upcoming' | 'closed';

function mapDestNeighbourhood(lat: number, lng: number): string | undefined {
  for (const g of NEIGHBOURHOOD_GROUPS) {
    if (haversineKm(lat, lng, g.lat, g.lng) <= g.radiusKm) return g.name_en;
  }
  return undefined;
}

async function saveTripToHistory(itinerary: PlanItinerary, toPlace: { name: string; lat: number; lng: number }): Promise<void> {
  try {
    const totalDistM = itinerary.legs.reduce((s, l) => s + (l.distance || 0), 0);
    const primaryBusLeg = itinerary.legs.find(l => l.mode === 'BUS' || l.mode === 'TRAM' || l.mode === 'RAIL');
    const now = new Date();
    const record = {
      id: `trip_${Date.now()}`,
      fromLabel: itinerary.legs[0]?.from?.name ?? 'Current location',
      fromLat: 0, fromLng: 0,
      toLabel: toPlace.name,
      toLat: toPlace.lat, toLng: toPlace.lng,
      durationMins: Math.round((itinerary.endTime - itinerary.startTime) / 60000),
      distanceKm: Math.round(totalDistM / 100) / 10,
      plannedAt: now.toISOString(),
      neighbourhood: mapDestNeighbourhood(toPlace.lat, toPlace.lng),
      routeId: primaryBusLeg?.routeShortName ?? undefined,
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    };
    const raw = await AsyncStorage.getItem(SK_TRIP_HISTORY);
    const existing: typeof record[] = raw ? JSON.parse(raw) : [];
    const updated = [record, ...existing].slice(0, 200);
    await AsyncStorage.setItem(SK_TRIP_HISTORY, JSON.stringify(updated));
  } catch {}
}

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

// Styled square badge bus marker — OC red (#CE1126), STO teal (#00C07A)
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
  const bg = isSTO ? '#00C07A' : '#CE1126';
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

// Nearby tip — checks happy hour venues within 400m of destination, ending within 2h of ETA
function computeNearbyTip(destLat: number, destLng: number, etaMs: number, language: string): string | null {
  if (!destLat || !destLng || !etaMs) return null;
  const eta = new Date(etaMs);
  const etaMins = eta.getHours() * 60 + eta.getMinutes();
  const dow = eta.getDay();
  const windowEnd = etaMins + 120;
  for (const venue of HAPPY_HOUR_VENUES) {
    const distM = haversineKm(destLat, destLng, venue.lat, venue.lng) * 1000;
    if (distM > 400) continue;
    for (const deal of venue.deals) {
      if (!deal.days.includes(dow)) continue;
      const [sh, sm] = deal.end.split(':').map(Number);
      const endMins = sh * 60 + sm;
      if (endMins < etaMins || endMins > windowEnd) continue;
      const walkMins = Math.max(1, Math.round(distM / 80));
      const desc = language === 'fr' ? deal.description_fr : deal.description;
      return `${desc} at ${venue.name} — ends ${deal.end} · ${walkMins} min walk`;
    }
  }
  return null;
}

// Today filter
const getTodayStr = () => {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD in ET
};



export default function MapScreen() {
  const { colours, theme, resolvedTheme, t, fonts, language } = useApp();
  const { savedBoard: boardItems, addToBoardIfMissing } = useBoard();
  const insets = useSafeAreaInsets();
  const isLight = resolvedTheme === 'light';
  const mapRef = useRef<any>(null);
  const deepLinkParams = useLocalSearchParams();

  const [buses, setBuses] = useState<Bus[]>([]);
  const [busLoading, setBusLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenuePin | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set(['all']));
  const [searchText, setSearchText] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<{ placeId: string; name: string; address: string; stopId?: string }[]>([]);
  const [searchedPlace, setSearchedPlace] = useState<{ placeId: string; name: string; address: string; lat: number; lng: number; stopId?: string } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const tappedLocationRef = useRef<{ lat: number; lng: number; address: string } | null>(null);
  // Keep ref in sync so stable callbacks can read latest value
  useEffect(() => { tappedLocationRef.current = tappedLocation; }, [tappedLocation]);
  const tappedAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  const [contributeVisible, setContributeVisible] = useState(false);
  const [contribName, setContribName] = useState('');
  const [contribType, setContribType] = useState('');
  const [contribInfo, setContribInfo] = useState('');
  const [contribAddress, setContribAddress] = useState('');
  const [contribPhoto, setContribPhoto] = useState<string | null>(null);
  const [contribSending, setContribSending] = useState(false);
  const [contribSent, setContribSent] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);

  const nearbySheetRef = useRef<BottomSheet>(null);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [expandedArrivals, setExpandedArrivals] = useState<{ routeId: string; headsign: string; minsAway: number; source?: string }[]>([]);
  const [expandedArrivalsLoading, setExpandedArrivalsLoading] = useState(false);

  const [activeLayers, setActiveLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [layerPins, setLayerPins] = useState<Partial<Record<LayerKey, MapPin[]>>>({});
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  const [sheetAlerts, setSheetAlerts] = useState<any[]>([]);
  const [sheetDeals, setSheetDeals] = useState<{ id: string; venue_name: string; deal_text: string; day_of_week: number }[]>([]);
  const [servicesTab, setServicesTab] = useState('explore');

  // Inline trip planner
  const [planMode, setPlanMode] = useState(false);
  const [planToText, setPlanToText] = useState('');
  const [planToSuggestions, setPlanToSuggestions] = useState<{ placeId: string; name: string; address: string; stopId?: string }[]>([]);
  const [planToPlace, setPlanToPlace] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const planToTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [planTransitMode, setPlanTransitMode] = useState<'BUS' | 'WALK' | 'BICYCLE'>('BUS');
  const [planItineraries, setPlanItineraries] = useState<PlanItinerary[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planResultsVisible, setPlanResultsVisible] = useState(false);
  const [goItinerary, setGoItinerary] = useState<PlanItinerary | null>(null);
  const [justGoLoading, setJustGoLoading] = useState(false);
  const [goNearbyTip, setGoNearbyTip] = useState<string | null>(null);
  const [planReliability, setPlanReliability] = useState<Record<string, number>>({});
  const [minimizeWalking, setMinimizeWalking] = useState(false);
  const [planWeather, setPlanWeather] = useState<{ precipitation: boolean; windKmh: number } | null>(null);
  const [transferWarnings, setTransferWarnings] = useState<{ itinIdx: number; legIdx: number; bufferMins: number; incomingRoute: string }[]>([]);
  const [planNearbyVenue, setPlanNearbyVenue] = useState<{ venueName: string; routeIds: string[]; minutesUntilEnd: number } | null>(null);
  const [safetySignalStopIds, setSafetySignalStopIds] = useState<Set<string>>(new Set());

  // Tonight card data
  const [tonightWeather, setTonightWeather] = useState<{ temp: number; condition: string } | null>(null);
  const [tonightEvents, setTonightEvents] = useState<{ name: string; date: string; time?: string; venue: string }[]>([]);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [loadingLayers, setLoadingLayers] = useState<Set<LayerKey>>(new Set());
  const layerFetchedAt = useRef<Partial<Record<LayerKey, number>>>({});
  const pinCardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadLayerPrefs().then(prefs => setActiveLayers(prefs));
  }, []);

  useEffect(() => {
    if (selectedPin) {
      pinCardAnim.setValue(0);
      Animated.timing(pinCardAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
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
      } else if (layer === 'deals') {
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
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: reports } = await supabase
          .from('stop_reports')
          .select('stop_id, route_id, category, created_at')
          .neq('category', 'confirmed_arrived')
          .gte('created_at', oneHourAgo);
        if (reports && reports.length > 0) {
          const byStop: Record<string, { routes: Set<string>; count: number }> = {};
          for (const r of reports) {
            if (!byStop[r.stop_id]) byStop[r.stop_id] = { routes: new Set(), count: 0 };
            byStop[r.stop_id].count++;
            if (r.route_id) byStop[r.stop_id].routes.add(r.route_id);
          }
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

  const happeningNow = useMemo(() => {
    if (!layerPins) return [];
    const timeLayers: LayerKey[] = ['deals'];
    const allPins = timeLayers.flatMap(k => (activeLayers[k] ? (layerPins[k] || []) : []));
    const R = 0.0045; // ~500m in degrees
    return allPins.filter(p =>
      Math.abs(p.lat - region.latitude) < R && Math.abs(p.lng - region.longitude) < R
    ).slice(0, 10);
  }, [layerPins, activeLayers, region.latitude, region.longitude]);

  const ottawaNow = useMemo(() => {
    const now = new Date();
    const dayOfWeek = parseInt(now.toLocaleDateString('en-CA', { weekday: 'narrow', timeZone: 'America/Toronto' }).replace(/[^0-6]/, '0'), 10);
    const d = new Date(now.toLocaleString('en-CA', { timeZone: 'America/Toronto' }));
    const currentMins = d.getHours() * 60 + d.getMinutes();
    return { dayOfWeek: d.getDay(), currentMins };
  }, [region]); // re-evaluate when map moves (rough timer proxy)

  const heatZones = useMemo(() => {
    const zones: { id: string; lat: number; lng: number; radius: number; color: string; strokeColor: string; count?: number; label: string }[] = [];
    const { dayOfWeek, currentMins } = ottawaNow;

    const activeVenues = HAPPY_HOUR_VENUES.filter(v =>
      getActiveDeals(v, dayOfWeek, currentMins).length > 0
    );
    const communityDealPins = (layerPins?.deals ?? []).filter(p => p.id.startsWith('deal_'));
    const communityAsVenues: HappyHourVenue[] = communityDealPins.map(p => ({
      name: p.name, address: '', type: ['restaurant' as const],
      lat: p.lat, lng: p.lng,
      deals: [{ days: [dayOfWeek], start: '00:00', end: '23:59', description: p.subtitle, description_fr: p.subtitle }],
    }));
    const allActiveVenues = [...activeVenues, ...communityAsVenues];
    const clusters = clusterVenues(allActiveVenues, 800);
    clusters.forEach(cluster => {
      const opacity = Math.min(0.4, 0.1 + cluster.count * 0.06);
      const strokeOpacity = Math.min(0.7, 0.25 + cluster.count * 0.08);
      zones.push({
        id: `happy-${cluster.centroidLat.toFixed(4)}-${cluster.centroidLng.toFixed(4)}`,
        lat: cluster.centroidLat,
        lng: cluster.centroidLng,
        radius: 300 + (cluster.count * 50),
        color: `rgba(255, 165, 0, ${opacity})`,
        strokeColor: `rgba(255, 165, 0, ${strokeOpacity})`,
        count: cluster.count,
        label: `${cluster.count} deals active`,
      });
    });

    return zones;
  }, [ottawaNow, layerPins]);

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
      const r = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/route?id=${encodeURIComponent(bareId)}&action=shape${agencyParam}`,
        { timeout: 8000 }
      );
      if (!r.ok) {
        if (__DEV__) console.log(`[RouteShape] backend returned ${r.status}`);
        return;
      }
      const shapeResult = await r.json();
      if (__DEV__) console.log(`[RouteShape] route=${shapeResult?.routeId} received ${shapeResult?.shape?.length ?? 0} points`);
      if (shapeResult?.shape?.length) {
        setSelectedRouteShape(shapeResult.shape);
      } else {
        if (__DEV__) console.log(`[RouteShape] no shape returned for route ${bareId}`);
      }
    } catch (e) {
      if (__DEV__) console.log('[RouteShape] error:', e);
    }
  }, []);

  const openSheet = useCallback((bus?: Bus, venue?: VenuePin) => {
    if (bus) hapticMedium(); else hapticLight();
    if (tappedLocationRef.current) { setTappedLocation(null); tappedAnim.setValue(0); }
    setSelectedBus(bus || null); setSelectedVenue(venue || null);
    if (bus || venue) {
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
      setSelectedBus(null); setSelectedVenue(null); setSelectedSavedPin(null);
      setSelectedRouteShape([]); setBusEtaInfo(null);
    });
  }, [sheetAnim]);

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const tappedTranslate = tappedAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });

  const handleMapTap = useCallback(async (e: any) => {
    if (selectedBus || selectedVenue || selectedSavedPin || searchedPlace) {
      hideSheet();
      return;
    }
    const coord = e.nativeEvent?.coordinate;
    if (!coord) return;
    const { latitude, longitude } = coord;
    if (!validCoord(latitude, longitude)) return;
    setTappedLocation({ lat: latitude, lng: longitude, address: '' });
    Animated.spring(tappedAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
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
  }, [selectedBus, selectedVenue, selectedSavedPin, searchedPlace, hideSheet, tappedAnim]);

  const dismissTapped = useCallback(() => {
    Animated.spring(tappedAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setTappedLocation(null);
    });
  }, [tappedAnim]);

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

      const sorted = stops
        .map(s => ({ ...s, dist: haversineKm(uLat, uLng, s.stop_lat, s.stop_lon) * 1000 }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 10);

      const initial: NearbyStop[] = sorted.map(s => ({
        stopId: s.stop_id,
        stopName: s.stop_name || `Stop #${s.stop_id}`,
        walkMeters: Math.round(s.dist),
        arrivals: [],
        arrivalsLoading: true,
      }));
      setNearbyStops(initial);
      setNearbyLoading(false);

      const results = await Promise.allSettled(
        sorted.map(async s => {
          const r = await fetchWithTimeout(`${BACKEND_URL}?stop=${s.stop_id}`, { timeout: 8000 });
          if (!r.ok) return { stopId: s.stop_id, arrivals: [] };
          const data = await r.json();
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

      const updatedStops = await Promise.all(initial.map(async (stop) => {
        const idx = sorted.findIndex(s => s.stop_id === stop.stopId);
        const result = idx >= 0 ? results[idx] : undefined;
        if (result?.status === 'fulfilled' && result.value.arrivals.length > 0) {
          cacheArrivals(stop.stopId, { arrivals: result.value.arrivals, source: 'live', stopName: stop.stopName });
          return { ...stop, arrivals: result.value.arrivals, arrivalsLoading: false };
        }
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

  const handleExpandStop = useCallback(async (stopId: string | null) => {
    setExpandedStopId(stopId);
    if (!stopId) { setExpandedArrivals([]); return; }
    setExpandedArrivalsLoading(true);
    try {
      const r = await fetchWithTimeout(`${BACKEND_URL}?stop=${stopId}`, { timeout: 8000 });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
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
      if (data.safetySignal) {
        setSafetySignalStopIds(prev => { const next = new Set(prev); next.add(stopId); return next; });
      }
    } catch (e) {
      if (__DEV__) console.warn('Expanded arrivals fetch failed:', e);
      const cached = await getCachedArrivals(stopId);
      if (cached && cached.arrivals.length > 0) {
        setExpandedArrivals(cached.arrivals.map((a: any) => ({ ...a, cached: true, cachedAt: cached.cachedAt })));
      } else {
        setExpandedArrivals([]);
      }
    }
    setExpandedArrivalsLoading(false);
  }, []);

  useEffect(() => { fetchNearbyStops(); }, [fetchNearbyStops]);

  useEffect(() => {
    fetchWithTimeout('https://routeo-backend.vercel.app/api/alerts', { timeout: 8000 })
      .then(r => r.ok ? r.json() : { alerts: [] })
      .then(data => { setSheetAlerts(data?.alerts || []); })
      .catch(() => {});

    supabase.from('community_deals').select('id, venue_name, deal_text, day_of_week')
      .order('submitted_at', { ascending: false }).limit(10)
      .then(({ data }: { data: any }) => { if (data) setSheetDeals(data); })
      .then(() => {}, () => {});
  }, []);

  useEffect(() => {
    // Weather for TonightCard
    fetchWithTimeout('https://api.open-meteo.com/v1/forecast?latitude=45.4215&longitude=-75.6972&current_weather=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.current_weather) return;
        const code = data.current_weather.weathercode ?? 0;
        const cond = code === 0 ? 'Clear' : code <= 3 ? 'Partly Cloudy' : code <= 45 ? 'Cloudy' : code <= 67 ? 'Rainy' : 'Snowy';
        setTonightWeather({ temp: data.current_weather.temperature, condition: cond });
      })
      .catch(() => {});
    // Events for TonightCard
    fetchWithTimeout('https://routeo-backend.vercel.app/api/ebevents')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const raw = (data?.events ?? data) || [];
        if (!Array.isArray(raw)) return;
        setTonightEvents(raw.slice(0, 8).map((e: any) => ({
          name: e.name || e.title || '',
          date: e.date || '',
          time: e.time || e.startTime || '',
          venue: typeof e.venue === 'string' ? e.venue : (e.venue?.name || ''),
        })));
      })
      .catch(() => {});
  }, []);

  const routeToTapped = useCallback(() => {
    if (!tappedLocation) return;
    const label = tappedLocation.address || `${tappedLocation.lat.toFixed(5)}, ${tappedLocation.lng.toFixed(5)}`;
    dismissTapped();
    setPlanMode(true);
    setPlanToText(label);
    setPlanToPlace({ name: label, lat: tappedLocation.lat, lng: tappedLocation.lng });
  }, [tappedLocation, dismissTapped]);

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

  useEffect(() => {
    if (!selectedBus || selectedRouteShape.length < 2) { setBusEtaInfo(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const uLat = loc.coords.latitude;
        const uLng = loc.coords.longitude;

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

        let bestStop: { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number } | null = null;
        let bestDist = Infinity;
        for (const s of nearbyStops) {
          const d = haversineKm(uLat, uLng, s.stop_lat, s.stop_lon);
          if (d < bestDist) { bestDist = d; bestStop = s; }
        }
        if (!bestStop || bestDist > 1.5) return; // Too far from any stop

        const busPos = distAlongShape(selectedRouteShape, selectedBus.lat, selectedBus.lng);
        const stopPos = distAlongShape(selectedRouteShape, bestStop.stop_lat, bestStop.stop_lon);

        if (stopPos.index <= busPos.index) return;

        const distKm = stopPos.cumDist - busPos.cumDist;
        if (distKm <= 0 || distKm > 30) return;

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
      const r = await fetchWithTimeout(`${VEHICLES_URL}?t=${Date.now()}`, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const vehiclesResult = await r.json();
      const incoming: Bus[] = vehiclesResult.vehicles || [];
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

  useEffect(() => {
    if (deepLinkParams.highlightRoute) {
      const routeId = deepLinkParams.highlightRoute as string;
      setFilters(new Set(['bus']));
      setSearchText(routeId);
    }
  }, [deepLinkParams.highlightRoute]);

  useEffect(() => {
    if (deepLinkParams.layer) {
      const layerKey = deepLinkParams.layer as LayerKey;
      if (layerKey in activeLayers && !activeLayers[layerKey]) {
        toggleLayer(layerKey);
      }
    }
  }, [deepLinkParams.layer]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDelta(region.latitudeDelta), 400);
    return () => clearTimeout(timer);
  }, [region.latitudeDelta]);

  useEffect(() => {
    if (savedLoaded) return;
    const load = async () => {
      const pins: SavedPin[] = [];
      const routeIdSet = new Set<string>();
      const seenStopIds = new Set<string>();
      try {
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
        const stopResults = await Promise.allSettled(stopIds.map(async (stop) => {
          const r = await fetchWithTimeout(`${BACKEND_URL}?stop=${stop.id}`, { timeout: 10000 });
          if (!r.ok) return null;
          const data = await r.json();
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
    if (!showBuses || zoomTooFar) return [];
    let result = buses.filter((b: Bus) => {
      if (b.lat < viewBounds.minLat || b.lat > viewBounds.maxLat ||
          b.lng < viewBounds.minLng || b.lng > viewBounds.maxLng) return false;
      if (hasSaved && !hasAll && !filters.has('bus')) {
        const base = b.routeId.split('-')[0];
        return savedRouteIds.has(base);
      }
      if (!hasAll && filters.has('bus')) return !isLRT(b.routeId);
      return true;
    });
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

  function fmtPlanDuration(secs: number) {
    const m = Math.round(secs / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function fmtPlanTime(ms: number) {
    const d = new Date(ms);
    const h = d.getHours();
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${mi}${h >= 12 ? 'pm' : 'am'}`;
  }
  const LEG_PLAN_ICONS: Record<string, string> = { WALK: 'walk', BUS: 'bus', TRAM: 'train', RAIL: 'train', SUBWAY: 'train', FERRY: 'boat', BICYCLE: 'bicycle' };
  const LEG_PLAN_COLORS: Record<string, string> = { WALK: '#9aaabb', BUS: '#00C07A', TRAM: '#0057B8', RAIL: '#0057B8', SUBWAY: '#0057B8', FERRY: '#7b5ea7', BICYCLE: '#34c759' };

  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) { setPlaceSuggestions([]); return; }
    // Match transit stops locally
    const q = query.toLowerCase();
    const stopMatches = (stopsearchData as { id: string; name: string }[])
      .filter(s => s.name.toLowerCase().includes(q) || s.id === query)
      .slice(0, 3)
      .map(s => ({ placeId: `stop_${s.id}`, name: toTitleCase(s.name), address: `${t('Stop', 'Arr\u00eat')} #${s.id}`, stopId: s.id }));
    try {
      const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete&input=${encodeURIComponent(query)}&location=45.4215,-75.6972&radius=50000`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const autocompleteResult = await r.json();
      const placeMatches = (autocompleteResult.predictions || []).slice(0, 5).map((p: any) => ({
        placeId: p.place_id,
        name: p.structured_formatting?.main_text || p.description,
        address: p.structured_formatting?.secondary_text || '',
      }));
      setPlaceSuggestions([...stopMatches, ...placeMatches].slice(0, 6));
    } catch (_) { setPlaceSuggestions(stopMatches.length > 0 ? stopMatches : []); }
  }, [t]);

  const selectPlace = useCallback(async (suggestion: { placeId: string; name: string; address: string; stopId?: string }) => {
    hapticLight();
    Keyboard.dismiss();
    setPlaceSuggestions([]);
    try {
      if (suggestion.stopId) {
        // Transit stop — geocode by stop name
        const geoR = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=geocode&address=${encodeURIComponent(suggestion.name + ', Ottawa, ON')}`);
        let lat = 45.4215, lng = -75.6972; // fallback to Ottawa centre
        if (geoR.ok) {
          const geoData = await geoR.json();
          if (geoData.results?.[0]?.geometry?.location) {
            lat = geoData.results[0].geometry.location.lat;
            lng = geoData.results[0].geometry.location.lng;
          }
        }
        const place = { placeId: suggestion.placeId, name: suggestion.name, address: suggestion.address, lat, lng, stopId: suggestion.stopId };
        setSearchedPlace(place);
        setSearchText(suggestion.name);
        mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
        setSelectedBus(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
        Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
      } else {
        const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=details&place_id=${suggestion.placeId}&fields=geometry,name,formatted_address`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const detailsResult = await r.json();
        if (detailsResult.result?.geometry?.location) {
          const { lat, lng } = detailsResult.result.geometry.location;
          const place = {
            placeId: suggestion.placeId,
            name: detailsResult.result.name || suggestion.name,
            address: detailsResult.result.formatted_address || suggestion.address,
            lat, lng,
          };
          setSearchedPlace(place);
          setSearchText(place.name);
          mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
          setSelectedBus(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
          Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      }
    } catch (_) { if (__DEV__) console.warn('Place details failed:', _); }
  }, [sheetAnim]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setPlaceSuggestions([]);
    setSearchedPlace(null);
    hideSheet();
  }, []);

  const searchPlanTo = useCallback(async (query: string) => {
    if (query.length < 3) { setPlanToSuggestions([]); return; }
    const q = query.toLowerCase();
    const stopMatches = (stopsearchData as { id: string; name: string }[])
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map(s => ({ placeId: `stop_${s.id}`, name: toTitleCase(s.name), address: `${t('Stop', 'Arr\u00eat')} #${s.id}`, stopId: s.id }));
    try {
      const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete&input=${encodeURIComponent(query)}&location=45.4215,-75.6972&radius=50000`);
      if (!r.ok) throw new Error('');
      const res = await r.json();
      const pm = (res.predictions || []).slice(0, 4).map((p: any) => ({
        placeId: p.place_id,
        name: p.structured_formatting?.main_text || p.description,
        address: p.structured_formatting?.secondary_text || '',
      }));
      setPlanToSuggestions([...stopMatches, ...pm].slice(0, 6));
    } catch { setPlanToSuggestions(stopMatches); }
  }, [t]);

  const selectPlanTo = useCallback(async (s: { placeId: string; name: string; address: string; stopId?: string }) => {
    hapticLight();
    Keyboard.dismiss();
    setPlanToSuggestions([]);
    setPlanToText(s.name);
    try {
      let lat = 45.4215, lng = -75.6972;
      if (s.stopId) {
        const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=geocode&address=${encodeURIComponent(s.name + ', Ottawa, ON')}`);
        if (r.ok) { const d = await r.json(); if (d.results?.[0]?.geometry?.location) { lat = d.results[0].geometry.location.lat; lng = d.results[0].geometry.location.lng; } }
      } else {
        const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=details&place_id=${s.placeId}&fields=geometry`);
        if (r.ok) { const d = await r.json(); if (d.result?.geometry?.location) { lat = d.result.geometry.location.lat; lng = d.result.geometry.location.lng; } }
      }
      setPlanToPlace({ name: s.name, lat, lng });
    } catch { if (__DEV__) console.warn('plan to geocode failed'); }
  }, []);

  const executePlan = useCallback(async (toLat?: number, toLng?: number, toName?: string) => {
    const destLat = toLat ?? planToPlace?.lat;
    const destLng = toLng ?? planToPlace?.lng;
    const destName = toName ?? planToPlace?.name ?? '';
    if (!destLat || !destLng) return;
    setPlanLoading(true);
    setPlanItineraries([]);
    setPlanNearbyVenue(null);
    setTransferWarnings([]);
    try {
      let fromLat = 45.4215, fromLng = -75.6972;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (loc) { fromLat = loc.coords.latitude; fromLng = loc.coords.longitude; }
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;

      // Fetch weather in parallel with plan (non-blocking)
      fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${fromLat}&longitude=${fromLng}&hourly=precipitation,windspeed_10m&forecast_days=1&timezone=America%2FToronto`, { timeout: 5000 })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.hourly) return;
          const hour = now.getHours();
          const precip = (data.hourly.precipitation?.[hour] ?? 0) > 0.1;
          const wind = data.hourly.windspeed_10m?.[hour] ?? 0;
          setPlanWeather({ precipitation: precip, windKmh: wind });
        })
        .catch(() => {});

      // Check if destination is near a major event venue
      const venueMatch = nearbyVenueAlert(destLat, destLng);
      if (venueMatch) {
        // Find matching event end time from tonightEvents
        let minutesUntilEnd = 0;
        for (const ev of tonightEvents) {
          const matched = matchVenueByName(ev.venue);
          if (matched && matched.name === venueMatch.name && (ev as any).endDateTime) {
            const endMs = new Date((ev as any).endDateTime).getTime();
            minutesUntilEnd = Math.max(0, Math.round((endMs - Date.now()) / 60000));
            break;
          }
        }
        setPlanNearbyVenue({ venueName: venueMatch.name, routeIds: venueMatch.affectedRoutes, minutesUntilEnd });
      }

      let url = `https://routeo-backend.vercel.app/api/plan?fromLat=${fromLat}&fromLng=${fromLng}&fromLabel=My+Location&toLat=${destLat}&toLng=${destLng}&toLabel=${encodeURIComponent(destName)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=${planTransitMode}`;
      if (minimizeWalking) url += '&walkReluctance=5';
      const r = await fetchWithTimeout(url, { timeout: 15000 });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const itins: PlanItinerary[] = (data?.itineraries || []).slice(0, 3);
      setPlanItineraries(itins);
      setPlanResultsVisible(true);

      // Compute tight transfer warnings from static OTP data
      const warnings: { itinIdx: number; legIdx: number; bufferMins: number; incomingRoute: string }[] = [];
      itins.forEach((itin, itinIdx) => {
        for (let i = 0; i < itin.legs.length - 1; i++) {
          const leg = itin.legs[i];
          const nextLegItem = itin.legs[i + 1];
          if (leg.mode === 'WALK' || nextLegItem.mode === 'WALK') continue;
          if (!leg.routeShortName || !nextLegItem.routeShortName) continue;
          const bufferMins = Math.round((nextLegItem.startTime - leg.endTime) / 60000);
          if (bufferMins < 5) {
            warnings.push({ itinIdx, legIdx: i, bufferMins, incomingRoute: leg.routeShortName });
          }
        }
      });
      setTransferWarnings(warnings);
      // Fetch reliability for bus legs (non-blocking)
      try {
        const routeIds = [...new Set(itins.flatMap(it => it.legs.filter(l => l.routeShortName).map(l => l.routeShortName!)))];
        if (routeIds.length > 0) {
          const { data: relData } = await supabase.from('route_reliability').select('route_id, delta_minutes').in('route_id', routeIds);
          if (relData && relData.length > 0) {
            const grouped: Record<string, { onTime: number; total: number }> = {};
            for (const row of relData) {
              if (!grouped[row.route_id]) grouped[row.route_id] = { onTime: 0, total: 0 };
              grouped[row.route_id].total++;
              if (Math.abs(row.delta_minutes || 0) <= 3) grouped[row.route_id].onTime++;
            }
            const rel: Record<string, number> = {};
            for (const [rId, stats] of Object.entries(grouped)) {
              if (stats.total >= 5) rel[rId] = Math.round((stats.onTime / stats.total) * 100);
            }
            setPlanReliability(rel);
          }
        }
      } catch {}
    } catch (e) { if (__DEV__) console.warn('plan failed', e); }
    finally { setPlanLoading(false); }
  }, [planTransitMode, planToPlace, minimizeWalking, tonightEvents]);

  const handleJustGo = useCallback(async () => {
    setJustGoLoading(true);
    try {
      const raw = await AsyncStorage.getItem(SK_TRIP_HISTORY);
      const history: { toLat: number; toLng: number; toLabel: string }[] = raw ? JSON.parse(raw) : [];
      if (history.length === 0) { setPlanMode(true); return; }
      const counts: Record<string, { count: number; toLat: number; toLng: number; toLabel: string }> = {};
      for (const r of history) {
        const key = `${r.toLat.toFixed(4)},${r.toLng.toFixed(4)}`;
        if (!counts[key]) counts[key] = { count: 0, toLat: r.toLat, toLng: r.toLng, toLabel: r.toLabel };
        counts[key].count++;
      }
      const top = Object.values(counts).sort((a, b) => b.count - a.count)[0];
      let fromLat = 45.4215, fromLng = -75.6972;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (loc) { fromLat = loc.coords.latitude; fromLng = loc.coords.longitude; }
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
      const url = `https://routeo-backend.vercel.app/api/plan?fromLat=${fromLat}&fromLng=${fromLng}&fromLabel=My+Location&toLat=${top.toLat}&toLng=${top.toLng}&toLabel=${encodeURIComponent(top.toLabel)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=transit`;
      const r = await fetchWithTimeout(url, { timeout: 15000 });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const itins: PlanItinerary[] = data?.itineraries || [];
      if (itins.length === 0) { setPlanMode(true); return; }
      const fastest = itins.reduce((a, b) => a.duration < b.duration ? a : b);
      setGoNearbyTip(computeNearbyTip(top.toLat, top.toLng, fastest.endTime, language));
      setGoItinerary(fastest);
    } catch (e) {
      if (__DEV__) console.warn('justGo failed', e);
      setPlanMode(true);
    } finally {
      setJustGoLoading(false);
    }
  }, [language]);

  const hasSheet = selectedBus || selectedVenue || selectedSavedPin || searchedPlace;

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
        {/* Heat zone circles — visible when Deals layer is active and zoomed to neighbourhood level */}
        {mapReady && Circle && !zoomTooFar && activeLayers.deals && heatZones.map(zone => (
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

          {/* Saved pin markers */}
          {hasSaved && savedPins.map((pin) => {
            if (!validCoord(pin.lat, pin.lng)) return null;
            const pinIcon: keyof typeof Ionicons.glyphMap = pin.kind === 'stop' ? 'bus' : pin.kind === 'place' ? 'location' : pin.kind === 'route_from' ? 'navigate' : 'flag';
            const pinColor = pin.kind === 'stop' ? '#e74c3c' : pin.kind === 'place' ? '#e8a020' : pin.kind === 'route_from' ? '#22c55e' : '#3498db';
            const kindLabel = pin.kind === 'stop' ? t('Stop', 'Arr\u00eat') : pin.kind === 'place' ? t('Place', 'Lieu') : pin.kind === 'route_from' ? t('Origin', 'Origine') : t('Destination', 'Destination');
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
                onPress={() => openSheet(undefined, v)}
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
              setSelectedBus(null); setSelectedVenue(null); setSelectedSavedPin(null); setSelectedRouteShape([]);
              Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
            }}
          />
        )}

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
              strokeColor={selectedBus?.agency === 'STO' ? '#00C07A' : '#CE1126'}
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
        {/* Search / Plan bar */}
        <View style={{ zIndex: 10 }}>
          {!planMode ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 26, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, height: 48 }}>
                  <Ionicons name="search-outline" size={18} color={colours.muted} />
                  <TextInput
                    style={{ flex: 1, marginLeft: 8, fontSize: 15, color: colours.text, padding: 0 }}
                    placeholder={t('Search anywhere...', 'Rechercher partout...')}
                    placeholderTextColor={colours.muted}
                    accessibilityLabel={t('Search places on map', 'Rechercher des lieux sur la carte')}
                    accessibilityRole="search"
                    value={searchText}
                    onChangeText={(text) => {
                      setSearchText(text);
                      if (searchTimer.current) clearTimeout(searchTimer.current);
                      if (text.length >= 3) { searchTimer.current = setTimeout(() => searchPlaces(text), 300); }
                      else { setPlaceSuggestions([]); }
                    }}
                    returnKeyType="search"
                  />
                  {searchText.length > 0 && (
                    <TouchableOpacity activeOpacity={0.7} onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={18} color={colours.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                {/* Plan Trip button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setPlanMode(true)}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#00C07A', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Plan a trip', 'Planifier un trajet')}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                </TouchableOpacity>
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
              {lastUpdated ? <Text style={{ fontSize: 9, color: colours.muted, textAlign: 'right', marginTop: 3 }}>{t('Updated', 'Mis \u00e0 jour')} {lastUpdated}</Text> : null}
              {/* Suggestion chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleJustGo}
                  disabled={justGoLoading}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#00C07A' }}>
                  {justGoLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="flash" size={13} color="#fff" />}
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>{t('Just Go', 'Partir maintenant')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setPlanMode(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}>
                  <Ionicons name="radio-button-on-outline" size={13} color='#00C07A' />
                  <Text style={{ fontSize: 12, color: colours.text, fontWeight: '600' }}>{t('What can I reach in 20 min?', 'Ce que je peux atteindre en 20 min?')}</Text>
                </TouchableOpacity>
              </ScrollView>
              {placeSuggestions.length > 0 && (
                <View style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginTop: 4, overflow: 'hidden' }}>
                  {placeSuggestions.map((s, i) => (
                    <TouchableOpacity key={s.placeId} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}
                      onPress={() => selectPlace(s)}>
                      <Ionicons name={s.stopId ? 'bus-outline' : 'location-outline'} size={16} color={s.stopId ? '#CE1126' : colours.accent} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colours.text }} numberOfLines={1}>{s.name}</Text>
                        <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{s.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {/* Plan mode — From / To inline */}
              <View style={{ backgroundColor: colours.surface, borderRadius: 20, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
                {/* From row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                  <TouchableOpacity onPress={() => { setPlanMode(false); setPlanToText(''); setPlanToSuggestions([]); setPlanToPlace(null); setPlanResultsVisible(false); setPlanItineraries([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="arrow-back" size={20} color={colours.text} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 11, color: colours.muted }}>{t('From', 'De')}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text }}>{t('My Location', 'Ma position')}</Text>
                  </View>
                  <Ionicons name="locate" size={15} color={colours.accent} />
                </View>
                {/* To row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 }}>
                  <Ionicons name="location-outline" size={18} color='#00C07A' />
                  <TextInput
                    style={{ flex: 1, marginLeft: 10, fontSize: 14, color: colours.text, paddingVertical: 6 }}
                    placeholder={t('Where to?', 'O\u00f9 aller?')}
                    placeholderTextColor={colours.muted}
                    value={planToText}
                    autoFocus
                    onChangeText={(text) => {
                      setPlanToText(text);
                      setPlanToPlace(null);
                      if (planToTimer.current) clearTimeout(planToTimer.current);
                      if (text.length >= 3) planToTimer.current = setTimeout(() => searchPlanTo(text), 300);
                      else setPlanToSuggestions([]);
                    }}
                    returnKeyType="search"
                  />
                  {planToText.length > 0 && (
                    <TouchableOpacity onPress={() => { setPlanToText(''); setPlanToSuggestions([]); setPlanToPlace(null); }}>
                      <Ionicons name="close-circle" size={18} color={colours.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                {/* Mode buttons + Plan */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, paddingTop: 4, gap: 8 }}>
                  {(['BUS', 'WALK', 'BICYCLE'] as const).map(mode => (
                    <TouchableOpacity key={mode} onPress={() => setPlanTransitMode(mode)}
                      style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: planTransitMode === mode ? '#00C07A' : colours.border, backgroundColor: planTransitMode === mode ? '#00C07A' : colours.surface }}>
                      <Ionicons name={mode === 'BUS' ? 'bus-outline' : mode === 'WALK' ? 'walk-outline' : 'bicycle-outline'} size={15} color={planTransitMode === mode ? '#fff' : colours.muted} />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => executePlan()}
                    disabled={!planToPlace || planLoading}
                    style={{ flex: 1, backgroundColor: (!planToPlace || planLoading) ? colours.border : '#00C07A', borderRadius: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
                    {planLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('Plan', 'Planifier')}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
              {/* Plan To suggestions */}
              {planToSuggestions.length > 0 && (
                <View style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginTop: 4, overflow: 'hidden' }}>
                  {planToSuggestions.map((s, i) => (
                    <TouchableOpacity key={s.placeId} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}
                      onPress={() => selectPlanTo(s)}>
                      <Ionicons name={s.stopId ? 'bus-outline' : 'location-outline'} size={16} color={s.stopId ? '#CE1126' : colours.accent} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colours.text }} numberOfLines={1}>{s.name}</Text>
                        <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{s.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Category pills — hidden in plan mode */}
        {!planMode && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {([
            { key: 'all', label_en: 'All', label_fr: 'Tous', icon: 'apps-outline' as const, color: colours.accent },
            { key: 'bus', label_en: 'Bus', label_fr: 'Bus', icon: 'bus-outline' as const, color: '#CE1126' },
            { key: 'gyms', label_en: 'Gyms', label_fr: 'Gyms', icon: 'barbell-outline' as const, color: '#2ECC71' },
            { key: 'grocery', label_en: 'Grocery', label_fr: 'Epicerie', icon: 'cart-outline' as const, color: '#3498db' },
            { key: 'saved', label_en: 'Saved', label_fr: 'Favoris', icon: 'heart' as const, color: '#e74c3c' },
          ] as const).map(f => {
            const active = filters.has(f.key);
            const bg = active ? f.color : colours.surface;
            const border = active ? f.color : colours.border;
            return (
              <TouchableOpacity key={f.key}
                activeOpacity={0.7}
                style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => toggleFilter(f.key)}
                accessibilityRole="button"
                accessibilityLabel={t(`Filter by ${f.label_en}`, `Filtrer par ${f.label_fr}`)}
                accessibilityState={{ selected: active }}>
                <Ionicons name={f.icon} size={16} color={active ? 'white' : colours.muted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>}

        {/* Layer toggle chips — inline below category pills */}
        {!planMode && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
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
                  }, isActive
                    ? { backgroundColor: config.color, borderColor: config.color }
                    : { backgroundColor: colours.surface, borderColor: colours.border }
                  ]}
                  onPress={() => toggleLayer(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
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
        )}

        {error && !planMode ? <Text style={{ fontSize: 11, color: isLight ? '#DC2626' : '#F87171', marginTop: 6 }}>{error}</Text> : null}
      </View>

      {/* Floating action buttons */}
      <View style={{ position: 'absolute', bottom: hasSheet ? 300 : tappedLocation ? 160 : Platform.OS === 'ios' ? 24 : 16, right: 16, gap: 10, alignItems: 'center' }}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: '#7b5ea7', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 }, elevation: 4,
          }}
          onPress={() => { setContributeVisible(true); setContribSent(false); setContribError(null); setContribName(''); setContribType(''); setContribInfo(''); setContribAddress(''); setContribPhoto(null); }}
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
                <Ionicons name="checkmark-circle" size={48} color="#00C07A" />
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
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, marginBottom: 12 }}
                  placeholder={t('e.g. 575 Bank St', 'ex. 575 rue Bank')}
                  placeholderTextColor={colours.muted}
                  value={contribAddress}
                  onChangeText={setContribAddress}
                />

                {/* Photo picker */}
                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 4 }}>{t('Photo', 'Photo')} ({t('optional', 'optionnel')})</Text>
                {contribPhoto ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Image source={{ uri: contribPhoto }} style={{ width: 60, height: 60, borderRadius: 10 }} />
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setContribPhoto(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={22} color={colours.muted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') { Alert.alert(t('Camera access needed', 'Acces camera requis')); return; }
                        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
                        if (!result.canceled && result.assets[0]?.base64) setContribPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
                      <Ionicons name="camera-outline" size={16} color={colours.text} />
                      <Text style={{ fontSize: 13, color: colours.text }}>{t('Camera', 'Camera')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') { Alert.alert(t('Photo library access needed', 'Acces photos requis')); return; }
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
                        if (!result.canceled && result.assets[0]?.base64) setContribPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
                      <Ionicons name="image-outline" size={16} color={colours.text} />
                      <Text style={{ fontSize: 13, color: colours.text }}>{t('Gallery', 'Galerie')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {contribError && (
                  <Text style={{ fontSize: 13, color: '#e94560', marginBottom: 8 }}>{contribError}</Text>
                )}

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setContributeVisible(false)}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={!contribName.trim() || !contribType.trim() || !contribInfo.trim() || contribSending}
                    onPress={async () => {
                      if (!contribName.trim() || !contribType.trim() || !contribInfo.trim()) return;
                      setContribSending(true);
                      setContribError(null);
                      try {
                        const deviceId = await getDeviceId();
                        const photoBase64 = contribPhoto ? contribPhoto.replace(/^data:image\/\w+;base64,/, '') : null;
                        const description = `[${contribType}] ${contribInfo.trim()}${contribAddress.trim() ? ` | ${contribAddress.trim()}` : ''}`;
                        const r = await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=deal.submit', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            venue_name: contribName.trim(),
                            deal_description: description,
                            neighbourhood_id: 'ottawa',
                            device_id: deviceId,
                            day_of_week: new Date().getDay(),
                            ...(photoBase64 ? { photo_base64: photoBase64 } : {}),
                          }),
                          timeout: 30000,
                        });
                        if (!r.ok) {
                          const err = await r.json().catch(() => ({ error: 'Unknown error' }));
                          if (r.status === 429) {
                            setContribError(t('Please wait before submitting again', 'Veuillez patienter avant de soumettre a nouveau'));
                          } else {
                            setContribError(err.error || t('Submission failed', 'Echec de la soumission'));
                          }
                        } else {
                          const data = await r.json();
                          if (data.status === 'rejected') {
                            setContribError(t('This deal was not approved — please check the content and try again', 'Cette offre n\'a pas ete approuvee — verifiez le contenu et reessayez'));
                          } else {
                            setContribSent(true);
                          }
                        }
                      } catch (e) {
                        if (__DEV__) console.warn('contribute submit failed:', e);
                        setContribError(t('Deal submission failed — check your connection', 'Echec de la soumission — verifiez votre connexion'));
                      }
                      setContribSending(false);
                    }}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: contribName.trim() && contribType.trim() && contribInfo.trim() && !contribSending ? '#7b5ea7' : colours.border,
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
            const sheetIconBorder = busIsSTO ? '#00C07A' : undefined;
            const sheetIconText = busIsSTO ? '#00C07A' : '#ffffff';
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
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: busIsSTO ? '#00C07A' : '#CE1126', width: `${Math.min(100, selectedBus.progress ?? 0)}%` as `${number}%` }} />
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
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.live }} />
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{agencyLabel}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setTrackingBus(selectedBus); }}
                  style={{ backgroundColor: busIsSTO ? '#00C07A' : '#CE1126', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 }}
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
          {searchedPlace && !selectedBus && !selectedVenue && !selectedSavedPin && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: (searchedPlace.stopId ? '#CE1126' : colours.accentAlt) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (searchedPlace.stopId ? '#CE1126' : colours.accentAlt) + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: searchedPlace.stopId ? '#CE1126' : colours.accentAlt }}>
                        {searchedPlace.stopId ? t('Stop', 'Arr\u00eat') : t('Place', 'Lieu')}
                      </Text>
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
              {searchedPlace.stopId && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    addToBoardIfMissing({ type: 'bus_stop', id: searchedPlace.stopId!, name: searchedPlace.name });
                    hapticLight();
                  }}
                  style={{ marginTop: 14, backgroundColor: '#00C07A', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Save to My Favourites', 'Ajouter a Mes favoris')}>
                  <Ionicons name="bookmark-outline" size={16} color="white" />
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                    {t('Save to My Favourites', 'Ajouter a Mes favoris')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setPlanMode(true);
                  setPlanToText(searchedPlace.name);
                  setPlanToPlace({ name: searchedPlace.name, lat: searchedPlace.lat, lng: searchedPlace.lng });
                  Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
                    setSelectedBus(null); setSelectedVenue(null); setSelectedSavedPin(null); setSearchedPlace(null); setSearchText('');
                  });
                }}
                style={{ marginTop: searchedPlace.stopId ? 8 : 14, backgroundColor: '#3498db', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('Route here', 'M\'y rendre')}>
                <Ionicons name="navigate" size={16} color="white" />
                <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>
                  {t('Route here', 'M\'y rendre')} \u2192
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
                    <View style={{ backgroundColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : '#22c55e') + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : '#22c55e') + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : '#22c55e' }}>
                        {selectedSavedPin.kind === 'stop' ? t('Saved Stop', 'Arret favori') : selectedSavedPin.kind === 'place' ? t('Saved Place', 'Lieu favori') : t('Saved Route', 'Trajet favori')}
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
                style={{ marginTop: 14, backgroundColor: selectedSavedPin.kind === 'stop' ? '#e74c3c' : selectedSavedPin.kind === 'place' ? '#e8a020' : '#22c55e', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
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
              setPlanMode(true);
              setPlanToText(pin.name);
              setPlanToPlace({ name: pin.name, lat: pin.lat, lng: pin.lng });
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
        expandedStopId={expandedStopId}
        onExpandStop={handleExpandStop}
        expandedArrivals={expandedArrivals}
        expandedArrivalsLoading={expandedArrivalsLoading}
        activeAlertCount={sheetAlerts.length}
        hasDisruption={sheetAlerts.some((a: any) => a.category === 'lrt' || (a.title || '').toLowerCase().includes('o-train'))}
        communityDeals={sheetDeals}
        activeLayers={activeLayers}
        layerPins={layerPins}
        onToggleLayer={toggleLayer}
        loadingLayers={loadingLayers}
        onRouteToPin={(pin: MapPin) => {
          setPlanMode(true);
          setPlanToText(pin.name);
          setPlanToPlace({ name: pin.name, lat: pin.lat, lng: pin.lng });
        }}
        happeningNow={happeningNow}
        onSubmitDeal={() => {
          router.push('/(tabs)/discover' as any);
        }}
        safetySignalStopIds={safetySignalStopIds}
        venueAlerts={planNearbyVenue ? [planNearbyVenue] : undefined}
        extraSections={
          <>
            <TonightCard
              colours={colours}
              fonts={fonts}
              cardShadow={{}}
              sensGame={null}
              events={tonightEvents}
              weather={tonightWeather}
            />
            <ServicesGrid
              colours={colours}
              fonts={fonts}
              t={t}
              language={language}
              activeTab={servicesTab}
              onTabChange={setServicesTab}
              cardShadow={{}}
              onTileTap={(tile: ServiceTile) => {
                if (tile.action === 'navigate' && tile.target) {
                  router.push(tile.target as any);
                } else if (tile.action === 'alert') {
                  router.push('/(tabs)/alerts' as any);
                }
              }}
            />
          </>
        }
      />

      {/* Trip plan results bottom sheet */}
      <Modal visible={planResultsVisible} animationType="slide" transparent onRequestClose={() => setPlanResultsVisible(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colours.text }}>{t('Trip Options', 'Options de trajet')}</Text>
              <TouchableOpacity onPress={() => setPlanResultsVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colours.muted} />
              </TouchableOpacity>
            </View>

            {/* Weather context + minimize walking toggle */}
            {planWeather && (planWeather.precipitation || planWeather.windKmh > 30) && (
              <View style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={planWeather.precipitation ? 'rainy-outline' : 'warning-outline'} size={14} color={colours.muted} />
                  <Text style={{ fontSize: 12, color: colours.muted }}>
                    {planWeather.precipitation
                      ? t('Rain expected', 'Pluie prevue')
                      : t(`Strong wind ${Math.round(planWeather.windKmh)} km/h`, `Vent fort ${Math.round(planWeather.windKmh)} km/h`)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setMinimizeWalking(prev => !prev); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: minimizeWalking ? '#00C07A' : colours.border, backgroundColor: minimizeWalking ? '#00C07A18' : 'transparent' }}
                >
                  <Ionicons name="walk-outline" size={13} color={minimizeWalking ? '#00C07A' : colours.muted} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: minimizeWalking ? '#00C07A' : colours.muted }}>
                    {t('Less walking', 'Moins de marche')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Venue alert — event ending near destination */}
            {planNearbyVenue && (
              <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F9731615', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#F9731640' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="ticket-outline" size={13} color="#F97316" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#F97316' }}>
                    {planNearbyVenue.minutesUntilEnd > 0
                      ? t(`${planNearbyVenue.venueName} ends in ${planNearbyVenue.minutesUntilEnd} min`, `${planNearbyVenue.venueName} se termine dans ${planNearbyVenue.minutesUntilEnd} min`)
                      : t(`${planNearbyVenue.venueName} recently ended`, `${planNearbyVenue.venueName} vient de se terminer`)}
                  </Text>
                </View>
                {planNearbyVenue.routeIds.length > 0 && (
                  <Text style={{ fontSize: 11, color: '#F97316', marginTop: 2 }}>
                    {t(`Expect crowds on Routes ${planNearbyVenue.routeIds.join(', ')}`, `Prevoyez des foules sur les routes ${planNearbyVenue.routeIds.join(', ')}`)}
                  </Text>
                )}
              </View>
            )}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
              {planItineraries.length === 0 ? (
                <Text style={{ color: colours.muted, textAlign: 'center', paddingVertical: 32 }}>{t('No routes found', 'Aucun itin\u00e9raire trouv\u00e9')}</Text>
              ) : (() => {
                const isWalkOnly = planItineraries.every(it => it.legs.every(l => l.mode === 'WALK'));
                if (isWalkOnly) {
                  return (
                    <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
                      <Ionicons name="walk-outline" size={36} color={colours.muted} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, textAlign: 'center' }}>
                        {t('Transit routing unavailable right now', 'Itin\u00e9raire en transport non disponible')}
                      </Text>
                      <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>
                        {t('Showing walking directions only', 'Affichage des directions \u00e0 pied seulement')}
                      </Text>
                      <TouchableOpacity
                        onPress={() => { setPlanResultsVisible(false); executePlan(); }}
                        style={{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 10, backgroundColor: colours.accent, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('Try again', 'R\u00e9essayer')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return planItineraries.map((itin, idx) => {
                  const isMinimizeWalkingResult = minimizeWalking;
                  const primaryRoute = itin.legs.find(l => l.mode !== 'WALK' && l.routeShortName)?.routeShortName ?? null;
                  const onTimePct = primaryRoute != null ? planReliability[primaryRoute] : undefined;
                  const relBadge = onTimePct === undefined ? null
                    : onTimePct >= 85 ? { text: t('Usually on time', 'G\u00e9n\u00e9ralement \u00e0 l\'heure'), color: '#16a34a', bg: '#dcfce7' }
                    : onTimePct >= 70 ? { text: t('Sometimes delayed', 'Parfois en retard'), color: '#b45309', bg: '#fef3c7' }
                    : { text: t('Often delayed', 'Souvent en retard'), color: '#dc2626', bg: '#fee2e2' };
                  const hasSTO = itin.legs.some(l => l.agencyId?.toLowerCase().includes('sto'));
                  const hasOC = itin.legs.some(l => l.mode !== 'WALK' && (!l.agencyId || !l.agencyId.toLowerCase().includes('sto')));
                  const isCrossBorder = hasSTO && hasOC;
                  // Tight transfer warnings for this specific itinerary
                  const itinTransferWarnings = transferWarnings.filter(w => w.itinIdx === idx);
                  const walkOnlyLabel = isMinimizeWalkingResult && idx === planItineraries.length - 1
                    ? t('Less walking', 'Moins de marche')
                    : idx === 0 ? t('Fastest', 'Le plus rapide') : null;

                  return (
                    <View key={idx} style={{ backgroundColor: colours.surface, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colours.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: relBadge || isCrossBorder ? 6 : 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text }}>{fmtPlanDuration(itin.duration)}</Text>
                          {walkOnlyLabel && (
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#00C07A18' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#00C07A' }}>{walkOnlyLabel}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, color: colours.muted }}>{fmtPlanTime(itin.startTime)} \u2192 {fmtPlanTime(itin.endTime)}</Text>
                      </View>
                      {(relBadge || isCrossBorder) && (
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {relBadge && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: relBadge.bg }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: relBadge.color }}>{relBadge.text}</Text>
                            </View>
                          )}
                          {isCrossBorder && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colours.tintBg ?? colours.surface, borderWidth: 1, borderColor: colours.border }}>
                              <Text style={{ fontSize: 11, color: colours.muted }}>{t('Crosses into Gatineau \u00b7 different fare', 'Traverse en Outaouais \u00b7 tarif diff\u00e9rent')}</Text>
                            </View>
                          )}
                        </View>
                      )}
                      {/* Tight transfer warning */}
                      {itinTransferWarnings.map((w, wi) => (
                        <View key={wi} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, backgroundColor: '#F59E0B18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Ionicons name="warning-outline" size={12} color="#D97706" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>
                            {t(`Tight transfer — ${w.bufferMins} min buffer on Route ${w.incomingRoute}`, `Correspondance serree — ${w.bufferMins} min sur la route ${w.incomingRoute}`)}
                          </Text>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {itin.legs.map((leg, i) => {
                          const platform = (leg.mode === 'BUS' || leg.mode === 'TRAM' || leg.mode === 'RAIL') && leg.routeShortName && hasPlatformData(leg.from.name)
                            ? getPlatformForRoute(leg.from.name, leg.routeShortName)
                            : null;
                          return (
                            <View key={i} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: (LEG_PLAN_COLORS[leg.mode] || '#888') + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                                <Ionicons name={(LEG_PLAN_ICONS[leg.mode] || 'navigate') as any} size={12} color={LEG_PLAN_COLORS[leg.mode] || '#888'} />
                                {leg.routeShortName ? <Text style={{ fontSize: 11, fontWeight: '700', color: LEG_PLAN_COLORS[leg.mode] || '#888' }}>{leg.routeShortName}</Text> : null}
                              </View>
                              {platform && (
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#00C07A', paddingHorizontal: 4 }}>
                                  {t(`Platform ${platform}`, `Quai ${platform}`)}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        onPress={() => { setPlanResultsVisible(false); setGoNearbyTip(computeNearbyTip(planToPlace?.lat ?? 0, planToPlace?.lng ?? 0, itin.endTime, language)); setGoItinerary(itin); }}
                        style={{ backgroundColor: '#00C07A', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 }}>{t('GO', 'PARTIR')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GO mode overlay */}
      {goItinerary && (
        <ActiveTrip
          visible={!!goItinerary}
          itinerary={goItinerary as any}
          nearbyTip={goNearbyTip}
          onEnd={() => {
            if (goItinerary && planToPlace) {
              saveTripToHistory(goItinerary, planToPlace);
            }
            setGoItinerary(null); setGoNearbyTip(null); setPlanResultsVisible(false); setPlanMode(false); setPlanToText(''); setPlanToPlace(null);
          }}
          colours={colours}
          t={t}
          alerts={sheetAlerts.map((a: any) => ({ routes: a.routes || [], title: a.title || '' }))}
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
