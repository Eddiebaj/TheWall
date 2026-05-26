import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Concerts':      'musical-notes',
  'Nightlife':     'moon',
  'Comedy':        'happy',
  'Art & Culture': 'color-palette',
  'Sports':        'football',
  'Food & Drinks': 'restaurant',
  'Outdoor':       'leaf',
  'Networking':    'people',
  'Social':        'sparkles',
};

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

function EventRow({ event, onPress, categoryIcon }: { event: CategoryEvent; onPress: () => void; categoryIcon: keyof typeof Ionicons.glyphMap }) {
  const isFeatured = event.venue_feature_tier === 'featured';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.row}>
      <View style={styles.rowPoster}>
        {event.poster_url ? (
          <Image source={{ uri: event.poster_url }} style={styles.rowImage} />
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name={categoryIcon} size={24} color="#555" />
          </View>
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.rowVenue} numberOfLines={1}>
          {isFeatured && <Text style={styles.featuredTag}>Featured  </Text>}
          {event.venue_name}
          {event.neighbourhood ? `  ·  ${event.neighbourhood}` : ''}
        </Text>
        {event.event_date && (
          <Text style={styles.rowDate}>
            {formatDate(event.event_date)}
            {event.start_time ? `  ·  ${formatTime(event.start_time)}` : ''}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#555" />
    </TouchableOpacity>
  );
}

export default function CategoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const categoryName = decodeURIComponent(name ?? '');
  const categoryIcon = CATEGORY_ICONS[categoryName] ?? 'calendar';

  const [events, setEvents] = useState<CategoryEvent[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select('id, title, poster_url, date, start_time, venue_id, venues(name, neighbourhood, feature_tier)')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(400),
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, event_time, category, venue_id, source, visibility, venues(name, neighbourhood, feature_tier)')
        .in('source', ['user', 'ticketmaster'])
        .neq('visibility', 'friends')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(400),
    ]);

    const legacy: CategoryEvent[] = (legacyRes.data ?? [])
      .filter((e: any) => deriveCategory(e.title, e.venues?.name || '') === categoryName)
      .map((e: any) => ({
        id: e.id, title: e.title, poster_url: e.poster_url || null,
        event_date: e.date || null, start_time: e.start_time || null,
        venue_name: e.venues?.name || '', neighbourhood: e.venues?.neighbourhood || null,
        venue_feature_tier: e.venues?.feature_tier ?? null,
      }));

    const ve: CategoryEvent[] = (veRes.data ?? [])
      .filter((e: any) => {
        const cat = e.category || deriveCategory(e.title, e.venues?.name || '');
        return cat === categoryName;
      })
      .map((e: any) => ({
        id: e.id, title: e.title, poster_url: e.poster_url || null,
        event_date: e.event_date || null, start_time: e.event_time || null,
        venue_name: e.venues?.name || '', neighbourhood: e.venues?.neighbourhood || null,
        venue_feature_tier: e.venues?.feature_tier ?? null,
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
        <Text style={styles.headerTitle}>{categoryName}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No upcoming events</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          renderItem={({ item }) => (
            <EventRow
              event={item}
              onPress={() => router.push(`/event/${item.id}`)}
              categoryIcon={categoryIcon}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPoster: {
    width: 72,
    height: 96,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e1e2e',
  },
  rowImage: {
    width: 72,
    height: 96,
    resizeMode: 'cover',
  },
  rowImagePlaceholder: {
    width: 72,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e2e',
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  rowVenue: {
    color: '#888',
    fontSize: 13,
  },
  featuredTag: {
    color: '#e53935',
    fontWeight: '700',
  },
  rowDate: {
    color: '#666',
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 100,
  },
});
