import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAnalytics } from '../../lib/analytics';
import { sendNotification } from '../../lib/notificationHelpers';
import { SK_TOOLTIP_SHOWN } from '../../lib/storageKeys';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const GRID_PADDING = 16;
const GRID_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.25);
const AVATAR_SIZE = 18;
const AVATAR_OVERLAP = 5;
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
  entry_type: string | null;
  going_count: number;
  going_avatars: { id: string; username: string; avatar_url: string | null }[];
  source?: string | null;
}

interface RsvpEvent {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  venue_name: string;
}

interface ActivityItem {
  id: string;
  type: 'rsvp' | 'post' | 'created_event';
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

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function EventCard({ item, onPress, userId }: { item: FeedEvent; onPress: () => void; userId: string | undefined }) {
  const [imgError, setImgError] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const savingRef = useRef(false);
  const showImage = item.poster_url && !imgError;

  React.useEffect(() => {
    if (!userId) return;
    supabase
      .from('saved_events')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', item.id)
      .maybeSingle()
      .then(({ data }) => setIsSaved(!!data));
  }, [userId, item.id]);

  const handleToggleSave = async (e: any) => {
    e.stopPropagation();
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    const nowSaved = !isSaved;
    setIsSaved(nowSaved);
    if (nowSaved) {
      const { error } = await supabase.from('saved_events').upsert({ user_id: userId, event_id: item.id });
      if (error) setIsSaved(false);
    } else {
      const { error } = await supabase.from('saved_events').delete().eq('user_id', userId).eq('event_id', item.id);
      if (error) setIsSaved(true);
    }
    savingRef.current = false;
  };

  return (
    <TouchableOpacity style={styles.eventCard} activeOpacity={0.87} onPress={onPress}>
      {showImage ? (
        <Image
          source={{ uri: item.poster_url! }}
          style={styles.eventImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={[styles.eventImage, { backgroundColor: '#1a1a1a' }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={styles.eventGradient}
      >
        {item.going_avatars.length > 0 && (
          <View style={styles.goingRow}>
            <View style={{ flexDirection: 'row', height: AVATAR_SIZE, width: item.going_avatars.length * (AVATAR_SIZE - AVATAR_OVERLAP) + AVATAR_OVERLAP + 2 }}>
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
          {[formatDate(item.event_date), formatTime(item.start_time)].filter(Boolean).join(' · ')}
        </Text>
      </LinearGradient>
      <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        {item.source === 'user' ? (
          <View style={{ backgroundColor: '#FF3B5C', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.4 }}>ORGANIZER</Text>
          </View>
        ) : item.source != null ? (
          <View style={{ backgroundColor: '#FF3B5C', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.4 }}>VENUE</Text>
          </View>
        ) : null}
        {item.neighbourhood && (
          <View style={styles.neighbourhoodPill}>
            <Text style={styles.neighbourhoodText}>{item.neighbourhood}</Text>
          </View>
        )}
      </View>
      {userId && (
        <TouchableOpacity
          onPress={handleToggleSave}
          style={{
            position: 'absolute', top: 6, right: 6, padding: 4,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.8, shadowRadius: 3,
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color="rgba(255,255,255,0.9)" strokeWidth={2} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function ActivityRow({
  item,
  onPress,
  onPressAvatar,
  userId,
  currentUsername,
}: {
  item: ActivityItem;
  onPress: () => void;
  onPressAvatar: () => void;
  userId: string | undefined;
  currentUsername: string | undefined;
}) {
  const username = item.profile?.username ?? 'Someone';
  const avatarUrl = item.profile?.avatar_url;
  const initial = username.charAt(0).toUpperCase();
  const [isGoing, setIsGoing] = React.useState(false);
  const [rsvpTable, setRsvpTable] = React.useState<'event_rsvps' | 'venue_event_rsvps'>('event_rsvps');
  const rsvpRef = React.useRef(false);

  const showJoinBtn = item.type === 'rsvp' && !!item.event_id;

  React.useEffect(() => {
    if (!userId || !item.event_id || !showJoinBtn) return;
    supabase
      .from('event_rsvps')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', item.event_id)
      .eq('status', 'going')
      .maybeSingle()
      .then(({ data: d1 }) => {
        if (d1) { setIsGoing(true); setRsvpTable('event_rsvps'); return; }
        supabase
          .from('venue_event_rsvps')
          .select('id')
          .eq('user_id', userId)
          .eq('event_id', item.event_id)
          .eq('status', 'going')
          .maybeSingle()
          .then(({ data: d2 }) => {
            if (d2) { setIsGoing(true); setRsvpTable('venue_event_rsvps'); return; }
            // No existing RSVP -- check which table this event belongs to
            supabase
              .from('venue_events')
              .select('id')
              .eq('id', item.event_id!)
              .maybeSingle()
              .then(({ data: ve }) => {
                if (ve) setRsvpTable('venue_event_rsvps');
              });
          });
      });
  }, [userId, item.event_id]);

  const handleToggleRsvp = async () => {
    if (!userId || !item.event_id || rsvpRef.current) return;
    rsvpRef.current = true;
    const nowGoing = !isGoing;
    setIsGoing(nowGoing);
    if (nowGoing) {
      const { error } = await supabase
        .from(rsvpTable)
        .upsert({ user_id: userId, event_id: item.event_id, status: 'going' });
      if (error) { setIsGoing(false); rsvpRef.current = false; return; }
      if (item.user_id && item.user_id !== userId) {
        const eventTitle = item.event?.title ?? 'an event';
        await sendNotification(
          item.user_id,
          'activity',
          'You have company',
          `@${currentUsername ?? 'Someone'} is also going to ${eventTitle}`,
          { event_id: item.event_id }
        );
      }
    } else {
      const { error } = await supabase
        .from(rsvpTable)
        .delete()
        .eq('user_id', userId)
        .eq('event_id', item.event_id);
      if (error) setIsGoing(true);
    }
    rsvpRef.current = false;
  };

  let text = '';
  if (item.type === 'rsvp') {
    text = `${username} is going to ${item.event?.title ?? 'an event'}`;
    if (item.event?.venue_name) text += ` at ${item.event.venue_name}`;
  } else if (item.type === 'created_event') {
    text = `${username} created an event: ${item.event?.title ?? 'Untitled'}`;
    if (item.event?.venue_name) text += ` at ${item.event.venue_name}`;
  } else {
    text = `${username} posted`;
    if (item.event?.title) text += ` at ${item.event.title}`;
  }

  return (
    <View style={styles.activityRow}>
      <TouchableOpacity onPress={onPressAvatar} activeOpacity={0.75} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <View style={styles.activityAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.activityAvatarImg} />
          ) : (
            <Text style={styles.activityAvatarInitial}>{initial}</Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.activityContent} onPress={onPress} activeOpacity={0.75}>
        <Text style={styles.activityText} numberOfLines={2}>{text}</Text>
        <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
      </TouchableOpacity>
      {showJoinBtn ? (
        <TouchableOpacity
          onPress={handleToggleRsvp}
          style={[
            styles.joinBtn,
            isGoing && styles.joinBtnGoing,
          ]}
          activeOpacity={0.75}
        >
          {isGoing && <Ionicons name="checkmark" size={13} color="#4CD964" style={{ marginRight: 3 }} />}
          <Text style={[styles.joinBtnText, isGoing && styles.joinBtnTextGoing]}>
            {isGoing ? 'Going' : 'Join'}
          </Text>
        </TouchableOpacity>
      ) : item.event_id ? (
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
      ) : null}
    </View>
  );
}

const RSVP_CARD_WIDTH = 130;
const RSVP_CARD_HEIGHT = 170;

function RsvpCard({ item, onPress }: { item: RsvpEvent; onPress: () => void }) {
  const [imgError, setImgError] = React.useState(false);
  return (
    <TouchableOpacity
      style={{ width: RSVP_CARD_WIDTH, borderRadius: 10, overflow: 'hidden', backgroundColor: '#111', marginRight: 10 }}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {item.poster_url && !imgError ? (
        <Image
          source={{ uri: item.poster_url }}
          style={{ width: RSVP_CARD_WIDTH, height: RSVP_CARD_HEIGHT }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={{ width: RSVP_CARD_WIDTH, height: RSVP_CARD_HEIGHT, backgroundColor: '#1a1a1a' }} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, paddingTop: 24 }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
          {item.venue_name}
        </Text>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 15, marginBottom: 3 }} numberOfLines={2}>
          {item.title}
        </Text>
        {item.event_date ? (
          <Text style={{ color: '#FF3B5C', fontSize: 10, fontWeight: '600' }}>{formatDate(item.event_date)}</Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function TabToggle({
  active,
  onSelect,
  insetTop,
  onSearch,
  onBell,
  unreadNotifs,
}: {
  active: 'foryou' | 'activity';
  onSelect: (t: 'foryou' | 'activity') => void;
  insetTop: number;
  onSearch: () => void;
  onBell: () => void;
  unreadNotifs: number;
}) {
  return (
    <View style={[styles.tabBar, { top: insetTop + 12, paddingHorizontal: 12, justifyContent: 'space-between' }]}>
      <TouchableOpacity onPress={onSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 32 }}>
        <TouchableOpacity onPress={() => onSelect('foryou')} style={styles.tabBtn}>
          <Text style={[styles.tabText, active === 'foryou' && styles.tabTextActive]}>For You</Text>
          {active === 'foryou' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSelect('activity')} style={styles.tabBtn}>
          <Text style={[styles.tabText, active === 'activity' && styles.tabTextActive]}>Activity</Text>
          {active === 'activity' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onBell} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ position: 'relative' }}>
        <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
        {unreadNotifs > 0 && (
          <View style={{
            position: 'absolute', top: -4, right: -6,
            backgroundColor: '#FF3B5C', borderRadius: 8,
            minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
          }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
              {unreadNotifs > 99 ? '99+' : unreadNotifs}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<'foryou' | 'activity'>('foryou');
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [fallbackEvents, setFallbackEvents] = useState<FeedEvent[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [myGoingRsvps, setMyGoingRsvps] = useState<RsvpEvent[]>([]);
  const [myInterestedRsvps, setMyInterestedRsvps] = useState<RsvpEvent[]>([]);
  const [planInvites, setPlanInvites] = useState<any[]>([]);
  const [hasFriends, setHasFriends] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null); // null = loading
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipStep, setTooltipStep] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();

  useEffect(() => {
    capture('app_opened');
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
      .then(({ count }) => setUnreadNotifs(count ?? 0));
  }, [user]);

  useEffect(() => {
    if (profile) {
      AsyncStorage.getItem(SK_TOOLTIP_SHOWN).then(val => {
        if (!val) setShowTooltip(true);
      });
    }
  }, [profile]);

  useEffect(() => {
    loadFeedEvents(getToday());
  }, [user]);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivity();
      loadMyRsvps();
      if (user) loadPlanInvites();
    }
  }, [activeTab, user]);

  const loadPlanInvites = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('pending_plans')
      .select('id, creator_id, event_id, event_title, event_venue, event_date, responses, profiles!pending_plans_creator_id_fkey(username, avatar_url)')
      .contains('invited_user_ids', [user.id])
      .order('created_at', { ascending: false })
      .limit(10);
    setPlanInvites((data || []) as any[]);
  };

  const loadMyRsvps = async () => {
    if (!user) { setMyGoingRsvps([]); setMyInterestedRsvps([]); return; }

    const [goingLeg, intLeg, goingVe, intVe] = await Promise.all([
      supabase
        .from('event_rsvps')
        .select('event_id, events(id, title, poster_url, date, venues(name))')
        .eq('user_id', user.id)
        .eq('status', 'going')
        .limit(30),
      supabase
        .from('event_rsvps')
        .select('event_id, events(id, title, poster_url, date, venues(name))')
        .eq('user_id', user.id)
        .eq('status', 'interested')
        .limit(30),
      supabase
        .from('venue_event_rsvps')
        .select('event_id, venue_events(id, title, poster_url, event_date, venues(name))')
        .eq('user_id', user.id)
        .eq('status', 'going')
        .limit(30),
      supabase
        .from('venue_event_rsvps')
        .select('event_id, venue_events(id, title, poster_url, event_date, venues(name))')
        .eq('user_id', user.id)
        .eq('status', 'interested')
        .limit(30),
    ]);

    const normLeg = (r: any, dateKey = 'date'): RsvpEvent => ({
      id: r.id, title: r.title, poster_url: r.poster_url || null,
      event_date: r[dateKey] || null, venue_name: r.venues?.name || '',
    });
    const normVe = (r: any): RsvpEvent => normLeg(r, 'event_date');

    const mergeDedup = (a: RsvpEvent[], b: RsvpEvent[]) => {
      const seen = new Set<string>();
      return [...a, ...b].filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    };

    const going = mergeDedup(
      (goingLeg.data ?? []).map((r: any) => r.events).filter(Boolean).map(normLeg),
      (goingVe.data ?? []).map((r: any) => r.venue_events).filter(Boolean).map(normVe),
    ).sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''));

    const interested = mergeDedup(
      (intLeg.data ?? []).map((r: any) => r.events).filter(Boolean).map(normLeg),
      (intVe.data ?? []).map((r: any) => r.venue_events).filter(Boolean).map(normVe),
    );

    setMyGoingRsvps(going);
    setMyInterestedRsvps(interested);
  };

  const handlePlanResponse = async (planId: string, creatorId: string, response: 'in' | 'maybe' | 'pass', plan: any) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('pending_plans')
      .select('responses, invited_user_ids')
      .eq('id', planId)
      .single();
    if (!existing) return;

    const newResponses = { ...(existing.responses || {}), [user.id]: response };
    await supabase.from('pending_plans').update({ responses: newResponses }).eq('id', planId);

    // Check if 2+ people said "in" - auto-create group chat
    const inCount = Object.values(newResponses).filter(v => v === 'in').length;
    if (inCount >= 2) {
      // Check if group chat already exists for this plan
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('name', `Plan: ${plan.event_title}`)
        .maybeSingle();

      if (!existingConv) {
        const allInIds = [creatorId, ...Object.entries(newResponses).filter(([, v]) => v === 'in').map(([k]) => k)];
        const uniqueIds = [...new Set(allInIds)];
        const { data: conv } = await supabase
          .from('conversations')
          .insert({ type: 'group', name: `Plan: ${plan.event_title}` })
          .select('id')
          .single();
        if (conv) {
          await supabase.from('conversation_members').insert(
            uniqueIds.map(uid => ({ conversation_id: conv.id, user_id: uid }))
          );
          // Notify all members
          for (const uid of uniqueIds) {
            if (uid === user.id) continue;
            sendNotification(
              uid,
              'plan_crew_going',
              'Your crew is going',
              `Your crew is going to ${plan.event_title}! Chat started.`,
              { type: 'plan_crew', conversationId: conv.id, eventId: String(plan.event_id) },
              true,
              'high'
            );
          }
        }
      }
    }

    await loadPlanInvites();
  };

  const loadFeedEvents = async (today: string, showSpinner = true) => {
    if (showSpinner) setLoading(true);

    // Build taste profile from RSVPs (both event_rsvps and venue_event_rsvps) and saved events
    const preferredNeighbourhoods = new Set<string>();
    const preferredEntryTypes = new Set<string>();
    const preferredVenueIds = new Set<string>();
    const savedEventIds = new Set<string>();

    if (user) {
      const [rsvpRes, veRsvpRes, savedRes] = await Promise.all([
        supabase
          .from('event_rsvps')
          .select('events(venue_id, entry_type, venues(neighbourhood))')
          .eq('user_id', user.id)
          .eq('status', 'going')
          .limit(30),
        supabase
          .from('venue_event_rsvps')
          .select('venue_events(venue_id, entry_type, venues(neighbourhood))')
          .eq('user_id', user.id)
          .eq('status', 'going')
          .limit(30),
        supabase
          .from('saved_events')
          .select('event_id')
          .eq('user_id', user.id),
      ]);

      for (const r of (rsvpRes.data ?? []) as any[]) {
        const ev = r.events;
        if (!ev) continue;
        if (ev.venues?.neighbourhood) preferredNeighbourhoods.add(ev.venues.neighbourhood);
        if (ev.entry_type) preferredEntryTypes.add(ev.entry_type);
        if (ev.venue_id) preferredVenueIds.add(ev.venue_id);
      }
      for (const r of (veRsvpRes.data ?? []) as any[]) {
        const ev = r.venue_events;
        if (!ev) continue;
        if (ev.venues?.neighbourhood) preferredNeighbourhoods.add(ev.venues.neighbourhood);
        if (ev.entry_type) preferredEntryTypes.add(ev.entry_type);
        if (ev.venue_id) preferredVenueIds.add(ev.venue_id);
      }
      for (const s of (savedRes.data ?? []) as any[]) {
        if (s.event_id) savedEventIds.add(s.event_id);
      }
    }

    // No taste profile yet -- load fallback instead of blank screen
    if (preferredNeighbourhoods.size === 0 && preferredEntryTypes.size === 0 && savedEventIds.size === 0) {
      setHasProfile(false);
      await loadFallbackEvents(today);
      if (showSpinner) setLoading(false);
      return;
    }

    setHasProfile(true);

    // Fetch friend IDs so we can include friends-only venue_events from people we follow
    const friendIdSet = new Set<string>();
    if (user) {
      const { data: fships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      for (const f of (fships ?? []) as any[]) {
        friendIdSet.add(f.requester_id === user.id ? f.addressee_id : f.requester_id);
      }
    }

    const friendIds = Array.from(friendIdSet);

    // Fetch events + broad friend RSVPs (for pool expansion) in parallel
    const [legacyRes, venueEventsRes, frLegacy, frVe] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, poster_url, date, start_time, entry_type, category, venue_id, venues(name, neighbourhood)')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(120),
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, event_time, entry_type, category, venue_id, source, creator_id, visibility, venues(name, neighbourhood)')
        .gte('event_date', today)
        .in('source', ['user', 'ticketmaster'])
        .order('event_date', { ascending: true })
        .limit(120),
      friendIds.length > 0
        ? supabase
            .from('event_rsvps')
            .select('event_id')
            .in('user_id', friendIds)
            .eq('status', 'going')
        : Promise.resolve({ data: [] }),
      friendIds.length > 0
        ? supabase
            .from('venue_event_rsvps')
            .select('event_id')
            .in('user_id', friendIds)
            .eq('status', 'going')
        : Promise.resolve({ data: [] }),
    ]);

    if (legacyRes.error && venueEventsRes.error) {
      if (showSpinner) setLoading(false);
      return;
    }

    // Build friend going set from broad queries -- used for pool expansion and scoring
    const friendGoingSet = new Set<string>();
    for (const row of (frLegacy.data ?? []) as any[]) if (row.event_id) friendGoingSet.add(row.event_id);
    for (const row of (frVe.data ?? []) as any[]) if (row.event_id) friendGoingSet.add(row.event_id);

    // Normalise legacy events
    const legacyNorm: any[] = (legacyRes.data ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      poster_url: e.poster_url || null,
      event_date: e.date || null,
      start_time: e.start_time || null,
      venue_name: e.venues?.name || '',
      venue_id: e.venue_id || null,
      neighbourhood: e.venues?.neighbourhood || null,
      entry_type: e.entry_type || null,
      source: null,
    }));

    // Normalise venue_events, filtering friends-only
    const veNorm: any[] = (venueEventsRes.data ?? [])
      .filter((e: any) => {
        if (e.visibility === 'friends') {
          return e.creator_id && (friendIdSet.has(e.creator_id) || e.creator_id === user?.id);
        }
        return true;
      })
      .map((e: any) => ({
        id: e.id,
        title: e.title,
        poster_url: e.poster_url || null,
        event_date: e.event_date || null,
        start_time: e.event_time || null,
        venue_name: e.venues?.name || '',
        venue_id: e.venue_id || null,
        neighbourhood: e.venues?.neighbourhood || null,
        entry_type: e.entry_type || null,
        source: e.source || null,
      }));

    // Merge, deduplicate by id
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const e of [...legacyNorm, ...veNorm]) {
      if (!seen.has(e.id)) { seen.add(e.id); combined.push(e); }
    }

    // Filter to taste profile, saved events, OR events where a friend is going
    const relevant = combined.filter(e => {
      if (savedEventIds.has(e.id)) return true;
      if (friendGoingSet.has(e.id)) return true;
      return (
        (e.neighbourhood && preferredNeighbourhoods.has(e.neighbourhood)) ||
        (e.entry_type && preferredEntryTypes.has(e.entry_type)) ||
        (e.venue_id && preferredVenueIds.has(e.venue_id))
      );
    });

    // Load going counts for relevant events
    const eventIds = relevant.map((e: any) => e.id);

    const [rsvpRowsRes, veRsvpRowsRes] = eventIds.length > 0
      ? await Promise.all([
          supabase
            .from('event_rsvps')
            .select('event_id, profiles(id, username, avatar_url)')
            .in('event_id', eventIds)
            .eq('status', 'going'),
          supabase
            .from('venue_event_rsvps')
            .select('event_id, profiles(id, username, avatar_url)')
            .in('event_id', eventIds)
            .eq('status', 'going'),
        ])
      : [{ data: [] }, { data: [] }];

    const attendeeMap: Record<string, { count: number; avatars: any[] }> = {};
    for (const row of ([...(rsvpRowsRes.data ?? []), ...(veRsvpRowsRes.data ?? [])]) as any[]) {
      const eid = row.event_id;
      if (!attendeeMap[eid]) attendeeMap[eid] = { count: 0, avatars: [] };
      attendeeMap[eid].count += 1;
      if (attendeeMap[eid].avatars.length < 3 && row.profiles) {
        attendeeMap[eid].avatars.push(row.profiles);
      }
    }

    const mapped: FeedEvent[] = relevant.map((e: any) => ({
      id: e.id,
      title: e.title,
      poster_url: e.poster_url,
      event_date: e.event_date,
      start_time: e.start_time,
      venue_name: e.venue_name,
      venue_id: e.venue_id,
      neighbourhood: e.neighbourhood,
      entry_type: e.entry_type,
      going_count: attendeeMap[e.id]?.count ?? 0,
      going_avatars: attendeeMap[e.id]?.avatars ?? [],
      source: e.source,
    }));

    // Score: friend going +6, tonight +5, saved +3, interest match +2, has attendees +1
    const interests = new Set(profile?.interests ?? []);
    mapped.sort((a, b) => {
      const aSaved = savedEventIds.has(a.id) ? 3 : 0;
      const bSaved = savedEventIds.has(b.id) ? 3 : 0;
      const aInterest = interests.size > 0 && a.entry_type && interests.has(a.entry_type) ? 2 : 0;
      const bInterest = interests.size > 0 && b.entry_type && interests.has(b.entry_type) ? 2 : 0;
      const aTonight = a.event_date === today ? 5 : 0;
      const bTonight = b.event_date === today ? 5 : 0;
      const aFriend = friendGoingSet.has(a.id) ? 6 : 0;
      const bFriend = friendGoingSet.has(b.id) ? 6 : 0;
      const scoreA = aFriend + aTonight + aSaved + aInterest + (a.going_count > 0 ? 1 : 0);
      const scoreB = bFriend + bTonight + bSaved + bInterest + (b.going_count > 0 ? 1 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.event_date ?? '').localeCompare(b.event_date ?? '');
    });

    // If personalised list is thin, also load fallback events
    if (mapped.length < 3) await loadFallbackEvents(today);

    setFeedEvents(mapped);
    if (showSpinner) setLoading(false);
  };

  const loadFallbackEvents = async (today: string) => {
    const [legacyRes, veRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, poster_url, date, start_time, entry_type, venue_id, venues(name, neighbourhood)')
        .gte('date', today)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('venue_events')
        .select('id, title, poster_url, event_date, event_time, entry_type, venue_id, source, venues(name, neighbourhood)')
        .gte('event_date', today)
        .in('source', ['user', 'ticketmaster'])
        .neq('visibility', 'friends')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const legacy: FeedEvent[] = (legacyRes.data ?? []).map((e: any) => ({
      id: e.id, title: e.title, poster_url: e.poster_url || null,
      event_date: e.date || null, start_time: e.start_time || null,
      venue_name: e.venues?.name || '', venue_id: e.venue_id || null,
      neighbourhood: e.venues?.neighbourhood || null, entry_type: e.entry_type || null,
      going_count: 0, going_avatars: [], source: null,
    }));

    const ve: FeedEvent[] = (veRes.data ?? []).map((e: any) => ({
      id: e.id, title: e.title, poster_url: e.poster_url || null,
      event_date: e.event_date || null, start_time: e.event_time || null,
      venue_name: e.venues?.name || '', venue_id: e.venue_id || null,
      neighbourhood: e.venues?.neighbourhood || null, entry_type: e.entry_type || null,
      going_count: 0, going_avatars: [], source: e.source || null,
    }));

    const seen = new Set<string>();
    const merged: FeedEvent[] = [];
    for (const e of [...legacy, ...ve]) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }

    const fallbackIds = merged.map(e => e.id);
    const [fbRsvpLegacy, fbRsvpVe] = fallbackIds.length > 0
      ? await Promise.all([
          supabase
            .from('event_rsvps')
            .select('event_id, profiles(id, username, avatar_url)')
            .in('event_id', fallbackIds)
            .eq('status', 'going'),
          supabase
            .from('venue_event_rsvps')
            .select('event_id, profiles(id, username, avatar_url)')
            .in('event_id', fallbackIds)
            .eq('status', 'going'),
        ])
      : [{ data: [] }, { data: [] }];

    const fbAttendeeMap: Record<string, { count: number; avatars: any[] }> = {};
    for (const row of ([...(fbRsvpLegacy.data ?? []), ...(fbRsvpVe.data ?? [])]) as any[]) {
      const eid = row.event_id;
      if (!fbAttendeeMap[eid]) fbAttendeeMap[eid] = { count: 0, avatars: [] };
      fbAttendeeMap[eid].count += 1;
      if (fbAttendeeMap[eid].avatars.length < 3 && row.profiles) {
        fbAttendeeMap[eid].avatars.push(row.profiles);
      }
    }

    const mergedWithCounts: FeedEvent[] = merged.map(e => ({
      ...e,
      going_count: fbAttendeeMap[e.id]?.count ?? 0,
      going_avatars: fbAttendeeMap[e.id]?.avatars ?? [],
    }));

    setFallbackEvents(mergedWithCounts);
  };

  const loadActivity = async () => {
    if (!user) { setHasFriends(false); setActivityItems([]); return; }

    setHasFriends(true);

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
    const friendIds = friendships.map((f: any) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    const [rsvpRes, postRes, createdEventsRes] = await Promise.all([
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
      // Issue 2: profiles cannot be joined via nested select on creator_id; fetch separately below
      supabase
        .from('venue_events')
        .select('id, created_at, creator_id, title, venue_id, venues(name)')
        .in('creator_id', friendIds)
        .eq('source', 'user')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Fetch profiles for venue_event creators separately
    const creatorIds = [...new Set((createdEventsRes.data ?? []).map((e: any) => e.creator_id).filter(Boolean))];
    const creatorProfileMap: Record<string, { username: string; avatar_url: string | null }> = {};
    if (creatorIds.length > 0) {
      const { data: creatorProfiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', creatorIds);
      for (const p of (creatorProfiles ?? []) as any[]) {
        creatorProfileMap[p.id] = { username: p.username, avatar_url: p.avatar_url ?? null };
      }
    }

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

    const createdItems: ActivityItem[] = (createdEventsRes.data ?? []).map((e: any) => ({
      id: `created-${e.id}`,
      type: 'created_event',
      created_at: e.created_at,
      user_id: e.creator_id,
      event_id: e.id,
      profile: creatorProfileMap[e.creator_id] ?? null,
      event: { id: e.id, title: e.title, venue_name: e.venues?.name ?? null },
    }));

    const merged = [...rsvpItems, ...postItems, ...createdItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    setActivityItems(merged);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeedEvents(getToday(), false);
    if (activeTab === 'activity') {
      await Promise.all([loadActivity(), loadMyRsvps(), user ? loadPlanInvites() : Promise.resolve()]);
    }
    setRefreshing(false);
  }, [activeTab, user]);

  const renderForYou = () => {
    if (loading || hasProfile === null) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#FF3B5C" />
        </View>
      );
    }

    const showFallback = hasProfile === false || feedEvents.length < 3;
    let displayEvents: FeedEvent[];
    if (hasProfile === true && feedEvents.length < 3) {
      const seen = new Set(feedEvents.map(e => e.id));
      displayEvents = [...feedEvents, ...fallbackEvents.filter(e => !seen.has(e.id))];
    } else {
      displayEvents = showFallback ? fallbackEvents : feedEvents;
    }

    if (showFallback && fallbackEvents.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="star-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>Your personal feed starts here</Text>
          <Text style={styles.emptyHint}>RSVP to events or save venues to build your For You feed</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/(tabs)/discover' as any)}
          >
            <Text style={styles.emptyBtnText}>Explore Discover</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        key="foryou-grid"
        data={displayEvents}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.feedRow}
        ListHeaderComponent={showFallback ? (
          <Text style={styles.fallbackLabel}>Popular this week</Text>
        ) : null}
        renderItem={({ item }) => (
          <EventCard
            item={item}
            onPress={() => router.push(`/event/${item.id}` as any)}
            userId={user?.id}
          />
        )}
        contentContainerStyle={[styles.feedList, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {activeTab === 'foryou'
        ? renderForYou()
        : (() => {
            const hasNoRsvps = myGoingRsvps.length === 0 && myInterestedRsvps.length === 0;

            const myPlansSection = (
              <View style={{ paddingBottom: 8 }}>
                <Text style={styles.sectionHeader}>My Plans</Text>
                {!user ? (
                  <TouchableOpacity
                    style={{ marginHorizontal: 16, marginTop: 4, padding: 16, borderRadius: 12, backgroundColor: '#141414', alignItems: 'center' }}
                    onPress={() => router.push('/auth' as any)}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Sign in to see your plans</Text>
                  </TouchableOpacity>
                ) : hasNoRsvps ? (
                  <View style={{ marginHorizontal: 16, marginTop: 4, padding: 20, borderRadius: 12, backgroundColor: '#141414', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' }}>Nothing planned yet</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center' }}>Start exploring to find events to attend</Text>
                    <TouchableOpacity
                      style={styles.emptyBtn}
                      onPress={() => setActiveTab('foryou')}
                    >
                      <Text style={styles.emptyBtnText}>Go to Feed</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {myGoingRsvps.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.rsvpSubHeader}>I'm Going</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
                          {myGoingRsvps.map(e => (
                            <RsvpCard key={e.id} item={e} onPress={() => router.push(`/event/${e.id}` as any)} />
                          ))}
                        </ScrollView>
                      </View>
                    )}
                    {myInterestedRsvps.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.rsvpSubHeader}>Interested</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
                          {myInterestedRsvps.map(e => (
                            <RsvpCard key={e.id} item={e} onPress={() => router.push(`/event/${e.id}` as any)} />
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </>
                )}

                <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Friends' Activity</Text>

                {planInvites.length > 0 && (
                  <View style={{ paddingBottom: 4 }}>
                    {planInvites.map(plan => {
                      const myResponse = plan.responses?.[user?.id ?? ''];
                      const creatorName = (plan.profiles as any)?.username || 'Someone';
                      return (
                        <View
                          key={plan.id}
                          style={{
                            backgroundColor: '#141414',
                            marginHorizontal: 16,
                            marginBottom: 8,
                            borderRadius: 14,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: 'rgba(255,59,92,0.2)',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Ionicons name="people-outline" size={14} color="#FF3B5C" />
                            <Text style={{ fontSize: 12, color: '#FF3B5C', fontWeight: '700', flex: 1 }} numberOfLines={1}>
                              {creatorName} wants to go out
                            </Text>
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 }} numberOfLines={2}>
                            {plan.event_title}
                          </Text>
                          {plan.event_venue ? (
                            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
                              {plan.event_venue}{plan.event_date ? ` · ${plan.event_date}` : ''}
                            </Text>
                          ) : null}
                          {myResponse ? (
                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                              You responded: <Text style={{ color: myResponse === 'in' ? '#4ade80' : myResponse === 'maybe' ? '#facc15' : 'rgba(255,255,255,0.4)', fontWeight: '700' }}>{myResponse}</Text>
                            </Text>
                          ) : (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {(['in', 'maybe', 'pass'] as const).map(r => (
                                <TouchableOpacity
                                  key={r}
                                  onPress={() => handlePlanResponse(plan.id, plan.creator_id, r, plan)}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    backgroundColor: r === 'in' ? 'rgba(74,222,128,0.12)' : r === 'maybe' ? 'rgba(250,204,21,0.1)' : 'rgba(255,255,255,0.06)',
                                    borderWidth: 1,
                                    borderColor: r === 'in' ? 'rgba(74,222,128,0.3)' : r === 'maybe' ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.1)',
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 13,
                                    fontWeight: '700',
                                    color: r === 'in' ? '#4ade80' : r === 'maybe' ? '#facc15' : 'rgba(255,255,255,0.5)',
                                    textTransform: 'capitalize',
                                  }}>
                                    {r}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {!hasFriends && (
                  <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 32, gap: 10 }}>
                    <Text style={{ fontSize: 36 }}>👋</Text>
                    <Text style={styles.emptyText}>No friends yet</Text>
                    <Text style={styles.emptyHint}>Invite friends to see what they're up to tonight</Text>
                    <TouchableOpacity
                      style={{ marginTop: 4, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#FF3B5C' }}
                      onPress={() => Share.share({ message: "Join me on affiche \u2014 discover what's happening in Toronto tonight. Download: https://apps.apple.com/app/affiche" })}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Invite friends</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );

            return (
              <FlatList
                key="activity-list"
                data={hasFriends ? activityItems : []}
                keyExtractor={item => item.id}
                ListHeaderComponent={myPlansSection}
                ListEmptyComponent={hasFriends ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <Ionicons name="flash-outline" size={36} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyHint}>No recent activity from your friends yet</Text>
                  </View>
                ) : null}
                renderItem={({ item }) => (
                  <ActivityRow
                    item={item}
                    onPress={() => {
                      if (item.event_id) router.push(`/event/${item.event_id}` as any);
                    }}
                    onPressAvatar={() => router.push(`/profile/${item.user_id}` as any)}
                    userId={user?.id}
                    currentUsername={profile?.username}
                  />
                )}
                contentContainerStyle={[styles.activityList, { paddingTop: insets.top + 56 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
              />
            );
          })()
      }

      <TabToggle
        active={activeTab}
        onSelect={setActiveTab}
        insetTop={insets.top}
        onSearch={() => router.push('/(tabs)/search' as any)}
        onBell={() => router.push('/notifications' as any)}
        unreadNotifs={unreadNotifs}
      />

      <Modal visible={showTooltip} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          activeOpacity={1}
          onPress={() => {
            if (tooltipStep < 2) {
              setTooltipStep(s => s + 1);
            } else {
              setShowTooltip(false);
              AsyncStorage.setItem(SK_TOOLTIP_SHOWN, 'true');
            }
          }}
        >
          <View style={{ backgroundColor: '#1C1F2A', borderRadius: 20, padding: 28, width: '100%', gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= tooltipStep ? '#FF3B5C' : 'rgba(255,255,255,0.15)' }} />
              ))}
            </View>
            <Text style={{ fontSize: 22, textAlign: 'center' }}>
              {tooltipStep === 0 ? '🗓️' : tooltipStep === 1 ? '➕' : '🔍'}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
              {tooltipStep === 0 ? 'Your personalized feed' : tooltipStep === 1 ? 'Create or join events' : 'Browse by category'}
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20 }}>
              {tooltipStep === 0
                ? 'Events ranked for you based on your taste and what your friends are doing.'
                : tooltipStep === 1
                  ? 'Tap the + button to create your own event or join a plan.'
                  : 'Use Discover to browse events by category, neighbourhood, or venue.'}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 }}>
              {tooltipStep < 2 ? 'Tap to continue' : 'Tap to get started'}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
    alignItems: 'center',
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
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  fallbackLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  // For You grid
  feedList: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
    gap: GRID_GAP,
  },
  feedRow: {
    gap: GRID_GAP,
  },
  eventCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  eventImage: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
  },
  eventGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 36,
    paddingBottom: 10,
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
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
    fontSize: 8,
    fontWeight: '700',
  },
  goingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  eventVenue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 3,
  },
  eventDate: {
    color: '#FF3B5C',
    fontSize: 11,
    fontWeight: '600',
  },
  neighbourhoodPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  neighbourhoodText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  rsvpSubHeader: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 8,
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
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B5C',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexShrink: 0,
  },
  joinBtnGoing: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  joinBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  joinBtnTextGoing: {
    color: 'rgba(255,255,255,0.7)',
  },
});
