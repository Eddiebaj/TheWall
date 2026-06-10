import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getBlockedIds } from '../../lib/blockList';
import { useAnalytics } from '../../lib/analytics';
import { DiscoverRowsSkeleton } from '../../components/Shimmer';
import * as Location from 'expo-location';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

let MapboxGL: any = null;
try {
  MapboxGL = require('@rnmapbox/maps').default;
  MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');
} catch (_) {
  MapboxGL = null;
}

const TORONTO_COORDS: [number, number] = [-79.3832, 43.6532];

// ─── Ranking weights ──────────────────────────────────────────────────────────
const SCORE_TONIGHT         = 100;
const SCORE_TONIGHT_PARTIAL =  55; // today, started >2h ago, no end_time
const SCORE_WEEKEND         =  70;
const SCORE_THIS_WEEK       =  40;
const SCORE_LATER           =  10;
const SCORE_PROXIMITY_MAX   =  80; // ≤500 m
const SCORE_PROXIMITY_MID   =  40; // ≤2 km
const SCORE_PROXIMITY_FAR   =  10; // ≤5 km
const SCORE_TIER_FEATURED   =  15;
const SCORE_TIER_PRO        =   8;
const SCORE_TIER_BASIC      =   3;
const SCORE_CATEGORY_MATCH  =  25;
const SCORE_HAS_POSTER      =   5;
const SCORE_BUZZ            =  20; // venue has active check-ins right now
// TODO: add friend-graph bonus (~15) once friend-saved/going data is loaded

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

const CATEGORIES: { key: string; emoji: string; label: string }[] = [
  { key: 'Concerts',     emoji: '🎵', label: 'Concerts' },
  { key: 'Nightlife',    emoji: '🍸', label: 'Nightlife' },
  { key: 'Comedy',       emoji: '😂', label: 'Comedy' },
  { key: 'Art & Culture',emoji: '🎨', label: 'Art & Culture' },
  { key: 'Sports',       emoji: '🏆', label: 'Sports' },
  { key: 'Food & Drinks',emoji: '🍔', label: 'Food & Drinks' },
  { key: 'Outdoor',      emoji: '🌿', label: 'Outdoor' },
  { key: 'Networking',   emoji: '💼', label: 'Networking' },
  { key: 'Social',       emoji: '🎉', label: 'Social' },
];

const CATEGORY_CHIP_TO_CAT: Record<string, string[]> = {
  'Nightclub':    ['Nightlife'],
  'Live Music':   ['Concerts'],
  'Cocktail Bar': ['Nightlife'],
  'Bar':          ['Nightlife', 'Food & Drinks'],
  'Brewery':      ['Food & Drinks'],
  'Comedy':       ['Comedy'],
  'Theatre':      ['Art & Culture'],
  'Sports':       ['Sports'],
  'Outdoor':      ['Outdoor'],
  'Culture':      ['Art & Culture'],
  'Nightlife':    ['Nightlife'],
};
const CATEGORY_CHIP_KEYS = Object.keys(CATEGORY_CHIP_TO_CAT);

interface HappyHourDeal {
  id: string;
  venue_id: string;
  venue_name: string;
  title: string;
  deal_details: string | null;
  end_time: string; // HH:MM:SS
  last_verified_at: string | null;
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
  _score?: number;
  isPromoted?: boolean;
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreEvent(
  e: DiscoverEvent,
  now: Date,
  todayStr: string,
  userLoc: { lat: number; lng: number } | null,
  activeCheckinIds: Set<string>,
  activeChips: Set<string>,
): number {
  let score = 0;

  // ── Temporal ──
  const parseMins = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (e.event_date === todayStr) {
    const endMins = parseMins(e.end_time);
    if (endMins !== null && nowMins > endMins) {
      return -1; // ended — filtered out by caller
    }
    const startMins = parseMins(e.start_time);
    if (startMins !== null && nowMins > startMins + 120 && endMins === null) {
      score += SCORE_TONIGHT_PARTIAL;
    } else {
      score += SCORE_TONIGHT;
    }
  } else if (e.event_date) {
    const dow = new Date(e.event_date + 'T12:00:00').getDay();
    const daysAway = Math.round(
      (new Date(e.event_date + 'T12:00:00').getTime() - now.getTime()) / 86_400_000,
    );
    if (dow === 5 || dow === 6) {
      score += SCORE_WEEKEND;
    } else if (daysAway <= 7) {
      score += SCORE_THIS_WEEK;
    } else {
      score += SCORE_LATER;
    }
  } else {
    score += SCORE_LATER;
  }

  // ── Proximity ──
  if (userLoc && e.venue_lat != null && e.venue_lng != null) {
    const m = haversineMetres(userLoc.lat, userLoc.lng, e.venue_lat, e.venue_lng);
    if (m <= 500)       score += SCORE_PROXIMITY_MAX;
    else if (m <= 2000) score += SCORE_PROXIMITY_MID;
    else if (m <= 5000) score += SCORE_PROXIMITY_FAR;
  }

  // ── Tier ──
  if (e.venue_feature_tier === 'featured')   score += SCORE_TIER_FEATURED;
  else if (e.venue_feature_tier === 'pro')   score += SCORE_TIER_PRO;
  else if (e.venue_feature_tier === 'basic') score += SCORE_TIER_BASIC;

  // ── Category chip match ──
  if (activeChips.size > 0 && e.category) {
    const allowed = new Set<string>();
    for (const chip of activeChips) {
      for (const cat of (CATEGORY_CHIP_TO_CAT[chip] ?? [])) allowed.add(cat);
    }
    if (allowed.has(e.category)) score += SCORE_CATEGORY_MATCH;
  }

  // ── Poster ──
  if (e.poster_url) score += SCORE_HAS_POSTER;

  // ── Buzz (live check-ins) ──
  if (e.venue_id && activeCheckinIds.has(e.venue_id)) score += SCORE_BUZZ;

  return score;
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


function EventCard({ event, onPress, checkinCount, isPromoted }: { event: DiscoverEvent; onPress: () => void; checkinCount?: number; isPromoted?: boolean }) {
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
        />
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
        {isPromoted && (
          <Text style={{
            fontSize: 9,
            letterSpacing: 0.8,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            marginTop: 5,
            alignSelf: 'flex-end',
          }}>
            Promoted
          </Text>
        )}
      </View>
      {event.venue_lat == null && (
        <View style={{ position: 'absolute', top: 8, right: 8, opacity: 0.4 }}>
          <Ionicons name="location-outline" size={14} color="#fff" />
        </View>
      )}
      {event.venue_feature_tier === 'featured' && (
        <View style={{
          position: 'absolute',
          top: 6,
          right: 6,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 10,
          paddingHorizontal: 5,
          paddingVertical: 2,
        }}>
          <Text style={{ fontSize: 12 }}>👑</Text>
        </View>
      )}
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
  const verifiedMs = deal.last_verified_at ? new Date(deal.last_verified_at).getTime() : null;
  const daysSince = verifiedMs ? Math.floor((Date.now() - verifiedMs) / 86400000) : null;
  const isOutdated = !verifiedMs || daysSince! > 30;

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
        {isOutdated && (
          <View style={{ marginTop: 6, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b' }}>May be outdated</Text>
          </View>
        )}
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
        <Text style={styles.categoryTitle}>{category.label}</Text>
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
            isPromoted={e.isPromoted}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Map Components ───────────────────────────────────────────────────────────

function SingleEventPreview({ event, onView }: { event: DiscoverEvent; onView: () => void }) {
  const [imgError, setImgError] = useState(false);
  const catDef = CATEGORIES.find(c => c.key === event.category);
  return (
    <View style={{ flexDirection: 'row', gap: 14, paddingTop: 4 }}>
      {event.poster_url && !imgError ? (
        <Image
          source={{ uri: event.poster_url }}
          style={mapStyles.previewPoster}
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient colors={['#1a0620', '#2d1040']} style={mapStyles.previewPoster} />
      )}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View>
          <Text style={mapStyles.previewVenue} numberOfLines={1}>{event.venue_name}</Text>
          <Text style={mapStyles.previewTitle} numberOfLines={3}>{event.title}</Text>
          {event.event_date && <Text style={mapStyles.previewDate}>{formatDate(event.event_date)}</Text>}
        </View>
        <TouchableOpacity style={mapStyles.viewBtn} onPress={onView} activeOpacity={0.85}>
          <Text style={mapStyles.viewBtnText}>View event →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MapEventView({
  events,
  onClose,
  user,
}: {
  events: DiscoverEvent[];
  onClose: () => void;
  user: { id: string } | null | undefined;
}) {
  const router = useRouter();
  const shapeSourceRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const [selectedVenueEvents, setSelectedVenueEvents] = useState<DiscoverEvent[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetAnim = useRef(new Animated.Value(340)).current;

  const mappableEvents = events.filter(e => e.venue_lat != null && e.venue_lng != null);

  // Group events by venue so one pin = one venue with N events
  const venueGroups = useMemo(() => {
    const map = new Map<string, DiscoverEvent[]>();
    for (const e of mappableEvents) {
      const key = e.venue_id ?? `${e.venue_lat},${e.venue_lng}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [mappableEvents.length]);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [...venueGroups.entries()].map(([key, evs]) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [evs[0].venue_lng!, evs[0].venue_lat!] },
      properties: {
        venueKey: key,
        venue: evs[0].venue_name,
        eventCount: evs.length,
        firstId: evs[0].id,
        featureTier: evs[0].venue_feature_tier ?? 'basic',
      },
    })),
  }), [venueGroups]);

  const showSheet = (evs: DiscoverEvent[]) => {
    setSelectedVenueEvents(evs);
    setSheetVisible(true);
    sheetAnim.setValue(340);
    Animated.spring(sheetAnim, { toValue: 0, damping: 22, mass: 0.85, useNativeDriver: true }).start();
  };

  const hideSheet = () => {
    Animated.timing(sheetAnim, { toValue: 340, duration: 180, useNativeDriver: true }).start(() =>
      setSheetVisible(false)
    );
  };

  const handleMapPress = async (e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;

    if (feature.properties?.cluster) {
      // Zoom into cluster until pins separate
      try {
        const zoom = await shapeSourceRef.current?.getClusterExpansionZoom(feature);
        cameraRef.current?.setCamera({
          centerCoordinate: feature.geometry.coordinates,
          zoomLevel: (zoom ?? 12) + 0.5,
          animationDuration: 500,
          animationMode: 'easeTo',
        });
      } catch {}
      return;
    }

    // Individual venue pin
    const venueKey = feature.properties?.venueKey;
    if (venueKey) {
      const evs = venueGroups.get(venueKey) ?? [];
      if (evs.length > 0) showSheet(evs);
    }
  };

  const recenter = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: TORONTO_COORDS,
      zoomLevel: 12,
      animationDuration: 600,
      animationMode: 'easeTo',
    });
  };

  const totalVenues = venueGroups.size;

  return (
    <View style={{ flex: 1 }}>
      {/* Event count badge */}
      <View style={mapStyles.countBadge} pointerEvents="none">
        <Ionicons name="location" size={13} color="#FF3B5C" />
        <Text style={mapStyles.countBadgeText}>
          Showing {mappableEvents.length} of {events.length} events with locations
        </Text>
      </View>

      <MapboxGL.MapView
        style={{ flex: 1 }}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionEnabled={false}
        onPress={() => sheetVisible && hideSheet()}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={12}
          centerCoordinate={TORONTO_COORDS}
          animationMode="none"
        />
        <MapboxGL.ShapeSource
          id="events-source"
          ref={shapeSourceRef}
          shape={geojson as any}
          cluster
          clusterRadius={50}
          clusterMaxZoom={14}
          onPress={handleMapPress}
        >
          {/* Cluster circles — color and size scale with count */}
          <MapboxGL.CircleLayer
            id="clusters"
            filter={['has', 'point_count']}
            style={{
              circleColor: [
                'step', ['get', 'point_count'],
                '#C4172D',   // 1–9 (darker accent)
                10, '#FF3B5C', // 10–29 (accent)
                30, '#FF7A8A', // 30+ (lighter accent)
              ],
              circleRadius: [
                'step', ['get', 'point_count'],
                22,
                10, 30,
                30, 38,
              ],
              circleOpacity: 0.9,
              circleStrokeWidth: 2.5,
              circleStrokeColor: 'rgba(255,59,92,0.35)',
            }}
          />
          {/* Cluster count label */}
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
          {/* Individual venue pins — gold=featured, purple=pro, accent=basic/other */}
          <MapboxGL.CircleLayer
            id="unclustered-point"
            filter={['!', ['has', 'point_count']]}
            style={{
              circleColor: [
                'case',
                ['==', ['get', 'featureTier'], 'featured'], '#f59e0b',
                ['==', ['get', 'featureTier'], 'pro'], '#a78bfa',
                ['>', ['get', 'eventCount'], 1], '#FF7A8A',
                '#FF3B5C',
              ],
              circleRadius: [
                'case',
                ['==', ['get', 'featureTier'], 'featured'], 11,
                9,
              ],
              circleStrokeWidth: 2.5,
              circleStrokeColor: '#fff',
              circleOpacity: 1,
            }}
          />
          {/* Count label on multi-event venue pins */}
          <MapboxGL.SymbolLayer
            id="unclustered-count"
            filter={['all', ['!', ['has', 'point_count']], ['>', ['get', 'eventCount'], 1]]}
            style={{
              textField: ['to-string', ['get', 'eventCount']],
              textSize: 9,
              textColor: '#fff',
              textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              textAllowOverlap: true,
            }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      {/* Recenter button */}
      <TouchableOpacity style={mapStyles.recenterBtn} onPress={recenter} activeOpacity={0.8}>
        <Ionicons name="locate" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Bottom peek sheet */}
      {sheetVisible && (
        <Animated.View style={[mapStyles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
          <View style={mapStyles.sheetHandle} />
          <TouchableOpacity style={mapStyles.sheetClose} onPress={hideSheet} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>

          {selectedVenueEvents.length === 1 ? (
            <SingleEventPreview
              event={selectedVenueEvents[0]}
              onView={() => {
                hideSheet();
                setTimeout(() => { onClose(); router.push(`/event/${selectedVenueEvents[0].id}`); }, 220);
              }}
            />
          ) : (
            <View>
              <Text style={mapStyles.sheetVenueName}>{selectedVenueEvents[0]?.venue_name}</Text>
              <Text style={mapStyles.sheetSubtitle}>{selectedVenueEvents.length} events at this venue</Text>
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {selectedVenueEvents.map(ev => (
                  <TouchableOpacity
                    key={ev.id}
                    style={mapStyles.venueEventRow}
                    onPress={() => {
                      hideSheet();
                      setTimeout(() => { onClose(); router.push(`/event/${ev.id}`); }, 220);
                    }}
                    activeOpacity={0.75}
                  >
                    {ev.poster_url ? (
                      <Image source={{ uri: ev.poster_url }} style={mapStyles.venueEventThumb} />
                    ) : (
                      <LinearGradient colors={['#1a0620', '#2d1040']} style={[mapStyles.venueEventThumb, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 18 }}>{CATEGORIES.find(c => c.key === ev.category)?.emoji ?? '📅'}</Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={mapStyles.venueEventTitle} numberOfLines={2}>{ev.title}</Text>
                      {ev.event_date && <Text style={mapStyles.venueEventDate}>{formatDate(ev.event_date)}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#555" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const mapStyles = StyleSheet.create({
  filterToolbar: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(10,10,20,0.88)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterChipActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  filterChipFeatured: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  countBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(10,10,20,0.82)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,59,92,0.25)',
  },
  countBadgeText: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
  },
  recenterBtn: {
    position: 'absolute',
    bottom: 28,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#222',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a3a',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetClose: {
    position: 'absolute',
    top: 18,
    right: 18,
  },
  sheetVenueName: {
    color: '#FF3B5C',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  sheetSubtitle: {
    color: '#666',
    fontSize: 13,
    marginBottom: 14,
  },
  venueEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  venueEventThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  venueEventTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  venueEventDate: {
    color: '#666',
    fontSize: 12,
    marginTop: 3,
  },
  previewPoster: {
    width: 88,
    height: 118,
    borderRadius: 10,
  },
  previewVenue: {
    color: '#FF3B5C',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 6,
  },
  previewDate: {
    color: '#888',
    fontSize: 13,
  },
  viewBtn: {
    backgroundColor: '#FF3B5C',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

// ─── Discover Screen ───────────────────────────────────────────────────────────

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
  const [filter19Plus, setFilter19Plus] = useState(false);
  const [dateFilter, setDateFilter] = useState<'tonight' | 'weekend' | 'week' | null>(null);
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [happyHourChip, setHappyHourChip] = useState(false);
  const [priceFilter, setPriceFilter] = useState<'free' | 'paid' | null>(null);
  const [neighbourhoodFilters, setNeighbourhoodFilters] = useState<Set<string>>(new Set());
  const [neighbourhoodModalVisible, setNeighbourhoodModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    events: any[]; venues: any[]; happyHours: any[]; people: any[];
  }>({ events: [], venues: [], happyHours: [], people: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Determine if happy hour window (3pm-8pm, any day)
  const isHappyHourWindow = (() => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 15 * 60 && mins < 20 * 60;
  })();

  useEffect(() => {
    const now = new Date();
    setNowMins(now.getHours() * 60 + now.getMinutes());
    loadEvents();
    loadActiveCheckins();
    if (isHappyHourWindow || happyHourChip) loadHappyHour();
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      userLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    })();
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
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('happy_hours')
      .select('id, venue_id, title, deal_details, end_time, last_verified_at, venues(name)')
      .eq('day_of_week', dow)
      .lte('start_time', currentTime)
      .gte('end_time', currentTime)
      .or(`submitted_by.is.null,status.eq.active,and(status.eq.pending,created_at.lte.${cutoff24h})`)
      .neq('status', 'flagged');

    if (data) {
      setHappyHourDeals(
        (data as any[]).map(d => ({
          id: d.id,
          venue_id: d.venue_id,
          venue_name: d.venues?.name ?? '',
          title: d.title,
          deal_details: d.deal_details ?? null,
          end_time: d.end_time,
          last_verified_at: d.last_verified_at ?? null,
        }))
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults({ events: [], venues: [], happyHours: [], people: [] });
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const pattern = `%${q.trim()}%`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [evRes, venueRes, hhRes, peopleRes] = await Promise.all([
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, venue_id, venues(name)')
        .ilike('title', pattern)
        .gte('event_date', todayStr)
        .limit(6),
      supabase
        .from('venues')
        .select('id, name, neighbourhood, poster_url')
        .ilike('name', pattern)
        .limit(6),
      supabase
        .from('happy_hours')
        .select('id, venue_id, title, deal_details, venues(name)')
        .or(`title.ilike.${pattern},deal_details.ilike.${pattern}`)
        .eq('status', 'active')
        .limit(6),
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(6),
    ]);

    const blockedIds = user ? await getBlockedIds(user.id) : new Set<string>();
    setSearchResults({
      events: evRes.data ?? [],
      venues: venueRes.data ?? [],
      happyHours: hhRes.data ?? [],
      people: (peopleRes.data ?? []).filter((p: any) => !blockedIds.has(p.id)),
    });
    setSearchLoading(false);
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim()) {
      setSearchResults({ events: [], venues: [], happyHours: [], people: [] });
      return;
    }
    searchTimerRef.current = setTimeout(() => runSearch(text), 300);
  };

  const today = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  const allNeighbourhoods = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) if (e.neighbourhood) s.add(e.neighbourhood);
    return [...s].sort();
  }, [events]);

  const filteredEvents = useMemo(() => events.filter(e => {
    if (dateFilter === 'tonight' && e.event_date !== today) return false;
    if (dateFilter === 'weekend') {
      if (!e.event_date) return false;
      const dow = new Date(e.event_date + 'T12:00:00').getDay();
      if (dow !== 5 && dow !== 6 && dow !== 0) return false;
    }
    if (dateFilter === 'week') {
      if (!e.event_date) return false;
      const diff = (new Date(e.event_date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000;
      if (diff < 0 || diff > 7) return false;
    }
    if (filter19Plus && !(e.entry_type?.toLowerCase().includes('19') || false)) return false;
    if (categoryFilters.size > 0) {
      const allowed = new Set<string>();
      for (const chip of categoryFilters) {
        for (const cat of (CATEGORY_CHIP_TO_CAT[chip] ?? [])) allowed.add(cat);
      }
      if (!e.category || !allowed.has(e.category)) return false;
    }
    if (priceFilter === 'free') {
      const et = (e.entry_type ?? '').toLowerCase();
      if (et && !et.includes('free')) return false;
    }
    if (priceFilter === 'paid') {
      const et = (e.entry_type ?? '').toLowerCase();
      if (!et || et.includes('free')) return false;
    }
    if (neighbourhoodFilters.size > 0 && (!e.neighbourhood || !neighbourhoodFilters.has(e.neighbourhood))) return false;
    return true;
  }), [events, dateFilter, filter19Plus, categoryFilters, priceFilter, neighbourhoodFilters, today]);

  const rankedEvents = useMemo(() => {
    const now = new Date();
    const scored = filteredEvents
      .map(e => ({ ...e, _score: scoreEvent(e, now, today, userLocationRef.current, activeCheckinVenueIds, categoryFilters) }))
      .filter(e => (e._score ?? 0) >= 0)
      .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

    // Promoted-cap pass: first tier≠null event per category gets isPromoted
    const promotedCats = new Set<string>();
    return scored.map(e => {
      if (e.venue_feature_tier && e.category && !promotedCats.has(e.category)) {
        promotedCats.add(e.category);
        return { ...e, isPromoted: true };
      }
      return e;
    });
  }, [filteredEvents, today, activeCheckinVenueIds, categoryFilters]);

  const visibleCategories = useMemo(() => CATEGORIES.filter(cat =>
    rankedEvents.some(e => e.category === cat.key)
  ), [rankedEvents]);

  const eventsByCategory = (key: string) =>
    rankedEvents.filter(e => e.category === key);

  const isAnyFilterActive = dateFilter !== null || filter19Plus || categoryFilters.size > 0 || priceFilter !== null || neighbourhoodFilters.size > 0 || happyHourChip;

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

      {/* Universal Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#666" style={{ marginRight: 8 }} />
        <TextInput
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Search events, venues, people..."
          placeholderTextColor="#555"
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setSearchResults({ events: [], venues: [], happyHours: [], people: [] });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {searchQuery.trim().length > 0 ? (
        /* ── Search Results ── */
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {searchLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ color: '#555', fontSize: 14 }}>Searching...</Text>
            </View>
          ) : searchResults.events.length === 0 && searchResults.venues.length === 0 &&
             searchResults.happyHours.length === 0 && searchResults.people.length === 0 ? (
            <View style={[styles.emptyState, { paddingTop: 60 }]}>
              <Ionicons name="search-outline" size={40} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No results</Text>
            </View>
          ) : (
            <>
              {searchResults.events.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>EVENTS</Text>
                  {searchResults.events.map((e: any) => (
                    <TouchableOpacity
                      key={e.id}
                      style={styles.searchRow}
                      onPress={() => router.push(`/event/${e.id}`)}
                      activeOpacity={0.75}
                    >
                      {e.poster_url ? (
                        <Image source={{ uri: e.poster_url }} style={styles.searchThumb} />
                      ) : (
                        <View style={[styles.searchThumb, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 18 }}>📅</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchRowTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.searchRowSub} numberOfLines={1}>
                          {[e.venues?.name, e.event_date ? formatDate(e.event_date) : null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#444" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchResults.venues.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>VENUES</Text>
                  {searchResults.venues.map((v: any) => (
                    <TouchableOpacity
                      key={v.id}
                      style={styles.searchRow}
                      onPress={() => router.push(`/venue/${v.id}`)}
                      activeOpacity={0.75}
                    >
                      {v.poster_url ? (
                        <Image source={{ uri: v.poster_url }} style={styles.searchThumb} />
                      ) : (
                        <View style={[styles.searchThumb, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 18 }}>🏢</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchRowTitle} numberOfLines={1}>{v.name}</Text>
                        {v.neighbourhood ? <Text style={styles.searchRowSub} numberOfLines={1}>{v.neighbourhood}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#444" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchResults.happyHours.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>HAPPY HOURS</Text>
                  {searchResults.happyHours.map((h: any) => (
                    <TouchableOpacity
                      key={h.id}
                      style={styles.searchRow}
                      onPress={() => router.push(`/venue/${h.venue_id}`)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.searchThumb, { backgroundColor: '#1a0a00', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 18 }}>🍺</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchRowTitle} numberOfLines={1}>{h.venues?.name ?? ''}</Text>
                        <Text style={styles.searchRowSub} numberOfLines={1}>{h.title}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#444" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchResults.people.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>PEOPLE</Text>
                  {searchResults.people.map((p: any) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.searchRow}
                      onPress={() => { console.log('SEARCH NAV -> profile id:', p.id, 'full person:', JSON.stringify(p)); router.push(`/profile/${p.id}`); }}
                      activeOpacity={0.75}
                    >
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={[styles.searchThumb, { borderRadius: 22 }]} />
                      ) : (
                        <View style={[styles.searchThumb, { borderRadius: 22, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 16, color: '#fff', fontWeight: '700' }}>
                            {((p.display_name || p.username || '?')[0] as string).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchRowTitle} numberOfLines={1}>{p.display_name || p.username}</Text>
                        <Text style={styles.searchRowSub} numberOfLines={1}>@{p.username}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#444" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : loading ? (
        <DiscoverRowsSkeleton />
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
            }
          >
          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}
          >
            <TouchableOpacity
              onPress={() => setDateFilter(v => v === 'tonight' ? null : 'tonight')}
              activeOpacity={0.8}
              style={[styles.chip, dateFilter === 'tonight' && styles.chipActive]}
            >
              <Ionicons name="moon" size={13} color={dateFilter === 'tonight' ? '#fff' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.chipText, dateFilter === 'tonight' && styles.chipTextActive]}>Tonight</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDateFilter(v => v === 'weekend' ? null : 'weekend')}
              activeOpacity={0.8}
              style={[styles.chip, dateFilter === 'weekend' && styles.chipActive]}
            >
              <Text style={[styles.chipText, dateFilter === 'weekend' && styles.chipTextActive]}>This Weekend</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDateFilter(v => v === 'week' ? null : 'week')}
              activeOpacity={0.8}
              style={[styles.chip, dateFilter === 'week' && styles.chipActive]}
            >
              <Text style={[styles.chipText, dateFilter === 'week' && styles.chipTextActive]}>This Week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFilter19Plus(v => !v)}
              activeOpacity={0.8}
              style={[styles.chip, filter19Plus && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter19Plus && styles.chipTextActive]}>19+</Text>
            </TouchableOpacity>
            {CATEGORY_CHIP_KEYS.map(chipKey => (
              <TouchableOpacity
                key={chipKey}
                onPress={() => setCategoryFilters(prev => {
                  const next = new Set(prev);
                  if (next.has(chipKey)) next.delete(chipKey); else next.add(chipKey);
                  return next;
                })}
                activeOpacity={0.8}
                style={[styles.chip, categoryFilters.has(chipKey) && styles.chipActive]}
              >
                <Text style={[styles.chipText, categoryFilters.has(chipKey) && styles.chipTextActive]}>{chipKey}</Text>
              </TouchableOpacity>
            ))}
            {(['free', 'paid'] as const).map(pk => (
              <TouchableOpacity
                key={pk}
                onPress={() => setPriceFilter(v => v === pk ? null : pk)}
                activeOpacity={0.8}
                style={[styles.chip, priceFilter === pk && styles.chipActive]}
              >
                <Text style={[styles.chipText, priceFilter === pk && styles.chipTextActive]}>
                  {pk === 'free' ? 'Free' : 'Paid'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setHappyHourChip(v => !v)}
              activeOpacity={0.8}
              style={[styles.chip, happyHourChip && styles.chipActive]}
            >
              <Ionicons name="beer-outline" size={13} color={happyHourChip ? '#fff' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.chipText, happyHourChip && styles.chipTextActive]}>Happy Hour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setNeighbourhoodModalVisible(true)}
              activeOpacity={0.8}
              style={[styles.chip, neighbourhoodFilters.size > 0 && styles.chipActive]}
            >
              <Text style={[styles.chipText, neighbourhoodFilters.size > 0 && styles.chipTextActive]}>
                {neighbourhoodFilters.size > 0 ? `Neighbourhood (${neighbourhoodFilters.size})` : 'Neighbourhood'}
              </Text>
            </TouchableOpacity>
            {isAnyFilterActive && (
              <TouchableOpacity
                onPress={() => {
                  setDateFilter(null);
                  setFilter19Plus(false);
                  setCategoryFilters(new Set());
                  setPriceFilter(null);
                  setNeighbourhoodFilters(new Set());
                  setHappyHourChip(false);
                }}
                activeOpacity={0.8}
                style={[styles.chip, { borderColor: 'rgba(255,59,92,0.4)' }]}
              >
                <Ionicons name="close" size={12} color="#FF3B5C" />
                <Text style={[styles.chipText, { color: '#FF3B5C' }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Happy Hour Now */}
          {(isHappyHourWindow || happyHourChip) && happyHourDeals.length > 0 && (
            <View style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.categoryTitle}>🍺 Happy Hour</Text>
                  <View style={styles.hhLivePill}>
                    <Text style={styles.hhLiveText}>NOW</Text>
                  </View>
                </View>
                <Text style={styles.hhTime}>{formatTimeTo12(`${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`)}</Text>
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
            <React.Fragment key={cat.key}>
              <CategoryRow
                category={cat}
                events={eventsByCategory(cat.key)}
                onCardPress={e => {
                  if (__DEV__) console.log('[Discover] navigating to event id:', e.id, 'title:', e.title);
                  capture('event_viewed', { event_id: e.id, source: 'discover' });
                  router.push(`/event/${e.id}`);
                }}
                onSeeAll={() => router.push(`/category/${encodeURIComponent(cat.key)}` as any)}
                activeCheckinVenueIds={activeCheckinVenueIds}
              />
            </React.Fragment>
          ))}
          {rankedEvents.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No events found</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
          </ScrollView>
        </>
      )}

      {/* Map Modal */}
      <Modal
        visible={mapModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setMapModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
          <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
            <TouchableOpacity onPress={() => setMapModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', flex: 1 }}>Event Map</Text>
          </View>
          {MapboxGL ? (
            <MapEventView events={filteredEvents} onClose={() => setMapModalVisible(false)} user={user} />
          ) : (
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

      {/* Neighbourhood Modal */}
      <Modal
        visible={neighbourhoodModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNeighbourhoodModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          activeOpacity={1}
          onPress={() => setNeighbourhoodModalVisible(false)}
        >
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: '#111', borderTopLeftRadius: 22, borderTopRightRadius: 22,
            padding: 24, paddingBottom: 40, maxHeight: SCREEN_HEIGHT * 0.6,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 }}>Neighbourhood</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {allNeighbourhoods.map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setNeighbourhoodFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(n)) next.delete(n); else next.add(n);
                    return next;
                  })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{
                    color: neighbourhoodFilters.has(n) ? '#fff' : 'rgba(255,255,255,0.65)',
                    fontSize: 15, fontWeight: neighbourhoodFilters.has(n) ? '700' : '400',
                  }}>{n}</Text>
                  {neighbourhoodFilters.has(n) && <Ionicons name="checkmark" size={18} color="#FF3B5C" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {neighbourhoodFilters.size > 0 && (
              <TouchableOpacity
                onPress={() => { setNeighbourhoodFilters(new Set()); setNeighbourhoodModalVisible(false); }}
                style={{ marginTop: 16, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }}
                activeOpacity={0.75}
              >
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchSectionTitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  searchThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  searchRowTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchRowSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  chipTextActive: {
    color: '#fff',
  },
});
