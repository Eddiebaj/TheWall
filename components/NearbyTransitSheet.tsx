import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { SavedBoardItem } from '../lib/homeConstants';
import { SavedBoardCard } from './SavedCards';
import { SK_TRIP_HISTORY, SK_LEAVE_NOW_ALERTS } from '../lib/storageKeys';
import { LAYER_CONFIG, LayerKey, MapPin } from '../lib/mapLayers';
import { LayerFeedCard } from './LayerFeedCard';
import { writeWidgetData, getTopSavedStopId } from '../lib/widgetData';
import TonightCard from './TonightCard';
import NewsSection from './NewsSection';
import ServicesGrid, { ServiceTile } from './ServicesGrid';
import { CampusConfig } from '../lib/campusData';
import PremiumBadge from './PremiumBadge';
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}

// ── Types ────────────────────────────────────────────────────────

export interface NearbyStop {
  stopId: string;
  stopName: string;
  walkMeters: number;
  arrivals: { routeId: string; headsign: string; minsAway: number }[];
  arrivalsLoading: boolean;
  ghostRoutes?: string[];
  cached?: boolean;
  cachedAt?: number;
}

type SensGame = { state: 'live' | 'pre' | 'none'; period?: string; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; startTime?: string; opponentAbbr?: string } | null;

interface NearbyTransitSheetProps {
  colours: { bg: string; text: string; muted: string; accent: string; surface: string; border: string; lrt: string; red: string; [key: string]: string };
  fonts: { sm: number; md: number; lg: number; xl: number; xxl: number };
  t: (en: string, fr: string) => string;
  language: string;

  // Nearby stops data
  nearbyStops: NearbyStop[];
  nearbyLoading: boolean;
  onRefreshLocation: () => void;

  // Board data (for mid state)
  savedBoard: SavedBoardItem[];
  onBoardCardPress: (item: SavedBoardItem) => void;
  boardCardProps: {
    cardShadow: Record<string, unknown>;
    garbageEvents: { date: string; flags: string[] }[];
    alerts: { id: number; title: string; description: string; routes: string[]; category: string }[];
    sensGame: SensGame;
    timeFormat: 'relative' | 'absolute';
    campusData: CampusConfig | null;
  };

  // Arrivals expansion
  expandedStopId: string | null;
  onExpandStop: (stopId: string | null) => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string; cached?: boolean; cachedAt?: number }[];
  expandedArrivalsLoading: boolean;

  // Alerts
  activeAlertCount: number;
  hasDisruption: boolean;

  // Weather (State 3)
  weather: { temp: number; condition: string; icon: string } | null;
  onWeatherPress?: () => void;

  // Tonight card (State 3)
  sensGame: SensGame;
  events: { name: string; date: string; time?: string; venue: string }[];

  // Services (State 3)
  onServiceTileTap: (tile: ServiceTile) => void;

  // Community deals (State 3)
  communityDeals: { id: string; venue_name: string; deal_text: string; day_of_week: number }[];

  // Navigation
  onPlanTrip: () => void;

  // Premium
  premiumActive?: boolean;
  onLeaveNowPress?: () => void;

  // City layers
  activeLayers?: Record<LayerKey, boolean>;
  layerPins?: Partial<Record<LayerKey, MapPin[]>>;
  onToggleLayer?: (key: LayerKey) => void;
  onRouteToPin?: (pin: MapPin) => void;
  loadingLayers?: Set<LayerKey>;
}

// ── Helpers ──────────────────────────────────────────────────────

const SNAP_POINTS = ['25%', '55%', '90%'];
const TEAL = '#00A78D';
const AMBER_BG = 'rgba(232,160,32,0.15)';
const AMBER_TEXT = '#b8860b';

function formatWalk(meters: number, t: (en: string, fr: string) => string): string {
  if (meters < 1000) return `${Math.round(meters)}m ${t('walk', 'marche')}`;
  return `${(meters / 1000).toFixed(1)}km ${t('walk', 'marche')}`;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return '< 1';
  return `${mins} min`;
}

type TripEntry = { fromLabel: string; toLabel: string; plannedAt: string; durationMins?: number };

function weatherIconName(icon: string): string {
  if (icon.includes('snow')) return 'snow-outline';
  if (icon.includes('rain') || icon.includes('drizzle')) return 'rainy-outline';
  if (icon.includes('cloud') || icon.includes('overcast')) return 'cloudy-outline';
  if (icon.includes('thunder') || icon.includes('storm')) return 'thunderstorm-outline';
  if (icon.includes('clear') || icon.includes('sunny')) return 'sunny-outline';
  return 'partly-sunny-outline';
}

// ── Skeleton card ────────────────────────────────────────────────

function SkeletonCard({ colours }: { colours: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ width: 160, height: 16, borderRadius: 6, backgroundColor: colours.muted + '25', marginBottom: 8 }} />
      <View style={{ width: 80, height: 12, borderRadius: 4, backgroundColor: colours.muted + '15', marginBottom: 10 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 52, height: 32, borderRadius: 10, backgroundColor: colours.muted + '15' }} />
        <View style={{ width: 52, height: 32, borderRadius: 10, backgroundColor: colours.muted + '15' }} />
      </View>
    </View>
  );
}

// ── Layer groups ─────────────────────────────────────────────────

const LAYER_GROUPS = [
  { key: 'transit', label: 'Transit', labelFr: 'Transit', icon: 'bus' as const, layers: ['ghost_buses', 'bike_share', 'parking', 'construction'] as LayerKey[] },
  { key: 'food', label: 'Food & Drink', labelFr: 'Resto & Bar', icon: 'restaurant' as const, layers: ['restaurants', 'bars', 'coffee', 'food_trucks', 'breweries', 'markets'] as LayerKey[] },
  { key: 'services', label: 'Services', labelFr: 'Services', icon: 'business' as const, layers: ['grocery', 'pharmacy', 'gyms', 'bike_repair', 'ev_chargers', 'wifi'] as LayerKey[] },
  { key: 'discover', label: 'Discover', labelFr: 'Découvrir', icon: 'compass' as const, layers: ['events', 'sports', 'public_art', 'cultural'] as LayerKey[] },
];

// ── Route badge ──────────────────────────────────────────────────

const RouteBadge = React.memo(function RouteBadge({
  routeId,
  minsAway,
  isGhost,
  colours,
}: {
  routeId: string;
  minsAway: number;
  isGhost: boolean;
  colours: any;
}) {
  const countdownColor = minsAway < 2 ? TEAL : colours.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          minWidth: 52,
          height: 32,
          borderRadius: 10,
          backgroundColor: colours.accent + '15',
          borderWidth: 1,
          borderColor: colours.accent + '30',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '800', color: colours.accent }}>{routeId}</Text>
        {isGhost && (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#cc3b2a',
            }}
          />
        )}
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: countdownColor }}>
        {formatCountdown(minsAway)}
      </Text>
    </View>
  );
});

// ── Stop card ────────────────────────────────────────────────────

const StopCard = React.memo(function StopCard({
  stop,
  colours,
  isExpanded,
  onPress,
  expandedArrivals,
  expandedArrivalsLoading,
  t,
  premiumActive,
  onLeaveNowPress,
}: {
  stop: NearbyStop;
  colours: any;
  isExpanded: boolean;
  onPress: () => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string; cached?: boolean; cachedAt?: number }[];
  expandedArrivalsLoading: boolean;
  t: (en: string, fr: string) => string;
  premiumActive?: boolean;
  onLeaveNowPress?: () => void;
}) {
  const ghostSet = new Set(stop.ghostRoutes ?? []);
  const hasGhostWarning = stop.ghostRoutes && stop.ghostRoutes.length > 0;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colours.text }}>{stop.stopName}</Text>
        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2, marginBottom: 8 }}>
          {formatWalk(stop.walkMeters, t)}
        </Text>
        {stop.arrivalsLoading ? (
          <ActivityIndicator size="small" color={TEAL} />
        ) : stop.arrivals.length === 0 ? (
          <Text style={{ fontSize: 13, color: colours.muted, fontStyle: 'italic' }}>
            {t('No upcoming arrivals', 'Aucune arrivee prochaine')}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {stop.arrivals.map((a, i) => (
              <RouteBadge
                key={`${a.routeId}-${i}`}
                routeId={a.routeId}
                minsAway={a.minsAway}
                isGhost={ghostSet.has(a.routeId)}
                colours={colours}
              />
            ))}
          </View>
        )}

        {/* Cached indicator */}
        {stop.cached && stop.cachedAt && (
          <Text style={{ fontSize: 11, color: colours.muted, fontStyle: 'italic', marginTop: 4 }}>
            {t('Cached', 'En cache')} {'\u2022'} {Math.max(1, Math.round((Date.now() - stop.cachedAt) / 60000))}m {t('ago', 'pass.')}
          </Text>
        )}

        {/* Ghost bus warning */}
        {hasGhostWarning && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Ionicons name="alert-circle" size={12} color="#cc3b2a" />
            <Text style={{ fontSize: 11, color: '#cc3b2a', fontWeight: '600' }}>
              {t('Ghost bus reported', 'Bus fantome signale')}
            </Text>
          </View>
        )}

        {/* Expanded arrivals */}
        {isExpanded && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colours.border, paddingTop: 8 }}>
            {expandedArrivalsLoading ? (
              <ActivityIndicator size="small" color={TEAL} style={{ marginVertical: 6 }} />
            ) : expandedArrivals.length === 0 ? (
              <Text style={{ fontSize: 13, color: colours.muted, fontStyle: 'italic' }}>
                {t('No arrivals found', 'Aucune arrivee trouvee')}
              </Text>
            ) : (
              expandedArrivals.map((a, i) => (
                <View
                  key={`${a.routeId}-${a.headsign}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colours.accent, minWidth: 36 }}>
                      {a.routeId}
                    </Text>
                    <Text style={{ fontSize: 13, color: colours.muted, flex: 1 }} numberOfLines={1}>
                      {a.headsign}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                    {a.source === 'gtfs-rt' || a.source === 'sto-gtfs-rt' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL }} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: TEAL }}>
                          {t('Live', 'Direct')}
                        </Text>
                      </View>
                    ) : a.source === 'gtfs-static' ? (
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>
                        {t('Sched', 'Horaire')}
                      </Text>
                    ) : (a as any).cached ? (
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, fontStyle: 'italic' }}>
                        {t('Cached', 'En cache')}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: a.minsAway < 2 ? TEAL : colours.text,
                      }}
                    >
                      {formatCountdown(a.minsAway)}
                    </Text>
                  </View>
                </View>
              ))
            )}

            {/* Leave Now Alert — Premium */}
            {expandedArrivals.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={async () => {
                  if (!premiumActive) { onLeaveNowPress?.(); return; }
                  if (!Notifications) return;
                  const nextArr = expandedArrivals[0];
                  const walkSec = stop.walkMeters / 1.4;
                  const bufferSec = 120;
                  const arrivalMs = Date.now() + nextArr.minsAway * 60 * 1000;
                  const leaveAtMs = arrivalMs - (walkSec + bufferSec) * 1000;
                  const secsUntil = Math.max(1, Math.round((leaveAtMs - Date.now()) / 1000));
                  try {
                    const notifId = await Notifications.scheduleNotificationAsync({
                      content: {
                        title: t('Leave now!', 'Partez maintenant!'),
                        body: t(
                          `${nextArr.routeId} to ${nextArr.headsign} arrives at ${stop.stopName} in ${Math.ceil((walkSec + bufferSec) / 60)} min`,
                          `${nextArr.routeId} vers ${nextArr.headsign} arrive a ${stop.stopName} dans ${Math.ceil((walkSec + bufferSec) / 60)} min`
                        ),
                        sound: 'default',
                      },
                      trigger: { type: 'timeInterval' as any, seconds: secsUntil, repeats: false } as any,
                    });
                    // Persist alert
                    const alert = { id: notifId, stopName: stop.stopName, routeId: nextArr.routeId, leaveAt: leaveAtMs };
                    try {
                      const raw = await AsyncStorage.getItem(SK_LEAVE_NOW_ALERTS);
                      const existing = raw ? JSON.parse(raw) : [];
                      existing.push(alert);
                      await AsyncStorage.setItem(SK_LEAVE_NOW_ALERTS, JSON.stringify(existing));
                    } catch {}
                  } catch (e) { if (__DEV__) console.warn('Leave now schedule failed:', e); }
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  marginTop: 10, paddingVertical: 10, borderRadius: 10,
                  borderWidth: 1,
                  borderColor: premiumActive ? TEAL + '40' : colours.border,
                  backgroundColor: premiumActive ? TEAL + '08' : colours.card,
                }}
              >
                <Ionicons name="notifications-outline" size={14} color={premiumActive ? TEAL : colours.muted} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: premiumActive ? TEAL : colours.muted }}>
                  {premiumActive
                    ? t('Set Leave Alert', 'Definir alerte de depart')
                    : t('Leave Now Alert', 'Alerte de depart')
                  }
                </Text>
                {!premiumActive && <PremiumBadge />}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ── Weather row ──────────────────────────────────────────────────

const WeatherRow = React.memo(function WeatherRow({ weather, colours, t, onPress }: {
  weather: { temp: number; condition: string; icon: string };
  colours: any;
  t: (en: string, fr: string) => string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#4A90D9' + '15',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={weatherIconName(weather.icon) as any} size={20} color="#4A90D9" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text }}>{weather.temp}°C</Text>
        <Text style={{ fontSize: 12, color: colours.muted }}>{weather.condition}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colours.muted} />
    </TouchableOpacity>
  );
});

// ── Recent trips ─────────────────────────────────────────────────

function RecentTripsSection({ colours, t }: { colours: any; t: (en: string, fr: string) => string }) {
  const [trips, setTrips] = useState<TripEntry[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      try {
        if (!val) return;
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return;
        setTrips(parsed.slice(0, 5));
      } catch (e) { if (__DEV__) console.warn('Trip history parse error:', e); }
    }).catch(() => {});
  }, []);

  if (trips.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
        {t('Recent trips', 'Trajets recents')}
      </Text>
      {trips.map((trip, i) => (
        <View
          key={`trip-${i}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 8,
            borderBottomWidth: i < trips.length - 1 ? 1 : 0,
            borderBottomColor: colours.border,
          }}
        >
          <Ionicons name="navigate-outline" size={16} color={colours.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text }} numberOfLines={1}>
              {trip.fromLabel} → {trip.toLabel}
            </Text>
            {trip.durationMins != null && (
              <Text style={{ fontSize: 12, color: colours.muted }}>
                {trip.durationMins} min
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Shared layout helpers (stable references) ───────────────────

function SheetSeparator({ colours }: { colours: any }) {
  return <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;
}

function SheetSectionHeader({ label, colours }: { label: string; colours: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

// ── Main component ───────────────────────────────────────────────

const NearbyTransitSheet = forwardRef<BottomSheet, NearbyTransitSheetProps>(
  (
    {
      colours,
      fonts,
      t,
      language,
      nearbyStops,
      nearbyLoading,
      onRefreshLocation,
      savedBoard,
      onBoardCardPress,
      boardCardProps,
      expandedStopId,
      onExpandStop,
      expandedArrivals,
      expandedArrivalsLoading,
      activeAlertCount,
      hasDisruption,
      weather,
      onWeatherPress,
      sensGame,
      events,
      onServiceTileTap,
      communityDeals,
      onPlanTrip,
      premiumActive,
      onLeaveNowPress,
      activeLayers,
      layerPins,
      onToggleLayer,
      onRouteToPin,
      loadingLayers,
    },
    ref,
  ) => {
    const handleExpandStop = useCallback(
      (stopId: string) => {
        onExpandStop(expandedStopId === stopId ? null : stopId);
      },
      [expandedStopId, onExpandStop],
    );

    // Write widget data when expanded arrivals load for the user's top saved stop
    useEffect(() => {
      if (!expandedStopId || expandedArrivalsLoading || expandedArrivals.length === 0) return;
      (async () => {
        try {
          const topStop = await getTopSavedStopId();
          if (topStop && expandedStopId === topStop.id) {
            writeWidgetData({
              stopId: topStop.id,
              stopName: topStop.name,
              arrivals: expandedArrivals.slice(0, 3).map(a => ({
                routeId: a.routeId,
                headsign: a.headsign || '',
                minsAway: a.minsAway ?? 99,
                source: (a.source as 'gtfs-rt' | 'sto-gtfs-rt' | 'gtfs-static') || 'gtfs-static',
              })),
              updatedAt: Date.now(),
            });
          }
        } catch (e) {
          if (__DEV__) console.warn('Widget data write failed:', e);
        }
      })();
    }, [expandedStopId, expandedArrivals, expandedArrivalsLoading]);

    const { width: screenWidth } = useWindowDimensions();
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const feedPins = useMemo(() => {
      if (!activeLayers || !layerPins) return [];
      return (Object.entries(activeLayers) as [LayerKey, boolean][])
        .filter(([_, active]) => active)
        .flatMap(([key]) => (layerPins[key] ?? []).slice(0, 3))
        .slice(0, 15);
    }, [activeLayers, layerPins]);

    const [servicesTab, setServicesTab] = useState('entertainment');

    const peekStops = nearbyStops.slice(0, 4);

    // Board stops only (bus_stop + lrt_station)
    const boardStops = useMemo(
      () => savedBoard.filter(item => item.type === 'bus_stop' || item.type === 'lrt_station'),
      [savedBoard],
    );

    const Separator = useCallback(() => <SheetSeparator colours={colours} />, [colours]);
    const SectionHeader = useCallback(({ label }: { label: string }) => <SheetSectionHeader label={label} colours={colours} />, [colours]);

    return (
      <BottomSheet
        ref={ref}
        index={1}
        snapPoints={SNAP_POINTS}
        backgroundStyle={{
          backgroundColor: colours.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        handleIndicatorStyle={{
          backgroundColor: colours.muted,
          width: 40,
          height: 4,
          borderRadius: 2,
          opacity: 0.4,
        }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ─────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>
                {t('Nearby Transit', 'Transport a proximite')}
              </Text>
              {activeLayers && Object.values(activeLayers).filter(Boolean).length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, backgroundColor: colours.accent + '20', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Ionicons name="layers" size={12} color={colours.accent} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>
                    {Object.values(activeLayers).filter(Boolean).length}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={onRefreshLocation}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={t('Refresh location', 'Actualiser la position')}
            >
              <Ionicons name="location-outline" size={20} color={TEAL} />
            </TouchableOpacity>
          </View>

          {/* ── Disruption pill ────────────────────────────────── */}
          {hasDisruption && (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 8,
                backgroundColor: AMBER_BG,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: AMBER_TEXT }}>
                {t('O-Train disrupted', 'O-Train perturbe')}
              </Text>
            </View>
          )}

          {/* ── Alert banner ───────────────────────────────────── */}
          {activeAlertCount > 0 && (
            <View
              style={{
                backgroundColor: AMBER_BG,
                paddingHorizontal: 16,
                paddingVertical: 8,
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: AMBER_TEXT }}>
                {t(
                  `${activeAlertCount} active alert${activeAlertCount > 1 ? 's' : ''}`,
                  `${activeAlertCount} alerte${activeAlertCount > 1 ? 's' : ''} active${activeAlertCount > 1 ? 's' : ''}`,
                )}
              </Text>
            </View>
          )}

          {/* ── STATE 1 — Peek: nearby stops (top 4) ──────────── */}
          {nearbyLoading ? (
            <>
              <SkeletonCard colours={colours} />
              <Separator />
              <SkeletonCard colours={colours} />
              <Separator />
              <SkeletonCard colours={colours} />
            </>
          ) : peekStops.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
              <Ionicons name="bus-outline" size={28} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center' }}>
                {t('No nearby stops found', 'Aucun arret a proximite')}
              </Text>
            </View>
          ) : (
            peekStops.map((stop, i) => (
              <React.Fragment key={stop.stopId}>
                <StopCard
                  stop={stop}
                  colours={colours}
                  isExpanded={expandedStopId === stop.stopId}
                  onPress={() => handleExpandStop(stop.stopId)}
                  expandedArrivals={expandedStopId === stop.stopId ? expandedArrivals : []}
                  expandedArrivalsLoading={expandedStopId === stop.stopId && expandedArrivalsLoading}
                  t={t}
                  premiumActive={premiumActive}
                  onLeaveNowPress={onLeaveNowPress}
                />
                {i < peekStops.length - 1 && <Separator />}
              </React.Fragment>
            ))
          )}

          {/* ── STATE 2 — Mid: remaining stops + saved board ───── */}
          {!nearbyLoading && nearbyStops.length > 4 && (
            <>
              {nearbyStops.slice(4).map((stop) => (
                <React.Fragment key={stop.stopId}>
                  <Separator />
                  <StopCard
                    stop={stop}
                    colours={colours}
                    isExpanded={expandedStopId === stop.stopId}
                    onPress={() => handleExpandStop(stop.stopId)}
                    expandedArrivals={expandedStopId === stop.stopId ? expandedArrivals : []}
                    expandedArrivalsLoading={expandedStopId === stop.stopId && expandedArrivalsLoading}
                    t={t}
                    premiumActive={premiumActive}
                    onLeaveNowPress={onLeaveNowPress}
                  />
                </React.Fragment>
              ))}
            </>
          )}

          {/* Saved board stops */}
          {boardStops.length > 0 && (
            <>
              <Separator />
              <SectionHeader label={t('Saved', 'Enregistres')} />
              {boardStops.map((item, i) => (
                <View key={`board-${i}`} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                  <SavedBoardCard
                    item={item}
                    colours={colours}
                    fonts={fonts}
                    t={t}
                    onPress={() => onBoardCardPress(item)}
                    drag={() => {}}
                    isActive={false}
                    cardShadow={boardCardProps.cardShadow}
                    garbageEvents={boardCardProps.garbageEvents}
                    alerts={boardCardProps.alerts}
                    sensGame={boardCardProps.sensGame}
                    timeFormat={boardCardProps.timeFormat}
                    campusData={boardCardProps.campusData}
                  />
                </View>
              ))}
            </>
          )}

          {/* Plan a trip button */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <TouchableOpacity
              onPress={onPlanTrip}
              activeOpacity={0.8}
              style={{
                backgroundColor: TEAL,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
              accessibilityLabel={t('Plan a trip', 'Planifier un trajet')}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={{ fontWeight: '800', fontSize: 15, color: '#fff' }}>
                {t('Plan a trip', 'Planifier un trajet')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── STATE 3 — Full: Ottawa life ───────────────────── */}
          <Separator />

          {/* Tonight card */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <TonightCard
              colours={colours}
              fonts={fonts}
              cardShadow={boardCardProps.cardShadow}
              sensGame={sensGame}
              events={events}
              weather={weather}
            />
          </View>

          {/* Weather row */}
          {weather && (
            <>
              <Separator />
              <SectionHeader label={t('Weather', 'Meteo')} />
              <WeatherRow weather={weather} colours={colours} t={t} onPress={onWeatherPress} />
            </>
          )}

          {/* Services grid */}
          <Separator />
          <SectionHeader label={t('Services', 'Services')} />
          <ServicesGrid
            colours={colours}
            fonts={fonts}
            t={t}
            language={language}
            activeTab={servicesTab}
            onTabChange={setServicesTab}
            onTileTap={onServiceTileTap}
            cardShadow={boardCardProps.cardShadow}
          />

          {/* News */}
          <Separator />
          <SectionHeader label={t('News', 'Nouvelles')} />
          <NewsSection
            colours={colours}
            fonts={fonts}
            cardShadow={boardCardProps.cardShadow}
          />

          {/* Community deals */}
          {communityDeals.length > 0 && (
            <>
              <Separator />
              <SectionHeader label={t('Deals', 'Offres')} />
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {communityDeals.slice(0, 5).map(deal => {
                  const dayNames = language === 'fr'
                    ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
                    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const isToday = deal.day_of_week === new Date().getDay();
                  return (
                    <View
                      key={deal.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isToday ? '#2ecc7140' : colours.border,
                        backgroundColor: isToday ? '#2ecc7108' : colours.surface,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isToday ? '#2ecc7118' : colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="pricetag" size={16} color={isToday ? '#2ecc71' : colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{deal.venue_name}</Text>
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{deal.deal_text}</Text>
                      </View>
                      <View style={{ backgroundColor: isToday ? '#2ecc7118' : colours.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: isToday ? '#2ecc7140' : colours.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? '#2ecc71' : colours.muted }}>
                          {isToday ? t('TODAY', "AUJOURD'HUI") : dayNames[deal.day_of_week]}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* City layers */}
          {activeLayers && onToggleLayer && (
            <>
              <Separator />
              <SectionHeader label={t('SHOW ON MAP', 'AFFICHER SUR LA CARTE')} />

              {/* Empty state (above grid) */}
              {Object.values(activeLayers).every(v => !v) && (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 32 }}>
                  <Ionicons name="layers-outline" size={40} color={colours.muted} />
                  <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colours.muted }}>
                    {t('Turn on layers to see Ottawa on the map', 'Activez des couches pour voir Ottawa sur la carte')}
                  </Text>
                </View>
              )}

              {/* Layer feed (active layers, max 15 pins) */}
              {onRouteToPin && feedPins.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  {feedPins.map(pin => (
                    <LayerFeedCard key={`feed-${pin.id}`} pin={pin} onRoute={onRouteToPin} language={language} />
                  ))}
                </View>
              )}

              {/* Layer toggle grid — grouped */}
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                {LAYER_GROUPS.map(group => {
                  const activeCount = group.layers.filter(l => activeLayers[l]).length;
                  const isExpanded = expandedGroups.has(group.key);
                  return (
                    <View key={group.key}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}
                        onPress={() => setExpandedGroups(prev => { const s = new Set(prev); s.has(group.key) ? s.delete(group.key) : s.add(group.key); return s; })}
                        accessibilityRole="button"
                        accessibilityLabel={language === 'fr' ? group.labelFr : group.label}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Ionicons name={group.icon as any} size={18} color={activeCount > 0 ? colours.accent : colours.muted} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: activeCount > 0 ? colours.text : colours.muted }}>
                            {language === 'fr' ? group.labelFr : group.label}
                          </Text>
                          {activeCount > 0 && (
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>{activeCount}</Text>
                            </View>
                          )}
                        </View>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
                      </TouchableOpacity>
                      {isExpanded && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingBottom: 6 }}>
                          {group.layers.map(key => {
                            const config = LAYER_CONFIG[key];
                            const isActive = activeLayers[key];
                            return (
                              <TouchableOpacity
                                key={key}
                                style={{
                                  width: (screenWidth - 32 - 16) / 3,
                                  paddingVertical: 10, paddingHorizontal: 8,
                                  borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4,
                                  backgroundColor: colours.surface,
                                  borderWidth: isActive ? 1.5 : 1,
                                  borderColor: isActive ? config.color : colours.border,
                                  opacity: isActive ? 1 : 0.55,
                                }}
                                onPress={() => onToggleLayer(key)}
                                activeOpacity={0.7}
                                accessibilityLabel={`${language === 'fr' ? config.labelFr : config.label} ${isActive ? 'on' : 'off'}`}
                                accessibilityRole="button"
                                accessibilityState={{ checked: isActive }}
                              >
                                {loadingLayers?.has(key) ? (
                                  <ActivityIndicator size="small" color={config.color} />
                                ) : (
                                  <Ionicons name={config.icon as any} size={22} color={isActive ? config.color : colours.muted} />
                                )}
                                <Text style={{ fontSize: 10, fontWeight: '600', textAlign: 'center', color: isActive ? colours.text : colours.muted }} numberOfLines={1}>
                                  {language === 'fr' ? config.labelFr : config.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Recent trips */}
          <Separator />
          <RecentTripsSection colours={colours} t={t} />
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);

NearbyTransitSheet.displayName = 'NearbyTransitSheet';

export default NearbyTransitSheet;
