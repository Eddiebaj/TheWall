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
import { supabase } from '../lib/supabase';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { SK_LEAVE_NOW_ALERTS, SK_WALK_PACE, SK_DEVICE_ID } from '../lib/storageKeys';
import { LAYER_CONFIG, LAYER_ICONS, LayerKey, MapPin } from '../lib/mapLayers';
import { routeBadgeStyle } from '../lib/routeColors';
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

type IntersectionGroup = {
  id: string;
  name: string;
  walkMeters: number;
  stops: NearbyStop[];
  hasArrivals: boolean;
};

interface NearbyTransitSheetProps {
  colours: { bg: string; text: string; muted: string; accent: string; surface: string; border: string; lrt: string; red: string; [key: string]: string };
  fonts: { sm: number; md: number; lg: number; xl: number; xxl: number };
  t: (en: string, fr: string) => string;
  language: string;

  // Nearby stops data
  nearbyStops: NearbyStop[];
  nearbyLoading: boolean;
  onRefreshLocation: () => void;

  // Arrivals expansion (kept for compatibility / Leave Now Alert)
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

  // Safety signals — stops with recent "feel unsafe" reports (night hours only)
  safetySignalStopIds?: Set<string>;

  // Venue alerts — active events near a planned destination
  venueAlerts?: { venueName: string; routeIds: string[]; minutesUntilEnd: number }[];

  // Extra content rendered below nearby transit (e.g. Services, Tonight)
  extraSections?: React.ReactNode;
}

// Constants

const SNAP_POINTS = ['25%', '55%', '90%'];
const TEAL = '#00C07A';
const AMBER_BG = 'rgba(245,158,11,0.12)';
const AMBER_TEXT = '#D97706';
const DEFAULT_ROWS = 3;
const GROUP_DIST_THRESHOLD = 60; // meters — stops within this distance can be merged


function timeStyle(minsAway: number): { bg: string; fg: string; label: string } {
  if (minsAway <= 0) return { bg: '#00C07A18', fg: '#00C07A', label: 'Now' };
  if (minsAway < 10)  return { bg: '#F59E0B18', fg: '#D97706', label: `${minsAway} min` };
  return { bg: 'transparent', fg: '#6b7f99', label: `${minsAway} min` };
}

// Helpers

function formatWalk(meters: number, t: (en: string, fr: string) => string): string {
  if (meters < 1000) return `${Math.round(meters)}m ${t('walk', 'marche')}`;
  return `${(meters / 1000).toFixed(1)}km ${t('walk', 'marche')}`;
}

/** Strip direction suffix and normalize to canonical intersection name */
function canonicalName(stopName: string): string {
  return stopName
    .replace(/\s*\b(NB|SB|EB|WB|NORTHBOUND|SOUTHBOUND|EASTBOUND|WESTBOUND)\b\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Get a short direction label for a stop's chip */
function directionLabel(stop: NearbyStop, t: (en: string, fr: string) => string): string {
  // Prefer the headsign of the first arrival
  if (stop.arrivals.length > 0) {
    const hs = stop.arrivals[0].headsign;
    if (hs && hs.length > 0) return hs.length > 16 ? hs.slice(0, 16) + '\u2026' : hs;
  }
  // Fall back to direction extracted from stop name
  if (/\bNB\b/i.test(stop.stopName)) return t('Northbound', 'Nord');
  if (/\bSB\b/i.test(stop.stopName)) return t('Southbound', 'Sud');
  if (/\bEB\b/i.test(stop.stopName)) return t('Eastbound', 'Est');
  if (/\bWB\b/i.test(stop.stopName)) return t('Westbound', 'Ouest');
  return `#${stop.stopId}`;
}

/** Group nearby stops by intersection (same canonical name + within 60m) */
function groupNearbyStops(stops: NearbyStop[]): IntersectionGroup[] {
  const used = new Set<string>();
  const groups: IntersectionGroup[] = [];

  for (let i = 0; i < stops.length; i++) {
    if (used.has(stops[i].stopId)) continue;
    const canon = canonicalName(stops[i].stopName);
    const groupStops: NearbyStop[] = [stops[i]];
    used.add(stops[i].stopId);

    for (let j = i + 1; j < stops.length; j++) {
      if (used.has(stops[j].stopId)) continue;
      const distDiff = Math.abs(stops[j].walkMeters - stops[i].walkMeters);
      if (distDiff <= GROUP_DIST_THRESHOLD && canonicalName(stops[j].stopName) === canon) {
        groupStops.push(stops[j]);
        used.add(stops[j].stopId);
      }
    }

    const minWalk = Math.min(...groupStops.map(s => s.walkMeters));
    const hasArrivals = groupStops.some(s => s.arrivals.length > 0 || s.arrivalsLoading);

    groups.push({
      id: stops[i].stopId,
      name: canon,
      walkMeters: minWalk,
      stops: groupStops,
      hasArrivals,
    });
  }

  // Stops with arrivals first, then no-arrivals (grayed) at bottom
  return [
    ...groups.filter(g => g.hasArrivals),
    ...groups.filter(g => !g.hasArrivals),
  ];
}

// Skeleton card

function SkeletonCard({ colours }: { colours: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ width: 160, height: 14, borderRadius: 6, backgroundColor: colours.muted + '25' }} />
        <View style={{ width: 60, height: 12, borderRadius: 4, backgroundColor: colours.muted + '15' }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 80, height: 28, borderRadius: 14, backgroundColor: colours.muted + '15' }} />
        <View style={{ width: 80, height: 28, borderRadius: 14, backgroundColor: colours.muted + '15' }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 44, height: 26, borderRadius: 8, backgroundColor: colours.muted + '15' }} />
        <View style={{ width: 38, height: 26, borderRadius: 6, backgroundColor: colours.muted + '10' }} />
        <View style={{ width: 44, height: 26, borderRadius: 8, backgroundColor: colours.muted + '15' }} />
        <View style={{ width: 38, height: 26, borderRadius: 6, backgroundColor: colours.muted + '10' }} />
      </View>
    </View>
  );
}

// Inline arrival pills for a stop — colored route badge + 3-state time pill + inline ghost warning

function ArrivalPills({ stop, colours, t }: { stop: NearbyStop; colours: any; t: (en: string, fr: string) => string }) {
  const [thanks, setThanks] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const handleReport = useCallback(async (routeId: string) => {
    if (submitted[routeId]) return;
    setSubmitted(prev => ({ ...prev, [routeId]: true }));
    setThanks(prev => ({ ...prev, [routeId]: true }));
    setTimeout(() => setThanks(prev => ({ ...prev, [routeId]: false })), 3000);
    try {
      const deviceId = (await AsyncStorage.getItem(SK_DEVICE_ID)) ?? 'unknown';
      fetch('https://routeo-backend.vercel.app/api/community?action=ghost.report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stop_id: stop.stopId, route_id: routeId, report_type: 'not_arrived', notes: '', device_id: deviceId }),
      }).catch(() => {});
    } catch {}
  }, [submitted, stop.stopId]);

  if (stop.arrivalsLoading) {
    return <ActivityIndicator size="small" color={TEAL} style={{ alignSelf: 'flex-start' }} />;
  }
  if (stop.arrivals.length === 0) {
    return (
      <Text style={{ fontSize: 12, color: colours.muted, fontStyle: 'italic' }}>
        {t('No arrivals', 'Aucune arrivee')}
      </Text>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {stop.arrivals.slice(0, 2).map((a, i) => {
          const isGhost = stop.ghostRoutes?.includes(a.routeId) ?? false;
          const isReported = submitted[a.routeId] ?? false;
          const showThanks = thanks[a.routeId] ?? false;
          const badge = routeBadgeStyle(a.routeId);
          const time = timeStyle(isGhost ? 99 : a.minsAway);

          if (showThanks) {
            return (
              <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-circle" size={12} color={TEAL} />
                <Text style={{ fontSize: 11, color: TEAL, fontWeight: '600' }}>
                  {t("Thanks \u2014 we'll watch this route", "Merci \u2014 on surveille cette route")}
                </Text>
              </View>
            );
          }

          return (
            <View key={`${a.routeId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: isReported && !isGhost ? 0.4 : 1 }}>
              {/* Route badge — color-coded */}
              <View style={{ minWidth: 36, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: isGhost ? '#EF444420' : badge.bg, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: isGhost ? '#EF4444' : badge.fg, letterSpacing: -0.3 }}>
                  {a.routeId.split('-')[0]}
                </Text>
              </View>
              {/* Time pill — Now / <10min / ≥10min */}
              <View style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: time.bg }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: time.fg }}>
                  {isGhost ? t('?', '?') : time.label}
                </Text>
              </View>
              {/* Flag button */}
              {!isGhost && !isReported && (
                <TouchableOpacity
                  onPress={() => handleReport(a.routeId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t('Report not coming', 'Signaler pas venu')}
                >
                  <Ionicons name="flag-outline" size={12} color={colours.muted} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
      {/* Inline ghost bus warning — red text + icon, no separate card */}
      {stop.ghostRoutes && stop.ghostRoutes.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="skull-outline" size={11} color="#EF4444" />
          <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600' }}>
            {t(
              `Route${stop.ghostRoutes.length > 1 ? 's' : ''} ${stop.ghostRoutes.join(', ')} not appearing`,
              `Route${stop.ghostRoutes.length > 1 ? 's' : ''} ${stop.ghostRoutes.join(', ')} absente${stop.ghostRoutes.length > 1 ? 's' : ''}`,
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

// Leave Now Alert button (shown when expanded)

function LeaveNowButton({
  stop,
  colours,
  t,
}: {
  stop: NearbyStop;
  colours: any;
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

  if (!Notifications || stop.arrivals.length === 0) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={async () => {
        if (!Notifications) return;
        const nextArr = stop.arrivals[0];
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
                `${nextArr.routeId} to ${nextArr.headsign} arrives in ${Math.ceil((walkSec + bufferSec) / 60)} min`,
                `${nextArr.routeId} vers ${nextArr.headsign} arrive dans ${Math.ceil((walkSec + bufferSec) / 60)} min`,
              ),
              sound: 'default',
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secsUntil, repeats: false },
          });
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
        marginTop: 10, paddingVertical: 9, borderRadius: 12,
        borderWidth: 1, borderColor: TEAL + '40', backgroundColor: TEAL + '08',
      }}
    >
      <Ionicons name="notifications-outline" size={13} color={TEAL} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: TEAL }}>
        {t('Set Leave Alert', 'Definir alerte de depart')}
      </Text>
    </TouchableOpacity>
  );
}

// Intersection row — core new component

const IntersectionRow = React.memo(function IntersectionRow({
  group,
  colours,
  t,
  expandedGroupId,
  onToggleExpand,
  safetySignalStopIds,
}: {
  group: IntersectionGroup;
  colours: any;
  t: (en: string, fr: string) => string;
  expandedGroupId: string | null;
  onToggleExpand: (id: string) => void;
  safetySignalStopIds?: Set<string>;
}) {
  // Default to the first stop that has arrivals, or 0
  const defaultIdx = group.stops.findIndex(s => s.arrivals.length > 0 || s.arrivalsLoading);
  const [activeIdx, setActiveIdx] = useState(defaultIdx >= 0 ? defaultIdx : 0);
  const [safetyThanks, setSafetyThanks] = useState(false);
  const isExpanded = expandedGroupId === group.id;

  const hasSafetySignal = safetySignalStopIds
    ? group.stops.some(s => safetySignalStopIds.has(s.stopId))
    : false;

  const handleSafetyReport = useCallback(async () => {
    if (safetyThanks) return;
    setSafetyThanks(true);
    const activeStop = group.stops[Math.min(activeIdx, group.stops.length - 1)];
    const hour = new Date().getHours();
    const timeOfDay = hour >= 20 || hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    try {
      const deviceId = (await AsyncStorage.getItem(SK_DEVICE_ID)) ?? 'unknown';
      supabase.from('stop_safety_reports').insert({
        stop_id: activeStop.stopId,
        stop_code: activeStop.stopId,
        device_id: deviceId,
        time_of_day: timeOfDay,
      }).then(() => {}).catch(() => {});
    } catch {}
  }, [safetyThanks, group.stops, activeIdx]);

  const activeStop = group.stops[Math.min(activeIdx, group.stops.length - 1)];
  const multiDir = group.stops.length > 1;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onToggleExpand(group.id)}
    >
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, opacity: group.hasArrivals ? 1 : 0.4 }}>
        {/* Row header: intersection name + walk */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.3, color: colours.text, flex: 1 }} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <Ionicons name="walk-outline" size={12} color={colours.muted} />
            <Text style={{ fontSize: 12, color: colours.muted }}>{formatWalk(group.walkMeters, t)}</Text>
          </View>
        </View>

        {/* Direction chips (only when multiple stops) */}
        {multiDir && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {group.stops.map((stop, idx) => {
              const isActive = idx === activeIdx;
              const label = directionLabel(stop, t);
              return (
                <TouchableOpacity
                  key={stop.stopId}
                  onPress={(e) => { e.stopPropagation?.(); setActiveIdx(idx); }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1,
                    borderColor: isActive ? TEAL : colours.border,
                    backgroundColor: isActive ? TEAL + '18' : colours.surface,
                    maxWidth: 160,
                  }}
                >
                  <Ionicons name="arrow-forward" size={11} color={isActive ? TEAL : colours.muted} />
                  <Text
                    style={{ fontSize: 12, fontWeight: '600', color: isActive ? TEAL : colours.muted }}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Arrivals for active direction — ghost warnings render inline inside ArrivalPills */}
        <ArrivalPills stop={activeStop} colours={colours} t={t} />

        {/* Expanded leave-now alert */}
        {isExpanded && (
          <LeaveNowButton stop={activeStop} colours={colours} t={t} />
        )}

        {/* Safety signal — shown at night when reports exist */}
        {hasSafetySignal && (
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: AMBER_BG, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
            <Ionicons name="warning-outline" size={12} color={AMBER_TEXT} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: AMBER_TEXT }}>
              {t('Riders reported feeling unsafe here', 'Des usagers ont signale un malaise ici')}
            </Text>
          </View>
        )}

        {/* Feel unsafe here? — night hours only */}
        {(new Date().getHours() >= 20 || new Date().getHours() < 6) && (
          <TouchableOpacity
            onPress={handleSafetyReport}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginTop: 5, alignSelf: 'flex-start' }}
          >
            <Text style={{ fontSize: 11, color: safetyThanks ? TEAL : colours.muted }}>
              {safetyThanks
                ? t('Thanks for letting us know', 'Merci de nous avoir informe')
                : t('Feel unsafe here?', 'Vous sentez-vous en insecurite?')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

// Shared layout helpers

function SheetSeparator({ colours }: { colours: any }) {
  return <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;
}

function SheetSectionHeader({ label, colours, tight }: { label: string; colours: any; tight?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: tight ? 10 : 18, paddingBottom: tight ? 4 : 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>{label}</Text>
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
      safetySignalStopIds,
      venueAlerts,
    },
    ref,
  ) => {
    const router = useRouter();
    const [showAll, setShowAll] = useState(false);
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

    const handleToggleExpand = useCallback((id: string) => {
      setExpandedGroupId(prev => prev === id ? null : id);
    }, []);

    const handleRoutePress = useCallback((routeId: string) => {
      router.push(`/route/${routeId}` as any);
    }, [router]);

    // Write widget data when arrivals load
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

    // Build intersection groups from raw stops
    const intersectionGroups = useMemo(() => groupNearbyStops(nearbyStops), [nearbyStops]);
    const visibleGroups = showAll ? intersectionGroups : intersectionGroups.slice(0, DEFAULT_ROWS);

    const hiddenCount = intersectionGroups.length - DEFAULT_ROWS;

    const Separator = useCallback(() => <SheetSeparator colours={colours} />, [colours]);
    const SectionHeader = useCallback(({ label, tight }: { label: string; tight?: boolean }) => (
      <SheetSectionHeader label={label} colours={colours} tight={tight} />
    ), [colours]);

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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 }}>
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
            <TouchableOpacity onPress={onRefreshLocation} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('Refresh location', 'Actualiser la position')}>
              <Ionicons name="location-outline" size={20} color={TEAL} />
            </TouchableOpacity>
          </View>

          {/* Disruption pill */}
          {hasDisruption && (
            <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: AMBER_BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: AMBER_TEXT }}>
                {t('O-Train disrupted', 'O-Train perturbe')}
              </Text>
            </View>
          )}

          {/* Alert banner */}
          {activeAlertCount > 0 && (
            <View style={{ backgroundColor: AMBER_BG, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: AMBER_TEXT }}>
                {t(
                  `${activeAlertCount} active alert${activeAlertCount > 1 ? 's' : ''}`,
                  `${activeAlertCount} alerte${activeAlertCount > 1 ? 's' : ''} active${activeAlertCount > 1 ? 's' : ''}`,
                )}
              </Text>
            </View>
          )}

          {/* Happening Now */}
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
                      style={{ width: 150, padding: 10, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: cfg.color + '40' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{language === 'fr' ? cfg.labelFr : cfg.label}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }} numberOfLines={2}>{pin.name}</Text>
                      {pin.subtitle ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{pin.subtitle}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Venue alert banner — shown when active event nearby a planned destination */}
          {venueAlerts && venueAlerts.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#F97316' + '15', borderWidth: 1, borderColor: '#F97316' + '50', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ionicons name="ticket-outline" size={13} color="#F97316" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F97316' }}>
                  {t('Event ending nearby', 'Evenement qui se termine a proximite')}
                </Text>
              </View>
              {venueAlerts.map((va, i) => (
                <Text key={i} style={{ fontSize: 11, color: '#F97316', marginTop: 1 }}>
                  {va.venueName}
                  {va.minutesUntilEnd > 0
                    ? t(` ends in ${va.minutesUntilEnd} min`, ` se termine dans ${va.minutesUntilEnd} min`)
                    : t(' recently ended', ' vient de se terminer')}
                  {va.routeIds.length > 0 ? t(` · Routes ${va.routeIds.join(', ')}`, ` · Routes ${va.routeIds.join(', ')}`) : ''}
                </Text>
              ))}
              <Text style={{ fontSize: 10, color: '#F97316', marginTop: 4, opacity: 0.8 }}>
                {t('Expect crowds at stops', 'Prevoyez des foules aux arrets')}
              </Text>
            </View>
          )}

          {/* Intersection stop list */}
          {nearbyLoading ? (
            <>
              <SkeletonCard colours={colours} />
              <Separator />
              <SkeletonCard colours={colours} />
              <Separator />
              <SkeletonCard colours={colours} />
            </>
          ) : intersectionGroups.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
              <Ionicons name="bus-outline" size={28} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center' }}>
                {t('No nearby stops found', 'Aucun arret a proximite')}
              </Text>
            </View>
          ) : (
            <>
              {visibleGroups.map((group, i) => (
                <React.Fragment key={group.id}>
                  {i > 0 && <Separator />}
                  <IntersectionRow
                    group={group}
                    colours={colours}
                    t={t}
                    expandedGroupId={expandedGroupId}
                    onToggleExpand={handleToggleExpand}
                    safetySignalStopIds={safetySignalStopIds}
                  />
                </React.Fragment>
              ))}
              {/* Show more / less toggle */}
              {!showAll && hiddenCount > 0 && (
                <>
                  <Separator />
                  <TouchableOpacity
                    onPress={() => setShowAll(true)}
                    activeOpacity={0.7}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colours.accent }}>
                      {t(`Show ${hiddenCount} more`, `Afficher ${hiddenCount} de plus`)}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colours.accent} />
                  </TouchableOpacity>
                </>
              )}
              {showAll && hiddenCount > 0 && (
                <>
                  <Separator />
                  <TouchableOpacity
                    onPress={() => setShowAll(false)}
                    activeOpacity={0.7}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colours.muted }}>
                      {t('Show less', 'Afficher moins')}
                    </Text>
                    <Ionicons name="chevron-up" size={16} color={colours.muted} />
                  </TouchableOpacity>
                </>
              )}
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
                        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
                        borderRadius: 12, borderWidth: 1,
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

              {Object.values(activeLayers).every(v => !v) && (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 32 }}>
                  <Ionicons name="layers-outline" size={40} color={colours.muted} />
                  <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colours.muted }}>
                    {t('Turn on layers to see Ottawa on the map', 'Activez des couches pour voir Ottawa sur la carte')}
                  </Text>
                </View>
              )}

              {onRouteToPin && feedPins.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  {feedPins.map(pin => (
                    <LayerFeedCard key={`feed-${pin.id}`} pin={pin} onRoute={onRouteToPin} language={language} />
                  ))}
                </View>
              )}

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
                        paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
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

          {/* Extra sections (Services Grid, Tonight card) */}
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
              position: 'absolute', bottom: 24, right: 16,
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: colours.accent,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
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
