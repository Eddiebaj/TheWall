import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

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

  useEffect(() => {
    if (!id) return;
    loadMessages();

    const channel = supabase
      .channel(`conversation:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
    setSending(false);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender?.id === user?.id;
    const isVenue = item.type === 'venue_share' || item.type === 'event_share';
    console.log('[Chat] message sender:', item.sender?.id, 'me:', user?.id, 'isMe:', isMe);

    if (isVenue && item.metadata) {
      const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
      return (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          {!isMe && <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 4 }}>{item.sender?.display_name || item.sender?.username}</Text>}
          <View style={{ width: 260, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.accent + '40', overflow: 'hidden' }}>
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={2}>{meta.name}</Text>
              <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }}>{meta.venue}</Text>
              <TouchableOpacity style={{ marginTop: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colours.accent, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>I'm in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 4, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
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
      </View>
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
    </KeyboardAvoidingView>
  );
}
