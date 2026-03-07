import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  ActivityIndicator, Alert, FlatList, ImageBackground, Keyboard,
  KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
type SavedPlace = { id: string; name: string; vicinity: string; rating?: number; photoRef?: string; categoryIcon: string; categoryColor: string; categoryLabel_en: string; categoryLabel_fr: string };
import stopMap from './stopmap.json';
import stopNameMap from './stopnamemap.json';
import stopsearch from './stopsearch.json';
import tripMap from './tripmap.json';

const API_KEY = 'e85c07c79cfc45f1b429ce62dcfbab30';
const UNSPLASH_KEY = 'af-d0y-v_SK3tSea1xQYM3059juIQERP5wnRQ5gul9w';
const TRIP_UPDATES = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';
const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const ALERTS_URL = 'https://routeo-backend.vercel.app/api/alerts';
const PLACES_API_KEY = 'AIzaSyCKwAVVCbxHKsKViJ4Dq0ZQ5r6k-arue3E';

const LRT_STOP_IDS = new Set([
  // Alpha IDs
  'NA998','NA999','NA995','NA990','NA996','NA997',
  'CJ995','CJ990','CA995','CA990','CB995','CB990',
  'CD995','CD999','CD998','CD990','CE995','CE990',
  'AF995','AF990','AE995','AE990','EB995','EB990',
  'EC995','EC990','EE995','EE990',
  'RR990','RR991','RE994','RE995','RE990','RE991',
  'RE992','RE996','RE997','RF990','RF995','RF996',
  'RC990','RA990','CG995','CG990','NB990','NB995','NB996',
  // Numeric IDs (saved via search/stopmap)
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
const DEFAULT_SECTION_ORDER = ['otrain', 'saved', 'services', 'alerts', 'map', 'discover'];

// ── Ottawa Services Tabs (Alipay-style) ─────────────────────────
type ServiceTile = { id: string; label_en: string; label_fr: string; icon: string; accent: string; action: 'navigate' | 'link' | 'alert'; target?: string };
type ServicesTab = { id: string; label_en: string; label_fr: string; icon: string; tiles: ServiceTile[] };

const SERVICES_TABS: ServicesTab[] = [
  {
    id: 'transit', label_en: 'Transit', label_fr: 'Transit', icon: 'bus',
    tiles: [
      { id: 'live_map',    label_en: 'Live Map',     label_fr: 'Carte live',    icon: 'map',              accent: '#00A78D', action: 'navigate', target: '/(tabs)/map' },
      { id: 'trip_plan',   label_en: 'Trip Planner', label_fr: 'Planificateur', icon: 'navigate',         accent: '#004890', action: 'navigate', target: '/(tabs)/planner' },
      { id: 'svc_alerts',  label_en: 'Alerts',       label_fr: 'Alertes',       icon: 'notifications',    accent: '#e8a020', action: 'alert',    target: 'alerts' },
      { id: 'bikeshare',   label_en: 'Bike Share',   label_fr: 'Vélos',         icon: 'bicycle',          accent: '#00A78D', action: 'link',     target: 'https://capitalbikeShare.com' },
      { id: 'parkride',    label_en: 'Park & Ride',  label_fr: 'Parc-o-Bus',    icon: 'car',              accent: '#6b7f99', action: 'link',     target: 'https://www.octranspo.com/en/park-and-ride' },
      { id: 'paybyphone',  label_en: 'PayByPhone',   label_fr: 'PayByPhone',    icon: 'phone-portrait',   accent: '#004890', action: 'link',     target: 'https://www.paybyphone.com' },
      { id: 'uber',        label_en: 'Uber',         label_fr: 'Uber',          icon: 'car-sport',        accent: '#6b7f99', action: 'link',     target: 'uber://' },
      { id: 'roads',       label_en: 'Road Alerts',  label_fr: 'Routes',        icon: 'warning',          accent: '#e8a020', action: 'link',     target: 'https://traffic.ottawa.ca' },
    ],
  },
  {
    id: 'food', label_en: 'Food', label_fr: 'Bouffe', icon: 'restaurant',
    tiles: [
      { id: 'eats_nearby', label_en: 'Nearby Eats',  label_fr: 'Restos près',   icon: 'restaurant',       accent: '#cc3b2a', action: 'navigate', target: '/(tabs)/nearby?category=restaurant' },
      { id: 'coffee',      label_en: 'Coffee',       label_fr: 'Café',          icon: 'cafe',             accent: '#c0852a', action: 'navigate', target: '/(tabs)/nearby?category=cafe' },
      { id: 'skip',        label_en: 'Skip',         label_fr: 'Skip',          icon: 'bicycle',          accent: '#ff6a00', action: 'link',     target: 'skipthedishes://' },
      { id: 'ubereats',    label_en: 'Uber Eats',    label_fr: 'Uber Eats',     icon: 'fast-food',        accent: '#06C167', action: 'link',     target: 'ubereats://' },
      { id: 'doordash',    label_en: 'DoorDash',     label_fr: 'DoorDash',      icon: 'bag-handle',       accent: '#FF3008', action: 'link',     target: 'doordash://' },
      { id: 'grocery',     label_en: 'Grocery',      label_fr: 'Épicerie',      icon: 'cart',             accent: '#004890', action: 'navigate', target: '/(tabs)/nearby?category=supermarket' },
      { id: 'lcbo',        label_en: 'LCBO Hours',   label_fr: 'LCBO',          icon: 'wine',             accent: '#7b5ea7', action: 'link',     target: 'https://www.lcbo.com/en/stores' },
      { id: 'byward',      label_en: 'ByWard Mkt',   label_fr: 'Marché ByWard', icon: 'storefront',       accent: '#c0852a', action: 'link',     target: 'https://byward-market.com' },
    ],
  },
  {
    id: 'city', label_en: 'City', label_fr: 'Ville', icon: 'business',
    tiles: [
      { id: '311',         label_en: '311 Report',   label_fr: 'Signaler 311',  icon: 'megaphone',        accent: '#cc3b2a', action: 'link',     target: 'https://ottawa.ca/en/311' },
      { id: 'garbage',     label_en: 'Garbage Day',  label_fr: 'Collecte',      icon: 'trash',            accent: '#6b7f99', action: 'alert',    target: 'garbage' },
      { id: 'hydro',       label_en: 'Hydro Ottawa', label_fr: 'Hydro Ottawa',  icon: 'flash',            accent: '#e8a020', action: 'link',     target: 'https://hydroottawa.com/en/outages' },
      { id: 'parking_tkt', label_en: 'Pay Ticket',   label_fr: 'Payer contrav.', icon: 'card',            accent: '#cc3b2a', action: 'link',     target: 'https://www.ottawapolice.ca/en/traffic-and-roads/paying-a-parking-ticket.aspx' },
      { id: 'library',     label_en: 'OPL Library',  label_fr: 'Bib. Ottawa',   icon: 'book',             accent: '#004890', action: 'link',     target: 'https://biblioottawalibrary.ca' },
      { id: 'walkin',      label_en: 'Walk-In Clinic',label_fr: 'Clinique',     icon: 'medical',          accent: '#00A78D', action: 'link',     target: 'https://www.ontario.ca/page/find-clinic' },
      { id: 'gas',         label_en: 'Gas Prices',   label_fr: 'Prix essence',  icon: 'speedometer',      accent: '#6b7f99', action: 'link',     target: 'https://www.gasbuddy.com/gas-prices/Canada/Ontario/Ottawa' },
      { id: 'cityhall',    label_en: 'City Hall',    label_fr: 'Hôtel de ville', icon: 'globe',           accent: '#004890', action: 'link',     target: 'https://ottawa.ca' },
    ],
  },
  {
    id: 'entertainment', label_en: 'Fun', label_fr: 'Divertis.', icon: 'sparkles',
    tiles: [
      { id: 'senators',    label_en: 'Senators',     label_fr: 'Sénateurs',     icon: 'trophy',           accent: '#c8102e', action: 'link',     target: 'https://www.nhl.com/senators' },
      { id: 'redblacks',   label_en: 'REDBLACKS',    label_fr: 'REDBLACKS',     icon: 'american-football',accent: '#cc3b2a', action: 'link',     target: 'https://www.ottawaredblacks.com' },
      { id: 'sixtysevent', label_en: "67's",         label_fr: "67's",          icon: 'ice-cream',        accent: '#004890', action: 'link',     target: 'https://ottawa67s.com' },
      { id: 'lansdowne',   label_en: 'Lansdowne',    label_fr: 'Lansdowne',     icon: 'storefront',       accent: '#7b5ea7', action: 'link',     target: 'https://lansdowne.ca' },
      { id: 'nac',         label_en: 'NAC',          label_fr: 'CNA',           icon: 'musical-notes',    accent: '#c0852a', action: 'link',     target: 'https://nac-cna.ca' },
      { id: 'bluesfest',   label_en: 'Bluesfest',    label_fr: 'Bluesfest',     icon: 'mic',              accent: '#004890', action: 'link',     target: 'https://ottawabluesfest.ca' },
      { id: 'cineplex',    label_en: 'Cineplex',     label_fr: 'Cineplex',      icon: 'film',             accent: '#cc3b2a', action: 'link',     target: 'https://www.cineplex.com' },
      { id: 'casino',      label_en: 'Casino',       label_fr: 'Casino',        icon: 'diamond',          accent: '#e8a020', action: 'link',     target: 'https://www.casinodulacleatimygatineau.com' },
    ],
  },
];

const DISCOVER_CARDS = [
  { id: '1', title_en: 'Parliament Hill', title_fr: 'Colline du Parlement', category_en: 'Landmark', category_fr: 'Monument', query: 'parliament hill ottawa peace tower', accent: '#00A78D' },
  { id: '2', title_en: 'ByWard Market', title_fr: 'Marché ByWard', category_en: 'Local Favourite', category_fr: 'Favori local', query: '', photoUrl: 'https://images.unsplash.com/photo-1683917276588-7b6d28d43ee3?w=600', accent: '#c0852a' },
  { id: '3', title_en: 'Rideau Canal', title_fr: 'Canal Rideau', category_en: 'Outdoors', category_fr: 'Plein air', query: 'rideau canal ottawa', accent: '#004890' },
  { id: '4', title_en: 'Lansdowne Park', title_fr: 'Parc Lansdowne', category_en: 'Events', category_fr: 'Événements', query: 'TD Place Lansdowne Ottawa stadium', accent: '#7b5ea7' },
  { id: '5', title_en: "Major's Hill Park", title_fr: "Parc Major's Hill", category_en: 'Outdoors', category_fr: 'Plein air', query: 'majors hill park ottawa', accent: '#00A78D' },
];

const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

type ServiceAlert = { id: number; title: string; description: string; link: string; pubDate: string; routes: string[]; category: string };
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

// ── Saved Stop Card ──────────────────────────────────────────────
function SavedStopCard({ fav, isActive, colours, fonts, t, onPress, onLongPress, cardShadow }: any) {
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const isLRT = LRT_STOP_IDS.has(fav.id);
        if (isLRT) {
          const resp = await fetch(`${BACKEND_URL}?stop=${fav.id}`);
          const data = await resp.json();
          if (!cancelled) setPreview((data.arrivals || []).slice(0, 2).map((a: any) => ({ routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway })));
        } else {
          const resp = await fetch(TRIP_UPDATES, { headers: { 'Ocp-Apim-Subscription-Key': API_KEY } });
          const data = await resp.json();
          const now = Math.floor(Date.now() / 1000);
          const results: any[] = [];
          for (const ent of (data?.Entity || [])) {
            const tu = ent.TripUpdate;
            if (!tu) continue;
            for (const stu of (tu.StopTimeUpdate || [])) {
              const stopIdsToMatch = MULTI_PLATFORM_STOPS[fav.id] || [fav.id];
              if (!stopIdsToMatch.includes(String(stu.StopId))) continue;
              const arr = stu.Arrival || stu.Departure || {};
              const t2 = parseInt(arr.Time || 0);
              if (!t2) continue;
              const secsAway = t2 - now;
              if (secsAway < -60 || secsAway > 5400) continue;
              const trip = tu.Trip || {};
              results.push({ routeId: trip.RouteId || '?', headsign: getHeadsign(String(trip.TripId || '')), minsAway: Math.max(0, Math.round(secsAway / 60)) });
            }
          }
          if (!cancelled) setPreview(results.sort((a, b) => a.minsAway - b.minsAway).slice(0, 2));
        }
      } catch { if (!cancelled) setPreview([]); }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [fav.id]);

  return (
    <TouchableOpacity
      style={[{ width: 160, height: 160, borderRadius: 16, padding: 14, backgroundColor: isActive ? colours.accent : colours.surface, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, justifyContent: 'space-between' }, cardShadow]}
      onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bus" size={12} color={isActive ? 'white' : colours.accent} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? 'rgba(255,255,255,0.7)' : colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Stop', 'Arrêt')}</Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: isActive ? 'white' : colours.text, lineHeight: 18 }} numberOfLines={2}>{fav.name}</Text>
      <View style={{ gap: 5 }}>
        {previewLoading ? (
          <ActivityIndicator size="small" color={isActive ? 'rgba(255,255,255,0.6)' : colours.accent} />
        ) : preview.length === 0 ? (
          <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.5)' : colours.muted }}>{t('No arrivals', 'Aucune arrivée')}</Text>
        ) : (
          preview.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : colours.accent + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 28, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: isActive ? 'white' : colours.accent }}>{a.routeId.split('-')[0]}</Text>
              </View>
              <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign ? `→ ${a.headsign}` : ''}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isActive ? 'white' : (a.minsAway <= 2 ? colours.red : colours.accent) }}>{a.minsAway === 0 ? t('Now', 'Maint.') : `${a.minsAway}m`}</Text>
            </View>
          ))
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Saved Place Card ─────────────────────────────────────────────
function SavedPlaceCard({ place, colours, fonts, language, t, onPress, onLongPress, cardShadow }: any) {
  const photoUrl = place.photoRef ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photoRef}&key=${PLACES_API_KEY}` : null;
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

// ── Garbage bin info (outside component to avoid recreation) ──────
const BIN_INFO: Record<string, { dot: string; color: string; label: string; accepts: string[]; rejects: string[] }> = {
  'garbage':         { dot: '●', color: '#666',    label: 'Garbage',           accepts: ['Food-soiled paper','Non-recyclable plastics','Styrofoam','Broken glass','Diapers'], rejects: ['Recyclables','Hazardous waste','Electronics'] },
  'recycling-blue':  { dot: '●', color: '#1a6fbf', label: 'Blue Bin',          accepts: ['Paper & cardboard','Newspapers','Flyers','Milk cartons','Paper bags'], rejects: ['Plastic bags','Food waste','Styrofoam'] },
  'recycling-black': { dot: '●', color: '#222',    label: 'Black Bin',         accepts: ['Plastic bottles & jugs','Glass bottles & jars','Metal cans','Aluminum foil','Rigid plastics'], rejects: ['Plastic bags','Styrofoam','Paper'] },
  'green-bin':       { dot: '●', color: '#2d7a3a', label: 'Green Bin',         accepts: ['Food scraps','Soiled paper','Coffee grounds & filters','Eggshells','Small houseplants'], rejects: ['Plastic bags','Pet waste','Liquids'] },
  'yard-waste':      { dot: '●', color: '#8b5a00', label: 'Yard Waste',        accepts: ['Leaves','Grass clippings','Branches (under 1.5m)','Garden plants'], rejects: ['Food waste','Soil','Rocks'] },
};

// ── Main Screen ──────────────────────────────────────────────────
export default function LiveScreen() {
  const { colours, theme, language, t, fonts } = useApp();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_W = screenWidth - 40;
  const [stopId, setStopId] = useState('CD995');
  const [stopName, setStopName] = useState('Rideau');
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllArrivals, setShowAllArrivals] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<StopResult[]>([]);
  const [reports, setReports] = useState<Reports>({});
  const [favs, setFavs] = useState<Fav[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [showLine1, setShowLine1] = useState(false);
  const [showLine2, setShowLine2] = useState(false);
  const [showEast, setShowEast] = useState(false);
  const [showWest, setShowWest] = useState(false);
  const [showNorth, setShowNorth] = useState(false);
  const [showSouth, setShowSouth] = useState(false);
  const [discoverPhotos, setDiscoverPhotos] = useState<{ [id: string]: string }>({});
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsModalVisible, setAlertsModalVisible] = useState(false);

  // ── Customization state ──
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
  const [dailyForecast, setDailyForecast] = useState<{ day: string; high: number; low: number; icon: string; precip: number }[]>([]);
  const [locationName, setLocationName] = useState('Ottawa, Ontario');

  // Garbage Day
  const [garbageModalVisible, setGarbageModalVisible] = useState(false);
  const [garbageAddress, setGarbageAddress] = useState('');
  const [garbageAddressInput, setGarbageAddressInput] = useState('');
  const [garbagePlaceId, setGarbagePlaceId] = useState('');
  const [garbageEvents, setGarbageEvents] = useState<{ date: string; flags: string[] }[]>([]);
  const [garbageLoading, setGarbageLoading] = useState(false);
  const [garbageError, setGarbageError] = useState('');
  const [expandedBin, setExpandedBin] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);

  const isLight = theme === 'light' || (theme === 'system' && colours.bg === '#f0f4f8');
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {};

  // ── Load saved customization ──
  useEffect(() => {
    AsyncStorage.getItem('routeo_favs').then(val => {
      const savedFavs: Fav[] = val ? JSON.parse(val) : [];
      setFavs(savedFavs);
      if (savedFavs.length > 0) { setStopId(savedFavs[0].id); setStopName(savedFavs[0].name); fetchArrivals(savedFavs[0].id); }
      else fetchArrivals('CD995');
    });
    AsyncStorage.getItem('routeo_saved_places').then(val => { if (val) setSavedPlaces(JSON.parse(val)); });
    AsyncStorage.getItem('routeo_ghost_reports').then(val => {
      if (val) {
        const saved: Reports = JSON.parse(val);
        const now = Date.now();
        const valid: Reports = {};
        for (const key of Object.keys(saved)) { if (saved[key].expiresAt > now) valid[key] = saved[key]; }
        setReports(valid);
      }
    });
    AsyncStorage.getItem('routeo_section_order').then(val => {
      if (val) {
        // Migrate: replace old 'quick'/'ottawa' keys with new 'services'
        let saved: string[] = JSON.parse(val);
        saved = saved.filter(s => s !== 'quick' && s !== 'ottawa');
        if (!saved.includes('services')) {
          // Insert 'services' where 'quick' used to be (after 'saved', before 'alerts')
          const insertAt = saved.indexOf('alerts');
          if (insertAt >= 0) saved.splice(insertAt, 0, 'services');
          else saved.push('services');
        }
        setSectionOrder(saved);
        AsyncStorage.setItem('routeo_section_order', JSON.stringify(saved));
      }
    });
    AsyncStorage.removeItem('routeo_quick_actions');
    AsyncStorage.removeItem('routeo_ottawa_life');
    fetchDiscoverPhotos();
    fetchAlerts();
    fetchWeather();
    loadSavedGarbageAddress();
  }, []);

  const saveCustomization = async (order: string[], qaIds: string[], olIds: string[]) => {
    await AsyncStorage.setItem('routeo_section_order', JSON.stringify(order));
    await AsyncStorage.setItem('routeo_quick_actions', JSON.stringify(qaIds));
    await AsyncStorage.setItem('routeo_ottawa_life', JSON.stringify(olIds));
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

  const fetchWeather = async () => {
    try {
      let lat = 45.4215, lng = -75.6972;
      let locLabel = 'Ottawa, Ontario';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (geo[0]) {
            const g = geo[0];
            locLabel = [g.city || g.subregion, g.region].filter(Boolean).join(', ');
          }
        }
      } catch {}
      setLocationName(locLabel);

      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=auto&forecast_days=5`
      );
      const data = await resp.json();
      const temp = Math.round(data.current?.temperature_2m ?? 0);
      const code: number = data.current?.weathercode ?? 0;
      const wmoIcon = (c: number): string => {
        if (c === 0) return 'sunny';
        if (c <= 2) return 'partly-sunny';
        if (c <= 3) return 'cloudy';
        if (c <= 49) return 'cloudy';
        if (c <= 67) return 'rainy';
        if (c <= 77) return 'snow';
        if (c <= 82) return 'rainy';
        if (c <= 86) return 'snow';
        return 'thunderstorm';
      };
      setWeather({ temp, condition: '', icon: wmoIcon(code) });

      // Hourly — next 12 hours
      const now = new Date();
      const hourlyTimes: string[] = data.hourly?.time ?? [];
      const hourlyTemps: number[] = data.hourly?.temperature_2m ?? [];
      const hourlyCodes: number[] = data.hourly?.weathercode ?? [];
      const hourlyPrecip: number[] = data.hourly?.precipitation_probability ?? [];
      const hourlyItems = hourlyTimes
        .map((t, i) => ({ time: t, temp: Math.round(hourlyTemps[i]), icon: wmoIcon(hourlyCodes[i]), precip: hourlyPrecip[i] ?? 0 }))
        .filter(h => new Date(h.time) > now)
        .slice(0, 12);
      setForecast(hourlyItems);

      // Daily — 5 days
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dailyTimes: string[] = data.daily?.time ?? [];
      const dailyHigh: number[] = data.daily?.temperature_2m_max ?? [];
      const dailyLow: number[] = data.daily?.temperature_2m_min ?? [];
      const dailyCodes: number[] = data.daily?.weathercode ?? [];
      const dailyPrecip: number[] = data.daily?.precipitation_probability_max ?? [];
      const dailyItems = dailyTimes.map((t, i) => ({
        day: i === 0 ? 'Today' : days[new Date(t + 'T12:00:00').getDay()],
        high: Math.round(dailyHigh[i]),
        low: Math.round(dailyLow[i]),
        icon: wmoIcon(dailyCodes[i]),
        precip: dailyPrecip[i] ?? 0,
      }));
      setDailyForecast(dailyItems);
    } catch {}
  };

  // ── Garbage Day ──
  const garbageFlagLabel: Record<string, string> = {
    'garbage': 'Garbage',
    'recycling-black': 'Black Bin (recycling)',
    'recycling-blue': 'Blue Bin (recycling)',
    'green-bin': 'Green Bin (organics)',
    'yard-waste': 'Yard Waste',
  };

  // Garbage collection day lookup via Ottawa ArcGIS MapServer
  // Layer 1: fields are GCD (collection day), SCHEDULE (A/B), C_ZONE
  const WASTE_QUERY = 'https://maps.ottawa.ca/arcgis/rest/services/SolidWasteCollectionCalendar/MapServer/1/query';

  const fetchGarbageEvents = async (lat: number, lng: number) => {
    try {
      // Pass WGS84 coords with inSR=4326 — ArcGIS reprojects to Web Mercator internally
      const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
      const resp = await fetch(
        `${WASTE_QUERY}?geometry=${encodeURIComponent(geometry)}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=GCD,SCHEDULE,C_ZONE&returnGeometry=false&f=json&inSR=4326`
      );
      const data = await resp.json();
      const feature = data?.features?.[0]?.attributes;
      if (!feature) { setGarbageError('No collection zone found. Make sure you\'re in Ottawa.'); return; }
      const collDay = feature.GCD;       // e.g. "Wednesday"
      const schedule = feature.SCHEDULE; // e.g. "A" or "B"
      const events = buildPickupDates(collDay, schedule);
      setGarbageEvents(events);
      setGarbageError('');
    } catch { setGarbageError('Could not load schedule. Try again.'); }
  };

  const searchGarbageAddress = async (q: string) => {
    if (!q.trim()) return;
    setGarbageLoading(true);
    setGarbageError('');
    setAddressSaved(false);
    try {
      // Geocode via Nominatim (OpenStreetMap) — free, no key needed
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Ottawa, Ontario, Canada')}&format=json&limit=1`,
        { headers: { 'User-Agent': 'RouteO/1.0' } }
      );
      const geoData = await geoResp.json();
      const result = geoData?.[0];
      if (!result) {
        setGarbageError('Address not found. Try "123 Main St" or a postal code.');
        setGarbageLoading(false);
        return;
      }
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      const displayAddress = result.display_name?.split(',').slice(0, 3).join(',') || q;
      setGarbageAddress(displayAddress);
      await AsyncStorage.setItem('routeo_garbage_address', displayAddress);
      await AsyncStorage.setItem('routeo_garbage_lat', String(lat));
      await AsyncStorage.setItem('routeo_garbage_lng', String(lng));
      await fetchGarbageEvents(lat, lng);
    } catch {
      setGarbageError('Could not search address. Check your connection.');
    }
    setGarbageLoading(false);
  };

  const searchGarbageReCollect = async (q: string) => {
    try {
      const resp = await fetch(
        `https://api.recollect.net/api/areas/Ottawa/services/257/places?q=${encodeURIComponent(q)}&locale=en`
      );
      const data = await resp.json();
      if (!data?.length) { setGarbageError('Address not found. Try "123 Main St" or postal code.'); return; }
      const place = data[0];
      setGarbageAddress(place.name);
      await AsyncStorage.setItem('routeo_garbage_address', place.name);
      await AsyncStorage.setItem('routeo_garbage_place_id', place.id);
      setGarbagePlaceId(place.id);
      await fetchGarbageEventsReCollect(place.id);
    } catch { setGarbageError('Could not find address. Try again.'); }
  };

  const fetchGarbageEventsReCollect = async (placeId: string) => {
    try {
      const now = new Date();
      const after = now.toISOString().split('T')[0];
      const before = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const resp = await fetch(
        `https://api.recollect.net/api/places/${placeId}/services/257/events?after=${after}&before=${before}&locale=en`
      );
      const data = await resp.json();
      const events = (data?.events ?? []).map((e: any) => ({
        date: e.day,
        flags: (e.flags ?? []).map((f: any) => f.event_type),
        label: (e.flags ?? []).map((f: any) => garbageFlagLabel[f.event_type] ?? f.event_type).join(' · '),
      })).filter((e: any) => e.flags.length > 0).slice(0, 8);
      setGarbageEvents(events);
    } catch { setGarbageError('Could not load schedule.'); }
  };

  // Build upcoming pickup dates from collection day name + A/B schedule
  const buildPickupDates = (dayName: string, schedule: string): { date: string; flags: string[]; label: string }[] => {
    const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const targetDay = days[dayName?.toLowerCase()] ?? 3;
    const results = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let d = new Date(now);
    // Find next occurrence of the day
    while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
    // Determine if this week is garbage week or recycling week based on schedule + week parity
    const weekNum = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    let isGarbageWeek = (weekNum % 2 === 0) === (schedule === 'A');
    for (let i = 0; i < 8; i++) {
      const dateStr = d.toISOString().split('T')[0];
      const flags = isGarbageWeek
        ? ['garbage', 'recycling-black', 'green-bin']
        : ['recycling-blue', 'green-bin'];
      results.push({
        date: dateStr,
        flags,
        label: isGarbageWeek ? 'Garbage · Black Bin · Green Bin' : 'Blue Bin · Green Bin',
      });
      d.setDate(d.getDate() + 14);
      isGarbageWeek = !isGarbageWeek;
    }
    return results;
  };

  const loadSavedGarbageAddress = async () => {
    const address = await AsyncStorage.getItem('routeo_garbage_address');
    const lat = await AsyncStorage.getItem('routeo_garbage_lat');
    const lng = await AsyncStorage.getItem('routeo_garbage_lng');
    const placeId = await AsyncStorage.getItem('routeo_garbage_place_id');
    if (address) { setGarbageAddress(address); setAddressSaved(true); }
    if (lat && lng) { fetchGarbageEvents(parseFloat(lat), parseFloat(lng)); }
    else if (placeId) { setGarbagePlaceId(placeId); fetchGarbageEventsReCollect(placeId); }
  };

  const fetchAlerts = async () => {
    try {
      setAlertsLoading(true);
      const resp = await fetch(ALERTS_URL);
      const data = await resp.json();
      setAlerts(data.alerts || []);
    } catch { setAlerts([]); }
    finally { setAlertsLoading(false); }
  };

  const fetchDiscoverPhotos = async () => {
    const photos: { [id: string]: string } = {};
    await Promise.all(DISCOVER_CARDS.map(async card => {
      try {
        const resp = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(card.query)}&per_page=1&orientation=landscape`, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } });
        const data = await resp.json();
        if (data.results?.[0]?.urls?.regular) photos[card.id] = data.results[0].urls.regular;
      } catch {}
    }));
    setDiscoverPhotos(photos);
  };

  const saveFavs = (newFavs: Fav[]) => { setFavs(newFavs); AsyncStorage.setItem('routeo_favs', JSON.stringify(newFavs)); };
  const addFav = (id: string, name: string) => {
    if (favs.find(f => f.id === id)) return;
    if (favs.length >= 5) { Alert.alert(t('Max 5 favourites', 'Max 5 favoris'), t('Long press to remove one first.', 'Appuyez longuement pour en retirer un.')); return; }
    saveFavs([...favs, { id, name, icon: 'star' }]);
  };
  const removeFav = (id: string) => saveFavs(favs.filter(f => f.id !== id));
  const removeSavedPlace = async (id: string) => {
    const updated = savedPlaces.filter(p => p.id !== id);
    setSavedPlaces(updated);
    await AsyncStorage.setItem('routeo_saved_places', JSON.stringify(updated));
  };

  const fetchArrivals = useCallback(async (id: string) => {
    try {
      setError('');
      const isNumericOnly = /^\d+$/.test(id);
      const internalId = isNumericOnly ? resolveStopId(id) : id;
      console.log('fetchArrivals:', id, 'internal:', internalId, 'isLRT:', LRT_STOP_IDS.has(id) || LRT_STOP_IDS.has(internalId));
      if (LRT_STOP_IDS.has(id) || LRT_STOP_IDS.has(internalId)) {
        const rawId = LRT_STOP_IDS.has(id) ? id : internalId;
        const platforms = MULTI_PLATFORM_STOPS[rawId];
        const lrtId = platforms ? (platforms.find(p => /^[A-Z]/.test(p)) || rawId) : rawId;
        console.log('LRT fetch:', lrtId);
        const resp = await fetch(`${BACKEND_URL}?stop=${lrtId}`);
        const data = await resp.json();
        console.log('LRT arrivals response:', JSON.stringify(data).slice(0, 300));
        setArrivals((data.arrivals || []).map((a: any) => ({ id: `${a.stopId}-${a.scheduledTime}`, routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway, delay: 0, secsAway: a.minsAway * 60, isScheduled: true })));
        const now = new Date();
        setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
        setLoading(false);
        return;
      }
      const resp = await fetch(TRIP_UPDATES, { headers: { 'Ocp-Apim-Subscription-Key': API_KEY } });
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      setArrivals(parseGTFS(data, internalId));
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => fetchArrivals(stopId), 30000);
    return () => clearInterval(interval);
  }, [stopId, fetchArrivals]);

  const parseGTFS = (data: any, internalStopId: string): Arrival[] => {
    const now = Math.floor(Date.now() / 1000);
    const results: Arrival[] = [];
    for (const ent of (data?.Entity || [])) {
      const tu = ent.TripUpdate;
      if (!tu) continue;
      for (const stu of (tu.StopTimeUpdate || [])) {
        const stopIdsToMatch = MULTI_PLATFORM_STOPS[internalStopId] || [internalStopId];
        if (!stopIdsToMatch.includes(String(stu.StopId))) continue;
        const arr = stu.Arrival || stu.Departure || {};
        const t2 = parseInt(arr.Time || 0);
        if (!t2) continue;
        const secsAway = t2 - now;
        if (secsAway < -60 || secsAway > 5400) continue;
        const trip = tu.Trip || {};
        const tripId = String(trip.TripId || '');
        results.push({ id: tripId || String(Math.random()), routeId: trip.RouteId || '?', headsign: getHeadsign(tripId), minsAway: Math.max(0, Math.round(secsAway / 60)), delay: Math.round((arr.Delay || 0) / 60), secsAway });
      }
    }
    return results.sort((a, b) => a.secsAway - b.secsAway).slice(0, 8);
  };

  const loadStop = (id: string, name?: string) => { setStopId(id); setStopName(name || getStopName(id) || id); setLoading(true); fetchArrivals(id); };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (text.length >= 2) {
      const upper = text.toUpperCase();
      setSearchResults(STOP_SEARCH.filter(s => s.name.toUpperCase().includes(upper) || s.id.includes(text)).slice(0, 6));
    } else setSearchResults([]);
  };

  const handleSearch = () => {
    if (searchText.length < 2) return;
    const internalId = resolveStopId(searchText);
    if (internalId !== searchText) { loadStop(searchText); setSearchText(''); setSearchResults([]); Keyboard.dismiss(); }
  };

  const reportBusPassed = (routeId: string) => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    setReports(prev => {
      const existing = prev[routeId];
      const updated: Reports = { ...prev, [routeId]: { count: (existing && existing.expiresAt > now ? existing.count : 0) + 1, expiresAt: now + TWO_HOURS } };
      AsyncStorage.setItem('routeo_ghost_reports', JSON.stringify(updated));
      return updated;
    });
    Alert.alert(t('Thanks!', 'Merci!'), t('Reported — helps other riders.', 'Signalé — aide les autres usagers.'));
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
    if (tile.action === 'alert' && tile.target === 'garbage') { setGarbageModalVisible(true); return; }
    if (tile.action === 'alert') { setAlertsModalVisible(true); return; }
    if (tile.action === 'navigate' && tile.target) {
      // nearby category tiles pass as query string — convert to params
      if (tile.target.includes('?category=')) {
        const [path, query] = tile.target.split('?category=');
        router.push({ pathname: path, params: { category: query } } as any);
      } else {
        router.push(tile.target as any);
      }
      return;
    }
    if (tile.action === 'link' && tile.target) {
      Linking.openURL(tile.target).catch(() =>
        Alert.alert(language === 'fr' ? tile.label_fr : tile.label_en, t('Could not open link.', 'Impossible d\'ouvrir le lien.'))
      );
    }
  };
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

  const alertDotColour = () => {
    if (!hasAlerts) return colours.accent;
    return CATEGORY_COLOUR[activeAlerts[0]?.category] || colours.orange;
  };

  // ── Edit mode section wrapper ────────────────────────────────
  const SectionWrapper = ({ id, children }: { id: string; children: React.ReactNode }) => {
    if (!editMode) return <>{children}</>;
    const idx = sectionOrder.indexOf(id);
    return (
      <View style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: colours.accent + '40', borderRadius: 16, margin: 8, borderStyle: 'dashed', zIndex: 1, pointerEvents: 'none' }} />
        <View style={{ position: 'absolute', right: 16, top: 8, flexDirection: 'row', gap: 4, zIndex: 10 }}>
          <TouchableOpacity onPress={() => moveSectionUp(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-up" size={14} color={idx === 0 ? colours.muted : colours.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => moveSectionDown(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-down" size={14} color={idx === sectionOrder.length - 1 ? colours.muted : colours.accent} />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    );
  };

  const renderArrival = (item: Arrival) => {
    const isLRT = item.isScheduled || item.routeId.includes('350') || item.routeId.includes('354') || item.routeId === '1' || item.routeId === '2';
    const now = Date.now();
    const reportEntry = reports[item.routeId];
    const reportCount = reportEntry && reportEntry.expiresAt > now ? reportEntry.count : 0;
    const ghostBus = reportCount >= 2;
    return (
      <View key={item.id} style={[styles.arrivalRow, { borderBottomColor: colours.border, backgroundColor: colours.surface }, ghostBus && styles.ghostRow]}>
        <View style={[styles.badge, { backgroundColor: isLRT ? colours.accentAlt + '18' : colours.accent + '18' }]}>
          <Text style={{ fontWeight: '800', fontSize: fonts.md, color: isLRT ? colours.lrt : colours.accent }}>{isLRT ? '🚊' : item.routeId}</Text>
        </View>
        <View style={styles.arrivalInfo}>
          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
            {isLRT ? 'O-Train' : `${t('Route', 'Route')} ${item.routeId}`}
            {item.delay > 0 ? <Text style={{ color: colours.orange, fontSize: fonts.sm }}> (+{item.delay}m {t('late', 'retard')})</Text> : null}
            {ghostBus ? <Text style={{ color: colours.muted, fontSize: fonts.sm }}> {t('Ghost bus', 'Bus fantôme')}</Text> : null}
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{item.headsign ? `→ ${item.headsign}` : `→ ${t('Checking route...', 'Vérification...')}`}</Text>
          {item.isScheduled && <Text style={{ fontSize: 10, color: colours.muted, marginTop: 3, fontStyle: 'italic' }}>{t('Scheduled time', 'Heure prévue')}</Text>}
          {reportCount > 0 && <Text style={{ fontSize: fonts.sm, color: colours.orange, marginTop: 3 }}>{reportCount} {t(reportCount > 1 ? 'riders say passed' : 'rider says passed', reportCount > 1 ? 'usagers disent passé' : 'usager dit passé')}</Text>}
        </View>
        <View style={styles.arrivalRight}>
          <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: item.minsAway <= 2 ? colours.red : colours.accent }}>{item.minsAway === 0 ? t('Due', 'Imminent') : `${item.minsAway}m`}</Text>
          {!item.isScheduled && (
            <TouchableOpacity style={[styles.reportBtn, { borderColor: colours.border, backgroundColor: colours.card }]} onPress={() => reportBusPassed(item.routeId)}>
              <Text style={{ fontSize: fonts.sm, color: colours.orange, fontWeight: '600' }}>{t('Passed?', 'Passé?')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderDiscoverCard = (card: typeof DISCOVER_CARDS[0]) => {
    const photoUrl = (card as any).photoUrl || discoverPhotos[card.id];
    const title = language === 'fr' ? card.title_fr : card.title_en;
    const category = language === 'fr' ? card.category_fr : card.category_en;
    return (
      <TouchableOpacity key={card.id} style={[styles.discoverCard, { overflow: 'hidden' }, cardShadow]} onPress={() => Alert.alert(title, `${category}\n\n${t('Coming soon!', 'Bientôt disponible!')}`)} activeOpacity={0.92}>
        <ImageBackground source={photoUrl ? { uri: photoUrl } : undefined} style={styles.discoverCardImage} resizeMode="cover">
          {!photoUrl && <View style={[styles.discoverCardFallback, { backgroundColor: card.accent + '22' }]}><ActivityIndicator color={card.accent} size="small" /></View>}
          {photoUrl && (<><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.12)' }} /><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, backgroundColor: 'rgba(0,0,0,0.22)' }} /></>)}
          <View style={[styles.categoryBadge, { backgroundColor: card.accent }]}>
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{category}</Text>
          </View>
          {photoUrl && (<View style={styles.discoverCardBottom}><Text numberOfLines={2} style={{ color: 'white', fontSize: fonts.md, fontWeight: '800', lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>{title}</Text></View>)}
        </ImageBackground>
        {!photoUrl && <View style={{ padding: 10 }}><Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{title}</Text></View>}
      </TouchableOpacity>
    );
  };

  const iconColor = (icon: string) => {
    if (icon === 'sunny') return '#e8a020';
    if (icon === 'partly-sunny') return '#c0852a';
    if (icon === 'rainy') return '#004890';
    if (icon === 'snow') return '#7b5ea7';
    if (icon === 'thunderstorm') return '#cc3b2a';
    return '#6b7f99';
  };

  const saveGarbageAddress = async () => {
    if (!garbageAddress) return;
    await AsyncStorage.setItem('routeo_garbage_address', garbageAddress);
    setAddressSaved(true);
  };

  const renderGarbageModal = () => {
    const nextPickup = garbageEvents[0];
    const nextDate = nextPickup ? new Date(nextPickup.date + 'T12:00:00') : null;
    const daysUntil = nextDate ? Math.round((nextDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000) : null;
    const daysLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : daysUntil != null ? `IN ${daysUntil} DAYS` : null;

    const renderBinChips = (flags: string[]) => (
      <View style={{ gap: 8 }}>
        {flags.map(flag => {
          const bin = BIN_INFO[flag];
          if (!bin) return null;
          const isOpen = expandedBin === flag;
          return (
            <TouchableOpacity key={flag} onPress={() => setExpandedBin(isOpen ? null : flag)}
              style={{ backgroundColor: bin.color + '15', borderWidth: 1, borderColor: bin.color + '55', borderRadius: 12, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: bin.color }} />
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{bin.label}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colours.muted }}>{isOpen ? '▲' : '▼'}</Text>
              </View>
              {isOpen && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#2d7a3a', marginBottom: 2 }}>✓ Accepted</Text>
                  {bin.accepts.map(item => <Text key={item} style={{ fontSize: fonts.sm, color: colours.text }}>  • {item}</Text>)}
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#cc3b2a', marginTop: 6, marginBottom: 2 }}>✗ Not accepted</Text>
                  {bin.rejects.map(item => <Text key={item} style={{ fontSize: fonts.sm, color: colours.muted }}>  • {item}</Text>)}
                </View>
              )}
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
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, paddingHorizontal: 20, marginBottom: 12 }}>Garbage Day</Text>

            {/* Address bar */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colours.text, fontSize: fonts.md }}
                placeholder="Enter your Ottawa address..."
                placeholderTextColor={colours.muted}
                value={garbageAddressInput}
                onChangeText={setGarbageAddressInput}
                onSubmitEditing={() => searchGarbageAddress(garbageAddressInput)}
                returnKeyType="search"
              />
              <TouchableOpacity onPress={() => searchGarbageAddress(garbageAddressInput)} style={{ backgroundColor: colours.accent, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Ionicons name="search" size={18} color="white" />
              </TouchableOpacity>
            </View>

            {garbageLoading && <ActivityIndicator color={colours.accent} style={{ marginVertical: 20 }} />}
            {!!garbageError && <Text style={{ color: '#cc3b2a', paddingHorizontal: 20, marginBottom: 12, fontSize: fonts.sm }}>{garbageError}</Text>}

            {garbageAddress ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {/* Address row with save button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>{garbageAddress}</Text>
                  <TouchableOpacity onPress={saveGarbageAddress}
                    style={{ backgroundColor: addressSaved ? '#2d7a3a' : colours.surface, borderWidth: 1, borderColor: addressSaved ? '#2d7a3a' : colours.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: addressSaved ? 'white' : colours.text }}>
                      {addressSaved ? '✓ Saved' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Next pickup hero */}
                {nextPickup && (
                  <View style={{ backgroundColor: colours.accent + '15', borderWidth: 1.5, borderColor: colours.accent, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent, marginBottom: 4 }}>NEXT COLLECTION · {daysLabel}</Text>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 12 }}>
                      {nextDate?.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </Text>
                    {renderBinChips(nextPickup.flags)}
                  </View>
                )}

                {/* Upcoming */}
                {garbageEvents.slice(1).map((ev, i) => {
                  const d = new Date(ev.date + 'T12:00:00');
                  return (
                    <View key={i} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginBottom: 6 }}>
                        {d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      {renderBinChips(ev.flags)}
                    </View>
                  );
                })}
                <View style={{ height: 16 }} />
              </ScrollView>
            ) : !garbageLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="home-outline" size={40} color={colours.muted} />
                <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center', marginTop: 12 }}>Enter your Ottawa address to see your collection schedule.</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => { setGarbageModalVisible(false); setExpandedBin(null); }} style={{ marginHorizontal: 20, marginTop: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderWeatherModal = () => (
    <Modal visible={weatherModalVisible} animationType="slide" transparent onRequestClose={() => setWeatherModalVisible(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
          {/* Handle */}
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 8 }} />

          {/* Current */}
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Ionicons name={(weather?.icon ?? 'cloudy') as any} size={56} color={iconColor(weather?.icon ?? 'cloudy')} />
            <Text style={{ fontSize: 64, fontWeight: '200', color: colours.text, marginTop: 8 }}>{weather?.temp}°</Text>
            <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 2 }}>{locationName}</Text>
          </View>

          {/* Hourly scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }} style={{ marginBottom: 20 }}>
            {forecast.map((h, i) => {
              const hour = new Date(h.time).getHours();
              const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
              return (
                <View key={i} style={{ alignItems: 'center', gap: 4, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, paddingVertical: 10, minWidth: 56 }}>
                  <Text style={{ fontSize: fonts.sm - 2, color: colours.muted, fontWeight: '600' }}>{label}</Text>
                  <Ionicons name={h.icon as any} size={20} color={iconColor(h.icon)} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.text }}>{h.temp}°</Text>
                  {h.precip > 0 && <Text style={{ fontSize: fonts.sm - 2, color: '#1a6fbf', fontWeight: '600' }}>{h.precip}%</Text>}
                </View>
              );
            })}
          </ScrollView>

          {/* Daily */}
          <View style={{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
            {dailyForecast.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < dailyForecast.length - 1 ? 1 : 0, borderBottomColor: colours.border }}>
                <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{d.day}</Text>
                <Ionicons name={d.icon as any} size={20} color={iconColor(d.icon)} style={{ marginRight: 8 }} />
                {d.precip > 0 && <Text style={{ fontSize: fonts.sm, color: '#1a6fbf', fontWeight: '600', minWidth: 36, textAlign: 'right', marginRight: 8 }}>{d.precip}%</Text>}
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, minWidth: 32, textAlign: 'right' }}>{d.high}°</Text>
                <Text style={{ fontSize: fonts.md, color: colours.muted, minWidth: 32, textAlign: 'right' }}>{d.low}°</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={() => setWeatherModalVisible(false)} style={{ marginHorizontal: 20, marginTop: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderAlertsModal = () => (
    <Modal visible={alertsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAlertsModalVisible(false)}>
      <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Service Alerts', 'Alertes de service')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('OC Transpo · Live', 'OC Transpo · En direct')}</Text>
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setAlertsModalVisible(false)}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.lrtStatusCard, { backgroundColor: colours.lrt + '12', borderColor: colours.lrt }]} onPress={() => { setAlertsModalVisible(false); Linking.openURL('https://occasionaltransport.ca'); }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 16 }}>🚊</Text>
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.lrt }}>{t('LRT Community Status', 'Statut communautaire du TLR')}</Text>
            </View>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, lineHeight: 18 }}>{t('Real-time LRT incident reports from Ottawa riders — faster than official alerts.', "Rapports d'incidents TLR en temps réel des usagers d'Ottawa.")}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colours.lrt} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {alertsLoading ? (
            <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Loading alerts...', 'Chargement des alertes...')}</Text></View>
          ) : alerts.length === 0 ? (
            <View style={styles.modalCenter}><Ionicons name="checkmark-circle" size={48} color={colours.accent} /><Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('All Clear', 'Tout est normal')}</Text><Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 6 }}>{t('No active service alerts on OC Transpo.', 'Aucune alerte de service active sur OC Transpo.')}</Text></View>
          ) : alerts.map(alert => {
            const catColour = CATEGORY_COLOUR[alert.category] || colours.accent;
            return (
              <TouchableOpacity key={alert.id} style={[styles.alertCard, { backgroundColor: colours.surface, borderColor: colours.border, borderLeftColor: catColour, ...cardShadow }]} onPress={() => alert.link && Linking.openURL(alert.link)} activeOpacity={alert.link ? 0.8 : 1}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[styles.alertCatBadge, { backgroundColor: catColour + '20' }]}><Text style={{ fontSize: 9, fontWeight: '800', color: catColour, textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.category}</Text></View>
                  {alert.routes.length > 0 && (<View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1 }}>{alert.routes.slice(0, 4).map(route => (<View key={route} style={[styles.routeBadge, { backgroundColor: colours.accent + '18' }]}><Text style={{ fontSize: 9, fontWeight: '700', color: colours.accent }}>{route}</Text></View>))}</View>)}
                </View>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 8, lineHeight: 20 }}>{alert.title}</Text>
                {alert.description ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>{alert.description}</Text> : null}
                {alert.pubDate ? <Text style={{ fontSize: 10, color: colours.muted, marginTop: 6 }}>{alert.pubDate}</Text> : null}
                {alert.link ? <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginTop: 6 }}>{t('View details →', 'Voir les détails →')}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Tile Swap Bottom Sheet ───────────────────────────────────
  const renderSwapSheet = () => (
    <Modal visible={swapSheetVisible} animationType="slide" presentationStyle="pageSheet" transparent onRequestClose={() => setSwapSheetVisible(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableWithoutFeedback onPress={() => setSwapSheetVisible(false)}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        </TouchableWithoutFeedback>
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, backgroundColor: colours.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{t('Change Tile', 'Changer la tuile')}</Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 16 }}>{t('Pick a category for this slot', 'Choisissez une catégorie pour cet emplacement')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ALL_OTTAWA_LIFE.map(item => {
              const isActive = swapTileIndex !== null && ottawaLifeIds[swapTileIndex] === item.id;
              const isUsed = ottawaLifeIds.includes(item.id) && !isActive;
              return (
                <TouchableOpacity
                  key={item.id}
                  disabled={isUsed}
                  onPress={() => swapTileIndex !== null && swapOttawaLifeTile(swapTileIndex, item.id)}
                  style={{ width: '21%', alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 2, borderColor: isActive ? item.accent : isUsed ? colours.border : colours.border, backgroundColor: isActive ? item.accent + '18' : isUsed ? colours.bg : colours.surface, opacity: isUsed ? 0.4 : 1 }}
                >
                  <Ionicons name={item.icon as any} size={22} color={isActive ? item.accent : isUsed ? colours.muted : item.accent} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? item.accent : colours.text, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>{language === 'fr' ? item.label_fr : item.label_en}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Expanded Arrivals Modal ──────────────────────────────────
  const renderExpandedArrivals = () => {
    const expandedFav = favs.find(f => f.id === expandedStopId);
    const expandedName = expandedFav?.name || stopName;
    const isSaved = !!favs.find(f => f.id === expandedStopId);
    return (
      <Modal visible={!!expandedStopId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setExpandedStopId(null)}>
        <View style={[styles.modalContainer, { backgroundColor: colours.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colours.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{expandedName}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {lastUpdated ? `${t('Updated', 'Mis à jour')} ${lastUpdated}` : t('All arrivals', 'Toutes les arrivées')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {/* Save / unsave stop */}
              <TouchableOpacity
                onPress={() => {
                  if (expandedStopId) {
                    isSaved ? removeFav(expandedStopId) : addFav(expandedStopId, expandedName);
                  }
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: isSaved ? colours.accent : colours.border, backgroundColor: isSaved ? colours.accent + '15' : colours.surface }}
              >
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: isSaved ? colours.accent : colours.muted }}>
                  {isSaved ? t('✓ Saved', '✓ Sauvegardé') : t('+ Save', '+ Sauvegarder')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => fetchArrivals(stopId)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}
              >
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Refresh ↺', 'Actualiser ↺')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={() => setExpandedStopId(null)}>
                <Ionicons name="close" size={18} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {loading ? (
              <View style={styles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /></View>
            ) : error ? (
              <View style={styles.modalCenter}>
                <Ionicons name="wifi-outline" size={36} color={colours.muted} />
                <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text>
              </View>
            ) : arrivals.length === 0 ? (
              <View style={styles.modalCenter}>
                <Ionicons name="time-outline" size={48} color={colours.muted} />
                <Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                {arrivals.map(renderArrival)}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const MAP_H = 200;
  const fakeBusDots = [
    { top: 76,  leftPct: '22%', route: '95', color: colours.accent },
    { top: 76,  leftPct: '55%', route: '1',  color: colours.lrt    },
    { top: 110, leftPct: '70%', route: '62', color: colours.accent },
    { top: 40,  leftPct: '40%', route: '16', color: colours.accent },
    { top: 140, leftPct: '30%', route: '85', color: colours.accent },
  ] as const;

  // ── Section renderers ────────────────────────────────────────
  const quickActions = ALL_QUICK_ACTIONS.filter(a => quickActionIds.includes(a.id));
  const ottawaLife = ottawaLifeIds.map(id => ALL_OTTAWA_LIFE.find(o => o.id === id)).filter(Boolean) as typeof ALL_OTTAWA_LIFE;

  const renderSection = (sectionId: string) => {
    switch (sectionId) {

      case 'otrain': return (
        <SectionWrapper key="otrain" id="otrain">
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{t('O-Train', 'O-Train')}</Text>
          <TouchableOpacity style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: showLine1 ? 0 : 10, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: showLine1 ? 0 : 16, borderBottomRightRadius: showLine1 ? 0 : 16, padding: 14, backgroundColor: showLine1 ? colours.lrt + '12' : colours.surface, borderColor: showLine1 ? colours.lrt : colours.border }, cardShadow]} onPress={() => { setShowLine1(!showLine1); setShowLine2(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.lrt + '20', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '900', color: colours.lrt }}>L1</Text></View>
              <View>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine1 ? colours.lrt : colours.text }}>{t('Confederation Line', 'Ligne Confédération')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t("Tunney's Pasture ↔ Blair", "Tunney's ↔ Blair")}</Text>
              </View>
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
              {showEast && LRT_EAST.map((station, index) => (
                <TouchableOpacity
                  key={station.id}
                  style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt + '12' }]}
                  onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine1(false); setShowEast(false); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.stationDotCol}>
                    <View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />
                    {index < LRT_EAST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>{station.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              ))}
              {showWest && LRT_WEST.map((station, index) => (
                <TouchableOpacity
                  key={station.id}
                  style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt + '12' }]}
                  onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine1(false); setShowWest(false); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.stationDotCol}>
                    <View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />
                    {index < LRT_WEST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>{station.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: showLine2 ? 0 : 16, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: showLine2 ? 0 : 16, borderBottomRightRadius: showLine2 ? 0 : 16, padding: 14, backgroundColor: showLine2 ? '#7b5ea7' + '12' : colours.surface, borderColor: showLine2 ? '#7b5ea7' : colours.border }, cardShadow]} onPress={() => { setShowLine2(!showLine2); setShowLine1(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '900', color: '#7b5ea7' }}>L2</Text></View>
              <View>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine2 ? '#7b5ea7' : colours.text }}>{t('Trillium Line', 'Ligne Trillium')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t('Bayview ↔ Limebank', 'Bayview ↔ Limebank')}</Text>
              </View>
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
              {showNorth && LRT2_NORTH.map((station, index) => (
                <TouchableOpacity
                  key={`n${index}`}
                  style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]}
                  onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine2(false); setShowNorth(false); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.stationDotCol}>
                    <View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />
                    {index < LRT2_NORTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>{station.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              ))}
              {showSouth && LRT2_SOUTH.map((station, index) => (
                <TouchableOpacity
                  key={`s${index}`}
                  style={[styles.stationRow, { borderBottomColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]}
                  onPress={() => { loadStop(station.id, station.name); setExpandedStopId(station.id); setShowLine2(false); setShowSouth(false); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.stationDotCol}>
                    <View style={[styles.stationDot, { borderColor: colours.border }, stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />
                    {index < LRT2_SOUTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>{station.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SectionWrapper>
      );

      case 'saved': return savedPlaces.length === 0 ? null : (
        <SectionWrapper key="saved" id="saved">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Saved Places', 'Lieux sauvegardés')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Long press to remove', 'Appui long pour retirer')}</Text>
          </View>
          <FlatList
            horizontal
            data={savedPlaces}
            keyExtractor={p => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 10, paddingBottom: 4 }}
            style={{ marginBottom: 20 }}
            snapToInterval={170}
            decelerationRate="fast"
            renderItem={({ item: place }) => (
              <SavedPlaceCard place={place} colours={colours} fonts={fonts} language={language} t={t} onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(`${place.name} ${place.vicinity}`)}`)} onLongPress={() => Alert.alert(t('Remove?', 'Retirer?'), place.name, [{ text: t('Cancel', 'Annuler'), style: 'cancel' }, { text: t('Remove', 'Retirer'), style: 'destructive', onPress: () => removeSavedPlace(place.id) }])} cardShadow={cardShadow} />
            )}
          />
        </SectionWrapper>
      );

      case 'services': {
        const currentTab = SERVICES_TABS.find(t => t.id === activeServicesTab) || SERVICES_TABS[0];
        return (
          <SectionWrapper key="services" id="services">
            <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm }]}>{t('Ottawa Services', 'Services Ottawa')}</Text>
            {/* Tab bar — equal width pills across full row */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
              {SERVICES_TABS.map(tab => {
                const active = activeServicesTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveServicesTab(tab.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                      flex: 1, height: 34, borderRadius: 17,
                      borderWidth: 1,
                      backgroundColor: active ? colours.accent : colours.surface,
                      borderColor: active ? colours.accent : colours.border,
                    }}
                  >
                    <Ionicons name={tab.icon as any} size={13} color={active ? 'white' : colours.muted} />
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: active ? 'white' : colours.muted }}>
                      {language === 'fr' ? tab.label_fr : tab.label_en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 2×4 tile grid — 4 columns, fills edge-to-edge like O-Train cards */}
            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
              {[0, 1].map(row => (
                <View key={row} style={{ flexDirection: 'row', gap: 10, marginBottom: row === 0 ? 10 : 0 }}>
                  {currentTab.tiles.slice(row * 4, row * 4 + 4).map(tile => (
                    <TouchableOpacity
                      key={tile.id}
                      onPress={() => handleServiceTile(tile)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: colours.surface,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colours.border,
                        borderTopWidth: 3,
                        borderTopColor: tile.accent,
                        paddingVertical: 14,
                        paddingHorizontal: 4,
                        ...cardShadow,
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={tile.icon as any} size={22} color={tile.accent} />
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colours.text, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>
                        {language === 'fr' ? tile.label_fr : tile.label_en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </SectionWrapper>
        );
      }

      case 'alerts': return (
        <SectionWrapper key="alerts" id="alerts">
          <TouchableOpacity style={[styles.notifBar, { backgroundColor: hasAlerts ? alertDotColour() + '12' : colours.surface, borderColor: hasAlerts ? alertDotColour() : colours.border, ...cardShadow }]} onPress={() => setAlertsModalVisible(true)}>
            <View style={styles.notifLeft}>
              {alertsLoading ? <ActivityIndicator size="small" color={colours.muted} style={{ marginRight: 8 }} /> : <View style={[styles.notifDot, { backgroundColor: alertDotColour() }]} />}
              <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '500', flex: 1 }} numberOfLines={1}>{alertBarText()}</Text>
            </View>
            <Text style={{ color: hasAlerts ? alertDotColour() : colours.accent, fontSize: fonts.sm, fontWeight: '600', marginLeft: 8 }}>{t('View all →', 'Voir tout →')}</Text>
          </TouchableOpacity>
        </SectionWrapper>
      );

      case 'map': return (
        <SectionWrapper key="map" id="map">
          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Live Map', 'Carte en direct')}</Text>
              <View style={[styles.liveBadge, { backgroundColor: colours.accent + '18', borderColor: colours.accent + '40' }]}><View style={[styles.liveDot, { backgroundColor: colours.accent }]} /><Text style={{ color: colours.accent, fontSize: 10, fontWeight: '700' }}>LIVE</Text></View>
            </View>
            <TouchableOpacity style={[{ borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, height: MAP_H }, cardShadow]} onPress={() => router.push('/(tabs)/map')} activeOpacity={0.9}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colours.bg }}>
                {[0.2, 0.4, 0.6, 0.8].map(p => (<View key={`h${p}`} style={{ position: 'absolute', top: p * MAP_H, left: 0, right: 0, height: 1, backgroundColor: colours.border + '80' }} />))}
                {(['15%', '30%', '45%', '60%', '75%', '90%'] as const).map(p => (<View key={`v${p}`} style={{ position: 'absolute', left: p, top: 0, bottom: 0, width: 1, backgroundColor: colours.border + '80' }} />))}
                <View style={{ position: 'absolute', top: 0.42 * MAP_H, left: 0, right: 0, height: 6, backgroundColor: colours.border + 'CC', borderRadius: 3 }} />
                <View style={{ position: 'absolute', left: '38%', top: 0, bottom: 0, width: 6, backgroundColor: colours.border + 'CC', borderRadius: 3 }} />
                <View style={{ position: 'absolute', top: 0.65 * MAP_H, left: 0, right: 0, height: 4, backgroundColor: colours.border + '99', borderRadius: 2 }} />
              </View>
              {fakeBusDots.map((dot, i) => (<View key={i} style={{ position: 'absolute', top: dot.top, left: dot.leftPct as any, alignItems: 'center' }}><View style={{ backgroundColor: dot.color, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1.5, borderColor: 'white' }}><Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>{dot.route}</Text></View><View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: dot.color }} /></View>))}
              <View style={{ position: 'absolute', top: 0.40 * MAP_H, left: '37%' as any, width: 14, height: 14, borderRadius: 7, backgroundColor: colours.accent, borderWidth: 2.5, borderColor: 'white' }} />
              <View style={{ position: 'absolute', top: 0.36 * MAP_H, left: '33%' as any, width: 28, height: 28, borderRadius: 14, backgroundColor: colours.accent + '25', borderWidth: 1, borderColor: colours.accent + '40' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colours.surface + 'EE' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="map" size={16} color={colours.accent} /></View>
                  <View>
                    <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text }}>{t('Live Bus Map', 'Carte en direct')}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Real-time positions · Ottawa', 'Positions en temps réel · Ottawa')}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: colours.accent + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Open', 'Ouvrir')}</Text></View>
              </View>
            </TouchableOpacity>
          </View>
        </SectionWrapper>
      );

      case 'discover': return (
        <SectionWrapper key="discover" id="discover">
          <View style={styles.discoverHeader}>
            <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm, marginBottom: 0 }]}>{t('Discover Ottawa', 'Découvrir Ottawa')}</Text>
            <TouchableOpacity onPress={() => Alert.alert(t('Discover', 'Découvrir'), t('More coming soon!', 'Plus à venir!'))}><Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '600' }}>{t('See all →', 'Voir tout →')}</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {DISCOVER_CARDS.map(card => renderDiscoverCard(card))}
          </ScrollView>
          <View style={{ height: 32 }} />
        </SectionWrapper>
      );

      default: return null;
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* ── FIX: Replaced TouchableWithoutFeedback wrapper with plain View.
           The outer TouchableWithoutFeedback was intercepting taps on nested
           TouchableOpacity rows (e.g. O-Train station rows), preventing onPress
           from firing. Keyboard dismiss is now handled by ScrollView's
           onScrollBeginDrag and keyboardShouldPersistTaps="handled". ── */}
      <View style={[styles.container, { backgroundColor: colours.bg }]}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        {renderAlertsModal()}
        {renderWeatherModal()}
        {renderGarbageModal()}
        {renderSwapSheet()}
        {renderExpandedArrivals()}

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          onScrollBeginDrag={() => { Keyboard.dismiss(); setSearchResults([]); }}
        >

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>Route<Text style={{ color: colours.accent }}>O</Text></Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>OC TRANSPO · OTTAWA</Text>
            </View>
            <View style={styles.headerRight}>
              {isNight && (
                <View style={[styles.nightBadge, { backgroundColor: colours.accentAlt + '22', borderColor: colours.accentAlt }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="moon" size={12} color={colours.accentAlt} />
                    <Text style={{ color: colours.accentAlt, fontSize: fonts.sm, fontWeight: '700' }}>{t('Night', 'Nuit')}</Text>
                  </View>
                </View>
              )}
              {weather && (
                <TouchableOpacity onPress={() => setWeatherModalVisible(true)} style={[styles.nightBadge, { backgroundColor: colours.surface, borderColor: colours.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <Ionicons name={weather.icon as any} size={13} color={iconColor(weather.icon)} />
                  <Text style={{ color: colours.text, fontSize: fonts.sm, fontWeight: '700' }}>{weather.temp}°</Text>
                </TouchableOpacity>
              )}
              <View style={[styles.liveBadge, { backgroundColor: colours.accent + '18', borderColor: colours.accent + '40' }]}>
                <View style={[styles.liveDot, { backgroundColor: colours.accent }]} />
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>LIVE</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (editMode) { saveCustomization(sectionOrder, quickActionIds, ottawaLifeIds); }
                  setEditMode(!editMode);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: editMode ? colours.accent : colours.border, backgroundColor: editMode ? colours.accent : colours.surface }}
              >
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: editMode ? 'white' : colours.text }}>{editMode ? t('Done', 'Terminé') : t('Edit', 'Modifier')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Edit mode banner */}
          {editMode && (
            <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '40', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="reorder-three" size={18} color={colours.accent} />
              <Text style={{ flex: 1, fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>{t('Use ↑↓ arrows to reorder sections. Long press Ottawa Life tiles to swap.', 'Utilisez les flèches ↑↓ pour réorganiser. Appui long sur les tuiles pour changer.')}</Text>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colours.surface, borderColor: colours.border, color: colours.text, fontSize: fonts.lg, ...cardShadow }]}
                placeholder={t('Street name or stop number...', "Nom de rue ou numéro d'arrêt...")}
                placeholderTextColor={colours.muted}
                value={searchText}
                onChangeText={handleSearchChange}
                keyboardType="default"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colours.accent }]} onPress={handleSearch}>
                <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Go', 'Aller')}</Text>
              </TouchableOpacity>
            </View>
            {searchResults.length > 0 && (
              <View style={[styles.dropdown, { backgroundColor: colours.surface, borderColor: colours.border, ...cardShadow }]}>
                {searchResults.map(result => (
                  <TouchableOpacity key={result.internalId} style={[styles.dropdownItem, { borderBottomColor: colours.border }]} onPress={() => { Keyboard.dismiss(); loadStop(result.id, result.name); setSearchText(''); setSearchResults([]); }}>
                    <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '600', flex: 1 }}>{result.name}</Text>
                    <Text style={{ color: colours.muted, fontSize: fonts.sm, marginLeft: 8 }}>{t('Stop', 'Arrêt')} #{result.id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Arrivals board */}
          {favs.length === 0 ? (
            <View style={[styles.arrivalsCard, { borderColor: colours.border, backgroundColor: colours.surface, ...cardShadow }]}>
              <View style={[styles.boardHeader, { borderBottomColor: colours.border, borderBottomWidth: 1 }]}>
                <TouchableOpacity onPress={() => setExpandedStopId(stopId)} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{stopName}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colours.accent} />
                  </View>
                  {lastUpdated ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Updated', 'Mis à jour')} {lastUpdated} · {t('Tap to expand', 'Appuyez pour élargir')}</Text> : null}
                </TouchableOpacity>
                <View style={styles.boardActions}>
                  <TouchableOpacity style={[styles.addFavBtn, { borderColor: isFav ? colours.accent : colours.border, backgroundColor: isFav ? colours.accent + '15' : colours.surface }]} onPress={() => isFav ? removeFav(stopId) : addFav(stopId, stopName)}>
                    <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: isFav ? colours.accent : colours.muted }}>{isFav ? t('✓ Saved', '✓ Sauvegardé') : t('+ Save stop', '+ Sauvegarder')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => fetchArrivals(stopId)}>
                    <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>{t('Refresh ↺', 'Actualiser ↺')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {loading ? (
                <View style={styles.centerState}><ActivityIndicator color={colours.accent} size="large" /></View>
              ) : error ? (
                <View style={styles.centerState}>
                  <Ionicons name="wifi-outline" size={36} color={colours.muted} />
                  <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text>
                  <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colours.accent }]} onPress={() => fetchArrivals(stopId)}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Retry', 'Réessayer')}</Text>
                  </TouchableOpacity>
                </View>
              ) : arrivals.length === 0 ? (
                <View style={styles.centerState}>
                  <Ionicons name="time-outline" size={36} color={colours.muted} />
                  <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text>
                </View>
              ) : (<>
                {(showAllArrivals ? arrivals : arrivals.slice(0, 4)).map(renderArrival)}
                {arrivals.length > 4 && (
                  <TouchableOpacity onPress={() => setShowAllArrivals(v => !v)} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colours.border }}>
                    <Text style={{ color: colours.accent, fontWeight: '700', fontSize: fonts.sm }}>{showAllArrivals ? t('Show less ▲', 'Voir moins ▲') : t(`Show ${arrivals.length - 4} more ▼`, `Voir ${arrivals.length - 4} de plus ▼`)}</Text>
                  </TouchableOpacity>
                )}
              </>)}
            </View>
          ) : (<>
            {isReordering && (
              <View style={{ paddingHorizontal: 20, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Hold & drag to reorder', 'Maintenez pour réorganiser')}</Text>
                <TouchableOpacity onPress={() => setIsReordering(false)}>
                  <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '700' }}>{t('Done', 'Terminé')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <FlatList
              horizontal
              data={favs}
              keyExtractor={f => f.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ marginBottom: 12 }}
              renderItem={({ item: fav, index }) => {
                const isActiveStop = stopId === fav.id;
                const moveLeft = () => {
                  if (index === 0) return;
                  const next = [...favs];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  setFavs(next);
                  AsyncStorage.setItem('routeo_favs', JSON.stringify(next));
                };
                const moveRight = () => {
                  if (index === favs.length - 1) return;
                  const next = [...favs];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  setFavs(next);
                  AsyncStorage.setItem('routeo_favs', JSON.stringify(next));
                };
                return (
                  <View style={[styles.arrivalsCard, { width: CARD_W, marginRight: 12, marginHorizontal: 0, borderColor: isActiveStop ? colours.accent : colours.border, backgroundColor: colours.surface, ...cardShadow }]}>
                    {isReordering && (
                      <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, flexDirection: 'row', gap: 8 }}>
                        {index > 0 && <TouchableOpacity onPress={moveLeft}><Text style={{ fontSize: 18, color: colours.accent }}>←</Text></TouchableOpacity>}
                        {index < favs.length - 1 && <TouchableOpacity onPress={moveRight}><Text style={{ fontSize: 18, color: colours.accent }}>→</Text></TouchableOpacity>}
                      </View>
                    )}
                    <View style={[styles.boardHeader, { borderBottomColor: colours.border, borderBottomWidth: 1 }]}>
                      <TouchableOpacity
                        onPress={() => {
                          if (isReordering) return;
                          if (!isActiveStop) { loadStop(fav.id, fav.name); }
                          else { setExpandedStopId(fav.id); }
                        }}
                        activeOpacity={0.7}
                        style={{ flex: 1 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{fav.name}</Text>
                          {isActiveStop && <Ionicons name="chevron-forward" size={14} color={colours.accent} />}
                        </View>
                        {isActiveStop && lastUpdated
                          ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Updated', 'Mis à jour')} {lastUpdated} · {t('Tap name to expand', 'Appuyez pour élargir')}</Text>
                          : <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Tap to load arrivals', 'Appuyez pour charger')}</Text>
                        }
                      </TouchableOpacity>
                      <View style={[styles.boardActions, { opacity: isReordering ? 0.3 : 1 }]}>
                        <TouchableOpacity
                          style={[styles.addFavBtn, { borderColor: colours.accent, backgroundColor: colours.accent + '15' }]}
                          onPress={() => !isReordering && Alert.alert(t('Remove?', 'Retirer?'), fav.name, [{ text: t('Cancel', 'Annuler'), style: 'cancel' }, { text: t('Remove', 'Retirer'), style: 'destructive', onPress: () => removeFav(fav.id) }])}
                        >
                          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('✓ Saved', '✓ Sauvegardé')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => !isReordering && (loadStop(fav.id, fav.name), fetchArrivals(fav.id))}>
                          <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>{t('Refresh ↺', 'Actualiser ↺')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {!isActiveStop ? (
                      <View style={styles.centerState}>
                        <Ionicons name="hand-left-outline" size={28} color={colours.muted} />
                        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Tap stop name to load', 'Appuyez sur le nom pour charger')}</Text>
                      </View>
                    ) : loading ? (
                      <View style={styles.centerState}><ActivityIndicator color={colours.accent} size="large" /></View>
                    ) : error ? (
                      <View style={styles.centerState}>
                        <Ionicons name="wifi-outline" size={36} color={colours.muted} />
                        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('Could not load arrivals', 'Impossible de charger les arrivées')}</Text>
                        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colours.accent }]} onPress={() => fetchArrivals(fav.id)}>
                          <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Retry', 'Réessayer')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : arrivals.length === 0 ? (
                      <View style={styles.centerState}>
                        <Ionicons name="time-outline" size={36} color={colours.muted} />
                        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 8 }}>{t('No upcoming arrivals', 'Aucune arrivée prévue')}</Text>
                      </View>
                    ) : (<>
                      {arrivals.slice(0, 4).map(renderArrival)}
                      {arrivals.length > 4 && (
                        <TouchableOpacity onPress={() => setExpandedStopId(fav.id)} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colours.border }}>
                          <Text style={{ color: colours.accent, fontWeight: '700', fontSize: fonts.sm }}>{t(`See all ${arrivals.length} arrivals →`, `Voir les ${arrivals.length} arrivées →`)}</Text>
                        </TouchableOpacity>
                      )}
                    </>)}
                  </View>
                );
              }}
            />
          </>)}

          {/* Dynamic sections */}
          {sectionOrder.map(sectionId => renderSection(sectionId))}

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  nightBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  searchContainer: { paddingHorizontal: 20, marginBottom: 16, zIndex: 999 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 },
  searchBtn: { borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center' },
  dropdown: { borderWidth: 1, borderRadius: 14, marginTop: 4, overflow: 'hidden', zIndex: 999 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  stationRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
  stationDotCol: { alignItems: 'center', width: 16 },
  stationDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#6b7585', borderWidth: 2 },
  stationLine: { width: 2, height: 18, marginTop: 2 },
  addStopPrompt: { marginHorizontal: 20, marginBottom: 20, borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
  sectionLabel: { paddingHorizontal: 20, marginBottom: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600' },
  tileRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 8 },
  notifBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 14, marginHorizontal: 20, marginBottom: 20, paddingHorizontal: 16, paddingVertical: 13 },
  notifLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  notifDot: { width: 7, height: 7, borderRadius: 4 },
  arrivalsCard: { marginHorizontal: 20, borderWidth: 1, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  boardActions: { alignItems: 'flex-end', gap: 4 },
  addFavBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  ghostRow: { opacity: 0.4 },
  badge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  arrivalInfo: { flex: 1, minWidth: 0 },
  arrivalRight: { alignItems: 'flex-end', gap: 6 },
  reportBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  centerState: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  retryBtn: { marginTop: 16, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  discoverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20, marginBottom: 12 },
  cardsRow: { paddingHorizontal: 20, gap: 12, marginBottom: 24 },
  discoverCard: { width: 160, borderRadius: 14, overflow: 'hidden' },
  discoverCardImage: { width: 160, height: 200, justifyContent: 'space-between' },
  discoverCardFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  categoryBadge: { margin: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  discoverCardBottom: { padding: 10, paddingBottom: 12 },
  modalContainer: { flex: 1, paddingTop: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalClose: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalCenter: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  lrtStatusCard: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  alertCard: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4 },
  alertCatBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  routeBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
});
