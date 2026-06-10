import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_PADDING = 16;
const CARD_W = (SCREEN_W - CARD_PADDING * 2 - CARD_GAP) / 2;
const CARD_H = CARD_W * 1.3;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Concerts':      'musical-notes',
  'Nightlife':     'moon',
  'Comedy':        'happy',
  'Art & Culture': 'color-palette',
  'Sports':        'football',
  'Food & Drinks': 'restaurant',
  'Outdoor':       'leaf',
  'Networking':    'people',
  'Bar':           'beer',
};

const FILTERS = ['All', 'Today', 'This Week', 'This Weekend', 'Free'] as const;
type Filter = typeof FILTERS[number];

function deriveCategory(title: string, venueName: string): string | null {
  const text = `${title} ${venueName}`.toLowerCase();
  if (/concert|tour|music|band|festival|live music/.test(text)) return 'Concerts';
  if (/comedy|stand.?up|laugh/.test(text)) return 'Comedy';
  if (/sport|jays|leafs|raptors|argonauts|\bfc\b|\bvs\.?\b|hockey|baseball|basketball|football/.test(text)) return 'Sports';
  if (/theatre|theater|musical|dance|ballet|opera|art|gallery|exhibit/.test(text)) return 'Art & Culture';
  if (/nightlife|club|dj\b|rave|lounge|bar crawl/.test(text)) return 'Nightlife';
  if (/food|drink|wine|beer|tasting|brunch|dinner|restaurant/.test(text)) return 'Food & Drinks';
  if (/outdoor|hike|run|walk|park|trail/.test(text)) return 'Outdoor';
  if (/network|meetup|conference|summit|workshop|talk/.test(text)) return 'Networking';
  return null;
}

interface CategoryEvent {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  venue_name: string;
  neighbourhood: string | null;
  venue_feature_tier: 'basic' | 'pro' | 'featured' | null;
  entry_type: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function EventCard({ event, onPress, categoryIcon }: {
  event: CategoryEvent;
  onPress: () => void;
  categoryIcon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card}>
      {event.poster_url ? (
        <Image source={{ uri: event.poster_url }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name={categoryIcon} size={36} color="#555" />
        </View>
      )}
      <View style={styles.cardOverlay} />
      <View style={styles.cardBottom}>
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        {event.event_date ? (
          <Text style={styles.cardDate}>
            {formatDate(event.event_date)}
            {event.start_time ? `  ·  ${formatTime(event.start_time)}` : ''}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function getWeekend(): [string, string] {
  const now = new Date();
  const day = now.getDay(); // 0=Sun,6=Sat
  const daysToSat = (6 - day + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return [fmt(sat), fmt(sun)];
}

function applyFilter(events: CategoryEvent[], filter: Filter): CategoryEvent[] {
  if (filter === 'All') return events;
  if (filter === 'Free') return events.filter(e => e.entry_type === 'free' || e.entry_type === 'Free');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (filter === 'Today') return events.filter(e => e.event_date === today);
  if (filter === 'This Week') {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 6);
    const weekEndStr = `${weekEnd.getFullYear()}-${pad(weekEnd.getMonth() + 1)}-${pad(weekEnd.getDate())}`;
    return events.filter(e => e.event_date && e.event_date >= today && e.event_date <= weekEndStr);
  }
  if (filter === 'This Weekend') {
    const [sat, sun] = getWeekend();
    return events.filter(e => e.event_date === sat || e.event_date === sun);
  }
  return events;
}

export default function CategoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const categoryName = decodeURIComponent(name ?? '');
  const categoryIcon: keyof typeof Ionicons.glyphMap = categoryName === 'all' ? 'sparkles' : (CATEGORY_ICONS[categoryName] ?? 'calendar');
  const displayName = categoryName === 'all' ? 'All Events' : categoryName;

  const [events, setEvents] = useState<CategoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Filter>('All');

  const isAll = categoryName === 'all';

  useEffect(() => {
    if (categoryName) loadEvents();
  }, [categoryName]);

  const loadEvents = async () => {
    setLoading(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [legacyRes, veRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, poster_url, date, start_time, entry_type, venue_id, venues(name, neighbourhood, feature_tier)')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(400),
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, event_time, entry_type, category, venue_id, source, visibility, venues(name, neighbourhood, feature_tier)')
        .in('source', ['user', 'ticketmaster'])
        .neq('visibility', 'friends')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(400),
    ]);

    const legacy: CategoryEvent[] = (legacyRes.data ?? [])
      .filter((e: any) => isAll || deriveCategory(e.title, e.venues?.name || '') === categoryName)
      .map((e: any) => ({
        id: e.id, title: e.title, poster_url: e.poster_url || null,
        event_date: e.date || null, start_time: e.start_time || null,
        venue_name: e.venues?.name || '', neighbourhood: e.venues?.neighbourhood || null,
        venue_feature_tier: e.venues?.feature_tier ?? null,
        entry_type: e.entry_type || null,
      }));

    const ve: CategoryEvent[] = (veRes.data ?? [])
      .filter((e: any) => {
        if (isAll) return true;
        const cat = e.category || deriveCategory(e.title, e.venues?.name || '');
        return cat === categoryName;
      })
      .map((e: any) => ({
        id: e.id, title: e.title, poster_url: e.poster_url || null,
        event_date: e.event_date || null, start_time: e.event_time || null,
        venue_name: e.venues?.name || '', neighbourhood: e.venues?.neighbourhood || null,
        venue_feature_tier: e.venues?.feature_tier ?? null,
        entry_type: e.entry_type || null,
      }));

    const seen = new Set<string>();
    const merged: CategoryEvent[] = [];
    for (const ev of [...legacy, ...ve]) {
      if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
    }

    merged.sort((a, b) => {
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return a.event_date.localeCompare(b.event_date);
    });

    setEvents(merged);
    setLoading(false);
  };

  const filtered = useMemo(() => applyFilter(events, activeFilter), [events, activeFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Ionicons name={categoryIcon} size={22} color="#fff" />
        <Text style={styles.headerTitle}>{displayName}</Text>
      </View>

      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setActiveFilter(f)}
            style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, activeFilter === f && styles.filterPillTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No upcoming events</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => {
                if (__DEV__) console.log('[CategoryScreen] navigating to event id:', item.id);
                router.push(`/event/${item.id}`);
              }}
              categoryIcon={categoryIcon}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: CARD_PADDING, paddingBottom: insets.bottom + 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterPillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  filterPillText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 16,
  },
  columnWrapper: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: CARD_W,
    height: CARD_H,
    resizeMode: 'cover',
    position: 'absolute',
  },
  cardImagePlaceholder: {
    width: CARD_W,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e2e',
    position: 'absolute',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_H * 0.55,
    backgroundColor: 'transparent',
    // gradient-like fade via shadow
  },
  cardBottom: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '400',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
