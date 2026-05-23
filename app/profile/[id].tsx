import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const ACCENT = '#FF3B5C';
const BG = '#0a0a0a';
const SURFACE = '#161A22';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.4)';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadAll();
  }, [id, user]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProfile(), loadUpcomingEvents(), loadFriendship()]);
    setLoading(false);
  };

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, created_at')
      .eq('id', id)
      .single();
    if (data) setProfile(data);
  };

  const loadUpcomingEvents = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('event_rsvps')
      .select(`
        status,
        events(id, title, date, venues(name))
      `)
      .eq('user_id', id)
      .eq('status', 'going')
      .gte('events.date', today)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setUpcomingEvents(data.filter((d: any) => d.events));
  };

  const loadFriendship = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(requester_id.eq.${user!.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user!.id})`)
      .maybeSingle();
    setFriendshipId(data?.id ?? null);
  };

  const handleRemoveFriend = () => {
    Alert.alert(
      'Remove friend',
      `Remove ${profile?.display_name || profile?.username} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!friendshipId) return;
            await supabase.from('friendships').delete().eq('id', friendshipId);
            setFriendshipId(null);
          },
        },
      ]
    );
  };

  const handleMessage = async () => {
    if (!user || !profile) return;
    setMessaging(true);

    // Look for a 1-on-1 conversation (both users are members, size = 2)
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    const myConvIds = (myConvs || []).map((c: any) => c.conversation_id);

    let existingConvId: string | null = null;
    if (myConvIds.length > 0) {
      const { data: theirConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id, conversations(id, name)')
        .eq('user_id', id)
        .in('conversation_id', myConvIds);

      // Find a conversation that only has 2 members (DM)
      for (const row of theirConvs || []) {
        const { count } = await supabase
          .from('conversation_members')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', row.conversation_id);
        if (count === 2) {
          existingConvId = row.conversation_id;
          break;
        }
      }
    }

    if (existingConvId) {
      setMessaging(false);
      router.push({
        pathname: '/chat/[id]',
        params: { id: existingConvId, name: profile.display_name || profile.username },
      } as any);
      return;
    }

    // Create new 1-on-1 conversation
    const dmName = profile.display_name || profile.username;
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ name: dmName, created_by: user.id })
      .select()
      .single();

    if (error || !conv) {
      setMessaging(false);
      Alert.alert('Error', 'Could not start conversation.');
      return;
    }

    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: id },
    ]);

    setMessaging(false);
    router.push({
      pathname: '/chat/[id]',
      params: { id: conv.id, name: dmName },
    } as any);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) return 'Tonight';
    if (year === tomorrow.getFullYear() && month === tomorrow.getMonth() + 1 && day === tomorrow.getDate()) return 'Tomorrow';
    return new Date(year, month - 1, day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 16, color: MUTED, textAlign: 'center' }}>User not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: ACCENT, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={ACCENT} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }} numberOfLines={1}>
          {profile.display_name || profile.username}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Avatar + name */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 88, height: 88, borderRadius: 44, marginBottom: 14, borderWidth: 2, borderColor: ACCENT + '50' }}
            />
          ) : (
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, borderColor: ACCENT + '40' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: ACCENT }}>
                {(profile.display_name || profile.username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 }}>
            {profile.display_name || profile.username}
          </Text>
          <Text style={{ fontSize: 14, color: MUTED, marginBottom: profile.bio ? 10 : 0 }}>
            @{profile.username}
          </Text>

          {profile.bio ? (
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 4, paddingHorizontal: 16 }}>
              {profile.bio}
            </Text>
          ) : null}

          {memberSince ? (
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Member since {memberSince}
            </Text>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          <TouchableOpacity
            onPress={handleMessage}
            disabled={messaging}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: ACCENT }}
          >
            {messaging
              ? <ActivityIndicator size="small" color="white" />
              : <>
                  <Ionicons name="chatbubble-outline" size={16} color="white" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Message</Text>
                </>
            }
          </TouchableOpacity>

          {friendshipId ? (
            <TouchableOpacity
              onPress={handleRemoveFriend}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER }}
            >
              <Ionicons name="person-remove-outline" size={16} color={MUTED} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: MUTED }}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Upcoming events */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Going to
        </Text>

        {upcomingEvents.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: BORDER }}>
            <Ionicons name="calendar-outline" size={36} color={MUTED} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center' }}>
              No upcoming events
            </Text>
          </View>
        ) : (
          upcomingEvents.map((rsvp: any, i: number) => {
            const ev = rsvp.events;
            const venue = ev?.venues?.name;
            return (
              <TouchableOpacity
                key={`${ev?.id}-${i}`}
                onPress={() => router.push(`/event/${ev?.id}` as any)}
                activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 8 }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: ACCENT + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="musical-notes-outline" size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                    {ev?.title}
                  </Text>
                  {venue ? (
                    <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                      {venue}
                    </Text>
                  ) : null}
                </View>
                {ev?.date ? (
                  <Text style={{ fontSize: 12, fontWeight: '600', color: ACCENT }}>
                    {formatDate(ev.date)}
                  </Text>
                ) : null}
                <Ionicons name="chevron-forward" size={14} color={MUTED} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
