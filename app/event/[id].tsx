import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
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

interface EventDetail {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  cover_charge: string | null;
  description: string | null;
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
  if (t.includes('live') || t.includes('band') || t.includes('music')) tags.push('🎵 Live Music');
  if (t.includes('concert')) tags.push('🎸 Concert');
  if (t.includes('dj') || t.includes('rave') || t.includes('techno') || t.includes('house') || t.includes('edm')) tags.push('🎧 DJ Set');
  if (t.includes('karaoke')) tags.push('🎤 Karaoke');
  if (t.includes('comedy') || t.includes('stand-up') || t.includes('standup')) tags.push('🎤 Comedy');
  if (t.includes('art') || t.includes('gallery') || t.includes('exhibit')) tags.push('🎨 Art');
  if (t.includes('trivia') || t.includes('quiz')) tags.push('🧠 Trivia');
  if (t.includes('game') || t.includes('sport') || t.includes('tournament')) tags.push('🏆 Games');
  if (t.includes('party') || t.includes('celebration') || t.includes('birthday') || t.includes('nye') || t.includes('halloween')) tags.push('🎉 Party');
  if (t.includes('brunch')) tags.push('☕ Brunch');
  if (t.includes('wine') || t.includes('winery') || t.includes('vineyard')) tags.push('🍷 Wine');
  if (t.includes('cocktail') || t.includes('mixology')) tags.push('🥂 Cocktails');
  if (t.includes('happy hour') || t.includes('happyhour')) tags.push('🍻 Happy Hour');
  if (t.includes('food') || t.includes('taco') || t.includes('bbq') || t.includes('burger')) tags.push('🍔 Food & Drinks');
  if (t.includes('patio') || t.includes('outdoor') || t.includes('rooftop')) tags.push('🌿 Outdoor');
  if (t.includes('all ages') || t.includes('family') || t.includes('kids')) {
    tags.push('All Ages');
  } else {
    tags.push('19+');
  }
  if (tags.length < 3) tags.splice(tags.length - 1, 0, '🍺 Bar');
  if (tags.length < 3) tags.splice(tags.length - 1, 0, '🎉 Party');
  return tags;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colours, fonts } = useApp();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvpProfiles, setRsvpProfiles] = useState<RsvpProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Share sheet state
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [friendsSheetVisible, setFriendsSheetVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadEvent();
  }, [id, user]);

  const loadEvent = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('events')
      .select('id, title, poster_url, date, venues(name, neighbourhood, address)')
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
      const { data: rsvp } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      isGoing = rsvp?.status === 'going';
      isInterested = rsvp?.status === 'interested';
    }

    const { data: rsvpRows } = await supabase
      .from('event_rsvps')
      .select('profiles(id, username, avatar_url)')
      .eq('event_id', id)
      .eq('status', 'going')
      .limit(20);
    const profiles = ((rsvpRows || []) as any[])
      .map((r: any) => r.profiles)
      .filter(Boolean) as RsvpProfile[];
    setRsvpProfiles(profiles);

    setEvent({
      id: data.id,
      title: data.title,
      poster_url: data.poster_url || null,
      event_date: data.date || null,
      start_time: null,
      cover_charge: null,
      description: (data as any).description || null,
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
        const { error } = await supabase.from('event_rsvps').delete().eq('event_id', event.id).eq('user_id', user.id);
        if (error) setEvent(e => e ? { ...e, isInterested: true } : e);
      }
    } else {
      if (status === 'going') {
        setEvent(e => e ? { ...e, isGoing: true, isInterested: false, goingCount: e.goingCount + (e.isGoing ? 0 : 1) } : e);
        const { error } = await supabase.from('event_rsvps').upsert({ event_id: event.id, user_id: user.id, status: 'going' }, { onConflict: 'event_id,user_id' });
        if (error) setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
      } else {
        const wasGoing = event.isGoing;
        setEvent(e => e ? { ...e, isInterested: true, isGoing: false, goingCount: wasGoing ? Math.max(0, e.goingCount - 1) : e.goingCount } : e);
        const { error } = await supabase.from('event_rsvps').upsert({ event_id: event.id, user_id: user.id, status: 'interested' }, { onConflict: 'event_id,user_id' });
        if (error) setEvent(e => e ? { ...e, isInterested: false, isGoing: wasGoing, goingCount: wasGoing ? e.goingCount + 1 : e.goingCount } : e);
      }
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
      message: `Check out ${event.title} at ${venueName} on ${dateStr} 🎉`,
    });
  };

  const openShareToFriend = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to share events with friends.');
      return;
    }
    setShareSheetVisible(false);

    // Load accepted friends
    const { data: rows } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const list: Friend[] = ((rows || []) as any[]).map((r: any) => {
      const other = r.requester_id === user.id ? r.addressee : r.requester;
      return other as Friend;
    }).filter(Boolean);

    setFriends(list);
    setFriendSearch('');
    setFriendsSheetVisible(true);
  };

  const handleSendToFriend = async (friend: Friend) => {
    if (!user || !event) return;
    setSendingTo(friend.id);

    try {
      // Find or create direct conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('id, conversation_members(user_id)')
        .eq('type', 'direct')
        .contains('conversation_members.user_id', [user.id]);

      let conversationId: string | null = null;

      if (existing) {
        for (const conv of existing as any[]) {
          const memberIds: string[] = (conv.conversation_members || []).map((m: any) => m.user_id);
          if (memberIds.includes(friend.id) && memberIds.length === 2) {
            conversationId = conv.id;
            break;
          }
        }
      }

      if (!conversationId) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ type: 'direct' })
          .select('id')
          .single();
        if (convErr || !newConv) throw new Error('Could not create conversation');
        conversationId = newConv.id;

        await supabase.from('conversation_members').insert([
          { conversation_id: conversationId, user_id: user.id },
          { conversation_id: conversationId, user_id: friend.id },
        ]);
      }

      // Insert event_share message
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        type: 'event_share',
        metadata: {
          event_id: event.id,
          title: event.title,
          venue_name: event.venue?.name || null,
          event_date: event.event_date || null,
        },
      });

      if (msgErr) throw msgErr;

      setFriendsSheetVisible(false);
      Alert.alert('Sent!', `Event shared with ${friend.username}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send event.');
    } finally {
      setSendingTo(null);
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

  const formattedDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const filteredFriends = friends.filter(f =>
    f.username.toLowerCase().includes(friendSearch.toLowerCase())
  );

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
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {/* Venue name */}
        <Text style={{ fontSize: 26, fontWeight: '800', color: colours.text, marginBottom: 8 }}>
          {event.venue?.name || 'Unknown Venue'}
        </Text>

        {/* Neighbourhood pill */}
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

        {/* Event title */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 16 }}>
          {event.title}
        </Text>

        {/* Date / time / cover row */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {formattedDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{formattedDate}</Text>
            </View>
          )}
          {event.start_time && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{event.start_time}</Text>
            </View>
          )}
          {event.cover_charge && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="ticket-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{event.cover_charge}</Text>
            </View>
          )}
        </View>

        {/* Tags / vibe row */}
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

        {/* About this event */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            About this event
          </Text>
          <Text style={{ fontSize: 15, color: colours.text, lineHeight: 22, opacity: 0.85 }}>
            {event.description ?? 'Details coming soon. Check back closer to the date for more info.'}
          </Text>

          {/* Venue address */}
          {event.venue?.address && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16 }}>
              <Ionicons name="location-outline" size={16} color={colours.muted} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '500', flex: 1 }}>
                {event.venue.address}
              </Text>
            </View>
          )}
        </View>

        {/* RSVP avatar row */}
        {rsvpProfiles.length > 0 && (() => {
          const shown = rsvpProfiles.slice(0, 5);
          const extra = rsvpProfiles.length - shown.length;
          const AVATAR_SIZE = 36;
          const OVERLAP = 12;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, minHeight: AVATAR_SIZE }}>
              <View style={{ flexDirection: 'row', width: shown.length * (AVATAR_SIZE - OVERLAP) + OVERLAP, height: AVATAR_SIZE }}>
                {shown.map((p, i) => (
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
                      zIndex: shown.length - i,
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
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600', marginLeft: 8 }}>
                {extra > 0
                  ? `${shown.length}+${extra} going`
                  : `${rsvpProfiles.length} ${rsvpProfiles.length === 1 ? 'person' : 'people'} going`}
              </Text>
            </View>
          );
        })()}

        {/* I'm Going button */}
        <TouchableOpacity
          onPress={() => handleToggleRsvp('going')}
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

        {/* Interested button */}
        <TouchableOpacity
          onPress={() => handleToggleRsvp('interested')}
          activeOpacity={0.85}
          style={{
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            marginBottom: 14,
            borderWidth: 1.5,
            borderColor: event.isInterested ? colours.accent : colours.border,
            backgroundColor: event.isInterested ? colours.accent + '18' : 'transparent',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: event.isInterested ? colours.accent : colours.text }}>
            Interested
          </Text>
        </TouchableOpacity>

        {/* Share + Directions icon row */}
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
      </ScrollView>

      {/* Share bottom sheet */}
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
          backgroundColor: colours.card || '#1c1c1e',
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
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />

          <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, marginBottom: 16 }}>Share Event</Text>

          <TouchableOpacity
            onPress={openShareToFriend}
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
              <Ionicons name="person-outline" size={20} color={colours.accent} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share to a Friend</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Send via direct message</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShareExternal}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 14,
            }}
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

      {/* Friends picker sheet */}
      <Modal
        visible={friendsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendsSheetVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View style={{
          backgroundColor: colours.card || '#1c1c1e',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: SCREEN_HEIGHT * 0.65,
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, flex: 1 }}>Send to a Friend</Text>
            <TouchableOpacity onPress={() => setFriendsSheetVisible(false)}>
              <Ionicons name="close" size={22} color={colours.muted} />
            </TouchableOpacity>
          </View>

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
              value={friendSearch}
              onChangeText={setFriendSearch}
              placeholder="Search friends..."
              placeholderTextColor={colours.muted}
              style={{ flex: 1, fontSize: 14, color: colours.text, paddingVertical: 10 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {filteredFriends.length === 0 ? (
            <Text style={{ textAlign: 'center', color: colours.muted, fontSize: 14, paddingVertical: 32 }}>
              {friends.length === 0 ? 'No friends yet' : 'No results'}
            </Text>
          ) : (
            <FlatList
              data={filteredFriends}
              keyExtractor={f => f.id}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  onPress={() => handleSendToFriend(f)}
                  activeOpacity={0.8}
                  disabled={sendingTo === f.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                  }}
                >
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colours.accent,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {f.avatar_url ? (
                      <Image source={{ uri: f.avatar_url }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                        {f.username[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text, flex: 1 }}>@{f.username}</Text>
                  {sendingTo === f.id ? (
                    <ActivityIndicator size="small" color={colours.accent} />
                  ) : (
                    <Ionicons name="paper-plane-outline" size={18} color={colours.accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
