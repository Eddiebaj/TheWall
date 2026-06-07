import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { sendNotification } from '../../lib/notificationHelpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 260;
const MOMENT_SIZE = (SCREEN_WIDTH - 4) / 3;

interface Venue {
  id: string;
  name: string;
  neighbourhood: string | null;
  address: string | null;
  poster_url: string | null;
}

interface VenueEvent {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
}

interface Moment {
  id: string;
  video_url: string | null;
  thumbnail_url: string | null;
}

interface HappyHour {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  deal_details: string | null;
  last_verified_at: string | null;
  status: string;
  submitted_by: string | null;
  created_at: string;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface CheckinProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [happyHours, setHappyHours] = useState<HappyHour[]>([]);
  const [loading, setLoading] = useState(true);

  // Follow state
  const [isFollowed, setIsFollowed] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Check-in state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [checkinFriends, setCheckinFriends] = useState<CheckinProfile[]>([]);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Happy hour verification
  const [verifiedTodayIds, setVerifiedTodayIds] = useState<Set<string>>(new Set());
  const [verifyToast, setVerifyToast] = useState<string | null>(null);

  // Submit deal modal
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [submitDays, setSubmitDays] = useState<number[]>([]);
  const [submitStart, setSubmitStart] = useState('');
  const [submitEnd, setSubmitEnd] = useState('');
  const [submitTitle, setSubmitTitle] = useState('');
  const [submitDetails, setSubmitDetails] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Pulse animation for live dot
  useEffect(() => {
    if (checkinCount === 0) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [checkinCount]);

  useEffect(() => {
    if (id) {
      load();
      loadCheckins();
      loadFollows();
      loadVerifiedToday();
    }
  }, [id, user]);

  const loadVerifiedToday = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await AsyncStorage.getItem(`hh_verified_${id}_${today}`);
    if (raw) {
      try { setVerifiedTodayIds(new Set(JSON.parse(raw))); } catch {}
    }
  };

  const handleVerify = async (hhId: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to verify deals.');
      return;
    }
    if (verifiedTodayIds.has(hhId)) return;

    const today = new Date().toISOString().slice(0, 10);
    const newSet = new Set(verifiedTodayIds).add(hhId);
    setVerifiedTodayIds(newSet);
    await AsyncStorage.setItem(`hh_verified_${id}_${today}`, JSON.stringify([...newSet]));

    await supabase.from('happy_hours').update({ last_verified_at: new Date().toISOString() }).eq('id', hhId);
    setHappyHours(prev => prev.map(h => h.id === hhId ? { ...h, last_verified_at: new Date().toISOString() } : h));

    setVerifyToast(hhId);
    setTimeout(() => setVerifyToast(null), 2000);
  };

  const handleReportDeal = (hhId: string) => {
    Alert.alert('Report deal', 'Flag this deal as inaccurate?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('happy_hours').update({ status: 'flagged' }).eq('id', hhId);
          setHappyHours(prev => prev.filter(h => h.id !== hhId));
        },
      },
    ]);
  };

  function parseTimeInput(input: string): string | null {
    const m = input.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = m[2] ? parseInt(m[2]) : 0;
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
  }

  const handleSubmitDeal = async () => {
    if (!user || !id) return;
    if (submitDays.length === 0) { Alert.alert('Select at least one day'); return; }
    const parsedStart = parseTimeInput(submitStart);
    const parsedEnd = parseTimeInput(submitEnd);
    if (!parsedStart) { Alert.alert('Invalid start time', 'Use a format like "4pm" or "4:30pm"'); return; }
    if (!parsedEnd) { Alert.alert('Invalid end time', 'Use a format like "7pm" or "7:30pm"'); return; }
    if (!submitTitle.trim()) { Alert.alert('Enter a deal title'); return; }

    setSubmitLoading(true);
    const rows = submitDays.map(day => ({
      venue_id: id,
      day_of_week: day,
      start_time: parsedStart,
      end_time: parsedEnd,
      title: submitTitle.trim(),
      deal_details: submitDetails.trim() || null,
      status: 'pending',
      submitted_by: user.id,
    }));

    const { error } = await supabase.from('happy_hours').insert(rows);
    setSubmitLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSubmitModalVisible(false);
      setSubmitDays([]); setSubmitStart(''); setSubmitEnd(''); setSubmitTitle(''); setSubmitDetails('');
      Alert.alert('Thanks!', 'Your deal has been submitted and will appear after 24 hours if not flagged.');
    }
  };

  const loadFollows = async () => {
    if (!id) return;
    const { count } = await supabase
      .from('venue_follows')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', id);
    setFollowerCount(count || 0);

    if (user) {
      const { data } = await supabase
        .from('venue_follows')
        .select('id')
        .eq('venue_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsFollowed(!!data);
    }
  };

  const handleFollow = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to follow venues.');
      return;
    }
    if (!id) return;

    const optimisticFollowed = !isFollowed;
    setIsFollowed(optimisticFollowed);
    setFollowerCount(c => optimisticFollowed ? c + 1 : Math.max(0, c - 1));
    setFollowLoading(true);

    try {
      if (optimisticFollowed) {
        await supabase.from('venue_follows').insert({ user_id: user.id, venue_id: id });
      } else {
        await supabase.from('venue_follows').delete().eq('user_id', user.id).eq('venue_id', id);
      }
    } catch {
      // Roll back on error
      setIsFollowed(!optimisticFollowed);
      setFollowerCount(c => optimisticFollowed ? Math.max(0, c - 1) : c + 1);
    } finally {
      setFollowLoading(false);
    }
  };

  const loadCheckins = async () => {
    if (!id) return;
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', id)
      .is('checked_out_at', null)
      .gte('checked_in_at', cutoff);
    setCheckinCount(count || 0);

    if (user) {
      const { data: myCheckin } = await supabase
        .from('checkins')
        .select('id')
        .eq('venue_id', id)
        .eq('user_id', user.id)
        .is('checked_out_at', null)
        .gte('checked_in_at', cutoff)
        .maybeSingle();
      setIsCheckedIn(!!myCheckin);
      setCheckinId((myCheckin as any)?.id || null);

      const { data: friendRows } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (friendRows && friendRows.length > 0) {
        const friendIds = (friendRows as any[]).map((f: any) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );
        const { data: friendCheckins } = await supabase
          .from('checkins')
          .select('user_id, profiles(id, username, avatar_url)')
          .eq('venue_id', id)
          .is('checked_out_at', null)
          .gte('checked_in_at', cutoff)
          .in('user_id', friendIds);

        const profiles: CheckinProfile[] = ((friendCheckins || []) as any[])
          .map((c: any) => c.profiles)
          .filter(Boolean);
        setCheckinFriends(profiles);
      }
    }
  };

  const handleCheckin = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to check in to venues.');
      return;
    }
    if (!id || !venue) return;
    setCheckinLoading(true);

    try {
      if (isCheckedIn && checkinId) {
        await supabase.from('checkins').update({ checked_out_at: new Date().toISOString() }).eq('id', checkinId);
        setIsCheckedIn(false);
        setCheckinId(null);
        setCheckinCount(c => Math.max(0, c - 1));
      } else {
        const { data: newCheckin } = await supabase
          .from('checkins')
          .insert({ user_id: user.id, venue_id: id })
          .select('id')
          .single();
        setIsCheckedIn(true);
        setCheckinId((newCheckin as any)?.id || null);
        setCheckinCount(c => c + 1);

        const myName = profile?.username || 'Someone';
        const { data: friendRows } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        for (const row of (friendRows || []) as any[]) {
          const friendId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
          sendNotification(
            friendId,
            'friend_checkin',
            'Out right now',
            `${myName} is at ${venue.name} right now`,
            { type: 'friend_checkin', venueId: String(id) },
            false,
            'normal'
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update check-in.');
    } finally {
      setCheckinLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [venueRes, eventsRes, hhRes] = await Promise.all([
      supabase
        .from('venues')
        .select('id, name, neighbourhood, address, poster_url')
        .eq('id', id)
        .single(),
      supabase
        .from('events')
        .select('id, title, date, start_time')
        .eq('venue_id', id)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(20),
      (() => {
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        return supabase
          .from('happy_hours')
          .select('id, day_of_week, start_time, end_time, title, deal_details, last_verified_at, status, submitted_by, created_at')
          .eq('venue_id', id)
          .or(`submitted_by.is.null,status.eq.active,and(status.eq.pending,created_at.lte.${cutoff24h})`)
          .neq('status', 'flagged')
          .order('day_of_week', { ascending: true });
      })(),
    ]);

    if (venueRes.data) setVenue(venueRes.data as Venue);
    setHappyHours((hhRes.data ?? []) as HappyHour[]);

    const eventList: VenueEvent[] = ((eventsRes.data || []) as any[]).map((e: any) => ({
      id: e.id,
      title: e.title,
      event_date: e.date,
      start_time: e.start_time || null,
    }));
    setEvents(eventList);

    // Load moments via event_id -> events where venue_id = id
    if (eventList.length > 0) {
      const eventIds = eventList.map(e => e.id);
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, video_url, thumbnail_url')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false })
        .limit(30);
      setMoments((postsData || []) as Moment[]);
    } else {
      // Try fetching all posts for this venue's events (even past ones)
      const { data: allEventIds } = await supabase
        .from('events')
        .select('id')
        .eq('venue_id', id);
      const ids = ((allEventIds || []) as any[]).map((e: any) => e.id);
      if (ids.length > 0) {
        const { data: postsData } = await supabase
          .from('posts')
          .select('id, video_url, thumbnail_url')
          .in('event_id', ids)
          .order('created_at', { ascending: false })
          .limit(30);
        setMoments((postsData || []) as Moment[]);
      }
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FF3B5C" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>Venue not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#FF3B5C', fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Hero */}
        <View style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: '#1a1a1a' }}>
          {venue.poster_url ? (
            <Image
              source={{ uri: venue.poster_url }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#1a1a2e', '#16213e', '#0f3460']}
              style={{ flex: 1 }}
            />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </View>

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Venue info */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 }}>
            {venue.name}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {venue.neighbourhood && (
              <View style={{
                backgroundColor: 'rgba(255,59,92,0.15)',
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: 'rgba(255,59,92,0.35)',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF3B5C' }}>
                  {venue.neighbourhood}
                </Text>
              </View>
            )}

            {/* Follower count */}
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' }}>
              {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
            </Text>

            {/* Follow button */}
            <TouchableOpacity
              onPress={handleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 20,
                backgroundColor: isFollowed ? 'rgba(255,255,255,0.08)' : '#FF3B5C',
                borderWidth: isFollowed ? 1 : 0,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Ionicons
                name={isFollowed ? 'heart' : 'heart-outline'}
                size={13}
                color={isFollowed ? '#EC4899' : '#fff'}
              />
              <Text style={{ fontSize: 12, fontWeight: '700', color: isFollowed ? '#EC4899' : '#fff' }}>
                {isFollowed ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>

          {venue.address && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 20 }}>
              <Ionicons name="location-outline" size={15} color="rgba(255,255,255,0.45)" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500', flex: 1 }}>
                {venue.address}
              </Text>
            </View>
          )}

          {/* Check-in section */}
          <View style={{ marginBottom: 24 }}>
            {/* Live count */}
            {checkinCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Animated.View style={{
                  width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B5C',
                  transform: [{ scale: pulseAnim }],
                }} />
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>
                  {checkinCount} {checkinCount === 1 ? 'person' : 'people'} here now
                </Text>
                {checkinFriends.length > 0 && (
                  <View style={{ flexDirection: 'row', marginLeft: 4, gap: -8 }}>
                    {checkinFriends.slice(0, 4).map((f, i) => (
                      <View
                        key={f.id}
                        style={{
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: '#FF3B5C',
                          borderWidth: 2, borderColor: '#0a0a0a',
                          overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                          zIndex: 10 - i, marginLeft: i === 0 ? 0 : -8,
                        }}
                      >
                        {f.avatar_url ? (
                          <Image source={{ uri: f.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                            {f.username[0].toUpperCase()}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Check-in button */}
            <TouchableOpacity
              onPress={handleCheckin}
              disabled={checkinLoading}
              activeOpacity={0.85}
              style={{
                backgroundColor: isCheckedIn ? '#1a1a1a' : '#FF3B5C',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                borderWidth: isCheckedIn ? 1.5 : 0,
                borderColor: isCheckedIn ? 'rgba(255,255,255,0.15)' : 'transparent',
              }}
            >
              {checkinLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isCheckedIn ? 'checkmark-circle' : 'location'}
                    size={18}
                    color={isCheckedIn ? '#4ade80' : '#fff'}
                  />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isCheckedIn ? '#4ade80' : '#fff' }}>
                    {isCheckedIn ? "I'm Here ✓" : "Check In"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Upcoming Events */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
            Upcoming Events
          </Text>

          {events.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginBottom: 28 }}>
              No upcoming events
            </Text>
          ) : (
            <View style={{ marginBottom: 28, gap: 1 }}>
              {events.map((ev, i) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => router.push(`/event/${ev.id}` as any)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    backgroundColor: '#141414',
                    borderRadius: i === 0 ? 12 : i === events.length - 1 ? 12 : 4,
                    marginBottom: 2,
                    borderTopLeftRadius: i === 0 ? 12 : 4,
                    borderTopRightRadius: i === 0 ? 12 : 4,
                    borderBottomLeftRadius: i === events.length - 1 ? 12 : 4,
                    borderBottomRightRadius: i === events.length - 1 ? 12 : 4,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 }} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                      {[formatDate(ev.event_date), ev.start_time ? fmt12(ev.start_time) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Happy Hour */}
          {(happyHours.length > 0 || user) && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Happy Hour
                </Text>
                {user && (
                  <TouchableOpacity
                    onPress={() => setSubmitModalVisible(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(249,115,22,0.12)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#f97316' }}>+ Submit a deal</Text>
                  </TouchableOpacity>
                )}
              </View>
              {happyHours.length > 0 && (
                <View style={{ marginBottom: 28, gap: 8 }}>
                  {happyHours.map(hh => {
                    const now = Date.now();
                    const verifiedMs = hh.last_verified_at ? new Date(hh.last_verified_at).getTime() : null;
                    const daysSinceVerified = verifiedMs ? Math.floor((now - verifiedMs) / 86400000) : null;
                    const isOutdated = !verifiedMs || daysSinceVerified! > 30;
                    const alreadyVerifiedToday = verifiedTodayIds.has(hh.id);

                    return (
                      <View
                        key={hh.id}
                        style={{ backgroundColor: '#1a0d00', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#3d1f00' }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#f97316' }}>
                            {DAY_ABBR[hh.day_of_week]}  {fmt12(hh.start_time)} - {fmt12(hh.end_time)}
                          </Text>
                          {isOutdated && (
                            <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b' }}>May be outdated</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: hh.deal_details ? 4 : 0 }}>
                          {hh.title}
                        </Text>
                        {hh.deal_details ? (
                          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 }}>
                            {hh.deal_details}
                          </Text>
                        ) : null}
                        {/* Footer row: verified info + buttons */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                            {verifyToast === hh.id
                              ? 'Thanks for verifying!'
                              : daysSinceVerified === 0
                              ? 'Verified today'
                              : daysSinceVerified === 1
                              ? 'Verified yesterday'
                              : daysSinceVerified != null
                              ? `Verified ${daysSinceVerified}d ago`
                              : 'Never verified'}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            {user && !alreadyVerifiedToday && (
                              <TouchableOpacity onPress={() => handleVerify(hh.id)}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#4ade80' }}>✓ Still accurate</Text>
                              </TouchableOpacity>
                            )}
                            {user && (
                              <TouchableOpacity onPress={() => handleReportDeal(hh.id)}>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Report</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Submit Deal Modal */}
          <Modal visible={submitModalVisible} animationType="slide" transparent onRequestClose={() => setSubmitModalVisible(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>Submit a deal</Text>
                  <TouchableOpacity onPress={() => setSubmitModalVisible(false)}>
                    <Text style={{ fontSize: 15, color: '#888' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Days</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {DAY_ABBR.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSubmitDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: submitDays.includes(i) ? '#f97316' : 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        borderColor: submitDays.includes(i) ? '#f97316' : 'rgba(255,255,255,0.12)',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: submitDays.includes(i) ? '#fff' : 'rgba(255,255,255,0.6)' }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Start time</Text>
                    <TextInput
                      value={submitStart}
                      onChangeText={setSubmitStart}
                      placeholder="e.g. 4pm"
                      placeholderTextColor="#555"
                      style={{ backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>End time</Text>
                    <TextInput
                      value={submitEnd}
                      onChangeText={setSubmitEnd}
                      placeholder="e.g. 7pm"
                      placeholderTextColor="#555"
                      style={{ backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' }}
                    />
                  </View>
                </View>

                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deal title</Text>
                <TextInput
                  value={submitTitle}
                  onChangeText={setSubmitTitle}
                  placeholder="e.g. $6 house wine"
                  placeholderTextColor="#555"
                  maxLength={60}
                  style={{ backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12 }}
                />

                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Details (optional)</Text>
                <TextInput
                  value={submitDetails}
                  onChangeText={setSubmitDetails}
                  placeholder="Any extra info..."
                  placeholderTextColor="#555"
                  maxLength={100}
                  multiline
                  style={{ backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 20, minHeight: 72, textAlignVertical: 'top' }}
                />

                <TouchableOpacity
                  onPress={handleSubmitDeal}
                  disabled={submitLoading}
                  style={{ backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  {submitLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Submit deal</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Moments */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
            Moments
          </Text>
        </View>

        {moments.length === 0 ? (
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, paddingHorizontal: 20 }}>
            No moments yet
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2 }}>
            {moments.map(m => (
              <View
                key={m.id}
                style={{
                  width: MOMENT_SIZE,
                  height: MOMENT_SIZE,
                  backgroundColor: '#1a1a1a',
                }}
              >
                {(m.thumbnail_url || m.video_url) ? (
                  <Image
                    source={{ uri: m.thumbnail_url || m.video_url || '' }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="videocam-outline" size={20} color="rgba(255,255,255,0.2)" />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
