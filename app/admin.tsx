import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Switch, TextInput, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AdminScreen() {
  const { colours } = useApp();
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<any>(null);
  const [sponsored, setSponsored] = useState<any[]>([]);
  const [pendingBusinesses, setPendingBusinesses] = useState<any[]>([]);
  const [pendingDeals, setPendingDeals] = useState<any[]>([]);
  const [wallPosts, setWallPosts] = useState<any[]>([]);
  const [seedVenueName, setSeedVenueName] = useState('');
  const [seedEventTitle, setSeedEventTitle] = useState('');
  const [seedEventDate, setSeedEventDate] = useState('');
  const [seedPosterUrl, setSeedPosterUrl] = useState('');
  const [seedingPoster, setSeedingPoster] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) { router.back(); return; }
    loadData();
  }, [isAdmin, loading]);

  const loadData = async () => {
    setDataLoading(true);
    const [usersRes, hangoutsRes, messagesRes, sponsoredRes, businessRes, dealsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('hangouts').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('sponsored_venues').select('*').order('created_at', { ascending: false }),
      supabase.from('business_profiles').select('*, profiles(email, display_name)').eq('is_verified', false).order('verification_requested_at', { ascending: true }),
      supabase.from('business_deals').select('*, business_profiles(business_name)').eq('is_approved', false).order('created_at', { ascending: true }),
    ]);
    setStats({
      users: usersRes.count || 0,
      hangouts: hangoutsRes.count || 0,
      messages: messagesRes.count || 0,
    });
    setSponsored(sponsoredRes.data || []);
    setPendingBusinesses(businessRes.data || []);
    setPendingDeals(dealsRes.data || []);
    setDataLoading(false);
    const { data: posts } = await supabase.from('city_board_posts').select('*').order('created_at', { ascending: false }).limit(20);
    setWallPosts(posts || []);
  };

  const seedPoster = async () => {
    if (!seedVenueName || !seedPosterUrl) {
      Alert.alert('Missing fields', 'Venue name and poster URL are required.');
      return;
    }
    setSeedingPoster(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('city_board_posts').insert({
      venue_name: seedVenueName,
      poster_url: seedPosterUrl,
      event_title: seedEventTitle || null,
      event_date: seedEventDate || null,
      created_by: user!.id,
      is_auto_generated: false,
      is_active: true,
    });
    setSeedVenueName(''); setSeedEventTitle(''); setSeedEventDate(''); setSeedPosterUrl('');
    await loadData();
    setSeedingPoster(false);
    Alert.alert('Posted!', 'Poster is live on affiche.');
  };

  const toggleSponsored = async (id: string, current: boolean) => {
    await supabase.from('sponsored_venues').update({ is_active: !current }).eq('id', id);
    loadData();
  };

  const deleteSponsored = async (id: string, name: string) => {
    Alert.alert('Remove sponsor?', name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('sponsored_venues').delete().eq('id', id);
        loadData();
      }},
    ]);
  };

  if (!isAdmin) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colours.accent} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, flex: 1 }}>Admin Panel</Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#e8a020' + '25' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#e8a020' }}>ADMIN</Text>
        </View>
      </View>

      {dataLoading ? <ActivityIndicator color={colours.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>

          {/* Stats */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>App Stats</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { label: 'Users', value: stats.users, icon: 'people-outline' },
                { label: 'Hangouts', value: stats.hangouts, icon: 'calendar-outline' },
                { label: 'Messages', value: stats.messages, icon: 'chatbubble-outline' },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', gap: 6 }}>
                  <Ionicons name={s.icon as any} size={20} color={colours.accent} />
                  <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text }}>{s.value}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Sponsored venues */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Sponsored Venues ({sponsored.length})
            </Text>
            {sponsored.length === 0 ? (
              <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ color: colours.muted }}>No sponsored venues yet</Text>
              </View>
            ) : sponsored.map(v => (
              <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{v.place_name}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>
                    {v.boost_type === 'single_event' ? `Event boost${v.expires_at ? ` · expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}` : 'Ongoing'}
                  </Text>
                </View>
                <Switch value={v.is_active} onValueChange={() => toggleSponsored(v.id, v.is_active)} trackColor={{ false: colours.border, true: colours.accent }} thumbColor="white" />
                <TouchableOpacity onPress={() => deleteSponsored(v.id, v.place_name)}>
                  <Ionicons name="trash-outline" size={18} color="#cc3b2a" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Pending verification */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Pending Verification ({pendingBusinesses.length})
            </Text>
            {pendingBusinesses.length === 0 ? (
              <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ color: colours.muted }}>No pending requests</Text>
              </View>
            ) : pendingBusinesses.map(b => (
              <View key={b.id} style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{b.business_name}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>{b.business_type} · {b.address}</Text>
                {b.website ? <Text style={{ fontSize: 11, color: colours.accent, marginTop: 2 }}>{b.website}</Text> : null}
                <TouchableOpacity
                  onPress={async () => {
                    await supabase.from('business_profiles').update({ is_verified: true }).eq('id', b.id);
                    loadData();
                  }}
                  style={{ marginTop: 10, backgroundColor: colours.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Verify business</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>


          {/* Pending deals */}
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Pending Deals ({pendingDeals.length})
            </Text>
            {pendingDeals.length === 0 ? (
              <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ color: colours.muted }}>No pending deals</Text>
              </View>
            ) : pendingDeals.map(d => (
              <View key={d.id} style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: colours.accent, marginBottom: 4 }}>{d.business_profiles?.business_name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 4 }}>{d.title}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 10 }}>{d.description}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    await supabase.from('business_deals').update({ is_approved: true, is_active: true }).eq('id', d.id);
                    loadData();
                  }}
                  style={{ backgroundColor: colours.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Approve deal</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Seed affiche */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Seed affiche</Text>
            <TextInput value={seedVenueName} onChangeText={setSeedVenueName} placeholder="Venue name" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, backgroundColor: colours.surface }} />
            <TextInput value={seedEventTitle} onChangeText={setSeedEventTitle} placeholder="Event title (optional)" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, backgroundColor: colours.surface }} />
            <TextInput value={seedEventDate} onChangeText={setSeedEventDate} placeholder="Date e.g. May 16, 2026" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, backgroundColor: colours.surface }} />
            <TextInput value={seedPosterUrl} onChangeText={setSeedPosterUrl} placeholder="Poster image URL" placeholderTextColor={colours.muted} style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 10, padding: 12, color: colours.text, backgroundColor: colours.surface }} />
            {seedPosterUrl ? <Image source={{ uri: seedPosterUrl }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" /> : null}
            <TouchableOpacity onPress={seedPoster} disabled={seedingPoster} style={{ backgroundColor: colours.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              {seedingPoster ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Post to affiche</Text>}
            </TouchableOpacity>
            {wallPosts.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, color: colours.muted }}>{wallPosts.length} posts on affiche</Text>
                {wallPosts.slice(0, 5).map(p => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
                    {p.poster_url && <Image source={{ uri: p.poster_url }} style={{ width: 40, height: 40, borderRadius: 6 }} />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{p.venue_name}</Text>
                      <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{p.event_title || 'No title'}</Text>
                    </View>
                    <TouchableOpacity onPress={async () => { await supabase.from('city_board_posts').update({ is_active: false }).eq('id', p.id); loadData(); }}>
                      <Ionicons name="trash-outline" size={16} color={colours.muted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}
