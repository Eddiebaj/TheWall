import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

interface EventResult {
  id: string;
  title: string;
  venue_name: string;
  event_date: string | null;
}

interface VenueResult {
  id: string;
  name: string;
  neighbourhood: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<EventResult[]>([]);
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setEvents([]);
      setVenues([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      runSearch(query.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const runSearch = async (q: string) => {
    const pattern = `%${q}%`;

    const [eventsRes, venuesRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, date, venues(name)')
        .ilike('title', pattern)
        .limit(20),
      supabase
        .from('venues')
        .select('id, name, neighbourhood')
        .or(`name.ilike.${pattern},neighbourhood.ilike.${pattern}`)
        .limit(20),
    ]);

    if (eventsRes.data) {
      setEvents(
        eventsRes.data.map((e: any) => ({
          id: e.id,
          title: e.title,
          venue_name: e.venues?.name || '',
          event_date: e.date || null,
        }))
      );
    }

    if (venuesRes.data) {
      setVenues(
        venuesRes.data.map((v: any) => ({
          id: v.id,
          name: v.name,
          neighbourhood: v.neighbourhood || null,
        }))
      );
    }

    setLoading(false);
  };

  const sections = [
    ...(events.length > 0 ? [{ title: 'Events', data: events, type: 'event' as const }] : []),
    ...(venues.length > 0 ? [{ title: 'Venues', data: venues, type: 'venue' as const }] : []),
  ];

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && !loading && events.length === 0 && venues.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Events, venues, neighbourhoods…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {!hasQuery ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Search for events, venues, or neighbourhoods</Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#FF3B5C" />
        </View>
      ) : noResults ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No results for "{query}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, section }) => {
            if (section.type === 'event') {
              const ev = item as EventResult;
              return (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/event/${ev.id}` as any)}
                >
                  <View style={styles.rowIconWrap}>
                    <Ionicons name="calendar-outline" size={18} color="#FF3B5C" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{ev.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[ev.venue_name, formatDate(ev.event_date)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                </TouchableOpacity>
              );
            }
            const vn = item as VenueResult;
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.75}
                onPress={() => router.push(`/venue/${vn.id}` as any)}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="location-outline" size={18} color="#FF3B5C" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{vn.name}</Text>
                  {vn.neighbourhood && (
                    <Text style={styles.rowSub} numberOfLines={1}>{vn.neighbourhood}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  searchIcon: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  cancelBtn: {
    paddingVertical: 6,
  },
  cancelText: {
    color: '#FF3B5C',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,59,92,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
});
