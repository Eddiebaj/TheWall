import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Linking } from 'react-native';
import { STRIPE_LINKS } from '../lib/stripeLinks';
import * as ImagePicker from 'expo-image-picker';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function VenueAnalytics({ venueName, colours }: { venueName: string; colours: any }) {
  const [stats, setStats] = useState({ rsvps: 0, scans: 0, videos: 0, topHour: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueName) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from('city_board_rsvps').select('id', { count: 'exact', head: true }).eq('venue_name', venueName).gte('created_at', weekAgo),
      supabase.from('venue_qr_scans').select('scanned_at').eq('venue_name', venueName).gte('scanned_at', weekAgo),
      supabase.from('poster_memories').select('id', { count: 'exact', head: true }).eq('venue_name', venueName),
    ]).then(([rsvpRes, scanRes, memRes]) => {
      const scans = scanRes.data || [];
      const hourCounts: Record<number, number> = {};
      scans.forEach(s => {
        const h = new Date(s.scanned_at).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      const topHourNum = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topHour = topHourNum ? `${topHourNum}:00–${Number(topHourNum) + 1}:00` : '-';
      setStats({ rsvps: rsvpRes.count || 0, scans: scans.length, videos: memRes.count || 0, topHour });
      setLoading(false);
    });
  }, [venueName]);

  const attendanceRate = stats.rsvps > 0 ? Math.round((stats.scans / stats.rsvps) * 100) : 0;

  return (
    <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>This Week</Text>
      {loading ? <ActivityIndicator color={colours.accent} /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'RSVPs', value: stats.rsvps, icon: 'flame-outline' },
              { label: 'Scans', value: stats.scans, icon: 'qr-code-outline' },
              { label: 'Memories', value: stats.videos, icon: 'videocam-outline' },
            ].map((s, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: colours.bg }}>
                <Ionicons name={s.icon as any} size={16} color={colours.accent} />
                <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text, marginTop: 4 }}>{s.value}</Text>
                <Text style={{ fontSize: 10, color: colours.muted }}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colours.bg, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: attendanceRate > 50 ? '#00C07A' : colours.accent }}>{attendanceRate}%</Text>
              <Text style={{ fontSize: 10, color: colours.muted }}>showed up</Text>
            </View>
            <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colours.bg, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text }}>{stats.topHour}</Text>
              <Text style={{ fontSize: 10, color: colours.muted }}>peak scan time</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Event card with live stats ─────────────────────────────────────────────
function EventCard({ event, colours }: { event: any; colours: any }) {
  const [stats, setStats] = useState({ going: 0, interested: 0, moments: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from('venue_event_rsvps').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('status', 'going'),
      supabase.from('venue_event_rsvps').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('status', 'interested'),
      supabase.from('city_board_posts').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    ]).then(([going, interested, moments]) => {
      setStats({ going: going.count ?? 0, interested: interested.count ?? 0, moments: moments.count ?? 0 });
    });
  }, [event.id]);

  const dateStr = event.event_date
    ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {event.poster_url ? (
          <Image source={{ uri: event.poster_url }} style={{ width: 56, height: 56, borderRadius: 10 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={24} color={colours.muted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{event.title}</Text>
          <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
            {dateStr}{event.event_time ? ` · ${event.event_time}` : ''}{event.cover_charge && event.cover_charge !== 'Free' ? ` · ${event.cover_charge}` : ''}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {[
          { icon: 'checkmark-circle-outline', label: 'Going', value: stats.going, color: '#00C07A' },
          { icon: 'star-outline', label: 'Interested', value: stats.interested, color: colours.accent },
          { icon: 'images-outline', label: 'Moments', value: stats.moments, color: '#A78BFA' },
        ].map((s, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colours.bg }}>
            <Ionicons name={s.icon as any} size={14} color={s.color} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginTop: 2 }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: colours.muted }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BusinessDashboardScreen() {
  const { colours } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [business, setBusiness] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [venueEvents, setVenueEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);

  // New deal form
  const [dealTitle, setDealTitle] = useState('');
  const [dealDesc, setDealDesc] = useState('');
  const [dealType, setDealType] = useState<'ongoing' | 'single_event' | 'happy_hour'>('happy_hour');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [qrCode, setQrCode] = useState<any>(null);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventPrice, setEventPrice] = useState('Free');
  const [ticketUrl, setTicketUrl] = useState('');
  const [showAddPoster, setShowAddPoster] = useState(false);

  // Create event form
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventCharge, setNewEventCharge] = useState('Free');
  const [newEventPosterUrl, setNewEventPosterUrl] = useState<string | null>(null);
  const [uploadingEventPoster, setUploadingEventPoster] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.back(); return; }

    const { data: biz } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!biz) {
      Alert.alert('No business profile', 'Please register your business first.');
      router.back();
      return;
    }

    setBusiness(biz);

    const { data: bizDeals } = await supabase
      .from('business_deals')
      .select('*')
      .eq('business_id', biz.id)
      .order('created_at', { ascending: false });

    setDeals(bizDeals || []);

    const { data: events } = await supabase
      .from('venue_events')
      .select('*')
      .eq('business_id', biz.id)
      .order('event_date', { ascending: false });

    setVenueEvents(events || []);

    const { data: existingQR } = await supabase
      .from('venue_qr_codes')
      .select('*')
      .eq('venue_name', biz.business_name)
      .single();
    if (existingQR) setQrCode(existingQR);

    const { data: latestPost } = await supabase
      .from('city_board_posts')
      .select('*')
      .eq('venue_name', biz.business_name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (latestPost?.poster_url) setPosterUrl(latestPost.poster_url);

    setLoading(false);
  };

  const generateQR = async () => {
    setGeneratingQR(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('venue_qr_codes')
        .upsert({
          venue_name: business.business_name,
          venue_lat: business.lat ?? null,
          venue_lng: business.lng ?? null,
          created_by: user!.id,
          is_active: true,
        }, { onConflict: 'venue_name' })
        .select()
        .single();
      if (error) throw error;
      setQrCode(data);
      Alert.alert('QR Code Ready', `Your venue QR code is live. Share the code routeo://venue/${data.id} or print it for your venue.`);
    } catch (e) {
      Alert.alert('Error', 'Could not generate QR code.');
    } finally {
      setGeneratingQR(false);
    }
  };

  const uploadPoster = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingPoster(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const path = `posters/${business.business_name.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('poster-memories')
        .upload(path, blob, { contentType: `image/${ext}` });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('poster-memories').getPublicUrl(path);
      setPosterUrl(publicUrl);
      await supabase.from('city_board_posts').insert({
        venue_name: business.business_name,
        poster_url: publicUrl,
        event_title: eventTitle || null,
        event_date: eventDate || null,
        price: eventPrice,
        ticket_url: ticketUrl || null,
        created_by: user!.id,
        is_active: true,
      });
      setShowAddPoster(false);
      Alert.alert('Poster Live!', 'Your poster is now on The Wall.');
    } catch (e) {
      Alert.alert('Error', 'Could not upload poster.');
    } finally {
      setUploadingPoster(false);
    }
  };

  const uploadEventPoster = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingEventPoster(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const path = `event-posters/${business.business_name.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('poster-memories')
        .upload(path, blob, { contentType: `image/${ext}` });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('poster-memories').getPublicUrl(path);
      setNewEventPosterUrl(publicUrl);
    } catch {
      Alert.alert('Error', 'Could not upload poster.');
    } finally {
      setUploadingEventPoster(false);
    }
  };

  const createEvent = async () => {
    if (!newEventTitle.trim()) { Alert.alert('Required', 'Please enter an event title.'); return; }
    if (!newEventDate.trim()) { Alert.alert('Required', 'Please enter a date (e.g. 2026-06-15).'); return; }
    setCreatingEvent(true);
    const { error } = await supabase.from('venue_events').insert({
      business_id: business.id,
      title: newEventTitle.trim(),
      event_date: newEventDate.trim(),
      event_time: newEventTime.trim() || null,
      cover_charge: newEventCharge.trim() || 'Free',
      poster_url: newEventPosterUrl || null,
    });
    setCreatingEvent(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setNewEventTitle(''); setNewEventDate(''); setNewEventTime(''); setNewEventCharge('Free'); setNewEventPosterUrl(null);
    setShowCreateEvent(false);
    loadData();
  };

  const submitDeal = async () => {
    if (!dealTitle.trim()) { Alert.alert('Required', 'Please enter a deal title.'); return; }
    if (!dealDesc.trim()) { Alert.alert('Required', 'Please enter a description.'); return; }
    if (dealType === 'happy_hour' && selectedDays.length === 0) { Alert.alert('Required', 'Please select days.'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('business_deals').insert({
      business_id: business.id,
      title: dealTitle.trim(),
      description: dealDesc.trim(),
      deal_type: dealType,
      days_of_week: selectedDays.length > 0 ? selectedDays : null,
      start_time: startTime || null,
      end_time: endTime || null,
      is_active: false,
      is_approved: false,
    });

    setSubmitting(false);

    if (error) { Alert.alert('Error', error.message); return; }

    Alert.alert('Submitted!', 'Your deal has been submitted for review. We\'ll approve it within 24 hours.');
    setDealTitle(''); setDealDesc(''); setSelectedDays([]); setStartTime(''); setEndTime('');
    setShowAddDeal(false);
    loadData();
  };

  const toggleDay = (d: number) => {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colours.accent} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colours.accent} />
        </TouchableOpacity>
        {business?.promo_image_url && (
          <Image source={{ uri: business.promo_image_url }} style={{ width: 48, height: 27, borderRadius: 8 }} resizeMode="cover" />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text }}>{business?.business_name}</Text>
          {(business?.open_time || business?.close_time) && (
            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
              {business.open_time} - {business.close_time}
            </Text>
          )}
        </View>
        {business?.is_verified ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#00A78D20' }}>
            <Ionicons name="checkmark-circle" size={12} color="#00A78D" />
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#00A78D' }}>VERIFIED</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#e8a02020' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#e8a020' }}>PENDING</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>

        {/* Verification pending banner */}
        {!business?.is_verified && (
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: '#e8a020' + '12', borderWidth: 1, borderColor: '#e8a020' + '30' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#e8a020', marginBottom: 4 }}>Verification pending</Text>
            <Text style={{ fontSize: 13, color: colours.muted, lineHeight: 18 }}>We're reviewing your business. This usually takes less than 24 hours. You can submit deals now and they'll go live once verified.</Text>
          </View>
        )}

        {/* Subscription card */}
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Subscription</Text>
          {[
            { label: 'Beta plan', price: '$49/mo', desc: 'Perfect for getting started', link: STRIPE_LINKS.business_beta, highlight: true },
            { label: 'Launch plan', price: '$99/mo', desc: 'At 1,000+ daily users', link: STRIPE_LINKS.business_launch, highlight: false },
            { label: 'Scale plan', price: '$149/mo', desc: 'At 5,000+ daily users', link: STRIPE_LINKS.business_scale, highlight: false },
            { label: 'Single event boost', price: '$39 flat', desc: 'Feature one event or promotion', link: STRIPE_LINKS.business_single_event, highlight: false },
          ].map((plan, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => Linking.openURL(plan.link)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: plan.highlight ? colours.accent + '15' : colours.bg, borderWidth: 1, borderColor: plan.highlight ? colours.accent + '40' : colours.border, marginBottom: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{plan.label}</Text>
                <Text style={{ fontSize: 12, color: colours.muted }}>{plan.desc}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: plan.highlight ? colours.accent : colours.text }}>{plan.price}</Text>
              <Ionicons name="chevron-forward" size={16} color={colours.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Live Analytics */}
        <VenueAnalytics venueName={business?.business_name} colours={colours} />

        {/* Events */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
              Events ({venueEvents.length})
            </Text>
            <TouchableOpacity
              onPress={() => setShowCreateEvent(!showCreateEvent)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colours.accent }}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Create Event</Text>
            </TouchableOpacity>
          </View>

          {/* Create event form */}
          {showCreateEvent && (
            <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 12, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text }}>New Event</Text>

              <TextInput
                style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                value={newEventTitle} onChangeText={setNewEventTitle}
                placeholder="Event title" placeholderTextColor={colours.muted}
              />
              <TextInput
                style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                value={newEventDate} onChangeText={setNewEventDate}
                placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colours.muted}
              />
              <TextInput
                style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                value={newEventTime} onChangeText={setNewEventTime}
                placeholder="Time e.g. 9:00 PM" placeholderTextColor={colours.muted}
              />
              <TextInput
                style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                value={newEventCharge} onChangeText={setNewEventCharge}
                placeholder="Cover charge e.g. Free / $10" placeholderTextColor={colours.muted}
              />

              {/* Poster upload */}
              <TouchableOpacity
                onPress={uploadEventPoster}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colours.accent, borderStyle: 'dashed' }}
              >
                {uploadingEventPoster
                  ? <ActivityIndicator color={colours.accent} />
                  : <Ionicons name={newEventPosterUrl ? 'checkmark-circle-outline' : 'image-outline'} size={20} color={colours.accent} />
                }
                <Text style={{ fontSize: 14, fontWeight: '600', color: colours.accent }}>
                  {uploadingEventPoster ? 'Uploading...' : newEventPosterUrl ? 'Poster uploaded' : 'Upload Poster'}
                </Text>
              </TouchableOpacity>
              {newEventPosterUrl && (
                <Image source={{ uri: newEventPosterUrl }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" />
              )}

              <TouchableOpacity
                onPress={createEvent}
                disabled={creatingEvent}
                style={{ backgroundColor: colours.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
              >
                {creatingEvent ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Create Event</Text>}
              </TouchableOpacity>
            </View>
          )}

          {venueEvents.length === 0 && !showCreateEvent ? (
            <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={32} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ color: colours.muted }}>No events yet create your first one</Text>
            </View>
          ) : venueEvents.map(ev => (
            <EventCard key={ev.id} event={ev} colours={colours} />
          ))}
        </View>

        {/* Post to The Wall */}
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>The Wall</Text>
            <TouchableOpacity onPress={() => setShowAddPoster(!showAddPoster)} style={{ backgroundColor: colours.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'white' }}>+ Post</Text>
            </TouchableOpacity>
          </View>
          {posterUrl && (
            <Image source={{ uri: posterUrl }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 10 }} resizeMode="cover" />
          )}
          {showAddPoster && (
            <View style={{ gap: 10 }}>
              <TouchableOpacity onPress={uploadPoster} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colours.accent, borderStyle: 'dashed' }}>
                {uploadingPoster ? <ActivityIndicator color={colours.accent} /> : <Ionicons name="image-outline" size={20} color={colours.accent} />}
                <Text style={{ fontSize: 14, fontWeight: '600', color: colours.accent }}>{uploadingPoster ? 'Uploading...' : 'Choose Poster Image'}</Text>
              </TouchableOpacity>
              <TextInput value={eventTitle} onChangeText={setEventTitle} placeholder="Event title (optional)" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, fontSize: 14 }} />
              <TextInput value={eventDate} onChangeText={setEventDate} placeholder="Date e.g. May 16, 2026" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, fontSize: 14 }} />
              <TextInput value={eventPrice} onChangeText={setEventPrice} placeholder="Price e.g. Free / $10" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, fontSize: 14 }} />
              <TextInput value={ticketUrl} onChangeText={setTicketUrl} placeholder="Ticket URL (optional)" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, fontSize: 14 }} />
            </View>
          )}
          {!showAddPoster && !posterUrl && (
            <Text style={{ fontSize: 12, color: colours.muted, textAlign: 'center' }}>Upload your event poster to appear on The Wall</Text>
          )}
        </View>

        {/* QR Code */}
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Venue QR Code</Text>
          {qrCode ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 120, height: 120, backgroundColor: colours.accent + '18', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colours.accent + '40' }}>
                <Ionicons name="qr-code" size={64} color={colours.accent} />
              </View>
              <Text style={{ fontSize: 12, color: colours.muted, textAlign: 'center' }}>ID: {qrCode.id.slice(0, 8)}...</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('QR Code', `routeo://venue/${qrCode.id}\n\nShare this with a QR code generator to print your venue code.`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colours.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}
              >
                <Ionicons name="share-outline" size={14} color="white" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Share QR Code</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: colours.muted, textAlign: 'center' }}>Print and display at your venue so customers can unlock their posters</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Ionicons name="qr-code-outline" size={48} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>Generate a QR code for your venue. Customers scan it to unlock their poster after attending.</Text>
              <TouchableOpacity
                onPress={generateQR}
                disabled={generatingQR}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colours.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              >
                {generatingQR ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="qr-code-outline" size={16} color="white" />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>{generatingQR ? 'Generating...' : 'Generate QR Code'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Deals */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Your Deals ({deals.length})</Text>
            <TouchableOpacity onPress={() => setShowAddDeal(!showAddDeal)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colours.accent }}>
              <Ionicons name="add" size={16} color="white" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Add deal</Text>
            </TouchableOpacity>
          </View>

          {/* Add deal form */}
          {showAddDeal && (
            <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 12, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text }}>New deal</Text>

              <TextInput style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                value={dealTitle} onChangeText={setDealTitle} placeholder="Title e.g. Happy Hour 3-6pm" placeholderTextColor={colours.muted} />

              <TextInput style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, height: 80, textAlignVertical: 'top' }}
                value={dealDesc} onChangeText={setDealDesc} placeholder="Description e.g. Half price wings and $5 pints" placeholderTextColor={colours.muted} multiline />

              {/* Deal type */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['happy_hour', 'ongoing', 'single_event'] as const).map(t => (
                  <TouchableOpacity key={t} onPress={() => setDealType(t)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: dealType === t ? colours.accent : colours.bg, borderColor: dealType === t ? colours.accent : colours.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: dealType === t ? 'white' : colours.muted }}>
                      {t === 'happy_hour' ? 'Happy Hour' : t === 'ongoing' ? 'Ongoing' : 'Single Event'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Days */}
              {dealType !== 'single_event' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {DAYS.map((d, i) => (
                    <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                      style={{ flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: selectedDays.includes(i) ? colours.accent : colours.bg, borderColor: selectedDays.includes(i) ? colours.accent : colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedDays.includes(i) ? 'white' : colours.muted }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Times */}
              {dealType === 'happy_hour' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput style={{ flex: 1, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                    value={startTime} onChangeText={setStartTime} placeholder="Start 15:00" placeholderTextColor={colours.muted} />
                  <TextInput style={{ flex: 1, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text }}
                    value={endTime} onChangeText={setEndTime} placeholder="End 18:00" placeholderTextColor={colours.muted} />
                </View>
              )}

              <TouchableOpacity onPress={submitDeal} disabled={submitting}
                style={{ backgroundColor: colours.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                {submitting ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Submit for approval</Text>}
              </TouchableOpacity>
            </View>
          )}

          {deals.length === 0 ? (
            <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
              <Text style={{ color: colours.muted }}>No deals yet - add your first one</Text>
            </View>
          ) : deals.map(d => (
            <View key={d.id} style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: d.is_approved ? '#00A78D40' : colours.border, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colours.text }}>{d.title}</Text>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: d.is_approved ? '#00A78D20' : '#e8a02020' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: d.is_approved ? '#00A78D' : '#e8a020' }}>
                    {d.is_approved ? 'LIVE' : 'PENDING'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colours.muted }}>{d.description}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL('mailto:support@thewall.app?subject=' + encodeURIComponent('Business Support - ' + (business?.business_name || '')))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginTop: 8 }}
        >
          <Ionicons name="mail-outline" size={20} color={colours.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>Contact support</Text>
            <Text style={{ fontSize: 12, color: colours.muted }}>Questions about your listing or billing</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colours.muted} />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
