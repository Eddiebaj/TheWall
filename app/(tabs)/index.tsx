import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, ImageBackground, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import stopMap from './stopmap.json';
import stopNameMap from './stopnamemap.json';
import stopsearch from './stopsearch.json';
import tripMap from './tripmap.json';

const API_KEY = 'e85c07c79cfc45f1b429ce62dcfbab30';
const UNSPLASH_KEY = 'af-d0y-v_SK3tSea1xQYM3059juIQERP5wnRQ5gul9w';
const TRIP_UPDATES = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';

// Line 1 (Confederation) stations
const LRT_EAST = [
  { id: 'NA998', name: "Tunney's Pasture" },
  { id: 'NA995', name: 'Bayview' },
  { id: 'CJ995', name: 'Pimisi' },
  { id: 'CA995', name: 'Lyon' },
  { id: 'CB995', name: 'Parliament' },
  { id: 'CD995', name: 'Rideau' },
  { id: 'CD999', name: 'uOttawa' },
  { id: 'CE995', name: 'Lees' },
  { id: 'AF995', name: 'Hurdman' },
  { id: 'AE995', name: 'Tremblay' },
  { id: 'EB995', name: 'St-Laurent' },
  { id: 'EC995', name: 'Cyrville' },
  { id: 'EE995', name: 'Blair' },
];

const LRT_WEST = [
  { id: 'EE990', name: 'Blair' },
  { id: 'EC990', name: 'Cyrville' },
  { id: 'EB990', name: 'St-Laurent' },
  { id: 'AE990', name: 'Tremblay' },
  { id: 'AF990', name: 'Hurdman' },
  { id: 'CE990', name: 'Lees' },
  { id: 'CD998', name: 'uOttawa' },
  { id: 'CD990', name: 'Rideau' },
  { id: 'CB990', name: 'Parliament' },
  { id: 'CA990', name: 'Lyon' },
  { id: 'CJ990', name: 'Pimisi' },
  { id: 'NA990', name: 'Bayview' },
  { id: 'NA999', name: "Tunney's Pasture" },
];

// Line 2 (Trillium) stations
const LRT2_NORTH = [
  { id: 'RR990',  name: 'Limebank' },
  { id: 'RE994',  name: 'Leitrim' },
  { id: 'RE990',  name: 'Uplands' },
  { id: 'RE992',  name: 'Airport' },
  { id: 'RE996',  name: 'Bowesville' },
  { id: 'RF990',  name: 'Greenboro' },
  { id: 'RF995',  name: 'South Keys' },
  { id: 'RC990',  name: 'Walkley' },
  { id: 'RA990',  name: "Mooney's Bay" },
  { id: 'CG995',  name: 'Carleton' },
  { id: 'NB990',  name: "Dow's Lake" },
  { id: 'NB995',  name: 'Corso Italia' },
  { id: 'NA996',  name: 'Bayview' },
];

const LRT2_SOUTH = [
  { id: 'NA996',  name: 'Bayview' },
  { id: 'NB996',  name: 'Corso Italia' },
  { id: 'NB990',  name: "Dow's Lake" },
  { id: 'CG990',  name: 'Carleton' },
  { id: 'RA990',  name: "Mooney's Bay" },
  { id: 'RC990',  name: 'Walkley' },
  { id: 'RF996',  name: 'South Keys' },
  { id: 'RF990',  name: 'Greenboro' },
  { id: 'RE997',  name: 'Bowesville' },
  { id: 'RE992',  name: 'Airport' },
  { id: 'RE991',  name: 'Uplands' },
  { id: 'RE995',  name: 'Leitrim' },
  { id: 'RR990',  name: 'Limebank' },
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

const QUICK_ACTIONS = [
  { id: 'live', label_en: 'Live\nBuses', label_fr: 'Bus\nen direct', icon: 'bus', accent: '#00A78D' },
  { id: 'plan', label_en: 'Plan\nTrip', label_fr: 'Planifier\ntrajet', icon: 'map', accent: '#004890' },
  { id: 'safety', label_en: 'Safety\nMode', label_fr: 'Mode\nsécurité', icon: 'shield', accent: '#00A78D' },
  { id: 'alerts', label_en: 'Service\nAlerts', label_fr: 'Alertes\nservice', icon: 'notifications', accent: '#e8a020' },
];

const OTTAWA_LIFE = [
  { id: 'coffee', label_en: 'Coffee', label_fr: 'Café', icon: 'cafe', accent: '#c0852a', desc_en: 'Bridgehead & local cafes', desc_fr: 'Bridgehead & cafés locaux' },
  { id: 'eats', label_en: 'Eats', label_fr: 'Restos', icon: 'restaurant', accent: '#cc3b2a', desc_en: 'Local Ottawa restaurants', desc_fr: "Restaurants locaux d'Ottawa" },
  { id: 'shopping', label_en: 'Shopping', label_fr: 'Magasins', icon: 'bag-handle', accent: '#004890', desc_en: 'Shops near your stop', desc_fr: 'Boutiques près de votre arrêt' },
  { id: 'events', label_en: 'Events', label_fr: 'Événements', icon: 'sparkles', accent: '#7b5ea7', desc_en: 'Lansdowne, ByWard & NCC', desc_fr: 'Lansdowne, ByWard et CCN' },
];

const DISCOVER_CARDS = [
  { id: '1', title_en: 'Parliament Hill', title_fr: 'Colline du Parlement', category_en: 'Landmark', category_fr: 'Monument', query: 'parliament hill ottawa peace tower', accent: '#00A78D' },
  { id: '2', title_en: 'ByWard Market', title_fr: 'Marché ByWard', category_en: 'Local Favourite', category_fr: 'Favori local', query: '', photoUrl: 'https://images.unsplash.com/photo-1683917276588-7b6d28d43ee3?w=600', accent: '#c0852a' },
  { id: '3', title_en: 'Rideau Canal', title_fr: 'Canal Rideau', category_en: 'Outdoors', category_fr: 'Plein air', query: 'rideau canal ottawa', accent: '#004890' },
  { id: '4', title_en: 'Lansdowne Park', title_fr: 'Parc Lansdowne', category_en: 'Events', category_fr: 'Événements', query: 'TD Place Lansdowne Ottawa stadium', accent: '#7b5ea7' },
  { id: '5', title_en: "Major's Hill Park", title_fr: "Parc Major's Hill", category_en: 'Outdoors', category_fr: 'Plein air', query: 'majors hill park ottawa', accent: '#00A78D' },
];

type Arrival = { id: string; routeId: string; headsign: string; minsAway: number; delay: number; secsAway: number };
type Fav = { id: string; name: string; icon: string };
type Reports = { [key: string]: number };
type StopResult = { id: string; internalId: string; name: string };

const STOP_MAP: { [key: string]: string } = stopMap;
const TRIP_MAP: { [key: string]: string } = tripMap;
const STOP_NAME_MAP: { [key: string]: string } = stopNameMap;
const STOP_SEARCH: StopResult[] = stopsearch as StopResult[];

const resolveStopId = (publicCode: string) => STOP_MAP[String(parseInt(publicCode))] || publicCode;
const getStopName = (publicCode: string) => STOP_NAME_MAP[resolveStopId(publicCode)] || `Stop #${publicCode}`;
const getHeadsign = (tripId: string) => TRIP_MAP[tripId] || '';

export default function LiveScreen() {
  const { colours, theme, language, t, fonts } = useApp();
  const [stopId, setStopId] = useState('CD995');
  const [stopName, setStopName] = useState('Rideau');
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<StopResult[]>([]);
  const [reports, setReports] = useState<Reports>({});
  const [favs, setFavs] = useState<Fav[]>([]);
  const [showLine1, setShowLine1] = useState(false);
  const [showLine2, setShowLine2] = useState(false);
  const [showEast, setShowEast] = useState(false);
  const [showWest, setShowWest] = useState(false);
  const [showNorth, setShowNorth] = useState(false);
  const [showSouth, setShowSouth] = useState(false);
  const [discoverPhotos, setDiscoverPhotos] = useState<{ [id: string]: string }>({});

  const isLight = theme === 'light' || (theme === 'system' && colours.bg === '#f0f4f8');

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  const subtleShadow = isLight ? {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  } : {};

  useEffect(() => {
    AsyncStorage.getItem('routeo_favs').then(val => { if (val) setFavs(JSON.parse(val)); });
    fetchArrivals('CD995');
    fetchDiscoverPhotos();
  }, []);

  const fetchDiscoverPhotos = async () => {
    const photos: { [id: string]: string } = {};
    await Promise.all(DISCOVER_CARDS.map(async card => {
      try {
        const resp = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(card.query)}&per_page=1&orientation=landscape`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
        );
        const data = await resp.json();
        if (data.results?.[0]?.urls?.regular) {
          photos[card.id] = data.results[0].urls.regular;
        }
      } catch { /* keep empty, fallback renders */ }
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

  const fetchArrivals = useCallback(async (id: string) => {
    try {
      setError('');
      const isNumericOnly = /^\d+$/.test(id);
      const internalId = isNumericOnly ? resolveStopId(id) : id;
      const resp = await fetch(TRIP_UPDATES, { headers: { 'Ocp-Apim-Subscription-Key': API_KEY } });
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();

      // DEBUG - remove after testing
      const lrtStops: string[] = [];
      for (const ent of (data?.Entity || [])) {
        const tu = ent.TripUpdate;
        if (!tu) continue;
        const route = tu.Trip?.RouteId || '';
        for (const stu of (tu.StopTimeUpdate || [])) {
          if (route.includes('350') || route.includes('354') || route === '1' || route === '2') {
            const entry = `Route:${route} Stop:${stu.StopId}`;
            if (!lrtStops.includes(entry)) lrtStops.push(entry);
          }
        }
      }
      Alert.alert('LRT Debug', lrtStops.slice(0, 10).join('\n') || 'No LRT trips in feed right now');

      setArrivals(parseGTFS(data, internalId));
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
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
        results.push({
          id: tripId || String(Math.random()),
          routeId: trip.RouteId || '?',
          headsign: getHeadsign(tripId),
          minsAway: Math.max(0, Math.round(secsAway / 60)),
          delay: Math.round((arr.Delay || 0) / 60),
          secsAway,
        });
      }
    }
    return results.sort((a, b) => a.secsAway - b.secsAway).slice(0, 8);
  };

  const loadStop = (id: string, name?: string) => {
    setStopId(id); setStopName(name || getStopName(id) || id);
    setLoading(true); fetchArrivals(id);
  };

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

  const reportBusPassed = (arrivalId: string) => {
    setReports(prev => ({ ...prev, [arrivalId]: (prev[arrivalId] || 0) + 1 }));
    Alert.alert(t('Thanks!', 'Merci!'), t('Reported — helps other riders.', 'Signalé — aide les autres usagers.'));
  };

  const isNight = new Date().getHours() >= 21;
  const isFav = favs.find(f => f.id === stopId);

  const renderArrival = (item: Arrival) => {
    const isLRT = item.routeId === '1-350' || item.routeId === '2-354' || item.routeId === '1' || item.routeId === '2';
    const reportCount = reports[item.id] || 0;
    const ghostBus = reportCount >= 2;
    return (
      <View key={item.id} style={[
        styles.arrivalRow,
        { borderBottomColor: colours.border, backgroundColor: colours.surface },
        ghostBus && styles.ghostRow
      ]}>
        <View style={[styles.badge, { backgroundColor: isLRT ? colours.accentAlt + '18' : colours.accent + '18' }]}>
          <Text style={{ fontWeight: '800', fontSize: fonts.md, color: isLRT ? colours.lrt : colours.accent }}>
            {item.routeId}
          </Text>
        </View>
        <View style={styles.arrivalInfo}>
          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
            {isLRT ? 'O-Train' : `${t('Route', 'Route')} ${item.routeId}`}
            {item.delay > 0 ? <Text style={{ color: colours.orange, fontSize: fonts.sm }}> (+{item.delay}m {t('late', 'retard')})</Text> : null}
            {ghostBus ? <Text style={{ color: colours.muted, fontSize: fonts.sm }}> {t('Ghost bus', 'Bus fantôme')}</Text> : null}
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }} numberOfLines={1}>
            {item.headsign ? `→ ${item.headsign}` : `→ ${t('Checking route...', 'Vérification...')}`}
          </Text>
          {reportCount > 0 && (
            <Text style={{ fontSize: fonts.sm, color: colours.orange, marginTop: 3 }}>
              {reportCount} {t(reportCount > 1 ? 'riders say passed' : 'rider says passed', reportCount > 1 ? 'usagers disent passé' : 'usager dit passé')}
            </Text>
          )}
        </View>
        <View style={styles.arrivalRight}>
          <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: item.minsAway <= 2 ? colours.red : colours.accent }}>
            {item.minsAway === 0 ? t('Due', 'Imminent') : `${item.minsAway}m`}
          </Text>
          <TouchableOpacity
            style={[styles.reportBtn, { borderColor: colours.border, backgroundColor: colours.card }]}
            onPress={() => reportBusPassed(item.id)}>
            <Text style={{ fontSize: fonts.sm, color: colours.orange, fontWeight: '600' }}>{t('Passed?', 'Passé?')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDiscoverCard = (card: typeof DISCOVER_CARDS[0]) => {
    const photoUrl = (card as any).photoUrl || discoverPhotos[card.id];
    const title = language === 'fr' ? card.title_fr : card.title_en;
    const category = language === 'fr' ? card.category_fr : card.category_en;
    return (
      <TouchableOpacity
        key={card.id}
        style={[styles.discoverCard, { overflow: 'hidden' }, cardShadow]}
        onPress={() => Alert.alert(title, `${category}\n\n${t('Coming soon!', 'Bientôt disponible!')}`)}
        activeOpacity={0.92}
      >
        <ImageBackground
          source={photoUrl ? { uri: photoUrl } : undefined}
          style={styles.discoverCardImage}
          resizeMode="cover"
        >
          {!photoUrl && (
            <View style={[styles.discoverCardFallback, { backgroundColor: card.accent + '22' }]}>
              <ActivityIndicator color={card.accent} size="small" />
            </View>
          )}
          {photoUrl && (
            <>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.12)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 75, backgroundColor: 'rgba(0,0,0,0.20)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, backgroundColor: 'rgba(0,0,0,0.22)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: 'rgba(0,0,0,0.18)' }} />
            </>
          )}
          <View style={[styles.categoryBadge, { backgroundColor: card.accent }]}>
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {category}
            </Text>
          </View>
          {photoUrl && (
            <View style={styles.discoverCardBottom}>
              <Text numberOfLines={2} style={{ color: 'white', fontSize: fonts.md, fontWeight: '800', lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
                {title}
              </Text>
            </View>
          )}
        </ImageBackground>
        {!photoUrl && (
          <View style={{ padding: 10 }}>
            <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{title}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setSearchResults([]); }}>
        <View style={[styles.container, { backgroundColor: colours.bg }]}>
          <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
                  Route<Text style={{ color: colours.accent }}>O</Text>
                </Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
                  OC TRANSPO · OTTAWA
                </Text>
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
                <View style={[styles.liveBadge, { backgroundColor: colours.accent + '18', borderColor: colours.accent + '40' }]}>
                  <View style={[styles.liveDot, { backgroundColor: colours.accent }]} />
                  <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>LIVE</Text>
                </View>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.searchInput, {
                    backgroundColor: colours.surface,
                    borderColor: colours.border,
                    color: colours.text,
                    fontSize: fonts.lg,
                    ...cardShadow,
                  }]}
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
                    <TouchableOpacity
                      key={result.internalId}
                      style={[styles.dropdownItem, { borderBottomColor: colours.border }]}
                      onPress={() => { Keyboard.dismiss(); loadStop(result.id, result.name); setSearchText(''); setSearchResults([]); }}
                    >
                      <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '600', flex: 1 }}>{result.name}</Text>
                      <Text style={{ color: colours.muted, fontSize: fonts.sm, marginLeft: 8 }}>{t('Stop', 'Arrêt')} #{result.id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* O-Train Lines */}
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
              {t('O-Train', 'O-Train')}
            </Text>

            {/* Line 1 accordion header */}
            <TouchableOpacity
              style={[{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                marginHorizontal: 20, marginBottom: showLine1 ? 0 : 10,
                borderWidth: 1, borderRadius: showLine1 ? 16 : 16,
                borderBottomLeftRadius: showLine1 ? 0 : 16,
                borderBottomRightRadius: showLine1 ? 0 : 16,
                padding: 14,
                backgroundColor: showLine1 ? colours.lrt + '12' : colours.surface,
                borderColor: showLine1 ? colours.lrt : colours.border,
              }, cardShadow]}
              onPress={() => { setShowLine1(!showLine1); setShowLine2(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.lrt + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: colours.lrt }}>L1</Text>
                </View>
                <View>
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine1 ? colours.lrt : colours.text }}>
                    {t('Confederation Line', 'Ligne Confédération')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                    {t("Tunney's Pasture ↔ Blair", "Tunney's ↔ Blair")}
                  </Text>
                </View>
              </View>
              <Ionicons name={showLine1 ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
            </TouchableOpacity>

            {showLine1 && (
              <View style={[{
                marginHorizontal: 20, marginBottom: 10,
                borderWidth: 1, borderTopWidth: 0,
                borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                backgroundColor: colours.surface, borderColor: colours.lrt,
                overflow: 'hidden',
              }, cardShadow]}>
                {/* Direction buttons */}
                <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8 }}>
                  {[
                    { label: t('Eastbound', 'Est'), sub: "→ Blair", active: showEast, onPress: () => { setShowEast(!showEast); setShowWest(false); } },
                    { label: t('Westbound', 'Ouest'), sub: "→ Tunney's", active: showWest, onPress: () => { setShowWest(!showWest); setShowEast(false); } },
                  ].map((dir, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
                        backgroundColor: dir.active ? colours.lrt + '15' : colours.bg,
                        borderColor: dir.active ? colours.lrt : colours.border,
                      }}
                      onPress={dir.onPress}
                    >
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: dir.active ? colours.lrt : colours.text }}>{dir.label}</Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{dir.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {showEast && LRT_EAST.map((station, index) => (
                  <TouchableOpacity
                    key={station.id}
                    style={[styles.stationRow, { borderBottomColor: colours.border },
                      stopId === station.id && { backgroundColor: colours.lrt + '12' }]}
                    onPress={() => { loadStop(station.id, station.name); setShowLine1(false); setShowEast(false); }}
                  >
                    <View style={styles.stationDotCol}>
                      <View style={[styles.stationDot, { borderColor: colours.border },
                        stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />
                      {index < LRT_EAST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>
                      {station.name}
                    </Text>
                    {stopId === station.id && <Text style={{ fontSize: fonts.sm, color: colours.lrt, fontWeight: '700' }}>{t('Viewing', 'En vue')}</Text>}
                  </TouchableOpacity>
                ))}

                {showWest && LRT_WEST.map((station, index) => (
                  <TouchableOpacity
                    key={station.id}
                    style={[styles.stationRow, { borderBottomColor: colours.border },
                      stopId === station.id && { backgroundColor: colours.lrt + '12' }]}
                    onPress={() => { loadStop(station.id, station.name); setShowLine1(false); setShowWest(false); }}
                  >
                    <View style={styles.stationDotCol}>
                      <View style={[styles.stationDot, { borderColor: colours.border },
                        stopId === station.id && { backgroundColor: colours.lrt, borderColor: colours.lrt }]} />
                      {index < LRT_WEST.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? colours.lrt : colours.text }}>
                      {station.name}
                    </Text>
                    {stopId === station.id && <Text style={{ fontSize: fonts.sm, color: colours.lrt, fontWeight: '700' }}>{t('Viewing', 'En vue')}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Line 2 accordion header */}
            <TouchableOpacity
              style={[{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                marginHorizontal: 20, marginBottom: showLine2 ? 0 : 16,
                borderWidth: 1, borderRadius: 16,
                borderBottomLeftRadius: showLine2 ? 0 : 16,
                borderBottomRightRadius: showLine2 ? 0 : 16,
                padding: 14,
                backgroundColor: showLine2 ? '#7b5ea7' + '12' : colours.surface,
                borderColor: showLine2 ? '#7b5ea7' : colours.border,
              }, cardShadow]}
              onPress={() => { setShowLine2(!showLine2); setShowLine1(false); setShowEast(false); setShowWest(false); setShowNorth(false); setShowSouth(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#7b5ea7' }}>L2</Text>
                </View>
                <View>
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: showLine2 ? '#7b5ea7' : colours.text }}>
                    {t('Trillium Line', 'Ligne Trillium')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                    {t('Bayview ↔ Limebank', 'Bayview ↔ Limebank')}
                  </Text>
                </View>
              </View>
              <Ionicons name={showLine2 ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
            </TouchableOpacity>

            {showLine2 && (
              <View style={[{
                marginHorizontal: 20, marginBottom: 16,
                borderWidth: 1, borderTopWidth: 0,
                borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                backgroundColor: colours.surface, borderColor: '#7b5ea7',
                overflow: 'hidden',
              }, cardShadow]}>
                {/* Direction buttons */}
                <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8 }}>
                  {[
                    { label: t('Northbound', 'Nord'), sub: '→ Bayview', active: showNorth, onPress: () => { setShowNorth(!showNorth); setShowSouth(false); } },
                    { label: t('Southbound', 'Sud'), sub: '→ Limebank', active: showSouth, onPress: () => { setShowSouth(!showSouth); setShowNorth(false); } },
                  ].map((dir, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
                        backgroundColor: dir.active ? '#7b5ea7' + '15' : colours.bg,
                        borderColor: dir.active ? '#7b5ea7' : colours.border,
                      }}
                      onPress={dir.onPress}
                    >
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: dir.active ? '#7b5ea7' : colours.text }}>{dir.label}</Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{dir.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {showNorth && LRT2_NORTH.map((station, index) => (
                  <TouchableOpacity
                    key={station.id + index}
                    style={[styles.stationRow, { borderBottomColor: colours.border },
                      stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]}
                    onPress={() => { loadStop(station.id, station.name); setShowLine2(false); setShowNorth(false); }}
                  >
                    <View style={styles.stationDotCol}>
                      <View style={[styles.stationDot, { borderColor: colours.border },
                        stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />
                      {index < LRT2_NORTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>
                      {station.name}
                    </Text>
                    {stopId === station.id && <Text style={{ fontSize: fonts.sm, color: '#7b5ea7', fontWeight: '700' }}>{t('Viewing', 'En vue')}</Text>}
                  </TouchableOpacity>
                ))}

                {showSouth && LRT2_SOUTH.map((station, index) => (
                  <TouchableOpacity
                    key={station.id + index}
                    style={[styles.stationRow, { borderBottomColor: colours.border },
                      stopId === station.id && { backgroundColor: '#7b5ea7' + '12' }]}
                    onPress={() => { loadStop(station.id, station.name); setShowLine2(false); setShowSouth(false); }}
                  >
                    <View style={styles.stationDotCol}>
                      <View style={[styles.stationDot, { borderColor: colours.border },
                        stopId === station.id && { backgroundColor: '#7b5ea7', borderColor: '#7b5ea7' }]} />
                      {index < LRT2_SOUTH.length - 1 && <View style={[styles.stationLine, { backgroundColor: colours.border }]} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: stopId === station.id ? '700' : '500', color: stopId === station.id ? '#7b5ea7' : colours.text }}>
                      {station.name}
                    </Text>
                    {stopId === station.id && <Text style={{ fontSize: fonts.sm, color: '#7b5ea7', fontWeight: '700' }}>{t('Viewing', 'En vue')}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Favourites */}
            {favs.length > 0 ? (
              <>
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {t('Saved Stops', 'Arrêts sauvegardés')}
                </Text>
                <FlatList
                  horizontal data={favs} keyExtractor={f => f.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.favsRow}
                  renderItem={({ item: fav }) => (
                    <TouchableOpacity
                      style={[styles.favChip, {
                        backgroundColor: stopId === fav.id ? colours.accent : colours.surface,
                        borderColor: stopId === fav.id ? colours.accent : colours.border,
                        ...subtleShadow,
                      }]}
                      onPress={() => loadStop(fav.id, fav.name)}
                      onLongPress={() => Alert.alert(t('Remove?', 'Retirer?'), fav.name, [
                        { text: t('Cancel', 'Annuler'), style: 'cancel' },
                        { text: t('Remove', 'Retirer'), style: 'destructive', onPress: () => removeFav(fav.id) }
                      ])}
                    >
                      <Ionicons name="star" size={12} color={stopId === fav.id ? 'white' : colours.accent} />
                      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: stopId === fav.id ? 'white' : colours.text }}>
                        {fav.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <TouchableOpacity
                style={[styles.addStopPrompt, { borderColor: colours.accent + '40' }]}
                onPress={() => Alert.alert(t('Save a stop', 'Sauvegarder un arrêt'), t('Search for any stop and tap "+ Save" to add it here.', 'Cherchez un arrêt et appuyez sur "+ Sauvegarder".'))}>
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '600' }}>
                  + {t('Add a favourite stop', 'Ajouter un arrêt favori')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Quick Actions */}
            <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm }]}>{t('Quick Actions', 'Actions rapides')}</Text>
            <View style={styles.tileRow}>
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.id}
                  style={[styles.tile, {
                    backgroundColor: colours.surface,
                    borderColor: colours.border,
                    borderTopWidth: 3,
                    borderTopColor: action.accent,
                    ...cardShadow,
                  }]}
                  onPress={() => Alert.alert(language === 'fr' ? action.label_fr : action.label_en, t('Coming soon!', 'Bientôt disponible!'))}>
                  <Ionicons name={action.icon as any} size={24} color={action.accent} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, textAlign: 'center', lineHeight: 16 }}>
                    {language === 'fr' ? action.label_fr : action.label_en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ottawa Life */}
            <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm }]}>{t('Ottawa Life', 'Vie à Ottawa')}</Text>
            <View style={styles.tileRow}>
              {OTTAWA_LIFE.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.tile, {
                    backgroundColor: colours.surface,
                    borderColor: colours.border,
                    borderTopWidth: 3,
                    borderTopColor: item.accent,
                    ...cardShadow,
                  }]}
                  onPress={() => Alert.alert(language === 'fr' ? item.label_fr : item.label_en, `${language === 'fr' ? item.desc_fr : item.desc_en}\n\n${t('Coming soon!', 'Bientôt disponible!')}`)}>
                  <Ionicons name={item.icon as any} size={24} color={item.accent} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, textAlign: 'center', lineHeight: 16 }}>
                    {language === 'fr' ? item.label_fr : item.label_en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Service Alerts */}
            <TouchableOpacity
              style={[styles.notifBar, { backgroundColor: colours.surface, borderColor: colours.border, ...cardShadow }]}
              onPress={() => Alert.alert(t('Service Alerts', 'Alertes de service'), t('No active alerts on OC Transpo right now.', 'Aucune alerte active sur OC Transpo en ce moment.'))}>
              <View style={styles.notifLeft}>
                <View style={[styles.notifDot, { backgroundColor: colours.accent }]} />
                <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '500' }}>{t('No active service alerts', 'Aucune alerte de service active')}</Text>
              </View>
              <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '600' }}>{t('View all →', 'Voir tout →')}</Text>
            </TouchableOpacity>

            {/* Live Arrivals */}
            <View style={[styles.arrivalsCard, { backgroundColor: colours.surface, borderColor: colours.border, ...cardShadow }]}>
              <View style={styles.boardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }} numberOfLines={1}>{stopName}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t('Stop', 'Arrêt')} #{stopId}</Text>
                </View>
                <View style={styles.boardActions}>
                  {!isFav && (
                    <TouchableOpacity
                      style={[styles.addFavBtn, { backgroundColor: colours.accent, borderColor: colours.accent }]}
                      onPress={() => addFav(stopId, stopName)}>
                      <Text style={{ color: 'white', fontSize: fonts.sm, fontWeight: '700' }}>{t('+ Save', '+ Sauvegarder')}</Text>
                    </TouchableOpacity>
                  )}
                  {lastUpdated ? <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text> : null}
                </View>
              </View>
              {loading ? (
                <View style={styles.centerState}>
                  <ActivityIndicator color={colours.accent} size="large" />
                  <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 12 }}>
                    {t('Fetching live arrivals...', 'Chargement des arrivées...')}
                  </Text>
                </View>
              ) : error ? (
                <View style={styles.centerState}>
                  <Text style={{ color: colours.red, fontSize: fonts.md, textAlign: 'center' }}>Error: {error}</Text>
                  <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colours.accent }]} onPress={() => fetchArrivals(stopId)}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Retry', 'Réessayer')}</Text>
                  </TouchableOpacity>
                </View>
              ) : arrivals.length === 0 ? (
                <View style={styles.centerState}>
                  <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center' }}>
                    {t('No arrivals in the next 90 min', 'Aucune arrivée dans les 90 prochaines min')}
                  </Text>
                  <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 6 }}>
                    {t('Try an LRT station above', 'Essayez une station LRT ci-dessus')}
                  </Text>
                </View>
              ) : arrivals.map(item => renderArrival(item))}
            </View>

            {/* Discover Ottawa */}
            <View style={styles.discoverHeader}>
              <Text style={[styles.sectionLabel, { color: colours.muted, fontSize: fonts.sm, marginBottom: 0 }]}>
                {t('Discover Ottawa', 'Découvrir Ottawa')}
              </Text>
              <TouchableOpacity onPress={() => Alert.alert(t('Discover', 'Découvrir'), t('More coming soon!', 'Plus à venir!'))}>
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '600' }}>{t('See all →', 'Voir tout →')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
              {DISCOVER_CARDS.map(card => renderDiscoverCard(card))}
            </ScrollView>

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
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
  lrtHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  lrtBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dirRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  dirBtn: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, gap: 3 },
  stationList: { marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  stationRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
  stationDotCol: { alignItems: 'center', width: 16 },
  stationDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#6b7585', borderWidth: 2 },
  stationLine: { width: 2, height: 18, marginTop: 2 },
  favsRow: { paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  favChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addStopPrompt: { marginHorizontal: 20, marginBottom: 20, borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
  sectionLabel: { paddingHorizontal: 20, marginBottom: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600' },
  tileRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 8 },
  notifBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 14, marginHorizontal: 20, marginBottom: 20, paddingHorizontal: 16, paddingVertical: 13 },
  notifLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifDot: { width: 7, height: 7, borderRadius: 4 },
  arrivalsCard: { marginHorizontal: 20, borderWidth: 1, borderRadius: 16, marginBottom: 24, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  boardActions: { alignItems: 'flex-end', gap: 4 },
  addFavBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  ghostRow: { opacity: 0.4 },
  badge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  arrivalInfo: { flex: 1, minWidth: 0 },
  arrivalRight: { alignItems: 'flex-end', gap: 6 },
  reportBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  centerState: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  retryBtn: { marginTop: 16, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  discoverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20, marginBottom: 12 },
  cardsRow: { paddingHorizontal: 20, gap: 12, marginBottom: 24 },
  discoverCard: { width: 160, borderRadius: 14, overflow: 'hidden' },
  discoverCardImage: { width: 160, height: 200, justifyContent: 'space-between' },
  discoverCardFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  categoryBadge: { margin: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  discoverCardBottom: { padding: 10, paddingBottom: 12 },
});
