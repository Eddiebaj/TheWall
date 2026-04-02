import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { SK_TRIP_HISTORY, SK_CO2_TOTAL } from '../lib/storageKeys';

// ── Types ────────────────────────────────────────────────────────

type Trip = {
  id: string;
  fromLabel: string;
  toLabel: string;
  fromLat: number; fromLng: number;
  toLat: number; toLng: number;
  durationMins: number;
  distanceKm?: number;
  plannedAt: string;
};

type DayStat = { day: string; trips: number; avgMins: number };
type RouteStat = { route: string; count: number; avgMins: number; bestMins: number };

// ── Helpers ──────────────────────────────────────────────────────

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDistanceKm(trip: Trip): number {
  if (trip.distanceKm && trip.distanceKm > 0) return trip.distanceKm;
  return haversineKm(trip.fromLat, trip.fromLng, trip.toLat, trip.toLng) * 1.3; // 1.3x road factor
}

const CO2_CAR_KG_PER_KM = 0.21;
const CO2_TRANSIT_KG_PER_KM = 0.089;

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

// ── Bar Chart ────────────────────────────────────────────────────

function BarChart({ data, maxVal, colour, labels, width }: {
  data: number[];
  maxVal: number;
  colour: string;
  labels: string[];
  width: number;
}) {
  const barW = Math.max(16, (width - 40) / data.length - 8);
  const chartH = 100;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={width - 40} height={chartH + 24}>
        {data.map((v, i) => {
          const h = maxVal > 0 ? (v / maxVal) * chartH : 0;
          const x = i * (barW + 8) + 4;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={chartH - h} width={barW} height={Math.max(h, 2)} rx={4} fill={colour} opacity={0.85} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', width: width - 40 }}>
        {labels.map((l, i) => (
          <Text key={i} style={{ width: barW + 8, textAlign: 'center', fontSize: 10, color: '#6b7f99', fontWeight: '600' }}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────

export default function InsightsScreen() {
  const { colours, fonts, t, language } = useApp();
  const router = useRouter();
  const isLight = colours.bg === '#f0f4f8' || colours.bg === '#ffffff';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [co2Total, setCo2Total] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(raw => {
      if (raw) { try { setTrips(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
    AsyncStorage.getItem(SK_CO2_TOTAL).then(raw => {
      if (raw) setCo2Total(parseFloat(raw) || 0);
    }).catch(() => {});
  }, []);

  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeekTrips = trips.filter(t => new Date(t.plannedAt) >= thisWeekStart);
  const lastWeekTrips = trips.filter(t => {
    const d = new Date(t.plannedAt);
    return d >= lastWeekStart && d < thisWeekStart;
  });

  // Day-of-week stats
  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const dayStats: DayStat[] = Array.from({ length: 7 }, (_, i) => {
    const dayTrips = trips.filter(tr => new Date(tr.plannedAt).getDay() === i);
    const avg = dayTrips.length > 0 ? Math.round(dayTrips.reduce((s, tr) => s + tr.durationMins, 0) / dayTrips.length) : 0;
    return { day: dayNames[i], trips: dayTrips.length, avgMins: avg };
  });

  // Route stats
  const routeMap = new Map<string, { count: number; totalMins: number; bestMins: number }>();
  trips.forEach(tr => {
    const key = `${tr.fromLabel} → ${tr.toLabel}`;
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

  // CO2
  const thisMonthTrips = trips.filter(tr => {
    const d = new Date(tr.plannedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthCo2Saved = thisMonthTrips.reduce((sum, tr) => {
    const km = getDistanceKm(tr);
    return sum + (CO2_CAR_KG_PER_KM - CO2_TRANSIT_KG_PER_KM) * km;
  }, 0);
  const allTimeCo2 = co2Total + trips.reduce((sum, tr) => sum + (CO2_CAR_KG_PER_KM - CO2_TRANSIT_KG_PER_KM) * getDistanceKm(tr), 0);
  const treesEquiv = Math.max(0.1, allTimeCo2 / 21); // ~21 kg CO2 per tree per year

  const chartWidth = 320;
  const maxDayTrips = Math.max(...dayStats.map(d => d.trips), 1);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{
      borderWidth: 1, borderColor: colours.border, borderRadius: 16,
      marginHorizontal: 20, marginBottom: 16, overflow: 'hidden',
      backgroundColor: colours.surface,
    }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colours.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text, flex: 1 }}>
            {t('Commute Insights', 'Statistiques de trajet')}
          </Text>
          <Ionicons name="stats-chart" size={20} color={colours.accent} />
        </View>

        {/* This Week vs Last Week */}
        <Card>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 12, letterSpacing: 1 }}>
              {t('THIS WEEK', 'CETTE SEMAINE')}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.accent }}>{thisWeekTrips.length}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('trips', 'trajets')}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>
                  {thisWeekTrips.length > 0 ? Math.round(thisWeekTrips.reduce((s, tr) => s + tr.durationMins, 0) / thisWeekTrips.length) : 0}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('min avg', 'min moy')}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>
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

        {/* Trips by Day of Week */}
        {trips.length > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 16, letterSpacing: 1 }}>
                {t('TRIPS BY DAY', 'TRAJETS PAR JOUR')}
              </Text>
              <BarChart
                data={dayStats.map(d => d.trips)}
                maxVal={maxDayTrips}
                colour={colours.accent}
                labels={dayStats.map(d => d.day)}
                width={chartWidth}
              />
            </View>
          </Card>
        )}

        {/* Average Duration by Day */}
        {trips.length > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 16, letterSpacing: 1 }}>
                {t('AVG DURATION BY DAY', 'DUREE MOY PAR JOUR')}
              </Text>
              <BarChart
                data={dayStats.map(d => d.avgMins)}
                maxVal={Math.max(...dayStats.map(d => d.avgMins), 1)}
                colour={colours.accentAlt}
                labels={dayStats.map(d => d.day)}
                width={chartWidth}
              />
            </View>
          </Card>
        )}

        {/* Top Routes */}
        {routeStats.length > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 12, letterSpacing: 1 }}>
                {t('TOP ROUTES', 'TRAJETS FREQUENTS')}
              </Text>
              {routeStats.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.accent, width: 28 }}>#{i + 1}</Text>
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

        {/* Best Departure Times */}
        {bestHours.length > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginBottom: 12, letterSpacing: 1 }}>
                {t('BEST DEPARTURE TIMES', 'MEILLEURS HORAIRES')}
              </Text>
              {bestHours.map((bh, i) => {
                const label = `${bh.hour}:00`;
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="time-outline" size={16} color={colours.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{label}</Text>
                      <Text style={{ fontSize: 10, color: colours.muted }}>
                        {t(`avg ${bh.avg} min · ${bh.count} trips`, `moy ${bh.avg} min · ${bh.count} trajets`)}
                      </Text>
                    </View>
                    {i === 0 && (
                      <View style={{ backgroundColor: colours.accent + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>{t('Fastest', 'Plus rapide')}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* CO2 Tracker */}
        <Card>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="leaf" size={18} color="#2D8659" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, letterSpacing: 1 }}>
                {t('CO2 TRACKER', 'SUIVI CO2')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: '#2D8659' }}>
                  {monthCo2Saved < 10 ? monthCo2Saved.toFixed(1) : Math.round(monthCo2Saved)}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('kg saved this month', 'kg economises ce mois')}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>
                  {allTimeCo2 < 10 ? allTimeCo2.toFixed(1) : Math.round(allTimeCo2)}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('kg total', 'kg total')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colours.border }}>
              <Ionicons name="leaf" size={14} color="#2D8659" />
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                {t(
                  `Equivalent to planting ${treesEquiv.toFixed(1)} trees`,
                  `Equivalent a planter ${treesEquiv.toFixed(1)} arbres`
                )}
              </Text>
            </View>
          </View>
        </Card>

        {/* Empty state */}
        {trips.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
            <Ionicons name="analytics-outline" size={48} color={colours.muted} />
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginTop: 16, textAlign: 'center' }}>
              {t('No trips yet', 'Aucun trajet')}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 8, textAlign: 'center' }}>
              {t('Plan a trip to start seeing insights here.', 'Planifiez un trajet pour voir les statistiques ici.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
