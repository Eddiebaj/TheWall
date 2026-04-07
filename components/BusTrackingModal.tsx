import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Platform, Text, TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { computeCountdown } from '../lib/useLiveCountdown';
import { toTitleCase } from '../lib/utils';

// Lazy-load optional modules
let RNMaps: any = null;
try { RNMaps = require('react-native-maps'); } catch {}
const MapView = RNMaps?.default ?? null;
const Marker = (RNMaps as any)?.Marker ?? null;
const Polyline = (RNMaps as any)?.Polyline ?? null;

let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}

let Location: any = null;
try { Location = require('expo-location'); } catch {}

const VEHICLES_URL = 'https://routeo-backend.vercel.app/api/vehicles';
const ARRIVALS_URL = 'https://routeo-backend.vercel.app/api/arrivals';
const ROUTE_URL = 'https://routeo-backend.vercel.app/api/route';

const OTTAWA = { latitude: 45.4215, longitude: -75.6972, latitudeDelta: 0.05, longitudeDelta: 0.05 };

type Bus = {
  id: string; routeId: string; lat: number; lng: number;
  fromStop: string; toStop: string; progress: number;
  agency?: 'OC_TRANSPO' | 'STO';
};

type Props = {
  visible: boolean;
  onClose: () => void;
  routeId: string;
  headsign: string;
  stopName: string;
  stopId: string;
  minsAway: number;
  isSTO: boolean;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
};

export default function BusTrackingModal({
  visible, onClose, routeId, headsign, stopName, stopId, minsAway, isSTO, colours, fonts, t,
}: Props) {
  const mapRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const polyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoadedBus = useRef(false);

  // State
  const [bus, setBus] = useState<Bus | null>(null);
  const [busLoading, setBusLoading] = useState(true);
  const [tracksChanges, setTracksChanges] = useState(true);
  const tracksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fullPolyline, setFullPolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [visiblePolyline, setVisiblePolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [userRegion, setUserRegion] = useState(OTTAWA);
  const [liveEta, setLiveEta] = useState<number | null>(null);

  // Animated values
  const shimmerOpacity = useRef(new Animated.Value(0.4)).current;
  const cardTranslateY = useRef(new Animated.Value(300)).current;
  const busScale = useRef(new Animated.Value(1.0)).current;
  const busLat = useRef<number | null>(null);
  const busLng = useRef<number | null>(null);

  // tracksViewChanges: start true, disable after initial render, re-enable briefly on bus update
  useEffect(() => {
    const timer = setTimeout(() => setTracksChanges(false), 300);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!bus) return;
    setTracksChanges(true);
    if (tracksTimer.current) clearTimeout(tracksTimer.current);
    tracksTimer.current = setTimeout(() => setTracksChanges(false), 300);
    return () => { if (tracksTimer.current) clearTimeout(tracksTimer.current); };
  }, [bus?.lat, bus?.lng]);

  // Shimmer loop
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        Animated.timing(shimmerOpacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmerOpacity]);

  // Bus marker pulse
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(busScale, { toValue: 1.15, duration: 750, useNativeDriver: true }),
        Animated.timing(busScale, { toValue: 1.0, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [busScale]);

  // Get user location on open
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const { status } = await Location?.requestForegroundPermissionsAsync?.() ?? { status: 'denied' };
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced });
          const region = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          };
          setUserRegion(region);
        }
      } catch (e) { if (__DEV__) console.warn(e); }
    })();
  }, [visible]);

  // Fetch bus position
  const fetchBusPosition = useCallback(async () => {
    try {
      const bareId = routeId.split('-')[0];
      const resp = await fetchWithTimeout(`${VEHICLES_URL}?route=${encodeURIComponent(bareId)}&t=${Date.now()}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const vehicles: Bus[] = data.vehicles || [];
      // Find matching bus - prefer closest match by route
      const matches = vehicles.filter(v => {
        const vBare = v.routeId.split('-')[0];
        return vBare === bareId;
      });
      if (matches.length === 0) {
        setBusLoading(false);
        return;
      }
      // Pick the closest bus to the user or the stop
      let found = matches[0];
      if (matches.length > 1) {
        const refLat = userRegion.latitude;
        const refLng = userRegion.longitude;
        const dist = (v: Bus) => Math.sqrt(
          Math.pow((v.lat - refLat) * 111000, 2) +
          Math.pow((v.lng - refLng) * 111000 * Math.cos(refLat * Math.PI / 180), 2)
        );
        matches.sort((a, b) => dist(a) - dist(b));
        found = matches[0];
      }
      const isFirstLoad = !hasLoadedBus.current;

      setBus(found);
      setBusLoading(false);

      if (isFirstLoad) {
        hasLoadedBus.current = true;
        // Medium haptic on first bus load
        Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);

        // Smooth pan to bus position
        const busRegion = {
          latitude: found.lat,
          longitude: found.lng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        };
        setTimeout(() => {
          mapRef.current?.animateToRegion?.(busRegion, 600);
        }, 200);

        // Spring card up
        Animated.spring(cardTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      } else {
        // Smooth pan on update
        if (busLat.current !== null && (busLat.current !== found.lat || busLng.current !== found.lng)) {
          mapRef.current?.animateToRegion?.({
            latitude: found.lat,
            longitude: found.lng,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }, 600);
        }
      }

      busLat.current = found.lat;
      busLng.current = found.lng;
    } catch (e) {
      if (__DEV__) console.warn(e);
      setBusLoading(false);
    }
  }, [routeId, cardTranslateY]);

  // Fetch route shape
  const fetchShape = useCallback(async () => {
    try {
      const bareId = routeId.split('-')[0];
      const agencyParam = isSTO ? '&agency=STO' : '';
      const resp = await fetchWithTimeout(`${ROUTE_URL}?id=${encodeURIComponent(bareId)}&action=shape${agencyParam}`, { timeout: 8000 });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.shape?.length) {
        setFullPolyline(data.shape);
      }
    } catch (e) { if (__DEV__) console.warn(e); }
  }, [routeId, isSTO]);

  // Fetch live ETA from arrivals endpoint
  const etaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchLiveEta = useCallback(async () => {
    if (!stopId) return;
    try {
      const resp = await fetchWithTimeout(`${ARRIVALS_URL}?stop=${encodeURIComponent(stopId)}&t=${Date.now()}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const arrivals = data.arrivals || [];
      const bareId = routeId.split('-')[0];
      const match = arrivals.find((a: any) => {
        const aRoute = String(a.routeId || a.route || '').split('-')[0];
        return aRoute === bareId;
      });
      if (match && typeof match.minsAway === 'number') {
        setLiveEta(match.minsAway);
      }
    } catch (e) { if (__DEV__) console.warn(e); }
  }, [routeId, stopId]);

  useEffect(() => {
    if (!visible) {
      setLiveEta(null);
      if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
      return;
    }
    fetchLiveEta();
    etaIntervalRef.current = setInterval(fetchLiveEta, 30000);
    return () => { if (etaIntervalRef.current) clearInterval(etaIntervalRef.current); };
  }, [visible, fetchLiveEta]);

  // Progressive polyline reveal
  useEffect(() => {
    if (fullPolyline.length === 0) {
      setVisiblePolyline([]);
      return;
    }
    let idx = 0;
    setVisiblePolyline([]);
    polyIntervalRef.current = setInterval(() => {
      idx += 20;
      if (idx >= fullPolyline.length) {
        setVisiblePolyline(fullPolyline);
        if (polyIntervalRef.current) clearInterval(polyIntervalRef.current);
      } else {
        setVisiblePolyline(fullPolyline.slice(0, idx));
      }
    }, 16);
    return () => {
      if (polyIntervalRef.current) clearInterval(polyIntervalRef.current);
    };
  }, [fullPolyline]);

  // On open: fire haptic, fetch data, start polling
  useEffect(() => {
    if (!visible) {
      // Reset on close
      setBus(null);
      setBusLoading(true);
      setFullPolyline([]);
      setVisiblePolyline([]);
      hasLoadedBus.current = false;
      cardTranslateY.setValue(300);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Light haptic on open
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);

    // Fetch immediately
    fetchBusPosition();
    fetchShape();

    // 30s poll
    intervalRef.current = setInterval(fetchBusPosition, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, fetchBusPosition, fetchShape, cardTranslateY]);

  const accentColor = isSTO ? '#00A78D' : '#CE1126';
  const shimmerBase = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Animated.View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Animated.View style={{ width: '50%', height: 14, borderRadius: 6, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
          <Animated.View style={{ width: '70%', height: 10, borderRadius: 5, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
        </View>
        <Animated.View style={{ width: 50, height: 28, borderRadius: 8, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
      </View>
      <View style={{ marginTop: 14, gap: 6 }}>
        <Animated.View style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Animated.View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
          <Animated.View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: shimmerBase, opacity: shimmerOpacity }} />
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 16 : 12, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colours.border, backgroundColor: colours.bg,
          zIndex: 10,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text }}>
              {t('Route', 'Route')} {routeId.split('-')[0]}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }} numberOfLines={1}>
              {headsign ? `→ ${headsign}` : toTitleCase(stopName)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
              alignItems: 'center', justifyContent: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Close', 'Fermer')}
          >
            <Ionicons name="close" size={16} color={colours.text} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={{ flex: 1 }}>
          {MapView ? (
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={userRegion}
              showsUserLocation
              showsMyLocationButton={false}
              mapPadding={{ top: 0, right: 0, bottom: 220, left: 0 }}
            >
              {/* Route polyline */}
              {Polyline && visiblePolyline.length > 1 && (
                <Polyline
                  coordinates={visiblePolyline}
                  strokeColor={accentColor}
                  strokeWidth={4}
                  tappable={false}
                />
              )}

              {/* Bus marker */}
              {Marker && bus && (
                <Marker
                  coordinate={{ latitude: bus.lat, longitude: bus.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={tracksChanges}
                >
                  <Animated.View style={{
                    transform: [{ scale: busScale }],
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: accentColor,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: accentColor, shadowOpacity: 0.4, shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 }, elevation: 6,
                  }}>
                    <Ionicons name="bus" size={18} color="#fff" />
                  </Animated.View>
                </Marker>
              )}
            </MapView>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.surface }}>
              <Ionicons name="map-outline" size={48} color={colours.muted} />
              <Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Map unavailable', 'Carte indisponible')}</Text>
            </View>
          )}

          {/* Bottom card */}
          <Animated.View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            transform: [{ translateY: busLoading ? 0 : cardTranslateY }],
            backgroundColor: colours.surface,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            borderWidth: 1, borderColor: colours.border,
            paddingBottom: Platform.OS === 'ios' ? 34 : 20,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
            shadowOffset: { width: 0, height: -3 }, elevation: 10,
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
            </View>

            {busLoading ? renderSkeleton() : bus ? (
              <View
                accessible
                accessibilityLabel={(() => {
                  const cd = computeCountdown(liveEta ?? minsAway, Date.now());
                  const eta = t(cd.text, cd.textFr);
                  return t(
                    `Route ${routeId.split('-')[0]} to ${headsign || stopName}, arriving in ${eta}. Live tracking active.`,
                    `Route ${routeId.split('-')[0]} vers ${headsign || stopName}, arrive dans ${eta}. Suivi en direct actif.`
                  );
                })()}
                accessibilityRole="summary"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: accentColor,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }} accessibilityElementsHidden>
                        {routeId.split('-')[0]}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
                        {t('Route', 'Route')} {routeId.split('-')[0]}
                      </Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                        {headsign ? `\u2192 ${headsign}` : t('En route', 'En route')}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }} accessibilityLabel={t('Arrival countdown', 'Compte a rebours')}>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: (liveEta ?? minsAway) <= 2 ? colours.red : accentColor }}>
                      {(() => { const cd = computeCountdown(liveEta ?? minsAway, Date.now()); return t(cd.text, cd.textFr); })()}
                    </Text>
                    <Text style={{ fontSize: 10, color: colours.muted }}>{t('to stop', '\u00e0 l\'arr\u00eat')}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 16 }} accessibilityLabel={t(`Bus between stop ${bus.fromStop} and stop ${bus.toStop}`, `Bus entre arr\u00eat ${bus.fromStop} et arr\u00eat ${bus.toStop}`)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arr\u00eat')} #{bus.fromStop}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arr\u00eat')} #{bus.toStop}</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, bus.progress ?? 0) }}>
                    <View style={{
                      height: 6, borderRadius: 3, backgroundColor: accentColor,
                      width: `${Math.min(100, bus.progress ?? 0)}%` as `${number}%`,
                    }} />
                  </View>

                  {/* Live indicator */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colours.live }} />
                      <Text style={{ fontSize: fonts.sm, color: colours.live, fontWeight: '700' }}>
                        {t('Live tracking', 'Suivi en direct')}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: accentColor + '18',
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                      borderWidth: 1, borderColor: accentColor + '40',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor }}>
                        {isSTO ? 'STO' : 'OC Transpo'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 24 }} accessible accessibilityRole="alert" accessibilityLabel={t('Bus not found on network. It may not have departed yet.', 'Bus introuvable sur le r\u00e9seau. Il n\'est peut-\u00eatre pas encore parti.')}>
                <Ionicons name="bus-outline" size={32} color={colours.muted} />
                <Text style={{ color: colours.muted, fontSize: fonts.md, marginTop: 8 }}>
                  {t('Bus not found on network', 'Bus introuvable sur le r\u00e9seau')}
                </Text>
                <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 4 }}>
                  {t('It may not have departed yet', 'Il n\'est peut-\u00eatre pas encore parti')}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
