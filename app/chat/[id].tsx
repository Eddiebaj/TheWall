import React, { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Image, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

function EventShareCard({ item, user, colours }: { item: any; user: any; colours: any }) {
  const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
  const router = useRouter();
  const isMe = item.sender?.id === user?.id;
  const [rsvp, setRsvp] = useState<string | null>(null);
  const [hangoutId, setHangoutId] = useState<string | null>(null);
  const [rsvpCounts, setRsvpCounts] = useState<{
    going: {name: string, avatar?: string}[],
    interested: {name: string, avatar?: string}[],
    declined: {name: string, avatar?: string}[]
  }>({going:[], interested:[], declined:[]});

  const loadRsvps = async (hid: string) => {
    console.log('[RSVP] loadRsvps called with hid:', hid);
    const { data, error } = await supabase
      .from('hangout_rsvps')
      .select('status, profiles(username, display_name, avatar_url)')
      .eq('hangout_id', hid);
    console.log('[RSVP] counts data:', JSON.stringify(data), 'error:', error?.message);
    if (!data) return;
    const counts = { going: [] as {name: string, avatar?: string}[], interested: [] as {name: string, avatar?: string}[], declined: [] as {name: string, avatar?: string}[] };
    data.forEach(r => {
      const name = (r.profiles as any)?.display_name || (r.profiles as any)?.username || '?';
      const avatar = (r.profiles as any)?.avatar_url;
      if (r.status === 'going') counts.going.push({name, avatar});
      else if (r.status === 'interested') counts.interested.push({name, avatar});
      else if (r.status === 'declined') counts.declined.push({name, avatar});
    });
    counts.going.sort((a, b) => a.name.localeCompare(b.name));
    counts.interested.sort((a, b) => a.name.localeCompare(b.name));
    counts.declined.sort((a, b) => a.name.localeCompare(b.name));
    setRsvpCounts(counts);
  };

  useEffect(() => {
    console.log('[RSVP] mount, meta.name:', meta?.name);
    if (!meta?.name) return;
    supabase
      .from('hangouts')
      .select('id')
      .eq('event_name', meta.name)
      .limit(1)
      .single()
      .then(({ data, error }) => {
        console.log('[RSVP] hangout lookup:', data?.id, 'error:', error?.message);
        if (data?.id) {
          setHangoutId(data.id);
          loadRsvps(data.id);
        }
      });
  }, []);

  const handleRsvp = async (status: string) => {
    console.log('[RSVP] handleRsvp called:', status, 'hangoutId:', hangoutId);
    setRsvp(status);

    let hid = hangoutId;
    if (!hid) {
      const { data: newHangout } = await supabase
        .from('hangouts')
        .insert({ created_by: user.id, event_name: meta.name, venue_name: meta.venue || meta.name })
        .select('id')
        .single();
      if (newHangout) { hid = newHangout.id; setHangoutId(hid); }
    }

    if (!hid) return;
    const { error: rsvpError } = await supabase
      .from('hangout_rsvps')
      .upsert({ hangout_id: hid, user_id: user.id, status }, { onConflict: 'hangout_id,user_id' });
    console.log('[RSVP] upsert error:', rsvpError?.message);
    loadRsvps(hid);

    // Notify group members
    supabase.functions.invoke('notify-social', {
      body: {
        type: 'rsvp',
        payload: {
          hangout_id: hid,
          user_id: user.id,
          status,
          event_name: meta.name,
        }
      }
    });
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      {!isMe && <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 4 }}>{item.sender?.display_name || item.sender?.username}</Text>}
      <View style={{ width: 260, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.accent + '40', overflow: 'hidden' }}>
        <View style={{ padding: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={2}>{meta.name}</Text>
          <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{meta.venue}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {[
              { label: "I'm in", value: 'going', activeColor: '#00A78D' },
              { label: 'Maybe', value: 'interested', activeColor: '#e8a020' },
              { label: 'No', value: 'declined', activeColor: '#cc3b2a' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleRsvp(opt.value)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                  backgroundColor: rsvp === opt.value ? opt.activeColor : colours.bg,
                  borderWidth: 1, borderColor: rsvp === opt.value ? opt.activeColor : colours.border }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: rsvp === opt.value ? 'white' : colours.muted }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(rsvpCounts.going.length > 0 || rsvpCounts.interested.length > 0 || rsvpCounts.declined.length > 0) && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {rsvpCounts.going.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {rsvpCounts.going.slice(0, 3).map(({name, avatar}, i) => (
                      <View key={i} style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#00A78D', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -6 : 0, borderWidth: 1.5, borderColor: colours.surface, overflow: 'hidden' }}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={{ width: 22, height: 22, borderRadius: 6 }} />
                        ) : (
                          <Text style={{ fontSize: 10, fontWeight: '800', color: 'white' }}>{name[0].toUpperCase()}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#00A78D' }}>
                    {rsvpCounts.going.map(r => r.name).join(', ')} {rsvpCounts.going.length === 1 ? 'is' : 'are'} in
                  </Text>
                </View>
              )}
              {rsvpCounts.interested.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {rsvpCounts.interested.slice(0, 3).map(({name, avatar}, i) => (
                      <View key={i} style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#e8a020', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -6 : 0, borderWidth: 1.5, borderColor: colours.surface, overflow: 'hidden' }}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={{ width: 22, height: 22, borderRadius: 6 }} />
                        ) : (
                          <Text style={{ fontSize: 10, fontWeight: '800', color: 'white' }}>{name[0].toUpperCase()}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#e8a020' }}>
                    {rsvpCounts.interested.map(r => r.name).join(', ')} maybe
                  </Text>
                </View>
              )}
              {rsvpCounts.declined.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {rsvpCounts.declined.slice(0, 3).map(({name, avatar}, i) => (
                      <View key={i} style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#cc3b2a', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -6 : 0, borderWidth: 1.5, borderColor: colours.surface, overflow: 'hidden' }}>
                        {avatar ? <Image source={{ uri: avatar }} style={{ width: 22, height: 22, borderRadius: 6 }} /> : <Text style={{ fontSize: 10, fontWeight: '800', color: 'white' }}>{name[0].toUpperCase()}</Text>}
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#cc3b2a' }}>
                    {rsvpCounts.declined.map(r => r.name).join(', ')} can't make it
                  </Text>
                </View>
              )}
            </View>
          )}
        {meta.venue && (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/(tabs)/planner',
              params: { toLabel: meta.venue, toName: meta.name }
            } as any)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: colours.accent }}
          >
            <Ionicons name="navigate" size={14} color="white" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Route there</Text>
          </TouchableOpacity>
        )}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams();
  const { colours } = useApp();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const loadMembers = async () => {
    const { data } = await supabase
      .from('conversation_members')
      .select('profiles(id, username, display_name, avatar_url)')
      .eq('conversation_id', id);
    if (data) setMembers(data.map((d: any) => d.profiles).filter(Boolean));
  };

  useEffect(() => {
    if (!id) return;
    loadMessages();
    loadMembers();

    const channel = supabase
      .channel(`conversation:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, async (payload) => {
        const { data: fullMsg } = await supabase
          .from('messages')
          .select('id, content, type, metadata, created_at, sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)')
          .eq('id', payload.new.id)
          .single();
        if (fullMsg) {
          setMessages(prev => [...prev, fullMsg]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id, content, type, metadata, created_at,
        sender:profiles!messages_sender_id_fkey(id, username, display_name)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(50);
    if (data) setMessages(data);
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const reportMessage = async (_msgId: string) => {
    Alert.alert('Reported', 'This message has been reported.');
  };

  const handleLongPress = (item: any) => {
    const isMe = item.sender?.id === user?.id;
    Alert.alert('', '', [
      {
        text: isMe ? 'Delete' : 'Report',
        style: 'destructive',
        onPress: () => isMe ? deleteMessage(item.id) : reportMessage(item.id),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleImagePick = async () => {
    console.log('[Image] picker opened');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log('[Image] permission status:', status);
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: false,
      quality: 0.8,
    });
    console.log('[Image] picker result canceled:', result.canceled, 'assets:', result.assets?.length);
    if (!result.canceled && result.assets[0]) {
      uploadAndSendImage(result.assets[0].uri);
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    console.log('[Image] uploading uri:', uri);
    if (!user) { console.log('[Image] no user'); return; }
    const fileExt = uri.split('.').pop() || 'jpg';
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;
    const formData = new FormData();
    formData.append('file', { uri, name: `image.${fileExt}`, type: `image/${fileExt}` } as any);
    const { error } = await supabase.storage.from('chat-images').upload(filePath, formData, { upsert: false });
    console.log('[Image] upload error:', error?.message);
    if (!error) {
      const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      console.log('[Image] public url:', data.publicUrl);
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        type: 'image',
        content: data.publicUrl,
      });
      console.log('[Image] message insert error:', msgError?.message);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !user) return;
    setSending(true);
    const content = text.trim();
    setText('');
    await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user.id,
      content,
      type: 'text',
    });

    // Notify group members
    supabase.functions.invoke('notify-social', {
      body: {
        type: 'message',
        payload: {
          conversation_id: id,
          sender_id: user.id,
          content: content,
          event_name: null,
        }
      }
    });

    setSending(false);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender?.id === user?.id;
    const isVenue = item.type === 'venue_share' || item.type === 'event_share';
    console.log('[Chat] message sender:', item.sender?.id, 'me:', user?.id, 'isMe:', isMe);

    if (isVenue && item.metadata) {
      return <EventShareCard item={item} user={user} colours={colours} />;
    }

    if (item.type === 'image') {
      return (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          {!isMe && <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 2 }}>{item.sender?.display_name || item.sender?.username}</Text>}
          <Image source={{ uri: item.content }} style={{ width: 180, height: 180, borderRadius: 18 }} resizeMode="cover" />
          <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>{new Date(item.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity activeOpacity={1} onLongPress={() => handleLongPress(item)} style={{ paddingHorizontal: 16, paddingVertical: 4, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {/* Avatar for other users */}
        {!isMe && (
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>
              {(item.sender?.display_name || item.sender?.username || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          {!isMe && <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 2 }}>{item.sender?.display_name || item.sender?.username}</Text>}
          <View style={{ maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: isMe ? colours.accent : colours.surface, borderWidth: isMe ? 0 : 1, borderColor: colours.border }}>
            <Text style={{ fontSize: 15, color: isMe ? 'white' : colours.text, lineHeight: 20 }}>{item.content}</Text>
          </View>
          <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>
            {isMe ? 'You' : (item.sender?.display_name || item.sender?.username)} · {new Date(item.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        {/* Spacer for own messages to align right */}
        {isMe && <View style={{ width: 28 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colours.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.bottom}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colours.border, backgroundColor: colours.bg }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colours.accent} />
        </TouchableOpacity>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={18} color="#7b5ea7" />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colours.text, flex: 1 }}>{name || 'Group Chat'}</Text>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colours.muted} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colours.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: 12 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>👋</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, marginBottom: 4 }}>Start the conversation</Text>
              <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center' }}>Share where you're going tonight or just say hi</Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colours.border, backgroundColor: colours.bg }}>
        <TouchableOpacity
          onPress={() => {
            console.log('[Image] button tapped');
            handleImagePick();
          }}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="image-outline" size={20} color={colours.muted} />
        </TouchableOpacity>
        <TextInput
          style={{ flex: 1, backgroundColor: colours.surface, borderRadius: 22, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colours.text, maxHeight: 100 }}
          placeholder="Message..."
          placeholderTextColor={colours.muted}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="send"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={!text.trim() || sending}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colours.accent : colours.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="send" size={18} color="white" />
        </TouchableOpacity>
      </View>
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowSettings(false)} />
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, alignSelf: 'center', marginBottom: 20 }} />

          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Ionicons name="people" size={28} color="#7b5ea7" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text }}>{name}</Text>
            <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>{members.length} members</Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Members</Text>
          {members.map((m, i) => (
            <View key={m.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < members.length - 1 ? 1 : 0, borderBottomColor: colours.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>{(m.display_name || m.username || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text }}>{m.display_name || m.username}</Text>
                <Text style={{ fontSize: 12, color: colours.muted }}>@{m.username}</Text>
              </View>
              {m.id === user?.id && <Text style={{ fontSize: 11, color: colours.muted }}>You</Text>}
            </View>
          ))}

          <View style={{ gap: 10, marginTop: 20 }}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
              <Ionicons name="person-add-outline" size={20} color={colours.accent} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Add members</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
              <Ionicons name="pencil-outline" size={20} color={colours.accent} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Rename group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#cc3b2a' + '12', borderWidth: 1, borderColor: '#cc3b2a' + '40' }}>
              <Ionicons name="exit-outline" size={20} color="#cc3b2a" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#cc3b2a' }}>Leave group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
