import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, AppState, FlatList, Image, ImageBackground, Keyboard,
    KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StatusBar,
    StyleSheet, Text, TextInput, TouchableOpacity,
    TouchableWithoutFeedback, View, useWindowDimensions
} from 'react-native';
import { ArrivalRowSkeleton } from '../../components/Shimmer';
import { useApp } from '../../context/AppContext';
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
// DraggableFlatList disabled for beta — using plain FlatList to fix touch blocking
// import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
const ScaleDecorator = ({ children }: { children: React.ReactNode }) => <>{children}</>;

type SavedPlace = { id: string; name: string; vicinity: string; rating?: number; photoRef?: string; categoryIcon: string; categoryColor: string; categoryLabel_en: string; categoryLabel_fr: string; lat?: number; lng?: number };
// ── Universal saved board item type ──
type SavedBoardItem =
  | { type: 'bus_stop';      id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'lrt_station';   id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'garbage' }
  | { type: 'service_alert' }
  | { type: 'gas_prices' }
  | { type: 'otrain' }
  | { type: 'services' }
  | { type: 'discover' }
  | { type: 'external_link'; id: string; label_en: string; label_fr: string; icon: string; accent: string; url: string }
  | { type: 'campus' }
  | { type: 'news' }
  | { type: 'neighbourhood'; id: string; name_en: string; name_fr: string };

import { CAMPUSES, CampusConfig, fmt12h, getDayLabel, getNextDeparture, isLibraryOpen } from '../../lib/campusData';
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
    SK_GARBAGE_ADDRESS, SK_GARBAGE_LAT, SK_GARBAGE_LNG,
    SK_GARBAGE_NOTIF_ID,
    SK_GARBAGE_PLACE_ID,
    SK_GAS_VOTED_IDS,
    SK_GHOST_REPORTS,
    SK_NOTIF_SETTINGS,
    SK_OTTAWA_LIFE,
    SK_QUICK_ACTIONS,
    SK_SAVED_BOARD,
    SK_SAVED_PLACES,
    SK_SAVED_ROUTES,
    SK_SECTION_ORDER,
    SK_SEEN_ALERT_IDS, SK_TIME_FORMAT,
    SK_TODAY_EVENTS
} from '../../lib/storageKeys';
// neighbourhoodData import removed — discover section moved to dedicated tab
// NewsArticle import removed — news lives in dedicated News tab
import { getDelayContext } from '../../lib/delayContext';
import { FrequentRoute, detectFrequentRoutes } from '../../lib/frequentRoutes';
import { SK_CROWDING_CACHE, SK_FREQUENT_ARRIVALS_CACHE, SK_FREQUENT_CARD_DISMISSED, SK_LAST_CROWDING_REPORT, SK_TRIP_HISTORY, SK_TRIP_SHARING } from '../../lib/storageKeys';
// NewsSection removed from home — news lives in Account tab modal
// NeighbourhoodSection removed — inlined for scroll reliability
// NeighbourhoodSheet removed — discover section moved to dedicated tab
import ServicesGrid, { ServiceTile } from '../../components/ServicesGrid';
import TonightCard from '../../components/TonightCard';
import WeatherModal from '../../components/WeatherModal';

const TRIP_UPDATES = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';
const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const ALERTS_URL = 'https://routeo-backend.vercel.app/api/alerts';
const GAS_URL = 'https://routeo-backend.vercel.app/api/gas';
const EC_WEATHER_URL = 'https://dd.weather.gc.ca/today/citypage_weather/ON/';
const ONTARIO_511_URL = 'https://511on.ca/api/v2';
const OTTAWA_OPEN_DATA_URL = 'https://open.ottawa.ca/api/explore/v2.1/catalog/datasets';
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

// DISCOVER_CARDS removed — replaced by NEIGHBOURHOODS from lib/neighbourhoodData.ts

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

const BIN_INFO: Record<string, { dot: string; color: string; label: string; accepts: string[]; rejects: string[] }> = {
  'garbage':         { dot: '●', color: '#666',    label: 'Garbage',           accepts: ['Food-soiled paper','Non-recyclable plastics','Styrofoam','Broken glass','Diapers'], rejects: ['Recyclables','Hazardous waste','Electronics'] },
  'recycling-blue':  { dot: '●', color: '#1a6fbf', label: 'Blue Bin',          accepts: ['Paper & cardboard','Newspapers','Flyers','Milk cartons','Paper bags'], rejects: ['Plastic bags','Food waste','Styrofoam'] },
  'recycling-black': { dot: '●', color: '#222',    label: 'Black Bin',         accepts: ['Plastic bottles & jugs','Glass bottles & jars','Metal cans','Aluminum foil','Rigid plastics'], rejects: ['Plastic bags','Styrofoam','Paper'] },
  'green-bin':       { dot: '●', color: '#2d7a3a', label: 'Green Bin',         accepts: ['Food scraps','Soiled paper','Coffee grounds & filters','Eggshells','Small houseplants'], rejects: ['Plastic bags','Pet waste','Liquids'] },
  'yard-waste':      { dot: '●', color: '#8b5a00', label: 'Yard Waste',        accepts: ['Leaves','Grass clippings','Branches (under 1.5m)','Garden plants'], rejects: ['Food waste','Soil','Rocks'] },
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
function SavedBoardCard({ item, colours, fonts, t, onPress, drag, isActive, cardShadow, garbageEvents, alerts, onMoveLeft, onMoveRight, timeFormat, campusData }: {
  item: SavedBoardItem; colours: any; fonts: any; t: any;
  onPress: () => void; drag: () => void; isActive: boolean; cardShadow: any;
  garbageEvents: { date: string; flags: string[] }[];
  alerts: any[];
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  timeFormat?: 'relative' | 'absolute';
  campusData?: CampusConfig | null;
}) {
  const boardRouter = useRouter();
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<'gtfs-rt' | 'gtfs-static' | 'sto-gtfs-rt' | null>(null);
  const [gasPrice, setGasPrice] = useState<string | null>(null);
  const [gasFailed, setGasFailed] = useState(false);

  useEffect(() => {
    if (item.type === 'garbage' || item.type === 'service_alert' || item.type === 'external_link' || item.type === 'otrain' || item.type === 'services' || item.type === 'discover' || item.type === 'campus' || item.type === 'news' || item.type === 'neighbourhood') { setPreviewLoading(false); return; }
    if (item.type === 'gas_prices') {
      setPreviewLoading(false);
      return;
    }
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

  const cardBase: any = [{ width: 152, height: 148, borderRadius: 14, padding: 12, backgroundColor: isActive ? colours.accent + '22' : colours.surface, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, justifyContent: 'space-between' }, cardShadow];

  // ── Garbage card ──
  if (item.type === 'garbage') {
    const next = garbageEvents[0];
    const nextDate = next ? new Date(next.date + 'T12:00:00') : null;
    const daysUntil = nextDate ? Math.round((nextDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000) : null;
    const daysLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : daysUntil != null ? `IN ${daysUntil}d` : '—';
    const BIN_COLOURS: Record<string, string> = { garbage: '#666', 'recycling-blue': '#1a6fbf', 'recycling-black': '#222', 'green-bin': '#2d7a3a', 'yard-waste': '#8b5a00' };
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#6b7f9918', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trash" size={12} color="#6b7f99" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Garbage Day</Text>
        </View>
        {next ? (
          <>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colours.accent }}>{daysLabel}</Text>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }}>{nextDate?.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(next.flags || []).slice(0, 4).map(flag => (
                  <View key={flag} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BIN_COLOURS[flag] || '#999' }} />
                ))}
              </View>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 11, color: colours.muted }}>Set address to see schedule</Text>
        )}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Service Alerts card ──
  if (item.type === 'service_alert') {
    const active = alerts.filter((a: any) => a.category !== 'accessibility');
    const hasAlerts = active.length > 0;
    const dotColor = hasAlerts ? (CATEGORY_COLOUR[active[0]?.category] || '#e8a020') : colours.accent;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#e8a02018', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="notifications" size={12} color="#e8a020" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alerts</Text>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: hasAlerts ? dotColor : colours.accent }}>
              {hasAlerts ? `${active.length} active` : 'All clear'}
            </Text>
          </View>
          {hasAlerts && <Text style={{ fontSize: 10, color: colours.muted, lineHeight: 14 }} numberOfLines={3}>{active[0].title}</Text>}
          {!hasAlerts && <Text style={{ fontSize: 10, color: colours.muted }}>No service alerts on OC Transpo</Text>}
        </View>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view all →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Gas Prices card ──
  const fetchGasPrice = useCallback(() => {
    if (gasPrice || gasFailed) return;
    fetchWithTimeout(GAS_URL, { timeout: 30000 }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => { if (d.price) setGasPrice(d.price); else setGasFailed(true); }).catch((e) => { if (__DEV__) console.warn('gas fetch failed:', e); setGasFailed(true); });
  }, [gasPrice, gasFailed]);
  if (item.type === 'gas_prices') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={() => { fetchGasPrice(); onPress(); }} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#6b7f9918', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="speedometer" size={12} color="#6b7f99" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gas Prices</Text>
        </View>
        {gasPrice ? (
          <>
            <Text style={{ fontSize: 26, fontWeight: '900', color: colours.accent }}>{gasPrice}¢</Text>
            <Text style={{ fontSize: 10, color: colours.muted }}>Regular · Ottawa avg</Text>
          </>
        ) : gasFailed ? (
          <Text style={{ fontSize: 11, color: colours.muted }}>{t('Gas prices unavailable', 'Prix d\'essence indisponible')}</Text>
        ) : (
          <Text style={{ fontSize: 11, color: colours.muted }}>{t('Tap to load prices', 'Appuyez pour charger')}</Text>
        )}
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap for nearby stations →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── O-Train card ──
  if (item.type === 'otrain') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colours.lrt + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="train" size={12} color={colours.lrt} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>O-Train</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.lrt }}>Line 1 & 2</Text>
          <Text style={{ fontSize: 10, color: colours.muted }}>Confederation & Trillium Lines</Text>
        </View>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view stations →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Services card ──
  if (item.type === 'services') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="grid" size={12} color={colours.accent} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Services</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Ottawa Services</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view all →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Discover card ──
  if (item.type === 'discover') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#e8a02018', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="compass" size={12} color="#e8a020" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Discover</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Discover Ottawa</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to explore →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── News card ──
  if (item.type === 'news') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#cc3b2a18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="newspaper" size={12} color="#cc3b2a" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>News</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Local News</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to read →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Neighbourhood card ──
  if (item.type === 'neighbourhood') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#7b5ea718', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="map" size={12} color="#7b5ea7" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Area</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={2}>{t(item.name_en, item.name_fr)}</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to explore →</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── External link card (Skip, Uber, Senators, etc.) ──
  if (item.type === 'external_link') {
    const label = t(item.label_en, item.label_fr);
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, padding: 14, backgroundColor: isActive ? item.accent + '22' : colours.surface, borderWidth: 1, borderTopWidth: 3, borderColor: isActive ? item.accent : colours.border, borderTopColor: item.accent, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={item.icon as any} size={18} color={item.accent} />
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="open-outline" size={11} color={colours.muted} />
            <Text style={{ fontSize: 10, color: colours.muted }}>Opens externally</Text>
          </View>
        </View>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Campus card ──
  if (item.type === 'campus') {
    const campus = campusData;
    const accent = campus?.accent || '#004890';
    const nextShuttle = campus?.shuttles?.[0] ? getNextDeparture(campus.shuttles[0].departures) : null;
    const lib = campus?.libraries?.[0] ? isLibraryOpen(campus.libraries[0]) : null;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, padding: 14, backgroundColor: isActive ? accent + '22' : colours.surface, borderWidth: 1, borderTopWidth: 3, borderColor: isActive ? accent : colours.border, borderTopColor: accent, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        {campus && CAMPUS_LOGOS[campus.id] ? (
          <Image source={CAMPUS_LOGOS[campus.id]} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school" size={18} color={accent} />
          </View>
        )}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{campus ? t(campus.name, campus.name_fr) : t('My Campus', 'Mon Campus')}</Text>
          {nextShuttle ? (
            <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }} numberOfLines={1}>
              {t('Shuttle', 'Navette')} {nextShuttle.minsAway}m
            </Text>
          ) : lib ? (
            <Text style={{ fontSize: 10, fontWeight: '600', color: lib.open ? '#00A78D' : colours.red }} numberOfLines={1}>
              {t('Library', 'Biblio')} {lib.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
            </Text>
          ) : (
            <Text style={{ fontSize: 10, color: colours.muted }}>{t('Tap to set up', 'Appuyez pour configurer')}</Text>
          )}
        </View>
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
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {onMoveLeft && (
            <Pressable onPress={onMoveLeft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={12} color={colours.muted} />
            </Pressable>
          )}
          {onMoveRight && (
            <Pressable onPress={onMoveRight} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={12} color={colours.muted} />
            </Pressable>
          )}
        </View>
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
                  : (a.minsAway === 0 ? t('Now', 'Maint.') : `${a.minsAway}m`)}
              </Text>
              <Text style={{ fontSize: 10, color: colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign || ''}</Text>
            </TouchableOpacity>
            );
          })
        )}
      </View>
    </TouchableOpacity>
    </ScaleDecorator>
  );
}
function SavedStopCard({ fav, isActive, colours, fonts, t, onPress, onLongPress, cardShadow }: any) {
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<'gtfs-rt' | 'gtfs-static' | 'sto-gtfs-rt' | null>(null);
  const isSTO = isStoStop(fav.id);
  const stopColor = isSTO ? '#0072bc' : colours.accent;
  useEffect(() => {
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${fav.id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!cancelled) {
          setPreview((data.arrivals || []).slice(0, 2).map((a: any) => ({ routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway })));
          setPreviewSource(data.source === 'sto-gtfs-rt' ? 'sto-gtfs-rt' : data.source === 'gtfs-rt' ? 'gtfs-rt' : 'gtfs-static');
        }
      } catch { if (!cancelled) setPreview([]); }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [fav.id]);
  const isLive = previewSource === 'gtfs-rt' || previewSource === 'sto-gtfs-rt';
  const liveColor = isSTO ? '#0072bc' : '#22c55e';
  return (
    <TouchableOpacity style={[{ width: 152, height: 148, borderRadius: 14, padding: 12, backgroundColor: isActive ? stopColor : colours.surface, borderWidth: 1, borderColor: isActive ? stopColor : colours.border, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : stopColor + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bus" size={12} color={isActive ? 'white' : stopColor} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? 'rgba(255,255,255,0.7)' : (isSTO ? '#0072bc' : colours.muted), textTransform: 'uppercase', letterSpacing: 0.5 }}>{isSTO ? 'STO' : t('Stop', 'Arrêt')}</Text>
        {!previewLoading && preview.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isLive ? liveColor : (isActive ? 'rgba(255,255,255,0.5)' : colours.muted) }} />
            <Text style={{ fontSize: 8, fontWeight: '700', color: isLive ? liveColor : (isActive ? 'rgba(255,255,255,0.5)' : colours.muted) }}>{isLive ? 'LIVE' : 'SCHED'}</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: isActive ? 'white' : colours.text, lineHeight: 18 }} numberOfLines={2}>{fav.name}</Text>
      <View style={{ gap: 5 }}>
        {previewLoading ? <ActivityIndicator size="small" color={isActive ? 'rgba(255,255,255,0.6)' : stopColor} /> : preview.length === 0 ? <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.5)' : colours.muted }}>{t('No arrivals', 'Aucune arrivée')}</Text> : (
          preview.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : stopColor + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 28, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: isActive ? 'white' : stopColor }}>{(a.routeId || '').split('-')[0]}</Text>
              </View>
              <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign ? `→ ${a.headsign}` : ''}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isActive ? 'white' : (a.minsAway <= 2 ? colours.red : stopColor) }}>{a.minsAway === 0 ? t('Now', 'Maint.') : `${a.minsAway}m`}</Text>
            </View>
          ))
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── GasPricesExpanded ────────────────────────────────────────────
function GasPricesExpanded({ colours, fonts }: { colours: any; fonts: any }) {
  const [stations, setStations] = useState<{ name: string; price: string; address: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgPrice, setAvgPrice] = useState<string | null>(null);

  useEffect(() => {
    fetchWithTimeout(GAS_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (d.price) setAvgPrice(d.price);
        if (d.stations) setStations(d.stations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colours.accent} size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
      {avgPrice && (
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.accent + '12', borderWidth: 1, borderColor: colours.accent + '30', marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="speedometer" size={24} color={colours.accent} />
          <View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colours.accent }}>{avgPrice}¢/L</Text>
            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Ottawa average · Regular unleaded</Text>
          </View>
        </View>
      )}
      {stations.length > 0 ? (
        stations.map((s, i) => (
          <View key={i} style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{s.name}</Text>
              {s.address ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{s.address}</Text> : null}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.accent, marginLeft: 12 }}>{s.price}¢</Text>
          </View>
        ))
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ color: colours.muted, fontSize: 13, textAlign: 'center' }}>Station-level data not available.{'\n'}Check GasBuddy for full listings.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Gas Prices Types ─────────────────────────────────────────────
type GasReport = {
  id: string;
  station_name: string;
  address: string | null;
  price_per_litre: number;
  fuel_type: string;
  reported_at: string;
  confirmed_count: number;
  disputed_count: number;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── GasPricesWidget ──────────────────────────────────────────────
function GasPricesWidget({ colours, fonts, t, cardShadow, isBoardSaved, toggleBoard }: { colours: any; fonts: any; t: (en: string, fr: string) => string; cardShadow: any; isBoardSaved: boolean; toggleBoard: () => void }) {
  const [reports, setReports] = useState<GasReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportModal, setReportModal] = useState(false);
  const [stationQuery, setStationQuery] = useState('');
  const [stationName, setStationName] = useState('');
  const [stationAddress, setStationAddress] = useState('');
  const [stationLat, setStationLat] = useState<number | null>(null);
  const [stationLng, setStationLng] = useState<number | null>(null);
  const [stationResults, setStationResults] = useState<{ label: string; lat?: number; lng?: number }[]>([]);
  const stationSeq = useRef(0);
  const [price, setPrice] = useState('');
  const [fuelType, setFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [submitting, setSubmitting] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  // Load persisted gas votes
  useEffect(() => {
    AsyncStorage.getItem(SK_GAS_VOTED_IDS).then(val => {
      if (val) try { setVotedIds(new Set(JSON.parse(val))); } catch {}
    }).catch(() => {});
  }, []);

  const [prevPrices, setPrevPrices] = useState<{ [station: string]: number }>({});

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('gas_prices')
      .select('*')
      .order('reported_at', { ascending: false })
      .limit(3);
    setReports(data || []);
    // Fetch previous reports for each station to compute trends
    if (data && data.length > 0) {
      const stationNames = [...new Set(data.map((r: GasReport) => r.station_name))];
      const prev: { [station: string]: number } = {};
      for (const name of stationNames) {
        const { data: older } = await supabase
          .from('gas_prices')
          .select('price_per_litre')
          .eq('station_name', name)
          .order('reported_at', { ascending: false })
          .range(1, 1);
        if (older && older.length > 0) prev[name] = older[0].price_per_litre;
      }
      setPrevPrices(prev);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleStationSearch = (text: string) => {
    setStationQuery(text);
    setStationName(''); setStationAddress(''); setStationLat(null); setStationLng(null);
    if (text.length < 2) { setStationResults([]); return; }
    const seq = ++stationSeq.current;
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete-geocode&input=${encodeURIComponent(text)}`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { if (seq === stationSeq.current) setStationResults((d.results || []).filter((r: any) => r.label).slice(0, 4)); })
      .catch(() => { if (seq === stationSeq.current) setStationResults([]); });
  };

  const selectStation = (result: { label: string; lat?: number; lng?: number }) => {
    const parts = result.label.split(',');
    const name = parts[0].trim();
    const addr = parts.length > 1 ? result.label : '';
    setStationQuery(name);
    setStationName(name);
    setStationAddress(addr);
    setStationLat(result.lat || null);
    setStationLng(result.lng || null);
    setStationResults([]);
  };

  const handleSubmit = async () => {
    const priceNum = parseFloat(price);
    if (!stationName.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert(t('Missing info', 'Info manquante'), t('Select a station and enter a valid price.', 'Sélectionnez une station et entrez un prix valide.'));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('gas_prices').insert({
      station_name: stationName.trim(),
      address: stationAddress || null,
      lat: stationLat,
      lng: stationLng,
      price_per_litre: priceNum,
      fuel_type: fuelType,
    });
    if (error) {
      setSubmitting(false);
      Alert.alert(t('Error', 'Erreur'), t('Failed to submit price. Try again.', 'Impossible de soumettre le prix. Reessayez.'));
      return;
    }
    setStationQuery(''); setStationName(''); setStationAddress(''); setStationLat(null); setStationLng(null);
    setPrice(''); setFuelType('regular');
    setSubmitting(false); setReportModal(false);
    fetchReports();
  };

  const handleVote = async (id: string, type: 'confirm' | 'dispute') => {
    if (votedIds.has(id)) return;
    setVotedIds(prev => {
      const updated = new Set(prev).add(id);
      AsyncStorage.setItem(SK_GAS_VOTED_IDS, JSON.stringify([...updated])).catch(() => {});
      return updated;
    });
    const col = type === 'confirm' ? 'confirmed_count' : 'disputed_count';
    const report = reports.find(r => r.id === id);
    if (!report) return;
    supabase.from('gas_prices').update({ [col]: (report[col] || 0) + 1 }).eq('id', id).then(() => {}, () => {});
    setReports(prev => prev.map(r => r.id === id ? { ...r, [col]: (r[col] || 0) + 1 } : r));
  };

  const FUEL_TYPES: { key: 'regular' | 'premium' | 'diesel'; label: string }[] = [
    { key: 'regular', label: 'Regular' },
    { key: 'premium', label: 'Premium' },
    { key: 'diesel', label: 'Diesel' },
  ];

  return (
    <>
      <View style={[{ marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, overflow: 'hidden', marginBottom: 16 }, cardShadow]}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#00A78D18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="speedometer" size={16} color="#00A78D" />
            </View>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('GAS PRICES', 'PRIX ESSENCE')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleBoard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={isBoardSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isBoardSaved ? colours.accent : colours.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setReportModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#00A78D' + '15', borderWidth: 1, borderColor: '#00A78D' }}
            >
              <Ionicons name="add-circle" size={14} color="#00A78D" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#00A78D' }}>{t('Report', 'Signaler')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <ActivityIndicator color={colours.accent} />
          </View>
        ) : reports.length === 0 ? (
          <View style={{ padding: 28, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#00A78D' + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="speedometer-outline" size={28} color="#00A78D" />
            </View>
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, textAlign: 'center' }}>
              {t('No reports yet', 'Aucun signalement')}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
              {t('Help Ottawa drivers by reporting the gas price at your nearest station.', 'Aidez les automobilistes d\u2019Ottawa en signalant le prix de l\u2019essence.')}
            </Text>
            <TouchableOpacity
              onPress={() => setReportModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#00A78D' }}
            >
              <Ionicons name="add-circle" size={16} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Report a Price', 'Signaler un prix')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          reports.map((r, i) => {
            const voted = votedIds.has(r.id);
            return (
              <View key={r.id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>{r.station_name}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                      {r.fuel_type.charAt(0).toUpperCase() + r.fuel_type.slice(1)} · {timeAgo(r.reported_at)}
                    </Text>
                    {prevPrices[r.station_name] != null && prevPrices[r.station_name] !== r.price_per_litre && (() => {
                      const diff = (r.price_per_litre - prevPrices[r.station_name]) * 100;
                      const up = diff > 0;
                      return (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: up ? '#cc3b2a' : '#2d7a3a', marginTop: 2 }}>
                          {up ? '\u2191' : '\u2193'} {Math.abs(diff).toFixed(1)}\u00A2 since last report
                        </Text>
                      );
                    })()}
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#00A78D' }}>
                    {(r.price_per_litre * 100).toFixed(1)}¢
                  </Text>
                </View>
                {/* Vote row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => handleVote(r.id, 'confirm')}
                    disabled={voted}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, opacity: voted ? 0.5 : 1 }}
                  >
                    <Ionicons name="thumbs-up-outline" size={14} color="#34c759" />
                    <Text style={{ fontSize: 12, color: '#34c759', fontWeight: '600' }}>{r.confirmed_count}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleVote(r.id, 'dispute')}
                    disabled={voted}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, opacity: voted ? 0.5 : 1 }}
                  >
                    <Ionicons name="thumbs-down-outline" size={14} color="#cc3b2a" />
                    <Text style={{ fontSize: 12, color: '#cc3b2a', fontWeight: '600' }}>{r.disputed_count}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Report Modal */}
      <Modal visible={reportModal} animationType="slide" transparent onRequestClose={() => setReportModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{t('Report Gas Price', 'Signaler un prix')}</Text>
                <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }} onPress={() => setReportModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                  <Ionicons name="close" size={18} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 20, gap: 14 }}>
                <View style={{ zIndex: 10 }}>
                  <TextInput
                    placeholder={t('Search gas station...', 'Chercher une station...')}
                    placeholderTextColor={colours.muted}
                    value={stationQuery}
                    onChangeText={handleStationSearch}
                    style={{ borderWidth: 1, borderColor: stationName ? '#00A78D' : colours.border, borderRadius: 12, padding: 14, fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface }}
                    accessibilityLabel={t('Search gas station', 'Chercher une station')}
                  />
                  {stationName ? (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, marginLeft: 4 }} numberOfLines={1}>{stationAddress}</Text>
                  ) : null}
                  {stationResults.length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 12, marginTop: 6, overflow: 'hidden', backgroundColor: colours.surface }}>
                      {stationResults.map((r, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => selectStation(r)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < stationResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
                        >
                          <Ionicons name="location-outline" size={16} color={colours.muted} />
                          <Text style={{ flex: 1, fontSize: fonts.md, color: colours.text }} numberOfLines={1}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <TextInput
                  placeholder={t('Price per litre (e.g. 1.689)', 'Prix par litre (ex. 1.689)')}
                  placeholderTextColor={colours.muted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 12, padding: 14, fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {FUEL_TYPES.map(ft => (
                    <TouchableOpacity
                      key={ft.key}
                      onPress={() => setFuelType(ft.key)}
                      style={{
                        flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                        backgroundColor: fuelType === ft.key ? '#00A78D' + '18' : colours.surface,
                        borderColor: fuelType === ft.key ? '#00A78D' : colours.border,
                      }}
                    >
                      <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: fuelType === ft.key ? '#00A78D' : colours.muted }}>{ft.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={{ backgroundColor: '#00A78D', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting
                    ? <ActivityIndicator color="white" />
                    : <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.lg }}>{t('Submit Price', 'Soumettre le prix')}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}


function SavedPlaceCard({ place, colours, fonts, language, t, onPress, onLongPress, cardShadow }: any) {
  const photoUrl = place.photoRef ? `https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${place.photoRef}&maxwidth=400` : null;
  const label = language === 'fr' ? place.categoryLabel_fr : place.categoryLabel_en;
  return (
    <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }, cardShadow]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <ImageBackground source={photoUrl ? { uri: photoUrl } : undefined} style={{ width: '100%', height: 100, backgroundColor: place.categoryColor + '18', alignItems: photoUrl ? undefined : 'center', justifyContent: photoUrl ? undefined : 'center' }} resizeMode="cover">
        {!photoUrl && <Ionicons name={place.categoryIcon} size={28} color={place.categoryColor} />}
        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: place.categoryColor, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: 'white', textTransform: 'uppercase' }}>{label}</Text>
        </View>
      </ImageBackground>
      <View style={{ padding: 10, flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{place.name}</Text>
        <Text style={{ fontSize: 10, color: colours.muted }} numberOfLines={1}>{place.vicinity}</Text>
        {place.rating && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}><Ionicons name="star" size={10} color={colours.orange} /><Text style={{ fontSize: 10, fontWeight: '600', color: colours.text }}>{place.rating}</Text></View>)}
      </View>
    </TouchableOpacity>
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
 * Schedule (or re-schedule) an 8 pm local notification the evening before
 * the next garbage collection. Cancels any previous garbage reminder first.
 */
async function scheduleGarbageNotification(
  events: { date: string; flags: string[] }[],
  lang: string = 'en'
): Promise<void> {
  if (!(await ensureNotifPermission())) return;

  if (!Notifications) return;
  // Cancel any existing garbage reminder
  const existingId = await AsyncStorage.getItem(SK_GARBAGE_NOTIF_ID);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(SK_GARBAGE_NOTIF_ID);
  }

  const next = events[0];
  if (!next) return;

  const collectionDate = new Date(next.date + 'T08:00:00');
  // Remind the evening before at 8 pm
  const reminderDate = new Date(collectionDate);
  reminderDate.setDate(reminderDate.getDate() - 1);
  reminderDate.setHours(20, 0, 0, 0);

  if (reminderDate <= new Date()) return; // already past

  const BIN_LABELS_EN: Record<string, string> = {
    'garbage': 'Garbage', 'recycling-blue': 'Blue Bin',
    'recycling-black': 'Black Bin', 'green-bin': 'Green Bin', 'yard-waste': 'Yard Waste',
  };
  const BIN_LABELS_FR: Record<string, string> = {
    'garbage': 'Ordures', 'recycling-blue': 'Bac bleu',
    'recycling-black': 'Bac noir', 'green-bin': 'Bac vert', 'yard-waste': 'Déchets de jardin',
  };
  const labels = lang === 'fr' ? BIN_LABELS_FR : BIN_LABELS_EN;
  const binNames = next.flags.map(f => labels[f] || f).join(' · ');
  const dayLabel = collectionDate.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long' });

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: lang === 'fr' ? '🗑️ Collecte demain' : '🗑️ Garbage Day tomorrow',
        body: lang === 'fr' ? `Sortir : ${binNames} (${dayLabel})` : `Put out: ${binNames} (${dayLabel})`,
        data: { type: 'garbage_reminder' },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });
    await AsyncStorage.setItem(SK_GARBAGE_NOTIF_ID, id);
  } catch (e) { if (__DEV__) console.warn('schedule garbage notification failed:', e); }
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
  const [frequentRoutes, setFrequentRoutes] = useState<FrequentRoute[]>([]);
  const [frequentArrivals, setFrequentArrivals] = useState<Record<string, { minsAway: number; delay: number; headsign: string } | null>>({});
  const [frequentCardDismissed, setFrequentCardDismissed] = useState(true);
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
  const [savedRoutes, setSavedRoutes] = useState<{ id: string; fromLabel: string; toLabel: string; fromLat: number; fromLng: number; toLat: number; toLng: number }[]>([]);
  const [showLine1, setShowLine1] = useState(false);
  const [showLine2, setShowLine2] = useState(false);
  const [showEast, setShowEast] = useState(false);
  const [showWest, setShowWest] = useState(false);
  const [showNorth, setShowNorth] = useState(false);
  const [showSouth, setShowSouth] = useState(false);
  // newsArticles, selectedNeighbourhood, neighbourhoodSheetVisible removed — discover section moved to dedicated tab
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsModalVisible, setAlertsModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_SECTION_ORDER);
  const [quickActionIds, setQuickActionIds] = useState<string[]>(DEFAULT_QUICK_ACTION_IDS);
  const [ottawaLifeIds, setOttawaLifeIds] = useState<string[]>(DEFAULT_OTTAWA_LIFE_IDS);
  const [swapTileIndex, setSwapTileIndex] = useState<number | null>(null);
  const [swapSheetVisible, setSwapSheetVisible] = useState(false);
  const [activeServicesTab, setActiveServicesTab] = useState('transit');
  const [weather, setWeather] = useState<{ temp: number; condition: string; icon: string } | null>(null);
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [forecast, setForecast] = useState<{ time: string; temp: number; icon: string; precip: number }[]>([]);
  const [dailyForecast, setDailyForecast] = useState<{ day: string; date: string; high: number; low: number; icon: string; precip: number }[]>([]);
  const [locationName, setLocationName] = useState('Ottawa, Ontario');
  // Ottawa road closures
  const [roadEvents, setRoadEvents] = useState<{ id: string; description: string; type: string; road: string; distance: number }[]>([]);
  const [roadEventsModal, setRoadEventsModal] = useState(false);
  const [roadEventsLoading, setRoadEventsLoading] = useState(false);
  // Ottawa Open Data parks/rinks
  const [parksModal, setParksModal] = useState(false);
  const [parks, setParks] = useState<{ name: string; crossStreets: string; facility: string; accessible: string; boards: string; toilet: string; lat: number; lng: number; distance: number }[]>([]);
  const [parksLoading, setParksLoading] = useState(false);
  // VeloGo bike share
  const [bikeShareModal, setBikeShareModal] = useState(false);
  const [bikeStations, setBikeStations] = useState<{ name: string; bikes: number; docks: number; lat: number; lng: number; distance: number }[]>([]);
  const [bikeShareLoading, setBikeShareLoading] = useState(false);
  // Commute insights
  const [commuteInsight, setCommuteInsight] = useState<{ fromLabel: string; toLabel: string; avgDuration: number; count: number; affectedAlert?: string } | null>(null);
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
  const [garbageModalVisible, setGarbageModalVisible] = useState(false);
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
  const [sensGame, setSensGame] = useState<{ state: 'live' | 'pre' | 'none'; period?: string; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; startTime?: string; opponentAbbr?: string } | null>(null);
  const [campusModal, setCampusModal] = useState(false);
  const [campusTab, setCampusTab] = useState<'shuttle' | 'library' | 'upass' | 'food' | 'study'>('shuttle');
  const [selectedCampus, setSelectedCampus] = useState<CampusConfig | null>(null);
  const [campusPicker, setCampusPicker] = useState(false);
  const [campusFood, setCampusFood] = useState<any[]>([]);
  const [campusFoodLoading, setCampusFoodLoading] = useState(false);

  const [garbageAddress, setGarbageAddress] = useState('');
  const [garbageAddressInput, setGarbageAddressInput] = useState('');
  const [garbagePlaceId, setGarbagePlaceId] = useState('');
  const [garbageEvents, setGarbageEvents] = useState<{ date: string; flags: string[] }[]>([]);
  const [garbageLoading, setGarbageLoading] = useState(false);
  const [garbageError, setGarbageError] = useState('');
  const [expandedBin, setExpandedBin] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);

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
    AsyncStorage.getItem(SK_SAVED_ROUTES).then(val => { try { if (val) setSavedRoutes(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn('JSON parse saved routes failed:', e); } });
    AsyncStorage.getItem(SK_TIME_FORMAT).then(val => { if (val === 'absolute') setTimeFormat('absolute'); });
    AsyncStorage.getItem(SK_CAMPUS).then(val => { if (val) { const c = CAMPUSES.find(x => x.id === val); if (c) setSelectedCampus(c); } }).catch(() => {});
    Promise.all([
      AsyncStorage.getItem(SK_SAVED_BOARD),
      AsyncStorage.getItem(SK_FAVS),
      AsyncStorage.getItem(SK_GARBAGE_ADDRESS),
    ]).then(([boardVal, favsVal, garbageAddr]) => {
      try {
        const board: SavedBoardItem[] = boardVal ? JSON.parse(boardVal) : [];
        const existingFavs: Fav[] = favsVal ? JSON.parse(favsVal) : [];
        let changed = false;
        for (const fav of existingFavs) {
          const alreadyOn = board.some(i => (i.type === 'bus_stop' || i.type === 'lrt_station') && i.id === fav.id);
          if (!alreadyOn) {
            board.push({ type: LRT_STOP_IDS.has(fav.id) ? 'lrt_station' : 'bus_stop', id: fav.id, name: fav.name });
            changed = true;
          }
        }
        if (garbageAddr && !board.some(i => i.type === 'garbage')) {
          board.push({ type: 'garbage' });
          changed = true;
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
    AsyncStorage.getItem(SK_SECTION_ORDER).then(val => {
      try {
        if (val) {
          let saved: string[] = JSON.parse(val);
          // Remove legacy keys
          saved = saved.filter(s => s !== 'quick' && s !== 'ottawa' && s !== 'map' && s !== 'gas' && s !== 'news' && s !== 'discover');
          // Ensure all required sections exist
          const required = DEFAULT_SECTION_ORDER;
          for (const key of required) {
            if (!saved.includes(key)) saved.push(key);
          }
          // Remove any unknown sections
          saved = saved.filter(s => required.includes(s));
          setSectionOrder(saved);
          AsyncStorage.setItem(SK_SECTION_ORDER, JSON.stringify(saved));
        }
      } catch (e) {
        if (__DEV__) console.warn('JSON parse section order failed:', e);
        // Reset to default on parse failure
        setSectionOrder(DEFAULT_SECTION_ORDER);
        AsyncStorage.setItem(SK_SECTION_ORDER, JSON.stringify(DEFAULT_SECTION_ORDER));
      }
    });
    AsyncStorage.removeItem(SK_QUICK_ACTIONS);
    AsyncStorage.removeItem(SK_OTTAWA_LIFE);
    fetchAlerts();
    fetchWeather();
    loadSavedGarbageAddress();
    // Check for unseen critical service alerts and notify
    checkAndNotifyCriticalAlerts(language);
    // Register push token and configure notification handler
    configureNotificationHandler();
    registerPushToken(language).catch(() => {});
    // Detect frequent routes for glanceable card
    detectFrequentRoutes().then(routes => {
      setFrequentRoutes(routes);
      if (routes.length > 0) {
        AsyncStorage.getItem(SK_FREQUENT_CARD_DISMISSED).then(val => {
          if (val) {
            const ts = parseInt(val, 10);
            if (Date.now() - ts < 86400000) return; // 24hr cooldown
          }
          setFrequentCardDismissed(false);
        }).catch(() => setFrequentCardDismissed(false));
      }
    }).catch(() => {});
    // Detect commute patterns from trip history
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      if (!val) return;
      try {
        const trips: { fromLabel: string; fromLat: number; fromLng: number; toLabel: string; toLat: number; toLng: number; durationMins: number; plannedAt: string }[] = JSON.parse(val);
        if (trips.length < 3) return;
        // Group similar trips (same from/to within 500m)
        const groups: { fromLabel: string; toLabel: string; durations: number[]; count: number }[] = [];
        for (const trip of trips) {
          const match = groups.find(g => {
            const fromMatch = trips.filter(t => t.fromLabel === g.fromLabel).length > 0;
            return fromMatch && g.toLabel === trip.toLabel;
          });
          if (match) { match.durations.push(trip.durationMins); match.count++; }
          else { groups.push({ fromLabel: trip.fromLabel, toLabel: trip.toLabel, durations: [trip.durationMins], count: 1 }); }
        }
        const commute = groups.find(g => g.count >= 3);
        if (commute) {
          const avg = Math.round(commute.durations.reduce((a, b) => a + b, 0) / commute.durations.length);
          setCommuteInsight({ fromLabel: commute.fromLabel, toLabel: commute.toLabel, avgDuration: avg, count: commute.count });
        }
      } catch {}
    }).catch(() => {});
  }, []);

  const saveCustomization = async (order: string[], qaIds: string[], olIds: string[]) => {
    await AsyncStorage.setItem(SK_SECTION_ORDER, JSON.stringify(order));
    await AsyncStorage.setItem(SK_QUICK_ACTIONS, JSON.stringify(qaIds));
    await AsyncStorage.setItem(SK_OTTAWA_LIFE, JSON.stringify(olIds));
  };

  const moveSectionUp = (id: string) => {
    const idx = sectionOrder.indexOf(id);
    if (idx <= 0) return;
    const newOrder = [...sectionOrder];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    setSectionOrder(newOrder);
  };

  const moveSectionDown = (id: string) => {
    const idx = sectionOrder.indexOf(id);
    if (idx >= sectionOrder.length - 1) return;
    const newOrder = [...sectionOrder];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    setSectionOrder(newOrder);
  };

  const swapOttawaLifeTile = (tileIndex: number, newId: string) => {
    const newIds = [...ottawaLifeIds];
    newIds[tileIndex] = newId;
    setOttawaLifeIds(newIds);
    setSwapSheetVisible(false);
    setSwapTileIndex(null);
  };

  const saveBoardItems = (items: SavedBoardItem[]) => {
    setSavedBoard(items);
    AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(items));
  };

  const addToBoardIfMissing = (item: SavedBoardItem) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedBoard(prev => {
      const exists = prev.some(i => {
        if (i.type !== item.type) return false;
        if (item.type === 'garbage' || item.type === 'service_alert' || item.type === 'gas_prices' || item.type === 'otrain' || item.type === 'services' || item.type === 'discover' || item.type === 'news') return true;
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
        if (item.type === 'garbage' || item.type === 'service_alert' || item.type === 'gas_prices' || item.type === 'otrain' || item.type === 'services' || item.type === 'discover' || item.type === 'news') return false;
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
    if (item.type === 'garbage') return savedBoard.some(i => i.type === 'garbage');
    if (item.type === 'service_alert') return savedBoard.some(i => i.type === 'service_alert');
    if (item.type === 'gas_prices') return savedBoard.some(i => i.type === 'gas_prices');
    if (item.type === 'otrain') return savedBoard.some(i => i.type === 'otrain');
    if (item.type === 'services') return savedBoard.some(i => i.type === 'services');
    if (item.type === 'discover') return savedBoard.some(i => i.type === 'discover');
    if (item.type === 'campus') return savedBoard.some(i => i.type === 'campus');
    if (item.type === 'news') return savedBoard.some(i => i.type === 'news');
    if (item.type === 'neighbourhood') return savedBoard.some(i => i.type === 'neighbourhood' && i.id === item.id);
    if (item.type === 'external_link') return savedBoard.some(i => i.type === 'external_link' && i.id === item.id);
    return savedBoard.some(i => (i.type === 'bus_stop' || i.type === 'lrt_station') && i.id === item.id);
  };

  const tileToBoard = (tile: ServiceTile): SavedBoardItem | null => {
    if (tile.id === 'garbage') return { type: 'garbage' };
    if (tile.id === 'svc_alerts') return { type: 'service_alert' };
    if (tile.id === 'gas') return { type: 'gas_prices' };
    if (tile.id === 'otrain') return { type: 'otrain' };
    if (tile.id === 'services') return { type: 'services' };
    if (tile.id === 'discover') return { type: 'discover' };
    if (tile.id === 'news') return { type: 'news' };
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
      // ── Open-Meteo (primary source — EC XML feed moved to dynamic hourly paths) ──
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

  const garbageFlagLabel: Record<string, string> = { 'garbage': 'Garbage', 'recycling-black': 'Black Bin (recycling)', 'recycling-blue': 'Blue Bin (recycling)', 'green-bin': 'Green Bin (organics)', 'yard-waste': 'Yard Waste' };
  const WASTE_QUERY = 'https://maps.ottawa.ca/arcgis/rest/services/SolidWasteCollectionCalendar/MapServer/1/query';

  const fetchGarbageEvents = async (lat: number, lng: number) => {
    try {
      const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
      const resp = await fetchWithTimeout(`${WASTE_QUERY}?geometry=${encodeURIComponent(geometry)}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=GCD,SCHEDULE,C_ZONE&returnGeometry=false&f=json&inSR=4326`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const feature = data?.features?.[0]?.attributes;
      if (!feature) { setGarbageError('No collection zone found. Make sure you\'re in Ottawa.'); return; }
      const events = buildPickupDates(feature.GCD, feature.SCHEDULE);
      setGarbageEvents(events);
      setGarbageError('');
      scheduleGarbageNotification(events, language);
    } catch { setGarbageError('Could not load schedule. Try again.'); }
  };

  const searchGarbageAddress = async (q: string) => {
    if (!q.trim()) return;
    setGarbageLoading(true); setGarbageError(''); setAddressSaved(false);
    try {
      const geoResp = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Ottawa, Ontario, Canada')}&format=json&limit=1`, { headers: { 'User-Agent': 'RouteO/1.0' } });
      if (!geoResp.ok) throw new Error('HTTP ' + geoResp.status);
      const geoData = await geoResp.json();
      const result = geoData?.[0];
      if (!result) { setGarbageError('Address not found. Try "123 Main St" or a postal code.'); setGarbageLoading(false); return; }
      const lat = parseFloat(result.lat); const lng = parseFloat(result.lon);
      const displayAddress = result.display_name?.split(',').slice(0, 3).join(',') || q;
      setGarbageAddress(displayAddress);
      await AsyncStorage.setItem(SK_GARBAGE_ADDRESS, displayAddress);
      await AsyncStorage.setItem(SK_GARBAGE_LAT, String(lat));
      await AsyncStorage.setItem(SK_GARBAGE_LNG, String(lng));
      await fetchGarbageEvents(lat, lng);
    } catch { setGarbageError('Could not search address. Check your connection.'); }
    setGarbageLoading(false);
  };

  const fetchGarbageEventsReCollect = async (placeId: string) => {
    try {
      const now = new Date();
      const after = now.toLocaleDateString('en-CA');
      const before = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
      const resp = await fetchWithTimeout(`https://api.recollect.net/api/places/${placeId}/services/257/events?after=${after}&before=${before}&locale=en`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const events = (data?.events ?? []).map((e: any) => ({ date: e.day, flags: (e.flags ?? []).map((f: any) => f.event_type), label: (e.flags ?? []).map((f: any) => garbageFlagLabel[f.event_type] ?? f.event_type).join(' · ') })).filter((e: any) => e.flags.length > 0).slice(0, 8);
      setGarbageEvents(events);
      scheduleGarbageNotification(events, language);
    } catch { setGarbageError('Could not load schedule.'); }
  };

  const buildPickupDates = (dayName: string, schedule: string): { date: string; flags: string[]; label: string }[] => {
    const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const targetDay = days[dayName?.toLowerCase()] ?? 3;
    const results = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let d = new Date(now);
    while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
    const weekNum = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    let isGarbageWeek = (weekNum % 2 === 0) === (schedule === 'A');
    for (let i = 0; i < 8; i++) {
      const dateStr = d.toLocaleDateString('en-CA');
      const flags = isGarbageWeek ? ['garbage', 'recycling-black', 'green-bin'] : ['recycling-blue', 'green-bin'];
      results.push({ date: dateStr, flags, label: isGarbageWeek ? 'Garbage · Black Bin · Green Bin' : 'Blue Bin · Green Bin' });
      d.setDate(d.getDate() + 14); isGarbageWeek = !isGarbageWeek;
    }
    return results;
  };

  const loadSavedGarbageAddress = async () => {
    const address = await AsyncStorage.getItem(SK_GARBAGE_ADDRESS);
    const lat = await AsyncStorage.getItem(SK_GARBAGE_LAT);
    const lng = await AsyncStorage.getItem(SK_GARBAGE_LNG);
    const placeId = await AsyncStorage.getItem(SK_GARBAGE_PLACE_ID);
    if (address) { setGarbageAddress(address); setAddressSaved(true); }
    if (lat && lng) { fetchGarbageEvents(parseFloat(lat), parseFloat(lng)); }
    else if (placeId) { setGarbagePlaceId(placeId); fetchGarbageEventsReCollect(placeId); }
  };

  const fetchAlerts = async () => {
    try { setAlertsLoading(true); const resp = await fetchWithTimeout(ALERTS_URL); if (!resp.ok) throw new Error('HTTP ' + resp.status); const data = await resp.json(); setAlerts(data.alerts || []); }
    catch { setAlerts([]); } finally { setAlertsLoading(false); }
  };

  // Cross-reference commute with active alerts
  useEffect(() => {
    if (!commuteInsight || alerts.length === 0) return;
    const critical = alerts.find(a => a.category === 'cancellation' || a.category === 'lrt' || a.category === 'delay');
    if (critical) {
      setCommuteInsight(prev => prev ? { ...prev, affectedAlert: critical.title } : null);
    }
  }, [alerts]);

  // ── 511 Ontario road events ───────────────────────────────────
  const haversineDist = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const toRad = (d: number) => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  const fetchRoadClosures = async () => {
    setRoadEventsLoading(true);
    try {
      const coords = await getUserCoords();
      const resp = await fetchWithTimeout('https://maps.ottawa.ca/arcgis/rest/services/Road_Closures/MapServer/0/query?where=1%3D1&outFields=*&f=json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const features = data.features || [];
      const events = features.map((f: any, i: number) => {
        const a = f.attributes || {};
        const geom = f.geometry;
        let dist = 999;
        if (geom) {
          const eLat = geom.y || geom.paths?.[0]?.[0]?.[1];
          const eLng = geom.x || geom.paths?.[0]?.[0]?.[0];
          if (eLat && eLng) dist = haversineDist(coords.lat, coords.lng, eLat, eLng);
        }
        return {
          id: String(a.OBJECTID || i),
          description: a.DESCRIPTION || a.COMMENTS || a.NAME || 'Road closure',
          type: a.CLOSURE_TYPE || a.TYPE || 'Closure',
          road: a.ROAD_NAME || a.STREET || a.NAME || '',
          distance: dist,
        };
      });
      events.sort((a: any, b: any) => a.distance - b.distance);
      setRoadEvents(events);
    } catch { setRoadEvents([]); }
    setRoadEventsLoading(false);
  };

  // ── Ottawa Open Data parks/rinks ──────────────────────────────
  const fetchParks = async () => {
    setParksLoading(true);
    try {
      const coords = await getUserCoords();
      const resp = await fetchWithTimeout('https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/13/query?where=1%3D1&outFields=RINK_PARK_NAME,MAJOR_CROSSSTREETS,FACILITY,ACCESSIBLE,BOARDS,TOILET&returnGeometry=true&f=json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const features = data.features || [];
      const mapped = features.map((f: any) => {
        const a = f.attributes || {};
        const geom = f.geometry || {};
        const lat = geom.y || 0;
        const lng = geom.x || 0;
        const dist = (lat && lng) ? haversineDist(coords.lat, coords.lng, lat, lng) : 999;
        return {
          name: a.RINK_PARK_NAME || 'Unknown Rink',
          crossStreets: a.MAJOR_CROSSSTREETS || '',
          facility: a.FACILITY || '',
          accessible: a.ACCESSIBLE || '',
          boards: a.BOARDS || '',
          toilet: a.TOILET || '',
          lat, lng, distance: dist,
        };
      });
      mapped.sort((a: any, b: any) => a.distance - b.distance);
      setParks(mapped.slice(0, 10));
    } catch { setParks([]); }
    setParksLoading(false);
  };

  // ── VeloGo bike share ─────────────────────────────────────────
  const fetchBikeShare = async () => {
    setBikeShareLoading(true);
    try {
      const coords = await getUserCoords();
      const [infoResp, statusResp] = await Promise.all([
        fetchWithTimeout('https://velogo.ca/opendata/station_information.json'),
        fetchWithTimeout('https://velogo.ca/opendata/station_status.json'),
      ]);
      if (!infoResp.ok) throw new Error('HTTP ' + infoResp.status);
      if (!statusResp.ok) throw new Error('HTTP ' + statusResp.status);
      const infoData = await infoResp.json();
      const statusData = await statusResp.json();
      const stations = infoData.data?.stations || [];
      const statuses = statusData.data?.stations || [];
      const statusMap: { [id: string]: any } = {};
      for (const s of statuses) statusMap[s.station_id] = s;
      const merged = stations.map((s: any) => {
        const st = statusMap[s.station_id] || {};
        const dist = haversineDist(coords.lat, coords.lng, s.lat, s.lon);
        return {
          name: s.name || `Station ${s.station_id}`,
          bikes: st.num_bikes_available ?? 0,
          docks: st.num_docks_available ?? 0,
          lat: s.lat,
          lng: s.lon,
          distance: dist,
        };
      });
      merged.sort((a: any, b: any) => a.distance - b.distance);
      setBikeStations(merged.slice(0, 30));
    } catch { setBikeStations([]); }
    setBikeShareLoading(false);
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

  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
      // STO stops — route through backend which handles STO GTFS-RT
      if (isStoStop(id)) {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const stoIsStatic = data.source === 'gtfs-static';
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
        const lrtParsed = (data.arrivals || []).map((a: any) => ({ id: `${a.stopId}-${a.scheduledTime}`, routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway, delay: 0, secsAway: a.minsAway * 60, isScheduled: true }));
        setArrivals(lrtParsed);
        AsyncStorage.setItem(`routeo_arrivals_${id}`, JSON.stringify({ arrivals: lrtParsed, timestamp: Date.now() }));
        setCachedAt(null);
        const now = new Date();
        setLastUpdated(fmtTime(now));
        setLoading(false);
        return;
      }
      const resp = await fetchWithTimeout(TRIP_UPDATES, { headers: { 'Ocp-Apim-Subscription-Key': OC_TRANSPO_API_KEY } });
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      const gtfsParsed = parseGTFS(data, internalId);
      setArrivals(gtfsParsed);
      AsyncStorage.setItem(`routeo_arrivals_${id}`, JSON.stringify({ arrivals: gtfsParsed, timestamp: Date.now() }));
      setCachedAt(null);
      const now = new Date();
      setLastUpdated(fmtTime(now));
      setArrivalsFetchFailed(false);
    } catch (e: unknown) {
      try {
        const cached = await AsyncStorage.getItem(`routeo_arrivals_${id}`);
        if (cached) {
          const { arrivals: cachedArrivals, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 30 * 60 * 1000) {
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

  // Stop amenities — sourced from OpenStreetMap via one-time import script
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

  // ── Frequent rider card arrivals polling ──────────────────────
  const fetchFrequentArrivals = async (routes: FrequentRoute[], skipCache = false) => {
    // Show cached data instantly while fetching fresh
    if (!skipCache) {
      try {
        const cached = await AsyncStorage.getItem(SK_FREQUENT_ARRIVALS_CACHE);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < 60000 && data) {
            setFrequentArrivals(data);
          }
        }
      } catch { /* ignore */ }
    }

    const stopIds = [...new Set(routes.filter(r => r.stopId).map(r => r.stopId))];
    const results: Record<string, { minsAway: number; delay: number; headsign: string } | null> = {};
    await Promise.allSettled(stopIds.map(async sid => {
      try {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${sid}`, { timeout: 5000 });
        if (!resp.ok) return;
        const data = await resp.json();
        const trips = data.trips || data.result?.trips || [];
        for (const route of routes.filter(r => r.stopId === sid)) {
          if (route.routeId) {
            const match = trips.find((t: any) => String(t.routeId || t.RouteNo) === route.routeId);
            if (match) {
              const mins = typeof match.minsAway === 'number' ? match.minsAway : parseInt(match.AdjustedScheduleTime || '0', 10);
              const delay = typeof match.delay === 'number' ? match.delay : (parseFloat(match.AdjustmentAge || '0') > 0 ? Math.round(parseFloat(match.AdjustmentAge)) : 0);
              results[route.routeId] = { minsAway: mins, delay, headsign: match.headsign || match.TripDestination || '' };
            }
          } else {
            const first = trips[0];
            if (first) {
              const mins = typeof first.minsAway === 'number' ? first.minsAway : parseInt(first.AdjustedScheduleTime || '0', 10);
              results[sid] = { minsAway: mins, delay: 0, headsign: first.headsign || first.TripDestination || '' };
            }
          }
        }
      } catch { /* network error */ }
    }));
    setFrequentArrivals(results);
    // Cache successful results
    if (Object.keys(results).length > 0) {
      AsyncStorage.setItem(SK_FREQUENT_ARRIVALS_CACHE, JSON.stringify({ data: results, ts: Date.now() })).catch(() => {});
    }
  };

  useEffect(() => {
    if (frequentRoutes.length > 0) fetchFrequentArrivals(frequentRoutes);
  }, [frequentRoutes]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        fetchArrivals(stopId);
        if (frequentRoutes.length > 0 && !frequentCardDismissed) fetchFrequentArrivals(frequentRoutes, true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [stopId, fetchArrivals, frequentRoutes, frequentCardDismissed]);

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

  // ── Route reliability tracking (silent data collection) ────────
  const recordedTripsRef = useRef<Set<string>>(new Set());

  const recordReliability = async (arrs: Arrival[], sid: string) => {
    if (arrs.length === 0) return;
    try {
      const toRecord = arrs.filter(a => {
        const key = `${a.routeId}-${sid}-${a.id}`;
        if (recordedTripsRef.current.has(key)) return false;
        if (a.minsAway > 5) return false;
        recordedTripsRef.current.add(key);
        return true;
      });
      if (toRecord.length === 0) return;
      const rows = toRecord.map(a => ({
        route_id: a.routeId,
        stop_id: sid,
        scheduled_time: new Date(Date.now() + (a.minsAway - (a.delay || 0)) * 60000).toISOString(),
        actual_time: new Date(Date.now() + a.minsAway * 60000).toISOString(),
        delta_minutes: a.delay || 0,
        recorded_at: new Date().toISOString(),
      }));
      await supabase.from('route_reliability').insert(rows).then(() => {}, () => {});
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (arrivals.length > 0) {
      recordReliability(arrivals, stopId);
    }
  }, [arrivals]);

  useEffect(() => {
    recordedTripsRef.current.clear();
  }, [stopId]);

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
              ? `${arr.headsign} — ${stop.name}`
              : `${arr.headsign} — ${stop.name}`;

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
    Alert.alert(t('Thanks!', 'Merci!'), t('Reported — helps other riders.', 'Signalé — aide les autres usagers.'));
  };

  const REPORT_CATEGORIES = [
    { id: 'bench_broken', icon: 'bed-outline' as const, label_en: 'Bench broken', label_fr: 'Banc brise' },
    { id: 'shelter_missing', icon: 'umbrella-outline' as const, label_en: 'Shelter missing', label_fr: 'Abri manquant' },
    { id: 'schedule_missing', icon: 'document-text-outline' as const, label_en: 'No posted schedule', label_fr: 'Horaire absent' },
    { id: 'accessibility', icon: 'accessibility-outline' as const, label_en: 'Accessibility issue', label_fr: 'Probleme d\'accessibilite' },
    { id: 'cleanliness', icon: 'flash-outline' as const, label_en: 'Lighting / cleanliness', label_fr: 'Eclairage / proprete' },
    { id: 'other', icon: 'chatbox-ellipses-outline' as const, label_en: 'Other', label_fr: 'Autre' },
  ];

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
    if (tile.action === 'alert' && tile.target === 'garbage') { setGarbageModalVisible(true); return; }
    if (tile.action === 'alert' && tile.target === '311') { Linking.openURL('https://ottawa.ca/en/residents/water-and-environment/waste-and-recycling/report-problem').catch(() => {}); return; }
    if (tile.action === 'alert' && tile.target === 'road_closures') { fetchRoadClosures(); setRoadEventsModal(true); return; }
    if (tile.action === 'alert' && tile.target === 'parks') { fetchParks(); setParksModal(true); return; }
    if (tile.action === 'alert' && tile.target === 'bikeshare') { fetchBikeShare(); setBikeShareModal(true); return; }

    if (tile.action === 'alert' && tile.target === 'campus') { if (!selectedCampus) setCampusPicker(true); else setCampusModal(true); return; }

    if (tile.action === 'alert' && tile.target === 'gas_prices') { setBoardExpandItem({ type: 'gas_prices' }); return; }
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

  const saveGarbageAddress = async () => {
    if (!garbageAddress) return;
    await AsyncStorage.setItem(SK_GARBAGE_ADDRESS, garbageAddress);
    setAddressSaved(true);
    addToBoardIfMissing({ type: 'garbage' });
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

  const renderSocialModal = () => (
    <Modal visible={socialModal} animationType="fade" transparent onRequestClose={() => setSocialModal(false)}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '92%', maxWidth: 420, backgroundColor: colours.surface, borderRadius: 20, overflow: 'hidden', maxHeight: '85%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="beer" size={18} color="#7b5ea7" />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>Social</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => { setSocialModal(false); router.push('/(tabs)/map'); }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="map-outline" size={15} color={colours.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSocialModal(false)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={16} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 6 }}>
            {([{ id: 'all' as const, label: 'All' }, { id: 'bars' as const, label: 'Bars' }, { id: 'restaurants' as const, label: 'Eats' }, { id: 'clubs' as const, label: 'Clubs' }]).map(tab => {
              const active = socialTab === tab.id;
              return (
                <TouchableOpacity key={tab.id} onPress={() => setSocialTab(tab.id)} style={{ flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? '#7b5ea7' : colours.surface, borderColor: active ? '#7b5ea7' : colours.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? 'white' : colours.muted }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Venue list */}
          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 4, gap: 8 }}>
            {(() => {
              const venues = getSocialVenues() || [];
              if (venues.length === 0) return (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Ionicons name="moon-outline" size={32} color={colours.muted} />
                  <Text style={{ fontSize: 14, color: colours.muted, marginTop: 10, textAlign: 'center' }}>No deals right now</Text>
                </View>
              );
              return venues.map((v, i) => {
                if (!v || !v.name) return null;
                const deals = v.isActive ? (v.activeDeals || []) : (v.upcomingDeals || []);
                const statusDeal = deals[0];
                return (
                  <View key={i} style={{ backgroundColor: colours.bg, borderRadius: 14, borderWidth: 1, borderColor: v.isActive ? '#7b5ea7' + '40' : colours.border, overflow: 'hidden' }}>
                    <View style={{ padding: 14, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text, flex: 1 }} numberOfLines={1}>{v.name}</Text>
                        {v.isActive && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7b5ea7' + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7b5ea7' }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#7b5ea7' }}>NOW</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-outline" size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{v.address || 'Ottawa'}</Text>
                      </View>
                      {deals.length > 0 && (
                        <View style={{ marginTop: 2, gap: 4 }}>
                          {deals.map((d: any, j: number) => (
                            <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                              <Ionicons name={v.isActive ? 'pricetag' : 'pricetag-outline'} size={11} color={v.isActive ? '#7b5ea7' : colours.muted} style={{ marginTop: 2 }} />
                              <Text style={{ fontSize: 12, color: colours.text, flex: 1, lineHeight: 16 }}>{d.description}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {statusDeal && (
                        <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>
                          {v.isActive
                            ? `Active now · ends ${(statusDeal.end || '').replace(/^0/, '')}`
                            : `Starts ${(statusDeal.start || '').replace(/^0/, '')}`}
                        </Text>
                      )}
                      <TouchableOpacity onPress={() => { setSocialFeedbackVenue(v.name); setSocialFeedbackText(''); setSocialFeedbackSent(false); }} style={{ marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.muted + '14', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Ionicons name="help-circle-outline" size={12} color={colours.muted} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('Is this accurate?', 'Est-ce exact?')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              });
            })()}
          </ScrollView>

          {/* Submit new deal */}
          {!socialFeedbackVenue && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              {socialDealSent ? (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <Ionicons name="checkmark-circle" size={24} color="#00A78D" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text, marginTop: 4 }}>{t('Deal submitted for review!', 'Offre soumise pour examen!')}</Text>
                </View>
              ) : socialDealForm ? (
                <View style={{ backgroundColor: colours.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colours.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 8 }}>{t('Submit a New Deal', 'Soumettre une offre')}</Text>
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colours.text, marginBottom: 8 }}
                    placeholder={t('Venue name', 'Nom du lieu')}
                    placeholderTextColor={colours.muted}
                    value={socialDealVenue}
                    onChangeText={setSocialDealVenue}
                  />
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colours.text, minHeight: 50, textAlignVertical: 'top', marginBottom: 10 }}
                    placeholder={t('Deal details (e.g. $5 pints Mon-Fri 3-6pm)', 'Details (ex. $5 pintes lun-ven 15h-18h)')}
                    placeholderTextColor={colours.muted}
                    value={socialDealDesc}
                    onChangeText={setSocialDealDesc}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setSocialDealForm(false); setSocialDealVenue(''); setSocialDealDesc(''); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (!socialDealVenue.trim() || !socialDealDesc.trim()) return;
                        setSocialDealSending(true);
                        try {
                          await supabase.from('community_deals').insert({ venue_name: socialDealVenue.trim(), deal_description: socialDealDesc.trim(), approved: false });
                          setSocialDealSent(true);
                          setSocialDealForm(false);
                        } catch (e) { if (__DEV__) console.warn('submit deal failed:', e); }
                        setSocialDealSending(false);
                      }}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: socialDealVenue.trim() && socialDealDesc.trim() ? '#7b5ea7' : colours.border, alignItems: 'center' }}
                    >
                      {socialDealSending
                        ? <ActivityIndicator color="white" size="small" />
                        : <Text style={{ fontSize: 13, fontWeight: '700', color: socialDealVenue.trim() && socialDealDesc.trim() ? 'white' : colours.muted }}>{t('Submit', 'Soumettre')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setSocialDealForm(true); setSocialDealSent(false); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#7b5ea7' + '40', borderStyle: 'dashed' }}>
                  <Ionicons name="add-circle-outline" size={16} color="#7b5ea7" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7b5ea7' }}>{t('Know a deal? Submit it', 'Vous connaissez une offre?')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Feedback sheet */}
          {socialFeedbackVenue && (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colours.surface, borderTopWidth: 1, borderTopColor: colours.border, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
              {socialFeedbackSent ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text }}>Thanks for the tip! 👍</Text>
                  <TouchableOpacity onPress={() => setSocialFeedbackVenue(null)} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#7b5ea7', alignItems: 'center' }}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{socialFeedbackVenue}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 12 }}>Help keep this info up to date</Text>
                  <TextInput
                    style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colours.text, minHeight: 60, textAlignVertical: 'top', marginBottom: 14 }}
                    placeholder="e.g. hours changed, deal ended, new deal..."
                    placeholderTextColor={colours.muted}
                    value={socialFeedbackText}
                    onChangeText={setSocialFeedbackText}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setSocialFeedbackVenue(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (!socialFeedbackText.trim()) return;
                        setSocialFeedbackSending(true);
                        try {
                          await supabase.from('social_feedback').insert({ venue_name: socialFeedbackVenue, suggestion: socialFeedbackText.trim() });
                          setSocialFeedbackSent(true);
                        } catch (e) { if (__DEV__) console.warn('submit social feedback failed:', e); }
                        setSocialFeedbackSending(false);
                      }}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: socialFeedbackText.trim() ? '#7b5ea7' : colours.border, alignItems: 'center' }}
                    >
                      {socialFeedbackSending
                        ? <ActivityIndicator color="white" size="small" />
                        : <Text style={{ fontSize: 14, fontWeight: '700', color: socialFeedbackText.trim() ? 'white' : colours.muted }}>Submit</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Events Modal (Ticketmaster / Eventbrite) ─────────────────
  const renderEventsModal = () => {
    const EB_CATS = ['Music', 'Food & Drink', 'Arts & Culture', 'Health', 'Sports', 'Business', 'Community', 'Family', 'Science & Tech', 'Hobbies'];
    const TM_CATS = eventsSource === 'ticketmaster' ? [...new Set(events.map(e => e.category || 'Other'))].sort() : [];

    const filteredEvents = events.filter(ev => {
      const q = eventsSearch.toLowerCase();
      if (q && !ev.name.toLowerCase().includes(q) && !(ev.venue || '').toLowerCase().includes(q)) return false;
      if (eventsCategory) {
        if (eventsSource === 'ticketmaster') {
          if ((ev.category || 'Other') !== eventsCategory) return false;
        } else {
          if ((ev.category || '') !== eventsCategory) return false;
        }
      }
      if (eventsFreeOnly && !ev.free) return false;
      return true;
    });

    const catPills = eventsSource === 'ticketmaster' ? TM_CATS : EB_CATS;

    // Sort by distance if Near Me active
    let displayEvents = filteredEvents;
    if (eventsNearMe && eventsUserCoords) {
      displayEvents = [...filteredEvents].sort((a, b) => {
        const coordA = a.address ? eventsGeoCache[a.address] : null;
        const coordB = b.address ? eventsGeoCache[b.address] : null;
        const distA = coordA ? haversineKm(eventsUserCoords.lat, eventsUserCoords.lng, coordA.lat, coordA.lng) : 999;
        const distB = coordB ? haversineKm(eventsUserCoords.lat, eventsUserCoords.lng, coordB.lat, coordB.lng) : 999;
        return distA - distB;
      });
    }

    return (
    <Modal visible={eventsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setEventsModal(false); setEventsSearch(''); setEventsCategory(null); setEventsNearMe(false); }}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
              {eventsSource === 'ticketmaster' ? 'Live Events' : 'Community Events'}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {eventsSource === 'ticketmaster' ? 'Ticketmaster · Ottawa' : 'Arts & Community · Ottawa'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => { setEventsModal(false); setEventsSearch(''); setEventsCategory(null); setEventsNearMe(false); }} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>

        {/* Source toggle tabs */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colours.border }}>
          <TouchableOpacity
            onPress={() => { setEventsSource('ticketmaster'); setEventsCategory(null); fetchTicketmasterEvents(); }}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: eventsSource === 'ticketmaster' ? colours.accent : colours.surface }}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: eventsSource === 'ticketmaster' ? '#fff' : colours.text }}>{t('Live Events', 'Événements')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEventsSource('eventbrite'); setEventsCategory(null); fetchEventbriteEvents(); }}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: eventsSource === 'eventbrite' ? colours.accent : colours.surface }}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: eventsSource === 'eventbrite' ? '#fff' : colours.text }}>{t('Community', 'Communauté')}</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar + Near Me + Free */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              value={eventsSearch}
              onChangeText={setEventsSearch}
              placeholder={t('Search events...', 'Rechercher des \u00E9v\u00E9nements...')}
              placeholderTextColor={colours.muted}
              style={{ flex: 1, fontSize: fonts.sm, color: colours.text }}
            />
            {eventsSearch.length > 0 && (
              <TouchableOpacity onPress={() => setEventsSearch('')}>
                <Ionicons name="close-circle" size={16} color={colours.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={toggleNearMe} accessibilityRole="button" accessibilityState={{ selected: eventsNearMe }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: eventsNearMe ? colours.accent : colours.surface, borderColor: eventsNearMe ? colours.accent : colours.border }}>
            <Ionicons name="location" size={14} color={eventsNearMe ? 'white' : colours.muted} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: eventsNearMe ? 'white' : colours.text }}>{t('Near Me', 'Pr\u00E8s de moi')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEventsFreeOnly(f => !f)} accessibilityRole="button" accessibilityState={{ selected: eventsFreeOnly }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: eventsFreeOnly ? '#2d7a3a' : colours.surface, borderColor: eventsFreeOnly ? '#2d7a3a' : colours.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: eventsFreeOnly ? 'white' : colours.text }}>{t('Free', 'Gratuit')}</Text>
          </TouchableOpacity>
        </View>

        {/* Category filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 50, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          {(['All', ...catPills] as string[]).map(cat => {
            const active = cat === 'All' ? eventsCategory === null : eventsCategory === cat;
            // Estimate width: ~9px per char + 32px padding
            const minW = Math.max(52, cat.length * 9 + 32);
            return (
              <Pressable
                key={cat}
                onPress={() => setEventsCategory(cat === 'All' ? null : (active ? null : cat))}
                style={({ pressed }) => ({
                  marginRight: 8,
                  width: minW,
                  height: 34,
                  borderRadius: 17,
                  opacity: pressed ? 0.7 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colours.accent : colours.surface,
                  borderWidth: 1,
                  borderColor: active ? colours.accent : colours.border,
                })}>
                <Text style={{ fontSize: 13, color: active ? '#ffffff' : '#111111' }}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {eventsLoading ? (
            <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /></View>
          ) : displayEvents.length === 0 ? (
            <View style={styles.modalCenter}>
              <Ionicons name="calendar-outline" size={36} color={colours.muted} />
              <Text style={{ color: colours.muted, marginTop: 12, textAlign: 'center' }}>
                {eventsSearch || eventsCategory ? t('No events match your filters.', 'Aucun événement ne correspond.') : t('No upcoming events found in Ottawa.', 'Aucun événement à venir à Ottawa.')}
              </Text>
              {!eventsSearch && !eventsCategory && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('Refresh events', 'Actualiser les événements')}
                  style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}
                  onPress={() => { eventsCacheTime.current.ticketmaster = 0; eventsCacheTime.current.eventbrite = 0; fetchTicketmasterEvents(); fetchEventbriteEvents(); }}
                >
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Refresh', 'Actualiser')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayEvents.map(ev => renderEventCard(ev))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
  };

  const inferEventCategory = (name: string, venue: string): { label: string; color: string } => {
    const txt = (name + ' ' + venue).toLowerCase();
    if (/concert|music|jazz|band|orchestra|choir|karaoke|vinyl|piano|singer|live.*music|opéra|opera|folk|rock|metal|indie|acoustic|blues|country.*night|dj\b|dubstep|hip.hop|rnb|r&b|punk|funk|reggae|dueling piano|open mic|standup|stand-up|comedy|improv/.test(txt)) return { label: 'Music & Arts', color: '#6c3fc7' };
    if (/drag|theatre|théâtre|lecture.*théâtrale|spoken|storytelling|poetry|burlesque|cabaret|variety|film|cinema|screening|art show|gallery|exhibit|museum|craft|paint|drawing|sketch|photography|ceramic|mural|studio|wallack|art supply|art fair|art hang/.test(txt)) return { label: 'Arts & Culture', color: '#b5450b' };
    if (/food|eat|drink|wine|beer|cocktail|dinner|lunch|brunch|breakfast|tasting|culinary|cuisine|chef|iftar|feast|brew|supper|tea|bistro|pub night|trivia|bingo|bowl/.test(txt)) return { label: 'Food & Drink', color: '#1a7a4a' };
    if (/yoga|fitness|run|5k|10k|race|workout|gym|wellness|pilates|meditation|health|dance|zumba|sport|hockey|basketball|soccer|tennis|swim|hike|cycling|bike/.test(txt)) return { label: 'Wellness', color: '#0077b6' };
    if (/career|hiring|job|networking|entrepreneur|business|startup|invest|workshop|seminar|conference|summit|panel|professional|tech|ai\b|data science|machine learning|fastest growing|breakfast of champions/.test(txt)) return { label: 'Business', color: '#444' };
    if (/family|kids|children|child|parent|youth|teen|baby|toddler|camp|school|tinkering|playgroup|march break/.test(txt)) return { label: 'Family', color: '#e67e22' };
    if (/disco|party|mixer|singles|social|nightclub|gala|celebration|fest|festival|reunion|meetup|meet-up|speed dating|trivia night/.test(txt)) return { label: 'Social', color: '#8e44ad' };
    if (/charity|fundrais|volunteer|community|indigenous|multicultural|cultural|awareness|inclusion|diversity|women|black|pride|spiritual|religious|church|mosque|iftar|reconcili/.test(txt)) return { label: 'Community', color: '#0077a0' };
    return { label: 'Community', color: '#0077a0' };
  };

  const CATEGORY_COLORS: { [key: string]: string } = {
    'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
    'Health': '#0077b6', 'Sports': '#006400', 'Business': '#444',
    'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a', 'Hobbies': '#7b5ea7',
  };

  const renderEventCard = (ev: typeof events[0]) => {
    const catLabel = eventsSource === 'eventbrite' ? (ev.category || 'Community') : null;
    const catColor = catLabel ? (CATEGORY_COLORS[catLabel] || '#555') : null;
    return (
      <TouchableOpacity key={ev.id} onPress={() => ev.url && Linking.openURL(ev.url)} style={{ marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, ...cardShadow }}>
        {ev.image && (
          <View style={{ height: 85, borderRadius: 9, overflow: 'hidden', marginBottom: 9, backgroundColor: colours.border }}>
            <ImageBackground source={{ uri: ev.image }} style={{ flex: 1 }} resizeMode="cover">
              <View style={{ position: 'absolute', top: 7, left: 7, flexDirection: 'row', gap: 5 }}>
                {catLabel && catColor && (
                  <View style={{ backgroundColor: catColor + 'ee', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>{catLabel}</Text>
                  </View>
                )}
                {ev.free && (
                  <View style={{ backgroundColor: '#2d7a3aee', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>FREE</Text>
                  </View>
                )}
              </View>
            </ImageBackground>
          </View>
        )}
        {!ev.image && catLabel && catColor && (
          <View style={{ backgroundColor: catColor + '18', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6, borderWidth: 1, borderColor: catColor + '40' }}>
            <Text style={{ color: catColor, fontSize: 10, fontWeight: '700' }}>{catLabel}</Text>
          </View>
        )}
        <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text, marginBottom: 3 }} numberOfLines={2}>{ev.name}</Text>
        {ev.date && (
          <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginBottom: 1 }}>
            {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
            {ev.time ? ` · ${ev.time}` : ''}
          </Text>
        )}
        {ev.venue ? <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{ev.venue}</Text> : null}
        {ev.url && <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginTop: 7 }}>
          {eventsSource === 'ticketmaster' ? 'Get tickets →' : ev.source === 'City of Ottawa' ? 'View on ottawa.ca →' : 'Get tickets →'}
        </Text>}
      </TouchableOpacity>
    );
  };

  // ── 511 Road Events Modal ─────────────────────────────────────
  const renderRoadEventsModal = () => (
    <Modal visible={roadEventsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRoadEventsModal(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Road Closures', 'Fermetures de routes')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Ottawa Open Data · Sorted by distance', 'Donn\u00E9es ouvertes · Tri\u00E9 par distance')}</Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setRoadEventsModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>2
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {roadEventsLoading ? (
            <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Loading road closures...', 'Chargement...')}</Text></View>
          ) : roadEvents.length === 0 ? (
            <View style={styles.modalCenter}>
              <Ionicons name="checkmark-circle" size={36} color={colours.accent} />
              <Text style={{ color: colours.text, fontWeight: '700', fontSize: fonts.lg, marginTop: 12 }}>{t('All Clear', 'Tout est d\u00E9gag\u00E9')}</Text>
              <Text style={{ color: colours.muted, marginTop: 6, textAlign: 'center' }}>{t('No active road closures in Ottawa.', 'Aucune fermeture de route active.')}</Text>
            </View>
          ) : roadEvents.map(ev => (
            <View key={ev.id} style={{ marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderLeftWidth: 4, borderColor: colours.border, borderLeftColor: '#e8a020', ...cardShadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{ backgroundColor: '#e8a02018', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#e8a020', textTransform: 'uppercase' }}>{ev.type}</Text>
                  </View>
                  {ev.road ? <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.text }} numberOfLines={1}>{ev.road}</Text> : null}
                </View>
                {ev.distance < 900 && <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted }}>{ev.distance < 1 ? `${(ev.distance * 1000).toFixed(0)}m` : `${ev.distance.toFixed(1)}km`}</Text>}
              </View>
              <Text style={{ fontSize: fonts.md, color: colours.muted, lineHeight: 20 }}>{ev.description}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Ottawa Parks & Rinks Modal ────────────────────────────────
  const renderParksModal = () => (
    <Modal visible={parksModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setParksModal(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Parks & Rinks', 'Parcs et patinoires')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('10 nearest · Sorted by distance', '10 plus proches · Triés par distance')}</Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setParksModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {parksLoading ? (
            <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Loading rinks...', 'Chargement...')}</Text></View>
          ) : parks.length === 0 ? (
            <View style={styles.modalCenter}>
              <Ionicons name="snow-outline" size={36} color={colours.muted} />
              <Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('No park or rink data available right now.', 'Aucune donnée de parc ou patinoire disponible.')}</Text>
            </View>
          ) : parks.map((p, i) => (
            <View key={i} style={{ marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, ...cardShadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#004890' + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="snow" size={16} color="#004890" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text }} numberOfLines={1}>{p.name}</Text>
                  {p.crossStreets ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{p.crossStreets}</Text> : null}
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#00A78D' }}>{p.distance < 1 ? `${Math.round(p.distance * 1000)}m` : `${p.distance.toFixed(1)} km`}</Text>
              </View>
              {p.facility ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 6 }}>{p.facility}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {p.accessible && p.accessible.toLowerCase() === 'yes' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00A78D' + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Ionicons name="accessibility" size={12} color="#00A78D" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#00A78D' }}>{t('Accessible', 'Accessible')}</Text>
                  </View>
                )}
                {p.boards && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#004890' + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Ionicons name="shield-outline" size={12} color="#004890" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#004890' }}>{t('Boards', 'Bandes')}: {p.boards}</Text>
                  </View>
                )}
                {p.toilet && p.toilet.toLowerCase() === 'yes' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7b5ea7' + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Ionicons name="water-outline" size={12} color="#7b5ea7" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#7b5ea7' }}>{t('Washroom', 'Toilettes')}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── VeloGo Bike Share Modal ───────────────────────────────────
  const renderBikeShareModal = () => (
    <Modal visible={bikeShareModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBikeShareModal(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Bike Share', 'V\u00E9lopartage')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('VeloGo · Nearest stations', 'VeloGo · Stations les plus proches')}</Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setBikeShareModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {bikeShareLoading ? (
            <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Finding nearby stations...', 'Recherche de stations...')}</Text></View>
          ) : bikeStations.length === 0 ? (
            <View style={styles.modalCenter}>
              <Ionicons name="bicycle-outline" size={36} color={colours.muted} />
              <Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('No bike stations found.', 'Aucune station trouv\u00E9e.')}</Text>
            </View>
          ) : bikeStations.map((s, i) => (
            <View key={i} style={{ marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, ...cardShadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#00A78D' + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="bicycle" size={16} color="#00A78D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{s.distance < 1 ? `${(s.distance * 1000).toFixed(0)}m away` : `${s.distance.toFixed(1)}km away`}</Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: s.bikes > 0 ? '#00A78D' + '12' : '#cc3b2a' + '12', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Ionicons name="bicycle" size={14} color={s.bikes > 0 ? '#00A78D' : '#cc3b2a'} />
                  <Text style={{ fontSize: 16, fontWeight: '900', color: s.bikes > 0 ? '#00A78D' : '#cc3b2a' }}>{s.bikes}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600' }}>{t('bikes', 'v\u00E9los')}</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: s.docks > 0 ? '#004890' + '12' : '#cc3b2a' + '12', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Ionicons name="lock-closed-outline" size={14} color={s.docks > 0 ? '#004890' : '#cc3b2a'} />
                  <Text style={{ fontSize: 16, fontWeight: '900', color: s.docks > 0 ? '#004890' : '#cc3b2a' }}>{s.docks}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600' }}>{t('docks', 'ancrages')}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );


  const isNight = new Date().getHours() >= 21;
  const isFav = favs.find(f => f.id === stopId);
  const activeAlerts = alerts.filter(a => a.category !== 'accessibility');
  const hasAlerts = activeAlerts.length > 0;

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

  // ── Campus Modal ──
  const CAMPUS_TABS = [
    { id: 'shuttle' as const, label_en: 'Shuttle', label_fr: 'Navette', icon: 'bus' },
    { id: 'library' as const, label_en: 'Library', label_fr: 'Biblio', icon: 'book' },
    { id: 'study' as const, label_en: 'Study', label_fr: 'Étude', icon: 'book-outline' },
    { id: 'upass' as const, label_en: 'U-Pass', label_fr: 'U-Pass', icon: 'card' },
    { id: 'food' as const, label_en: 'Food', label_fr: 'Bouffe', icon: 'restaurant' },
  ];

  const routeToCampusPlace = (name: string, lat: number, lng: number) => {
    setCampusModal(false);
    router.push({ pathname: '/(tabs)/planner', params: { toLabel: name, toLat: String(lat), toLng: String(lng) } } as any);
  };

  const renderCampusModal = () => {
    const campus = selectedCampus;
    const accent = campus?.accent || '#004890';
    return (
    <>
      {/* Campus Picker */}
      <Modal visible={campusPicker} animationType="fade" transparent onRequestClose={() => setCampusPicker(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ width: '85%', maxWidth: 360, backgroundColor: colours.surface, borderRadius: 20, overflow: 'hidden', padding: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 4 }}>{t('Choose Your Campus', 'Choisissez votre campus')}</Text>
            <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginBottom: 20 }}>{t('You can change this later', 'Vous pouvez changer plus tard')}</Text>
            {CAMPUSES.map(c => (
              <TouchableOpacity key={c.id} onPress={() => selectCampus(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 8, backgroundColor: colours.bg }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="school" size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{language === 'fr' ? c.name_fr : c.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setCampusPicker(false)} style={{ marginTop: 8, alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '600' }}>{t('Cancel', 'Annuler')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Campus Full Modal */}
      <Modal visible={campusModal} animationType="slide" transparent onRequestClose={() => setCampusModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 12 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="school" size={20} color={accent} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{campus ? t(campus.name, campus.name_fr) : t('My Campus', 'Mon Campus')}</Text>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { setCampusModal(false); setCampusPicker(true); }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colours.border }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{t('Change', 'Changer')}</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
              {CAMPUS_TABS.map(tab => {
                const active = campusTab === tab.id;
                return (
                  <TouchableOpacity key={tab.id} onPress={() => { setCampusTab(tab.id); if (tab.id === 'food' && campus && campusFood.length === 0) fetchCampusFood(campus); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? accent : colours.surface, borderColor: active ? accent : colours.border }}>
                    <Ionicons name={tab.icon as any} size={12} color={active ? 'white' : colours.muted} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'white' : colours.muted }}>{language === 'fr' ? tab.label_fr : tab.label_en}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              {/* ── Shuttle Tab ── */}
              {campusTab === 'shuttle' && campus && (
                campus.shuttles.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="bus-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8, fontSize: 14, textAlign: 'center' }}>{t('No campus shuttle service', 'Pas de service de navette')}</Text>
                    <Text style={{ color: colours.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('Use OC Transpo routes to get around campus', 'Utilisez les lignes OC Transpo pour le campus')}</Text>
                  </View>
                ) : (
                  campus.shuttles.map(route => {
                    const next = getNextDeparture(route.departures);
                    return (
                      <View key={route.id} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }}>
                        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{language === 'fr' ? route.label_fr : route.label_en}</Text>
                          {next ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <View style={{ backgroundColor: accent + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>{t('Next', 'Prochain')}: {fmt12h(next.time)}</Text>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: next.minsAway <= 10 ? colours.red : accent }}>{next.minsAway} min</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 4 }}>{t('No more departures today', 'Plus de departs aujourd\'hui')}</Text>
                          )}
                        </View>
                        <View style={{ padding: 14 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('STOPS', 'ARRÊTS')}</Text>
                          {route.stops.map((stop, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === 0 ? accent : i === route.stops.length - 1 ? accent : colours.border }} />
                              <Text style={{ fontSize: 13, color: colours.text }}>{stop}</Text>
                            </View>
                          ))}
                          {route.note_en && (
                            <Text style={{ fontSize: 10, color: colours.muted, marginTop: 8, fontStyle: 'italic' }}>{language === 'fr' ? route.note_fr : route.note_en}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )
              )}
              {campusTab === 'shuttle' && campus?.buswhereUrl ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(campus.buswhereUrl).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30', marginBottom: 8 }}>
                  <Ionicons name="location" size={14} color={accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t('Track Live on BusWhere', 'Suivre en direct sur BusWhere')}</Text>
                </TouchableOpacity>
              ) : null}
              {campusTab === 'shuttle' && campus?.shuttleDestination ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => { const dest = campus?.shuttleDestination; if (dest) routeToCampusPlace(dest.name, dest.lat, dest.lng); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
                  <Ionicons name="navigate" size={14} color={accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t("Can't catch shuttle? Route via transit", 'Navette manquée? Itinéraire en transport')}</Text>
                </TouchableOpacity>
              ) : null}

              {/* ── Library Tab ── */}
              {campusTab === 'library' && campus && (
                campus.libraries.map(lib => {
                  const status = isLibraryOpen(lib);
                  return (
                    <View key={lib.name} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, flex: 1 }} numberOfLines={1}>{lib.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: status.open ? '#00A78D18' : colours.red + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.open ? '#00A78D' : colours.red }} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: status.open ? '#00A78D' : colours.red }}>
                            {status.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
                          </Text>
                        </View>
                      </View>
                      <View style={{ padding: 14 }}>
                        {status.open && status.closesAt && (
                          <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 8 }}>{t('Closes at', 'Ferme à')} {fmt12h(status.closesAt)}</Text>
                        )}
                        {!status.open && status.opensAt && (
                          <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 8 }}>{t('Opens at', 'Ouvre à')} {fmt12h(status.opensAt)}</Text>
                        )}
                        {[0, 1, 2, 3, 4, 5, 6].map(day => {
                          const hrs = lib.hours[day];
                          const isToday = new Date().getDay() === day;
                          return (
                            <View key={day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: isToday ? 8 : 0, borderRadius: isToday ? 8 : 0, backgroundColor: isToday ? accent + '10' : 'transparent', borderWidth: isToday ? 1 : 0, borderColor: isToday ? accent + '25' : 'transparent', marginVertical: isToday ? 2 : 0 }}>
                              <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '400', color: isToday ? accent : colours.muted }}>{getDayLabel(day, language)}{isToday ? ` (${t('Today', "Aujourd'hui")})` : ''}</Text>
                              <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '400', color: isToday ? accent : colours.muted }}>
                                {hrs ? `${fmt12h(hrs[0])} – ${fmt12h(hrs[1])}` : t('Closed', 'Fermé')}
                              </Text>
                            </View>
                          );
                        })}
                        <Text style={{ fontSize: 10, color: colours.muted, marginTop: 8, fontStyle: 'italic' }}>{language === 'fr' ? lib.note_fr : lib.note_en}</Text>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(lib.name, lib.lat, lib.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30' }}>
                          <Ionicons name="navigate" size={13} color={accent} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{t(`Route to ${lib.name.split(' (')[0]}`, `Itinéraire vers ${lib.name.split(' (')[0]}`)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              {/* ── Study Spots Tab ── */}
              {campusTab === 'study' && campus && (
                campus.studySpots.map(spot => (
                  <View key={spot.name} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 10, overflow: 'hidden' }}>
                    <View style={{ padding: 14 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{language === 'fr' ? spot.name_fr : spot.name}</Text>
                      <Text style={{ fontSize: 12, color: colours.muted, marginTop: 4 }}>{language === 'fr' ? spot.description_fr : spot.description_en}</Text>
                      <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(spot.name, spot.lat, spot.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30' }}>
                        <Ionicons name="navigate" size={13} color={accent} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{t(`Route to ${spot.name}`, `Itinéraire vers ${language === 'fr' ? spot.name_fr : spot.name}`)}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {/* ── U-Pass Tab ── */}
              {campusTab === 'upass' && campus && (
                <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border, alignItems: 'center' }}>
                    <Ionicons name="card" size={32} color={accent} style={{ marginBottom: 8 }} />
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text }}>{t('U-Pass', 'U-Pass')}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: accent, marginTop: 4 }}>{campus.upass.cost}</Text>
                  </View>
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Ionicons name="bus" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>{language === 'fr' ? campus.upass.coverage_fr : campus.upass.coverage_en}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Ionicons name="calendar" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>{language === 'fr' ? campus.upass.validity_fr : campus.upass.validity_en}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <Ionicons name="school" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>Carleton, uOttawa, Algonquin</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(campus.upass.url).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: accent, }}>
                      <Ionicons name="open-outline" size={14} color="white" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>{t('Official U-Pass Page', 'Page U-Pass officielle')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── Food Tab ── */}
              {campusTab === 'food' && campus && (
                campusFoodLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <ActivityIndicator color={accent} size="large" />
                    <Text style={{ color: colours.muted, marginTop: 8 }}>{t('Finding food nearby...', 'Recherche de restos...')}</Text>
                  </View>
                ) : campusFood.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="restaurant-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8 }}>{t('No food places found', 'Aucun resto trouvé')}</Text>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => fetchCampusFood(campus)} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: accent, backgroundColor: accent + '15' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t('Retry', 'Réessayer')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  campusFood.map(place => (
                    <View key={place.id} style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 8, overflow: 'hidden' }}>
                      <TouchableOpacity onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(place.name + ' ' + place.vicinity)}`).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="restaurant" size={18} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }} numberOfLines={1}>{place.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {place.rating && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Ionicons name="star" size={10} color={colours.orange} />
                                <Text style={{ fontSize: 11, color: colours.muted }}>{place.rating}</Text>
                              </View>
                            )}
                            {place.open !== undefined && (
                              <Text style={{ fontSize: 11, fontWeight: '600', color: place.open ? '#00A78D' : colours.red }}>
                                {place.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Ionicons name="map-outline" size={16} color={colours.muted} />
                      </TouchableOpacity>
                      {place.lat && place.lng && (
                        <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(place.name, place.lat, place.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colours.border }}>
                          <Ionicons name="navigate" size={12} color={accent} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{t('Get there via transit', 'Y aller en transport')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )
              )}
            </ScrollView>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setCampusModal(false)} style={{ marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: accent, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>{t('Done', 'Terminé')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
    );
  };

  const alertDotColour = () => { if (!hasAlerts) return colours.accent; return CATEGORY_COLOUR[activeAlerts[0]?.category] || colours.orange; };

  const wrapSection = (id: string, children: React.ReactNode) => {
    if (!editMode) return children;
    const idx = sectionOrder.indexOf(id);
    return (
      <View style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: colours.accent + '40', borderRadius: 16, margin: 8, borderStyle: 'dashed', zIndex: 1, pointerEvents: 'none' }} />
        <View style={{ position: 'absolute', right: 16, top: 8, flexDirection: 'row', gap: 4, zIndex: 10 }}>
          <TouchableOpacity onPress={() => moveSectionUp(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Move section up', 'Deplacer la section vers le haut')}>
            <Ionicons name="chevron-up" size={14} color={idx === 0 ? colours.muted : colours.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => moveSectionDown(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Move section down', 'Deplacer la section vers le bas')}>
            <Ionicons name="chevron-down" size={14} color={idx === sectionOrder.length - 1 ? colours.muted : colours.accent} />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    );
  };



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
              <Text style={{ fontSize: 10, color: colours.orange, fontWeight: '600' }}> — </Text>
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
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('Did this bus come?', 'Ce bus est-il passé?')}</Text>
                <TouchableOpacity onPress={() => reportBusPassed(item.routeId)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30' + '18', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Report as missed', 'Signaler comme manqué')}>
                  <Ionicons name="close" size={12} color="#FF3B30" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#34C759' + '18', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Confirm it came', 'Confirmer son passage')}>
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

  const renderBoardExpandModal = () => {
    if (!boardExpandItem) return null;
    const isGarbage = boardExpandItem.type === 'garbage';
    const isStop = boardExpandItem.type === 'bus_stop' || boardExpandItem.type === 'lrt_station';
    const isGas = boardExpandItem.type === 'gas_prices';

    const modalTitle = isGarbage ? 'Garbage Day'
      : isGas ? 'Gas Prices · Ottawa'
      : isStop ? (boardExpandItem as any).name
      : '';
    const modalSub = isGarbage ? 'Collection schedule'
      : isGas ? 'Nearby station prices'
      : boardExpandItem.type === 'lrt_station' ? 'O-Train arrivals'
      : 'Bus arrivals';

    return (
      <Modal visible={!!boardExpandItem} animationType="slide" transparent onRequestClose={() => setBoardExpandItem(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '85%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{modalTitle}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>{modalSub}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {isStop && (() => {
                  const sid = (boardExpandItem as any).id;
                  const sname = (boardExpandItem as any).name;
                  const saved = !!favs.find(f => f.id === sid);
                  return (
                    <TouchableOpacity onPress={() => { saved ? removeFav(sid) : addFav(sid, sname); }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: saved ? colours.accent : colours.border, backgroundColor: saved ? colours.accent + '15' : colours.surface, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={saved ? t('Unsave', 'Retirer') : t('Save', 'Sauvegarder')}>
                      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={14} color={saved ? colours.accent : colours.muted} />
                    </TouchableOpacity>
                  );
                })()}
                {isStop && (
                  <TouchableOpacity onPress={() => fetchArrivals((boardExpandItem as any).id)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Refresh', 'Actualiser')}>
                    <Ionicons name="refresh" size={14} color={colours.accent} />
                  </TouchableOpacity>
                )}
                {isGas && (
                  <TouchableOpacity onPress={() => { setBoardExpandItem(null); Linking.openURL('https://www.gasbuddy.com/gas-prices/Canada/Ontario/Ottawa'); }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>GasBuddy ↗</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }} onPress={() => setBoardExpandItem(null)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
            </View>
            {isGas ? (
              <GasPricesExpanded colours={colours} fonts={fonts} />
            ) : isGarbage ? (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
                {garbageAddress && <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 16 }}>{garbageAddress}</Text>}
                {garbageEvents.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="home-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, textAlign: 'center', marginTop: 12 }}>Open the full Garbage Day widget to set your address.</Text>
                    <TouchableOpacity onPress={() => { setBoardExpandItem(null); setGarbageModalVisible(true); }} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: colours.accent }}>
                      <Text style={{ color: 'white', fontWeight: '700' }}>Open Garbage Day</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  garbageEvents.slice(0, 6).map((ev, i) => {
                    const BIN_LABELS: Record<string, { color: string; label: string }> = { 'garbage': { color: '#666', label: 'Garbage' }, 'recycling-blue': { color: '#1a6fbf', label: 'Blue Bin' }, 'recycling-black': { color: '#222', label: 'Black Bin' }, 'green-bin': { color: '#2d7a3a', label: 'Green Bin' }, 'yard-waste': { color: '#8b5a00', label: 'Yard Waste' } };
                    const d = new Date(ev.date + 'T12:00:00');
                    const daysUntil = Math.round((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
                    const label = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : null;
                    const isNext = i === 0;
                    return (
                      <View key={i} style={{ marginBottom: 10, padding: 14, borderRadius: 14, borderWidth: isNext ? 1.5 : 1, borderColor: isNext ? colours.accent : colours.border, backgroundColor: isNext ? colours.accent + '10' : colours.surface }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text }}>{d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
                          {label && <View style={{ backgroundColor: colours.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>{label}</Text></View>}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          {ev.flags.map(flag => { const bin = BIN_LABELS[flag]; if (!bin) return null; return (<View key={flag} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: bin.color + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: bin.color }} /><Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }}>{bin.label}</Text></View>); })}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                {loading ? (
                  <View style={{ padding: 8 }}>{[0,1,2].map(i => <ArrivalRowSkeleton key={i} colours={colours} />)}</View>
                ) : arrivals.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <Ionicons name="time-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8 }}>No upcoming arrivals</Text>
                  </View>
                ) : (
                  arrivals.map(renderArrival)
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderGarbageModal = () => {
    const nextPickup = garbageEvents[0];
    const nextDate = nextPickup ? new Date(nextPickup.date + 'T12:00:00') : null;
    const daysUntil = nextDate ? Math.round((nextDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000) : null;
    const daysLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : daysUntil != null ? `IN ${daysUntil} DAYS` : null;
    const renderBinChips = (flags: string[]) => (
      <View style={{ gap: 8 }}>
        {flags.map(flag => {
          const bin = BIN_INFO[flag]; if (!bin) return null;
          const isOpen = expandedBin === flag;
          return (
            <TouchableOpacity key={flag} onPress={() => setExpandedBin(isOpen ? null : flag)} style={{ backgroundColor: bin.color + '15', borderWidth: 1, borderColor: bin.color + '55', borderRadius: 12, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: bin.color }} />
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{bin.label}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colours.muted }}>{isOpen ? '▲' : '▼'}</Text>
              </View>
              {isOpen && (<View style={{ marginTop: 10, gap: 6 }}><Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#2d7a3a', marginBottom: 2 }}>✓ Accepted</Text>{bin.accepts.map(item => <Text key={item} style={{ fontSize: fonts.sm, color: colours.text }}>  • {item}</Text>)}<Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#cc3b2a', marginTop: 6, marginBottom: 2 }}>✗ Not accepted</Text>{bin.rejects.map(item => <Text key={item} style={{ fontSize: fonts.sm, color: colours.muted }}>  • {item}</Text>)}</View>)}
            </TouchableOpacity>
          );
        })}
      </View>
    );
    return (
      <Modal visible={garbageModalVisible} animationType="slide" transparent onRequestClose={() => { setGarbageModalVisible(false); setExpandedBin(null); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 16 }} />
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, paddingHorizontal: 20, marginBottom: 12 }}>{t('Garbage Day', 'Jour de collecte')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 }}>
              <TextInput style={{ flex: 1, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colours.text, fontSize: fonts.md }} placeholder={t('Enter your Ottawa address...', 'Entrez votre adresse \u00E0 Ottawa...')} placeholderTextColor={colours.muted} value={garbageAddressInput} onChangeText={setGarbageAddressInput} onSubmitEditing={() => searchGarbageAddress(garbageAddressInput)} returnKeyType="search" accessibilityLabel={t('Enter your Ottawa address', 'Entrez votre adresse a Ottawa')} />
              <TouchableOpacity onPress={() => searchGarbageAddress(garbageAddressInput)} style={{ backgroundColor: colours.accent, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Search address', 'Rechercher l\'adresse')}>
                <Ionicons name="search" size={18} color="white" />
              </TouchableOpacity>
            </View>
            {garbageLoading && <ActivityIndicator color={colours.accent} style={{ marginVertical: 20 }} />}
            {!!garbageError && <Text style={{ color: '#cc3b2a', paddingHorizontal: 20, marginBottom: 12, fontSize: fonts.sm }}>{garbageError}</Text>}
            {garbageAddress ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>{garbageAddress}</Text>
                  <TouchableOpacity onPress={saveGarbageAddress} style={{ backgroundColor: addressSaved ? '#2d7a3a' : colours.surface, borderWidth: 1, borderColor: addressSaved ? '#2d7a3a' : colours.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: addressSaved ? 'white' : colours.text }}>{addressSaved ? '✓ Saved' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
                {nextPickup && (
                  <View style={{ backgroundColor: colours.accent + '15', borderWidth: 1.5, borderColor: colours.accent, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent, marginBottom: 4 }}>NEXT COLLECTION · {daysLabel}</Text>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 12 }}>{nextDate?.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                    {renderBinChips(nextPickup.flags)}
                  </View>
                )}
                {garbageEvents.slice(1).map((ev, i) => { const d = new Date(ev.date + 'T12:00:00'); return (<View key={i} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}><Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginBottom: 6 }}>{d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>{renderBinChips(ev.flags)}</View>); })}
                <View style={{ height: 16 }} />
              </ScrollView>
            ) : !garbageLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="home-outline" size={36} color={colours.muted} />
                <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center', marginTop: 12 }}>{t('Enter your Ottawa address to see your collection schedule.', 'Entrez votre adresse \u00E0 Ottawa pour voir votre calendrier de collecte.')}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => { setGarbageModalVisible(false); setExpandedBin(null); }} style={{ marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={t('Done', 'Termine')}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAlertsModal = () => (
    <Modal visible={alertsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAlertsModalVisible(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View><Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Service Alerts', 'Alertes de service')}</Text><Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('OC Transpo · Live', 'OC Transpo · En direct')}</Text></View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setAlertsModalVisible(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}><Ionicons name="close" size={18} color={colours.text} /></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.lrtStatusCard, { backgroundColor: colours.lrt + '12', borderColor: colours.lrt }]} onPress={() => { setAlertsModalVisible(false); Linking.openURL('https://occasionaltransport.ca'); }}>
          <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><Text style={{ fontSize: 16 }}>🚊</Text><Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.lrt }}>{t('LRT Community Status', 'Statut communautaire du TLR')}</Text></View><Text style={{ fontSize: fonts.sm, color: colours.muted, lineHeight: 18 }}>{t('Real-time LRT incident reports from Ottawa riders — faster than official alerts.', "Rapports d'incidents TLR en temps réel des usagers d'Ottawa.")}</Text></View>
          <Ionicons name="open-outline" size={18} color={colours.lrt} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {alertsLoading ? (<View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Loading alerts...', 'Chargement des alertes...')}</Text></View>) : alerts.length === 0 ? (<View style={styles.modalCenter}><Ionicons name="checkmark-circle" size={48} color={colours.accent} /><Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('All Clear', 'Tout est normal')}</Text><Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 6 }}>{t('No active service alerts on OC Transpo.', 'Aucune alerte de service active sur OC Transpo.')}</Text></View>) : alerts.map(alert => {
            const catColour = CATEGORY_COLOUR[alert.category] || colours.accent;
            return (<TouchableOpacity key={alert.id} style={[styles.alertCard, { backgroundColor: colours.surface, borderColor: colours.border, borderLeftColor: catColour, ...cardShadow }]} onPress={() => alert.link && Linking.openURL(alert.link)} activeOpacity={alert.link ? 0.8 : 1}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}><View style={[styles.alertCatBadge, { backgroundColor: catColour + '20' }]}><Text style={{ fontSize: 9, fontWeight: '800', color: catColour, textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.category}</Text></View>{alert.routes.length > 0 && (<View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1 }}>{alert.routes.slice(0, 4).map(route => (<View key={route} style={[styles.routeBadge, { backgroundColor: colours.accent + '18' }]}><Text style={{ fontSize: 9, fontWeight: '700', color: colours.accent }}>{route}</Text></View>))}</View>)}</View><Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 8, lineHeight: 20 }}>{alert.title}</Text>{alert.description ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>{alert.description}</Text> : null}{alert.pubDate ? <Text style={{ fontSize: 10, color: colours.muted, marginTop: 6 }}>{alert.pubDate}</Text> : null}{alert.link ? <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginTop: 6 }}>{t('View details →', 'Voir les détails →')}</Text> : null}</TouchableOpacity>);
          })}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderSwapSheet = () => (
    <Modal visible={swapSheetVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSwapSheetVisible(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableWithoutFeedback onPress={() => setSwapSheetVisible(false)}><View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} /></TouchableWithoutFeedback>
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, backgroundColor: colours.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{t('Change Tile', 'Changer la tuile')}</Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 16 }}>{t('Pick a category for this slot', 'Choisissez une catégorie pour cet emplacement')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ALL_OTTAWA_LIFE.map(item => {
              const isActive = swapTileIndex !== null && ottawaLifeIds[swapTileIndex] === item.id;
              const isUsed = ottawaLifeIds.includes(item.id) && !isActive;
              return (<TouchableOpacity key={item.id} disabled={isUsed} onPress={() => swapTileIndex !== null && swapOttawaLifeTile(swapTileIndex, item.id)} style={{ width: '21%', alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 2, borderColor: isActive ? item.accent : isUsed ? colours.border : colours.border, backgroundColor: isActive ? item.accent + '18' : isUsed ? colours.bg : colours.surface, opacity: isUsed ? 0.4 : 1 }}><Ionicons name={item.icon as any} size={22} color={isActive ? item.accent : isUsed ? colours.muted : item.accent} /><Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? item.accent : colours.text, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>{language === 'fr' ? item.label_fr : item.label_en}</Text></TouchableOpacity>);
            })}
          </View>
        </View>
      </View>
    </Modal>
  );

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
            {loading ? (<View style={{ marginTop: 8 }}>{[0,1,2].map(i => <ArrivalRowSkeleton key={i} colours={colours} />)}</View>) : error ? (<View style={styles.modalCenter}><Ionicons name="wifi-outline" size={36} color={colours.muted} /><Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text></View>) : arrivals.length === 0 ? (<View style={styles.modalCenter}><Ionicons name="time-outline" size={48} color={colours.muted} /><Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text></View>) : (<View style={{ marginTop: 8 }}>{cachedAt && (<View style={{ backgroundColor: '#ff9500' + '15', borderLeftWidth: 3, borderLeftColor: '#ff9500', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}><Text style={{ fontSize: fonts.sm, color: '#ff9500', fontWeight: '600' }}>{t(`Offline — last updated ${Math.round((Date.now() - cachedAt) / 60000)} min ago`, `Hors ligne — dernière mise à jour il y a ${Math.round((Date.now() - cachedAt) / 60000)} min`)}</Text></View>)}{arrivals.map(renderArrival)}</View>)}
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
                <Text style={{ flex: 1, fontSize: 10, color: colours.muted, fontWeight: '600' }}>{t('Help Ottawa riders — tap to report crowding or missed buses', 'Aidez les usagers — signalez l\'achalandage ou les bus manqués')}</Text>
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

  const renderStopReportModal = () => (
    <Modal visible={showReportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReportModal(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Report an Issue', 'Signaler un probleme')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {t('Stop', 'Arret')} #{expandedStopId} · {stopName}
            </Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setShowReportModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            {t('What\'s the issue?', 'Quel est le probleme?')}
          </Text>
          <View style={{ gap: 8, marginBottom: 20 }}>
            {REPORT_CATEGORIES.map(cat => {
              const active = reportCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setReportCategory(cat.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: active ? '#cc3b2a' : colours.border, backgroundColor: active ? '#cc3b2a10' : colours.surface }}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: active ? '#cc3b2a18' : colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={cat.icon} size={18} color={active ? '#cc3b2a' : colours.muted} />
                  </View>
                  <Text style={{ fontSize: fonts.md, fontWeight: active ? '700' : '500', color: active ? '#cc3b2a' : colours.text }}>
                    {t(cat.label_en, cat.label_fr)}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#cc3b2a" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {t('Details (optional)', 'Details (facultatif)')}
          </Text>
          <TextInput
            value={reportDescription}
            onChangeText={setReportDescription}
            placeholder={t('Describe the issue...', 'Decrivez le probleme...')}
            placeholderTextColor={colours.muted}
            multiline
            style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, padding: 14, fontSize: fonts.md, color: colours.text, minHeight: 80, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={submitStopReport}
            disabled={!reportCategory || reportSubmitting}
            style={{ marginTop: 20, backgroundColor: reportCategory ? '#cc3b2a' : colours.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: reportCategory ? 1 : 0.5 }}
            activeOpacity={0.8}
          >
            {reportSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fonts.md }}>
                {t('Submit Report', 'Envoyer le signalement')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );

  const quickActions = ALL_QUICK_ACTIONS.filter(a => quickActionIds.includes(a.id));
  const ottawaLife = ottawaLifeIds.map(id => ALL_OTTAWA_LIFE.find(o => o.id === id)).filter(Boolean) as typeof ALL_OTTAWA_LIFE;

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'otrain': return (
        <React.Fragment key="otrain">{wrapSection('otrain', <>
          <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm, marginBottom: 6 }]}>{t('O-Train', 'O-Train')}</Text>
          <TouchableOpacity style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: showLine1 ? 0 : 8, borderWidth: 1, borderRadius: 14, borderBottomLeftRadius: showLine1 ? 0 : 14, borderBottomRightRadius: showLine1 ? 0 : 14, padding: 12, backgroundColor: showLine1 ? colours.lrt + '12' : colours.surface, borderColor: showLine1 ? colours.lrt : colours.border }, cardShadow]} onPress={() => { setShowLine1(!showLine1); setShowLine2(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.lrt + '20', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '900', color: colours.lrt }}>L1</Text></View>
              <View><Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine1 ? colours.lrt : colours.text }}>{t('Confederation Line', 'Ligne Confédération')}</Text><Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t("Tunney's Pasture ↔ Blair", "Tunney's ↔ Blair")}</Text></View>
            </View>
            <Ionicons name={showLine1 ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
          </TouchableOpacity>
          {showLine1 && (
            <View style={[{ marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: colours.surface, borderColor: colours.lrt, overflow: 'hidden' }, cardShadow]}>
              <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8 }}>
                {[{ label: t('Eastbound', 'Est'), sub: '→ Blair', active: showEast, onPress: () => { setShowEast(!showEast); setShowWest(false); } }, { label: t('Westbound', 'Ouest'), sub: "→ Tunney's", active: showWest, onPress: () => { setShowWest(!showWest); setShowEast(false); } }].map((dir, i) => (
                  <TouchableOpacity key={i} style={{ flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: dir.active ? colours.lrt + '15' : colours.bg, borderColor: dir.active ? colours.lrt : colours.border }} onPress={dir.onPress}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: dir.active ? colours.lrt : colours.text }}>{dir.label}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{dir.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showEast && LRT_EAST.map((station, index) => (<TouchableOpacity key={station.id} style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt + '12' }]} onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine1(false); setShowEast(false); }} activeOpacity={0.7}><View style={styles.stationDotCol}><View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />{index < LRT_EAST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}</View><Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>{station.name}</Text><Ionicons name="chevron-forward" size={14} color={colours.muted} /></TouchableOpacity>))}
              {showWest && LRT_WEST.map((station, index) => (<TouchableOpacity key={station.id} style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt + '12' }]} onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine1(false); setShowWest(false); }} activeOpacity={0.7}><View style={styles.stationDotCol}><View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />{index < LRT_WEST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}</View><Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>{station.name}</Text><Ionicons name="chevron-forward" size={14} color={colours.muted} /></TouchableOpacity>))}
            </View>
          )}
          <TouchableOpacity style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: showLine2 ? 0 : 12, borderWidth: 1, borderRadius: 14, borderBottomLeftRadius: showLine2 ? 0 : 14, borderBottomRightRadius: showLine2 ? 0 : 14, padding: 12, backgroundColor: showLine2 ? '#7b5ea7' + '12' : colours.surface, borderColor: showLine2 ? '#7b5ea7' : colours.border }, cardShadow]} onPress={() => { setShowLine2(!showLine2); setShowLine1(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '900', color: '#7b5ea7' }}>L2</Text></View>
              <View><Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine2 ? '#7b5ea7' : colours.text }}>{t('Trillium Line', 'Ligne Trillium')}</Text><Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t('Bayview ↔ Limebank', 'Bayview ↔ Limebank')}</Text></View>
            </View>
            <Ionicons name={showLine2 ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
          </TouchableOpacity>
          {showLine2 && (
            <View style={[{ marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: colours.surface, borderColor: '#7b5ea7', overflow: 'hidden' }, cardShadow]}>
              <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8 }}>
                {[{ label: t('Northbound', 'Nord'), sub: '→ Bayview', active: showNorth, onPress: () => { setShowNorth(!showNorth); setShowSouth(false); } }, { label: t('Southbound', 'Sud'), sub: '→ Limebank', active: showSouth, onPress: () => { setShowSouth(!showSouth); setShowNorth(false); } }].map((dir, i) => (
                  <TouchableOpacity key={i} style={{ flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: dir.active ? '#7b5ea7' + '15' : colours.bg, borderColor: dir.active ? '#7b5ea7' : colours.border }} onPress={dir.onPress}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: dir.active ? '#7b5ea7' : colours.text }}>{dir.label}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{dir.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {showNorth && LRT2_NORTH.map((station, index) => (<TouchableOpacity key={`n${index}`} style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]} onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine2(false); setShowNorth(false); }} activeOpacity={0.7}><View style={styles.stationDotCol}><View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />{index < LRT2_NORTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}</View><Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>{station.name}</Text><Ionicons name="chevron-forward" size={14} color={colours.muted} /></TouchableOpacity>))}
              {showSouth && LRT2_SOUTH.map((station, index) => (<TouchableOpacity key={`s${index}`} style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]} onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine2(false); setShowSouth(false); }} activeOpacity={0.7}><View style={styles.stationDotCol}><View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />{index < LRT2_SOUTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}</View><Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>{station.name}</Text><Ionicons name="chevron-forward" size={14} color={colours.muted} /></TouchableOpacity>))}
            </View>
          )}
        </>)}</React.Fragment>
      );

      case 'saved': return savedPlaces.length === 0 ? null : (
        <React.Fragment key="saved">{wrapSection('saved', <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Saved Places', 'Lieux sauvegardés')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Long press to remove', 'Appui long pour retirer')}</Text>
          </View>
          <FlatList horizontal data={savedPlaces} keyExtractor={p => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 10, paddingBottom: 4 }} style={{ marginBottom: 20 }} snapToInterval={170} decelerationRate="fast" renderItem={({ item: place }) => (<SavedPlaceCard place={place} colours={colours} fonts={fonts} language={language} t={t} onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(`${place.name} ${place.vicinity}`)}`)} onLongPress={() => Alert.alert(t('Remove?', 'Retirer?'), place.name, [{ text: t('Cancel', 'Annuler'), style: 'cancel' }, { text: t('Remove', 'Retirer'), style: 'destructive', onPress: () => removeSavedPlace(place.id) }])} cardShadow={cardShadow} />)} />
        </>)}</React.Fragment>
      );

      case 'services': return (
          <React.Fragment key="services">{wrapSection('services', <>
            <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm }]}>{t('Ottawa Services', 'Services Ottawa')}</Text>
            <ServicesGrid colours={colours} fonts={fonts} t={t} language={language} activeTab={activeServicesTab} onTabChange={setActiveServicesTab} onTileTap={handleServiceTile} cardShadow={cardShadow} />
          </>)}</React.Fragment>
        );

      case 'alerts': return (
        <React.Fragment key="alerts">{wrapSection('alerts', <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 }}>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, letterSpacing: 1, textTransform: 'uppercase' }}>{t('Service Alerts', 'Alertes')}</Text>
            <TouchableOpacity onPress={() => { const item: SavedBoardItem = { type: 'service_alert' }; isBoardSaved(item) ? removeFromBoard(item) : addToBoardIfMissing(item); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Save alerts to board', 'Sauvegarder les alertes au tableau')} accessibilityState={{ selected: isBoardSaved({ type: 'service_alert' }) }}>
              <Ionicons name={isBoardSaved({ type: 'service_alert' }) ? 'bookmark' : 'bookmark-outline'} size={18} color={isBoardSaved({ type: 'service_alert' }) ? colours.accent : colours.muted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.notifBar, { backgroundColor: hasAlerts ? alertDotColour() + '12' : colours.surface, borderColor: hasAlerts ? alertDotColour() : colours.border, ...cardShadow }]} onPress={() => setAlertsModalVisible(true)} accessibilityRole="button" accessibilityLabel={t('View service alerts', 'Voir les alertes de service')}>
            <View style={styles.notifLeft}>
              {alertsLoading ? <ActivityIndicator size="small" color={colours.muted} style={{ marginRight: 8 }} /> : <View style={[styles.notifDot, { backgroundColor: alertDotColour() }]} />}
              <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '500', flex: 1 }} numberOfLines={1}>{alertBarText()}</Text>
            </View>
            <Text style={{ color: hasAlerts ? alertDotColour() : colours.accent, fontSize: fonts.sm, fontWeight: '600', marginLeft: 8 }}>{t('View all →', 'Voir tout →')}</Text>
          </TouchableOpacity>
        </>)}</React.Fragment>
      );

      // 'map' case removed — Live Map is accessible via the dedicated tab

      // 'news' case removed — news lives in Account tab modal

      // 'discover' case removed — neighbourhoods live in dedicated Discover tab

      default: return null;
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colours.bg }]}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        {alertsModalVisible && renderAlertsModal()}
        {weatherModalVisible && <WeatherModal visible={weatherModalVisible} onClose={() => setWeatherModalVisible(false)} colours={colours} fonts={fonts} t={t} weather={weather} forecast={forecast} dailyForecast={dailyForecast} locationName={locationName} />}
        {garbageModalVisible && renderGarbageModal()}
        {swapSheetVisible && renderSwapSheet()}
        {!!expandedStopId && renderExpandedArrivals()}
        {showReportModal && renderStopReportModal()}

        {/* Full Schedule Modal */}
        {!!scheduleRoute && <Modal visible={!!scheduleRoute} animationType="slide" transparent onRequestClose={() => setScheduleRoute(null)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>
                    {t('Route', 'Route')} {scheduleRoute?.routeId} — {t('Full Schedule', 'Horaire complet')}
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

        {!!boardExpandItem && renderBoardExpandModal()}
        {socialModal && renderSocialModal()}
        {eventsModal && renderEventsModal()}
        {roadEventsModal && renderRoadEventsModal()}
        {parksModal && renderParksModal()}
        {bikeShareModal && renderBikeShareModal()}
        {(campusPicker || campusModal) && renderCampusModal()}

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
          <View style={styles.header}>
            <View>
              <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>Route<Text style={{ color: colours.accent }}>O</Text></Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>OTTAWA & GATINEAU TRANSIT</Text>
            </View>
            <View style={styles.headerRight}>
              {isNight && (<View style={[styles.nightBadge, { backgroundColor: colours.accentAlt + '22', borderColor: colours.accentAlt }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="moon" size={12} color={colours.accentAlt} /><Text style={{ color: colours.accentAlt, fontSize: 12, fontWeight: '700' }}>{t('Night', 'Nuit')}</Text></View></View>)}
              {weather && (<TouchableOpacity onPress={() => setWeatherModalVisible(true)} style={[styles.nightBadge, { backgroundColor: colours.surface, borderColor: colours.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]} accessibilityRole="button" accessibilityLabel={t(`Weather ${weather.temp} degrees`, `Meteo ${weather.temp} degres`)}><Ionicons name={weather.icon as any} size={13} color={iconColor(weather.icon)} /><Text style={{ color: colours.text, fontSize: 12, fontWeight: '700' }}>{weather.temp}°</Text></TouchableOpacity>)}
              <View style={[styles.liveBadge, { backgroundColor: colours.accent + '18', borderColor: colours.accent + '40' }]}><View style={[styles.liveDot, { backgroundColor: colours.accent }]} /><Text style={{ color: colours.accent, fontSize: 12, fontWeight: '700' }}>LIVE</Text></View>
              <TouchableOpacity onPress={() => { if (editMode) { saveCustomization(sectionOrder, quickActionIds, ottawaLifeIds); } setEditMode(!editMode); }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: editMode ? colours.accent : colours.border, backgroundColor: editMode ? colours.accent : colours.surface }} accessibilityRole="button" accessibilityLabel={editMode ? t('Done editing', 'Terminer la modification') : t('Edit layout', 'Modifier la disposition')}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: editMode ? 'white' : colours.text }}>{editMode ? t('Done', 'Terminé') : t('Edit', 'Modifier')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Offline / connection error banner */}
          {weatherFetchFailed && arrivalsFetchFailed && (
            <TouchableOpacity
              onPress={() => { fetchWeather(); fetchArrivals(stopId); }}
              style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: '#cc3b2a' + '18', borderWidth: 1, borderColor: '#cc3b2a' + '40', flexDirection: 'row', alignItems: 'center', gap: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('Retry connection', 'Reessayer la connexion')}
            >
              <Ionicons name="cloud-offline-outline" size={20} color="#cc3b2a" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: '#cc3b2a' }}>{t('No internet connection', 'Aucune connexion Internet')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Tap to retry', 'Appuyez pour reessayer')}</Text>
              </View>
              <Ionicons name="refresh" size={18} color="#cc3b2a" />
            </TouchableOpacity>
          )}

          {editMode && (<View style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '40', flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="reorder-three" size={18} color={colours.accent} /><Text style={{ flex: 1, fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>{t('Use ↑↓ arrows to reorder sections. Long press Ottawa Life tiles to swap.', 'Utilisez les flèches ↑↓ pour réorganiser. Appui long sur les tuiles pour changer.')}</Text></View>)}

          {/* Search */}
          <View style={[styles.searchContainer, (searchResults.length > 0 || addressResults.length > 0) ? { zIndex: 100 } : { zIndex: 0 }]}>
            <View style={styles.searchRow}>
              <TextInput style={[styles.searchInput, { backgroundColor: colours.surface, borderColor: colours.border, color: colours.text, fontSize: fonts.lg, ...cardShadow }]} placeholder={t('Street name or stop number...', "Nom de rue ou numéro d'arrêt...")} placeholderTextColor={colours.muted} value={searchText} onChangeText={handleSearchChange} keyboardType="default" returnKeyType="search" onSubmitEditing={handleSearch} accessibilityLabel={t('Search for a stop or street', 'Rechercher un arret ou une rue')} accessibilityRole="search" />
              <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colours.accent }]} onPress={handleSearch} accessibilityRole="button" accessibilityLabel={t('Search', 'Rechercher')}>
                <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Go', 'Aller')}</Text>
              </TouchableOpacity>
            </View>
            {(searchResults.length > 0 || addressResults.length > 0) && (
              <View style={[styles.dropdown, { backgroundColor: colours.surface, borderColor: colours.border, ...cardShadow }]}>
                {searchResults.map(result => { const resultIsSTO = isStoStop(result.id); return (<TouchableOpacity key={result.internalId} style={[styles.dropdownItem, { borderBottomColor: colours.border }]} onPress={() => { Keyboard.dismiss(); loadStop(result.id, result.name); setExpandedStopId(result.id); setSearchText(''); setSearchResults([]); setAddressResults([]); if (resultIsSTO) { addToBoardIfMissing({ type: 'bus_stop', id: result.id, name: result.name, agency: 'STO' }); } }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>{resultIsSTO && <View style={{ backgroundColor: '#0072bc', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: '800', color: 'white' }}>STO</Text></View>}<Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '600', flex: 1 }} numberOfLines={1}>{result.name}  <Text style={{ color: colours.muted, fontSize: fonts.sm }}>·  #{result.id}</Text></Text></View></TouchableOpacity>); })}
                {searchResults.length === 0 && addressResults.map((addr, i) => (<TouchableOpacity key={`addr-${i}`} style={[styles.dropdownItem, { borderBottomColor: colours.border }]} onPress={() => { Keyboard.dismiss(); setSearchText(''); setSearchResults([]); setAddressResults([]); router.push({ pathname: '/(tabs)/planner', params: { toLabel: addr.label, toLat: String(addr.lat), toLng: String(addr.lng) } } as any); }}><Text style={{ color: colours.text, fontSize: fonts.md, flex: 1 }} numberOfLines={1}>{addr.label}</Text><Text style={{ color: colours.accent, fontSize: fonts.sm, marginLeft: 8 }}>→ Plan</Text></TouchableOpacity>))}
              </View>
            )}
          </View>

          {/* Frequent Rider Card */}
          {frequentRoutes.length > 0 && !frequentCardDismissed && (
            <View style={{ marginHorizontal: 20, marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: colours.accent + '30', backgroundColor: colours.surface, overflow: 'hidden', ...cardShadow }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flash" size={16} color={colours.accent} />
                  <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text }}>{t('Your Routes', 'Vos lignes')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setFrequentCardDismissed(true); AsyncStorage.setItem(SK_FREQUENT_CARD_DISMISSED, String(Date.now())); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={colours.muted} />
                </TouchableOpacity>
              </View>
              {frequentRoutes.map((route, i) => {
                const key = route.routeId || route.stopId;
                const arrival = frequentArrivals[key];
                const hasAlert = route.routeId ? alerts.some(a => a.routes?.includes(route.routeId)) : false;
                const isLate = arrival && arrival.delay > 0;
                return (
                  <TouchableOpacity
                    key={`freq-${i}`}
                    onPress={() => { if (route.stopId) { loadStop(route.stopId, route.stopName); setExpandedStopId(route.stopId); } }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < frequentRoutes.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
                    activeOpacity={0.7}
                  >
                    <View style={{ backgroundColor: '#CE1126', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 36, alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>{route.routeId || '#'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                        {arrival?.headsign || route.stopName || (route.routeId ? `${t('Route', 'Ligne')} ${route.routeId}` : t('Stop', 'Arret'))}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        {hasAlert ? (
                          <><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' }} /><Text style={{ fontSize: fonts.sm, color: '#FF3B30', fontWeight: '600' }}>{t('Service alert', 'Alerte de service')}</Text></>
                        ) : isLate ? (
                          <><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9500' }} /><Text style={{ fontSize: fonts.sm, color: '#FF9500', fontWeight: '600' }}>{t(`Running ${arrival.delay}m late`, `${arrival.delay}m de retard`)}</Text></>
                        ) : arrival ? (
                          <><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' }} /><Text style={{ fontSize: fonts.sm, color: '#34C759', fontWeight: '600' }}>{t('On time', 'À l\'heure')}</Text></>
                        ) : (
                          <Text style={{ fontSize: fonts.sm, color: colours.muted }}>#{route.stopId}</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', minWidth: 40 }}>
                      {arrival ? (
                        <>
                          <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: arrival.minsAway <= 2 ? '#FF3B30' : colours.accent }}>
                            {arrival.minsAway === 0 ? t('Due', 'Imminent') : `${arrival.minsAway}m`}
                          </Text>
                          <Text style={{ fontSize: 10, color: colours.muted }}>{t('next', 'prochain')}</Text>
                        </>
                      ) : (
                        <ActivityIndicator size="small" color={colours.accent} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Universal Saved Board */}
          {!boardLoaded ? (
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16 }}>
              {[0, 1, 2].map(i => (
                <View key={`skel-${i}`} style={{ width: 140, height: 100, borderRadius: 14, backgroundColor: colours.border, marginRight: 10, opacity: 0.5 }} />
              ))}
            </View>
          ) : savedBoard.length === 0 ? (
            <>
            <View style={[styles.arrivalsCard, { borderColor: colours.border, backgroundColor: colours.surface, ...cardShadow }]}>
              <View style={[styles.boardHeader, { borderBottomColor: colours.border, borderBottomWidth: 1 }]}>
                <TouchableOpacity onPress={() => setExpandedStopId(stopId)} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{stopName}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colours.accent} />
                  </View>
                  {lastUpdated ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Updated', 'Mis à jour')} {lastUpdated} · {t('Tap to expand', 'Appuyez pour élargir')}</Text> : null}
                  {stopAmenities && (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      {stopAmenities.has_shelter && <View style={{ backgroundColor: '#00A78D' + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="umbrella" size={10} color="#00A78D" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#00A78D' }}>{t('Shelter', 'Abribus')}</Text></View>}
                      {stopAmenities.has_bench && <View style={{ backgroundColor: '#00A78D' + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="bed" size={10} color="#00A78D" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#00A78D' }}>{t('Bench', 'Banc')}</Text></View>}
                      {stopAmenities.has_bin && <View style={{ backgroundColor: '#00A78D' + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="trash" size={10} color="#00A78D" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#00A78D' }}>{t('Bin', 'Poubelle')}</Text></View>}
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.boardActions}>
                  <TouchableOpacity style={[styles.addFavBtn, { borderColor: isFav ? colours.accent : colours.border, backgroundColor: isFav ? colours.accent + '15' : colours.surface }]} onPress={() => isFav ? removeFav(stopId) : addFav(stopId, stopName)}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: isFav ? colours.accent : colours.muted }}>{isFav ? t('✓ Saved', '✓ Sauvegardé') : t('+ Save', '+ Sauvegarder')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => fetchArrivals(stopId)}>
                    <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>{t('Refresh ↺', 'Actualiser ↺')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {loading ? (<View style={{ paddingVertical: 8 }}>{[0,1,2].map(i => <ArrivalRowSkeleton key={i} colours={colours} />)}</View>) : error ? (<View style={styles.centerState}><Ionicons name="wifi-outline" size={36} color={colours.muted} /><Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text><TouchableOpacity style={[styles.retryBtn, { backgroundColor: colours.accent }]} onPress={() => fetchArrivals(stopId)}><Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.sm }}>{t('Retry', 'Réessayer')}</Text></TouchableOpacity></View>) : arrivals.length === 0 ? (<View style={styles.centerState}><Ionicons name="time-outline" size={36} color={colours.muted} /><Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 8 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text></View>) : (<>{cachedAt && (<View style={{ backgroundColor: '#ff9500' + '15', borderLeftWidth: 3, borderLeftColor: '#ff9500', paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 0 }}><Text style={{ fontSize: fonts.sm, color: '#ff9500', fontWeight: '600' }}>{t(`Offline — last updated ${Math.round((Date.now() - cachedAt) / 60000)} min ago`, `Hors ligne — dernière mise à jour il y a ${Math.round((Date.now() - cachedAt) / 60000)} min`)}</Text></View>)}{arrivals.slice(0, 4).map(renderArrival)}{arrivals.length > 4 && (<TouchableOpacity onPress={() => setShowAllArrivals(v => !v)} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colours.border }}><Text style={{ color: colours.accent, fontWeight: '700', fontSize: fonts.sm }}>{showAllArrivals ? t('Show less ▲', 'Voir moins ▲') : t(`Show ${arrivals.length - 4} more ▼`, `Voir ${arrivals.length - 4} de plus ▼`)}</Text></TouchableOpacity>)}</>)}
            </View>
            {nearbyAlternative && (
              <TouchableOpacity
                onPress={() => loadStop(nearbyAlternative.stopId, nearbyAlternative.stopName)}
                style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: colours.accent + '10', borderRadius: 14, borderWidth: 1, borderColor: colours.accent + '30', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons name="walk" size={20} color={colours.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>
                    {t('Closer option?', 'Option plus proche?')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.text, marginTop: 2 }}>
                    {t(`Walk ${nearbyAlternative.walkMeters}m to ${nearbyAlternative.stopName}`, `Marcher ${nearbyAlternative.walkMeters}m vers ${nearbyAlternative.stopName}`)}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                    {t(`Route ${nearbyAlternative.routeId} in ${nearbyAlternative.minsAway} min`, `Route ${nearbyAlternative.routeId} dans ${nearbyAlternative.minsAway} min`)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colours.accent} />
              </TouchableOpacity>
            )}
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 }}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('My Board', 'Mon tableau')}</Text>
                <Ionicons name="reorder-three-outline" size={16} color={colours.muted} />
              </View>
              <FlatList
                horizontal
                data={savedBoard}
                keyExtractor={(item, i) => {
                  if (item.type === 'garbage') return 'garbage';
                  if (item.type === 'service_alert') return 'service_alert';
                  if (item.type === 'gas_prices') return 'gas_prices';
                  if (item.type === 'otrain') return 'otrain';
                  if (item.type === 'services') return 'services';
                  if (item.type === 'discover') return 'discover';
                  if (item.type === 'news') return 'news';
                  if (item.type === 'neighbourhood') return `neighbourhood-${item.id}`;
                  if (item.type === 'campus') return 'campus';
                  if (item.type === 'external_link') return `ext-${item.id}`;
                  return `${item.type}-${(item as any).id}-${i}`;
                }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}
                style={{ marginBottom: 16 }}
                renderItem={({ item, index: idx }) => {
                  const moveBoard = (from: number, to: number) => {
                    setSavedBoard(prev => {
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(next));
                      return next;
                    });
                  };
                  return (
                  <SavedBoardCard
                    item={item}
                    drag={() => {}}
                    isActive={false}
                    colours={colours}
                    fonts={fonts}
                    t={t}
                    cardShadow={cardShadow}
                    garbageEvents={garbageEvents}
                    alerts={alerts}
                    timeFormat={timeFormat}
                    campusData={selectedCampus}
                    onMoveLeft={idx > 0 ? () => moveBoard(idx, idx - 1) : undefined}
                    onMoveRight={idx < savedBoard.length - 1 ? () => moveBoard(idx, idx + 1) : undefined}
                    onPress={() => {
                      if (item.type === 'service_alert') { setAlertsModalVisible(true); return; }
                      if (item.type === 'external_link') { Linking.openURL(item.url).catch(() => {}); return; }
                      if (item.type === 'garbage') { setGarbageModalVisible(true); return; }
                      if (item.type === 'bus_stop' || item.type === 'lrt_station') {
                        loadStop(item.id, item.name);
                        setBoardExpandItem(item);
                      }
                      if (item.type === 'gas_prices') { setBoardExpandItem(item); }
                      if (item.type === 'campus') { if (!selectedCampus) setCampusPicker(true); else setCampusModal(true); return; }
                      if (item.type === 'news') { /* scroll handled by section visibility */ }
                      if (item.type === 'neighbourhood') {
                        router.push('/(tabs)/discover' as any);
                        return;
                      }
                      if (item.type === 'otrain' || item.type === 'services') { /* scroll handled by section visibility */ }
                    }}
                  />
                  );
                }}
              />
            </>
          )}

          <TonightCard
            colours={colours}
            fonts={fonts}
            cardShadow={cardShadow}
            sensGame={sensGame}
            events={events as any}
            weather={weather}
            onPressEvents={() => { setEventsSource('ticketmaster'); fetchTicketmasterEvents(); setEventsModal(true); }}
            onPressDeals={() => setSocialModal(true)}
          />

          {/* Weather-aware transit banner */}
          {weather && !weatherBannerDismissed && (weather.temp <= -20 || (forecast.length > 0 && forecast.slice(0, 3).some(h => h.precip > 70))) && (
            <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: '#004890' + '15', borderWidth: 1, borderColor: '#004890' + '40', borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', ...cardShadow }}>
              <Ionicons name={weather.temp <= -20 ? 'snow' : 'rainy'} size={20} color="#004890" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#004890' }}>
                  {weather.temp <= -20
                    ? t('Extreme cold warning', 'Avertissement de froid extreme')
                    : t('Heavy precipitation expected', 'Fortes precipitations prevues')}
                </Text>
                <Text style={{ fontSize: 12, color: colours.text, marginTop: 4, lineHeight: 17 }}>
                  {t(
                    'Expect delays — consider LRT + underground transfers.',
                    'Prevoyez des retards — pensez au TLR et aux correspondances souterraines.'
                  )}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setWeatherBannerDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={colours.muted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Commute insights card */}
          {commuteInsight && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(tabs)/planner', params: { toLabel: commuteInsight.toLabel } } as any)}
              activeOpacity={0.85}
              style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 14, padding: 14, ...cardShadow }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="analytics" size={16} color={colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('Your Commute', 'Votre trajet')}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                {commuteInsight.fromLabel.replace(/, Ottawa, ON,? ?Canada?/gi, '').replace(/, Ottawa, ON/gi, '').substring(0, 28).trim()}{commuteInsight.fromLabel.replace(/, Ottawa, ON,? ?Canada?/gi, '').replace(/, Ottawa, ON/gi, '').length > 28 ? '...' : ''} → {commuteInsight.toLabel.replace(/, Ottawa, ON,? ?Canada?/gi, '').replace(/, Ottawa, ON/gi, '').substring(0, 28).trim()}{commuteInsight.toLabel.replace(/, Ottawa, ON,? ?Canada?/gi, '').replace(/, Ottawa, ON/gi, '').length > 28 ? '...' : ''}
              </Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 4 }}>
                {t(`Usually ${commuteInsight.avgDuration} min`, `Habituellement ${commuteInsight.avgDuration} min`)}
                {' · '}{commuteInsight.count} {t('trips', 'trajets')}
              </Text>
              {commuteInsight.affectedAlert && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#cc3b2a' + '12', borderRadius: 8, padding: 8 }}>
                  <Ionicons name="warning" size={14} color="#cc3b2a" />
                  <Text style={{ fontSize: 11, color: '#cc3b2a', fontWeight: '600', flex: 1 }} numberOfLines={2}>
                    {commuteInsight.affectedAlert}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {sectionOrder.map(renderSection)}

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