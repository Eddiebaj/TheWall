import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking,
  Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const TIER_COLOURS: Record<string, string> = {
  basic: '#8888aa',
  pro: '#a78bfa',
  featured: '#f59e0b',
};

const BOOST_PRODUCTS = [
  { label: 'Event Boost 3 Days', price: '$9.99', key: '3day', icon: 'flash-outline' as const },
  { label: 'Event Boost 7 Days', price: '$19.99', key: '7day', icon: 'trending-up-outline' as const },
  { label: 'Weekend Spotlight', price: '$29.99', key: 'weekend', icon: 'star-outline' as const },
];

type VenueEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  cover_charge: string | null;
  rsvp_count: number;
};

type Analytics = {
  rsvps: number;
  views: number;
  saves: number;
  topEvent: string | null;
};

type Subscription = {
  plan: 'basic' | 'pro' | 'featured' | null;
  status: string;
  stripe_customer_id: string | null;
};

function StatCard({ label, value, icon, colours }: { label: string; value: string | number; icon: string; colours: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: colours.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
      <Ionicons name={icon as any} size={18} color={colours.accent} style={{ marginBottom: 6 }} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export default function BusinessDashboardScreen() {
  const { colours } = useApp();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [sub, setSub] = useState<Subscription>({ plan: null, status: 'inactive', stripe_customer_id: null });
  const [analytics, setAnalytics] = useState<Analytics>({ rsvps: 0, views: 0, saves: 0, topEvent: null });
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);
  const [stripeLinks, setStripeLinks] = useState<Record<string, string>>({});

  // Add event modal
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEntry, setNewEntry] = useState<'Free' | 'Paid'>('Free');
  const [saving, setSaving] = useState(false);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load profile venue info
      const { data: prof } = await supabase
        .from('profiles')
        .select('venue_id, business_email')
        .eq('id', user.id)
        .single();

      const vid = prof?.venue_id ?? null;
      setVenueId(vid);

      if (vid) {
        const { data: venueRow } = await supabase.from('venues').select('name').eq('id', vid).single();
        setVenueName(venueRow?.name ?? '');

        // Load subscription
        const { data: subRow } = await supabase
          .from('business_subscriptions')
          .select('plan, status, stripe_customer_id')
          .eq('venue_id', vid)
          .eq('status', 'active')
          .maybeSingle();

        if (subRow) {
          setSub({ plan: subRow.plan, status: subRow.status, stripe_customer_id: subRow.stripe_customer_id });
        }

        // Load analytics (Pro+)
        const isPro = subRow?.plan === 'pro' || subRow?.plan === 'featured';
        if (isPro) {
          const [rsvpRes, viewRes, saveRes] = await Promise.all([
            supabase
              .from('venue_event_rsvps')
              .select('event_id', { count: 'exact', head: true })
              .gte('created_at', monthStartISO)
              .in('event_id', supabase.from('venue_events').select('id').eq('business_id',
                supabase.from('business_profiles').select('id').eq('user_id', user.id)
              ) as any),
            supabase
              .from('venue_views')
              .select('id', { count: 'exact', head: true })
              .eq('venue_id', vid)
              .gte('viewed_at', monthStartISO),
            supabase
              .from('saved_events')
              .select('event_id', { count: 'exact', head: true })
              .gte('created_at', monthStartISO)
              .in('event_id', supabase.from('venue_events').select('id').eq('business_id',
                supabase.from('business_profiles').select('id').eq('user_id', user.id)
              ) as any),
          ]);

          // Top event by rsvp count
          const { data: bpRow } = await supabase.from('business_profiles').select('id').eq('user_id', user.id).maybeSingle();
          let topEvent: string | null = null;
          if (bpRow) {
            const { data: topData } = await supabase
              .from('venue_events')
              .select('title, venue_event_rsvps(count)')
              .eq('business_id', bpRow.id)
              .order('created_at', { ascending: false })
              .limit(10);
            if (topData && topData.length > 0) {
              const sorted = [...topData].sort((a: any, b: any) =>
                (b.venue_event_rsvps?.[0]?.count ?? 0) - (a.venue_event_rsvps?.[0]?.count ?? 0)
              );
              topEvent = sorted[0]?.title ?? null;
            }
          }

          setAnalytics({
            rsvps: rsvpRes.count ?? 0,
            views: viewRes.count ?? 0,
            saves: saveRes.count ?? 0,
            topEvent,
          });
        }

        // Load business profile id for event inserts
        const { data: bpRow } = await supabase.from('business_profiles').select('id').eq('user_id', user.id).maybeSingle();
        setBusinessProfileId(bpRow?.id ?? null);

        // Load events
        if (bpRow) {
          const { data: evRows } = await supabase
            .from('venue_events')
            .select('id, title, event_date, event_time, cover_charge')
            .eq('business_id', bpRow.id)
            .order('event_date', { ascending: true });

          if (evRows) {
            const withCounts = await Promise.all(
              evRows.map(async (ev: any) => {
                const { count } = await supabase
                  .from('venue_event_rsvps')
                  .select('id', { count: 'exact', head: true })
                  .eq('event_id', ev.id);
                return { ...ev, rsvp_count: count ?? 0 };
              })
            );
            setEvents(withCounts);
          }
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[BusinessDashboard] load error:', e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddEvent = async () => {
    if (!newTitle.trim() || !newDate.trim()) {
      Alert.alert('Missing fields', 'Event name and date are required.');
      return;
    }
    if (!businessProfileId) {
      Alert.alert('Error', 'Business profile not found. Please contact support.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('venue_events').insert({
      business_id: businessProfileId,
      title: newTitle.trim(),
      event_date: newDate.trim(),
      event_time: newTime.trim() || null,
      cover_charge: newEntry,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setShowAddEvent(false);
    setNewTitle(''); setNewDate(''); setNewTime(''); setNewDesc(''); setNewEntry('Free');
    loadData();
  };

  const tierColour = TIER_COLOURS[sub.plan ?? 'basic'];
  const isPro = sub.plan === 'pro' || sub.plan === 'featured';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colours.accent} />
      </View>
    );
  }

  if (!venueId) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 16, color: colours.muted, textAlign: 'center', lineHeight: 24 }}>
          No venue linked to this account. Please complete business setup first.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/business-setup' as any)}
          style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Go to Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginBottom: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={20} color={colours.text} />
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colours.text, flex: 1 }} numberOfLines={1}>
              {venueName}
            </Text>
            {sub.plan && (
              <View style={{ backgroundColor: tierColour + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: tierColour + '55', marginLeft: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: tierColour, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {sub.plan}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sub.status === 'active' ? '#00C07A' : '#cc3b2a' }} />
            <Text style={{ fontSize: 13, color: colours.muted }}>
              {sub.status === 'active' ? 'Subscription active' : 'Subscription inactive'}
            </Text>
          </View>

          {sub.stripe_customer_id && (
            <TouchableOpacity
              onPress={() => Linking.openURL('https://billing.stripe.com/p/login/').catch(() => {})}
              style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.surface, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colours.border, alignSelf: 'flex-start' }}
            >
              <Ionicons name="card-outline" size={16} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>Manage subscription</Text>
              <Ionicons name="open-outline" size={13} color={colours.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 20, marginBottom: 24 }} />

        {/* Analytics */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Analytics - This Month
          </Text>

          {isPro ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <StatCard label="RSVPs" value={analytics.rsvps} icon="people-outline" colours={colours} />
                <StatCard label="Profile Views" value={analytics.views} icon="eye-outline" colours={colours} />
                <StatCard label="Saves" value={analytics.saves} icon="bookmark-outline" colours={colours} />
              </View>
              {analytics.topEvent && (
                <View style={{ backgroundColor: colours.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colours.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="trophy-outline" size={18} color="#f59e0b" />
                  <View>
                    <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Most Popular Event</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginTop: 2 }}>{analytics.topEvent}</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={{ backgroundColor: colours.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
              <Ionicons name="lock-closed-outline" size={28} color={colours.muted} style={{ marginBottom: 10 }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 4 }}>Upgrade to Pro</Text>
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', lineHeight: 19 }}>
                Unlock monthly RSVPs, profile views, saves, and top event analytics.
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 20, marginBottom: 24 }} />

        {/* Events */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Events
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddEvent(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colours.accent + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colours.accent + '44' }}
            >
              <Ionicons name="add" size={16} color={colours.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>Add event</Text>
            </TouchableOpacity>
          </View>

          {events.length === 0 ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed', padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 4 }}>No events yet</Text>
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>Add your first event to get started.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {events.map((ev) => (
                <View
                  key={ev.id}
                  style={{ backgroundColor: colours.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colours.border }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 4 }}>{ev.title}</Text>
                      <Text style={{ fontSize: 12, color: colours.muted }}>
                        {ev.event_date}{ev.event_time ? `  ${ev.event_time}` : ''}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: colours.accent + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colours.accent }}>{ev.rsvp_count}</Text>
                      <Text style={{ fontSize: 10, color: colours.muted }}>RSVPs</Text>
                    </View>
                  </View>
                  {ev.cover_charge && (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ alignSelf: 'flex-start', backgroundColor: ev.cover_charge === 'Free' ? '#00C07A22' : '#f59e0b22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: ev.cover_charge === 'Free' ? '#00C07A' : '#f59e0b' }}>
                          {ev.cover_charge}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 20, marginBottom: 24 }} />

        {/* Boosts */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Boosts
          </Text>
          <View style={{ gap: 10 }}>
            {BOOST_PRODUCTS.map((bp) => (
              <TouchableOpacity
                key={bp.key}
                onPress={() => Linking.openURL('https://affiche.app/business').catch(() => {})}
                activeOpacity={0.8}
                style={{ backgroundColor: colours.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colours.border, flexDirection: 'row', alignItems: 'center', gap: 14 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colours.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={bp.icon} size={22} color={colours.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{bp.label}</Text>
                  <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>{bp.price}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* Add Event Modal */}
      <Modal visible={showAddEvent} animationType="slide" transparent onRequestClose={() => setShowAddEvent(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, marginBottom: 20 }}>Add Event</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Event Name</Text>
            <TextInput
              style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text, marginBottom: 14 }}
              placeholder="e.g. Saturday Night Live"
              placeholderTextColor={colours.muted}
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Date</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colours.muted}
                  value={newDate}
                  onChangeText={setNewDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Time</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
                  placeholder="10:00 PM"
                  placeholderTextColor={colours.muted}
                  value={newTime}
                  onChangeText={setNewTime}
                />
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Entry</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {(['Free', 'Paid'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setNewEntry(opt)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', borderColor: newEntry === opt ? colours.accent : colours.border, backgroundColor: newEntry === opt ? colours.accent + '22' : colours.surface }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: newEntry === opt ? colours.accent : colours.muted }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowAddEvent(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colours.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddEvent}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Add Event</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
