import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const BG = '#0a0a0a';
const SURFACE = '#161A22';
const BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#FF3B5C';
const MUTED = 'rgba(255,255,255,0.4)';

interface SavedEvent {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  venue_name: string;
}

interface RsvpEvent extends SavedEvent {
  status: 'going' | 'interested';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function SavedEventsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [rsvpEvents, setRsvpEvents] = useState<RsvpEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user) { setLoading(false); return; }

    const [savedResult, rsvpResult] = await Promise.all([
      supabase
        .from('saved_events')
        .select('event_id, venue_events(id, title, poster_url, event_date, venues(name))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_rsvps')
        .select('status, venue_events(id, title, poster_url, event_date, venues(name))')
        .eq('user_id', user.id)
        .in('status', ['going', 'interested'])
        .order('created_at', { ascending: false }),
    ]);

    const mapped: SavedEvent[] = (savedResult.data ?? [])
      .map((row: any) => {
        const ve = row.venue_events;
        if (!ve) return null;
        return {
          id: ve.id,
          title: ve.title,
          poster_url: ve.poster_url ?? null,
          event_date: ve.event_date ?? null,
          venue_name: ve.venues?.name ?? '',
        };
      })
      .filter(Boolean) as SavedEvent[];

    const mappedRsvp: RsvpEvent[] = (rsvpResult.data ?? [])
      .map((row: any) => {
        const ve = row.venue_events;
        if (!ve) return null;
        return {
          id: ve.id,
          title: ve.title,
          poster_url: ve.poster_url ?? null,
          event_date: ve.event_date ?? null,
          venue_name: ve.venues?.name ?? '',
          status: row.status as 'going' | 'interested',
        };
      })
      .filter(Boolean) as RsvpEvent[];

    setEvents(mapped);
    setRsvpEvents(mappedRsvp);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: BORDER,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={ACCENT} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }}>Saved Events</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : events.length === 0 && rsvpEvents.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
          <Ionicons name="bookmark-outline" size={48} color={MUTED} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff', textAlign: 'center' }}>No saved events yet</Text>
          <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center' }}>Events you save or RSVP to will appear here</Text>
          <TouchableOpacity
            onPress={() => { router.back(); router.push('/(tabs)/discover' as any); }}
            style={{ marginTop: 4, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28 }}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Explore Discover</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[
            ...(events.length > 0 ? [{ type: 'header', label: 'Saved' as const, id: '__header_saved' }] : []),
            ...events.map(e => ({ ...e, type: 'saved' as const })),
            ...(rsvpEvents.length > 0 ? [{ type: 'header', label: 'RSVPs' as const, id: '__header_rsvps' }] : []),
            ...rsvpEvents.map(e => ({ ...e, type: 'rsvp' as const })),
          ]}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => {
            if (item.type === 'header') {
              return (
                <Text style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  paddingHorizontal: 16,
                  paddingTop: 20,
                  paddingBottom: 8,
                }}>
                  {item.label}
                </Text>
              );
            }
            const statusColor = item.status === 'going' ? '#4CAF50' : '#FF9800';
            const statusLabel = item.status === 'going' ? 'Going' : 'Interested';
            return (
              <TouchableOpacity
                onPress={() => router.push(`/event/${item.id}` as any)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 0.5,
                  borderBottomColor: BORDER,
                }}
              >
                {item.poster_url ? (
                  <Image
                    source={{ uri: item.poster_url }}
                    style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: SURFACE }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: SURFACE }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: MUTED }} numberOfLines={1}>{item.venue_name}</Text>
                  {item.event_date && (
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{formatDate(item.event_date)}</Text>
                  )}
                  {item.type === 'rsvp' && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor, marginTop: 3 }}>
                      {statusLabel}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
