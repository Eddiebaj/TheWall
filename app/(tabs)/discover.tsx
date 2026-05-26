import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
let MapboxGL: any = null;
try {
  MapboxGL = require('@rnmapbox/maps').default;
} catch (e) {
  // Mapbox not available in Expo Go
}
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../lib/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CARD_W = 160;
const CARD_H = 220;

const HH_CARD_W = 200;

const CATEGORIES: { key: string; emoji: string; label: string }[] = [
  { key: 'Concerts',     emoji: '🎵', label: 'Concerts' },
  { key: 'Nightlife',    emoji: '🍸', label: 'Nightlife' },
  { key: 'Comedy',       emoji: '😂', label: 'Comedy' },
  { key: 'Art & Culture',emoji: '🎨', label: 'Art & Culture' },
  { key: 'Sports',       emoji: '🏟️', label: 'Sports' },
  { key: 'Food & Drinks',emoji: '🍔', label: 'Food & Drinks' },
  { key: 'Outdoor',      emoji: '🌿', label: 'Outdoor' },
  { key: 'Networking',   emoji: '🤝', label: 'Networking' },
  { key: 'Social',       emoji: '🎉', label: 'Social' },
];

interface HappyHourDeal {
  id: string;
  venue_id: string;
  venue_name: string;
  title: string;
  deal_details: string | null;
  end_time: string; // HH:MM:SS
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

function timeToMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + (parts[1] ?? 0);
}

function formatCountdown(endTime: string, nowMins: number): string {
  const endMins = timeToMinutes(endTime);
  const diff = endMins - nowMins;
  if (diff <= 0) return 'ending soon';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0) return `ends in ${h}h ${m}m`;
  return `ends in ${m}m`;
}

function formatTimeTo12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function VenuePin({
  event,
  selected,
  hasCheckins,
  pulseAnim,
  onPress,
}: {
  event: DiscoverEvent;
  selected: boolean;
  hasCheckins: boolean;
  pulseAnim: Animated.Value;
  onPress: () => void;
}) {
  const featured = event.venue_feature_tier != null;
  return (
    <View style={{ alignItems: 'center' }}>
      {hasCheckins && (
        <Animated.View style={{
          position: 'absolute',
          top: -4,
          right: -4,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#FF3B5C',
          transform: [{ scale: pulseAnim }],
          zIndex: 10,
        }} />
      )}
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
    </View>
  );
}

function EventCard({ event, onPress, checkinCount }: { event: DiscoverEvent; onPress: () => void; checkinCount?: number }) {
  const isFeatured = event.venue_feature_tier === 'featured';
  const catDef = CATEGORIES.find(c => c.key === event.category);
  const emoji = catDef?.emoji ?? '📅';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.card}
    >
      {event.poster_url ? (
        <Image source={{ uri: event.poster_url }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={{ fontSize: 36 }}>{emoji}</Text>
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.cardGradient}
      />
      {/* Venue name top */}
      <View style={styles.cardVenueRow}>
        {isFeatured && <View style={styles.featuredDot} />}
        <Text style={styles.cardVenueName} numberOfLines={1}>
          {event.venue_name}
        </Text>
      </View>
      {/* Title + date bottom */}
      <View style={styles.cardBottom}>
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        {event.event_date ? (
          <Text style={styles.cardDate}>{formatDate(event.event_date)}</Text>
        ) : null}
        {checkinCount != null && checkinCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B5C' }} />
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>
              {checkinCount} here now
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HappyHourCard({
  deal,
  nowMins,
  onPress,
}: {
  deal: HappyHourDeal;
  nowMins: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.hhCard}>
      <LinearGradient
        colors={['#1a0a00', '#2d1500']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.hhCardInner}>
        <Text style={styles.hhCardVenue} numberOfLines={1}>{deal.venue_name}</Text>
        <Text style={styles.hhCardTitle} numberOfLines={2}>{deal.title}</Text>
        {deal.deal_details ? (
          <Text style={styles.hhCardDetails} numberOfLines={2}>{deal.deal_details}</Text>
        ) : null}
        <View style={styles.hhCardFooter}>
          <Ionicons name="time-outline" size={11} color="#f97316" />
          <Text style={styles.hhCardCountdown}>{formatCountdown(deal.end_time, nowMins)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CategoryRow({
  category,
  events,
  onCardPress,
  onSeeAll,
  activeCheckinVenueIds,
}: {
  category: typeof CATEGORIES[0];
  events: DiscoverEvent[];
  onCardPress: (e: DiscoverEvent) => void;
  onSeeAll: () => void;
  activeCheckinVenueIds: Set<string>;
}) {
  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>
          {category.emoji}  {category.label}
        </Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.seeAll}>See all →</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
      >
        {events.map(e => (
          <EventCard
            key={e.id}
            event={e}
            onPress={() => onCardPress(e)}
            checkinCount={e.venue_id && activeCheckinVenueIds.has(e.venue_id) ? 1 : 0}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { capture } = useAnalytics();

  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DiscoverEvent | null>(null);
  const [happyHourDeals, setHappyHourDeals] = useState<HappyHourDeal[]>([]);
  const [nowMins, setNowMins] = useState(0);
  const [activeCheckinVenueIds, setActiveCheckinVenueIds] = useState<Set<string>>(new Set());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Determine if happy hour window (3pm-8pm weekdays)
  const isHappyHourWindow = (() => {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun, 6=Sat
    const mins = now.getHours() * 60 + now.getMinutes();
    return dow >= 1 && dow <= 5 && mins >= 15 * 60 && mins < 20 * 60;
  })();

  useEffect(() => {
    const now = new Date();
    setNowMins(now.getHours() * 60 + now.getMinutes());
    loadEvents();
    loadActiveCheckins();
    if (isHappyHourWindow) loadHappyHour();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const loadActiveCheckins = async () => {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('checkins')
      .select('venue_id')
      .is('checked_out_at', null)
      .gte('checked_in_at', cutoff);
    if (data) {
      setActiveCheckinVenueIds(new Set((data as any[]).map((c: any) => c.venue_id)));
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + 30);
    const future = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;

    const [legacyRes, veRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, poster_url, date, start_time, end_time, entry_type, category, venue_id, venues(name, neighbourhood, latitude, longitude, feature_tier)')
        .gte('date', today)
        .lte('date', future)
        .order('date', { ascending: true })
        .limit(200),
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, event_time, end_time, entry_type, category, venue_id, source, visibility, venues(name, neighbourhood, latitude, longitude, feature_tier)')
        .in('source', ['user', 'ticketmaster'])
        .neq('visibility', 'friends')
        .gte('event_date', today)
        .lte('event_date', future)
        .order('event_date', { ascending: true })
        .limit(200),
    ]);

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
    const merged: DiscoverEvent[] = [];
    for (const e of [...legacyMapped, ...veMapped]) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }

    setEvents(merged);
    setLoading(false);
  };

  const loadHappyHour = async () => {
    const now = new Date();
    const dow = now.getDay();
    const pad = (n: number) => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;

    const { data } = await supabase
      .from('happy_hours')
      .select('id, venue_id, title, deal_details, end_time, venues(name)')
      .eq('day_of_week', dow)
      .lte('start_time', currentTime)
      .gte('end_time', currentTime);

    if (data) {
      setHappyHourDeals(
        (data as any[]).map(d => ({
          id: d.id,
          venue_id: d.venue_id,
          venue_name: d.venues?.name ?? '',
          title: d.title,
          deal_details: d.deal_details ?? null,
          end_time: d.end_time,
        }))
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const visibleCategories = CATEGORIES.filter(cat =>
    events.some(e => e.category === cat.key)
  );

  const eventsByCategory = (key: string) =>
    events.filter(e => e.category === key);

  const mapEvents = events.filter(e => e.venue_lat && e.venue_lng);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
          }
        >
          {/* Happy Hour Now */}
          {isHappyHourWindow && happyHourDeals.length > 0 && (
            <View style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.categoryTitle}>🍺 Happy Hour</Text>
                  <View style={styles.hhLivePill}>
                    <Text style={styles.hhLiveText}>NOW</Text>
                  </View>
                </View>
                <Text style={styles.hhTime}>{formatTimeTo12(`${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`)}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
              >
                {happyHourDeals.map(deal => (
                  <HappyHourCard
                    key={deal.id}
                    deal={deal}
                    nowMins={nowMins}
                    onPress={() => router.push(`/venue/${deal.venue_id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {visibleCategories.map(cat => (
            <CategoryRow
              key={cat.key}
              category={cat}
              events={eventsByCategory(cat.key)}
              onCardPress={e => {
                capture('event_viewed', { event_id: e.id, source: 'discover' });
                router.push(`/event/${e.id}`);
              }}
              onSeeAll={() => router.push(`/category/${encodeURIComponent(cat.key)}` as any)}
              activeCheckinVenueIds={activeCheckinVenueIds}
            />
          ))}
          {visibleCategories.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No events found</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Floating map button */}
      <TouchableOpacity
        style={[styles.mapFab, { bottom: insets.bottom + 90 }]}
        onPress={() => setMapVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="map" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Map modal */}
      <Modal
        visible={mapVisible}
        animationType="slide"
        onRequestClose={() => setMapVisible(false)}
      >
        <View style={styles.mapModal}>
          <TouchableOpacity
            style={[styles.mapCloseBtn, { top: insets.top + 12 }]}
            onPress={() => setMapVisible(false)}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>

          {MapboxGL ? (
            <MapboxGL.MapView
              style={styles.map}
              styleURL="mapbox://styles/mapbox/dark-v11"
            >
              <MapboxGL.Camera
                centerCoordinate={[-79.3832, 43.6532]}
                zoomLevel={12}
                animationMode="none"
              />
              {mapEvents.map(e => (
                <MapboxGL.MarkerView
                  key={e.id}
                  coordinate={[e.venue_lng!, e.venue_lat!]}
                >
                  <VenuePin
                    event={e}
                    selected={selectedEvent?.id === e.id}
                    hasCheckins={e.venue_id != null && activeCheckinVenueIds.has(e.venue_id)}
                    pulseAnim={pulseAnim}
                    onPress={() => setSelectedEvent(prev => prev?.id === e.id ? null : e)}
                  />
                </MapboxGL.MarkerView>
              ))}
            </MapboxGL.MapView>
          ) : (
            <View style={[styles.map, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#666', fontSize: 14 }}>Map not available in Expo Go</Text>
            </View>
          )}

          {selectedEvent && (
            <TouchableOpacity
              style={styles.mapEventCard}
              onPress={() => {
                setMapVisible(false);
                setSelectedEvent(null);
                router.push(`/event/${selectedEvent.id}`);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.mapEventTitle} numberOfLines={2}>{selectedEvent.title}</Text>
              <Text style={styles.mapEventVenue}>{selectedEvent.venue_name}</Text>
              {selectedEvent.event_date && (
                <Text style={styles.mapEventDate}>{formatDate(selectedEvent.event_date)}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Modal>
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
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 28,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  categoryTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  seeAll: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },
  cardRow: {
    paddingLeft: 16,
    paddingRight: 8,
    gap: 10,
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
  },
  cardImagePlaceholder: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_H * 0.65,
  },
  cardVenueRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  featuredDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e53935',
  },
  cardVenueName: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
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
  },
  cardDate: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '400',
  },
  hhCard: {
    width: HH_CARD_W,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3d1f00',
  },
  hhCardInner: {
    padding: 14,
    gap: 4,
  },
  hhCardVenue: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hhCardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  hhCardDetails: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  hhCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  hhCardCountdown: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '600',
  },
  hhLivePill: {
    backgroundColor: '#f97316',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hhLiveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hhTime: {
    color: '#666',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#555',
    fontSize: 16,
  },
  mapFab: {
    position: 'absolute',
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  mapModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    flex: 1,
  },
  mapCloseBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapEventCard: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  mapEventTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  mapEventVenue: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 2,
  },
  mapEventDate: {
    color: '#777',
    fontSize: 12,
  },
});
