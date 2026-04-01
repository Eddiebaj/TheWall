import React, { forwardRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { SavedBoardItem } from '../lib/homeConstants';
import { SavedBoardCard } from './SavedCards';

// ── Types ────────────────────────────────────────────────────────

export interface NearbyStop {
  stopId: string;
  stopName: string;
  walkMeters: number;
  arrivals: { routeId: string; headsign: string; minsAway: number }[];
  arrivalsLoading: boolean;
  ghostRoutes?: string[];
}

interface NearbyTransitSheetProps {
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;

  // Nearby stops data
  nearbyStops: NearbyStop[];
  nearbyLoading: boolean;
  onRefreshLocation: () => void;

  // Board data (for mid state)
  savedBoard: SavedBoardItem[];
  onBoardReorder: (from: number, to: number) => void;
  onBoardCardPress: (item: SavedBoardItem) => void;
  boardCardProps: {
    cardShadow: any;
    garbageEvents: any[];
    alerts: any[];
    sensGame: any;
    timeFormat: any;
    campusData: any;
  };

  // Arrivals expansion
  expandedStopId: string | null;
  onExpandStop: (stopId: string | null) => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string }[];
  expandedArrivalsLoading: boolean;

  // Alerts
  activeAlertCount: number;
  hasDisruption: boolean;

  // Navigation
  onPlanTrip: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const SNAP_POINTS = ['25%', '55%', '90%'];
const TEAL = '#00A78D';
const AMBER_BG = 'rgba(232,160,32,0.15)';
const AMBER_TEXT = '#b8860b';

function formatWalk(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m walk`;
  return `${(meters / 1000).toFixed(1)}km walk`;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return '< 1';
  return `${mins} min`;
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

// ── Route badge ──────────────────────────────────────────────────

function RouteBadge({
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
}

// ── Stop card ────────────────────────────────────────────────────

function StopCard({
  stop,
  colours,
  isExpanded,
  onPress,
  expandedArrivals,
  expandedArrivalsLoading,
  t,
}: {
  stop: NearbyStop;
  colours: any;
  isExpanded: boolean;
  onPress: () => void;
  expandedArrivals: { routeId: string; headsign: string; minsAway: number; source?: string }[];
  expandedArrivalsLoading: boolean;
  t: (en: string, fr: string) => string;
}) {
  const ghostSet = new Set(stop.ghostRoutes ?? []);
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colours.text }}>{stop.stopName}</Text>
        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2, marginBottom: 8 }}>
          {formatWalk(stop.walkMeters)}
        </Text>
        {stop.arrivalsLoading ? (
          <ActivityIndicator size="small" color={TEAL} />
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

        {/* Expanded arrivals */}
        {isExpanded && (
          <View style={{ marginTop: 10 }}>
            {expandedArrivalsLoading ? (
              <ActivityIndicator size="small" color={TEAL} style={{ marginVertical: 6 }} />
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
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: a.minsAway < 2 ? TEAL : colours.text,
                      marginLeft: 8,
                    }}
                  >
                    {formatCountdown(a.minsAway)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main component ───────────────────────────────────────────────

const NearbyTransitSheet = forwardRef<BottomSheet, NearbyTransitSheetProps>(
  (
    {
      colours,
      fonts,
      t,
      nearbyStops,
      nearbyLoading,
      onRefreshLocation,
      savedBoard,
      onBoardReorder,
      onBoardCardPress,
      boardCardProps,
      expandedStopId,
      onExpandStop,
      expandedArrivals,
      expandedArrivalsLoading,
      activeAlertCount,
      hasDisruption,
      onPlanTrip,
    },
    ref,
  ) => {
    const handleExpandStop = useCallback(
      (stopId: string) => {
        onExpandStop(expandedStopId === stopId ? null : stopId);
      },
      [expandedStopId, onExpandStop],
    );

    // ── Peek stops (top 4) ────────────────────────────────────────
    const peekStops = nearbyStops.slice(0, 4);
    const allStops = nearbyStops;

    // ── Placeholder section helper ────────────────────────────────
    const PlaceholderSection = ({ label }: { label: string }) => (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 20,
          borderBottomWidth: 1,
          borderBottomColor: colours.border,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: colours.muted }}>{label}</Text>
      </View>
    );

    // ── Separator ─────────────────────────────────────────────────
    const Separator = () => (
      <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />
    );

    return (
      <BottomSheet
        ref={ref}
        index={0}
        snapPoints={SNAP_POINTS}
        backgroundStyle={{
          backgroundColor: colours.surface,
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
          contentContainerStyle={{ paddingBottom: 40 }}
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
            <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>
              {t('Nearby Transit', 'Transport a proximite')}
            </Text>
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
                />
                {i < peekStops.length - 1 && <Separator />}
              </React.Fragment>
            ))
          )}

          {/* ── STATE 2 — Mid: remaining stops ────────────────── */}
          {!nearbyLoading && allStops.length > 4 && (
            <>
              {allStops.slice(4).map((stop, i) => (
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
                  />
                </React.Fragment>
              ))}
            </>
          )}

          {/* ── Saved board section ────────────────────────────── */}
          {savedBoard.length > 0 && (
            <>
              <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colours.muted,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {t('Saved', 'Enregistres')}
                </Text>
              </View>
              {savedBoard.map((item, i) => (
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

          {/* ── Plan a trip button ─────────────────────────────── */}
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
              }}
              accessibilityLabel={t('Plan a trip', 'Planifier un trajet')}
            >
              <Text style={{ fontWeight: '800', fontSize: 15, color: '#fff' }}>
                {t('Plan a trip', 'Planifier un trajet')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── STATE 3 — Full: Ottawa life placeholders ───────── */}
          <Separator />
          <PlaceholderSection label={t('Tonight', 'Ce soir')} />
          <PlaceholderSection label={t('Weather', 'Meteo')} />
          <PlaceholderSection label={t('Services', 'Services')} />
          <PlaceholderSection label={t('News', 'Nouvelles')} />
          <PlaceholderSection label={t('Recent trips', 'Trajets recents')} />
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);

NearbyTransitSheet.displayName = 'NearbyTransitSheet';

export default NearbyTransitSheet;
