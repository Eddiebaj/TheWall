import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import {
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_IMAGE_HEIGHT = Math.round(SCREEN_WIDTH * 0.52);
const AVATAR_SIZE = 20;
const AVATAR_OVERLAP = 6;
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80';

interface FeedEvent {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  venue_name: string;
  venue_id: string | null;
  neighbourhood: string | null;
  going_count: number;
  going_avatars: { id: string; username: string; avatar_url: string | null }[];
}

interface ActivityItem {
  id: string;
  type: 'rsvp' | 'post';
  created_at: string;
  user_id: string;
  event_id: string | null;
  profile: { username: string; avatar_url: string | null } | null;
  event: { id: string; title: string; venue_name: string | null } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function EventCard({ item, onPress }: { item: FeedEvent; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.eventCard} activeOpacity={0.87} onPress={onPress}>
      <Image
        source={{ uri: item.poster_url || FALLBACK_IMAGE }}
        style={styles.eventImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={styles.eventGradient}
      >
        {item.going_count > 0 && (
          <View style={styles.goingRow}>
            <View style={{ flexDirection: 'row', height: AVATAR_SIZE, width: item.going_avatars.length * (AVATAR_SIZE - AVATAR_OVERLAP) + AVATAR_OVERLAP }}>
              {item.going_avatars.map((a, i) => (
                <View
                  key={a.id}
                  style={[styles.avatar, {
                    left: i * (AVATAR_SIZE - AVATAR_OVERLAP),
                    zIndex: item.going_avatars.length - i,
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
            <Text style={styles.goingText}>{item.going_count} going</Text>
          </View>
        )}
        <Text style={styles.eventVenue} numberOfLines={1}>{item.venue_name}</Text>
        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.eventDate}>
          {[formatDate(item.event_date), item.start_time].filter(Boolean).join(' · ')}
        </Text>
      </LinearGradient>
      {item.neighbourhood && (
        <View style={styles.neighbourhoodPill}>
          <Text style={styles.neighbourhoodText}>{item.neighbourhood}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ActivityRow({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  const username = item.profile?.username ?? 'Someone';
  const avatarUrl = item.profile?.avatar_url;
  const initial = username.charAt(0).toUpperCase();

  let text = '';
  if (item.type === 'rsvp') {
    text = `${username} is going to ${item.event?.title ?? 'an event'}`;
    if (item.event?.venue_name) text += ` at ${item.event.venue_name}`;
  } else {
    text = `${username} posted`;
    if (item.event?.title) text += ` at ${item.event.title}`;
  }

  return (
    <TouchableOpacity style={styles.activityRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.activityAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.activityAvatarImg} />
        ) : (
          <Text style={styles.activityAvatarInitial}>{initial}</Text>
        )}
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityText} numberOfLines={2}>{text}</Text>
        <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
      </View>
      {item.event_id && (
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
      )}
    </TouchableOpacity>
  );
}

function TabToggle({
  active,
  onSelect,
  insetTop,
}: {
  active: 'foryou' | 'activity';
  onSelect: (t: 'foryou' | 'activity') => void;
  insetTop: number;
}) {
  return (
    <View style={[styles.tabBar, { top: insetTop + 12 }]}>
      <TouchableOpacity onPress={() => onSelect('foryou')} style={styles.tabBtn}>
        <Text style={[styles.tabText, active === 'foryou' && styles.tabTextActive]}>For You</Text>
        {active === 'foryou' && <View style={styles.tabUnderline} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onSelect('activity')} style={styles.tabBtn}>
        <Text style={[styles.tabText, active === 'activity' && styles.tabTextActive]}>Activity</Text>
        {active === 'activity' && <View style={styles.tabUnderline} />}
      </TouchableOpacity>
    </View>
  );
}

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<'foryou' | 'activity'>('foryou');
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [hasFriends, setHasFriends] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadFeedEvents();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'activity') loadActivity();
  }, [activeTab, user]);

  const loadFeedEvents = async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Fetch user's preferred neighbourhoods from past RSVPs
    let preferredNeighbourhoods = new Set<string>();
    if (user) {
      const { data: rsvpData } = await supabase
        .from('event_rsvps')
        .select('events(venues(neighbourhood))')
        .eq('user_id', user.id)
        .eq('status', 'going')
        .limit(20);

      if (rsvpData) {
        for (const r of rsvpData as any[]) {
          const n = r.events?.venues?.neighbourhood;
          if (n) preferredNeighbourhoods.add(n);
        }
      }
    }

    const { data, error } = await supabase
      .from('events')
      .select('id, title, poster_url, date, start_time, venue_id, venues(name, neighbourhood)')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(60);

    setLoading(false);
    if (error || !data) return;

    // Load going counts
    const eventIds = data.map((e: any) => e.id);
    const { data: rsvpRows } = await supabase
      .from('event_rsvps')
      .select('event_id, profiles(id, username, avatar_url)')
      .in('event_id', eventIds)
      .eq('status', 'going');

    const attendeeMap: Record<string, { count: number; avatars: any[] }> = {};
    for (const row of (rsvpRows ?? []) as any[]) {
      const eid = row.event_id;
      if (!attendeeMap[eid]) attendeeMap[eid] = { count: 0, avatars: [] };
      attendeeMap[eid].count += 1;
      if (attendeeMap[eid].avatars.length < 3 && row.profiles) {
        attendeeMap[eid].avatars.push(row.profiles);
      }
    }

    const mapped: FeedEvent[] = data.map((e: any) => ({
      id: e.id,
      title: e.title,
      poster_url: e.poster_url || null,
      event_date: e.date || null,
      start_time: e.start_time || null,
      venue_name: e.venues?.name || '',
      venue_id: e.venue_id || null,
      neighbourhood: e.venues?.neighbourhood || null,
      going_count: attendeeMap[e.id]?.count ?? 0,
      going_avatars: attendeeMap[e.id]?.avatars ?? [],
    }));

    // Sort: preferred neighbourhood first (by going count desc within group), then rest by date
    if (preferredNeighbourhoods.size > 0) {
      const preferred = mapped.filter(e => e.neighbourhood && preferredNeighbourhoods.has(e.neighbourhood));
      const rest = mapped.filter(e => !e.neighbourhood || !preferredNeighbourhoods.has(e.neighbourhood));
      preferred.sort((a, b) => b.going_count - a.going_count || (a.event_date ?? '').localeCompare(b.event_date ?? ''));
      setFeedEvents([...preferred, ...rest]);
    } else {
      setFeedEvents(mapped);
    }
  };

  const loadActivity = async () => {
    if (!user) { setHasFriends(false); setActivityItems([]); return; }

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships || friendships.length === 0) {
      setHasFriends(false);
      setActivityItems([]);
      return;
    }

    setHasFriends(true);
    const friendIds = friendships.map((f: any) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    const [rsvpRes, postRes] = await Promise.all([
      supabase
        .from('event_rsvps')
        .select('id, created_at, user_id, event_id, profiles(username, avatar_url), events(id, title, venues(name))')
        .in('user_id', friendIds)
        .eq('status', 'going')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('posts')
        .select('id, created_at, user_id, event_id, profiles(username, avatar_url), events(id, title, venues(name))')
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const rsvpItems: ActivityItem[] = (rsvpRes.data ?? []).map((r: any) => ({
      id: `rsvp-${r.id}`,
      type: 'rsvp',
      created_at: r.created_at,
      user_id: r.user_id,
      event_id: r.event_id,
      profile: r.profiles ?? null,
      event: r.events ? { id: r.events.id, title: r.events.title, venue_name: r.events.venues?.name ?? null } : null,
    }));

    const postItems: ActivityItem[] = (postRes.data ?? []).map((p: any) => ({
      id: `post-${p.id}`,
      type: 'post',
      created_at: p.created_at,
      user_id: p.user_id,
      event_id: p.event_id,
      profile: p.profiles ?? null,
      event: p.events ? { id: p.events.id, title: p.events.title, venue_name: p.events.venues?.name ?? null } : null,
    }));

    const merged = [...rsvpItems, ...postItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    setActivityItems(merged);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeedEvents();
    if (activeTab === 'activity') await loadActivity();
    setRefreshing(false);
  }, [activeTab]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {activeTab === 'foryou'
        ? (feedEvents.length === 0 && !loading
          ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No upcoming events</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/discover')}>
                <Text style={styles.emptyBtnText}>Browse Discover</Text>
              </TouchableOpacity>
            </View>
          )
          : (
            <FlatList
              data={feedEvents}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <EventCard
                  item={item}
                  onPress={() => router.push(`/event/${item.id}` as any)}
                />
              )}
              contentContainerStyle={[styles.feedList, { paddingTop: insets.top + 56 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
            />
          )
        )
        : !hasFriends
          ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No activity yet</Text>
              <Text style={styles.emptyHint}>Add friends to see what they're up to</Text>
            </View>
          )
          : activityItems.length === 0
            ? (
              <View style={styles.emptyState}>
                <Ionicons name="flash-outline" size={48} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>No activity yet</Text>
                <Text style={styles.emptyHint}>Add friends to see what they're up to</Text>
              </View>
            )
            : (
              <FlatList
                data={activityItems}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <ActivityRow
                    item={item}
                    onPress={() => {
                      if (item.event_id) router.push(`/event/${item.event_id}` as any);
                    }}
                  />
                )}
                contentContainerStyle={[styles.activityList, { paddingTop: insets.top + 56 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
              />
            )
      }

      <TabToggle active={activeTab} onSelect={setActiveTab} insetTop={insets.top} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    zIndex: 10,
  },
  tabBtn: { alignItems: 'center', paddingVertical: 4 },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabTextActive: { color: '#fff' },
  tabUnderline: {
    marginTop: 3,
    height: 2,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
  },
  emptyBtn: {
    borderWidth: 1.5,
    borderColor: '#FF3B5C',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  emptyBtnText: {
    color: '#FF3B5C',
    fontSize: 14,
    fontWeight: '700',
  },
  // For You feed
  feedList: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },
  eventCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  eventImage: {
    width: '100%',
    height: CARD_IMAGE_HEIGHT,
  },
  eventGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 48,
    paddingBottom: 14,
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avatar: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  goingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  eventVenue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  eventDate: {
    color: '#FF3B5C',
    fontSize: 12,
    fontWeight: '600',
  },
  neighbourhoodPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  neighbourhoodText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  // Activity feed
  activityList: {
    paddingHorizontal: 0,
    paddingBottom: 100,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  activityAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  activityAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  activityAvatarInitial: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  activityContent: {
    flex: 1,
    gap: 3,
  },
  activityText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  activityTime: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
});
