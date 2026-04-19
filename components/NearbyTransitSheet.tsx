import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { SK_LEAVE_NOW_ALERTS, SK_WALK_PACE } from '../lib/storageKeys';
import { LAYER_CONFIG, LAYER_ICONS, LayerKey, MapPin } from '../lib/mapLayers';
import { LayerFeedCard } from './LayerFeedCard';
import { writeWidgetData, getTopSavedStopId } from '../lib/widgetData';
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}

// Types

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

interface NearbyTransitSheetProps {
  colours: { bg: string; text: string; muted: string; accent: string; surface: string; border: string; lrt: string; red: string; [key: string]: string };
  fonts: { sm: number; md: number; lg: number; xl: number; xxl: number };
  t: (en: string, fr: string) => string;
  language: string;

  // Nearby stops data
  nearbyStops: NearbyStop[];
  nearbyLoading: boolean;
  onRefreshLocation: () => void;

  // Arrivals expansion
  expandedStopId: string | null;
  onExpandStop: (stopId: string | null) => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string; cached?: boolean; cachedAt?: number }[];
  expandedArrivalsLoading: boolean;

  // Alerts
  activeAlertCount: number;
  hasDisruption: boolean;

  // Community deals
  communityDeals: { id: string; venue_name: string; deal_text: string; day_of_week: number }[];

  // City layers
  activeLayers?: Record<LayerKey, boolean>;
  layerPins?: Partial<Record<LayerKey, MapPin[]>>;
  onToggleLayer?: (key: LayerKey) => void;
  onRouteToPin?: (pin: MapPin) => void;
  loadingLayers?: Set<LayerKey>;

  // Happening now
  happeningNow?: MapPin[];

  // Deal submission
  onSubmitDeal?: () => void;

  // Extra content rendered below nearby transit (e.g. Services, Tonight)
  extraSections?: React.ReactNode;
}

// Helpers

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




// Skeleton card

function SkeletonCard({ colours }: { colours: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ width: 160, height: 16, borderRadius: 6, backgroundColor: colours.muted + '25', marginBottom: 8 }} />
      <View style={{ width: 80, height: 12, borderRadius: 4, backgroundColor: colours.muted + '15', marginBottom: 10 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 52, height: 32, borderRadius: 12, backgroundColor: colours.muted + '15' }} />
        <View style={{ width: 52, height: 32, borderRadius: 12, backgroundColor: colours.muted + '15' }} />
      </View>
    </View>
  );
}

// Route badge

const RouteBadge = React.memo(function RouteBadge({
  routeId,
  minsAway,
  isGhost,
  colours,
  onRoutePress,
}: {
  routeId: string;
  minsAway: number;
  isGhost: boolean;
  colours: any;
  onRoutePress?: (routeId: string) => void;
}) {
  const countdownColor = minsAway < 2 ? TEAL : colours.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TouchableOpacity
        onPress={() => onRoutePress?.(routeId.split('-')[0])}
        activeOpacity={0.7}
        style={{
          minWidth: 52,
          height: 32,
          borderRadius: 12,
          backgroundColor: colours.tintBg,
          borderWidth: 1,
          borderColor: colours.border,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>{routeId}</Text>
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
      </TouchableOpacity>
      <Text style={{ fontSize: 15, fontWeight: '700', color: countdownColor }}>
        {formatCountdown(minsAway)}
      </Text>
    </View>
  );
});

// Stop card

const StopCard = React.memo(function StopCard({
  stop,
  colours,
  isExpanded,
  onPress,
  onStopPress,
  onRoutePress,
  expandedArrivals,
  expandedArrivalsLoading,
  t,
}: {
  stop: NearbyStop;
  colours: any;
  isExpanded: boolean;
  onPress: () => void;
  onStopPress?: (stopId: string) => void;
  onRoutePress?: (routeId: string) => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string; cached?: boolean; cachedAt?: number }[];
  expandedArrivalsLoading: boolean;
  t: (en: string, fr: string) => string;
}) {
  const [walkPaceMs, setWalkPaceMs] = useState(1.4);
  useEffect(() => {
    AsyncStorage.getItem(SK_WALK_PACE).then(val => {
      if (val === 'slow') setWalkPaceMs(1.0);
      else if (val === 'fast') setWalkPaceMs(1.8);
      else setWalkPaceMs(1.4);
    }).catch(() => {});
  }, []);

  const ghostSet = new Set(stop.ghostRoutes ?? []);
  const hasGhostWarning = stop.ghostRoutes && stop.ghostRoutes.length > 0;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <TouchableOpacity activeOpacity={0.6} onPress={() => onStopPress?.(stop.stopId)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colours.text }}>{stop.stopName}</Text>
        </TouchableOpacity>
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
                onRoutePress={onRoutePress}
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
                    <TouchableOpacity onPress={() => onRoutePress?.(a.routeId.split('-')[0])} activeOpacity={0.6} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colours.accent, minWidth: 36 }}>
                        {a.routeId}
                      </Text>
                    </TouchableOpacity>
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

            {/* Leave Now Alert */}
            {expandedArrivals.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={async () => {
                  if (!Notifications) return;
                  const nextArr = expandedArrivals[0];
                  const walkSec = stop.walkMeters / walkPaceMs;
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
                      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secsUntil, repeats: false },
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
                  marginTop: 10, paddingVertical: 10, borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TEAL + '40',
                  backgroundColor: TEAL + '08',
                }}
              >
                <Ionicons name="notifications-outline" size={14} color={TEAL} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: TEAL }}>
                  {t('Set Leave Alert', 'Definir alerte de depart')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});


// Shared layout helpers (stable references)

function SheetSeparator({ colours }: { colours: any }) {
  return <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;
}

function SheetSectionHeader({ label, colours, tight }: { label: string; colours: any; tight?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: tight ? 10 : 18, paddingBottom: tight ? 4 : 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>
        {label}
      </Text>
    </View>
  );
}

// Main component

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
      expandedStopId,
      onExpandStop,
      expandedArrivals,
      expandedArrivalsLoading,
      activeAlertCount,
      hasDisruption,
      communityDeals,
      activeLayers,
      layerPins,
      onToggleLayer,
      onRouteToPin,
      loadingLayers,
      happeningNow,
      onSubmitDeal,
      extraSections,
    },
    ref,
  ) => {
    const router = useRouter();

    const handleStopPress = useCallback((stopId: string) => {
      router.push(`/stop/${stopId}` as any);
    }, [router]);

    const handleRoutePress = useCallback((routeId: string) => {
      router.push(`/route/${routeId}` as any);
    }, [router]);

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

    const feedPins = useMemo(() => {
      if (!activeLayers || !layerPins) return [];
      return (Object.entries(activeLayers) as [LayerKey, boolean][])
        .filter(([_, active]) => active)
        .flatMap(([key]) => (layerPins[key] ?? []).slice(0, 3))
        .slice(0, 15);
    }, [activeLayers, layerPins]);


    const peekStops = nearbyStops.slice(0, 4);

    const Separator = useCallback(() => <SheetSeparator colours={colours} />, [colours]);
    const SectionHeader = useCallback(({ label, tight }: { label: string; tight?: boolean }) => <SheetSectionHeader label={label} colours={colours} tight={tight} />, [colours]);

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
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
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
              <Text style={{ fontSize: 17, fontWeight: '700', color: colours.text }}>
                {t('Nearby Transit', 'Transport a proximite')}
              </Text>
              {activeLayers && Object.values(activeLayers).filter(Boolean).length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, backgroundColor: colours.tintBg, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 }}>
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

          {/* Disruption pill */}
          {hasDisruption && (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 8,
                backgroundColor: AMBER_BG,
                borderRadius: 12,
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

          {/* Alert banner */}
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

          {/* Happening Now banner */}
          {happeningNow && happeningNow.length > 0 && (
            <View style={{ paddingBottom: 8 }}>
              <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>
                  {t('Happening Now', 'En ce moment')}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                {happeningNow.map(pin => {
                  const cfg = LAYER_CONFIG[pin.category];
                  return (
                    <TouchableOpacity
                      key={pin.id}
                      activeOpacity={0.7}
                      onPress={() => onRouteToPin?.(pin)}
                      style={{
                        width: 150,
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: colours.surface,
                        borderWidth: 1,
                        borderColor: cfg.color + '40',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>
                          {language === 'fr' ? cfg.labelFr : cfg.label}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }} numberOfLines={2}>{pin.name}</Text>
                      {pin.subtitle ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{pin.subtitle}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Peek: nearby stops (top 4) */}
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
                  onStopPress={handleStopPress}
                  onRoutePress={handleRoutePress}
                  expandedArrivals={expandedStopId === stop.stopId ? expandedArrivals : []}
                  expandedArrivalsLoading={expandedStopId === stop.stopId && expandedArrivalsLoading}
                  t={t}
                />
                {i < peekStops.length - 1 && <Separator />}
              </React.Fragment>
            ))
          )}

          {/* Remaining stops + saved board */}
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
                    onStopPress={handleStopPress}
                    onRoutePress={handleRoutePress}
                    expandedArrivals={expandedStopId === stop.stopId ? expandedArrivals : []}
                    expandedArrivalsLoading={expandedStopId === stop.stopId && expandedArrivalsLoading}
                    t={t}
                  />
                </React.Fragment>
              ))}
            </>
          )}

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
                        borderColor: isToday ? '#22c55e40' : colours.border,
                        backgroundColor: isToday ? '#22c55e08' : colours.surface,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isToday ? '#22c55e18' : colours.tintBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="pricetag" size={16} color={isToday ? '#22c55e' : colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{deal.venue_name}</Text>
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{deal.deal_text}</Text>
                      </View>
                      <View style={{ backgroundColor: isToday ? '#22c55e18' : colours.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: isToday ? '#22c55e40' : colours.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? '#22c55e' : colours.muted }}>
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
              <SectionHeader label={t('SHOW ON MAP', 'AFFICHER SUR LA CARTE')} tight />

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

              {/* Flat 2x4 layer toggle grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
                {(Object.keys(LAYER_CONFIG) as LayerKey[]).map(key => {
                  const config = LAYER_CONFIG[key];
                  const isActive = activeLayers[key];
                  const PhIcon = LAYER_ICONS[key as LayerKey];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={{
                        width: (screenWidth - 32 - 8) / 2,
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingVertical: 10, paddingHorizontal: 12,
                        borderRadius: 12,
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
                        <PhIcon size={20} color={isActive ? config.color : colours.muted} weight={isActive ? 'fill' : 'regular'} />
                      )}
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colours.text : colours.muted }} numberOfLines={1}>
                        {language === 'fr' ? config.labelFr : config.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Extra sections (e.g. Services Grid, Tonight card) */}
          {extraSections && (
            <>
              <Separator />
              {extraSections}
            </>
          )}
        </BottomSheetScrollView>

        {/* Deal submission FAB */}
        {onSubmitDeal && (
          <TouchableOpacity
            onPress={onSubmitDeal}
            activeOpacity={0.85}
            style={{
              position: 'absolute',
              bottom: 24,
              right: 16,
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colours.accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 4,
            }}
            accessibilityLabel={t('Submit a deal', 'Soumettre un rabais')}
          >
            <Ionicons name="add" size={26} color="#fff" />
          </TouchableOpacity>
        )}
      </BottomSheet>
    );
  },
);

NearbyTransitSheet.displayName = 'NearbyTransitSheet';

export default NearbyTransitSheet;
