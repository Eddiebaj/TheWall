import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useAnalytics } from '../../lib/analytics';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_HEIGHT = SCREEN_HEIGHT * 0.42;

interface RsvpProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface GroupConv {
  id: string;
  name: string | null;
  memberCount: number;
}

interface EventDetail {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  cover_charge: string | null;
  description: string | null;
  venue_id: string | null;
  venue: {
    name: string;
    neighbourhood: string | null;
    address: string | null;
  } | null;
  goingCount: number;
  isGoing: boolean;
  isInterested: boolean;
}

function getEventTags(title: string): string[] {
  const t = title.toLowerCase();
  const tags: string[] = [];
  if (t.includes('live') || t.includes('band') || t.includes('music')) tags.push('Live Music');
  if (t.includes('concert')) tags.push('Concert');
  if (t.includes('dj') || t.includes('rave') || t.includes('techno') || t.includes('house') || t.includes('edm')) tags.push('DJ Set');
  if (t.includes('karaoke')) tags.push('Karaoke');
  if (t.includes('comedy') || t.includes('stand-up') || t.includes('standup')) tags.push('Comedy');
  if (t.includes('art') || t.includes('gallery') || t.includes('exhibit')) tags.push('Art');
  if (t.includes('trivia') || t.includes('quiz')) tags.push('Trivia');
  if (t.includes('game') || t.includes('sport') || t.includes('tournament')) tags.push('Games');
  if (t.includes('party') || t.includes('celebration') || t.includes('birthday') || t.includes('nye') || t.includes('halloween')) tags.push('Party');
  if (t.includes('brunch')) tags.push('Brunch');
  if (t.includes('wine') || t.includes('winery') || t.includes('vineyard')) tags.push('Wine');
  if (t.includes('cocktail') || t.includes('mixology')) tags.push('Cocktails');
  if (t.includes('happy hour') || t.includes('happyhour')) tags.push('Happy Hour');
  if (t.includes('food') || t.includes('taco') || t.includes('bbq') || t.includes('burger')) tags.push('Food & Drinks');
  if (t.includes('patio') || t.includes('outdoor') || t.includes('rooftop')) tags.push('Outdoor');
  if (t.includes('all ages') || t.includes('family') || t.includes('kids')) {
    tags.push('All Ages');
  } else {
    tags.push('19+');
  }
  if (tags.length < 3) tags.splice(tags.length - 1, 0, 'Bar');
  if (tags.length < 3) tags.splice(tags.length - 1, 0, 'Party');
  return tags;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colours } = useApp();
  const { user } = useAuth();

  const { capture } = useAnalytics();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvpProfiles, setRsvpProfiles] = useState<RsvpProfile[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  // Share sheet
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  // Friends/groups picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<GroupConv[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) loadEvent();
  }, [id, user]);

  const loadEvent = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('events')
      .select('id, title, poster_url, date, start_time, end_time, cover_charge, venue_id, venues(name, neighbourhood, address)')
      .eq('id', id)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    const { count: goingCount } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'going');

    let isGoing = false;
    let isInterested = false;
    if (user) {
      const [{ data: rsvp }, { data: interest }, { data: saved }] = await Promise.all([
        supabase.from('event_rsvps').select('status').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('event_interests').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('saved_events').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
      ]);
      isGoing = rsvp?.status === 'going';
      isInterested = !!interest;
      setIsSaved(!!saved);
    }

    const [{ data: rsvpRows }, { data: friendRows }] = await Promise.all([
      supabase
        .from('event_rsvps')
        .select('profiles(id, username, avatar_url)')
        .eq('event_id', id)
        .eq('status', 'going')
        .limit(20),
      user
        ? supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        : Promise.resolve({ data: [] }),
    ]);

    const profiles = ((rsvpRows || []) as any[])
      .map((r: any) => r.profiles)
      .filter(Boolean) as RsvpProfile[];
    setRsvpProfiles(profiles);

    const ids = new Set<string>(
      ((friendRows || []) as any[]).map((f: any) =>
        f.requester_id === user?.id ? f.addressee_id : f.requester_id
      )
    );
    setFriendIds(ids);

    setEvent({
      id: data.id,
      title: data.title,
      poster_url: data.poster_url || null,
      event_date: data.date || null,
      start_time: (data as any).start_time || null,
      end_time: (data as any).end_time || null,
      cover_charge: (data as any).cover_charge || null,
      description: (data as any).description || null,
      venue_id: (data as any).venue_id || null,
      venue: (data as any).venues || null,
      goingCount: goingCount || 0,
      isGoing,
      isInterested,
    });
    setLoading(false);
  };

  const handleToggleRsvp = async (status: 'going' | 'interested') => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to RSVP to events.');
      return;
    }
    if (!event) return;

    const isActive = status === 'going' ? event.isGoing : event.isInterested;

    if (isActive) {
      if (status === 'going') {
        setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
        const { error } = await supabase.from('event_rsvps').delete().eq('event_id', event.id).eq('user_id', user.id);
        if (error) setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + 1 } : e);
      } else {
        setEvent(e => e ? { ...e, isInterested: false } : e);
        const { error } = await supabase.from('event_interests').delete().eq('event_id', event.id).eq('user_id', user.id);
        if (error) setEvent(e => e ? { ...e, isInterested: true } : e);
      }
    } else {
      if (status === 'going') {
        setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + (e.isGoing ? 0 : 1) } : e);
        const { error } = await supabase.from('event_rsvps').upsert({ event_id: event.id, user_id: user.id, status: 'going' }, { onConflict: 'event_id,user_id' });
        if (error) setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
      } else {
        setEvent(e => e ? { ...e, isInterested: true } : e);
        const { error } = await supabase.from('event_interests').insert({ event_id: event.id, user_id: user.id });
        if (error) setEvent(e => e ? { ...e, isInterested: false } : e);
      }
    }
  };

  const handleToggleSave = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to save events.');
      return;
    }
    if (!event) return;
    const nowSaved = !isSaved;
    setIsSaved(nowSaved);
    if (nowSaved) {
      capture('event_saved', { event_id: event.id });
      const { error } = await supabase.from('saved_events').upsert({ user_id: user.id, event_id: event.id });
      if (error) setIsSaved(false);
    } else {
      const { error } = await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', event.id);
      if (error) setIsSaved(true);
    }
  };

  const handleShareExternal = () => {
    if (!event) return;
    setShareSheetVisible(false);
    const venueName = event.venue?.name || 'a venue';
    const dateStr = event.event_date
      ? new Date(event.event_date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'an upcoming date';
    Share.share({
      message: `Check out ${event.title} at ${venueName} on ${dateStr} - open in affiche: affiche://event/${event.id}`,
    });
  };

  const openFriendsPicker = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to share events.');
      return;
    }
    setShareSheetVisible(false);

    // Load friends
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendList: Friend[] = ((friendRows || []) as any[]).map((r: any) => {
      const other = r.requester_id === user.id ? r.addressee : r.requester;
      return other as Friend;
    }).filter(Boolean);

    // Load group conversations
    const { data: memberRows } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations(id, name, type, conversation_members(user_id))')
      .eq('user_id', user.id);

    const groupList: GroupConv[] = ((memberRows || []) as any[])
      .map((r: any) => r.conversations)
      .filter((c: any) => c && c.type === 'group')
      .map((c: any) => ({
        id: c.id,
        name: c.name || null,
        memberCount: (c.conversation_members || []).length,
      }));

    setFriends(friendList);
    setGroups(groupList);
    setSelectedFriendIds(new Set());
    setSelectedGroupIds(new Set());
    setSearch('');
    setPickerVisible(true);
  };

  const toggleFriend = (id: string) => {
    setSelectedFriendIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!user || !event) return;
    if (selectedFriendIds.size === 0 && selectedGroupIds.size === 0) return;
    setSending(true);

    const metadata = {
      event_id: event.id,
      title: event.title,
      venue_name: event.venue?.name || null,
      event_date: event.event_date || null,
    };

    try {
      // Resolve direct conversation IDs for each selected friend
      const directConvIds: string[] = [];

      if (selectedFriendIds.size > 0) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id, conversation_members(user_id)')
          .eq('type', 'direct');

        const existingConvs = (existing || []) as any[];

        for (const friendId of Array.from(selectedFriendIds)) {
          let convId: string | null = null;

          for (const conv of existingConvs) {
            const memberIds: string[] = (conv.conversation_members || []).map((m: any) => m.user_id);
            if (memberIds.includes(user.id) && memberIds.includes(friendId) && memberIds.length === 2) {
              convId = conv.id;
              break;
            }
          }

          if (!convId) {
            const { data: newConv, error: convErr } = await supabase
              .from('conversations')
              .insert({ type: 'direct' })
              .select('id')
              .single();
            if (convErr || !newConv) continue;
            convId = newConv.id;
            await supabase.from('conversation_members').insert([
              { conversation_id: convId, user_id: user.id },
              { conversation_id: convId, user_id: friendId },
            ]);
          }

          directConvIds.push(convId);
        }
      }

      const allConvIds = [...directConvIds, ...Array.from(selectedGroupIds)];

      const messages = allConvIds.map(convId => ({
        conversation_id: convId,
        sender_id: user.id,
        type: 'event_share',
        metadata,
      }));

      if (messages.length > 0) {
        const { error } = await supabase.from('messages').insert(messages);
        if (error) throw error;
      }

      setPickerVisible(false);
      const total = selectedFriendIds.size + selectedGroupIds.size;
      Alert.alert('Sent!', `Event shared with ${total} ${total === 1 ? 'conversation' : 'conversations'}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send event.');
    } finally {
      setSending(false);
    }
  };

  const handleGetDirections = () => {
    const address = event?.venue?.address;
    if (!address) return;
    const encoded = encodeURIComponent(address);
    Linking.openURL(`maps://?q=${encoded}`).catch(() =>
      Linking.openURL(`https://maps.apple.com/?q=${encoded}`)
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colours.accent} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: colours.muted, fontSize: 15 }}>Event not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colours.accent, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formattedDate = (() => {
    if (!event.event_date) return null;
    const [y, m, d] = event.event_date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  const formattedDateTime = (() => {
    if (!formattedDate) return null;
    if (event.start_time && event.end_time) return `${formattedDate} · ${event.start_time} – ${event.end_time}`;
    if (event.start_time) return `${formattedDate} · ${event.start_time}`;
    return formattedDate;
  })();

  const q = search.toLowerCase();
  const filteredFriends = friends.filter(f => f.username.toLowerCase().includes(q));
  const filteredGroups = groups.filter(g => (g.name || '').toLowerCase().includes(q));
  const totalSelected = selectedFriendIds.size + selectedGroupIds.size;

  const CARD = colours.card || '#1c1c1e';

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      {/* Poster */}
      <View style={{ width: SCREEN_WIDTH, height: POSTER_HEIGHT, backgroundColor: '#1a1a1a' }}>
        {event.poster_url ? (
          <Image source={{ uri: event.poster_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.2)" />
          </View>
        )}
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
        <TouchableOpacity
          onPress={handleToggleSave}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 60,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShareExternal}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ flex: 1, padding: 20, paddingBottom: insets.bottom + 40 }}>
        <TouchableOpacity
          activeOpacity={event.venue_id ? 0.7 : 1}
          onPress={() => event.venue_id && router.push(`/venue/${event.venue_id}` as any)}
        >
          <Text style={{ fontSize: 26, fontWeight: '800', color: colours.text, marginBottom: 8 }}>
            {event.venue?.name || 'Unknown Venue'}
          </Text>
        </TouchableOpacity>

        {event.venue?.neighbourhood && (
          <View style={{
            alignSelf: 'flex-start',
            backgroundColor: colours.accent + '20',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 4,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: colours.accent + '40',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>
              {event.venue.neighbourhood}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 16 }}>
          {event.title}
        </Text>

        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {formattedDateTime && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{formattedDateTime}</Text>
            </View>
          )}
          {event.cover_charge && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="ticket-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{event.cover_charge}</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {getEventTags(event.title).map(tag => (
            <View
              key={tag}
              style={{
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colours.text }}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            About this event
          </Text>
          <Text style={{ fontSize: 15, color: colours.text, lineHeight: 22, opacity: 0.85 }}>
            {event.description ?? 'Details coming soon. Check back closer to the date for more info.'}
          </Text>
          {event.venue?.address && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16 }}>
              <Ionicons name="location-outline" size={16} color={colours.muted} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '500', flex: 1 }}>
                {event.venue.address}
              </Text>
            </View>
          )}
        </View>

        {rsvpProfiles.length > 0 && (() => {
          const friendProfiles = rsvpProfiles.filter(p => friendIds.has(p.id));
          const otherCount = rsvpProfiles.length - friendProfiles.length;
          const shownFriends = friendProfiles.slice(0, 5);
          const AVATAR_SIZE = 36;
          const OVERLAP = 12;
          const hasFriends = shownFriends.length > 0;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, minHeight: AVATAR_SIZE }}>
              {hasFriends && (
                <View style={{ flexDirection: 'row', width: shownFriends.length * (AVATAR_SIZE - OVERLAP) + OVERLAP, height: AVATAR_SIZE, marginRight: 8 }}>
                  {shownFriends.map((p, i) => (
                    <View
                      key={p.id}
                      style={{
                        position: 'absolute',
                        left: i * (AVATAR_SIZE - OVERLAP),
                        width: AVATAR_SIZE,
                        height: AVATAR_SIZE,
                        borderRadius: AVATAR_SIZE / 2,
                        borderWidth: 2,
                        borderColor: colours.bg,
                        backgroundColor: colours.accent,
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: shownFriends.length - i,
                      }}
                    >
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                          {p.username[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {hasFriends && (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>
                    {friendProfiles.length} {friendProfiles.length === 1 ? 'friend' : 'friends'} going
                  </Text>
                )}
                {!hasFriends && otherCount > 0 && (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>
                    {otherCount} {otherCount === 1 ? 'person' : 'people'} going
                  </Text>
                )}
                {hasFriends && otherCount > 0 && (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>
                    · +{otherCount} others
                  </Text>
                )}
              </View>
            </View>
          );
        })()}

        <TouchableOpacity
          onPress={() => {
            if (!event.isGoing) capture('rsvp_tapped', { event_id: event.id });
            handleToggleRsvp('going');
          }}
          activeOpacity={0.85}
          style={{
            backgroundColor: event.isGoing ? '#c0392b' : '#FF3B5C',
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {event.isGoing ? "I'm Going \u2713" : "I'm Going"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleToggleRsvp('interested')}
          activeOpacity={0.85}
          style={{
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            marginBottom: 14,
            borderWidth: 1.5,
            borderColor: event.isInterested ? '#444' : colours.border,
            backgroundColor: event.isInterested ? '#1a1a1a' : 'transparent',
          }}
        >
          {event.isInterested && <Ionicons name="checkmark" size={16} color="#fff" />}
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            Interested
          </Text>
        </TouchableOpacity>

        {rsvpProfiles.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 }}>
              Who's going
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {rsvpProfiles.slice(0, 5).map((p) => (
                <View
                  key={p.id}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colours.accent,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colours.bg,
                  }}
                >
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {p.username[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              ))}
              {rsvpProfiles.length > 5 && (
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: colours.bg,
                }}>
                  <Text style={{ color: colours.muted, fontSize: 11, fontWeight: '700' }}>
                    +{rsvpProfiles.length - 5}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => setShareSheetVisible(true)}
            activeOpacity={0.85}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colours.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="share-outline" size={20} color={colours.text} />
          </TouchableOpacity>
          {event.venue?.address && (
            <TouchableOpacity
              onPress={handleGetDirections}
              activeOpacity={0.85}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colours.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="navigate-outline" size={20} color={colours.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Share options sheet */}
      <Modal
        visible={shareSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShareSheetVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setShareSheetVisible(false)}
        />
        <View style={{
          backgroundColor: CARD,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 24,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, marginBottom: 16 }}>Share Event</Text>

          <TouchableOpacity
            onPress={openFriendsPicker}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={20} color={colours.accent} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share to Friends or Groups</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Send via direct message or group chat</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShareExternal}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="share-outline" size={20} color={colours.text} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share Externally</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Share outside the app</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Friends & groups picker */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View style={{
          backgroundColor: CARD,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: SCREEN_HEIGHT * 0.72,
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, flex: 1 }}>Send to Friends or Groups</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Ionicons name="close" size={22} color={colours.muted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{
            marginHorizontal: 20,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: 10,
            paddingHorizontal: 12,
            gap: 8,
          }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search..."
              placeholderTextColor={colours.muted}
              style={{ flex: 1, fontSize: 14, color: colours.text, paddingVertical: 10 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={[
              ...(filteredFriends.length > 0 ? [{ _type: 'section', label: 'Friends' } as any] : []),
              ...filteredFriends.map(f => ({ _type: 'friend', ...f })),
              ...(filteredGroups.length > 0 ? [{ _type: 'section', label: 'Groups' } as any] : []),
              ...filteredGroups.map(g => ({ _type: 'group', ...g })),
              ...(filteredFriends.length === 0 && filteredGroups.length === 0
                ? [{ _type: 'empty' } as any]
                : []),
            ]}
            keyExtractor={(item, i) => item._type === 'section' ? `section-${item.label}` : item._type === 'empty' ? 'empty' : item.id}
            renderItem={({ item }) => {
              if (item._type === 'section') {
                return (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
                    {item.label}
                  </Text>
                );
              }
              if (item._type === 'empty') {
                return (
                  <Text style={{ textAlign: 'center', color: colours.muted, fontSize: 14, paddingVertical: 32 }}>
                    {friends.length === 0 && groups.length === 0 ? 'No friends or groups yet' : 'No results'}
                  </Text>
                );
              }
              if (item._type === 'friend') {
                const selected = selectedFriendIds.has(item.id);
                return (
                  <TouchableOpacity
                    onPress={() => toggleFriend(item.id)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                  >
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: colours.accent,
                      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{item.username[0].toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text, flex: 1 }}>@{item.username}</Text>
                    <View style={{
                      width: 24, height: 24, borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selected ? colours.accent : 'rgba(255,255,255,0.2)',
                      backgroundColor: selected ? colours.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }
              // group
              const selected = selectedGroupIds.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggleGroup(item.id)}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="people" size={20} color={colours.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>{item.name || 'Group Chat'}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>{item.memberCount} members</Text>
                  </View>
                  <View style={{
                    width: 24, height: 24, borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? colours.accent : 'rgba(255,255,255,0.2)',
                    backgroundColor: selected ? colours.accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
            style={{ flexGrow: 0 }}
          />

          {/* Send button */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={totalSelected === 0 || sending}
              activeOpacity={0.85}
              style={{
                backgroundColor: totalSelected > 0 ? colours.accent : 'rgba(255,255,255,0.1)',
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
              }}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: totalSelected > 0 ? '#fff' : colours.muted }}>
                  {totalSelected > 0 ? `Send to ${totalSelected} ${totalSelected === 1 ? 'chat' : 'chats'}` : 'Send'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
