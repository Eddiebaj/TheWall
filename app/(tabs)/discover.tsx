import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
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
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.35;
const AVATAR_SIZE = 20;
const AVATAR_OVERLAP = 6;

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

const NEIGHBOURHOODS = [
  'All', 'King West', 'Queen West', 'Entertainment District',
  'Dundas West', 'Kensington', 'Bloor', 'College', 'West Queen West',
] as const;

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
  event_date: string | null;
  start_time: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
}

const TORONTO = { lat: 43.6532, lng: -79.3832 };

function buildLeafletHtml(markers: DiscoverEvent[]): string {
  const markersJson = JSON.stringify(
    markers.map(e => ({
      id: e.id,
      lat: e.venue_lat,
      lng: e.venue_lng,
      venue: e.venue_name,
      title: e.title,
    }))
  );
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #0a0a0a; }
    .leaflet-popup-content-wrapper {
      background: #141720;
      color: #fff;
      border-radius: 10px;
      border: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    .leaflet-popup-tip { background: #141720; }
    .leaflet-popup-content { margin: 10px 14px; font-family: -apple-system, sans-serif; }
    .popup-venue { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px; }
    .popup-title { font-size: 12px; color: rgba(255,255,255,0.65); }
    .marker-cluster {
      background: rgba(26,26,46,0.9) !important;
      border: 2px solid #FF3B5C !important;
    }
    .marker-cluster div {
      background: transparent !important;
      color: #fff !important;
      font-family: -apple-system, sans-serif !important;
      font-size: 13px !important;
      font-weight: 800 !important;
    }
    .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
      background: rgba(26,26,46,0.9) !important;
    }
    .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
      background: transparent !important;
    }
  </style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${TORONTO.lat}, ${TORONTO.lng}], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  function getEventColor(title) {
    var t = (title || '').toLowerCase();
    if (/club|dj|nightlife|party/.test(t)) return '#FF3B5C';
    if (/live music|concert|band/.test(t)) return '#FF6B35';
    if (/happy hour|drinks|bar/.test(t)) return '#D4A017';
    if (/food|brunch|restaurant/.test(t)) return '#00C853';
    if (/art|comedy|game|trivia/.test(t)) return '#2979FF';
    return '#FF3B5C';
  }

  function makeBannerIcon(venue, color, zoom, selected) {
    var label = venue || '';
    var opacity = selected ? '1' : '0.9';
    var scale = selected ? 'scale(1.1)' : 'scale(1)';
    var bgColor = color.replace(')', ', 0.85)').replace('rgb(', 'rgba(').replace(/^(#[0-9a-fA-F]+)$/, function(hex) {
      var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return 'rgba(' + r + ',' + g + ',' + b + ',0.85)';
    });
    var html = '<div class="pill-marker" style="background:' + bgColor + ';color:#fff;font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;transition:transform 0.15s ease,opacity 0.15s ease;opacity:' + opacity + ';transform:' + scale + ';display:inline-block;">'
      + label
      + '</div>';
    return L.divIcon({
      className: '',
      html: html,
      iconAnchor: [0, 14],
    });
  }

  var clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    iconCreateFunction: function(cluster) {
      var count = cluster.getChildCount();
      return L.divIcon({
        html: '<div style="width:40px;height:40px;border-radius:20px;background:rgba(26,26,46,0.95);border:2px solid #FF3B5C;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;font-family:-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.6);">' + count + '</div>',
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    },
  });

  var markerObjects = [];
  var markers = ${markersJson};

  markers.forEach(function(m) {
    var color = getEventColor(m.title);
    var icon = makeBannerIcon(m.venue, color, map.getZoom(), false);
    var marker = L.marker([m.lat, m.lng], { icon: icon });
    markerObjects.push({ leaflet: marker, data: m, color: color, selected: false });

    marker.on('click', function(e) {
      L.DomEvent.stopPropagation(e);
      markerObjects.forEach(function(obj) {
        obj.selected = (obj.data.id === m.id);
        obj.leaflet.setIcon(makeBannerIcon(obj.data.venue, obj.color, map.getZoom(), obj.selected));
      });
      window.ReactNativeWebView.postMessage(m.id);
    });

    clusterGroup.addLayer(marker);
  });

  map.addLayer(clusterGroup);

  // Re-render icons when zoom changes
  map.on('zoomend', function() {
    var zoom = map.getZoom();
    markerObjects.forEach(function(obj) {
      obj.leaflet.setIcon(makeBannerIcon(obj.data.venue, obj.color, zoom, obj.selected));
    });
  });

  map.on('click', function() {
    markerObjects.forEach(function(obj) {
      obj.selected = false;
      obj.leaflet.setIcon(makeBannerIcon(obj.data.venue, obj.color, map.getZoom(), false));
    });
    window.ReactNativeWebView.postMessage('');
  });
</script>
</body>
</html>`;
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
  const [sort, setSort] = useState<SortOption>('This Week');
  const [neighbourhood, setNeighbourhood] = useState<string>('All');
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [attendees, setAttendees] = useState<Record<string, AttendeeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapMode, setMapMode] = useState(false);
  const [gridSort, setGridSort] = useState<'date' | 'popular'>('date');
  const [selectedEvent, setSelectedEvent] = useState<DiscoverEvent | null>(null);
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

    let query = supabase
      .from('events')
      .select('id, title, poster_url, date, start_time, venue_id, venues(name, neighbourhood, latitude, longitude)')
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
        venue_id: e.venue_id || null,
        venue_name: e.venues?.name || '',
        neighbourhood: e.venues?.neighbourhood || null,
        cover_charge: e.cover_charge || null,
        event_date: e.date || null,
        start_time: e.start_time || null,
        venue_lat: e.venues?.latitude ?? null,
        venue_lng: e.venues?.longitude ?? null,
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

  const filteredEvents = (() => {
    const base = neighbourhood === 'All' ? events : events.filter(e => e.neighbourhood === neighbourhood);
    if (gridSort === 'popular') {
      return [...base].sort((a, b) => (attendees[b.id]?.count ?? 0) - (attendees[a.id]?.count ?? 0));
    }
    return base;
  })();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Discover</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/search' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="search" size={22} color="rgba(255,255,255,0.8)" />
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
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ gap: 6, paddingRight: 4 }}
        >
          {NEIGHBOURHOODS.map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setNeighbourhood(n)}
              style={[styles.nbBtn, neighbourhood === n && styles.nbBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.nbBtnText, neighbourhood === n && styles.nbBtnTextActive]}>
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <SkeletonGrid />
      ) : mapMode ? (
        <View style={{ flex: 1 }}>
          <WebView
            style={{ flex: 1 }}
            originWhitelist={['*']}
            onMessage={(e) => {
              const eventId = e.nativeEvent.data;
              if (!eventId) { setSelectedEvent(null); return; }
              const found = events.find(ev => ev.id === eventId) || null;
              setSelectedEvent(found);
            }}
            source={{ html: buildLeafletHtml(filteredEvents.filter(e => e.venue_lat != null && e.venue_lng != null)) }}
          />
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
                      {[formatDate(selectedEvent.event_date), selectedEvent.start_time].filter(Boolean).join(' · ')}
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
            No events {sort === 'Tonight' ? 'tonight' : 'this week'}
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
          }
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
