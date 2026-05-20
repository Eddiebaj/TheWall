import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.35;

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

interface DiscoverEvent {
  id: string;
  poster_url: string | null;
  title: string;
  venue_name: string;
  neighbourhood: string | null;
  cover_charge: string | null;
  event_date: string | null;
  start_time: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isTonight(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

function isThisWeek(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  const diffMs = d.getTime() - today.setHours(0, 0, 0, 0);
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sort, setSort] = useState<SortOption>('Tonight');
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('id, title, poster_url, event_date, start_time, cover_charge, venues(name, neighbourhood)')
      .order('event_date', { ascending: true })
      .limit(50);

    if (!error && data) {
      setEvents(data.map((e: any) => ({
        id: e.id,
        poster_url: e.poster_url || null,
        title: e.title,
        venue_name: e.venues?.name || '',
        neighbourhood: e.venues?.neighbourhood || null,
        cover_charge: e.cover_charge || null,
        event_date: e.event_date || null,
        start_time: e.start_time || null,
      })));
    }
    setLoading(false);
  };

  const filtered = events;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => setSort(opt)}
              style={[styles.sortBtn, sort === opt && styles.sortBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortBtnText, sort === opt && styles.sortBtnTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FF3B5C" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '600' }}>
            No events {sort === 'Tonight' ? 'tonight' : 'this week'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/event/${item.id}` as any)}
            >
              {item.poster_url ? (
                <Image source={{ uri: item.poster_url }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImage, { backgroundColor: '#2a2a2a' }]} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                style={styles.cardGradient}
              >
                <View style={styles.cardTopRow}>
                  {item.neighbourhood && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{item.neighbourhood}</Text>
                    </View>
                  )}
                  {item.cover_charge && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{item.cover_charge}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardVenue} numberOfLines={1}>{item.venue_name}</Text>
                  <Text style={styles.cardEvent} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardDatetime}>
                    {[formatDate(item.event_date), item.start_time].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  sortBtnActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  sortBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  grid: {
    paddingHorizontal: CARD_MARGIN,
    paddingBottom: 24,
  },
  row: {
    gap: CARD_MARGIN,
    marginBottom: CARD_MARGIN,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '55%',
  },
  pillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  cardBottom: {
    gap: 1,
  },
  cardVenue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  cardEvent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  cardDatetime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    marginTop: 2,
  },
});
