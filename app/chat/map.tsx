import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';

let RNMaps: typeof import('react-native-maps') | null = null;
try { RNMaps = require('react-native-maps'); } catch {}
const MapView = RNMaps?.default ?? null;
const Marker = RNMaps?.Marker ?? null;
const Polyline = RNMaps?.Polyline ?? null;

export default function GroupMapScreen() {
  const { colours, resolvedTheme } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const mapRef = useRef<any>(null);

  // Parse locations from params
  const locations: { name: string, lat: number, lng: number }[] =
    params.locations ? JSON.parse(params.locations as string) : [];
  const destination = params.destination ? JSON.parse(params.destination as string) : null;

  const [routes, setRoutes] = useState<{ name: string, color: string, coords: {latitude: number, longitude: number}[], eta: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const COLORS = ['#00A78D', '#e8a020', '#7b5ea7', '#cc3b2a', '#0088cc'];

  useEffect(() => {
    if (!destination || locations.length === 0) { setLoading(false); return; }
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    const dateStr = now.toISOString().slice(0, 10);

    const results = await Promise.all(locations.map(async (loc, i) => {
      try {
        const url = `https://routeo-backend.vercel.app/api/plan?fromLat=${loc.lat}&fromLng=${loc.lng}&fromLabel=${encodeURIComponent(loc.name)}&toLat=${destination.lat}&toLng=${destination.lng}&toLabel=${encodeURIComponent(destination.name || 'Meeting Point')}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=transit`;
        const resp = await fetch(url);
        const data = await resp.json();
        const itinerary = data?.plan?.itineraries?.[0];
        if (!itinerary) return null;

        // Extract polyline coordinates from legs
        const coords: {latitude: number, longitude: number}[] = [];
        itinerary.legs?.forEach((leg: any) => {
          if (leg.legGeometry?.points) {
            const decoded = decodePoly(leg.legGeometry.points);
            coords.push(...decoded);
          }
        });

        return {
          name: loc.name,
          color: COLORS[i % COLORS.length],
          coords,
          eta: Math.round(itinerary.duration / 60),
        };
      } catch { return null; }
    }));

    setRoutes(results.filter(Boolean) as any);
    setLoading(false);

    // Fit map to show all locations + destination
    if (mapRef.current && destination) {
      const allCoords = [
        ...locations.map(l => ({ latitude: l.lat, longitude: l.lng })),
        { latitude: destination.lat, longitude: destination.lng },
      ];
      mapRef.current.fitToCoordinates(allCoords, { edgePadding: { top: 80, right: 40, bottom: 200, left: 40 }, animated: true });
    }
  };

  // Simple polyline decoder
  const decodePoly = (encoded: string) => {
    const coords: {latitude: number, longitude: number}[] = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return coords;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colours.border }}>
          <Ionicons name="chevron-back" size={20} color={colours.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1, backgroundColor: colours.bg, borderRadius: 14, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
            {destination?.name || 'Meeting Point'}
          </Text>
          <Text style={{ fontSize: 12, color: colours.muted }}>{locations.length} people routing</Text>
        </View>
      </View>

      {/* Map */}
      {MapView && RNMaps ? (
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          userInterfaceStyle={resolvedTheme === 'light' ? 'light' : 'dark'}
          showsUserLocation
        >
          {/* Destination marker */}
          {destination && Marker && (
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' }}>
                <Ionicons name="location" size={18} color="white" />
              </View>
            </Marker>
          )}

          {/* Person markers + routes */}
          {routes.map((r, i) => {
            const loc = locations[i];
            return (
              <React.Fragment key={i}>
                {Marker && loc && (
                  <Marker coordinate={{ latitude: loc.lat, longitude: loc.lng }}>
                    <View style={{ backgroundColor: r.color, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1.5, borderColor: 'white' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>{r.name.split(' ')[0]}</Text>
                    </View>
                  </Marker>
                )}
                {Polyline && r.coords.length > 0 && (
                  <Polyline coordinates={r.coords} strokeColor={r.color} strokeWidth={3} />
                )}
              </React.Fragment>
            );
          })}
        </MapView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colours.accent} />
        </View>
      )}

      {/* ETA cards at bottom */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16 }}>
        {loading ? (
          <View style={{ backgroundColor: colours.bg, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colours.border }}>
            <ActivityIndicator color={colours.accent} />
            <Text style={{ color: colours.muted, marginTop: 8, fontSize: 13 }}>Calculating routes...</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: colours.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colours.border, gap: 10 }}>
            {routes.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: r.color }} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colours.text }}>{r.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: r.color }}>{r.eta} min</Text>
              </View>
            ))}
            {routes.length === 0 && (
              <Text style={{ color: colours.muted, textAlign: 'center', fontSize: 13 }}>No routes available</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
