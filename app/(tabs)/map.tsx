import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated,
  StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useApp } from '../../context/AppContext';

const VEHICLES_URL = 'https://routeo-backend.vercel.app/api/vehicles';

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
  fromStop: string;
  toStop: string;
  progress: number;
};

const ROUTE_COLOURS: { [key: string]: string } = {
  '1': '#00A78D', '2': '#7b5ea7', '4': '#004890', '7': '#cc3b2a',
  '8': '#e8a020', '14': '#004890', '16': '#00A78D', '18': '#cc3b2a',
  '19': '#e8a020', '85': '#004890', '86': '#7b5ea7', '87': '#cc3b2a',
  '88': '#00A78D', '91': '#004890', '95': '#cc3b2a', '96': '#e8a020',
  '97': '#7b5ea7', '98': '#004890', '99': '#00A78D',
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
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [filter, setFilter] = useState<'all' | 'lrt' | 'bus'>('all');
  const [error, setError] = useState('');
  
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const showSheet = (bus: Bus) => {
    setSelectedBus(bus);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const hideSheet = () => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => setSelectedBus(null));
  };

  const sheetTranslate = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [260, 0],
  });

  const fetchBuses = async () => {
    try {
      const url = `${VEHICLES_URL}?t=${Date.now()}`;
      console.log('FETCHING:', url);
      const resp = await fetch(url, {
  headers: { 'Accept': 'application/json' },
});
const data = await resp.json();
      console.log('vehicles count:', data.count, 'array length:', data.vehicles?.length);
      setBuses(data.vehicles || []);
      setError('');
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    } catch (e) {
      console.log('Vehicle fetch error:', e);
      setError(String(e));
    } finally {
      setLoading(false);
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
              onPress={() => showSheet(bus)}
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

        {/* Debug / error display */}
       {error ? (
  <Text style={{ fontSize: 11, color: 'red', marginTop: 6 }}>{error}</Text>
) : null}
      </View>

      {/* Re-center button */}
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: selectedBus ? 260 : 110, right: 20,
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
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: getRouteColour(selectedBus.routeId),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: 18 }}>
                  {isLRT(selectedBus.routeId) ? '🚊' : '🚌'}
                </Text>
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
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
              onPress={hideSheet}
            >
              <Ionicons name="close" size={16} color={colours.text} />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.fromStop}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.toStop}</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }}>
              <View style={{
                height: 6, borderRadius: 3,
                backgroundColor: getRouteColour(selectedBus.routeId),
                width: `${selectedBus.progress}%` as any,
              }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colours.accent }} />
              <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '700' }}>
                {t('Live · Updates every 15s', 'En direct · Mise à jour toutes les 15s')}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
