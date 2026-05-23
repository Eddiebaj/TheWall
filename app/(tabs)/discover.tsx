import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../lib/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.35;
const AVATAR_SIZE = 20;
const AVATAR_OVERLAP = 6;

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

const CATEGORY_FILTERS = ['All', 'Concerts', 'Nightlife', 'Comedy', 'Art', 'Sports', 'Food', 'Outdoor'] as const;
type CategoryFilter = typeof CATEGORY_FILTERS[number];

const CATEGORY_MAP: Record<string, string> = {
  Concerts: 'Concerts',
  Nightlife: 'Nightlife',
  Comedy: 'Comedy',
  Art: 'Art & Culture',
  Sports: 'Sports',
  Food: 'Food & Drinks',
  Outdoor: 'Outdoor',
};

const NEIGHBOURHOODS = [
  'All', 'King West', 'Queen West', 'Entertainment District',
  'Dundas West', 'Kensington', 'Bloor', 'College', 'West Queen West',
] as const;

const ENTRY_FILTERS = ['All', 'Free', 'Guestlist', 'Tickets', 'Bottle Service'] as const;
type EntryFilter = typeof ENTRY_FILTERS[number];

interface AttendeeInfo {
  count: number;
  avatars: { id: string; username: string; avatar_url: string | null }[];
}

interface DiscoverEvent {
  id: string;
  poster_url: string | null;
  title: string;
  venue_id: string | null;
  venue_name: string;
  neighbourhood: string | null;
  cover_charge: string | null;
  entry_type: string | null;
  category: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_feature_tier: 'basic' | 'pro' | 'featured' | null;
}

function getFeatureMultiplier(tier: DiscoverEvent['venue_feature_tier']): number {
  if (tier === 'featured') return 3;
  if (tier === 'pro') return 2;
  if (tier === 'basic') return 1.5;
  return 1;
}

const TORONTO = { lat: 43.6532, lng: -79.3832 };

function VenuePin({
  event,
  selected,
  onPress,
}: {
  event: DiscoverEvent;
  selected: boolean;
  onPress: () => void;
}) {
  const featured = event.venue_feature_tier != null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: featured ? '#1f1a00' : '#1a1a1a',
        borderWidth: featured ? 2 : 1,
        borderColor: featured ? '#FFD700' : '#444',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: 130,
        opacity: selected ? 1 : 0.9,
        transform: [{ scale: selected ? 1.12 : 1 }],
        shadowColor: featured ? '#FFD700' : '#000',
        shadowOpacity: featured ? 0.4 : 0.5,
        shadowRadius: featured ? 8 : 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: featured ? 8 : 3,
      }}
    >
      {featured && (
        <Text style={{ color: '#FFD700', fontSize: 9, lineHeight: 13 }}>★</Text>
      )}
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
        {event.venue_name}
      </Text>
    </TouchableOpacity>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isHappeningNow(event: DiscoverEvent): boolean {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (event.event_date !== today) return false;
  if (!event.start_time) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = timeToMinutes(event.start_time);
  const endMins = event.end_time ? timeToMinutes(event.end_time) : startMins + 180;
  return nowMins >= startMins && nowMins <= endMins;
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

const SKELETON_COLOR = '#1E2230';

function SkeletonGrid() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.skeletonGrid, { opacity }]}>
      {Array.from({ length: 2 }).map((_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: 2 }).map((__, col) => (
            <View key={col} style={styles.skeletonCard}>
              <View style={styles.skeletonImage} />
              <View style={styles.skeletonTextWide} />
              <View style={styles.skeletonTextNarrow} />
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { capture } = useAnalytics();
  const [sort, setSort] = useState<SortOption>('This Week');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [neighbourhoods, setNeighbourhoods] = useState<Set<string>>(new Set());
  const [entryFilters, setEntryFilters] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [attendees, setAttendees] = useState<Record<string, AttendeeInfo>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapMode, setMapMode] = useState(false);
  const [gridSort, setGridSort] = useState<'date' | 'popular'>('date');
  const [selectedEvent, setSelectedEvent] = useState<DiscoverEvent | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchHeightAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (selectedEvent) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedEvent]);

  useEffect(() => {
    loadEvents(sort);
  }, [sort]);

  useEffect(() => {
    if (user) loadSavedIds();
  }, [user]);

  const loadSavedIds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id);
    if (data) setSavedIds(new Set((data as any[]).map(r => r.event_id)));
  };

  const toggleSave = async (eventId: string) => {
    if (!user) return;
    const isSaved = savedIds.has(eventId);
    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev);
      isSaved ? next.delete(eventId) : next.add(eventId);
      return next;
    });
    if (isSaved) {
      await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', eventId);
    } else {
      capture('event_saved', { event_id: eventId });
      await supabase.from('saved_events').upsert({ user_id: user.id, event_id: eventId });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents(sort);
    setRefreshing(false);
  };

  const loadEvents = async (activeSort: SortOption) => {
    setLoading(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const weekOutDate = new Date(now);
    weekOutDate.setDate(now.getDate() + 7);
    const weekOut = `${weekOutDate.getFullYear()}-${pad(weekOutDate.getMonth() + 1)}-${pad(weekOutDate.getDate())}`;

    let legacyQuery = supabase
      .from('events')
      .select('id, title, poster_url, date, start_time, end_time, entry_type, category, venue_id, venues(name, neighbourhood, latitude, longitude, feature_tier)')
      .order('date', { ascending: true })
      .limit(50);

    let veQuery = supabase
      .from('venue_events')
      .select('id, title, poster_url, event_date, event_time, end_time, entry_type, category, venue_id, source, visibility, venues(name, neighbourhood, latitude, longitude, feature_tier)')
      .in('source', ['user', 'ticketmaster'])
      .neq('visibility', 'friends')
      .order('event_date', { ascending: true })
      .limit(50);

    if (activeSort === 'Tonight') {
      legacyQuery = legacyQuery.eq('date', today);
      veQuery = veQuery.eq('event_date', today);
    } else if (activeSort === 'This Week') {
      legacyQuery = legacyQuery.gte('date', today).lte('date', weekOut);
      veQuery = veQuery.gte('event_date', today).lte('event_date', weekOut);
    }

    const [legacyRes, veRes] = await Promise.all([legacyQuery, veQuery]);

    const legacyMapped: DiscoverEvent[] = (legacyRes.data ?? []).map((e: any) => ({
      id: e.id, poster_url: e.poster_url || null, title: e.title,
      venue_id: e.venue_id || null, venue_name: e.venues?.name || '',
      neighbourhood: e.venues?.neighbourhood || null, cover_charge: null,
      entry_type: e.entry_type || null, category: e.category || null,
      event_date: e.date || null, start_time: e.start_time || null,
      end_time: e.end_time || null, venue_lat: e.venues?.latitude ?? null,
      venue_lng: e.venues?.longitude ?? null, venue_feature_tier: e.venues?.feature_tier ?? null,
    }));

    const veMapped: DiscoverEvent[] = (veRes.data ?? []).map((e: any) => ({
      id: e.id, poster_url: e.poster_url || null, title: e.title,
      venue_id: e.venue_id || null, venue_name: e.venues?.name || '',
      neighbourhood: e.venues?.neighbourhood || null, cover_charge: null,
      entry_type: e.entry_type || null, category: e.category || null,
      event_date: e.event_date || null, start_time: e.event_time || null,
      end_time: e.end_time || null, venue_lat: e.venues?.latitude ?? null,
      venue_lng: e.venues?.longitude ?? null, venue_feature_tier: e.venues?.feature_tier ?? null,
    }));

    const seen = new Set<string>();
    const mapped: DiscoverEvent[] = [];
    for (const e of [...legacyMapped, ...veMapped]) {
      if (!seen.has(e.id)) { seen.add(e.id); mapped.push(e); }
    }

    setEvents(mapped);
    loadAttendees(mapped.map(e => e.id));
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

  const happeningNow = events.filter(isHappeningNow);

  const toggleSearch = () => {
    if (searchVisible) {
      setSearchQuery('');
      Animated.timing(searchHeightAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setSearchVisible(false));
    } else {
      setSearchVisible(true);
      Animated.timing(searchHeightAnim, { toValue: 52, duration: 200, useNativeDriver: false }).start(() => {
        searchInputRef.current?.focus();
      });
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    Animated.timing(searchHeightAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setSearchVisible(false));
  };

  const filteredEvents = (() => {
    let base = neighbourhoods.size === 0 ? events : events.filter(e => e.neighbourhood != null && neighbourhoods.has(e.neighbourhood));
    if (categoryFilter !== 'All') {
      const target = CATEGORY_MAP[categoryFilter];
      base = base.filter(e => e.category === target);
    }
    if (entryFilters.size > 0) {
      base = base.filter(e => e.entry_type != null && entryFilters.has(e.entry_type));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      base = base.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.venue_name.toLowerCase().includes(q) ||
        (e.neighbourhood ?? '').toLowerCase().includes(q)
      );
    }
    if (gridSort === 'popular') {
      return [...base].sort((a, b) => {
        const scoreA = (attendees[a.id]?.count ?? 0) * getFeatureMultiplier(a.venue_feature_tier);
        const scoreB = (attendees[b.id]?.count ?? 0) * getFeatureMultiplier(b.venue_feature_tier);
        return scoreB - scoreA;
      });
    }
    // Date sort: apply feature multiplier as a recency score boost
    const now = Date.now();
    return [...base].sort((a, b) => {
      const daysA = a.event_date ? (new Date(a.event_date).getTime() - now) / 86400000 : 999;
      const daysB = b.event_date ? (new Date(b.event_date).getTime() - now) / 86400000 : 999;
      const scoreA = getFeatureMultiplier(a.venue_feature_tier) / (Math.max(daysA, 0) + 1);
      const scoreB = getFeatureMultiplier(b.venue_feature_tier) / (Math.max(daysB, 0) + 1);
      return scoreB - scoreA;
    });
  })();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Discover</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={toggleSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={searchVisible ? 'search' : 'search'} size={22} color={searchVisible ? '#fff' : 'rgba(255,255,255,0.8)'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setMapMode(m => !m); setSelectedEvent(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 16 }}
            >
              <Ionicons
                name={mapMode ? 'grid-outline' : 'map-outline'}
                size={22}
                color="rgba(255,255,255,0.8)"
              />
            </TouchableOpacity>
          </View>
        </View>
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
          <TouchableOpacity
            onPress={() => setShowFilterSheet(true)}
            style={[styles.sortBtn, styles.filterBtn, (neighbourhoods.size > 0 || entryFilters.size > 0) && styles.filterBtnActive]}
            activeOpacity={0.8}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={(neighbourhoods.size > 0 || entryFilters.size > 0) ? '#FF3B5C' : 'rgba(255,255,255,0.6)'}
            />
            {(neighbourhoods.size > 0 || entryFilters.size > 0) && (
              <View style={styles.filterBadge} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
        style={styles.categoryScroll}
      >
        {CATEGORY_FILTERS.map(cat => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategoryFilter(cat)}
            style={[styles.categoryPill, categoryFilter === cat && styles.categoryPillActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.categoryPillText, categoryFilter === cat && styles.categoryPillTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Inline search bar */}
      <Animated.View style={{ height: searchHeightAnim, overflow: 'hidden', paddingHorizontal: 16 }}>
        {searchVisible && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1a1a1a',
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            gap: 8,
          }}>
            <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search events, venues..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={{ flex: 1, fontSize: 15, color: '#fff', paddingVertical: 0 }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
            {searchQuery.length === 0 && (
              <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>

      <Modal
        visible={showFilterSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterSheet(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterSheet(false)}
        />
        <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.filterSheetHandle} />

          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>Filters</Text>
            {(neighbourhoods.size > 0 || entryFilters.size > 0) && (
              <TouchableOpacity
                onPress={() => { setNeighbourhoods(new Set()); setEntryFilters(new Set()); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.filterClearText}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.filterSectionLabel}>NEIGHBOURHOOD</Text>
          <View style={styles.filterPillWrap}>
            {NEIGHBOURHOODS.map((n) => {
              const isAll = n === 'All';
              const isActive = isAll ? neighbourhoods.size === 0 : neighbourhoods.has(n);
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => {
                    if (isAll) {
                      setNeighbourhoods(new Set());
                    } else {
                      setNeighbourhoods(prev => {
                        const next = new Set(prev);
                        next.has(n) ? next.delete(n) : next.add(n);
                        return next;
                      });
                    }
                  }}
                  style={[styles.nbBtn, isActive && styles.nbBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.nbBtnText, isActive && styles.nbBtnTextActive]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.filterSectionLabel, { marginTop: 20 }]}>TYPE</Text>
          <View style={styles.filterPillWrap}>
            {ENTRY_FILTERS.map((f) => {
              const isAll = f === 'All';
              const isBottle = f === 'Bottle Service';
              const isActive = isAll ? entryFilters.size === 0 : entryFilters.has(f);
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => {
                    if (isAll) {
                      setEntryFilters(new Set());
                    } else {
                      setEntryFilters(prev => {
                        const next = new Set(prev);
                        next.has(f) ? next.delete(f) : next.add(f);
                        return next;
                      });
                    }
                  }}
                  style={[
                    styles.nbBtn,
                    isActive && (isBottle ? styles.entryBtnBottleActive : styles.nbBtnActive),
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.nbBtnText,
                    isActive && (isBottle ? styles.entryBtnBottleText : styles.nbBtnTextActive),
                    !isActive && isBottle && styles.entryBtnBottleInactive,
                  ]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => setShowFilterSheet(false)}
            style={styles.filterDoneBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.filterDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {loading ? (
        <SkeletonGrid />
      ) : mapMode ? (
        <View style={{ flex: 1 }}>
          {Platform.OS !== 'web' ? (
            <Mapbox.MapView
              style={{ flex: 1 }}
              styleURL="mapbox://styles/mapbox/dark-v11"
              onPress={() => setSelectedEvent(null)}
              logoEnabled={false}
              attributionEnabled={false}
              compassEnabled={false}
            >
              <Mapbox.Camera
                defaultSettings={{
                  centerCoordinate: [TORONTO.lng, TORONTO.lat],
                  zoomLevel: 12,
                }}
              />
              {filteredEvents
                .filter(e => e.venue_lat != null && e.venue_lng != null)
                .map(event => (
                  <Mapbox.MarkerView
                    key={event.id}
                    coordinate={[event.venue_lng!, event.venue_lat!]}
                    allowOverlap
                  >
                    <VenuePin
                      event={event}
                      selected={selectedEvent?.id === event.id}
                      onPress={() => setSelectedEvent(event)}
                    />
                  </Mapbox.MarkerView>
                ))}
            </Mapbox.MapView>
          ) : (
            <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Map view not available on web</Text>
            </View>
          )}
          <Animated.View
            style={[
              styles.mapCard,
              { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
            ]}
            pointerEvents={selectedEvent ? 'box-none' : 'none'}
          >
            {selectedEvent && (
              <>
                {/* Drag handle */}
                <View style={styles.mapCardHandle} />

                {/* Close button */}
                <TouchableOpacity
                  style={styles.mapCardClose}
                  onPress={() => setSelectedEvent(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>

                {/* Content row */}
                <TouchableOpacity
                  style={styles.mapCardBody}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/event/${selectedEvent.id}` as any)}
                >
                  <Image
                    source={{ uri: selectedEvent.poster_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }}
                    style={styles.mapCardImage}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.mapCardVenue} numberOfLines={1}>{selectedEvent.venue_name}</Text>
                    <Text style={styles.mapCardTitle} numberOfLines={1}>{selectedEvent.title}</Text>
                    <Text style={styles.mapCardDate}>
                      {[formatDate(selectedEvent.event_date), formatTime(selectedEvent.start_time)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" style={{ marginLeft: 8 }} />
                </TouchableOpacity>

                {/* I'm Going button */}
                <TouchableOpacity style={styles.mapCardRsvp} activeOpacity={0.85}>
                  <Text style={styles.mapCardRsvpText}>I'm Going</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </View>
      ) : filteredEvents.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '600' }}>
            {searchQuery.trim() ? 'No events found' : `No events ${sort === 'Tonight' ? 'tonight' : 'this week'}`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 100 }]}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
          ListHeaderComponent={
            <>
              {happeningNow.length > 0 && (
                <View style={styles.nowSection}>
                  <Text style={styles.nowHeader}>HAPPENING NOW</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                  >
                    {happeningNow.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.nowCard}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/event/${item.id}` as any)}
                      >
                        <Image
                          source={{ uri: item.poster_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }}
                          style={styles.nowCardImage}
                          resizeMode="cover"
                        />
                        <View style={styles.nowBadge}>
                          <View style={styles.nowDot} />
                          <Text style={styles.nowBadgeText}>Now</Text>
                        </View>
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.8)']}
                          style={styles.nowCardGradient}
                        >
                          <Text style={styles.nowCardVenue} numberOfLines={1}>{item.venue_name}</Text>
                          <Text style={styles.nowCardTitle} numberOfLines={1}>{item.title}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={styles.gridSortRow}>
                <TouchableOpacity
                  onPress={() => setGridSort('date')}
                  style={[styles.gridSortBtn, gridSort === 'date' && styles.gridSortBtnActive]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={12} color={gridSort === 'date' ? '#fff' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.gridSortBtnText, gridSort === 'date' && styles.gridSortBtnTextActive]}>Date</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setGridSort('popular')}
                  style={[styles.gridSortBtn, gridSort === 'popular' && styles.gridSortBtnActive]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flame-outline" size={12} color={gridSort === 'popular' ? '#fff' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.gridSortBtnText, gridSort === 'popular' && styles.gridSortBtnTextActive]}>Popular</Text>
                </TouchableOpacity>
              </View>
            </>
          }
          renderItem={({ item }) => {
            const info = attendees[item.id];
            const isSaved = savedIds.has(item.id);
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
                  onError={(e) => {
                    (e.target as any).setNativeProps({
                      src: [{ uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }],
                    });
                  }}
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
                    <TouchableOpacity
                      onPress={() => item.venue_id && router.push(`/venue/${item.venue_id}` as any)}
                      activeOpacity={item.venue_id ? 0.7 : 1}
                    >
                      <Text style={styles.cardVenue} numberOfLines={1}>{item.venue_name}</Text>
                    </TouchableOpacity>
                    <Text style={styles.cardEvent} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.cardDatetime}>
                      {[formatDate(item.event_date), formatTime(item.start_time)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </LinearGradient>

                {/* Heart / save button */}
                <TouchableOpacity
                  style={styles.heartBtn}
                  onPress={() => toggleSave(item.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name={isSaved ? 'heart' : 'heart-outline'}
                    size={18}
                    color={isSaved ? '#FF3B5C' : 'rgba(255,255,255,0.85)'}
                  />
                </TouchableOpacity>

                {/* Featured badge */}
                {item.venue_feature_tier != null && (
                  <View style={styles.featuredBadge}>
                    <Ionicons name="star" size={9} color="#FFD700" />
                  </View>
                )}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryScroll: {
    marginBottom: 2,
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryPillActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  categoryPillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: '#fff',
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
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1.5,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nbBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'transparent',
  },
  nbBtnActive: {
    backgroundColor: 'rgba(255,59,92,0.15)',
    borderColor: '#FF3B5C',
  },
  nbBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  nbBtnTextActive: {
    color: '#FF3B5C',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterBtnActive: {
    borderColor: 'rgba(255,59,92,0.4)',
    backgroundColor: 'rgba(255,59,92,0.08)',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF3B5C',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterSheet: {
    backgroundColor: '#161A22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  filterSheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  filterClearText: {
    color: '#FF3B5C',
    fontSize: 14,
    fontWeight: '600',
  },
  filterSectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  filterPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterDoneBtn: {
    marginTop: 28,
    backgroundColor: '#FF3B5C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  filterDoneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  entryBtnBottleInactive: {
    color: '#D4A017',
  },
  entryBtnBottleActive: {
    backgroundColor: 'rgba(212,160,23,0.15)',
    borderColor: '#D4A017',
  },
  entryBtnBottleText: {
    color: '#D4A017',
  },
  nowSection: {
    marginBottom: 16,
  },
  nowHeader: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  nowCard: {
    width: 140,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  nowCardImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  nowCardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 24,
  },
  nowCardVenue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  nowCardTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  nowBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#00C07A',
  },
  nowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00C07A',
  },
  nowBadgeText: {
    color: '#00C07A',
    fontSize: 10,
    fontWeight: '700',
  },
  gridSortRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  gridSortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'transparent',
  },
  gridSortBtnActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  gridSortBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  gridSortBtnTextActive: {
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
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
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
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonGrid: {
    paddingHorizontal: CARD_MARGIN,
    paddingTop: CARD_MARGIN,
    gap: CARD_MARGIN,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    gap: 8,
  },
  skeletonImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    backgroundColor: SKELETON_COLOR,
  },
  skeletonTextWide: {
    height: 12,
    borderRadius: 6,
    backgroundColor: SKELETON_COLOR,
    width: '75%',
  },
  skeletonTextNarrow: {
    height: 10,
    borderRadius: 5,
    backgroundColor: SKELETON_COLOR,
    width: '50%',
  },
  mapCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  mapCardHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  mapCardClose: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  mapCardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  mapCardVenue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  mapCardTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 5,
  },
  mapCardDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  mapCardRsvp: {
    backgroundColor: '#FF3B5C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  mapCardRsvpText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
