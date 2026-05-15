import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Share, Clipboard, Modal, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import AroundOttawaSection from '../../components/MyBoard/AroundOttawaSection';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [downTonight, setDownTonight] = useState(false);
  const [friendsDown, setFriendsDown] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !friends.length) return;
    const friendIds = friends.map((f: any) => f.id);
    supabase
      .from('city_board_down_tonight')
      .select('user_id, profiles(username, display_name, avatar_url)')
      .in('user_id', friendIds)
      .gt('expires_at', new Date().toISOString())
      .then(({ data }) => setFriendsDown(data || []));
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

  const loadFriendsData = async () => {
    setLoading(true);
    const [friendsData] = await Promise.all([loadFriends(), loadPendingRequests(), loadConversations()]);
    await loadFriendsPlans();
    setLoading(false);
  };

  const loadFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select(`
        id, status,
        requester:profiles!friendships_requester_id_fkey(id, username, display_name, campus),
        addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, campus)
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

    if (data) setConversations(data.map(d => d.conversation).filter(Boolean));
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, campus')
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

  const handleShareInvite = async () => {
    await Share.share({
      message: `Hey! I'm using RouteO to coordinate nights out in Ottawa. Add me @${profile?.username} and we can plan where to go together 🚌\n\nDownload: https://routeo.app/invite/${profile?.username}`,
      url: `https://routeo.app/invite/${profile?.username}`,
    });
  };

  const handleInviteLink = async () => {
    const link = `https://routeo.app/invite/${profile?.username}`;
    Clipboard.setString(link);
    Alert.alert('Link copied!', `Share routeo.app/invite/${profile?.username} with your friends - when they sign up, you'll be connected automatically.`);
  };

  const createGroup = () => setShowNewGroup(true);

  const submitNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ name: newGroupName.trim(), created_by: user!.id })
      .select()
      .single();
    if (conv) {
      await supabase.from('conversation_members').insert({ conversation_id: conv.id, user_id: user!.id });
      setNewGroupName('');
      setShowNewGroup(false);
      loadConversations();
    }
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
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text }}>Friends</Text>
          <TouchableOpacity onPress={createGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40' }}>
            <Ionicons name="add" size={16} color={colours.accent} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>New Group</Text>
          </TouchableOpacity>
        </View>

        {/* I'm down tonight toggle */}
        <TouchableOpacity
          onPress={async () => {
            const newVal = !downTonight;
            setDownTonight(newVal);
            if (newVal) {
              await supabase.from('city_board_down_tonight').upsert({
                user_id: user.id,
                expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
              }, { onConflict: 'user_id' });
            } else {
              await supabase.from('city_board_down_tonight').delete().eq('user_id', user.id);
            }
          }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
            borderWidth: 1.5,
            borderColor: downTonight ? '#00C07A' : colours.border,
            backgroundColor: downTonight ? '#00C07A12' : colours.surface,
            marginBottom: 12,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: downTonight ? '#00C07A20' : colours.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>{downTonight ? '🔥' : '🌙'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: downTonight ? '#00C07A' : colours.text }}>
              {downTonight ? "You're down tonight" : "I'm down tonight"}
            </Text>
            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>
              {downTonight ? 'Your friends can see you\'re available' : 'Let friends know you\'re free'}
            </Text>
          </View>
          <Ionicons name={downTonight ? 'toggle' : 'toggle-outline'} size={28} color={downTonight ? '#00C07A' : colours.muted} />
        </TouchableOpacity>
        {friendsDown.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row' }}>
              {friendsDown.slice(0, 4).map((f: any, i: number) => (
                <View key={f.user_id} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -8 : 0, borderWidth: 2, borderColor: colours.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>
                    {(f.profiles?.display_name || f.profiles?.username || '?')[0].toUpperCase()}
                  </Text>
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
        {/* Friend discovery methods */}
        <View style={{ gap: 10 }}>
          {/* Search by username */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
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
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
            >
              <Ionicons name="link-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colours.accent }}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareInvite}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
            >
              <Ionicons name="share-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colours.accent }}>Invite</Text>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 20 }}>

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
            {conversations.map(conv => (
              <TouchableOpacity key={conv.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id, name: conv.name } } as any)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name="people" size={20} color="#7b5ea7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{conv.name}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>Tap to open chat</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            ))}
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
            <View style={{ padding: 32, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed' }}>
              <Text style={{ fontSize: 22, marginBottom: 8 }}>👋</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 4 }}>No friends yet</Text>
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>Search for friends by username above</Text>
            </View>
          ) : (
            friends.map(friend => (
              <View key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colours.accent }}>{friend.username?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{friend.display_name || friend.username}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted }}>@{friend.username}</Text>
                  {friend.campus && <Text style={{ fontSize: 11, color: colours.accent, marginTop: 2 }}>{friend.campus}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </View>
            ))
          )}
        </View>

        {/* The Wall - filtered by friends */}
        <View style={{ marginTop: 24, marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            THE WALL
          </Text>
          <AroundOttawaSection
            colours={colours}
            t={t}
            cardShadow={{}}
            language={language}
          />
        </View>

        {/* Invite friends */}
        <View style={{ marginTop: 8, padding: 20, borderRadius: 16, backgroundColor: colours.accent + '12', borderWidth: 1, borderColor: colours.accent + '30' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colours.text, marginBottom: 4 }}>
            Invite your friends
          </Text>
          <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16, lineHeight: 18 }}>
            RouteO is better with friends. Share your invite link and coordinate nights out together.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={handleInviteLink}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
            >
              <Ionicons name="link-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.accent }}>Copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareInvite}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: colours.accent }}
            >
              <Ionicons name="share-outline" size={16} color="white" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      <Modal visible={showNewGroup} transparent animationType="fade" onRequestClose={() => setShowNewGroup(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: colours.surface, borderRadius: 20, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 16 }}>New Group</Text>
            <TextInput
              style={{ backgroundColor: colours.bg, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text, marginBottom: 16 }}
              placeholder="Group name..."
              placeholderTextColor={colours.muted}
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowNewGroup(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colours.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitNewGroup} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
