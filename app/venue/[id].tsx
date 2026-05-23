import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';

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

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [happyHours, setHappyHours] = useState<HappyHour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) load();
  }, [id]);

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
      supabase
        .from('happy_hours')
        .select('id, day_of_week, start_time, end_time, title, deal_details')
        .eq('venue_id', id)
        .order('day_of_week', { ascending: true }),
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

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
          </View>

          {venue.address && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 24 }}>
              <Ionicons name="location-outline" size={15} color="rgba(255,255,255,0.45)" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500', flex: 1 }}>
                {venue.address}
              </Text>
            </View>
          )}

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
                      {[formatDate(ev.event_date), ev.start_time].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Happy Hour */}
          {happyHours.length > 0 && (
            <>
              <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
                Happy Hour
              </Text>
              <View style={{ marginBottom: 28, gap: 8 }}>
                {happyHours.map(hh => (
                  <View
                    key={hh.id}
                    style={{ backgroundColor: '#1a0d00', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#3d1f00' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#f97316' }}>
                        {DAY_ABBR[hh.day_of_week]}  {fmt12(hh.start_time)} - {fmt12(hh.end_time)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: hh.deal_details ? 4 : 0 }}>
                      {hh.title}
                    </Text>
                    {hh.deal_details ? (
                      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 }}>
                        {hh.deal_details}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          )}

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
