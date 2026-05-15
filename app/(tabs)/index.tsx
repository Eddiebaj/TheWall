import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, AppState, FlatList, Image, ImageBackground, Keyboard,
    KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StatusBar,
    StyleSheet, Text, TextInput, TouchableOpacity,
    TouchableWithoutFeedback, View, useWindowDimensions
} from 'react-native';
import { ArrivalRowSkeleton } from '../../components/Shimmer';
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { supabase } from '../../lib/supabase';
import stopMap from './stopmap.json';
import stopNameMap from './stopnamemap.json';
import stopsearch from './stopsearch.json';
import tripMap from './tripmap.json';
let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker'); } catch {}
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
// DraggableFlatList disabled for beta - using plain FlatList to fix touch blocking
// import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
const ScaleDecorator = ({ children }: { children: React.ReactNode }) => <>{children}</>;

type SavedPlace = { id: string; name: string; vicinity: string; rating?: number; photoRef?: string; categoryIcon: string; categoryColor: string; categoryLabel_en: string; categoryLabel_fr: string; lat?: number; lng?: number };
// ── Universal saved board item type ──
type SavedBoardItem =
  | { type: 'bus_stop';      id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'lrt_station';   id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'otrain' }
  | { type: 'services' }
  | { type: 'discover' }
  | { type: 'external_link'; id: string; label_en: string; label_fr: string; icon: string; accent: string; url: string }
  | { type: 'campus' }
  | { type: 'neighbourhood'; id: string; name_en: string; name_fr: string };

import { CAMPUSES, CampusConfig, fmt12h, getDayLabel, getNextDeparture, isLibraryOpen } from '../../lib/campusData';
import { ClassSchedule, nextClass, fmt12h as schedFmt12h } from '../../lib/scheduleData';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { HAPPY_HOUR_VENUES } from '../../lib/happyHourData';
import {
    OC_TRANSPO_API_KEY,
    TICKETMASTER_API_KEY
} from '../../lib/keys';
import { configureNotificationHandler, getDeviceId, registerPushToken } from '../../lib/pushNotifications';
import {
    SK_CACHE_WEATHER,
    SK_CAMPUS,
    SK_FAVS,
    SK_GHOST_REPORTS,
    SK_NOTIF_SETTINGS,
    SK_OTTAWA_LIFE,
    SK_QUICK_ACTIONS,
    SK_SAVED_BOARD,
    SK_SAVED_PLACES,
    SK_SAVED_ROUTES,
    SK_SAVED_VENUES,
    SK_SECTION_ORDER,
    SK_SEEN_ALERT_IDS, SK_TIME_FORMAT,
    SK_TODAY_EVENTS,
    SK_DISMISSED_ALERT_IDS,
} from '../../lib/storageKeys';
// neighbourhoodData import removed - discover section moved to dedicated tab
// NewsArticle import removed - news lives in dedicated News tab
import { haversineKm } from '../../lib/geo';
import { getDelayContext } from '../../lib/delayContext';
import { SK_CROWDING_CACHE, SK_FREQUENT_ARRIVALS_CACHE, SK_FREQUENT_CARD_DISMISSED, SK_LAST_CROWDING_REPORT, SK_TRIP_HISTORY, SK_TRIP_SHARING, SK_CLASS_SCHEDULE } from '../../lib/storageKeys';
// NewsSection removed from home - news lives in Account tab modal
// NeighbourhoodSection removed - inlined for scroll reliability
// NeighbourhoodSheet removed - discover section moved to dedicated tab
import ServicesGrid, { ServiceTile } from '../../components/ServicesGrid';
import TonightCard from '../../components/TonightCard';
import WeatherModal from '../../components/WeatherModal';
import MyStopsSection from '../../components/MyBoard/MyStopsSection';
import YourSpotsSection from '../../components/MyBoard/YourSpotsSection';
import TonightSection from '../../components/MyBoard/TonightSection';
import AroundOttawaSection from '../../components/MyBoard/AroundOttawaSection';
import SocialModal from '../../components/SocialModal';
import EventsModal from '../../components/EventsModal';
import AlertsModal from '../../components/AlertsModal';
import StopReportModal from '../../components/StopReportModal';
import BoardExpandModal from '../../components/BoardExpandModal';
import CampusModal from '../../components/CampusModal';
import SavedPlaceCard from '../../components/SavedPlaceCard';

const TRIP_UPDATES = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';
const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const ALERTS_URL = 'https://routeo-backend.vercel.app/api/alerts';
const EC_WEATHER_URL = 'https://dd.weather.gc.ca/today/citypage_weather/ON/';
const COMMUNITY_URL = 'https://routeo-backend.vercel.app/api/community';

const LRT_STOP_IDS = new Set([
  'NA998','NA999','NA995','NA990','NA996','NA997',
  'CJ995','CJ990','CA995','CA990','CB995','CB990',
  'CD995','CD999','CD998','CD990','CE995','CE990',
  'AF995','AF990','AE995','AE990','EB995','EB990',
  'EC995','EC990','EE995','EE990',
  'RR990','RR991','RE994','RE995','RE990','RE991',
  'RE992','RE996','RE997','RF990','RF995','RF996',
  'RC990','RA990','CG995','CG990','NB990','NB995','NB996',
  '9942','9943','9944','9945','9946','9947','9948',
  '10027','10028','9870','9871','9957','9958',
  '9928','9929','9822','9868','9833','9869','10004','10734',
  '10735','10736','10042','10043','9951','9952','9953','9954','9955',
  '10728','10729','10014','10015','10016','10017',
  '9872','9873','9961','9963','9922','10144','10149','10743','10744',
]);

const LRT_EAST = [
  { id: 'NA998', name: "Tunney's Pasture" }, { id: 'NA995', name: 'Bayview' },
  { id: 'CJ995', name: 'Pimisi' }, { id: 'CA995', name: 'Lyon' },
  { id: 'CB995', name: 'Parliament' }, { id: 'CD995', name: 'Rideau' },
  { id: 'CD999', name: 'uOttawa' }, { id: 'CE995', name: 'Lees' },
  { id: 'AF995', name: 'Hurdman' }, { id: 'AE995', name: 'Tremblay' },
  { id: 'EB995', name: 'St-Laurent' }, { id: 'EC995', name: 'Cyrville' },
  { id: 'EE995', name: 'Blair' },
];
const LRT_WEST = [
  { id: 'EE990', name: 'Blair' }, { id: 'EC990', name: 'Cyrville' },
  { id: 'EB990', name: 'St-Laurent' }, { id: 'AE990', name: 'Tremblay' },
  { id: 'AF990', name: 'Hurdman' }, { id: 'CE990', name: 'Lees' },
  { id: 'CD998', name: 'uOttawa' }, { id: 'CD990', name: 'Rideau' },
  { id: 'CB990', name: 'Parliament' }, { id: 'CA990', name: 'Lyon' },
  { id: 'CJ990', name: 'Pimisi' }, { id: 'NA990', name: 'Bayview' },
  { id: 'NA999', name: "Tunney's Pasture" },
];
const LRT2_NORTH = [
  { id: 'RR990', name: 'Limebank' }, { id: 'RE994', name: 'Leitrim' },
  { id: 'RE990', name: 'Uplands' }, { id: 'RE992', name: 'Airport' },
  { id: 'RE996', name: 'Bowesville' }, { id: 'RF990', name: 'Greenboro' },
  { id: 'RF995', name: 'South Keys' }, { id: 'RC990', name: 'Walkley' },
  { id: 'RA990', name: "Mooney's Bay" }, { id: 'CG995', name: 'Carleton' },
  { id: 'NB990', name: "Dow's Lake" }, { id: 'NB995', name: 'Corso Italia' },
  { id: 'NA996', name: 'Bayview' },
];
const LRT2_SOUTH = [
  { id: 'NA996', name: 'Bayview' }, { id: 'NB996', name: 'Corso Italia' },
  { id: 'NB990', name: "Dow's Lake" }, { id: 'CG990', name: 'Carleton' },
  { id: 'RA990', name: "Mooney's Bay" }, { id: 'RC990', name: 'Walkley' },
  { id: 'RF996', name: 'South Keys' }, { id: 'RF990', name: 'Greenboro' },
  { id: 'RE997', name: 'Bowesville' }, { id: 'RE992', name: 'Airport' },
  { id: 'RE991', name: 'Uplands' }, { id: 'RE995', name: 'Leitrim' },
  { id: 'RR990', name: 'Limebank' },
];

const MULTI_PLATFORM_STOPS: { [key: string]: string[] } = {
  '9942': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9943': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9944': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9945': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9946': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9947': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '9948': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  'NA998': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  'NA999': ['9942','9943','9944','9945','9946','9947','9948','NA998','NA999'],
  '10027': ['10027','10028','NA990','NA995','NA996','NA997'],
  '10028': ['10027','10028','NA990','NA995','NA996','NA997'],
  'NA990': ['10027','10028','NA990','NA995','NA996','NA997'],
  'NA995': ['10027','10028','NA990','NA995','NA996','NA997'],
  'NA996': ['10027','10028','NA990','NA995','NA996','NA997'],
  'NA997': ['10027','10028','NA990','NA995','NA996','NA997'],
  '9870': ['9870','9871','9957','9958','CJ990','CJ995'],
  '9871': ['9870','9871','9957','9958','CJ990','CJ995'],
  '9957': ['9870','9871','9957','9958','CJ990','CJ995'],
  '9958': ['9870','9871','9957','9958','CJ990','CJ995'],
  'CJ990': ['9870','9871','9957','9958','CJ990','CJ995'],
  'CJ995': ['9870','9871','9957','9958','CJ990','CJ995'],
  '9928': ['9928','9929','CA990','CA995'],
  '9929': ['9928','9929','CA990','CA995'],
  'CA990': ['9928','9929','CA990','CA995'],
  'CA995': ['9928','9929','CA990','CA995'],
  '9822': ['9822','9868','CB990','CB995'],
  '9868': ['9822','9868','CB990','CB995'],
  'CB990': ['9822','9868','CB990','CB995'],
  'CB995': ['9822','9868','CB990','CB995'],
  '9833': ['9833','9869','10004','10734','CD990','CD995'],
  '9869': ['9833','9869','10004','10734','CD990','CD995'],
  '10004': ['9833','9869','10004','10734','CD990','CD995'],
  '10734': ['9833','9869','10004','10734','CD990','CD995'],
  'CD990': ['9833','9869','10004','10734','CD990','CD995'],
  'CD995': ['9833','9869','10004','10734','CD990','CD995'],
  '10735': ['10735','10736','CD998','CD999'],
  '10736': ['10735','10736','CD998','CD999'],
  'CD998': ['10735','10736','CD998','CD999'],
  'CD999': ['10735','10736','CD998','CD999'],
  '10042': ['10042','10043','CE990','CE995'],
  '10043': ['10042','10043','CE990','CE995'],
  'CE990': ['10042','10043','CE990','CE995'],
  'CE995': ['10042','10043','CE990','CE995'],
  '9951': ['9951','9952','9953','9954','9955','AF990','AF995'],
  '9952': ['9951','9952','9953','9954','9955','AF990','AF995'],
  '9953': ['9951','9952','9953','9954','9955','AF990','AF995'],
  '9954': ['9951','9952','9953','9954','9955','AF990','AF995'],
  '9955': ['9951','9952','9953','9954','9955','AF990','AF995'],
  'AF990': ['9951','9952','9953','9954','9955','AF990','AF995'],
  'AF995': ['9951','9952','9953','9954','9955','AF990','AF995'],
  '10728': ['10728','10729','AE990','AE995'],
  '10729': ['10728','10729','AE990','AE995'],
  'AE990': ['10728','10729','AE990','AE995'],
  'AE995': ['10728','10729','AE990','AE995'],
  '10014': ['10014','10015','10016','10017','EB990','EB995'],
  '10015': ['10014','10015','10016','10017','EB990','EB995'],
  '10016': ['10014','10015','10016','10017','EB990','EB995'],
  '10017': ['10014','10015','10016','10017','EB990','EB995'],
  'EB990': ['10014','10015','10016','10017','EB990','EB995'],
  'EB995': ['10014','10015','10016','10017','EB990','EB995'],
  '10743': ['10743','10744','EC990','EC995'],
  '10744': ['10743','10744','EC990','EC995'],
  'EC990': ['10743','10744','EC990','EC995'],
  'EC995': ['10743','10744','EC990','EC995'],
  '9872': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '9873': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '9922': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '9961': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '9963': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '10144': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  '10149': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  'EE990': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
  'EE995': ['9872','9873','9922','9961','9963','10144','10149','EE990','EE995'],
};

const ALL_QUICK_ACTIONS = [
  { id: 'live',    label_en: 'Live\nBuses',    label_fr: 'Bus\nen direct',     icon: 'bus',           accent: '#00A78D' },
  { id: 'plan',    label_en: 'Plan\nTrip',     label_fr: 'Planifier\ntrajet',  icon: 'map',           accent: '#004890' },
  { id: 'safety',  label_en: 'Safety\nMode',   label_fr: 'Mode\nsécurité',     icon: 'shield',        accent: '#00A78D' },
  { id: 'alerts',  label_en: 'Service\nAlerts',label_fr: 'Alertes\nservice',   icon: 'notifications', accent: '#e8a020' },
  { id: 'search',  label_en: 'Stop\nSearch',   label_fr: 'Chercher\narrêt',    icon: 'search',        accent: '#004890' },
  { id: 'nearby',  label_en: 'Explore\nNearby',label_fr: 'Explorer',           icon: 'compass',       accent: '#7b5ea7' },
  { id: 'saved',   label_en: 'My\nSaved',      label_fr: 'Mes\nsauvegardes',   icon: 'bookmark',      accent: '#c0852a' },
];

const DEFAULT_QUICK_ACTION_IDS = ['live'];

const ALL_OTTAWA_LIFE = [
  { id: 'restaurant', label_en: 'Eats',     label_fr: 'Restos',      icon: 'restaurant', accent: '#cc3b2a' },
  { id: 'cafe',       label_en: 'Coffee',   label_fr: 'Café',        icon: 'cafe',        accent: '#c0852a' },
  { id: 'shopping',   label_en: 'Shopping', label_fr: 'Magasins',    icon: 'bag-handle',  accent: '#004890' },
  { id: 'events',     label_en: 'Events',   label_fr: 'Événements',  icon: 'sparkles',    accent: '#7b5ea7' },
  { id: 'gym',        label_en: 'Gyms',     label_fr: 'Gyms',        icon: 'barbell',     accent: '#00A78D' },
  { id: 'supermarket',label_en: 'Grocery',  label_fr: 'Épicerie',    icon: 'cart',        accent: '#004890' },
  { id: 'pharmacy',   label_en: 'Pharmacy', label_fr: 'Pharmacie',   icon: 'medical',     accent: '#7b5ea7' },
  { id: 'hardware_store',label_en:'Hardware',label_fr:'Quincaillerie',icon:'construct',    accent: '#e8a020' },
  { id: 'bank',       label_en: 'Services', label_fr: 'Services',    icon: 'business',    accent: '#6b7f99' },
];

const DEFAULT_OTTAWA_LIFE_IDS = ['restaurant', 'cafe', 'shopping', 'events'];
// 'map' removed from default section order
const DEFAULT_SECTION_ORDER = ['otrain', 'saved', 'services', 'alerts'];

// DISCOVER_CARDS removed - replaced by NEIGHBOURHOODS from lib/neighbourhoodData.ts

const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

type ServiceAlert = { id: number; title: string; description: string; link: string; pubDate: string; routes: string[]; category: string; agency?: 'OC' | 'STO' };
type Arrival = { id: string; routeId: string; headsign: string; minsAway: number; delay: number; secsAway: number; isScheduled?: boolean };
type Fav = { id: string; name: string; icon: string };
type ReportEntry = { count: number; expiresAt: number };
type Reports = { [key: string]: ReportEntry };
type StopResult = { id: string; internalId: string; name: string };

const STOP_MAP: { [key: string]: string } = stopMap;
const TRIP_MAP: { [key: string]: string } = tripMap;
const STOP_NAME_MAP: { [key: string]: string } = stopNameMap;
const STOP_SEARCH: StopResult[] = stopsearch as StopResult[];

const resolveStopId = (publicCode: string) => STOP_MAP[String(parseInt(publicCode))] || publicCode;
const getStopName = (publicCode: string) => STOP_NAME_MAP[resolveStopId(publicCode)] || `Stop #${publicCode}`;
const getHeadsign = (tripId: string) => TRIP_MAP[tripId] || '';

// STO (Gatineau) stops use numeric IDs in the 15000-59999 range
const isStoStop = (id: string): boolean => {
  const num = parseInt(id);
  if (isNaN(num)) return false;
  return num >= 15000 && num <= 59999;
};


const CAMPUS_LOGOS: Record<string, any> = {
  carleton: require('../../assets/schools/carleton.png'),
  uottawa: require('../../assets/schools/uottawa.png'),
  algonquin: require('../../assets/schools/algonquin.png'),
};

// ── Shared time formatter ────────────────────────────────────────
const fmtTime = (date: Date): string => {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
};
const fmtAbsTime = (minsAway: number): string => fmtTime(new Date(Date.now() + minsAway * 60000));

// ── SavedBoardCard component ─────────────────────────────────────
function SavedBoardCard({ item, colours, fonts, t, onPress, drag, isActive, cardShadow, alerts, onMoveLeft, onMoveRight, timeFormat, campusData, events }: {
  item: SavedBoardItem; colours: any; fonts: any; t: any;
  onPress: () => void; drag: () => void; isActive: boolean; cardShadow: any;
  alerts: any[];
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  timeFormat?: 'relative' | 'absolute';
  campusData?: CampusConfig | null;
  events?: { name: string; venue: string; address?: string }[];
}) {
  const boardRouter = useRouter();
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<'gtfs-rt' | 'gtfs-static' | 'sto-gtfs-rt' | null>(null);
  const [lastBusRouteInfo, setLastBusRouteInfo] = useState<{ routeId: string; lastBus: string | null; firstBus: string | null } | null>(null);
  const lastBusFetchedRef = React.useRef<string | null>(null);
  const [neighDealCount, setNeighDealCount] = useState(0);

  useEffect(() => {
    if (item.type !== 'neighbourhood') return;
    (async () => {
      try {
        const { count } = await supabase.from('community_deals').select('*', { count: 'exact', head: true }).eq('approved', true);
        setNeighDealCount(count ?? 0);
      } catch { /* ignore */ }
    })();
  }, [(item as any).id]);

  const boardHour = new Date().getHours();
  const isBoardLateNight = boardHour >= 20 || boardHour < 2;

  useEffect(() => {
    if (!isBoardLateNight || (item.type !== 'bus_stop' && item.type !== 'lrt_station') || previewLoading) return;
    const routeId = preview[0]?.routeId?.split('-')[0];
    if (!routeId || lastBusFetchedRef.current === routeId) return;
    lastBusFetchedRef.current = routeId;
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/route?id=${encodeURIComponent(routeId)}`, { timeout: 8000 })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const dir = (data?.directions || [])[0];
        if (dir) setLastBusRouteInfo({ routeId, lastBus: dir.lastBus || null, firstBus: dir.firstBus || null });
      })
      .catch(() => {});
  }, [isBoardLateNight, preview, previewLoading, item.type]);

  useEffect(() => {
    if (item.type === 'external_link' || item.type === 'otrain' || item.type === 'services' || item.type === 'discover' || item.type === 'campus' || item.type === 'neighbourhood') { setPreviewLoading(false); return; }
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${item.id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!cancelled) {
          setPreview((data.arrivals || []).slice(0, 3).map((a: any) => ({ routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway })));
          setPreviewSource(data.source === 'sto-gtfs-rt' ? 'sto-gtfs-rt' as any : data.source === 'gtfs-rt' ? 'gtfs-rt' : 'gtfs-static');
        }
      } catch { if (!cancelled) setPreview([]); }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [item.type, (item as any).id]);

  // Stop cards grow vertically; non-stop cards use a fixed-height horizontal pill
  const cardBase: any = [{ borderRadius: 14, padding: 14, backgroundColor: isActive ? colours.accent + '22' : colours.surface, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border }, cardShadow];
  const pillBase: any = [{ borderRadius: 14, paddingHorizontal: 16, backgroundColor: isActive ? colours.accent + '22' : colours.surface, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, flexDirection: 'row', alignItems: 'center', height: 64 }, cardShadow];
  const reorderBtns = (onMoveLeft || onMoveRight) ? (
    <View style={{ flexDirection: 'row', gap: 4, marginLeft: 8 }}>
      {onMoveLeft && (
        <Pressable onPress={onMoveLeft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-up" size={12} color={colours.muted} />
        </Pressable>
      )}
      {onMoveRight && (
        <Pressable onPress={onMoveRight} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-down" size={12} color={colours.muted} />
        </Pressable>
      )}
    </View>
  ) : null;



  // ── O-Train card ──
  if (item.type === 'otrain') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={pillBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.lrt + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name="train" size={18} color={colours.lrt} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>O-Train</Text>
          <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{t('Confederation & Trillium Lines', 'Lignes Confédération & Trillium')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colours.muted} style={{ marginRight: 4 }} />
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Services card ──
  if (item.type === 'services') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={pillBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name="grid" size={18} color={colours.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>{t('Ottawa Services', 'Services Ottawa')}</Text>
          <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{t('Explore all city services', 'Explorer tous les services')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colours.muted} style={{ marginRight: 4 }} />
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Discover card ──
  if (item.type === 'discover') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={pillBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#e8a02018', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name="compass" size={18} color="#e8a020" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>{t('Discover Ottawa', 'Découvrir Ottawa')}</Text>
          <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{t('Neighbourhoods & places', 'Quartiers et lieux')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colours.muted} style={{ marginRight: 4 }} />
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Neighbourhood card ──
  if (item.type === 'neighbourhood') {
    const searchWord = item.name_en.toLowerCase().split(' ')[0];
    const neighEventCount = (events || []).filter(ev =>
      (ev.venue || '').toLowerCase().includes(searchWord) ||
      (ev.address || '').toLowerCase().includes(searchWord)
    ).length;
    const hasBadge = neighDealCount > 0 || neighEventCount > 0;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={pillBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#7b5ea718', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name="map" size={18} color="#7b5ea7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={1}>{t(item.name_en, item.name_fr)}</Text>
          <Text style={{ fontSize: 11, color: hasBadge ? '#7b5ea7' : colours.muted, marginTop: 1 }} numberOfLines={1}>
            {hasBadge
              ? [neighDealCount > 0 ? t(`${neighDealCount} deals`, `${neighDealCount} aubaines`) : null, neighEventCount > 0 ? t(`${neighEventCount} events`, `${neighEventCount} évén.`) : null].filter(Boolean).join(' · ')
              : t('Tap to explore', 'Explorer')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colours.muted} style={{ marginRight: 4 }} />
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── External link card (Skip, Uber, Senators, etc.) ──
  if (item.type === 'external_link') {
    const label = t(item.label_en, item.label_fr);
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ borderRadius: 14, paddingHorizontal: 16, backgroundColor: isActive ? item.accent + '22' : colours.surface, borderWidth: 1, borderLeftWidth: 4, borderColor: isActive ? item.accent : colours.border, borderLeftColor: item.accent, flexDirection: 'row', alignItems: 'center', height: 64 }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name={item.icon as any} size={18} color={item.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
            <Ionicons name="open-outline" size={10} color={colours.muted} />
            <Text style={{ fontSize: 11, color: colours.muted }}>{t('Opens externally', 'Ouvre externe')}</Text>
          </View>
        </View>
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Campus card - only visible on weekdays during Sep–Apr ──
  if (item.type === 'campus') {
    const campusMonth = new Date().getMonth(); // 0-indexed
    const campusDow = new Date().getDay();
    const isCampusSeason = campusMonth >= 8 || campusMonth <= 3; // Sep(8)–Apr(3)
    const isCampusWeekday = campusDow >= 1 && campusDow <= 5;
    if (!isCampusSeason || !isCampusWeekday) return null;
    const campus = campusData;
    const accent = campus?.accent || '#004890';
    const nextShuttle = campus?.shuttles?.[0] ? getNextDeparture(campus.shuttles[0].departures) : null;
    const lib = campus?.libraries?.[0] ? isLibraryOpen(campus.libraries[0]) : null;
    const statusText = nextShuttle
      ? `${t('Shuttle', 'Navette')} ${nextShuttle.minsAway}m`
      : lib
        ? `${t('Library', 'Biblio')} ${lib.open ? t('open', 'ouvert') : t('closed', 'fermé')}`
        : t('Tap to set up', 'Appuyez pour configurer');
    const statusColor = lib && !nextShuttle ? (lib.open ? '#00A78D' : colours.red) : colours.muted;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ borderRadius: 14, paddingHorizontal: 16, backgroundColor: isActive ? accent + '22' : colours.surface, borderWidth: 1, borderLeftWidth: 4, borderColor: isActive ? accent : colours.border, borderLeftColor: accent, flexDirection: 'row', alignItems: 'center', height: 64 }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        {campus && CAMPUS_LOGOS[campus.id] ? (
          <Image source={CAMPUS_LOGOS[campus.id]} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 12 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Ionicons name="school" size={18} color={accent} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={1}>
            {campus ? t(campus.name, campus.name_fr) : t('My Campus', 'Mon Campus')}
          </Text>
          <Text style={{ fontSize: 11, color: statusColor, marginTop: 1 }} numberOfLines={1}>{statusText}</Text>
        </View>
        {reorderBtns}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Bus Stop / LRT card ──
  const isLRT = item.type === 'lrt_station';
  const isLive = previewSource === 'gtfs-rt' || previewSource === 'sto-gtfs-rt';
  const isSTO = (item as any).agency === 'STO' || isStoStop(item.id);
  const stoBlue = '#0072bc';
  // Check if any alert routes match this stop's routes
  const stopRouteIds = preview.map(a => (a.routeId || '').split('-')[0]);
  const activeAlerts = alerts.filter((a: any) => a.category !== 'accessibility');
  const matchingAlertRoutes = activeAlerts.flatMap((a: any) => (a.routes || []).filter((r: string) => stopRouteIds.includes(r)));
  const alertRouteSet = [...new Set(matchingAlertRoutes)];

  // Last bus warning node - computed once before render
  let lastBusNode: React.ReactNode = null;
  if (isBoardLateNight && lastBusRouteInfo?.lastBus) {
    const nowMins2 = new Date().getHours() * 60 + new Date().getMinutes();
    const [lh2, lm2] = lastBusRouteInfo.lastBus.split(':').map(Number);
    let lbMins2 = lh2 * 60 + lm2;
    if (nowMins2 >= 1200 && lbMins2 < 180) lbMins2 += 1440;
    const minsUntil2 = lbMins2 - nowMins2;
    if (minsUntil2 >= 0 && minsUntil2 <= 30) {
      lastBusNode = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <Ionicons name="time-outline" size={9} color="#D97706" />
          <Text style={{ fontSize: 9, color: '#D97706', fontWeight: '700' }} numberOfLines={1}>
            {t(`Last ${lastBusRouteInfo.routeId} in ${minsUntil2}m`, `Dernier ${lastBusRouteInfo.routeId} dans ${minsUntil2}m`)}
          </Text>
        </View>
      );
    } else if (minsUntil2 < 0) {
      lastBusNode = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <Ionicons name="moon-outline" size={9} color={colours.muted} />
          <Text style={{ fontSize: 9, color: colours.muted, fontWeight: '600' }} numberOfLines={1}>
            {lastBusRouteInfo.firstBus
              ? t(`Next: ${lastBusRouteInfo.firstBus}`, `Prochain: ${lastBusRouteInfo.firstBus}`)
              : t('No more tonight', 'Plus de bus ce soir')}
          </Text>
        </View>
      );
    }
  }

  return (
    <ScaleDecorator>
    <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
      {alertRouteSet.length > 0 && (
        <View style={{ backgroundColor: '#e8a020' + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginBottom: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#e8a020' }} numberOfLines={1}>
            {'\u26A0\uFE0F'} Route {alertRouteSet.slice(0, 2).join(', ')} alert today
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isLRT ? 'train' : 'bus'} size={12} color={isLRT ? colours.lrt : isSTO ? '#0072bc' : colours.accent} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: isSTO ? '#0072bc' : colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {isLRT ? 'O-Train' : isSTO ? 'STO' : t('Stop', 'Arrêt')}
          </Text>
          {!previewLoading && preview.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isLive ? (isSTO ? stoBlue : '#22c55e') : colours.muted }} />
              <Text style={{ fontSize: 8, fontWeight: '700', color: isLive ? (isSTO ? stoBlue : '#22c55e') : colours.muted }}>{isLive ? 'LIVE' : 'SCHED'}</Text>
            </View>
          )}
        </View>
        {reorderBtns}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text, lineHeight: 18 }} numberOfLines={2}>{item.name}</Text>
      <View style={{ gap: 4 }}>
        {previewLoading ? (
          <ActivityIndicator size="small" color={colours.accent} />
        ) : preview.length === 0 ? (
          <Text style={{ fontSize: 11, color: colours.muted }}>{t('No arrivals', 'Aucune arrivée')}</Text>
        ) : (
          preview.map((a, i) => {
            const badgeColor = isSTO ? stoBlue : colours.accent;
            return (
            <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => boardRouter.push('/(tabs)/map' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ backgroundColor: badgeColor + '18', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, minWidth: 26, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: badgeColor }}>{(a.routeId || '').split('-')[0]}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: a.minsAway <= 2 ? colours.red : badgeColor }}>
                {timeFormat === 'absolute'
                  ? fmtAbsTime(a.minsAway)
                  : (a.secsAway < 0 ? t('Late', 'Retard') : a.minsAway === 0 ? t('Now', 'Maint.') : `${a.minsAway}m`)}
              </Text>
              <Text style={{ fontSize: 10, color: colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign || ''}</Text>
            </TouchableOpacity>
            );
          })
        )}
      </View>
      {lastBusNode}
    </TouchableOpacity>
    </ScaleDecorator>
  );
}



// ── Notification helpers ─────────────────────────────────────────
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureNotifPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}


/**
 * On app open: fetch alerts and fire a local notification for any
 * critical (non-accessibility) alerts the user hasn't seen yet.
 * Tracks seen alert IDs in AsyncStorage under routeo_seen_alert_ids.
 */
async function checkAndNotifyCriticalAlerts(lang: string = 'en'): Promise<void> {
  if (!Notifications) return;
  try {
    const resp = await fetchWithTimeout(ALERTS_URL);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const allAlerts: ServiceAlert[] = data.alerts || [];
    const critical = allAlerts.filter(a => a.category !== 'accessibility');
    if (critical.length === 0) return;

    const seenRaw = await AsyncStorage.getItem(SK_SEEN_ALERT_IDS);
    let seenIds: number[] = [];
    try { if (seenRaw) seenIds = JSON.parse(seenRaw); } catch { await AsyncStorage.removeItem(SK_SEEN_ALERT_IDS); }

    const unseen = critical.filter(a => !seenIds.includes(a.id));
    if (unseen.length === 0) return;

    if (!(await ensureNotifPermission())) return;

    const title = unseen.length === 1
      ? (lang === 'fr' ? '⚠️ Alerte OC Transpo' : '⚠️ OC Transpo Alert')
      : (lang === 'fr' ? `⚠️ ${unseen.length} alertes OC Transpo` : `⚠️ ${unseen.length} OC Transpo Alerts`);
    const body = unseen.length === 1
      ? unseen[0].title
      : (lang === 'fr' ? `${unseen[0].title} + ${unseen.length - 1} autre(s)` : `${unseen[0].title} + ${unseen.length - 1} more`);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'service_alert' },
        sound: true,
      },
      trigger: null, // fire immediately
    });

    // Mark all current critical alerts as seen
    const nowSeen = [...seenIds, ...critical.map(a => a.id)].slice(-100);
    await AsyncStorage.setItem(SK_SEEN_ALERT_IDS, JSON.stringify(nowSeen));
  } catch (e) { if (__DEV__) console.warn('alert notification failed:', e); }
}

// ── Error Boundary ───────────────────────────────────────────────
class HomeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { if (__DEV__) console.warn('HomeErrorBoundary caught:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0e1621', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#7a8a9e" />
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            Something went wrong / Une erreur s'est produite
          </Text>
          <Text style={{ color: '#7a8a9e', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
            Tap below to try again. / Appuyez ci-dessous pour r&#233;essayer.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 20, backgroundColor: '#cc3b2a', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Retry / R&#233;essayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Main Screen ──────────────────────────────────────────────────
function LiveScreenInner() {
  const { colours, theme, language, t, fonts } = useApp();
  const { savedBoard: boardContextStops } = useBoard();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_W = screenWidth - 40;
  const [stopId, setStopId] = useState('CD995');
  const [stopName, setStopName] = useState('Rideau');
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [weatherFetchFailed, setWeatherFetchFailed] = useState(false);
  const [arrivalsFetchFailed, setArrivalsFetchFailed] = useState(false);
  const [stopReports, setStopReports] = useState<Record<string, { count: number; reports: any[] }>>({});
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportSheetStopId, setReportSheetStopId] = useState('');
  const [nearbyAlternative, setNearbyAlternative] = useState<{ stopId: string; stopName: string; routeId: string; minsAway: number; walkMeters: number } | null>(null);
  const [stopAmenities, setStopAmenities] = useState<{ has_shelter?: boolean; has_bench?: boolean; has_bin?: boolean } | null>(null);
  const [crowdingData, setCrowdingData] = useState<Record<string, { avg: number; count: number; confidence: string }>>({});
  const [crowdingHourly, setCrowdingHourly] = useState<{ hour: number; avg: number; count: number }[]>([]);
  const [crowdingHourlyLoading, setCrowdingHourlyLoading] = useState(false);
  const [reliabilityScores, setReliabilityScores] = useState<Record<string, { onTimeRate: number; totalTrips: number }>>({});
  const reliabilityCacheRef = useRef<{ data: Record<string, { onTimeRate: number; totalTrips: number }>; ts: number } | null>(null);
  const [showCrowdingSheet, setShowCrowdingSheet] = useState(false);
  const [crowdingReportItem, setCrowdingReportItem] = useState<Arrival | null>(null);
  const [crowdingSubmitting, setCrowdingSubmitting] = useState(false);
  const [crowdingToast, setCrowdingToast] = useState(false);
  const commuteCardDismissedRef = useRef(false);
  const [timeFormat, setTimeFormat] = useState<'relative' | 'absolute'>('relative');
  const [passedHintShown, setPassedHintShown] = useState(false);
  const [helpBannerDismissed, setHelpBannerDismissed] = useState(false);
  const [scheduleRoute, setScheduleRoute] = useState<{ routeId: string; headsign: string } | null>(null);
  const [scheduleTrips, setScheduleTrips] = useState<{ time: string; tripId: string }[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showAllArrivals, setShowAllArrivals] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<StopResult[]>([]);
  const [addressResults, setAddressResults] = useState<{label: string, lat: number, lng: number}[]>([]);
  const [reports, setReports] = useState<Reports>({});
  const [favs, setFavs] = useState<Fav[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [savedBoard, setSavedBoard] = useState<SavedBoardItem[]>([]);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [boardExpandItem, setBoardExpandItem] = useState<SavedBoardItem | null>(null);
  const [expandedStopCoords, setExpandedStopCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  React.useEffect(() => {
    if (!boardExpandItem || (boardExpandItem.type !== 'bus_stop' && boardExpandItem.type !== 'lrt_station')) {
      setExpandedStopCoords(null);
      return;
    }
    supabase
      .from('stops')
      .select('stop_lat,stop_lon')
      .eq('stop_id', (boardExpandItem as any).id)
      .single()
      .then(({ data }) => {
        if (data?.stop_lat) setExpandedStopCoords({ lat: data.stop_lat, lng: data.stop_lon });
      });
  }, [boardExpandItem]);
  const [savedRoutes, setSavedRoutes] = useState<{ id: string; fromLabel: string; toLabel: string; fromLat: number; fromLng: number; toLat: number; toLng: number }[]>([]);
  // newsArticles, selectedNeighbourhood, neighbourhoodSheetVisible removed - discover section moved to dedicated tab
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsModalVisible, setAlertsModalVisible] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [activeServicesTab, setActiveServicesTab] = useState('transit');
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; condition: string; icon: string } | null>(null);
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [forecast, setForecast] = useState<{ time: string; temp: number; icon: string; precip: number }[]>([]);
  const [dailyForecast, setDailyForecast] = useState<{ day: string; date: string; high: number; low: number; icon: string; precip: number }[]>([]);
  const [locationName, setLocationName] = useState('Ottawa, Ontario');
  // Ottawa road closures
  const [weatherBannerDismissed, setWeatherBannerDismissed] = useState(false);
  // Events modal (Ticketmaster + Eventbrite)
  const [eventsModal, setEventsModal] = useState(false);
  const [eventsSource, setEventsSource] = useState<'ticketmaster' | 'eventbrite'>('ticketmaster');
  const [events, setEvents] = useState<{ id: string; name: string; date: string; time?: string; venue: string; address?: string; url: string; image?: string; category?: string; free?: boolean; source?: string }[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const eventsCacheTime = useRef<{ ticketmaster: number; eventbrite: number }>({ ticketmaster: 0, eventbrite: 0 });
  const weatherCacheTime = useRef<number>(0);
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsCategory, setEventsCategory] = useState<string | null>(null);
  const [eventsFreeOnly, setEventsFreeOnly] = useState(false);
  const [eventsNearMe, setEventsNearMe] = useState(false);
  const [eventsUserCoords, setEventsUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [eventsGeoCache, setEventsGeoCache] = useState<{ [addr: string]: { lat: number; lng: number } }>({});
  const [socialModal, setSocialModal] = useState(false);
  const [socialTab, setSocialTab] = useState<'all' | 'bars' | 'restaurants' | 'clubs'>('all');
  const [socialFeedbackVenue, setSocialFeedbackVenue] = useState<string | null>(null);
  const [socialFeedbackText, setSocialFeedbackText] = useState('');
  const [socialFeedbackSent, setSocialFeedbackSent] = useState(false);
  const [socialFeedbackSending, setSocialFeedbackSending] = useState(false);
  const [socialDealForm, setSocialDealForm] = useState(false);
  const [socialDealVenue, setSocialDealVenue] = useState('');
  const [socialDealDesc, setSocialDealDesc] = useState('');
  const [socialDealSending, setSocialDealSending] = useState(false);
  const [socialDealSent, setSocialDealSent] = useState(false);
  const [savedVenues, setSavedVenues] = useState<any[]>([]);
  const [sensGame, setSensGame] = useState<{ state: 'live' | 'pre' | 'none'; period?: string; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; startTime?: string; opponentAbbr?: string } | null>(null);
  const [campusModal, setCampusModal] = useState(false);
  const [campusTab, setCampusTab] = useState<'shuttle' | 'library' | 'upass' | 'food' | 'study'>('shuttle');
  const [selectedCampus, setSelectedCampus] = useState<CampusConfig | null>(null);
  const [campusPicker, setCampusPicker] = useState(false);
  const [campusFood, setCampusFood] = useState<any[]>([]);
  const [campusFoodLoading, setCampusFoodLoading] = useState(false);
  // Class schedule for hero card
  const [classSchedule, setClassSchedule] = useState<ClassSchedule | null>(null);
  const [heroCampus, setHeroCampus] = useState<CampusConfig | null>(null);
  const [nextClassResult, setNextClassResult] = useState<{ entry: any; day: string; minsUntilLeave: number } | null>(null);
  const [campusEvents, setCampusEvents] = useState<any[]>([]);

  const isLight = theme === 'light' || (theme === 'system' && colours.bg === '#f0f4f8');
  const cardShadow = useMemo(() => isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {}, [isLight]);

  // ── Fetch Senators live game for board card ──
  useEffect(() => {
    const fetchSensGame = async () => {
      try {
        const resp = await fetchWithTimeout('https://api-web.nhle.com/v1/schedule/now');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const today = new Date().toLocaleDateString('en-CA');
        const todayEntry = (data.gameWeek || []).find((d: any) => d.date === today);
        const game = (todayEntry?.games || []).find((g: any) => g.awayTeam?.abbrev === 'OTT' || g.homeTeam?.abbrev === 'OTT');
        if (!game) { setSensGame({ state: 'none' }); return; }
        const gs = game.gameState;
        const homeAbbr = game.homeTeam?.abbrev || '?';
        const awayAbbr = game.awayTeam?.abbrev || '?';
        const isHome = homeAbbr === 'OTT';
        const opponentAbbr = isHome ? awayAbbr : homeAbbr;
        if (gs === 'LIVE' || gs === 'CRIT') {
          const periodNum = game.period || 0;
          const periodLabel = periodNum === 1 ? '1st' : periodNum === 2 ? '2nd' : periodNum === 3 ? '3rd' : 'OT';
          setSensGame({ state: 'live', period: periodLabel, homeAbbr, awayAbbr, homeScore: game.homeTeam?.score ?? 0, awayScore: game.awayTeam?.score ?? 0, opponentAbbr });
        } else if (gs === 'FINAL') {
          setSensGame({ state: 'live', period: 'Final', homeAbbr, awayAbbr, homeScore: game.homeTeam?.score ?? 0, awayScore: game.awayTeam?.score ?? 0, opponentAbbr });
        } else {
          // FUT, PRE, OFF, or any other state = scheduled/pre-game
          const startTime = new Date(game.startTimeUTC).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
          setSensGame({ state: 'pre', opponentAbbr, startTime });
        }
      } catch { setSensGame({ state: 'none' }); }
    };
    fetchSensGame();
    const interval = setInterval(() => { if (AppState.currentState === 'active') fetchSensGame(); }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load class schedule and campus for hero card - refresh when returning from Account tab, with live countdown
  const checkLastMinuteDeals = async () => {
    try {
      const notifEnabled = await AsyncStorage.getItem('routeo_lastminute_notifs');
      if (notifEnabled !== 'true') return;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const now = new Date();
      const currentDay = now.getDay();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const venue of HAPPY_HOUR_VENUES) {
        const distKm = Math.sqrt(
          Math.pow((venue.lat - userLat) * 111, 2) +
          Math.pow((venue.lng - userLng) * 111 * Math.cos(userLat * Math.PI / 180), 2)
        );
        if (distKm > 0.5) continue;

        for (const deal of venue.deals) {
          if (!deal.days.includes(currentDay)) continue;
          const [endH, endM] = deal.end.split(':').map(Number);
          const endMinutes = endH * 60 + endM;
          const minsLeft = endMinutes - currentMinutes;
          if (minsLeft > 0 && minsLeft <= 90) {
            if (Notifications) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `⚡ ${venue.name}`,
                  body: `${deal.description} - ends in ${minsLeft}min · ${Math.round(distKm * 1000)}m away`,
                  data: { type: 'last_minute_deal', venue: venue.name },
                },
                trigger: null,
              });
            }
            return;
          }
        }
      }
    } catch {}
  };

  useFocusEffect(
    useCallback(() => {
      const loadScheduleAndCampus = () => {
        AsyncStorage.getItem(SK_CLASS_SCHEDULE).then(val => {
          try { if (val) setClassSchedule(JSON.parse(val)); else setClassSchedule(null); } catch (e) { if (__DEV__) console.warn('JSON parse class schedule failed:', e); }
        }).catch(() => {});
        AsyncStorage.getItem(SK_CAMPUS).then(val => {
          if (val) { const c = CAMPUSES.find(x => x.id === val); if (c) setHeroCampus(c); } else setHeroCampus(null);
        }).catch(() => {});
      };
      loadScheduleAndCampus();

      // Load campus events if student mode on
      (async () => {
        const isStudentMode = await AsyncStorage.getItem('routeo_is_student');
        const campusVal = await AsyncStorage.getItem(SK_CAMPUS);
        if (isStudentMode === 'true' && campusVal) {
          const campus = campusVal === 'uottawa' ? 'uottawa' : campusVal === 'algonquin' ? 'algonquin' : 'carleton';
          try {
            const resp = await fetch(`https://bzvkadttywgszovbowch.supabase.co/functions/v1/campus-events?campus=${campus}`, {
              headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
            });
            const data = await resp.json();
            setCampusEvents(data.events || []);
          } catch {}
        }
      })();

      // Fetch events for Tonight section if not already loaded
      fetchTicketmasterEvents();

      // Check for last-minute deals nearby
      checkLastMinuteDeals();

      // Set up live countdown - recalculate every 30s
      const countdownInterval = setInterval(() => {
        AsyncStorage.getItem(SK_CLASS_SCHEDULE).then(val => {
          try {
            if (val) {
              const schedule = JSON.parse(val) as ClassSchedule;
              const nc = nextClass(schedule);
              setNextClassResult(nc);
            } else {
              setNextClassResult(null);
            }
          } catch { /* silent */ }
        }).catch(() => {});
      }, 30000);

      return () => clearInterval(countdownInterval);
    }, [])
  );

  useEffect(() => {
    AsyncStorage.getItem(SK_FAVS).then(val => {
      try {
        const savedFavs: Fav[] = val ? JSON.parse(val) : [];
        setFavs(savedFavs);
        if (savedFavs.length > 0) { setStopId(savedFavs[0].id); setStopName(savedFavs[0].name); fetchArrivals(savedFavs[0].id); fetchStopReports(savedFavs[0].id); fetchStopAmenities(savedFavs[0].id); }
        else { fetchArrivals('CD995'); fetchStopReports('CD995'); fetchStopAmenities('CD995'); }
      } catch { fetchArrivals('CD995'); fetchStopReports('CD995'); }
    });
    AsyncStorage.getItem(SK_SAVED_PLACES).then(val => { try { if (val) setSavedPlaces(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved places failed:', e); } });
    AsyncStorage.getItem(SK_SAVED_VENUES).then(val => { try { if (val) setSavedVenues(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved venues failed:', e); } });
    AsyncStorage.getItem(SK_SAVED_ROUTES).then(val => { try { if (val) setSavedRoutes(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved routes failed:', e); } });
    AsyncStorage.getItem(SK_TIME_FORMAT).then(val => { if (val === 'absolute') setTimeFormat('absolute'); });
    AsyncStorage.getItem(SK_CAMPUS).then(val => { if (val) { const c = CAMPUSES.find(x => x.id === val); if (c) setSelectedCampus(c); } }).catch(() => {});
    Promise.all([
      AsyncStorage.getItem(SK_SAVED_BOARD),
      AsyncStorage.getItem(SK_FAVS),
    ]).then(([boardVal, favsVal]) => {
      try {
        let board: SavedBoardItem[] = boardVal ? JSON.parse(boardVal) : [];
        // Migrate: remove stale service_alert items (replaced by persistent disruption banner)
        board = board.filter((i: any) => i.type !== 'service_alert' && i.type !== 'news' && i.type !== 'class_schedule');
        const existingFavs: Fav[] = favsVal ? JSON.parse(favsVal) : [];
        let changed = false;
        for (const fav of existingFavs) {
          const alreadyOn = board.some(i => (i.type === 'bus_stop' || i.type === 'lrt_station') && i.id === fav.id);
          if (!alreadyOn) {
            board.push({ type: LRT_STOP_IDS.has(fav.id) ? 'lrt_station' : 'bus_stop', id: fav.id, name: fav.name });
            changed = true;
          }
        }
        if (changed) AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(board));
        setSavedBoard(board);
        setBoardLoaded(true);
      } catch {
        setSavedBoard([]);
        setBoardLoaded(true);
      }
    }).catch(() => { setBoardLoaded(true); });
    AsyncStorage.getItem(SK_GHOST_REPORTS).then(val => {
      try {
        if (val) {
          const saved: Reports = JSON.parse(val);
          const now = Date.now();
          const valid: Reports = {};
          for (const key of Object.keys(saved)) { if (saved[key].expiresAt > now) valid[key] = saved[key]; }
          setReports(valid);
        }
      } catch (e) { if (__DEV__) console.warn('JSON parse reports failed:', e); }
    });
    fetchAlerts();
    fetchWeather();
    // Load dismissed alert IDs
    AsyncStorage.getItem(SK_DISMISSED_ALERT_IDS).then(val => {
      if (val) { try { setDismissedAlertIds(new Set(JSON.parse(val))); } catch {} }
    }).catch(() => {});
    // Check for unseen critical service alerts and notify
    checkAndNotifyCriticalAlerts(language);
    // Register push token and configure notification handler
    configureNotificationHandler();
    registerPushToken(language).catch(() => {});
  }, []);



  const saveBoardItems = (items: SavedBoardItem[]) => {
    setSavedBoard(items);
    AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(items));
  };

  const addToBoardIfMissing = (item: SavedBoardItem) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedBoard(prev => {
      const exists = prev.some(i => {
        if (i.type !== item.type) return false;
        if (item.type === 'otrain' || item.type === 'services' || item.type === 'discover') return true;
        if ((item.type === 'bus_stop' || item.type === 'lrt_station') && (i.type === 'bus_stop' || i.type === 'lrt_station')) return i.id === item.id;
        if (item.type === 'external_link' && i.type === 'external_link') return i.id === item.id;
        if (item.type === 'neighbourhood' && i.type === 'neighbourhood') return i.id === item.id;
        return false;
      });
      if (exists) return prev;
      const updated = [...prev, item];
      AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(updated));
      return updated;
    });
  };

  const removeFromBoard = (item: SavedBoardItem) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedBoard(prev => {
      const updated = prev.filter(i => {
        if (i.type !== item.type) return true;
        if (item.type === 'otrain' || item.type === 'services' || item.type === 'discover') return false;
        if ((item.type === 'bus_stop' || item.type === 'lrt_station') && (i.type === 'bus_stop' || i.type === 'lrt_station')) return i.id !== item.id;
        if (item.type === 'external_link' && i.type === 'external_link') return i.id !== item.id;
        if (item.type === 'neighbourhood' && i.type === 'neighbourhood') return i.id !== item.id;
        return true;
      });
      AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(updated));
      return updated;
    });
  };

  const isBoardSaved = (item: SavedBoardItem): boolean => {
    if (item.type === 'otrain') return savedBoard.some(i => i.type === 'otrain');
    if (item.type === 'services') return savedBoard.some(i => i.type === 'services');
    if (item.type === 'discover') return savedBoard.some(i => i.type === 'discover');
    if (item.type === 'campus') return savedBoard.some(i => i.type === 'campus');
    if (item.type === 'neighbourhood') return savedBoard.some(i => i.type === 'neighbourhood' && i.id === item.id);
    if (item.type === 'external_link') return savedBoard.some(i => i.type === 'external_link' && i.id === item.id);
    return savedBoard.some(i => (i.type === 'bus_stop' || i.type === 'lrt_station') && i.id === item.id);
  };

  const tileToBoard = (tile: ServiceTile): SavedBoardItem | null => {
    if (tile.id === 'otrain') return { type: 'otrain' };
    if (tile.id === 'services') return { type: 'services' };
    if (tile.id === 'discover') return { type: 'discover' };
    if (tile.id === 'campus') return { type: 'campus' };
    if (tile.action === 'navigate') return null;
    return {
      type: 'external_link',
      id: tile.id,
      label_en: tile.label_en,
      label_fr: tile.label_fr,
      icon: tile.icon,
      accent: tile.accent,
      url: tile.target || '',
    };
  };

  const fetchWeather = async () => {
    if (weather && Date.now() - weatherCacheTime.current < 10 * 60 * 1000) return;
    try {
      let lat = 45.4215, lng = -75.6972;
      let locLabel = 'Ottawa, Ontario';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude; lng = pos.coords.longitude;
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (geo[0]) { const g = geo[0]; locLabel = [g.city || g.subregion, g.region].filter(Boolean).join(', '); }
        }
      } catch (e) { if (__DEV__) console.warn('get weather location failed:', e); }
      setLocationName(locLabel);
      // ── Open-Meteo (primary source - EC XML feed moved to dynamic hourly paths) ──
      const wmoIcon = (c: number): string => { if (c === 0) return 'sunny'; if (c <= 2) return 'partly-sunny'; if (c <= 3) return 'cloudy'; if (c <= 49) return 'cloudy'; if (c <= 67) return 'rainy'; if (c <= 77) return 'snow'; if (c <= 82) return 'rainy'; if (c <= 86) return 'snow'; return 'thunderstorm'; };
      const wmoCondition = (c: number): string => { if (c === 0) return t('Clear', 'Ciel d\u00E9gag\u00E9'); if (c <= 2) return t('Partly cloudy', 'Partiellement nuageux'); if (c <= 3) return t('Cloudy', 'Nuageux'); if (c <= 48) return t('Fog', 'Brouillard'); if (c <= 55) return t('Drizzle', 'Bruine'); if (c <= 57) return t('Freezing drizzle', 'Bruine vergla\u00E7ante'); if (c <= 65) return t('Rain', 'Pluie'); if (c <= 67) return t('Freezing rain', 'Pluie vergla\u00E7ante'); if (c <= 75) return t('Snow', 'Neige'); if (c <= 77) return t('Snow grains', 'Grains de neige'); if (c <= 82) return t('Rain showers', 'Averses de pluie'); if (c <= 86) return t('Snow showers', 'Averses de neige'); if (c >= 95) return t('Thunderstorm', 'Orage'); return t('Cloudy', 'Nuageux'); };
      const resp = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=auto&forecast_days=5`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      // Current conditions
      const curTemp = Math.round(data.current?.temperature_2m ?? 0);
      const curCode = data.current?.weathercode ?? 3;
      setWeather({ temp: curTemp, condition: wmoCondition(curCode), icon: wmoIcon(curCode) });
      // Hourly forecast
      const now = new Date();
      const hourlyTimes: string[] = data.hourly?.time ?? [];
      const hourlyTemps: number[] = data.hourly?.temperature_2m ?? [];
      const hourlyCodes: number[] = data.hourly?.weathercode ?? [];
      const hourlyPrecip: number[] = data.hourly?.precipitation_probability ?? [];
      setForecast(hourlyTimes.map((t, i) => ({ time: t, temp: Math.round(hourlyTemps[i]), icon: wmoIcon(hourlyCodes[i]), precip: hourlyPrecip[i] ?? 0 })).filter(h => new Date(h.time) > now).slice(0, 12));
      // Daily forecast
      const days = language === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayLabel = t('Today', "Aujourd'hui");
      const dailyTimes: string[] = data.daily?.time ?? [];
      const dailyHigh: number[] = data.daily?.temperature_2m_max ?? [];
      const dailyLow: number[] = data.daily?.temperature_2m_min ?? [];
      const dailyCodes: number[] = data.daily?.weathercode ?? [];
      const dailyPrecip: number[] = data.daily?.precipitation_probability_max ?? [];
      const months = language === 'fr' ? ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      setDailyForecast(dailyTimes.map((dt, i) => { const d = new Date(dt + 'T12:00:00'); return { day: i === 0 ? todayLabel : days[d.getDay()], date: `${months[d.getMonth()]} ${d.getDate()}`, high: Math.round(dailyHigh[i]), low: Math.round(dailyLow[i]), icon: wmoIcon(dailyCodes[i]), precip: dailyPrecip[i] ?? 0 }; }));
      weatherCacheTime.current = Date.now();
      setWeatherFetchFailed(false);
      // Cache for offline use
      AsyncStorage.setItem(SK_CACHE_WEATHER, JSON.stringify({ temp: curTemp, condition: wmoCondition(curCode), icon: wmoIcon(curCode) })).catch(() => {});
    } catch (e) {
      if (__DEV__) console.warn('fetch weather failed:', e);
      setWeatherFetchFailed(true);
      // Load from cache if available
      if (!weather) {
        AsyncStorage.getItem(SK_CACHE_WEATHER).then(val => { if (val) try { setWeather(JSON.parse(val)); } catch {} }).catch(() => {});
      }
    }
  };


  const fetchAlerts = async () => {
    try { setAlertsLoading(true); const resp = await fetchWithTimeout(ALERTS_URL); if (!resp.ok) throw new Error('HTTP ' + resp.status); const data = await resp.json(); setAlerts(data.alerts || []); }
    catch { setAlerts([]); } finally { setAlertsLoading(false); }
  };


  const getUserCoords = async (): Promise<{ lat: number; lng: number }> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (e) { if (__DEV__) console.warn('get user coords failed:', e); }
    return { lat: 45.4215, lng: -75.6972 };
  };



  // ── Ticketmaster events ───────────────────────────────────────
  const fetchTicketmasterEvents = async () => {
    if (eventsSource === 'ticketmaster' && events.length > 0 && Date.now() - eventsCacheTime.current.ticketmaster < 30 * 60 * 1000) return;
    setEventsLoading(true);
    try {
      const resp = await fetchWithTimeout(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&city=Ottawa&countryCode=CA&size=40&sort=date,asc`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const evs = (data?._embedded?.events || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        date: e.dates?.start?.localDate || '',
        venue: e._embedded?.venues?.[0]?.name || '',
        url: e.url || '',
        image: e.images?.find((img: any) => img.ratio === '16_9' && img.width > 500)?.url || e.images?.[0]?.url,
        category: e.classifications?.[0]?.segment?.name || 'Other',
      }));
      setEvents(evs);
      eventsCacheTime.current.ticketmaster = Date.now();
    } catch { setEvents([]); }
    setEventsLoading(false);
  };

  // ── Eventbrite events ─────────────────────────────────────────
  const fetchEventbriteEvents = async () => {
    if (eventsSource === 'eventbrite' && events.length > 0 && Date.now() - eventsCacheTime.current.eventbrite < 30 * 60 * 1000) return;
    setEventsLoading(true);
    try {
      const resp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=ticketmaster');
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      const allEvents = data.events || [];
      setEvents(allEvents);
      eventsCacheTime.current.eventbrite = Date.now();
      // Store today's events with addresses for the map tab
      const today = new Date().toLocaleDateString('en-CA');
      const todayEvents = allEvents.filter((e: any) => e.date === today && e.address);
      AsyncStorage.setItem(SK_TODAY_EVENTS, JSON.stringify(todayEvents));
    } catch { setEvents([]); }
    setEventsLoading(false);
  };

  const toggleNearMe = async () => {
    if (eventsNearMe) { setEventsNearMe(false); return; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setEventsUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      // Geocode any addresses not yet in cache
      const toGeocode = events.filter(e => e.address && !eventsGeoCache[e.address]);
      const newCache = { ...eventsGeoCache };
      await Promise.all(toGeocode.map(async e => {
        try {
          const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=geocode&input=${encodeURIComponent(e.address || '')}`);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const d = await r.json();
          if (d.results?.[0]?.lat) newCache[e.address!] = { lat: d.results[0].lat, lng: d.results[0].lng };
        } catch (e2) { if (__DEV__) console.warn('geocode event address failed:', e2); }
      }));
      setEventsGeoCache(newCache);
      setEventsNearMe(true);
    } catch (e) { if (__DEV__) console.warn('sort events near me failed:', e); }
  };

  const saveFavs = (newFavs: Fav[]) => { setFavs(newFavs); AsyncStorage.setItem(SK_FAVS, JSON.stringify(newFavs)); };

  const addFav = (id: string, name: string) => {
    if (favs.find(f => f.id === id)) return;
    if (favs.length >= 5) { Alert.alert(t('Max 5 favourites', 'Max 5 favoris'), t('Long press to remove one first.', 'Appuyez longuement pour en retirer un.')); return; }
    saveFavs([...favs, { id, name, icon: 'star' }]);
    const boardItem: SavedBoardItem = isStoStop(id)
      ? { type: 'bus_stop', id, name, agency: 'STO' }
      : { type: LRT_STOP_IDS.has(id) ? 'lrt_station' : 'bus_stop', id, name };
    addToBoardIfMissing(boardItem);
  };

  const removeFav = (id: string) => {
    saveFavs(favs.filter(f => f.id !== id));
    removeFromBoard({ type: LRT_STOP_IDS.has(id) ? 'lrt_station' : 'bus_stop', id, name: '' });
  };

  const removeSavedPlace = async (id: string) => {
    const updated = savedPlaces.filter(p => p.id !== id);
    setSavedPlaces(updated);
    await AsyncStorage.setItem(SK_SAVED_PLACES, JSON.stringify(updated));
  };

  const fetchArrivals = useCallback(async (id: string) => {
    try {
      setError('');
      const isNumericOnly = /^\d+$/.test(id);
      const internalId = isNumericOnly ? resolveStopId(id) : id;
      // STO stops - route through backend which handles STO GTFS-RT
      if (isStoStop(id)) {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const stoIsStatic = data.source === 'stale' || data.source === 'sto-gtfs-rt-empty';
        const stoParsed = (data.arrivals || []).map((a: any) => ({ id: `${a.stopId || id}-${a.scheduledTime || Math.random()}`, routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway, delay: 0, secsAway: a.minsAway * 60, isScheduled: stoIsStatic }));
        setArrivals(stoParsed);
        AsyncStorage.setItem(`routeo_arrivals_${id}`, JSON.stringify({ arrivals: stoParsed, timestamp: Date.now() }));
        setCachedAt(null);
        const now = new Date();
        setLastUpdated(fmtTime(now));
        setLoading(false);
        return;
      }
      if (LRT_STOP_IDS.has(id) || LRT_STOP_IDS.has(internalId)) {
        const rawId = LRT_STOP_IDS.has(id) ? id : internalId;
        const platforms = MULTI_PLATFORM_STOPS[rawId];
        const lrtId = platforms ? (platforms.find(p => /^[A-Z]/.test(p)) || rawId) : rawId;
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${lrtId}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const lrtParsed = (data.arrivals || []).map((a: any) => ({ id: `${a.stopId}-${a.scheduledTime}`, routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway, delay: 0, secsAway: a.minsAway * 60, isScheduled: data.source === 'stale' }));
        setArrivals(lrtParsed);
        AsyncStorage.setItem(`routeo_arrivals_${id}`, JSON.stringify({ arrivals: lrtParsed, timestamp: Date.now() }));
        setCachedAt(null);
        const now = new Date();
        setLastUpdated(fmtTime(now));
        setLoading(false);
        return;
      }
      // Route all OC stops through backend — keeps API key server-side
      const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${internalId}`);
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      const isStale = data.source === 'stale';
      const ocParsed = (data.arrivals || []).map((a: any) => ({ id: `${a.stopId || internalId}-${a.scheduledTime || Math.random()}`, routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway, delay: 0, secsAway: a.minsAway * 60, isScheduled: isStale }));
      setArrivals(ocParsed);
      AsyncStorage.setItem(`routeo_arrivals_${id}`, JSON.stringify({ arrivals: ocParsed, timestamp: Date.now() }));
      setCachedAt(null);
      const now = new Date();
      setLastUpdated(fmtTime(now));
      setArrivalsFetchFailed(false);
    } catch (e: unknown) {
      try {
        const cached = await AsyncStorage.getItem(`routeo_arrivals_${id}`);
        if (cached) {
          const { arrivals: cachedArrivals, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setArrivals(cachedArrivals);
            setCachedAt(timestamp);
            setLoading(false);
            return;
          }
        }
      } catch {}
      setError(e instanceof Error ? e.message : 'Unknown error');
      setArrivalsFetchFailed(true);
    }
    finally { setLoading(false); }
  }, []);

  const fetchStopReports = async (sid: string) => {
    try {
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=reports&stop_id=${sid}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.count > 0) {
        setStopReports(prev => ({ ...prev, [sid]: { count: data.count, reports: data.reports } }));
      }
    } catch (e) { if (__DEV__) console.warn('fetch stop reports failed:', e); }
  };

  const fetchNearbyAlternative = async (sid: string, currentMinAway: number) => {
    setNearbyAlternative(null);
    if (currentMinAway <= 15) return;
    try {
      const { data: stopData } = await supabase.from('stops').select('stop_lat,stop_lon').eq('stop_id', sid).single();
      if (!stopData?.stop_lat) return;
      const { data: nearbyStops } = await supabase.from('stops').select('stop_id,stop_name,stop_lat,stop_lon')
        .gte('stop_lat', stopData.stop_lat - 0.004).lte('stop_lat', stopData.stop_lat + 0.004)
        .gte('stop_lon', stopData.stop_lon - 0.005).lte('stop_lon', stopData.stop_lon + 0.005)
        .neq('stop_id', sid).limit(8);
      if (!nearbyStops || nearbyStops.length === 0) return;
      for (const ns of nearbyStops) {
        try {
          const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/arrivals?stop=${ns.stop_id}`, { signal: AbortSignal.timeout(4000) } as any);
          if (!resp.ok) continue;
          const data = await resp.json();
          const firstArrival = (data.arrivals || [])[0];
          if (firstArrival && firstArrival.minsAway < currentMinAway - 3) {
            const dlat = (ns.stop_lat - stopData.stop_lat) * 111320;
            const dlng = (ns.stop_lon - stopData.stop_lon) * 111320 * Math.cos(stopData.stop_lat * Math.PI / 180);
            const dist = Math.round(Math.sqrt(dlat * dlat + dlng * dlng));
            if (dist <= 500) {
              setNearbyAlternative({ stopId: ns.stop_id, stopName: ns.stop_name || `Stop #${ns.stop_id}`, routeId: firstArrival.routeId, minsAway: firstArrival.minsAway, walkMeters: dist });
              return;
            }
          }
        } catch { continue; }
      }
    } catch (e) { if (__DEV__) console.warn('nearby alternative failed:', e); }
  };

  // Stop amenities - sourced from OpenStreetMap via one-time import script
  // (scripts/import-osm-shelters.js in backend repo). Columns: has_shelter, has_bench, has_bin.
  const fetchStopAmenities = async (sid: string) => {
    setStopAmenities(null);
    try {
      const { data } = await supabase.from('stops').select('has_shelter,has_bench,has_bin').eq('stop_id', sid).single();
      if (data && (data.has_shelter || data.has_bench || data.has_bin)) setStopAmenities(data);
    } catch { /* no amenity data for this stop */ }
  };

  // ── Bus crowding predictions ─────────────────────────────────────
  const fetchCrowdingForArrivals = async (arrs: Arrival[], sid: string) => {
    if (arrs.length === 0) return;
    const uniqueRoutes = [...new Set(arrs.map(a => a.routeId))];
    const results: Record<string, { avg: number; count: number; confidence: string }> = {};
    await Promise.allSettled(uniqueRoutes.map(async routeId => {
      const cacheKey = `${SK_CROWDING_CACHE}_${routeId}_${sid}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.ts < 600000) { // 10min cache
            if (parsed.avg != null) results[routeId] = parsed;
            return;
          }
        }
      } catch { /* no cache */ }
      try {
        const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=crowding.predict&route_id=${routeId}&stop_id=${sid}`);
        if (resp.ok) {
          const d = await resp.json();
          if (d.avg_crowding != null && d.report_count >= 3) {
            results[routeId] = { avg: d.avg_crowding, count: d.report_count, confidence: d.confidence };
            AsyncStorage.setItem(`${SK_CROWDING_CACHE}_${routeId}_${sid}`, JSON.stringify({ ...results[routeId], ts: Date.now() }));
          }
        }
      } catch { /* network error */ }
    }));
    setCrowdingData(results);
  };

  // ── Route reliability scores ──────────────────────────────────────
  const fetchReliabilityScores = async (routeIds: string[], sid: string) => {
    if (routeIds.length === 0) return;
    // Use 1-hour cache
    if (reliabilityCacheRef.current && Date.now() - reliabilityCacheRef.current.ts < 3600000) {
      setReliabilityScores(reliabilityCacheRef.current.data);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('route_reliability')
        .select('route_id, delta_minutes')
        .in('route_id', routeIds);
      if (error || !data || data.length === 0) return;
      const grouped: Record<string, { onTime: number; total: number }> = {};
      for (const row of data) {
        if (!grouped[row.route_id]) grouped[row.route_id] = { onTime: 0, total: 0 };
        grouped[row.route_id].total++;
        if (Math.abs(row.delta_minutes) <= 3) grouped[row.route_id].onTime++;
      }
      const scores: Record<string, { onTimeRate: number; totalTrips: number }> = {};
      for (const [routeId, stats] of Object.entries(grouped)) {
        if (stats.total >= 10) scores[routeId] = { onTimeRate: Math.round((stats.onTime / stats.total) * 100), totalTrips: stats.total };
      }
      setReliabilityScores(scores);
      reliabilityCacheRef.current = { data: scores, ts: Date.now() };
    } catch { /* silent */ }
  };

  // ── Crowding hourly breakdown ───────────────────────────────────
  const fetchCrowdingHourly = async (routeId: string, sid: string) => {
    setCrowdingHourlyLoading(true);
    setCrowdingHourly([]);
    try {
      const dow = new Date().getDay();
      const { data, error } = await supabase
        .from('crowding_averages')
        .select('hour_of_day, avg_crowding, report_count')
        .eq('route_id', routeId)
        .eq('stop_id', sid)
        .eq('day_of_week', dow)
        .order('hour_of_day', { ascending: true });
      if (!error && data) {
        setCrowdingHourly(data.map(d => ({ hour: d.hour_of_day, avg: Number(d.avg_crowding), count: Number(d.report_count) })));
      }
    } catch { /* silent */ }
    setCrowdingHourlyLoading(false);
  };

  const submitCrowdingReport = async (level: number) => {
    if (!crowdingReportItem) return;
    setCrowdingSubmitting(true);
    try {
      // Spam prevention: check 30min cooldown per vehicle
      const lastRaw = await AsyncStorage.getItem(SK_LAST_CROWDING_REPORT);
      if (lastRaw) {
        const last = JSON.parse(lastRaw);
        if (last.vehicleId === crowdingReportItem.id && Date.now() - last.ts < 1800000) {
          setCrowdingSubmitting(false);
          setShowCrowdingSheet(false);
          return;
        }
      }
      const crowdResp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=crowding.report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: crowdingReportItem.routeId,
          stop_id: stopId,
          vehicle_id: crowdingReportItem.id,
          crowding_level: level,
        }),
      });
      if (!crowdResp.ok) throw new Error('HTTP ' + crowdResp.status);
      await AsyncStorage.setItem(SK_LAST_CROWDING_REPORT, JSON.stringify({ vehicleId: crowdingReportItem.id, ts: Date.now() }));
      setShowCrowdingSheet(false);
      setCrowdingToast(true);
      setTimeout(() => setCrowdingToast(false), 2500);
    } catch (e) { if (__DEV__) console.warn('crowding report failed:', e); }
    setCrowdingSubmitting(false);
  };


  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        fetchArrivals(stopId);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [stopId, fetchArrivals]);

  useEffect(() => {
    if (arrivals.length > 0 && arrivals[0].minsAway > 15) {
      fetchNearbyAlternative(stopId, arrivals[0].minsAway);
    } else {
      setNearbyAlternative(null);
    }
    if (arrivals.length > 0) {
      fetchCrowdingForArrivals(arrivals, stopId);
      fetchReliabilityScores([...new Set(arrivals.map(a => a.routeId))], stopId);
    }
  }, [arrivals, stopId]);

  // Route reliability tracking removed — client-side delta_minutes was always 0
  // since delay is never populated from the backend response. Reliability data
  // should be recorded server-side where actual vs scheduled times are known.

  // ── Arrival push notifications for saved stops ─────────────────
  const notifiedArrivalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkSavedStopArrivals = async () => {
      const sharing = await AsyncStorage.getItem(SK_TRIP_SHARING);
      if (sharing !== 'true') return;
      if (AppState.currentState !== 'active') return;
      try {
        const raw = await AsyncStorage.getItem(SK_NOTIF_SETTINGS);
        const settings = raw ? { ...{ arrivalAlerts: true }, ...JSON.parse(raw) } : { arrivalAlerts: true };
        if (!settings.arrivalAlerts) return;
      } catch { return; }

      const stops = savedBoard.filter(i => i.type === 'bus_stop' || i.type === 'lrt_station') as { type: string; id: string; name: string }[];
      if (stops.length === 0) return;

      if (!Notifications) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      for (const stop of stops) {
        try {
          const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${stop.id}`, { timeout: 10000 });
          if (!resp.ok) continue;
          const data = await resp.json();
          const arrivals: { routeId: string; headsign: string; minsAway: number }[] = (data.arrivals || []).slice(0, 5);

          for (const arr of arrivals) {
            if (arr.minsAway > 3 || arr.minsAway < 0) continue;
            const key = `${stop.id}-${arr.routeId}-${arr.headsign}-${Math.floor(Date.now() / 300000)}`;
            if (notifiedArrivalsRef.current.has(key)) continue;
            notifiedArrivalsRef.current.add(key);

            const title = language === 'fr'
              ? `🚌 ${arr.routeId} arrive dans ${arr.minsAway} min`
              : `🚌 ${arr.routeId} arriving in ${arr.minsAway} min`;
            const body = language === 'fr'
              ? `${arr.headsign} - ${stop.name}`
              : `${arr.headsign} - ${stop.name}`;

            await Notifications.scheduleNotificationAsync({
              content: { title, body, data: { type: 'arrival_alert', stopId: stop.id }, sound: true },
              trigger: null,
            });
          }
        } catch { /* skip stop on error */ }
      }

      // Prune old keys (keep only last 5 min window)
      const currentWindow = Math.floor(Date.now() / 300000);
      for (const key of notifiedArrivalsRef.current) {
        const parts = key.split('-');
        const window = parseInt(parts[parts.length - 1]);
        if (window < currentWindow - 1) notifiedArrivalsRef.current.delete(key);
      }
    };

    checkSavedStopArrivals();
    const interval = setInterval(checkSavedStopArrivals, 30000);
    return () => clearInterval(interval);
  }, [savedBoard, language]);

  const parseGTFS = (data: any, internalStopId: string): Arrival[] => {
    const now = Math.floor(Date.now() / 1000);
    const results: Arrival[] = [];
    for (const ent of (data?.Entity || [])) {
      const tu = ent.TripUpdate; if (!tu) continue;
      for (const stu of (tu.StopTimeUpdate || [])) {
        const stopIdsToMatch = MULTI_PLATFORM_STOPS[internalStopId] || [internalStopId];
        if (!stopIdsToMatch.includes(String(stu.StopId))) continue;
        const arr = stu.Arrival || stu.Departure || {};
        const t2 = parseInt(arr.Time || 0); if (!t2) continue;
        const secsAway = t2 - now;
        if (secsAway < -60 || secsAway > 5400) continue;
        const trip = tu.Trip || {};
        const tripId = String(trip.TripId || '');
        results.push({ id: tripId || String(Math.random()), routeId: trip.RouteId || '?', headsign: getHeadsign(tripId), minsAway: Math.max(0, Math.round(secsAway / 60)), delay: Math.round((arr.Delay || 0) / 60), secsAway });
      }
    }
    return results.sort((a, b) => a.secsAway - b.secsAway).slice(0, 8);
  };

  const loadStop = (id: string, name?: string) => { setStopId(id); setStopName(name || getStopName(id) || id); setLoading(true); fetchArrivals(id); fetchStopReports(id); fetchStopAmenities(id); };

  const geocodeSeq = useRef(0);

  const stoSearchSeq = useRef(0);
  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (text.length >= 2) {
      const upper = text.toUpperCase();
      const results = STOP_SEARCH.filter(s => s.name.toUpperCase().includes(upper) || s.id.includes(text)).slice(0, 4);
      // If numeric input matches STO range and not already in results, add a synthetic STO result
      const num = parseInt(text);
      if (!isNaN(num) && num >= 15000 && num <= 59999 && !results.find(r => r.id === text)) {
        results.unshift({ id: text, internalId: text, name: `STO Stop #${text}` });
        if (results.length > 4) results.pop();
      }
      setSearchResults(results);
      // Also search STO stops from Supabase by name
      if (text.length >= 3 && isNaN(num)) {
        const seq = ++stoSearchSeq.current;
        supabase.from('stops').select('stop_id,name').eq('agency', 'STO').ilike('name', `%${text}%`).limit(4)
          .then(({ data }) => {
            if (seq !== stoSearchSeq.current || !data || data.length === 0) return;
            setSearchResults(prev => {
              const stoResults: StopResult[] = data.filter(s => !prev.find(p => p.id === s.stop_id)).map(s => ({ id: s.stop_id, internalId: s.stop_id, name: s.name }));
              return [...prev, ...stoResults].slice(0, 6);
            });
          }).then(null, () => {});
      }
    } else { setSearchResults([]); setAddressResults([]); return; }
    if (text.length >= 3) {
      const seq = ++geocodeSeq.current;
      fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete-geocode&input=${encodeURIComponent(text)}`)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => { if (seq === geocodeSeq.current) setAddressResults((d.results || []).filter((r: any) => r.lat && r.lng).slice(0, 3)); })
        .catch(() => {});
    }
  };

  const handleSearch = () => {
    if (searchText.length < 2) return;
    const num = parseInt(searchText);
    // STO stop number entered directly
    if (!isNaN(num) && num >= 15000 && num <= 59999) {
      loadStop(searchText, `STO Stop #${searchText}`);
      setSearchText(''); setSearchResults([]); Keyboard.dismiss();
      return;
    }
    const internalId = resolveStopId(searchText);
    if (internalId !== searchText) { loadStop(searchText); setSearchText(''); setSearchResults([]); Keyboard.dismiss(); }
  };

  const reportBusPassed = (routeId: string) => {
    const TWO_HOURS = 2 * 60 * 60 * 1000; const now = Date.now();
    setReports(prev => {
      const existing = prev[routeId];
      const updated: Reports = { ...prev, [routeId]: { count: (existing && existing.expiresAt > now ? existing.count : 0) + 1, expiresAt: now + TWO_HOURS } };
      AsyncStorage.setItem(SK_GHOST_REPORTS, JSON.stringify(updated));
      return updated;
    });
    Alert.alert(t('Thanks!', 'Merci!'), t('Reported - helps other riders.', 'Signalé - aide les autres usagers.'));
  };

  const submitStopReport = async () => {
    if (!reportCategory || !expandedStopId) return;
    setReportSubmitting(true);
    try {
      const deviceId = await getDeviceId();
      const resp = await fetchWithTimeout(`${COMMUNITY_URL}?action=report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stop_id: expandedStopId,
          category: reportCategory,
          description: reportDescription.trim(),
          device_id: deviceId,
        }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('Report submitted', 'Signalement envoye'), t('Thanks for helping improve transit!', 'Merci d\'aider a ameliorer le transport!'));
      setShowReportModal(false);
      setReportCategory(null);
      setReportDescription('');
    } catch (e) {
      Alert.alert(t('Error', 'Erreur'), t('Could not submit report. Try again.', 'Impossible d\'envoyer le signalement. Reessayez.'));
      if (__DEV__) console.warn('submitStopReport failed:', e);
    }
    setReportSubmitting(false);
  };

  const handleQuickAction = (id: string, labelEn: string, labelFr: string) => {
    if (id === 'live') { router.push('/(tabs)/map'); return; }
    if (id === 'alerts') { setAlertsModalVisible(true); return; }
    if (id === 'nearby') { router.push('/(tabs)/nearby' as any); return; }
    if (id === 'saved') { router.push('/(tabs)/saved' as any); return; }
    if (id === 'plan') { router.push('/(tabs)/planner' as any); return; }
    Alert.alert(language === 'fr' ? labelFr : labelEn, t('Coming soon!', 'Bientôt disponible!'));
  };

  const handleServiceTile = (tile: ServiceTile) => {
    if (tile.action === 'alert' && tile.target === 'social') { setSocialModal(true); return; }
    if (tile.action === 'alert' && tile.target === '311') { Linking.openURL('https://ottawa.ca/en/residents/water-and-environment/waste-and-recycling/report-problem').catch(() => {}); return; }
    if (tile.action === 'alert' && tile.target === 'campus') { if (!selectedCampus) setCampusPicker(true); else setCampusModal(true); return; }
    if (tile.action === 'alert') { setAlertsModalVisible(true); return; }
    if (tile.action === 'navigate' && tile.target?.includes('events?source=')) {
      const source = tile.target.includes('eventbrite') ? 'eventbrite' : 'ticketmaster';
      setEventsSource(source);
      setEventsModal(true);
      if (source === 'ticketmaster') fetchTicketmasterEvents();
      else fetchEventbriteEvents();
      return;
    }
    if (tile.action === 'navigate' && tile.target) {
      if (tile.target.includes('?category=')) {
        const [path, query] = tile.target.split('?category=');
        router.push({ pathname: path, params: { category: query } } as any);
      } else { router.push(tile.target as any); }
      return;
    }
    if (tile.action === 'link' && tile.target) {
      Linking.openURL(tile.target).catch(() => Alert.alert(language === 'fr' ? tile.label_fr : tile.label_en, t('Could not open link.', 'Impossible d\'ouvrir le lien.')));
    }
  };


  // ── Social / Happy Hour Modal ────────────────────────────────
  // HAPPY_HOUR_VENUES imported from lib/happyHourData.ts

  const getSocialVenues = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const filtered = HAPPY_HOUR_VENUES
      .filter(v => socialTab === 'all' || v.type.includes(socialTab === 'bars' ? 'bar' : socialTab === 'clubs' ? 'club' : 'restaurant'))
      .map(v => {
        const todayDeals = v.deals.filter(d => d.days.includes(day));
        const activeDeals = todayDeals.filter(d => timeStr >= d.start && timeStr <= d.end);
        const upcomingDeals = todayDeals.filter(d => timeStr < d.start);
        if (todayDeals.length === 0 || (activeDeals.length === 0 && upcomingDeals.length === 0)) return null;
        return { ...v, todayDeals, activeDeals, upcomingDeals, isActive: activeDeals.length > 0 };
      })
      .filter(Boolean) as any[];
    // Sort: active first, then upcoming, then by name
    return filtered.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const toggleSaveVenue = async (venue: any) => {
    const isSaved = savedVenues.some(v => v.name === venue.name && v.address === venue.address);
    const updated = isSaved
      ? savedVenues.filter(v => !(v.name === venue.name && v.address === venue.address))
      : [...savedVenues, { name: venue.name, address: venue.address, type: venue.type, lat: venue.lat, lng: venue.lng, deals: venue.deals, fsqId: venue.fsqId, rating: venue.rating, photoUrl: venue.photoUrl, lastVerified: venue.lastVerified }];
    setSavedVenues(updated);
    await AsyncStorage.setItem(SK_SAVED_VENUES, JSON.stringify(updated)).catch(() => {});
  };







  const isNight = new Date().getHours() >= 21;
  const isFav = favs.find(f => f.id === stopId);
  const activeAlerts = alerts.filter(a => a.category !== 'accessibility');
  const hasAlerts = activeAlerts.length > 0;

  // Disruption banner: non-dismissed active alerts
  const bannerAlerts = activeAlerts.filter(a => !dismissedAlertIds.has(String(a.id)));
  const dismissBannerAlert = async (alertId: string) => {
    const next = new Set([...dismissedAlertIds, alertId]);
    setDismissedAlertIds(next);
    // Prune to 100 entries max so storage never grows unboundedly
    const arr = [...next].slice(-100);
    try { await AsyncStorage.setItem(SK_DISMISSED_ALERT_IDS, JSON.stringify(arr)); } catch {}
  };

  const alertBarText = () => {
    if (alertsLoading) return t('Checking for alerts...', 'Vérification des alertes...');
    if (!hasAlerts) return t('No active service alerts', 'Aucune alerte de service active');
    const first = activeAlerts[0];
    return activeAlerts.length === 1 ? first.title : `${first.title} +${activeAlerts.length - 1} ${t('more', 'autres')}`;
  };

  // ── Campus food fetch ──
  const fetchCampusFood = async (campus: CampusConfig) => {
    setCampusFoodLoading(true);
    try {
      const url = `https://routeo-backend.vercel.app/api/places?action=nearby&location=${campus.foodCenter.lat},${campus.foodCenter.lng}&radius=${campus.foodRadius}&type=restaurant`;
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setCampusFood((data.results || []).filter((p: any) => p.geometry?.location).slice(0, 12).map((p: any) => ({
        id: p.place_id,
        name: p.name,
        vicinity: p.vicinity,
        rating: p.rating,
        open: p.opening_hours?.open_now,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
      })));
    } catch { setCampusFood([]); }
    setCampusFoodLoading(false);
  };

  const selectCampus = async (campus: CampusConfig) => {
    setSelectedCampus(campus);
    setCampusPicker(false);
    setCampusModal(true);
    await AsyncStorage.setItem(SK_CAMPUS, campus.id).catch(() => {});
  };

  const routeToCampusPlace = (name: string, lat: number, lng: number) => {
    setCampusModal(false);
    router.push({ pathname: '/(tabs)/planner', params: { toLabel: name, toLat: String(lat), toLng: String(lng) } } as any);
  };


  const alertDotColour = () => { if (!hasAlerts) return colours.accent; return CATEGORY_COLOUR[activeAlerts[0]?.category] || colours.orange; };




  const toggleTimeFormat = async () => {
    const next = timeFormat === 'relative' ? 'absolute' : 'relative';
    setTimeFormat(next);
    await AsyncStorage.setItem(SK_TIME_FORMAT, next);
  };

  const shareETA = async (item: Arrival) => {
    const absTime = fmtAbsTime(item.minsAway);
    const stopLabel = favs.find(f => f.id === expandedStopId)?.name || stopName;
    const routeLabel = item.routeId === '1' || item.routeId === '2' ? 'O-Train' : `Route ${item.routeId}`;
    const msg = `My ${routeLabel} bus arrives at ${stopLabel} in ${item.minsAway} min (${absTime}). Tracked with RouteO`;
    try { await Share.share({ message: msg }); } catch (e) { if (__DEV__) console.warn('share ETA failed:', e); }
  };

  const fetchFullSchedule = async (routeId: string, headsign: string) => {
    setScheduleRoute({ routeId, headsign });
    setScheduleLoading(true);
    setScheduleTrips([]);
    try {
      const sid = expandedStopId || stopId;
      const { data } = await supabase
        .from('stop_times')
        .select('arrival_time, trip_id, route_id')
        .eq('stop_id', sid)
        .eq('route_id', routeId)
        .order('arrival_time', { ascending: true });
      if (data) {
        const today = new Date();
        const dayMap = ['sunday', 'saturday'];
        const keyword = today.getDay() === 0 ? 'sunday' : today.getDay() === 6 ? 'saturday' : 'weekday';
        // Get trip service IDs to filter
        const tripIds = [...new Set(data.map((r: any) => r.trip_id).filter(Boolean))];
        let serviceMap: { [tripId: string]: string } = {};
        if (tripIds.length > 0) {
          const { data: tripData } = await supabase
            .from('trips')
            .select('trip_id, service_id')
            .in('trip_id', tripIds);
          if (tripData) for (const t of tripData) serviceMap[t.trip_id] = t.service_id || '';
        }
        const filtered = data.filter((r: any) => {
          const svc = serviceMap[r.trip_id] || '';
          return !svc || svc.toLowerCase().includes(keyword);
        });
        const seen = new Set<string>();
        const unique = filtered.filter((r: any) => {
          if (seen.has(r.arrival_time)) return false;
          seen.add(r.arrival_time);
          return true;
        });
        setScheduleTrips(unique.map((r: any) => ({ time: r.arrival_time, tripId: r.trip_id })));
      }
    } catch (e) { if (__DEV__) console.warn('fetch full schedule failed:', e); }
    setScheduleLoading(false);
  };

  const renderArrival = (item: Arrival) => {
    const isLRT = item.isScheduled || item.routeId.includes('350') || item.routeId.includes('354') || item.routeId === '1' || item.routeId === '2';
    const now = Date.now();
    const reportEntry = reports[item.routeId];
    const reportCount = reportEntry && reportEntry.expiresAt > now ? reportEntry.count : 0;
    const ghostBus = reportCount >= 2;
    const timeDisplay = timeFormat === 'absolute'
      ? fmtAbsTime(item.minsAway)
      : (item.minsAway === 0 ? t('Due', 'Imminent') : `${item.minsAway}m`);
    const rel = reliabilityScores[item.routeId];
    const relColor = rel ? (rel.onTimeRate > 85 ? '#34C759' : rel.onTimeRate >= 70 ? '#FFD60A' : '#FF3B30') : null;
    return (
      <View key={item.id} style={[styles.arrivalRow, { borderBottomColor: colours.border, backgroundColor: colours.surface }, ghostBus && styles.ghostRow]}>
        <View style={{ alignItems: 'center', gap: 3 }}>
          <TouchableOpacity onPress={() => fetchFullSchedule(item.routeId, item.headsign)} style={[styles.badge, { backgroundColor: isLRT ? colours.accentAlt + '18' : colours.accent + '18' }]}>
            <Text style={{ fontWeight: '800', fontSize: fonts.md, color: isLRT ? colours.lrt : colours.accent }}>{isLRT ? '🚊' : item.routeId}</Text>
          </TouchableOpacity>
          {rel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: relColor! }} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: relColor! }}>{rel.onTimeRate}%</Text>
            </View>
          )}
        </View>
        <View style={styles.arrivalInfo}>
          <TouchableOpacity onPress={() => fetchFullSchedule(item.routeId, item.headsign)}>
            <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
              {isLRT ? 'O-Train' : `${t('Route', 'Route')} ${item.routeId}`}
              {item.delay > 0 ? <Text style={{ color: colours.orange, fontSize: fonts.sm }}> (+{item.delay}m {t('late', 'retard')})</Text> : null}

            </Text>
          </TouchableOpacity>
          {item.headsign ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }} numberOfLines={1}>→ {item.headsign}</Text> : null}
          {item.isScheduled && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Ionicons name="warning" size={11} color={colours.orange} />
              <Text style={{ fontSize: 10, color: colours.orange, fontWeight: '600' }}>{t('Scheduled only', 'Horaire seulement')}</Text>
            </View>
          )}
          {ghostBus && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Text style={{ fontSize: 11 }}>{'👻'}</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colours.orange }}>{t('Ghost bus reported', 'Bus fantôme signalé')}</Text>
            </View>
          )}
          {!ghostBus && reportCount === 1 && (
            <TouchableOpacity onPress={() => reportBusPassed(item.routeId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colours.orange + '12' }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={{ fontSize: 10, color: colours.orange, fontWeight: '600' }}>{t('1 rider says passed', '1 usager dit passé')}</Text>
              <Text style={{ fontSize: 10, color: colours.orange, fontWeight: '600' }}> - </Text>
              <Text style={{ fontSize: 10, color: colours.orange, fontWeight: '800' }}>{t('agree?', 'd\'accord?')}</Text>
            </TouchableOpacity>
          )}
          {(() => {
            const c = crowdingData[item.routeId];
            if (c) {
              const label = c.avg <= 0.8 ? t('Usually empty', 'Habituellement vide') : c.avg <= 1.7 ? t('Some seats', 'Quelques places') : c.avg <= 2.4 ? t('Gets crowded', 'Souvent bondé') : t('Usually packed', 'Habituellement plein');
              const color = c.avg <= 0.8 ? '#34C759' : c.avg <= 1.7 ? '#FFD60A' : c.avg <= 2.4 ? '#FF9500' : '#FF3B30';
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{label}</Text>
                  {c.confidence === 'low' && <Text style={{ fontSize: 9, color: colours.muted, fontStyle: 'italic' }}>{t('(few reports)', '(peu de données)')}</Text>}
                </View>
              );
            }
            if (item.minsAway > 2) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('Did this bus come?', 'Ce bus est-il passé?')}</Text>
                <TouchableOpacity onPress={() => reportBusPassed(item.routeId)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30' + '18', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Report as missed', 'Signaler comme manqué')}>
                  <Ionicons name="close" size={12} color="#FF3B30" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light); supabase.from('transit_reliability_events').insert({ event_type: 'ghost_bus', stop_id: stopId, route_id: item.routeId, reported_at: new Date().toISOString() }); }} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#34C759' + '18', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Confirm it came', 'Confirmer son passage')}>
                  <Ionicons name="checkmark" size={12} color="#34C759" />
                </TouchableOpacity>
              </View>
            );
          })()}
          {item.delay > 5 && (() => {
            const ctx = getDelayContext(item.routeId, item.delay, alerts, weather, forecast);
            if (!ctx) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Ionicons name={ctx.icon as any} size={11} color={ctx.colour} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: ctx.colour }}>{t(ctx.label, ctx.labelFr)}</Text>
              </View>
            );
          })()}
        </View>
        <View style={styles.arrivalRight}>
          <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: item.minsAway <= 2 ? colours.red : colours.accent }}>{timeDisplay}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {!item.isScheduled && (
              <View>
                <TouchableOpacity onPress={() => { reportBusPassed(item.routeId); setPassedHintShown(true); }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.muted + '18', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Report bus passed', 'Signaler le bus passé')}>
                  <Ionicons name="hand-left-outline" size={14} color={colours.orange} />
                </TouchableOpacity>
              </View>
            )}
            {stopReports[stopId]?.count > 0 && (
              <TouchableOpacity
                onPress={() => { setReportSheetStopId(stopId); setShowReportSheet(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Ionicons name="flag" size={14} color={colours.orange} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: colours.orange }}>{stopReports[stopId].count}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const iconColor = (icon: string) => {
    if (icon === 'sunny') return '#e8a020'; if (icon === 'partly-sunny') return '#c0852a';
    if (icon === 'rainy') return '#004890'; if (icon === 'snow') return '#7b5ea7';
    if (icon === 'thunderstorm') return '#cc3b2a'; return '#6b7f99';
  };



  const renderExpandedArrivals = () => {
    const expandedFav = favs.find(f => f.id === expandedStopId);
    const expandedName = expandedFav?.name || stopName;
    const isSaved = !!favs.find(f => f.id === expandedStopId);
    return (
      <Modal visible={!!expandedStopId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setExpandedStopId(null)}>
        <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }} numberOfLines={2}>{expandedName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{lastUpdated ? `${t('Updated', 'Mis \u00E0 jour')} ${lastUpdated}` : t('All arrivals', 'Toutes les arriv\u00E9es')}</Text>
                <TouchableOpacity onPress={toggleTimeFormat} style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }} accessibilityRole="button" accessibilityLabel={t('Toggle time format', 'Changer le format de l\'heure')}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: timeFormat === 'relative' ? colours.accent : 'transparent' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: timeFormat === 'relative' ? 'white' : colours.muted }}>8 min</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: timeFormat === 'absolute' ? colours.accent : 'transparent' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: timeFormat === 'absolute' ? 'white' : colours.muted }}>4:32 PM</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => { if (expandedStopId) { isSaved ? removeFav(expandedStopId) : addFav(expandedStopId, expandedName); } }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: isSaved ? colours.accent : colours.border, backgroundColor: isSaved ? colours.accent + '15' : colours.surface, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={isSaved ? t('Saved', 'Sauvegardé') : t('Save stop', 'Sauvegarder')}>
                <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={15} color={isSaved ? colours.accent : colours.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => fetchArrivals(stopId)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Refresh', 'Actualiser')}>
                <Ionicons name="refresh" size={15} color={colours.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExpandedStopId(null)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                <Ionicons name="close" size={16} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {loading ? (<View style={{ marginTop: 8 }}>{[0,1,2].map(i => <ArrivalRowSkeleton key={i} colours={colours} />)}</View>) : error ? (<View style={styles.modalCenter}><Ionicons name="wifi-outline" size={36} color={colours.muted} /><Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text></View>) : arrivals.length === 0 ? (<View style={styles.modalCenter}><Ionicons name="time-outline" size={48} color={colours.muted} /><Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text></View>) : (<View style={{ marginTop: 8 }}>{cachedAt && (<View style={{ backgroundColor: '#ff9500' + '15', borderLeftWidth: 3, borderLeftColor: '#ff9500', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}><Text style={{ fontSize: fonts.sm, color: '#ff9500', fontWeight: '600' }}>{t(`Offline - last updated ${Math.round((Date.now() - cachedAt) / 60000)} min ago`, `Hors ligne - dernière mise à jour il y a ${Math.round((Date.now() - cachedAt) / 60000)} min`)}</Text></View>)}{arrivals.map(renderArrival)}</View>)}
            {/* Report an issue button */}
            <TouchableOpacity
              onPress={() => { setReportCategory(null); setReportDescription(''); if (!expandedStopId && stopId) setExpandedStopId(stopId); setShowReportModal(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 20, marginTop: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cc3b2a40', backgroundColor: '#cc3b2a10' }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('Report a stop issue', 'Signaler un probleme a l\'arret')}
            >
              <Ionicons name="warning-outline" size={16} color="#cc3b2a" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#cc3b2a' }}>
                {t('Report an issue at this stop', 'Signaler un probleme a cet arret')}
              </Text>
            </TouchableOpacity>
            {!helpBannerDismissed && arrivals.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colours.muted + '12' }}>
                <Ionicons name="people-outline" size={14} color={colours.muted} style={{ marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 10, color: colours.muted, fontWeight: '600' }}>{t('Help Ottawa riders - tap to report crowding or missed buses', 'Aidez les usagers - signalez l\'achalandage ou les bus manqués')}</Text>
                <TouchableOpacity onPress={() => setHelpBannerDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                  <Ionicons name="close" size={14} color={colours.muted} />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  };



  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colours.bg }]}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        <AlertsModal visible={alertsModalVisible} onClose={() => setAlertsModalVisible(false)} colours={colours} fonts={fonts} t={t} alerts={alerts} alertsLoading={alertsLoading} cardShadow={cardShadow} />
        {weatherModalVisible && <WeatherModal visible={weatherModalVisible} onClose={() => setWeatherModalVisible(false)} colours={colours} fonts={fonts} t={t} weather={weather} forecast={forecast} dailyForecast={dailyForecast} locationName={locationName} />}
        {!!expandedStopId && renderExpandedArrivals()}
        <StopReportModal visible={showReportModal} onClose={() => setShowReportModal(false)} colours={colours} fonts={fonts} t={t} expandedStopId={expandedStopId} stopName={stopName} reportCategory={reportCategory} setReportCategory={setReportCategory} reportDescription={reportDescription} setReportDescription={setReportDescription} reportSubmitting={reportSubmitting} submitStopReport={submitStopReport} />

        {/* Full Schedule Modal */}
        {!!scheduleRoute && <Modal visible={!!scheduleRoute} animationType="slide" transparent onRequestClose={() => setScheduleRoute(null)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>
                    {t('Route', 'Route')} {scheduleRoute?.routeId} - {t('Full Schedule', 'Horaire complet')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                    {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {scheduleRoute?.headsign ? ` · ${scheduleRoute.headsign}` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }} onPress={() => setScheduleRoute(null)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                  <Ionicons name="close" size={18} color={colours.text} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                {scheduleLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <ActivityIndicator color={colours.accent} />
                    <Text style={{ color: colours.muted, marginTop: 8, fontSize: fonts.sm }}>{t('Loading schedule...', 'Chargement...')}</Text>
                  </View>
                ) : scheduleTrips.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="calendar-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8, fontSize: fonts.md }}>{t('No trips found for today', 'Aucun trajet trouv\u00E9 aujourd\u2019hui')}</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {scheduleTrips.map((trip, i) => {
                      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
                      const parts = trip.time.split(':').map(Number);
                      const tripMins = parts[0] * 60 + (parts[1] || 0);
                      const isPast = tripMins < nowMins;
                      const isCurrent = Math.abs(tripMins - nowMins) <= 5;
                      const displayTime = (() => {
                        const h = parts[0] % 24;
                        const m = String(parts[1] || 0).padStart(2, '0');
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        return `${h % 12 || 12}:${m} ${ampm}`;
                      })();
                      return (
                        <View key={i} style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                          borderWidth: isCurrent ? 2 : 1,
                          borderColor: isCurrent ? colours.accent : colours.border,
                          backgroundColor: isCurrent ? colours.accent + '15' : isPast ? colours.bg : colours.surface,
                          opacity: isPast ? 0.4 : 1,
                        }}>
                          <Text style={{ fontSize: 13, fontWeight: isCurrent ? '800' : '600', color: isCurrent ? colours.accent : colours.text }}>{displayTime}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>}

        <BoardExpandModal boardExpandItem={boardExpandItem} onClose={() => setBoardExpandItem(null)} colours={colours} fonts={fonts} t={t} arrivals={arrivals} loading={loading} favs={favs} addFav={addFav} removeFav={removeFav} fetchArrivals={fetchArrivals} expandedStopCoords={expandedStopCoords} router={router} renderArrival={renderArrival} />
        <SocialModal
          visible={socialModal}
          onClose={() => setSocialModal(false)}
          colours={colours}
          fonts={fonts}
          t={t}
          language={language}
          router={router}
          savedVenues={savedVenues}
          setSavedVenues={setSavedVenues}
          getSocialVenues={getSocialVenues}
          socialTab={socialTab}
          setSocialTab={setSocialTab}
          socialFeedbackVenue={socialFeedbackVenue}
          setSocialFeedbackVenue={setSocialFeedbackVenue}
          socialFeedbackText={socialFeedbackText}
          setSocialFeedbackText={setSocialFeedbackText}
          socialFeedbackSent={socialFeedbackSent}
          setSocialFeedbackSent={setSocialFeedbackSent}
          socialFeedbackSending={socialFeedbackSending}
          setSocialFeedbackSending={setSocialFeedbackSending}
          socialDealForm={socialDealForm}
          setSocialDealForm={setSocialDealForm}
          socialDealVenue={socialDealVenue}
          setSocialDealVenue={setSocialDealVenue}
          socialDealDesc={socialDealDesc}
          setSocialDealDesc={setSocialDealDesc}
          socialDealSending={socialDealSending}
          setSocialDealSending={setSocialDealSending}
          socialDealSent={socialDealSent}
          setSocialDealSent={setSocialDealSent}
          cardShadow={cardShadow}
          supabase={supabase}
          toggleSaveVenue={toggleSaveVenue}
        />
        <EventsModal
          visible={eventsModal}
          onClose={() => { setEventsModal(false); setEventsSearch(''); setEventsCategory(null); setEventsNearMe(false); }}
          colours={colours}
          fonts={fonts}
          t={t}
          language={language}
          events={events}
          eventsLoading={eventsLoading}
          eventsSource={eventsSource}
          setEventsSource={setEventsSource}
          eventsSearch={eventsSearch}
          setEventsSearch={setEventsSearch}
          eventsCategory={eventsCategory}
          setEventsCategory={setEventsCategory}
          eventsFreeOnly={eventsFreeOnly}
          setEventsFreeOnly={setEventsFreeOnly}
          eventsNearMe={eventsNearMe}
          toggleNearMe={toggleNearMe}
          eventsUserCoords={eventsUserCoords}
          eventsGeoCache={eventsGeoCache}
          eventsCacheTime={eventsCacheTime}
          fetchTicketmasterEvents={fetchTicketmasterEvents}
          fetchEventbriteEvents={fetchEventbriteEvents}
          cardShadow={cardShadow}
        />
        <CampusModal campusPicker={campusPicker} campusModal={campusModal} setCampusPicker={setCampusPicker} setCampusModal={setCampusModal} selectedCampus={selectedCampus} selectCampus={selectCampus} campusTab={campusTab} setCampusTab={setCampusTab} campusFood={campusFood} campusFoodLoading={campusFoodLoading} fetchCampusFood={fetchCampusFood} routeToCampusPlace={routeToCampusPlace} colours={colours} fonts={fonts} t={t} language={language} />

        {/* Stop Reports Sheet */}
        {showReportSheet && <Modal visible={showReportSheet} animationType="slide" transparent onRequestClose={() => setShowReportSheet(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 34 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{t('Stop Reports', 'Signalements')}</Text>
                <TouchableOpacity onPress={() => setShowReportSheet(false)}>
                  <Ionicons name="close-circle" size={24} color={colours.muted} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
                {(stopReports[reportSheetStopId]?.reports || []).map((r: any, i: number) => {
                  const categoryLabels: Record<string, string> = {
                    bench_broken: t('Broken bench', 'Banc brise'),
                    shelter_missing: t('Missing shelter', 'Abribus manquant'),
                    accessibility: t('Accessibility issue', 'Probleme d\'accessibilite'),
                    cleanliness: t('Cleanliness', 'Proprete'),
                    schedule_missing: t('Missing schedule', 'Horaire manquant'),
                    other: t('Other', 'Autre'),
                  };
                  const statusColors: Record<string, string> = { open: colours.orange, acknowledged: '#0072bc', resolved: '#00A78D' };
                  return (
                    <View key={r.id || i} style={{ backgroundColor: colours.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colours.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="flag" size={14} color={colours.orange} />
                          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{categoryLabels[r.category] || r.category}</Text>
                        </View>
                        <View style={{ backgroundColor: (statusColors[r.status] || colours.muted) + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: statusColors[r.status] || colours.muted }}>{(r.status || 'open').toUpperCase()}</Text>
                        </View>
                      </View>
                      {r.description ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 6 }}>{r.description}</Text> : null}
                      <Text style={{ fontSize: 10, color: colours.muted, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
                    </View>
                  );
                })}
                {(!stopReports[reportSheetStopId]?.reports || stopReports[reportSheetStopId]?.reports.length === 0) && (
                  <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No reports for this stop', 'Aucun signalement pour cet arret')}</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>}

        {/* Crowding Report Sheet */}
        {showCrowdingSheet && <Modal visible={showCrowdingSheet} animationType="slide" transparent onRequestClose={() => setShowCrowdingSheet(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{t('How full is the bus?', 'Le bus est plein?')}</Text>
                  {crowdingReportItem && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Route', 'Route')} {crowdingReportItem.routeId} → {crowdingReportItem.headsign}</Text>}
                </View>
                <TouchableOpacity onPress={() => setShowCrowdingSheet(false)}>
                  <Ionicons name="close-circle" size={24} color={colours.muted} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 20, gap: 12 }}>
                {([
                  { level: 0, icon: 'bus-outline', label: t('Empty', 'Vide'), color: '#34C759' },
                  { level: 1, icon: 'person-outline', label: t('Some seats', 'Quelques places'), color: '#FFD60A' },
                  { level: 2, icon: 'people-outline', label: t('Standing room', 'Debout seulement'), color: '#FF9500' },
                  { level: 3, icon: 'warning-outline', label: t('Packed', 'Bondé'), color: '#FF3B30' },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.level}
                    disabled={crowdingSubmitting}
                    onPress={() => submitCrowdingReport(opt.level)}
                    style={{ width: '47%', backgroundColor: opt.color + '15', borderWidth: 1.5, borderColor: opt.color + '40', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={opt.icon as any} size={28} color={opt.color} />
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Hourly crowding chart */}
              {crowdingHourly.length > 0 && (
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Today by hour', 'Aujourd\'hui par heure')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 60 }}>
                    {Array.from({ length: 17 }, (_, i) => i + 6).map(hour => {
                      const entry = crowdingHourly.find(e => e.hour === hour);
                      const avg = entry?.avg ?? 0;
                      const barH = entry ? Math.max(6, (avg / 3) * 52) : 4;
                      const barColor = !entry ? colours.border : avg <= 0.8 ? '#34C759' : avg <= 1.7 ? '#FFD60A' : avg <= 2.4 ? '#FF9500' : '#FF3B30';
                      const isNow = new Date().getHours() === hour;
                      return (
                        <View key={hour} style={{ flex: 1, alignItems: 'center' }}>
                          <View style={{ width: '80%', height: barH, borderRadius: 3, backgroundColor: barColor, opacity: isNow ? 1 : 0.7 }} />
                          {(hour % 3 === 0 || isNow) && <Text style={{ fontSize: 7, color: isNow ? colours.accent : colours.muted, fontWeight: isNow ? '800' : '600', marginTop: 2 }}>{hour}</Text>}
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6 }}>
                    {[{ c: '#34C759', l: t('Empty', 'Vide') }, { c: '#FFD60A', l: t('Some', 'Moyen') }, { c: '#FF9500', l: t('Busy', 'Occupé') }, { c: '#FF3B30', l: t('Full', 'Plein') }].map(x => (
                      <View key={x.c} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: x.c }} />
                        <Text style={{ fontSize: 8, color: colours.muted, fontWeight: '600' }}>{x.l}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {crowdingHourlyLoading && <ActivityIndicator color={colours.accent} size="small" style={{ marginBottom: 12 }} />}
              <Text style={{ textAlign: 'center', fontSize: fonts.sm, color: colours.muted, paddingHorizontal: 20 }}>{t('Your report helps other riders plan their trip', 'Votre signalement aide les autres usagers')}</Text>
            </View>
          </View>
        </Modal>}

        {/* Crowding toast */}
        {crowdingToast && (
          <View style={{ position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#34C759', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, zIndex: 9999, alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Thanks! Helping Ottawa riders', 'Merci! Vous aidez les usagers')}</Text>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true} contentContainerStyle={{ paddingBottom: 20 }} onScrollBeginDrag={() => { Keyboard.dismiss(); setSearchResults([]); }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text }}>
              {t('My Board', 'Mon tableau')}
            </Text>
            <TouchableOpacity onPress={() => setWeatherModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}>
              {weather && <Ionicons name={weather.icon as any} size={13} color="#e8a020" />}
              <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{weather ? `${weather.temp}°` : '-'}</Text>
            </TouchableOpacity>
          </View>

          {/* Class Schedule Hero Card */}
          {(() => {
            const [isStudent, setIsStudent] = React.useState(false);
            React.useEffect(() => {
              AsyncStorage.getItem('routeo_is_student').then(val => setIsStudent(val === 'true')).catch(() => {});
            }, []);
            if (!isStudent) return null;
            return classSchedule && heroCampus && (() => {
            const nc = nextClassResult;
            if (!nc || nc.minsUntilLeave <= 0) return null;
            return (
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/(tabs)/planner',
                    params: { toLabel: heroCampus.name, toLat: String(heroCampus.lat), toLng: String(heroCampus.lng) }
                  } as any);
                }}
                activeOpacity={0.85}
                style={{
                  marginHorizontal: 20,
                  marginBottom: 16,
                  backgroundColor: colours.surface,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: colours.accent,
                  padding: 16,
                  ...cardShadow
                }}
              >
                {/* Header with campus name and edit button */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('Next Class', 'Prochain cours')}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, marginTop: 4 }}>
                      {heroCampus.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/account' as any)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="pencil" size={16} color={colours.accent} />
                  </TouchableOpacity>
                </View>

                {/* Class name */}
                <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 8 }}>
                  {nc.entry.name}
                </Text>

                {/* Room if available */}
                {nc.entry.room && (
                  <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 12 }}>
                    {t('Room', 'Salle')}: {nc.entry.room}
                  </Text>
                )}

                {/* Leave in X min - big prominent number */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 32, fontWeight: '800', color: colours.accent }}>
                      {nc.minsUntilLeave}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('min to leave', 'min pour partir')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color: colours.text, fontWeight: '600' }}>
                      {t('Starts at', 'Commence à')}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colours.accent, marginTop: 2 }}>
                      {schedFmt12h(nc.entry.startTime)}
                    </Text>
                  </View>
                </View>

                {/* Tap to plan indicator */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colours.border }}>
                  <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600' }}>
                    {t('Tap to plan route', 'Appuyez pour planifier')}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={colours.accent} />
                </View>
              </TouchableOpacity>
            );
            })();
          })()}

          {/* Campus Events */}
          {campusEvents.length > 0 && (
            <View style={{ paddingTop: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 }}>
                Campus Events
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {campusEvents.slice(0, 8).map((ev, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => ev.url && Linking.openURL(ev.url)}
                    style={{ width: 200, padding: 14, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      <Ionicons name="school-outline" size={16} color={colours.accent} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{ev.name}</Text>
                    {ev.date && <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }}>{ev.date}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Saved Stops */}
          <MyStopsSection
            boardItems={boardContextStops}
            colours={colours}
            t={t}
            onStopPress={(item) => {
              loadStop((item as any).id, (item as any).name);
              setBoardExpandItem(item as any);
            }}
          />

          {/* Your Spots */}
          <YourSpotsSection
            savedPlaces={savedPlaces}
            colours={colours}
            fonts={fonts}
            language={language}
            t={t}
            cardShadow={cardShadow}
            onRemove={removeSavedPlace}
          />

          {/* Tonight + Deals */}
          <TonightSection
            events={events}
            eventsLoading={eventsLoading}
            colours={colours}
            t={t}
            getSocialVenues={getSocialVenues}
            onEventPress={(url) => url && Linking.openURL(url)}
            onWhoIsIn={async (event, action) => {
              const eventPayload = { name: event.name, venue: event.venue, date: event.date, url: event.url, image: event.image };
              if (action === 'going' || action === 'interested') {
                const { data: { user } } = await supabase.auth.getUser();
                console.log('[WhoIsIn] action:', action, 'user:', user?.id);
                if (user) {
                  // Insert hangout
                  const { error } = await supabase
                    .from('hangouts')
                    .insert({
                      created_by: user.id,
                      venue_name: event.venue || event.name,
                      event_name: event.name,
                      venue_lat: null,
                      venue_lng: null,
                    });
                  console.log('[WhoIsIn] insert error:', error?.message);

                  // Fetch the hangout we just created
                  const { data: hangout } = await supabase
                    .from('hangouts')
                    .select('id')
                    .eq('created_by', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                  console.log('[WhoIsIn] hangout result:', hangout?.id);

                  if (hangout) {
                    // Insert RSVP
                    await supabase.from('hangout_rsvps').insert({
                      hangout_id: hangout.id,
                      user_id: user.id,
                      status: action,
                    });
                  }
                  // Also write to city_board_rsvps for The Wall
                  await supabase.from('city_board_rsvps').upsert({
                    user_id: user.id,
                    venue_name: event.venue || event.name,
                    event_type: action,
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                  }, { onConflict: 'user_id,venue_name' });
                }
              }
              router.push({
                pathname: '/(tabs)/friends',
                params: { shareEvent: JSON.stringify(eventPayload) }
              } as any);
            }}
          />

          {/* Around Ottawa */}
          <AroundOttawaSection
            colours={colours}
            t={t}
            cardShadow={cardShadow}
            language={language}
            onSaveToggle={() => {
              AsyncStorage.getItem(SK_SAVED_PLACES).then(val => {
                try { if (val) setSavedPlaces(JSON.parse(val)); } catch {}
              });
            }}
          />

        </ScrollView>

      </View>
    </KeyboardAvoidingView>
  );
}

export default function LiveScreen() {
  return (
    <HomeErrorBoundary>
      <LiveScreenInner />
    </HomeErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%', flexShrink: 1 },
  nightBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontWeight: '500' },
  searchBtn: { paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  dropdown: { borderWidth: 1, borderRadius: 14, marginTop: 6, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  arrivalsCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  boardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addFavBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  ghostRow: { opacity: 0.5 },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  arrivalInfo: { flex: 1 },
  arrivalRight: { alignItems: 'flex-end', gap: 6 },
  reportBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  centerState: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  sectionLabel: { fontWeight: '700', paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' },
  notifBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 14, borderWidth: 1 },
  notifLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  stationRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  stationDotCol: { width: 20, alignItems: 'center', marginRight: 12 },
  stationDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  stationLine: { width: 2, height: 16, marginTop: 2 },
  cardsRow: { paddingLeft: 20, paddingRight: 20, gap: 12, paddingBottom: 4 },
  discoverCardImage: { width: '100%', height: '100%', justifyContent: 'flex-end' },
  discoverCardFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  categoryBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  discoverCardBottom: { padding: 10 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1 },
  modalClose: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  lrtStatusCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 14, borderRadius: 14, borderWidth: 1 },
  alertCard: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4 },
  alertCatBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  routeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
2