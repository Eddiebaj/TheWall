import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  ScrollView,
  Share,
  Text,
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

interface EventDetail {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  cover_charge: string | null;
  venue: {
    name: string;
    neighbourhood: string | null;
    address: string | null;
  } | null;
  goingCount: number;
  isGoing: boolean;
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
    if (user) {
      const { data: rsvp } = await supabase
        .from('event_rsvps')
        .select('event_id')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .eq('status', 'going')
        .maybeSingle();
      isGoing = !!rsvp;
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
    setRsvpProfiles(profiles
    );

    setEvent({
      id: data.id,
      title: data.title,
      poster_url: data.poster_url || null,
      event_date: data.date || null,
      start_time: null,
      cover_charge: null,
      venue: (data as any).venues || null,
      goingCount: goingCount || 0,
      isGoing,
    });
    setLoading(false);
  };

  const handleToggleRsvp = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to RSVP to events.');
      return;
    }
    if (!event) return;

    if (event.isGoing) {
      setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id);
      if (error) setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + 1 } : e);
    } else {
      setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + 1 } : e);
      const { error } = await supabase
        .from('event_rsvps')
        .insert({ event_id: event.id, user_id: user.id, status: 'going' });
      if (error) setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
    }
  };

  const handleShare = () => {
    if (!event) return;
    const venueName = event.venue?.name || 'a venue';
    const dateStr = event.event_date
      ? new Date(event.event_date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'an upcoming date';
    Share.share({
      message: `I'm going to ${event.title} at ${venueName} on ${dateStr} 🎉 Check it out on TheWall: https://thewall.app/event/${event.id}`,
    });
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
          onPress={handleToggleRsvp}
          activeOpacity={0.85}
          style={{
            backgroundColor: event.isGoing ? '#c0392b' : '#FF3B5C',
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {event.isGoing ? "I'm Going \u2713" : "I'm Going"}
          </Text>
        </TouchableOpacity>

        {/* Get Directions button */}
        {event.venue?.address && (
          <TouchableOpacity
            onPress={handleGetDirections}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: colours.border,
              borderRadius: 16,
              paddingVertical: 14,
              marginBottom: 12,
            }}
          >
            <Ionicons name="navigate-outline" size={18} color={colours.text} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Get Directions</Text>
          </TouchableOpacity>
        )}

        {/* Share button */}
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.85}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: colours.border,
            borderRadius: 16,
            paddingVertical: 14,
          }}
        >
          <Ionicons name="share-outline" size={18} color={colours.text} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
