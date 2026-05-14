import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AdminScreen() {
  const { colours } = useApp();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<any>(null);
  const [sponsored, setSponsored] = useState<any[]>([]);
  const [pendingBusinesses, setPendingBusinesses] = useState<any[]>([]);
  const [pendingDeals, setPendingDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { router.back(); return; }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
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
    setLoading(false);
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

      {loading ? <ActivityIndicator color={colours.accent} style={{ marginTop: 40 }} /> : (
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

        </ScrollView>
      )}
    </View>
  );
}
