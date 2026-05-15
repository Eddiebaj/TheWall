import React, { useEffect, useState } from 'react';
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { SK_TRIP_HISTORY } from '../lib/storageKeys';
import { useIsPremium } from '../lib/premium';
import { PREMIUM_ENABLED } from '../lib/flags';
import PaywallSheet from '../components/PaywallSheet';
import { haversineKm } from '../lib/geo';
import { NEIGHBOURHOOD_GROUPS } from '../lib/neighbourhoodGroups';

// Types

type Trip = {
  id: string;
  fromLabel: string;
  toLabel: string;
  fromLat: number; fromLng: number;
  toLat: number; toLng: number;
  durationMins: number;
  distanceKm?: number;
  plannedAt: string;
  // Transit Memory fields
  neighbourhood?: string;
  routeId?: string;
  hourOfDay?: number;
  dayOfWeek?: number;
};

type RouteStat = { route: string; count: number; avgMins: number; bestMins: number };

// Helpers

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

// Screen

export default function InsightsScreen() {
  const { colours, fonts, t, language } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isLight = colours.bg === '#f0f4f8' || colours.bg === '#ffffff';
  const isPremium = useIsPremium();
  const [paywallVisible, setPaywallVisible] = useState(false);

  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(raw => {
      if (raw) { try { setTrips(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
  }, []);

  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeekTrips = trips.filter(trip => new Date(trip.plannedAt) >= thisWeekStart);
  const lastWeekTrips = trips.filter(trip => {
    const d = new Date(trip.plannedAt);
    return d >= lastWeekStart && d < thisWeekStart;
  });

  // Route stats
  const routeMap = new Map<string, { count: number; totalMins: number; bestMins: number }>();
  trips.forEach(tr => {
    const key = `${tr.fromLabel} \u2192 ${tr.toLabel}`;
    const prev = routeMap.get(key) || { count: 0, totalMins: 0, bestMins: Infinity };
    routeMap.set(key, {
      count: prev.count + 1,
      totalMins: prev.totalMins + tr.durationMins,
      bestMins: Math.min(prev.bestMins, tr.durationMins),
    });
  });
  const routeStats: RouteStat[] = Array.from(routeMap.entries())
    .map(([route, s]) => ({ route, count: s.count, avgMins: Math.round(s.totalMins / s.count), bestMins: s.bestMins === Infinity ? 0 : s.bestMins }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Best departure times (hour with lowest avg duration)
  const hourMap = new Map<number, { total: number; count: number }>();
  trips.forEach(tr => {
    const h = new Date(tr.plannedAt).getHours();
    const prev = hourMap.get(h) || { total: 0, count: 0 };
    hourMap.set(h, { total: prev.total + tr.durationMins, count: prev.count + 1 });
  });
  const bestHours = Array.from(hourMap.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([h, v]) => ({ hour: h, avg: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3);

  // ── Transit Memory computations ──

  // Top 3 visited neighbourhoods
  const neighbourhoodCounts: Record<string, number> = {};
  trips.forEach(tr => {
    if (tr.neighbourhood) {
      neighbourhoodCounts[tr.neighbourhood] = (neighbourhoodCounts[tr.neighbourhood] ?? 0) + 1;
    }
  });
  const topNeighbourhoods = Object.entries(neighbourhoodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const maxNeighbourhoodCount = topNeighbourhoods[0]?.[1] ?? 1;

  // Most used route
  const routeCounts: Record<string, number> = {};
  trips.forEach(tr => { if (tr.routeId) routeCounts[tr.routeId] = (routeCounts[tr.routeId] ?? 0) + 1; });
  const topRouteEntry = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0];

  // Time patterns - most common hour of day (with at least 3 trips) and most common day range
  const hourCounts: Record<number, number> = {};
  const dayCounts: Record<number, number> = {};
  trips.forEach(tr => {
    if (tr.hourOfDay !== undefined) hourCounts[tr.hourOfDay] = (hourCounts[tr.hourOfDay] ?? 0) + 1;
    if (tr.dayOfWeek !== undefined) dayCounts[tr.dayOfWeek] = (dayCounts[tr.dayOfWeek] ?? 0) + 1;
  });
  const peakHour = Object.entries(hourCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  // Condense consecutive weekday peaks into a range label
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const topDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => parseInt(d, 10))
    .sort((a, b) => a - b);
  const dayRangeLabel = topDays.length >= 2
    ? `${dayNames[topDays[0]]}\u2013${dayNames[topDays[topDays.length - 1]]}`
    : topDays.length === 1 ? dayNames[topDays[0]] : null;

  // Hidden gem - a neighbourhood near a frequent destination that the user has never visited
  const visitedNeighbourhoods = new Set(Object.keys(neighbourhoodCounts));
  const frequentDestCoords = trips.length > 0
    ? { lat: trips[0].toLat, lng: trips[0].toLng }
    : null;
  let hiddenGem: { name: string; dist: number } | null = null;
  if (frequentDestCoords) {
    const unvisited = NEIGHBOURHOOD_GROUPS
      .filter(g => !visitedNeighbourhoods.has(g.name_en))
      .map(g => ({ name: g.name_en, dist: haversineKm(frequentDestCoords.lat, frequentDestCoords.lng, g.lat, g.lng) }))
      .filter(g => g.dist <= 3.5)
      .sort((a, b) => a.dist - b.dist);
    if (unvisited.length > 0) hiddenGem = unvisited[0];
  }

  // Transit stats
  const totalTrips = trips.length;
  const totalDistKm = trips.reduce((s, tr) => s + (tr.distanceKm ?? 0), 0);
  const co2SavedKg = Math.round((totalDistKm * 150) / 1000 * 10) / 10; // 150g/km vs driving

  // Is memory unlocked (5+ trips)
  const memoryUnlocked = trips.length >= 5;

  const [wallStats, setWallStats] = useState({ nights: 0, unlocked: 0, topVenue: '', firstScan: '' });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [{ data: rsvps }, { data: scans }] = await Promise.all([
        supabase.from('city_board_rsvps').select('venue_name, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('venue_qr_scans').select('venue_name, scanned_at').eq('user_id', user.id).order('scanned_at', { ascending: true }),
      ]);
      const venueCounts: Record<string, number> = {};
      (rsvps || []).forEach(r => { venueCounts[r.venue_name] = (venueCounts[r.venue_name] || 0) + 1; });
      const topVenue = Object.entries(venueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const firstScan = scans?.[0]?.scanned_at ? new Date(scans[0].scanned_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      setWallStats({ nights: rsvps?.length || 0, unlocked: scans?.length || 0, topVenue, firstScan });
    });
  }, []);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{
      borderWidth: 1, borderColor: colours.border, borderRadius: 16,
      marginHorizontal: 20, marginBottom: 16, overflow: 'hidden',
      backgroundColor: colours.surface,
    }}>
      {children}
    </View>
  );

  // Gate: show lock screen for non-premium users when flag is on
  const locked = PREMIUM_ENABLED && !isPremium;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colours.text} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text, flex: 1 }}>
            {t('Commute Insights', 'Statistiques de trajet')}
          </Text>
          <Ionicons name="stats-chart" size={20} color={colours.accent} />
        </View>

        {/* My Wall Stats */}
        {wallStats.nights > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>My Wall</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colours.accent + '12' }}>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: colours.accent }}>{wallStats.nights}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>nights</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colours.accent + '12' }}>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: colours.accent }}>{wallStats.unlocked}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>unlocked</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colours.accent + '12' }}>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: colours.accent }}>{wallStats.nights > 0 ? Math.round((wallStats.unlocked / wallStats.nights) * 100) : 0}%</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>showed up</Text>
                </View>
              </View>
              {wallStats.topVenue ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colours.bg }}>
                  <Ionicons name="flame" size={14} color={colours.accent} />
                  <Text style={{ fontSize: 13, color: colours.text, fontWeight: '600', flex: 1 }}>Your spot: <Text style={{ color: colours.accent }}>{wallStats.topVenue}</Text></Text>
                </View>
              ) : null}
              {wallStats.firstScan ? (
                <Text style={{ fontSize: 11, color: colours.muted, marginTop: 8, textAlign: 'center' }}>Your wall started {wallStats.firstScan}</Text>
              ) : null}
            </View>
          </Card>
        )}

        {/* Premium lock overlay */}
        {locked && (
          <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
            {/* Blurred preview cards (decorative) */}
            {[1, 2, 3].map(i => (
              <View
                key={i}
                style={{
                  height: 90, borderRadius: 16, borderWidth: 1,
                  borderColor: colours.border, backgroundColor: colours.surface,
                  marginBottom: 12, opacity: 0.35,
                }}
              />
            ))}
            {/* Lock prompt */}
            <TouchableOpacity
              onPress={() => setPaywallVisible(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Unlock Commute Insights', 'Debloquer les statistiques de trajet')}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <View style={{
                width: 52, height: 52, borderRadius: 16,
                backgroundColor: colours.accent + '20',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="lock-closed" size={24} color={colours.accent} />
              </View>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                {t('Commute Insights is Premium', 'Les statistiques de trajet sont Premium')}
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', paddingHorizontal: 20 }}>
                {t('Upgrade to see your top routes, departure times, and weekly trends.', 'Passez a Premium pour voir vos trajets frequents, horaires et tendances hebdomadaires.')}
              </Text>
              <View style={{
                backgroundColor: colours.accent, borderRadius: 12,
                paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
              }}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#fff' }}>
                  {t('Unlock with Premium', 'Debloquer avec Premium')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Premium-gated content ── */}
        {!locked && (
          <>
            <Card>
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 12 }}>
                  {t('This week', 'Cette semaine')}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.accent }}>{thisWeekTrips.length}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('trips', 'trajets')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>
                      {thisWeekTrips.length > 0 ? Math.round(thisWeekTrips.reduce((s, tr) => s + tr.durationMins, 0) / thisWeekTrips.length) : 0}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('min avg', 'min moy')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>
                      {thisWeekTrips.reduce((s, tr) => s + tr.durationMins, 0)}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('min total', 'min total')}</Text>
                  </View>
                </View>
                {lastWeekTrips.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colours.border }}>
                    <Ionicons
                      name={thisWeekTrips.length >= lastWeekTrips.length ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={thisWeekTrips.length >= lastWeekTrips.length ? colours.accent : colours.orange}
                    />
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t(
                        `Last week: ${lastWeekTrips.length} trips, ${Math.round(lastWeekTrips.reduce((s, tr) => s + tr.durationMins, 0) / lastWeekTrips.length)} min avg`,
                        `Semaine derniere: ${lastWeekTrips.length} trajets, ${Math.round(lastWeekTrips.reduce((s, tr) => s + tr.durationMins, 0) / lastWeekTrips.length)} min moy`
                      )}
                    </Text>
                  </View>
                )}
              </View>
            </Card>

            {routeStats.length > 0 && (
              <Card>
                <View style={{ padding: 16 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 12 }}>
                    {t('Top routes', 'Trajets frequents')}
                  </Text>
                  {routeStats.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}>
                      <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.accent, width: 28 }}>#{i + 1}</Text>
                      <View style={{ flex: 1, marginLeft: 4 }}>
                        <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }} numberOfLines={1}>{r.route}</Text>
                        <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>
                          {r.count}x · {t(`avg ${r.avgMins} min`, `moy ${r.avgMins} min`)} · {t(`best ${r.bestMins} min`, `meilleur ${r.bestMins} min`)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {bestHours.length > 0 && (
              <Card>
                <View style={{ padding: 16 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 12 }}>
                    {t('Best departure times', 'Meilleurs horaires')}
                  </Text>
                  {bestHours.map((bh, i) => {
                    const label = `${bh.hour}:00`;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                        <Ionicons name="time-outline" size={16} color={colours.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{label}</Text>
                          <Text style={{ fontSize: 10, color: colours.muted }}>
                            {t(`avg ${bh.avg} min · ${bh.count} trips`, `moy ${bh.avg} min · ${bh.count} trajets`)}
                          </Text>
                        </View>
                        {i === 0 && (
                          <View style={{ backgroundColor: colours.tintBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>{t('Fastest', 'Plus rapide')}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {trips.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center' }}>
                  {t('Plan a trip to start seeing insights here.', 'Planifiez un trajet pour voir les statistiques ici.')}
                </Text>
              </View>
            )}

            {/* ── Transit Memory ── */}
            <View style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="analytics-outline" size={14} color={colours.accent} />
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: colours.accent }}>
                {t('TRANSIT MEMORY', 'M\u00c9MOIRE DE TRANSIT')}
              </Text>
            </View>

            {!memoryUnlocked ? (
              /* Empty state - fewer than 5 trips */
              <Card>
                <View style={{ padding: 20, alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time-outline" size={22} color={colours.accent} />
                  </View>
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, textAlign: 'center' }}>
                    {t('Your memory starts today', 'Votre m\u00e9moire commence aujourd\u2019hui')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', lineHeight: 18 }}>
                    {t(
                      `Take ${5 - totalTrips} more trip${5 - totalTrips !== 1 ? 's' : ''} to unlock your transit patterns.`,
                      `Faites ${5 - totalTrips} trajet${5 - totalTrips !== 1 ? 's' : ''} de plus pour d\u00e9bloquer vos habitudes.`
                    )}
                  </Text>
                </View>
              </Card>
            ) : (
              <>
                {/* City explorer */}
                {topNeighbourhoods.length > 0 && (
                  <Card>
                    <View style={{ padding: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <Ionicons name="map-outline" size={14} color={colours.muted} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, letterSpacing: 0.8 }}>
                          {t('CITY EXPLORER', 'EXPLORATEUR DE VILLE')}
                        </Text>
                      </View>
                      {topNeighbourhoods.map(([name, count], i) => (
                        <View key={name} style={{ marginBottom: i < topNeighbourhoods.length - 1 ? 10 : 0 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }}>{name}</Text>
                            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                              {count} {t('visit', 'visite')}{count !== 1 ? 's' : ''}
                            </Text>
                          </View>
                          <View style={{ height: 4, backgroundColor: colours.border, borderRadius: 2 }}>
                            <View style={{
                              height: 4, borderRadius: 2,
                              backgroundColor: colours.accent,
                              width: `${Math.round((count / maxNeighbourhoodCount) * 100)}%` as `${number}%`,
                            }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </Card>
                )}

                {/* Route loyalty */}
                {topRouteEntry && (
                  <Card>
                    <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="bus-outline" size={20} color={colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, marginBottom: 3 }}>
                          {t('ROUTE LOYALTY', 'FID\u00c9LIT\u00c9 DE LIGNE')}
                        </Text>
                        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                          {t(
                            `You're a Route ${topRouteEntry[0]} regular`,
                            `Vous \u00eates r\u00e9gulier sur la ligne ${topRouteEntry[0]}`
                          )}
                        </Text>
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                          {topRouteEntry[1]} {t('trips on this route', 'trajets sur cette ligne')}
                        </Text>
                      </View>
                    </View>
                  </Card>
                )}

                {/* Time patterns */}
                {peakHour && dayRangeLabel && (
                  <Card>
                    <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F59E0B18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="time-outline" size={20} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, marginBottom: 3 }}>
                          {t('TIME PATTERNS', 'HABITUDES HORAIRES')}
                        </Text>
                        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                          {t(
                            `Usually ${dayRangeLabel} ${parseInt(peakHour[0], 10)}–${parseInt(peakHour[0], 10) + 1}${parseInt(peakHour[0], 10) >= 12 ? 'pm' : 'am'}`,
                            `G\u00e9n\u00e9ralement ${dayRangeLabel} ${parseInt(peakHour[0], 10)}h\u2013${parseInt(peakHour[0], 10) + 1}h`
                          )}
                        </Text>
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                          {t('Your most common travel window', 'Votre plage horaire la plus fr\u00e9quente')}
                        </Text>
                      </View>
                    </View>
                  </Card>
                )}

                {/* Hidden gem */}
                {hiddenGem && (
                  <Card>
                    <View style={{
                      padding: 16, borderLeftWidth: 3, borderLeftColor: colours.accent,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="compass-outline" size={20} color={colours.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent, letterSpacing: 0.8, marginBottom: 3 }}>
                            {t('HIDDEN GEM', 'QUARTIER \u00c0 D\u00c9COUVRIR')}
                          </Text>
                          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, lineHeight: 20 }}>
                            {t(
                              `You pass near ${hiddenGem.name} often but have never explored it`,
                              `Vous passez pr\u00e8s de ${hiddenGem.name} souvent mais ne l\u2019avez jamais explor\u00e9`
                            )}
                          </Text>
                          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4 }}>
                            {Math.round(hiddenGem.dist * 10) / 10} km {t('from your usual destination', 'de votre destination habituelle')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                )}

                {/* Transit stats */}
                <Card>
                  <View style={{ padding: 16 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, marginBottom: 14 }}>
                      {t('TRANSIT STATS', 'STATISTIQUES DE TRANSIT')}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>{totalTrips}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>{t('trips logged', 'trajets enregistr\u00e9s')}</Text>
                      </View>
                      <View style={{ width: 1, backgroundColor: colours.border }} />
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>{Math.round(totalDistKm)}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>{t('km traveled', 'km parcourus')}</Text>
                      </View>
                      <View style={{ width: 1, backgroundColor: colours.border }} />
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.accent }}>{co2SavedKg}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>kg CO₂ {t('saved', '\u00e9vit\u00e9')}</Text>
                      </View>
                    </View>
                  </View>
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureHint={t('Unlock Commute Insights to see your top routes and trends', 'Debloquez les statistiques pour voir vos trajets et tendances')}
      />
    </View>
  );
}
