import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, PanResponder,
  StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useApp } from '../../context/AppContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_KEY = 'e85c07c79cfc45f1b429ce62dcfbab30';
const VEHICLE_POSITIONS_URL = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/VehiclePositions?format=json';
const TRIP_UPDATES_URL = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';

const OTTAWA_REGION: Region = {
  latitude: 45.4215,
  longitude: -75.6972,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

type Bus = {
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  tripId?: string;
  label?: string;
};

type BusDetail = {
  bus: Bus;
  nextStops: { name: string; minsAway: number }[];
};

const ROUTE_COLOURS: { [key: string]: string } = {
  '1': '#00A78D',
  '2': '#7b5ea7',
  '4': '#004890',
  '7': '#cc3b2a',
  '8': '#e8a020',
  '14': '#004890',
  '16': '#00A78D',
  '18': '#cc3b2a',
  '19': '#e8a020',
  '85': '#004890',
  '86': '#7b5ea7',
  '87': '#cc3b2a',
  '88': '#00A78D',
  '91': '#004890',
  '95': '#cc3b2a',
  '96': '#e8a020',
  '97': '#7b5ea7',
  '98': '#004890',
  '99': '#00A78D',
};

const getRouteColour = (routeId: string) => {
  const base = routeId.split('-')[0];
  return ROUTE_COLOURS[base] || '#004890';
};

const isLRT = (routeId: string) => {
  const base = routeId.split('-')[0];
  return base === '1' || base === '2';
};

export default function MapScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';
  const mapRef = useRef<MapView>(null);

  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<BusDetail | null>(null);
  const [filter, setFilter] = useState<'all' | 'lrt' | 'bus'>('all');

  // Bottom sheet animation
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const showSheet = (detail: BusDetail) => {
    setSelectedBus(detail);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const hideSheet = () => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => setSelectedBus(null));
  };

  const sheetTranslate = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  const fetchBuses = async () => {
    try {
      const resp = await fetch(VEHICLE_POSITIONS_URL, {
        headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
      });
      const data = await resp.json();
      const entities = data?.Entity || data?.entity || [];
      const parsed: Bus[] = [];

      for (const ent of entities) {
        const vp = ent.VehiclePosition || ent.vehicle;
        if (!vp) continue;
        const pos = vp.Position || vp.position;
        const vehicle = vp.Vehicle || vp.vehicle;
        const trip = vp.Trip || vp.trip;
        if (!pos?.Latitude && !pos?.latitude) continue;

        parsed.push({
          id: vehicle?.Id || vehicle?.id || String(Math.random()),
          routeId: trip?.RouteId || trip?.route_id || '?',
          lat: pos?.Latitude || pos?.latitude,
          lng: pos?.Longitude || pos?.longitude,
          bearing: pos?.Bearing || pos?.bearing,
          speed: pos?.Speed || pos?.speed,
          tripId: trip?.TripId || trip?.trip_id,
          label: vehicle?.Label || vehicle?.label,
        });
      }

      setBuses(parsed);
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    } catch (e) {
      console.log('Vehicle fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusDetail = async (bus: Bus) => {
    // Try to get upcoming stops from trip updates
    try {
      const resp = await fetch(TRIP_UPDATES_URL, {
        headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
      });
      const data = await resp.json();
      const now = Math.floor(Date.now() / 1000);
      const nextStops: { name: string; minsAway: number }[] = [];

      for (const ent of (data?.Entity || [])) {
        const tu = ent.TripUpdate;
        if (!tu) continue;
        const trip = tu.Trip || {};
        if (String(trip.TripId) !== String(bus.tripId) && String(trip.RouteId) !== bus.routeId) continue;

        for (const stu of (tu.StopTimeUpdate || []).slice(0, 4)) {
          const arr = stu.Arrival || stu.Departure || {};
          const time = parseInt(arr.Time || 0);
          if (!time || time < now) continue;
          nextStops.push({
            name: String(stu.StopId),
            minsAway: Math.max(0, Math.round((time - now) / 60)),
          });
        }
        break;
      }

      showSheet({ bus, nextStops });
    } catch {
      showSheet({ bus, nextStops: [] });
    }
  };

  useEffect(() => {
    fetchBuses();
    const interval = setInterval(fetchBuses, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredBuses = buses.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'lrt') return isLRT(b.routeId);
    if (filter === 'bus') return !isLRT(b.routeId);
    return true;
  });

  const centerOnOttawa = () => {
    mapRef.current?.animateToRegion(OTTAWA_REGION, 600);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={OTTAWA_REGION}
        userInterfaceStyle={isLight ? 'light' : 'dark'}
        showsUserLocation
        showsCompass={false}
        onPress={() => selectedBus && hideSheet()}
      >
        {filteredBuses.map(bus => {
          const colour = getRouteColour(bus.routeId);
          const lrt = isLRT(bus.routeId);
          return (
            <Marker
              key={bus.id}
              coordinate={{ latitude: bus.lat, longitude: bus.lng }}
              onPress={() => fetchBusDetail(bus)}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={{
                backgroundColor: colour,
                borderRadius: lrt ? 8 : 12,
                paddingHorizontal: lrt ? 7 : 6,
                paddingVertical: lrt ? 4 : 3,
                borderWidth: 2,
                borderColor: 'white',
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 },
                elevation: 4,
                minWidth: 28,
                alignItems: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: lrt ? 11 : 10, fontWeight: '800' }}>
                  {lrt ? '🚊' : bus.routeId.split('-')[0]}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Header overlay */}
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
            {loading ? (
              <ActivityIndicator color={colours.accent} size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>
                  {filteredBuses.length} {t('buses', 'bus')}
                </Text>
              </View>
            )}
            {lastUpdated ? (
              <Text style={{ fontSize: 10, color: colours.muted }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text>
            ) : null}
          </View>
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {([
            { key: 'all', label_en: 'All', label_fr: 'Tous' },
            { key: 'lrt', label_en: 'O-Train', label_fr: 'O-Train' },
            { key: 'bus', label_en: 'Bus', label_fr: 'Bus' },
          ] as const).map(f => (
            <TouchableOpacity
              key={f.key}
              style={{
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
                backgroundColor: filter === f.key ? colours.accent : colours.surface,
                borderWidth: 1,
                borderColor: filter === f.key ? colours.accent : colours.border,
              }}
              onPress={() => setFilter(f.key)}
            >
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: filter === f.key ? 'white' : colours.muted }}>
                {t(f.label_en, f.label_fr)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Re-center button */}
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: selectedBus ? 280 : 110, right: 20,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: colours.surface,
          borderWidth: 1, borderColor: colours.border,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 }, elevation: 4,
        }}
        onPress={centerOnOttawa}
      >
        <Ionicons name="locate" size={20} color={colours.accent} />
      </TouchableOpacity>

      {/* Loading overlay */}
      {loading && (
        <View style={{
          position: 'absolute', bottom: 120, left: 20, right: 20,
          backgroundColor: colours.surface, borderRadius: 14,
          borderWidth: 1, borderColor: colours.border,
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: 3,
        }}>
          <ActivityIndicator color={colours.accent} />
          <Text style={{ color: colours.text, fontSize: fonts.md, fontWeight: '500' }}>
            {t('Fetching live bus positions...', 'Chargement des positions en direct...')}
          </Text>
        </View>
      )}

      {/* Bus detail bottom sheet */}
      {selectedBus && (
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
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: getRouteColour(selectedBus.bus.routeId),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: 18 }}>
                  {isLRT(selectedBus.bus.routeId) ? '🚊' : '🚌'}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
                  {isLRT(selectedBus.bus.routeId) ? 'O-Train' : `${t('Route', 'Route')} ${selectedBus.bus.routeId.split('-')[0]}`}
                </Text>
                {selectedBus.bus.label && (
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                    {t('Vehicle', 'Véhicule')} #{selectedBus.bus.label}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
              onPress={hideSheet}
            >
              <Ionicons name="close" size={16} color={colours.text} />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 }}>
            {selectedBus.bus.speed !== undefined && (
              <View style={{ flex: 1, backgroundColor: colours.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colours.border }}>
                <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('Speed', 'Vitesse')}</Text>
                <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{Math.round((selectedBus.bus.speed || 0) * 3.6)} <Text style={{ fontSize: fonts.sm, fontWeight: '500', color: colours.muted }}>km/h</Text></Text>
              </View>
            )}
            {selectedBus.bus.bearing !== undefined && (
              <View style={{ flex: 1, backgroundColor: colours.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colours.border }}>
                <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('Heading', 'Direction')}</Text>
                <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{Math.round(selectedBus.bus.bearing || 0)}°</Text>
              </View>
            )}
            <View style={{ flex: 1, backgroundColor: colours.accent + '12', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colours.accent + '30' }}>
              <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('Status', 'Statut')}</Text>
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.accent }}>{t('Live', 'En direct')}</Text>
            </View>
          </View>

          {/* Next stops */}
          {selectedBus.nextStops.length > 0 && (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                {t('Upcoming Stops', 'Prochains arrêts')}
              </Text>
              {selectedBus.nextStops.map((stop, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < selectedBus.nextStops.length - 1 ? 1 : 0, borderBottomColor: colours.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === 0 ? colours.accent : colours.border, borderWidth: i === 0 ? 0 : 1, borderColor: colours.muted }} />
                    <Text style={{ fontSize: fonts.md, color: colours.text, fontWeight: i === 0 ? '700' : '400' }}>
                      {t('Stop', 'Arrêt')} #{stop.name}
                    </Text>
                  </View>
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: i === 0 ? colours.accent : colours.muted }}>
                    {stop.minsAway === 0 ? t('Now', 'Maint.') : `${stop.minsAway}m`}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}
