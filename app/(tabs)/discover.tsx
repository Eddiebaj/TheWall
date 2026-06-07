import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../lib/analytics';
import { DiscoverRowsSkeleton } from '../../components/Shimmer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

let MapboxGL: any = null;
try {
  MapboxGL = require('@rnmapbox/maps').default;
  MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');
} catch (_) {
  MapboxGL = null;
}

const TORONTO_COORDS: [number, number] = [-79.3832, 43.6532];

const CARD_W = 160;
const CARD_H = 220;

const HH_CARD_W = 200;

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

const CATEGORIES: { key: string; emoji: string; label: string; ionIcon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'Concerts',     emoji: '🎵', label: 'Concerts',     ionIcon: 'musical-notes-outline' },
  { key: 'Nightlife',    emoji: '🍸', label: 'Nightlife' },
  { key: 'Comedy',       emoji: '😂', label: 'Comedy',       ionIcon: 'happy-outline' },
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


function EventCard({ event, onPress, checkinCount }: { event: DiscoverEvent; onPress: () => void; checkinCount?: number }) {
  const isFeatured = event.venue_feature_tier === 'featured';
  const catDef = CATEGORIES.find(c => c.key === event.category);
  const emoji = catDef?.emoji ?? '📅';

  const [imgError, setImgError] = React.useState(false);
  const showImage = event.poster_url && !imgError;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.card}
    >
      {showImage ? (
        <Image
          source={{ uri: event.poster_url! }}
          style={styles.cardImage}
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient
          colors={['#1a0620', '#2d1040', '#0a0a1a']}
          style={styles.cardImagePlaceholder}
        >
          <Text style={{ fontSize: 28 }}>{emoji}</Text>
        </LinearGradient>
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
  ionIcon,
}: {
  category: typeof CATEGORIES[0];
  events: DiscoverEvent[];
  onCardPress: (e: DiscoverEvent) => void;
  onSeeAll: () => void;
  activeCheckinVenueIds: Set<string>;
  ionIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          {ionIcon
            ? <Ionicons name={ionIcon} size={18} color="#fff" />
            : <Text style={{ fontSize: 18 }}>{category.emoji}</Text>}
          <Text style={styles.categoryTitle}>{category.label}</Text>
        </View>
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
  const [happyHourDeals, setHappyHourDeals] = useState<HappyHourDeal[]>([]);
  const [nowMins, setNowMins] = useState(0);
  const [activeCheckinVenueIds, setActiveCheckinVenueIds] = useState<Set<string>>(new Set());
  const [mapModalVisible, setMapModalVisible] = useState(false);
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
        .select('id, title, poster_url, date, start_time, end_time, entry_type, venue_id, venues(name, neighbourhood, latitude, longitude, feature_tier)')
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
      entry_type: e.entry_type || null, category: deriveCategory(e.title, e.venues?.name || ''),
      event_date: e.date || null, start_time: e.start_time || null,
      end_time: e.end_time || null, venue_lat: e.venues?.latitude ?? null,
      venue_lng: e.venues?.longitude ?? null, venue_feature_tier: e.venues?.feature_tier ?? null,
    }));

    const veMapped: DiscoverEvent[] = (veRes.data ?? []).map((e: any) => ({
      id: e.id, poster_url: e.poster_url || null, title: e.title,
      venue_id: e.venue_id || null, venue_name: e.venues?.name || '',
      neighbourhood: e.venues?.neighbourhood || null, cover_charge: null,
      entry_type: e.entry_type || null, category: e.category || deriveCategory(e.title, e.venues?.name || ''),
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

    if (__DEV__) {
      const categoryCounts: Record<string, number> = {};
      for (const e of merged) {
        const k = e.category ?? '(none)';
        categoryCounts[k] = (categoryCounts[k] ?? 0) + 1;
      }
      console.log('[Discover] loaded', merged.length, 'events. Categories:', categoryCounts);
      const withCoords = merged.filter(e => e.venue_lat != null && e.venue_lng != null).length;
      console.log(`[Map] ${withCoords}/${merged.length} events have coordinates — ${merged.length - withCoords} will be hidden on map`);
      if (withCoords === 0) console.warn('[Map] ⚠️ No events have coordinates — map will appear empty. Check venue latitude/longitude columns.');
      if (legacyRes.error) console.warn('[Discover] legacyRes error:', legacyRes.error);
      if (veRes.error) console.warn('[Discover] veRes error:', veRes.error);
    }
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <TouchableOpacity
          onPress={() => setMapModalVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="map-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <DiscoverRowsSkeleton />
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

          {!isHappyHourWindow && happyHourDeals.length > 0 && (
            <View style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Text style={{ fontSize: 18 }}>🍺</Text>
                  <Text style={styles.categoryTitle}>Happy Hours</Text>
                </View>
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

          {eventsByCategory('Food & Drinks').length > 0 && (
            <CategoryRow
              category={CATEGORIES.find(c => c.key === 'Food & Drinks')!}
              events={eventsByCategory('Food & Drinks')}
              onCardPress={e => {
                if (__DEV__) console.log('[Discover] navigating to event id:', e.id, 'title:', e.title);
                capture('event_viewed', { event_id: e.id, source: 'discover' });
                router.push(`/event/${e.id}`);
              }}
              onSeeAll={() => router.push(`/category/${encodeURIComponent('Food & Drinks')}` as any)}
              activeCheckinVenueIds={activeCheckinVenueIds}
            />
          )}

          {events.length > 0 && (
            <CategoryRow
              key="__all__"
              category={{ key: '__all__', emoji: '', label: 'All Events' }}
              ionIcon="sparkles"
              events={events}
              onCardPress={e => {
                if (__DEV__) console.log('[Discover] navigating to event id:', e.id, 'title:', e.title);
                capture('event_viewed', { event_id: e.id, source: 'discover' });
                router.push(`/event/${e.id}`);
              }}
              onSeeAll={() => router.push('/category/all' as any)}
              activeCheckinVenueIds={activeCheckinVenueIds}
            />
          )}
          {visibleCategories.filter(c => c.key !== 'Food & Drinks').map(cat => (
            <CategoryRow
              key={cat.key}
              category={cat}
              ionIcon={cat.ionIcon}
              events={eventsByCategory(cat.key)}
              onCardPress={e => {
                if (__DEV__) console.log('[Discover] navigating to event id:', e.id, 'title:', e.title);
                capture('event_viewed', { event_id: e.id, source: 'discover' });
                router.push(`/event/${e.id}`);
              }}
              onSeeAll={() => router.push(`/category/${encodeURIComponent(cat.key)}` as any)}
              activeCheckinVenueIds={activeCheckinVenueIds}
            />
          ))}
          {events.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No events found</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <Modal
        visible={mapModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setMapModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
          <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => setMapModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>Event Map</Text>
          </View>
          {MapboxGL ? (() => {
            const mappableEvents = events.filter(
              e => e.venue_lat != null && e.venue_lng != null,
            );
            const geojson = {
              type: 'FeatureCollection',
              features: mappableEvents.map(e => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [e.venue_lng!, e.venue_lat!] },
                properties: { id: e.id, title: e.title, venue: e.venue_name },
              })),
            };
            return (
              <MapboxGL.MapView
                style={{ flex: 1 }}
                styleURL="mapbox://styles/mapbox/dark-v11"
                logoEnabled={false}
                attributionEnabled={false}
              >
                <MapboxGL.Camera
                  zoomLevel={12}
                  centerCoordinate={TORONTO_COORDS}
                  animationMode="none"
                />
                <MapboxGL.ShapeSource
                  id="events-source"
                  shape={geojson as any}
                  cluster
                  clusterRadius={50}
                  clusterMaxZoom={14}
                  onPress={(e: any) => {
                    const feature = e.features?.[0];
                    if (!feature) return;
                    if (feature.properties?.cluster) return; // let map zoom in
                    const eventId = feature.properties?.id;
                    if (eventId) {
                      setMapModalVisible(false);
                      router.push(`/event/${eventId}`);
                    }
                  }}
                >
                  {/* Cluster background circles */}
                  <MapboxGL.CircleLayer
                    id="clusters"
                    filter={['has', 'point_count']}
                    style={{
                      circleColor: '#a855f7',
                      circleRadius: [
                        'step', ['get', 'point_count'],
                        20,  // default radius
                        10, 28, // >=10 → 28
                        50, 36, // >=50 → 36
                      ],
                      circleOpacity: 0.92,
                      circleStrokeWidth: 2,
                      circleStrokeColor: 'rgba(168,85,247,0.35)',
                    }}
                  />
                  {/* Cluster count labels */}
                  <MapboxGL.SymbolLayer
                    id="cluster-count"
                    filter={['has', 'point_count']}
                    style={{
                      textField: ['get', 'point_count_abbreviated'],
                      textSize: 13,
                      textColor: '#fff',
                      textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                      textAllowOverlap: true,
                    }}
                  />
                  {/* Individual event pins */}
                  <MapboxGL.CircleLayer
                    id="unclustered-point"
                    filter={['!', ['has', 'point_count']]}
                    style={{
                      circleColor: '#e53935',
                      circleRadius: 8,
                      circleStrokeWidth: 2,
                      circleStrokeColor: '#fff',
                      circleOpacity: 0.95,
                    }}
                  />
                </MapboxGL.ShapeSource>
              </MapboxGL.MapView>
            );
          })() : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
              <Ionicons name="map-outline" size={64} color="#333" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>Map view available in the full app</Text>
              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 }}>
                The interactive map requires a native build. Use the event list below to explore what's happening tonight.
              </Text>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    textAlign: 'left',
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
});
