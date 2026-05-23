import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { sendNotification } from '../lib/notificationHelpers';

const ACCENT = '#FF3B5C';
const BG = '#0a0a0a';
const CARD = '#141414';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.45)';

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface PlanStatus {
  planId: string;
  inCount: number;
  totalInvited: number;
}

export default function LetsGoScreen() {
  const { eventId, eventTitle, eventVenue, eventDate } = useLocalSearchParams<{
    eventId: string;
    eventTitle: string;
    eventVenue: string;
    eventDate: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [existingPlan, setExistingPlan] = useState<PlanStatus | null>(null);

  useEffect(() => {
    if (!user || !eventId) return;
    loadFriends();
    loadExistingPlan();
  }, [user, eventId]);

  const loadFriends = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('friendships')
      .select(
        'requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)'
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const list: Friend[] = ((data || []) as any[])
      .map((r: any) => {
        const other = r.requester_id === user.id ? r.addressee : r.requester;
        return other as Friend;
      })
      .filter(Boolean);

    setFriends(list);
    setLoading(false);
  };

  const loadExistingPlan = async () => {
    if (!user || !eventId) return;
    const { data } = await supabase
      .from('pending_plans')
      .select('id, invited_user_ids, responses')
      .eq('creator_id', user.id)
      .eq('event_id', eventId)
      .maybeSingle();

    if (data) {
      const responses = (data.responses || {}) as Record<string, string>;
      const inCount = Object.values(responses).filter(v => v === 'in').length;
      setExistingPlan({
        planId: data.id,
        inCount,
        totalInvited: (data.invited_user_ids || []).length,
      });
    }
  };

  const toggleFriend = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (!user || !profile || selectedIds.size === 0 || !eventId) return;
    setSending(true);

    try {
      const invitedIds = Array.from(selectedIds);
      const myName = profile.username;

      // Upsert the plan (one plan per creator+event)
      const { data: plan, error: planErr } = await supabase
        .from('pending_plans')
        .upsert(
          {
            creator_id: user.id,
            event_id: eventId,
            event_title: eventTitle || '',
            event_venue: eventVenue || null,
            event_date: eventDate || null,
            invited_user_ids: invitedIds,
            responses: {},
          },
          { onConflict: 'creator_id,event_id' }
        )
        .select('id')
        .single();

      if (planErr || !plan) throw planErr || new Error('Could not create plan');

      // Send push notifications to each invited friend
      for (const friendId of invitedIds) {
        sendNotification(
          friendId,
          'plan_invite',
          `${myName} wants to go out`,
          `Are you going to ${eventTitle || 'this event'}? Tap to respond`,
          { type: 'plan_invite', planId: plan.id, eventId: String(eventId) },
          true,
          'high'
        );
      }

      Alert.alert('Invites sent!', `${invitedIds.length} friend${invitedIds.length > 1 ? 's' : ''} have been asked.`);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send invites.');
    } finally {
      setSending(false);
    }
  };

  const Avatar = ({ friend, size = 44 }: { friend: Friend; size?: number }) => (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ACCENT + '40',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {friend.avatar_url ? (
        <Image source={{ uri: friend.avatar_url }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.35 }}>
          {friend.username[0].toUpperCase()}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff' }}>Let's go?</Text>
          {step === 1 && (
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Pick friends to invite</Text>
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Event card */}
      <View style={{ margin: 16, padding: 16, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: ACCENT, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
          The plan
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }} numberOfLines={2}>
          {eventTitle || 'Event'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          {eventVenue ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location-outline" size={13} color={MUTED} />
              <Text style={{ fontSize: 13, color: MUTED }}>{eventVenue}</Text>
            </View>
          ) : null}
          {eventDate ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={13} color={MUTED} />
              <Text style={{ fontSize: 13, color: MUTED }}>{eventDate}</Text>
            </View>
          ) : null}
        </View>
        {existingPlan && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="people-outline" size={14} color={ACCENT} />
            <Text style={{ fontSize: 13, color: ACCENT, fontWeight: '600' }}>
              {existingPlan.inCount} of {existingPlan.totalInvited} friends are in
            </Text>
          </View>
        )}
      </View>

      {/* Step 1: Friend picker */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : friends.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="people-outline" size={40} color={MUTED} />
          <Text style={{ color: MUTED, fontSize: 15, marginTop: 12, textAlign: 'center' }}>
            Add some friends first to plan together
          </Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => f.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                onPress={() => toggleFriend(item.id)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER,
                  gap: 12,
                }}
              >
                <Avatar friend={item} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#fff' }}>
                  @{item.username}
                </Text>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? ACCENT : 'rgba(255,255,255,0.25)',
                    backgroundColor: selected ? ACCENT : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* CTA */}
      {selectedIds.size > 0 && (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 16,
          left: 16,
          right: 16,
        }}>
          <TouchableOpacity
            onPress={handleSendInvites}
            disabled={sending}
            activeOpacity={0.85}
            style={{
              backgroundColor: ACCENT,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                  Invite {selectedIds.size} friend{selectedIds.size > 1 ? 's' : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
