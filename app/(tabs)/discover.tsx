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
const AVATAR_SIZE = 20;
const AVATAR_OVERLAP = 6;

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

interface AttendeeInfo {
  count: number;
  avatars: { id: string; username: string; avatar_url: string | null }[];
}

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
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sort, setSort] = useState<SortOption>('Tonight');
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [attendees, setAttendees] = useState<Record<string, AttendeeInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents(sort);
  }, [sort]);

  const loadEvents = async (activeSort: SortOption) => {
    setLoading(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const weekOutDate = new Date(now);
    weekOutDate.setDate(now.getDate() + 7);
    const weekOut = `${weekOutDate.getFullYear()}-${pad(weekOutDate.getMonth() + 1)}-${pad(weekOutDate.getDate())}`;

    let query = supabase
      .from('events')
      .select('id, title, poster_url, date, venues(name, neighbourhood)')
      .order('date', { ascending: true })
      .limit(50);

    if (activeSort === 'Tonight') {
      query = query.eq('date', today);
    } else if (activeSort === 'This Week') {
      query = query.gte('date', today).lte('date', weekOut);
    }

    const { data, error } = await query;

    if (!error && data) {
      const mapped: DiscoverEvent[] = data.map((e: any) => ({
        id: e.id,
        poster_url: e.poster_url || null,
        title: e.title,
        venue_name: e.venues?.name || '',
        neighbourhood: e.venues?.neighbourhood || null,
        cover_charge: e.cover_charge || null,
        event_date: e.date || null,
        start_time: e.start_time || null,
      }));
      setEvents(mapped);
      loadAttendees(mapped.map(e => e.id));
    }
    setLoading(false);
  };

  const loadAttendees = async (eventIds: string[]) => {
    if (eventIds.length === 0) return;

    const { data } = await supabase
      .from('event_rsvps')
      .select('event_id, profiles(id, username, avatar_url)')
      .in('event_id', eventIds)
      .eq('status', 'going');

    if (!data) return;

    const map: Record<string, AttendeeInfo> = {};
    for (const row of data as any[]) {
      const eid = row.event_id;
      if (!map[eid]) map[eid] = { count: 0, avatars: [] };
      map[eid].count += 1;
      if (map[eid].avatars.length < 3 && row.profiles) {
        map[eid].avatars.push(row.profiles);
      }
    }
    setAttendees(map);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

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
      ) : events.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '600' }}>
            No events {sort === 'Tonight' ? 'tonight' : 'this week'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 100 }]}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => {
            const info = attendees[item.id];
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/event/${item.id}` as any)}
              >
                <Image
                  source={{ uri: item.poster_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
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
                    {info && info.count > 0 && (
                      <View style={styles.attendeeRow}>
                        <View style={{ flexDirection: 'row', height: AVATAR_SIZE, width: info.avatars.length * (AVATAR_SIZE - AVATAR_OVERLAP) + AVATAR_OVERLAP }}>
                          {info.avatars.map((a, i) => (
                            <View
                              key={a.id}
                              style={[styles.avatar, {
                                left: i * (AVATAR_SIZE - AVATAR_OVERLAP),
                                zIndex: info.avatars.length - i,
                              }]}
                            >
                              {a.avatar_url ? (
                                <Image source={{ uri: a.avatar_url }} style={styles.avatarImage} />
                              ) : (
                                <Text style={styles.avatarInitial}>{a.username[0].toUpperCase()}</Text>
                              )}
                            </View>
                          ))}
                        </View>
                        <Text style={styles.goingText}>{info.count} going</Text>
                      </View>
                    )}
                    <Text style={styles.cardVenue} numberOfLines={1}>{item.venue_name}</Text>
                    <Text style={styles.cardEvent} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.cardDatetime}>
                      {[formatDate(item.event_date), item.start_time].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          }}
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
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  avatar: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#FF3B5C',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.6)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  goingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
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
