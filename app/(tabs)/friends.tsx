import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Share, Clipboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function FriendsScreen() {
  const { colours } = useApp();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadFriendsData();
  }, [user]);

  const loadFriendsData = async () => {
    setLoading(true);
    await Promise.all([loadFriends(), loadPendingRequests(), loadConversations()]);
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

  const handleInviteLink = async () => {
    const link = `https://routeo.app/add/${profile?.username}`;
    Clipboard.setString(link);
    Alert.alert('Link copied!', `Share routeo.app/add/${profile?.username} with your friends.`);
  };

  const handleShareInvite = async () => {
    await Share.share({
      message: `Join me on RouteO — the Ottawa transit app. Add me: routeo.app/add/${profile?.username}`,
      url: `https://routeo.app/add/${profile?.username}`,
    });
  };

  const createGroup = async () => {
    if (friends.length === 0) {
      Alert.alert('Add friends first', 'Add some friends before creating a group.');
      return;
    }
    Alert.prompt('New Group', 'Group name:', async (name) => {
      if (!name?.trim()) return;
      const { data: conv } = await supabase
        .from('conversations')
        .insert({ name: name.trim(), created_by: user!.id })
        .select()
        .single();
      if (conv) {
        await supabase.from('conversation_members').insert({ conversation_id: conv.id, user_id: user!.id });
        loadConversations();
      }
    });
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
              <TouchableOpacity key={conv.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 8 }}>
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

      </ScrollView>
    </View>
  );
}
