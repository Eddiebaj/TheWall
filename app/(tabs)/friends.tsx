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
import { sendNotification } from '../../lib/notificationHelpers';
import { SK_DOWN_TONIGHT } from '../../lib/storageKeys';

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
  const [showSearch, setShowSearch] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupFriendSearch, setGroupFriendSearch] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [downTonight, setDownTonight] = useState(false);
  const [friendsDown, setFriendsDown] = useState<any[]>([]);
  const [friendsActivity, setFriendsActivity] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messagingFriendId, setMessagingFriendId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(SK_DOWN_TONIGHT).then(async (stored) => {
      if (stored === today) {
        setDownTonight(true);
      } else if (stored && stored !== today) {
        setDownTonight(false);
        await AsyncStorage.removeItem(SK_DOWN_TONIGHT);
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

  useEffect(() => {
    if (!user) return;
    const sub = supabase
      .channel('pending-friend-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${user.id}`,
        },
        () => loadPendingRequests()
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [user]);

  const loadMyHangouts = async () => {
    try {
      if (!user) return;
      const { data, error } = await supabase
        .from('hangout_rsvps')
        .select(`
          status,
          hangout:hangouts(id, venue_name, event_name, happening_at,
            creator:profiles!hangouts_created_by_fkey(username, display_name))
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return;
      if (data) setMyHangouts(data.filter(d => d.hangout));
    } catch (e) {
      if (__DEV__) console.error('[friends] loadMyHangouts error:', e);
    }
  };

  const loadFriendsPlans = async () => {
    if (!user) return;
    try {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (!friendships?.length) return;
      const friendIds = friendships.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);

      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('hangout_rsvps')
        .select('status, created_at, hangouts(event_name, venue_name), profiles!hangout_rsvps_user_id_fkey(username, display_name, avatar_url)')
        .in('user_id', friendIds)
        .in('status', ['going', 'interested'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) return;
      if (data) setFriendsPlans(data.filter((d: any) => d.hangouts && d.profiles));
    } catch (e) {
      if (__DEV__) console.error('[friends] loadFriendsPlans error:', e);
    }
  };

  const loadFriendsActivity = async (friendIds: string[]) => {
    if (!friendIds.length) return;
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const [legacyRes, veRes] = await Promise.all([
      supabase
        .from('event_rsvps')
        .select('event_id, created_at, profiles(id, username, display_name, avatar_url), events(id, title, date, venues(name))')
        .in('user_id', friendIds)
        .eq('status', 'going')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('venue_event_rsvps')
        .select('event_id, created_at, profiles(id, username, display_name, avatar_url), venue_events(id, title, event_date, venues(name))')
        .in('user_id', friendIds)
        .eq('status', 'going')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    const legacy = (legacyRes.data ?? []).filter((d: any) => d.profiles && d.events);
    const ve = (veRes.data ?? [])
      .filter((d: any) => d.profiles && d.venue_events)
      .map((d: any) => ({ ...d, events: d.venue_events }));
    const merged = [...legacy, ...ve].sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 5);
    setFriendsActivity(merged);
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
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', user!.id);

    if (!msgs?.length) return;

    const msgIds = msgs.map(m => m.id);
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
      Alert.alert('Request sent!', "They'll get a notification when they accept.");
      setSearchResults([]);
      setSearchQuery('');
      sendNotification(
        addresseeId,
        'friend_request',
        'New request',
        `@${profile?.username} wants to connect`,
        { type: 'friend_request' }
      );
    }
  };

  const acceptRequest = async (friendshipId: string, requesterId: string) => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    if (error) {
      Alert.alert('Error', 'Could not accept request. Please try again.');
      return;
    }
    sendNotification(
      requesterId,
      'friend_accepted',
      "You're connected",
      `@${profile?.username} accepted your request`,
      { type: 'friend_accepted' }
    );
    loadFriendsData();
  };

  const declineRequest = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    loadFriendsData();
  };

  const handleOpenDM = async (friend: any) => {
    if (!user) return;
    setMessagingFriendId(friend.id);
    try {
      // Find existing 1-on-1 conversation
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);
      const myConvIds = (myConvs || []).map((c: any) => c.conversation_id);

      let existingConvId: string | null = null;
      if (myConvIds.length > 0) {
        const { data: theirConvs } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', friend.id)
          .in('conversation_id', myConvIds);
        for (const row of theirConvs || []) {
          const { count } = await supabase
            .from('conversation_members')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', row.conversation_id);
          if (count === 2) { existingConvId = row.conversation_id; break; }
        }
      }

      if (existingConvId) {
        router.push({ pathname: '/chat/[id]', params: { id: existingConvId, name: friend.display_name || friend.username } } as any);
        return;
      }

      // Create new DM
      const dmName = friend.display_name || friend.username;
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ name: dmName, created_by: user.id, type: 'direct' })
        .select()
        .single();
      if (error || !conv) { Alert.alert('Error', 'Could not start conversation.'); return; }
      await supabase.from('conversation_members').insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: friend.id },
      ]);
      router.push({ pathname: '/chat/[id]', params: { id: conv.id, name: dmName } } as any);
    } finally {
      setMessagingFriendId(null);
    }
  };

  const handleDownToggle = async (newVal: boolean) => {
    setDownTonight(newVal);
    if (newVal) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const today = new Date().toISOString().slice(0, 10);
      await AsyncStorage.setItem(SK_DOWN_TONIGHT, today);
      await Promise.all([
        supabase.from('city_board_down_tonight').upsert({
          user_id: user!.id,
          expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'user_id' }),
        supabase.from('profiles').update({ is_down_tonight: true }).eq('id', user!.id),
      ]);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await AsyncStorage.removeItem(SK_DOWN_TONIGHT);
      await Promise.all([
        supabase.from('city_board_down_tonight').delete().eq('user_id', user!.id),
        supabase.from('profiles').update({ is_down_tonight: false }).eq('id', user!.id),
      ]);
    }
  };

  const handleShareInvite = async () => {
    await Share.share({
      message: "Join me on affiche \u2014 see what's happening in Toronto tonight. https://apps.apple.com/app/affiche",
    });
  };

  const handleInviteLink = async () => {
    const inviteUrl = `affiche://invite/${user!.id}`;
    await Clipboard.setStringAsync(inviteUrl);
    Alert.alert('Link copied!', "Share the link with your friends when they sign up, you'll be connected automatically.");
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
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', paddingTop: insets.top }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ flexDirection: 'row', marginBottom: 24 }}>
            {['#FF3B5C', '#f97316', '#8b5cf6'].map((color, i) => (
              <View
                key={i}
                style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: color + '22',
                  borderWidth: 2, borderColor: color + '44',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: i === 0 ? 0 : -10,
                  zIndex: 3 - i,
                }}
              >
                <Ionicons name="person" size={22} color={color} />
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 }}>
            Coordinate your night out
          </Text>
          <Text style={{ fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
            See which friends are going out, share events, and make plans together.
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/auth' as any)}
            style={{ width: '100%', backgroundColor: '#FF3B5C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/auth' as any)}
            style={{ width: '100%', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Create Account</Text>
          </TouchableOpacity>

          <Text style={{ color: '#555', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
            Join to see what your friends are up to tonight
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {/* Top bar */}
      <View style={{ backgroundColor: '#0a0a0a', paddingTop: insets.top, borderBottomWidth: showSearch ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 13, gap: 16 }}>
          <TouchableOpacity
            onPress={() => {
              setShowSearch(v => !v);
              if (showSearch) { setSearchQuery(''); setSearchResults([]); }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={showSearch ? 'close-outline' : 'search-outline'}
              size={24}
              color="rgba(255,255,255,0.75)"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareInvite}
            style={{ backgroundColor: '#FF3B5C', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }}>Invite</Text>
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color="#888" />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: '#fff' }}
                placeholder="Search by username..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={q => { setSearchQuery(q); searchUsers(q); }}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color="#888" />}
            </View>
            {searchResults.length > 0 && (
              <View style={{ backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginTop: 6, overflow: 'hidden' }}>
                {searchResults.map((u, i) => (
                  <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF3B5C' }}>{u.username[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{u.display_name || u.username}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>@{u.username}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => sendFriendRequest(u.id)}
                      style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FF3B5C' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Down tonight toggle */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => handleDownToggle(!downTonight)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: downTonight ? 'rgba(0,192,122,0.07)' : '#111',
              borderWidth: 1,
              borderColor: downTonight ? 'rgba(0,192,122,0.25)' : 'rgba(255,255,255,0.06)',
              borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
            }}
          >
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: downTonight ? 'rgba(0,192,122,0.12)' : 'rgba(255,255,255,0.05)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name={downTonight ? 'moon' : 'moon-outline'} size={17} color={downTonight ? '#00C07A' : '#888'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: downTonight ? '#00C07A' : '#fff', letterSpacing: -0.2 }}>
                {downTonight ? "You're down tonight" : "I'm down tonight"}
              </Text>
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                {downTonight ? "Friends can see you're available" : "Let friends know you're free"}
              </Text>
            </View>
            <Switch
              value={downTonight}
              onValueChange={handleDownToggle}
              trackColor={{ false: '#2a2a2a', true: '#00C07A' }}
              thumbColor="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Tonight -- who's down */}
        {friendsDown.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 14 }}>
              Tonight
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }}>
              {friendsDown.map((f: any) => (
                <TouchableOpacity
                  key={f.user_id}
                  onPress={() => router.push(`/profile/${f.user_id}` as any)}
                  activeOpacity={0.75}
                  style={{ alignItems: 'center', gap: 7 }}
                >
                  <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    borderWidth: 2.5, borderColor: '#FF3B5C',
                    padding: 2, overflow: 'hidden',
                  }}>
                    {f.profiles?.avatar_url ? (
                      <Image source={{ uri: f.profiles.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 29 }} />
                    ) : (
                      <View style={{ flex: 1, borderRadius: 29, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#FF3B5C' }}>
                          {(f.profiles?.display_name || f.profiles?.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', maxWidth: 64, textAlign: 'center' }} numberOfLines={1}>
                    {(f.profiles?.display_name || f.profiles?.username || '').split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Friend requests */}
        {pendingRequests.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Requests
            </Text>
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {pendingRequests.map((req, i) => (
                <View
                  key={req.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                    minHeight: 64,
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#FF3B5C' }}>
                      {req.requester?.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }}>
                      {req.requester?.display_name || req.requester?.username}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#888' }}>wants to connect</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => declineRequest(req.id)}
                      style={{
                        width: 34, height: 34, borderRadius: 17,
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={18} color="#888" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => acceptRequest(req.id, req.requester?.id)}
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#00C07A', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Friends list */}
        <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
          {loading ? (
            <ActivityIndicator color="#FF3B5C" style={{ marginTop: 40 }} />
          ) : friends.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center', marginBottom: 14,
              }}>
                <Ionicons name="people-outline" size={26} color="rgba(255,255,255,0.2)" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 6, letterSpacing: -0.2 }}>No friends yet</Text>
              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                Search for people by username or invite friends.
              </Text>
              <TouchableOpacity
                onPress={handleShareInvite}
                style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Invite people</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {friends.map((friend, i) => (
                <TouchableOpacity
                  key={friend.id}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/profile/${friend.id}` as any)}
                  onLongPress={() => {
                    Alert.alert(friend.display_name || friend.username, undefined, [
                      { text: 'View Profile', onPress: () => router.push(`/profile/${friend.id}` as any) },
                      { text: 'Message', onPress: () => handleOpenDM(friend) },
                      {
                        text: 'Remove Friend',
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert(
                            'Remove friend',
                            `Remove ${friend.display_name || friend.username}?`,
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
                    ]);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                    minHeight: 64,
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                    ) : (
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#FF3B5C' }}>
                        {friend.username?.[0]?.toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }}>
                      {friend.display_name || friend.username}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#888', marginTop: 1 }}>@{friend.username}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleOpenDM(friend)}
                    disabled={messagingFriendId === friend.id}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ padding: 8 }}
                  >
                    {messagingFriendId === friend.id
                      ? <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                      : <Ionicons name="chatbubble-outline" size={18} color="rgba(255,255,255,0.25)" />}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Messages / Groups */}
        <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Messages
            </Text>
            <TouchableOpacity
              onPress={createGroup}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="add-circle-outline" size={16} color="#FF3B5C" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FF3B5C' }}>New group</Text>
            </TouchableOpacity>
          </View>

          {conversations.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#444' }}>No groups yet</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {conversations.map((conv, i) => {
                const unread = unreadCounts[conv.id] || 0;
                return (
                  <TouchableOpacity
                    key={conv.id}
                    onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id, name: conv.name } } as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 14, paddingVertical: 12,
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                      minHeight: 64,
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(123,94,167,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="people" size={20} color="#7b5ea7" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: unread > 0 ? '700' : '600', color: '#fff', letterSpacing: -0.2 }}>{conv.name}</Text>
                      <Text style={{ fontSize: 13, color: '#888', marginTop: 1 }}>
                        {unread > 0 ? `${unread} new message${unread > 1 ? 's' : ''}` : 'Tap to open'}
                      </Text>
                    </View>
                    {unread > 0 ? (
                      <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#FF3B5C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Friends Activity */}
        {friendsActivity.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Activity</Text>
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {friendsActivity.map((item: any, idx: number) => {
                const p = item.profiles as any;
                const ev = item.events as any;
                const venue = ev?.venues?.name;
                const dateLabel = formatActivityDate(ev?.date);
                const name = p?.display_name || p?.username || 'Someone';
                return (
                  <TouchableOpacity
                    key={`${item.event_id}-${idx}`}
                    onPress={() => router.push(`/event/${ev?.id}` as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 14, paddingVertical: 12,
                      borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                    }}
                    activeOpacity={0.7}
                  >
                    {p?.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12 }} />
                    ) : (
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF3B5C' }}>{name[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 18 }} numberOfLines={2}>
                      <Text style={{ fontWeight: '700', color: '#fff' }}>{name}</Text>
                      {` is going to ${ev?.title}${venue ? ` at ${venue}` : ''}${dateLabel ? ` ${dateLabel}` : ''}`}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* My Plans */}
        {myHangouts.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Your Plans</Text>
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {myHangouts.map((rsvp, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name={rsvp.status === 'going' ? 'checkmark-circle' : 'eye-outline'} size={20} color={rsvp.status === 'going' ? '#00C07A' : '#888'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }} numberOfLines={1}>
                      {rsvp.hangout.event_name || rsvp.hangout.venue_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>
                      {rsvp.status === 'going' ? 'Going' : 'Interested'} · {rsvp.hangout.venue_name}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Friends Plans */}
        {friendsPlans.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Friends' Plans</Text>
            <View style={{ backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {friendsPlans.map((plan, i) => {
                const prof = plan.profiles as any;
                const hangout = plan.hangouts as any;
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 14, paddingVertical: 12,
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
                      {prof?.avatar_url ? (
                        <Image source={{ uri: prof.avatar_url }} style={{ width: 40, height: 40 }} />
                      ) : (
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF3B5C' }}>
                          {(prof?.display_name || prof?.username || '?')[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }}>
                        {prof?.display_name || prof?.username}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }} numberOfLines={1}>
                        {plan.status === 'going' ? 'Going to' : 'Interested in'} {hangout?.event_name}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: plan.status === 'going' ? 'rgba(0,192,122,0.12)' : 'rgba(232,160,32,0.12)' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: plan.status === 'going' ? '#00C07A' : '#e8a020' }}>
                        {plan.status === 'going' ? 'Going' : 'Maybe'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Invite block */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, borderRadius: 16, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4, letterSpacing: -0.3 }}>Invite your friends</Text>
          <Text style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18 }}>
            affiche is better with friends. Share your link and coordinate nights out together.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={handleInviteLink}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <Ionicons name="link-outline" size={15} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareInvite}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: '#FF3B5C' }}
            >
              <Ionicons name="share-outline" size={15} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* New Group Modal */}
      <Modal visible={showNewGroup} transparent animationType="slide" onRequestClose={() => setShowNewGroup(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, maxHeight: '80%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 20, letterSpacing: -0.3 }}>New Group</Text>

            <TextInput
              style={{ backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#fff', marginBottom: 20 }}
              placeholder="Group name..."
              placeholderTextColor="#666"
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />

            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Add Friends {selectedFriendIds.length > 0 ? `(${selectedFriendIds.length} selected)` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 8, gap: 6, marginBottom: 10 }}>
              <Ionicons name="search-outline" size={14} color="#666" />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#fff' }}
                placeholder="Filter friends..."
                placeholderTextColor="#666"
                value={groupFriendSearch}
                onChangeText={setGroupFriendSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {friends.length === 0 ? (
                <Text style={{ fontSize: 13, color: '#666', textAlign: 'center', paddingVertical: 16 }}>
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
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {friend.avatar_url ? (
                            <Image source={{ uri: friend.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                          ) : (
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF3B5C' }}>
                              {(friend.display_name || friend.username || '?')[0].toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{friend.display_name || friend.username}</Text>
                          <Text style={{ fontSize: 12, color: '#888' }}>@{friend.username}</Text>
                        </View>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: selected ? '#FF3B5C' : 'transparent',
                          borderWidth: 2, borderColor: selected ? '#FF3B5C' : 'rgba(255,255,255,0.2)',
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
              <TouchableOpacity
                onPress={() => setShowNewGroup(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#888' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitNewGroup}
                disabled={creatingGroup}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FF3B5C', alignItems: 'center' }}
              >
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
