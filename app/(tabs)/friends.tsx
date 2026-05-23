import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Share, Modal, Image, RefreshControl
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const DOWN_TONIGHT_KEY = 'down_tonight_date';

export default function FriendsScreen() {
  const { colours, t, language } = useApp();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [friends, setFriends] = useState<any[]>([]);
  const [friendsPlans, setFriendsPlans] = useState<any[]>([]);
  const [myHangouts, setMyHangouts] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupFriendSearch, setGroupFriendSearch] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [downTonight, setDownTonight] = useState(false);
  const [friendsDown, setFriendsDown] = useState<any[]>([]);
  const [friendsActivity, setFriendsActivity] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Restore downTonight state; auto-reset if stored date isn't today
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(DOWN_TONIGHT_KEY).then(async (stored) => {
      if (stored === today) {
        setDownTonight(true);
      } else if (stored && stored !== today) {
        // New day clear stale state
        setDownTonight(false);
        await AsyncStorage.removeItem(DOWN_TONIGHT_KEY);
        await supabase.from('profiles').update({ is_down_tonight: false }).eq('id', user.id);
        await supabase.from('city_board_down_tonight').delete().eq('user_id', user.id);
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user || !friends.length) return;
    const friendIds = friends.map((f: any) => f.id);
    supabase
      .from('city_board_down_tonight')
      .select('user_id, profiles(username, display_name, avatar_url)')
      .in('user_id', friendIds)
      .gt('expires_at', new Date().toISOString())
      .then(({ data }) => setFriendsDown(data || []));
    loadFriendsActivity(friendIds);
  }, [friends, downTonight]);

  useEffect(() => {
    if (!user) return;
    loadFriendsData();
  }, [user]);

  const loadMyHangouts = async () => {
    const { data } = await supabase
      .from('hangout_rsvps')
      .select(`
        status,
        hangout:hangouts(id, venue_name, event_name, happening_at,
          creator:profiles!hangouts_created_by_fkey(username, display_name))
      `)
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setMyHangouts(data.filter(d => d.hangout));
  };

  const loadFriendsPlans = async () => {
    if (!user) return;
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships?.length) return;
    const friendIds = friendships.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('hangout_rsvps')
      .select('status, created_at, hangouts(event_name, venue_name), profiles!hangout_rsvps_user_id_fkey(username, display_name, avatar_url)')
      .in('user_id', friendIds)
      .in('status', ['going', 'interested'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) setFriendsPlans(data.filter((d: any) => d.hangouts && d.profiles));
  };

  const loadFriendsActivity = async (friendIds: string[]) => {
    if (!friendIds.length) return;
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('event_rsvps')
      .select('event_id, created_at, profiles(id, username, display_name, avatar_url), events(id, title, date, venues(name))')
      .in('user_id', friendIds)
      .eq('status', 'going')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setFriendsActivity(data.filter((d: any) => d.profiles && d.events));
  };

  const loadFriendsData = async () => {
    setLoading(true);
    await Promise.all([loadFriends(), loadPendingRequests(), loadConversations(), loadMyHangouts()]);
    await loadFriendsPlans();
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFriends(), loadPendingRequests(), loadConversations(), loadMyHangouts()]);
    await loadFriendsPlans();
    setRefreshing(false);
  };

  const loadFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select(`
        id, status,
        requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url),
        addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`);

    if (data) {
      setFriends(data.map(f => {
        const friend = f.requester?.id === user!.id ? f.addressee : f.requester;
        return { ...friend, friendshipId: f.id };
      }));
    }
  };

  const loadPendingRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select(`
        id,
        requester:profiles!friendships_requester_id_fkey(id, username, display_name)
      `)
      .eq('addressee_id', user!.id)
      .eq('status', 'pending');

    if (data) setPendingRequests(data);
  };

  const loadConversations = async () => {
    const { data } = await supabase
      .from('conversation_members')
      .select(`
        conversation:conversations(id, name, created_at)
      `)
      .eq('user_id', user!.id);

    const convs = (data || []).map(d => d.conversation).filter(Boolean);
    setConversations(convs);
    if (convs.length > 0) {
      await loadUnreadCounts(convs.map((c: any) => c.id));
    }
  };

  const loadUnreadCounts = async (convIds: string[]) => {
    if (!convIds.length) return;
    // Fetch all messages in these convs not sent by me
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', user!.id);

    if (!msgs?.length) return;

    const msgIds = msgs.map(m => m.id);
    // Fetch which of those I have already read
    const { data: reads } = await supabase
      .from('message_reads')
      .select('message_id')
      .eq('user_id', user!.id)
      .in('message_id', msgIds);

    const readSet = new Set((reads || []).map((r: any) => r.message_id));
    const counts: Record<string, number> = {};
    for (const msg of msgs) {
      if (!readSet.has(msg.id)) {
        counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
      }
    }
    setUnreadCounts(counts);
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .ilike('username', `%${query}%`)
      .neq('id', user!.id)
      .limit(5);
    setSearchResults(data || []);
    setSearching(false);
  };

  const sendFriendRequest = async (addresseeId: string) => {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user!.id, addressee_id: addresseeId });
    if (error) {
      setSearchResults([]);
      setSearchQuery('');
      if (error.message.includes('unique')) {
        Alert.alert('Already sent', 'You already sent a friend request to this person.');
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Request sent!', 'They\'ll get a notification when they accept.');
      setSearchResults([]);
      setSearchQuery('');
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    loadFriendsData();
  };

  const declineRequest = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    loadFriendsData();
  };

  const handleDownToggle = async (newVal: boolean) => {
    setDownTonight(newVal);
    if (newVal) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const today = new Date().toISOString().slice(0, 10);
      await AsyncStorage.setItem(DOWN_TONIGHT_KEY, today);
      await Promise.all([
        supabase.from('city_board_down_tonight').upsert({
          user_id: user!.id,
          expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'user_id' }),
        supabase.from('profiles').update({ is_down_tonight: true }).eq('id', user!.id),
      ]);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await AsyncStorage.removeItem(DOWN_TONIGHT_KEY);
      await Promise.all([
        supabase.from('city_board_down_tonight').delete().eq('user_id', user!.id),
        supabase.from('profiles').update({ is_down_tonight: false }).eq('id', user!.id),
      ]);
    }
  };

  const handleShareInvite = async () => {
    const inviteUrl = `affiche://invite/${user!.id}`;
    await Share.share({
      message: `Join me on affiche — discover Toronto's best nights out 🎉 ${inviteUrl}`,
      url: inviteUrl,
    });
  };

  const handleInviteLink = async () => {
    const inviteUrl = `affiche://invite/${user!.id}`;
    await Clipboard.setStringAsync(inviteUrl);
    Alert.alert('Link copied!', 'Share the link with your friends when they sign up, you\'ll be connected automatically.');
  };

  const createGroup = () => {
    setNewGroupName('');
    setGroupFriendSearch('');
    setSelectedFriendIds([]);
    setShowNewGroup(true);
  };

  const toggleFriendSelection = (id: string) => {
    setSelectedFriendIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const submitNewGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Name required', 'Please enter a group name.');
      return;
    }
    setCreatingGroup(true);
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ name: newGroupName.trim(), created_by: user!.id })
      .select()
      .single();

    if (error || !conv) {
      setCreatingGroup(false);
      Alert.alert('Error', error?.message ?? 'Could not create group.');
      return;
    }

    // Insert creator + all selected friends
    const memberRows = [user!.id, ...selectedFriendIds].map(uid => ({
      conversation_id: conv.id,
      user_id: uid,
    }));
    const { error: membersError } = await supabase
      .from('conversation_members')
      .insert(memberRows);

    if (membersError) {
      setCreatingGroup(false);
      Alert.alert('Error', membersError.message);
      return;
    }

    // Optimistic update add to list immediately
    setConversations(prev => [conv, ...prev]);
    setNewGroupName('');
    setGroupFriendSearch('');
    setSelectedFriendIds([]);
    setCreatingGroup(false);
    setShowNewGroup(false);
  };

  const formatActivityDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) return 'tonight';
    if (year === tomorrow.getFullYear() && month === tomorrow.getMonth() + 1 && day === tomorrow.getDate()) return 'tomorrow';
    return new Date(year, month - 1, day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>👥</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, marginBottom: 8 }}>Friends</Text>
        <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center' }}>Sign in to add friends and coordinate nights out.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0E12' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border, backgroundColor: '#0C0E12' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text }}>Friends</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={createGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40' }}>
              <Ionicons name="add" size={16} color={colours.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>New Group</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)} activeOpacity={0.8}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colours.accent + '60' }}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colours.accent }}>
                    {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* I'm down tonight toggle */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
            borderWidth: 1.5,
            borderColor: downTonight ? '#00C07A' : 'rgba(255,255,255,0.08)',
            backgroundColor: downTonight ? '#00C07A12' : '#1E2230',
            marginBottom: 12,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: downTonight ? '#00C07A20' : colours.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={downTonight ? 'moon' : 'moon-outline'} size={20} color={downTonight ? '#00C07A' : colours.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: downTonight ? '#00C07A' : colours.text }}>
              {downTonight ? "You're down tonight" : "I'm down tonight"}
            </Text>
            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>
              {downTonight ? 'Your friends can see you\'re available' : 'Let friends know you\'re free'}
            </Text>
          </View>
          <Switch
            value={downTonight}
            onValueChange={handleDownToggle}
            trackColor={{ false: '#333', true: '#00C07A' }}
            thumbColor="#fff"
          />
        </View>
        {friendsDown.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row' }}>
              {friendsDown.slice(0, 4).map((f: any, i: number) => (
                <View key={f.user_id} style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -8 : 0, borderWidth: 2, borderColor: colours.bg }}>
                  {f.profiles?.avatar_url ? (
                    <Image source={{ uri: f.profiles.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>
                      {(f.profiles?.display_name || f.profiles?.username || '?')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '500' }}>
              {friendsDown.length === 1
                ? `${friendsDown[0].profiles?.display_name || friendsDown[0].profiles?.username} is down tonight`
                : `${friendsDown.length} friends are down tonight`}
            </Text>
          </View>
        )}
        {/* Friends Activity */}
        {friendsActivity.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Friends Activity
            </Text>
            {friendsActivity.map((item: any, i: number) => {
              const p = item.profiles as any;
              const ev = item.events as any;
              const venue = ev?.venues?.name;
              const dateLabel = formatActivityDate(ev?.date);
              const name = p?.display_name || p?.username || 'Someone';
              const sentence = `${name} is going to ${ev?.title}${venue ? ` at ${venue}` : ''}${dateLabel ? ` ${dateLabel}` : ''}`;
              return (
                <TouchableOpacity
                  key={`${item.event_id}-${i}`}
                  onPress={() => router.push(`/event/${ev?.id}` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                  activeOpacity={0.7}
                >
                  {p?.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                  ) : (
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colours.accent }}>{name[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={{ flex: 1, fontSize: 13, color: colours.text, lineHeight: 18 }} numberOfLines={2}>
                    {sentence}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Friend discovery methods */}
        <View style={{ gap: 10 }}>
          {/* Search by username */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E2230', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text }}
              placeholder="Search by username..."
              placeholderTextColor={colours.muted}
              value={searchQuery}
              onChangeText={q => { setSearchQuery(q); searchUsers(q); }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator size="small" color={colours.muted} />}
          </View>

          {/* Quick action buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={handleInviteLink}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1E2230', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <Ionicons name="link-outline" size={16} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareInvite}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1E2230', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Invite</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search results */}
        {searchResults.length > 0 && (
          <View style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginTop: 8, overflow: 'hidden' }}>
            {searchResults.map((u, i) => (
              <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i < searchResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colours.accent }}>{u.username[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{u.display_name || u.username}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>@{u.username}</Text>
                </View>
                <TouchableOpacity onPress={() => sendFriendRequest(u.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colours.accent, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: 'white' }}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#0C0E12' }}
        contentContainerStyle={{ padding: 20, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
      >

        {/* Your Plans */}
        {myHangouts.length > 0 && (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Your Plans
            </Text>
            {myHangouts.map((rsvp, i) => (
              <View key={i} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: rsvp.status === 'going' ? colours.accent + '40' : colours.border, padding: 14, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: rsvp.status === 'going' ? colours.accent + '20' : colours.border + '40', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{rsvp.status === 'going' ? '🙋' : '👀'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                      {rsvp.hangout.event_name || rsvp.hangout.venue_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                      {rsvp.status === 'going' ? "You're going" : "You're interested"} · {rsvp.hangout.venue_name}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: rsvp.status === 'going' ? colours.accent + '18' : colours.border + '40' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: rsvp.status === 'going' ? colours.accent : colours.muted }}>
                      {rsvp.status === 'going' ? "I'm in" : 'Interested'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Friends' Plans */}
        {friendsPlans.length > 0 && (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Friends' Plans
            </Text>
            {friendsPlans.map((plan, i) => {
              const profile = plan.profiles as any;
              const hangout = plan.hangouts as any;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: plan.status === 'going' ? colours.accent + '40' : colours.border, padding: 14, marginBottom: 8 }}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={{ width: 40, height: 40, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: colours.accent }}>{(profile?.display_name || profile?.username || '?')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                      {profile?.display_name || profile?.username} {plan.status === 'going' ? 'is going to' : 'is interested in'}
                    </Text>
                    <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{hangout?.event_name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{hangout?.venue_name}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: plan.status === 'going' ? colours.accent + '18' : '#e8a020' + '18' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: plan.status === 'going' ? colours.accent : '#e8a020' }}>
                      {plan.status === 'going' ? 'Going' : 'Maybe'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Pending requests */}
        {pendingRequests.length > 0 && (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Friend Requests ({pendingRequests.length})
            </Text>
            {pendingRequests.map(req => (
              <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colours.accent }}>{req.requester?.username?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{req.requester?.display_name || req.requester?.username}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>@{req.requester?.username}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => declineRequest(req.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colours.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => acceptRequest(req.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colours.accent }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'white' }}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Groups */}
        {conversations.length > 0 && (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Groups
            </Text>
            {conversations.map(conv => {
              const unread = unreadCounts[conv.id] || 0;
              return (
                <TouchableOpacity key={conv.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id, name: conv.name } } as any)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: unread > 0 ? colours.accent + '50' : colours.border, padding: 14, marginBottom: 8 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name="people" size={20} color="#7b5ea7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{conv.name}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted }}>{unread > 0 ? `${unread} new message${unread > 1 ? 's' : ''}` : 'Tap to open chat'}</Text>
                  </View>
                  {unread > 0 ? (
                    <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colours.muted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Friends list */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            {friends.length > 0 ? `Friends (${friends.length})` : 'Friends'}
          </Text>
          {loading ? (
            <ActivityIndicator color={colours.accent} />
          ) : friends.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: 'transparent' }}>
              <Ionicons name="people-outline" size={48} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 4 }}>No friends yet</Text>
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>Search for friends by username above</Text>
            </View>
          ) : (
            friends.map(friend => (
              <TouchableOpacity
                key={friend.id}
                activeOpacity={0.7}
                onPress={() => router.push(`/profile/${friend.id}` as any)}
                onLongPress={() => {
                  Alert.alert(
                    friend.display_name || friend.username,
                    'What would you like to do?',
                    [
                      { text: 'View profile', onPress: () => router.push(`/profile/${friend.id}` as any) },
                      {
                        text: 'Remove friend',
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert(
                            'Remove friend',
                            `Remove ${friend.display_name || friend.username} from your friends?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: async () => {
                                  await supabase.from('friendships').delete().eq('id', friend.friendshipId);
                                  setFriends(prev => prev.filter(f => f.id !== friend.id));
                                },
                              },
                            ]
                          );
                        },
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 8 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colours.accent }}>{friend.username?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{friend.display_name || friend.username}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>@{friend.username}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Invite friends */}
        <View style={{ marginTop: 8, padding: 20, borderRadius: 16, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 }}>
            Invite your friends
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 18 }}>
            affiche is better with friends. Share your invite link and coordinate nights out together.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={handleInviteLink}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2a2a2a' }}
            >
              <Ionicons name="link-outline" size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareInvite}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF3B5C' }}
            >
              <Ionicons name="share-outline" size={16} color="white" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      <Modal visible={showNewGroup} transparent animationType="slide" onRequestClose={() => setShowNewGroup(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#161A22', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, maxHeight: '80%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 16 }}>New Group</Text>

            {/* Group name */}
            <TextInput
              style={{ backgroundColor: colours.bg, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text, marginBottom: 16 }}
              placeholder="Group name..."
              placeholderTextColor={colours.muted}
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />

            {/* Friend search */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
              Add Friends {selectedFriendIds.length > 0 ? `(${selectedFriendIds.length} selected)` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.bg, borderRadius: 10, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, paddingVertical: 8, gap: 6, marginBottom: 10 }}>
              <Ionicons name="search-outline" size={14} color={colours.muted} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: colours.text }}
                placeholder="Filter friends..."
                placeholderTextColor={colours.muted}
                value={groupFriendSearch}
                onChangeText={setGroupFriendSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Friends list */}
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {friends.length === 0 ? (
                <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', paddingVertical: 16 }}>
                  Add friends first to create a group
                </Text>
              ) : (
                friends
                  .filter(f =>
                    !groupFriendSearch ||
                    (f.username || '').toLowerCase().includes(groupFriendSearch.toLowerCase()) ||
                    (f.display_name || '').toLowerCase().includes(groupFriendSearch.toLowerCase())
                  )
                  .map(friend => {
                    const selected = selectedFriendIds.includes(friend.id);
                    return (
                      <TouchableOpacity
                        key={friend.id}
                        onPress={() => toggleFriendSelection(friend.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 12 }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>
                            {(friend.display_name || friend.username || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{friend.display_name || friend.username}</Text>
                          <Text style={{ fontSize: 12, color: colours.muted }}>@{friend.username}</Text>
                        </View>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: selected ? colours.accent : 'transparent',
                          borderWidth: 2, borderColor: selected ? colours.accent : colours.border,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && <Ionicons name="checkmark" size={13} color="white" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowNewGroup(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colours.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitNewGroup} disabled={creatingGroup} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center' }}>
                {creatingGroup
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Create</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
