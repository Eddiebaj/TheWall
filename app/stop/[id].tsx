import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';

type Arrival = {
  routeId: string;
  headsign: string;
  minsAway: number;
  scheduledTime?: string;
  tripId?: string;
};

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colours, fonts, t } = useApp();
  const router = useRouter();

  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<string>('');
  const [stopName, setStopName] = useState('');

  const fetchArrivals = useCallback(async (isRefresh = false) => {
    if (!id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${id}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setArrivals(data.arrivals || []);
      setSource(data.source || '');
      if (data.stopName) setStopName(data.stopName);
    } catch (e: any) {
      setError(t('Failed to load arrivals', 'Impossible de charger les arrivees'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchArrivals();
    const interval = setInterval(() => fetchArrivals(), 30000);
    return () => clearInterval(interval);
  }, [fetchArrivals]);

  const isLive = source === 'gtfs-rt' || source === 'sto-gtfs-rt';
  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight
    ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }
    : {};

  const renderArrival = ({ item }: { item: Arrival }) => {
    const mins = Math.round(item.minsAway);
    const isNow = mins <= 1;
    return (
      <View style={[styles.arrivalRow, { backgroundColor: colours.surface, borderColor: colours.border }, cardShadow]}>
        <View style={[styles.routeBadge, { backgroundColor: colours.accent }]}>
          <Text style={[styles.routeText, { fontSize: fonts.md }]}>{item.routeId}</Text>
        </View>
        <View style={styles.arrivalInfo}>
          <Text style={[styles.headsign, { color: colours.text, fontSize: fonts.md }]} numberOfLines={1}>
            {item.headsign || t('Unknown', 'Inconnu')}
          </Text>
          {item.scheduledTime ? (
            <Text style={[styles.scheduled, { color: colours.muted, fontSize: fonts.sm }]}>
              {item.scheduledTime}
            </Text>
          ) : null}
        </View>
        <View style={styles.timeBox}>
          <Text style={[styles.minsText, { color: isNow ? colours.green : colours.text, fontSize: fonts.lg }]}>
            {isNow ? t('NOW', 'MAINT.') : `${mins}`}
          </Text>
          {!isNow && (
            <Text style={[styles.minLabel, { color: colours.muted, fontSize: fonts.sm }]}>
              {t('min', 'min')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colours.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colours.bg },
          headerTintColor: colours.text,
          headerTitle: stopName || `${t('Stop', 'Arret')} #${id}`,
          headerTitleStyle: { fontWeight: '700', fontSize: fonts.lg },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" size={24} color={colours.text} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Live indicator */}
      <View style={styles.headerRow}>
        <View style={styles.stopInfo}>
          <Ionicons name="bus" size={20} color={colours.accent} />
          <Text style={[styles.stopId, { color: colours.muted, fontSize: fonts.md }]}>
            #{id}
          </Text>
        </View>
        {isLive && (
          <View style={styles.liveTag}>
            <View style={[styles.liveDot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.liveText, { fontSize: fonts.sm }]}>
              {t('Real-time', 'Temps reel')}
            </Text>
          </View>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colours.accent} />
          <Text style={[styles.loadingText, { color: colours.muted, fontSize: fonts.md }]}>
            {t('Loading arrivals...', 'Chargement des arrivees...')}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning" size={40} color={colours.orange} />
          <Text style={[styles.errorText, { color: colours.text, fontSize: fonts.md }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchArrivals()} style={[styles.retryBtn, { backgroundColor: colours.accent }]}>
            <Text style={[styles.retryText, { fontSize: fonts.md }]}>{t('Retry', 'Reessayer')}</Text>
          </TouchableOpacity>
        </View>
      ) : arrivals.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={40} color={colours.muted} />
          <Text style={[styles.emptyText, { color: colours.muted, fontSize: fonts.md }]}>
            {t('No upcoming arrivals', 'Aucune arrivee prevue')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={arrivals}
          keyExtractor={(item, i) => `${item.routeId}-${item.headsign}-${i}`}
          renderItem={renderArrival}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchArrivals(true)}
              tintColor={colours.accent}
              colors={[colours.accent]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  stopInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopId: { fontWeight: '600' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: '#22c55e', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  loadingText: { marginTop: 8 },
  errorText: { textAlign: 'center', fontWeight: '500' },
  emptyText: { textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  arrivalRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14,
    borderWidth: 1, marginBottom: 10, gap: 12,
  },
  routeBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    minWidth: 44, alignItems: 'center',
  },
  routeText: { color: '#fff', fontWeight: '800' },
  arrivalInfo: { flex: 1 },
  headsign: { fontWeight: '600' },
  scheduled: { marginTop: 2 },
  timeBox: { alignItems: 'center', minWidth: 48 },
  minsText: { fontWeight: '800' },
  minLabel: { fontWeight: '500' },
});
