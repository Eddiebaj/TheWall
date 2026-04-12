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
