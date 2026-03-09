import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Linking,
  ScrollView, StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useApp } from '../../context/AppContext';

const VEHICLES_URL    = 'https://routeo-backend.vercel.app/api/vehicles';
const EBEVENTS_URL    = 'https://routeo-backend.vercel.app/api/ebevents';
const TM_KEY          = 'pMuGA4GIB29yxOAKrDb9Vxa3tXhXpak1';

const OTTAWA_REGION: Region = {
  latitude: 45.4215, longitude: -75.6972,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};

type Bus = {
  id: string; routeId: string; lat: number; lng: number;
  fromStop: string; toStop: string; progress: number;
};

type MapEvent = {
  id: string; name: string; date: string; time?: string;
  venue: string; address?: string; url: string;
  image?: string; category?: string; free?: boolean;
  source: 'ticketmaster' | 'eventbrite';
  lat?: number; lng?: number;
};

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

const CATEGORY_COLORS: { [key: string]: string } = {
  'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
  'Health': '#0077b6', 'Sports': '#004890', 'Business': '#444',
  'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a',
  'Hobbies': '#7b5ea7',
};
const getCatColor = (cat?: string) => CATEGORY_COLORS[cat || ''] || '#555';

// ── Today filter ─────────────────────────────────────────────────
const getTodayStr = () => {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD in ET
};

// ── Grid-based clustering ─────────────────────────────────────────
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

// ── Module-level event cache (persists for app session) ──────────
let _eventsCache: MapEvent[] | null = null;
let _eventsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const fetchAllEvents = async (): Promise<MapEvent[]> => {
  if (_eventsCache && Date.now() - _eventsCacheTime < CACHE_TTL) return _eventsCache;

  const [tmResp, ebResp] = await Promise.allSettled([
    fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&city=Ottawa&countryCode=CA&size=20&sort=date,asc`),
    fetch(EBEVENTS_URL),
  ]);

  let events: MapEvent[] = [];

  // Ticketmaster — coords come from API directly
  if (tmResp.status === 'fulfilled' && tmResp.value.ok) {
    const d = await tmResp.value.json();
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

  // Eventbrite — coords pre-geocoded server-side, just use them
  if (ebResp.status === 'fulfilled' && ebResp.value.ok) {
    const d = await ebResp.value.json();
    const ebEvents: MapEvent[] = (d.events || [])
      .filter((e: any) => e.lat && e.lng)
      .map((e: any) => ({
        id: 'eb_' + e.id,
        name: e.name,
        date: e.date,
        time: e.time,
        venue: e.venue,
        address: e.address,
        url: e.url,
        image: e.image,
        category: e.category,
        free: e.free,
        source: 'eventbrite' as const,
        lat: e.lat,
        lng: e.lng,
      }));
    events.push(...ebEvents);
  }

  _eventsCache = events;
  _eventsCacheTime = Date.now();
  return events;
};

export default function MapScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';
  const mapRef = useRef<MapView>(null);

  const [buses, setBuses] = useState<Bus[]>([]);
  const [busLoading, setBusLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null);
  const [filter, setFilter] = useState<'all' | 'bus'>('all');
  const [showEvents, setShowEvents] = useState(true);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<MapEvent[] | null>(null);
  const [region, setRegion] = useState<Region>(OTTAWA_REGION);
  const [error, setError] = useState('');
  const [markersReady, setMarkersReady] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  const openSheet = (bus?: Bus, event?: MapEvent, clusterEvs?: MapEvent[]) => {
    if (bus) { setSelectedBus(bus); setSelectedEvent(null); setSelectedCluster(null); }
    if (event) { setSelectedEvent(event); setSelectedBus(null); setSelectedCluster(null); }
    if (clusterEvs) { setSelectedCluster(clusterEvs); setSelectedBus(null); setSelectedEvent(null); }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const hideSheet = () => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null);
    });
  };

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  const fetchBuses = async () => {
    try {
      const resp = await fetch(`${VEHICLES_URL}?t=${Date.now()}`, { headers: { 'Accept': 'application/json' } });
      const data = await resp.json();
      setBuses((data.vehicles || []).slice(0, 30));
      setError('');
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      setTimeout(() => setMarkersReady(true), 500);    } catch (e) { setError(String(e)); }
    finally { setBusLoading(false); }
  };

  useEffect(() => {
    fetchBuses();
    const interval = setInterval(fetchBuses, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showEvents) return;
    const t = setTimeout(() => {
      setEventsLoading(true);
      fetchAllEvents().then(evs => { setEvents(evs); setEventsLoading(false); });
    }, 5000); // wait for buses to render first
    return () => clearTimeout(t);
  }, [showEvents]);

  const filteredBuses = buses.filter((b: Bus) => {
    if (filter === 'bus') return !isLRT(b.routeId);
    return true; // 'all' shows buses + LRT
  });

  const centerOnOttawa = () => mapRef.current?.animateToRegion(OTTAWA_REGION, 600);

  const hasSheet = selectedBus || selectedEvent || selectedCluster;

  // Upcoming events (today + next 2 days) + clustering
  const getUpcomingDates = () => {
    const dates = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.add(d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
    }
    return dates;
  };
  const upcomingDates = getUpcomingDates();
  const todayEvents = events.filter(e => upcomingDates.has(e.date));
  const clusters = clusterEvents(todayEvents, region.latitudeDelta);

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={OTTAWA_REGION}
        userInterfaceStyle={isLight ? 'light' : 'dark'}
        showsUserLocation
        showsCompass={false}
        onPress={() => hasSheet && hideSheet()}
        onRegionChangeComplete={(r) => setRegion(r)}
      >
        {/* Bus markers */}
        {filteredBuses.map((bus: Bus) => {
          const colour = getRouteColour(bus.routeId);
          const lrt = isLRT(bus.routeId);
          return (
            <Marker key={bus.id} coordinate={{ latitude: bus.lat, longitude: bus.lng }}
              onPress={() => openSheet(bus)} anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}>
              <View style={{
                backgroundColor: colour, borderRadius: lrt ? 8 : 12,
                paddingHorizontal: lrt ? 7 : 6, paddingVertical: lrt ? 4 : 3,
                borderWidth: 2, borderColor: 'white',
                shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 }, elevation: 4,
                minWidth: 28, alignItems: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: lrt ? 11 : 10, fontWeight: '800' }}>
                  {lrt ? '🚊' : bus.routeId.split('-')[0]}
                </Text>
              </View>
            </Marker>
          );
        })}

        {/* Event cluster markers */}
        {showEvents && clusters.map((cluster) => {
          const single = cluster.count === 1 ? cluster.events[0] : null;
          const color = single
            ? (single.source === 'ticketmaster' ? '#026CDF' : getCatColor(single.category))
            : '#026CDF';
          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              onPress={() => cluster.count > 1 ? openSheet(undefined, undefined, cluster.events) : openSheet(undefined, single!)}
              anchor={{ x: 0.5, y: 1.0 }}
              tracksViewChanges={false}
            >
              <View style={{ alignItems: 'center' }}>
                {cluster.count > 1 ? (
                  // Cluster bubble
                  <View style={{
                    backgroundColor: '#026CDF',
                    borderRadius: 20, width: 40, height: 40,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2.5, borderColor: 'white',
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 }, elevation: 5,
                  }}>
                    <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }}>{cluster.count}</Text>
                  </View>
                ) : region.latitudeDelta > 0.04 ? (
                  // Zoomed out — simple dot pin, no card
                  <View style={{
                    width: 14, height: 14, borderRadius: 7,
                    backgroundColor: color,
                    borderWidth: 2, borderColor: 'white',
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 }, elevation: 4,
                  }} />
                ) : (
                  // Zoomed in — mini card with tail
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      backgroundColor: color, borderRadius: 10,
                      paddingHorizontal: 8, paddingVertical: 5,
                      maxWidth: 140, minWidth: 60,
                      borderWidth: 2, borderColor: 'white',
                      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 }, elevation: 5,
                    }}>
                      <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }} numberOfLines={2}>
                        {single!.name.length > 30 ? single!.name.slice(0, 28) + '…' : single!.name}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 8, marginTop: 1 }}>
                        {single!.source === 'ticketmaster' ? '🎟' : '📅'} Today
                      </Text>
                    </View>
                    <View style={{
                      width: 0, height: 0,
                      borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
                      borderLeftColor: 'transparent', borderRightColor: 'transparent',
                      borderTopColor: color,
                    }} />
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Header */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
        backgroundColor: isLight ? 'rgba(240,244,248,0.92)' : 'rgba(15,20,30,0.92)',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
              Route<Text style={{ color: colours.accent }}>O</Text>
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
              {t('LIVE MAP', 'CARTE EN DIRECT')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {busLoading ? <ActivityIndicator color={colours.accent} size="small" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>
                  {filteredBuses.length} {t('buses', 'bus')}
                </Text>
              </View>
            )}
            {lastUpdated ? <Text style={{ fontSize: 10, color: colours.muted }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text> : null}
          </View>
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {([
            { key: 'all', label_en: 'All', label_fr: 'Tous' },
            { key: 'bus', label_en: 'Bus', label_fr: 'Bus' },
          ] as const).map(f => (
            <TouchableOpacity key={f.key}
              style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: filter === f.key ? colours.accent : colours.surface, borderWidth: 1, borderColor: filter === f.key ? colours.accent : colours.border }}
              onPress={() => setFilter(f.key)}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: filter === f.key ? 'white' : colours.muted }}>
                {t(f.label_en, f.label_fr)}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Events toggle */}
          <TouchableOpacity
            style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: showEvents ? '#026CDF' : colours.surface, borderWidth: 1, borderColor: showEvents ? '#026CDF' : colours.border }}
            onPress={() => setShowEvents((v: boolean) => !v)}>
            {eventsLoading
              ? <ActivityIndicator size="small" color="white" />
              : <Ionicons name="ticket-outline" size={13} color={showEvents ? 'white' : colours.muted} />}
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: showEvents ? 'white' : colours.muted }}>
              {t('Today', 'Aujourd\'hui')} {!eventsLoading && todayEvents.length > 0 ? `(${todayEvents.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={{ fontSize: 11, color: 'red', marginTop: 6 }}>{error}</Text> : null}
      </View>

      {/* Re-center button */}
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: hasSheet ? 300 : 110, right: 20,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 }, elevation: 4,
        }}
        onPress={centerOnOttawa}>
        <Ionicons name="locate" size={20} color={colours.accent} />
      </TouchableOpacity>

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
          {selectedBus && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: getRouteColour(selectedBus.routeId), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 18 }}>{isLRT(selectedBus.routeId) ? '🚊' : '🚌'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
                      {isLRT(selectedBus.routeId) ? 'O-Train' : `${t('Route', 'Route')} ${selectedBus.routeId.split('-')[0]}`}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t('En route', 'En route')} · {selectedBus.progress}% {t('to next stop', 'vers prochain arrêt')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.fromStop}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.toStop}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: getRouteColour(selectedBus.routeId), width: `${selectedBus.progress}%` as any }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colours.accent }} />
                  <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '700' }}>
                    {t('Live · Updates every 15s', 'En direct · Mise à jour toutes les 15s')}
                  </Text>
                </View>
              </View>
            </View>
          )}

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
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#2d7a3a' }}>FREE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }} numberOfLines={3}>
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
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              {selectedEvent.url && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedEvent.url)}
                  style={{ marginTop: 14, backgroundColor: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category), borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                    {selectedEvent.source === 'ticketmaster' ? 'Get Tickets →' : 'View Event →'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Cluster sheet — list of events in this area */}
          {selectedCluster && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>
                  {selectedCluster.length} Events Here
                </Text>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {selectedCluster.map((ev) => (
                  <TouchableOpacity key={ev.id} onPress={() => ev.url && Linking.openURL(ev.url)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border, gap: 10 }}>
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
        </Animated.View>
      )}
    </View>
  );
}
