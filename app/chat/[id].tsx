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
import { sendNotification } from '../../lib/notificationHelpers';

// Debounce message notifications: track last notified timestamp per conversation
const lastMessageNotifiedAt: Map<string, number> = new Map();

function getMidpoint(locs: { lat: number, lng: number }[]) {
  if (locs.length === 0) return { lat: 45.4215, lng: -75.6972 };
  const lat = locs.reduce((s, l) => s + l.lat, 0) / locs.length;
  const lng = locs.reduce((s, l) => s + l.lng, 0) / locs.length;
  return { lat, lng };
}

function LocationShareCard({ item, messages, colours }: { item: any; messages: any[]; colours: any }) {
  const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
  const isMe = item.sender?.id === item._myId;
  const expiresAt = meta?.expires_at ? new Date(meta.expires_at) : null;
  const isActive = expiresAt ? expiresAt > new Date() : false;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      {!isMe && <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 4 }}>{item.sender?.display_name || item.sender?.username}</Text>}
      <View style={{ width: 220, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: isActive ? '#00A78D40' : colours.border, overflow: 'hidden' }}>
        <View style={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isActive ? '#00A78D' : colours.muted }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>
              {isActive ? 'Sharing live location' : 'Location expired'}
            </Text>
          </View>
          {isActive && (
            <Text style={{ fontSize: 11, color: colours.muted, marginBottom: 10 }}>
              Active for {minsLeft}min
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function EventShareCard({ item, user, profile, colours }: { item: any; user: any; profile: any; colours: any }) {
  const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
  const router = useRouter();
  const isMe = item.sender?.id === user?.id;
  const [rsvp, setRsvp] = useState<string | null>(null);
  const [hangoutId, setHangoutId] = useState<string | null>(null);
  const [rsvpCounts, setRsvpCounts] = useState<{
    going: {name: string, avatar?: string, eta?: number}[],
    interested: {name: string, avatar?: string}[],
    declined: {name: string, avatar?: string}[]
  }>({going:[], interested:[], declined:[]});

  const loadRsvps = async (hid: string) => {
    if (__DEV__) console.log('[RSVP] loadRsvps called with hid:', hid);
    const { data, error } = await supabase
      .from('hangout_rsvps')
      .select('status, eta_minutes, profiles(username, display_name, avatar_url)')
      .eq('hangout_id', hid);
    if (__DEV__) console.log('[RSVP] counts data:', JSON.stringify(data), 'error:', error?.message);
    if (!data) return;
    const counts = { going: [] as {name: string, avatar?: string, eta?: number}[], interested: [] as {name: string, avatar?: string}[], declined: [] as {name: string, avatar?: string}[] };
    data.forEach(r => {
      const name = (r.profiles as any)?.display_name || (r.profiles as any)?.username || '?';
      const avatar = (r.profiles as any)?.avatar_url;
      if (r.status === 'going') counts.going.push({name, avatar, eta: r.eta_minutes ?? undefined});
      else if (r.status === 'interested') counts.interested.push({name, avatar});
      else if (r.status === 'declined') counts.declined.push({name, avatar});
    });
    counts.going.sort((a, b) => a.name.localeCompare(b.name));
    counts.interested.sort((a, b) => a.name.localeCompare(b.name));
    counts.declined.sort((a, b) => a.name.localeCompare(b.name));
    setRsvpCounts(counts);
  };

  useEffect(() => {
    if (__DEV__) console.log('[RSVP] mount, meta.name:', meta?.name);
    if (!meta?.name) return;
    supabase
      .from('hangouts')
      .select('id')
      .eq('event_name', meta.name)
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (__DEV__) console.log('[RSVP] hangout lookup:', data?.id, 'error:', error?.message);
        if (data?.id) {
          setHangoutId(data.id);
          loadRsvps(data.id);
        }
      });
  }, []);

  const handleRsvp = async (status: string) => {
    if (__DEV__) console.log('[RSVP] handleRsvp called:', status, 'hangoutId:', hangoutId);
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
    if (__DEV__) console.log('[RSVP] upsert error:', rsvpError?.message);
    loadRsvps(hid);

    // Calculate and store ETA
    try {
      const Location = await import('expo-location');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { lat, lng } = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      const geocodeResp = await fetch(`https://routeo-backend.vercel.app/api/places?action=geocode&input=${encodeURIComponent(meta.venue || meta.name)}`);
      const geocodeData = await geocodeResp.json();
      const venueLat = geocodeData?.lat;
      const venueLng = geocodeData?.lng;

      if (venueLat && venueLng) {
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 5);
        const dateStr = now.toISOString().slice(0, 10);
        const planResp = await fetch(`https://routeo-backend.vercel.app/api/plan?fromLat=${lat}&fromLng=${lng}&fromLabel=My+Location&toLat=${venueLat}&toLng=${venueLng}&toLabel=${encodeURIComponent(meta.venue || meta.name)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=transit`);
        const planData = await planResp.json();
        const firstItinerary = planData?.plan?.itineraries?.[0];
        if (firstItinerary) {
          const etaMinutes = Math.round(firstItinerary.duration / 60);
          await supabase.from('hangout_rsvps')
            .update({ eta_minutes: etaMinutes })
            .eq('hangout_id', hid)
            .eq('user_id', user.id);
        }
      }
    } catch (e) {
      // ETA calculation is best-effort, don't block the RSVP
    }

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
                    {rsvpCounts.going.map(r => r.eta ? `${r.name} ${r.eta}min` : r.name).join(' · ')} going
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
            onPress={() => {
              const encoded = encodeURIComponent(meta.venue);
              const { Linking } = require('react-native');
              Linking.openURL(`maps://?q=${encoded}`).catch(() =>
                Linking.openURL(`https://maps.apple.com/?q=${encoded}`)
              );
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: colours.accent }}
          >
            <Ionicons name="navigate" size={14} color="white" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Get directions</Text>
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
  const [groupName, setGroupName] = useState((name as string) || 'Group Chat');
  const [members, setMembers] = useState<any[]>([]);
  const [reactionTarget, setReactionTarget] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<{id: string, content: string, senderName: string} | null>(null);
  const [lastReadBy, setLastReadBy] = useState<string[]>([]);

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
          setMessages(prev => {
            const updated = [...prev, fullMsg];
            loadReadReceipts(updated);
            return updated;
          });
          markMessagesRead([fullMsg.id]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const markMessagesRead = async (messageIds: string[]) => {
    if (!user || !messageIds.length) return;
    const rows = messageIds.map(id => ({ message_id: id, user_id: user.id }));
    await supabase.from('message_reads').upsert(rows, { onConflict: 'message_id,user_id' });
  };

  const loadReadReceipts = async (msgs: any[]) => {
    const myLastMsg = [...msgs].reverse().find(m => m.sender?.id === user?.id);
    if (!myLastMsg) return;
    const { data } = await supabase
      .from('message_reads')
      .select('profiles(display_name, username)')
      .eq('message_id', myLastMsg.id)
      .neq('user_id', user!.id);
    if (data) setLastReadBy(data.map((r: any) => r.profiles?.display_name || r.profiles?.username).filter(Boolean));
  };

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
    if (data) {
      setMessages(data);
      markMessagesRead(data.map((m: any) => m.id));
      loadReadReceipts(data);
    }
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
    setReactionTarget(item);
  };

  const handleImagePick = async () => {
    if (__DEV__) console.log('[Image] picker opened');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (__DEV__) console.log('[Image] permission status:', status);
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: false,
      quality: 0.8,
    });
    if (__DEV__) console.log('[Image] picker result canceled:', result.canceled, 'assets:', result.assets?.length);
    if (!result.canceled && result.assets[0]) {
      uploadAndSendImage(result.assets[0].uri);
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    if (__DEV__) console.log('[Image] uploading uri:', uri);
    if (!user) { if (__DEV__) console.log('[Image] no user'); return; }
    const fileExt = uri.split('.').pop() || 'jpg';
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;
    const formData = new FormData();
    formData.append('file', { uri, name: `image.${fileExt}`, type: `image/${fileExt}` } as any);
    const { error } = await supabase.storage.from('chat-images').upload(filePath, formData, { upsert: false });
    if (__DEV__) console.log('[Image] upload error:', error?.message);
    if (!error) {
      const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
      if (__DEV__) console.log('[Image] public url:', data.publicUrl);
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        type: 'image',
        content: data.publicUrl,
      });
      if (__DEV__) console.log('[Image] message insert error:', msgError?.message);
    }
  };

  const sendLocation = async () => {
    if (!user) return;
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Location access is needed to share your location.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser();
      if (__DEV__) console.log('[Location] user:', authUser?.id, 'error:', userErr?.message);
      if (authUser) {
        const { error: upsertErr } = await supabase.from('user_locations').upsert({
          user_id: authUser.id,
          lat,
          lng,
          updated_at: new Date().toISOString(),
          expires_at: expiresAt,
        }, { onConflict: 'user_id' });
        if (__DEV__) console.log('[Location] upsert error:', upsertErr?.message);
      }

      await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        type: 'location_share',
        content: 'Shared live location',
        metadata: { lat, lng, expires_at: expiresAt },
      });
    } catch (e: any) {
      Alert.alert('Error', 'Could not get location.');
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
      metadata: replyTo ? { reply_to_id: replyTo.id, reply_to_content: replyTo.content, reply_to_sender: replyTo.senderName } : null,
    });
    setReplyTo(null);

    const senderName = profile?.display_name || profile?.username || 'Someone';
    const otherMembers = members.filter(m => m.id !== user.id);
    const convKey = String(id);
    const now = Date.now();
    const lastNotified = lastMessageNotifiedAt.get(convKey) ?? 0;
    if (now - lastNotified > 60000) {
      lastMessageNotifiedAt.set(convKey, now);
      const preview = content.length > 50 ? content.slice(0, 50) : content;
      for (const member of otherMembers) {
        sendNotification(
          member.id,
          'new_message',
          groupName,
          `@${senderName}: ${preview}`,
          { type: 'new_message', conversationId: convKey },
          true,
          'high'
        );
      }
    }

    setSending(false);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender?.id === user?.id;
    const isVenue = item.type === 'venue_share' || item.type === 'event_share';
    if (__DEV__) console.log('[Chat] message sender:', item.sender?.id, 'me:', user?.id, 'isMe:', isMe);

    if (isVenue && item.metadata) {
      return <EventShareCard item={item} user={user} profile={profile} colours={colours} />;
    }

    if (item.type === 'location_share' && item.metadata) {
      return <LocationShareCard item={{ ...item, _myId: user?.id }} messages={messages} colours={colours} />;
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
            {item.metadata?.reply_to_id && (
              <View style={{ backgroundColor: colours.bg, borderLeftWidth: 3, borderLeftColor: colours.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>{item.metadata.reply_to_sender}</Text>
                <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{item.metadata.reply_to_content}</Text>
              </View>
            )}
            <Text style={{ fontSize: 15, color: isMe ? 'white' : colours.text, lineHeight: 20 }}>{item.content}</Text>
          </View>
          <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>
            {isMe ? 'You' : (item.sender?.display_name || item.sender?.username)} · {new Date(item.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
          </Text>
          {isMe && item.id === messages[messages.length - 1]?.id && lastReadBy.length > 0 && (
            <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2, textAlign: 'right' }}>
              Seen by {lastReadBy.join(', ')}
            </Text>
          )}
          {item.metadata?.reactions && Object.keys(item.metadata.reactions).length > 0 && (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
              {Object.values(item.metadata.reactions as Record<string, string>).map((emoji, i) => (
                <View key={i} style={{ backgroundColor: colours.surface, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colours.border }}>
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                </View>
              ))}
            </View>
          )}
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
        <Text style={{ fontSize: 17, fontWeight: '700', color: colours.text, flex: 1 }}>{groupName}</Text>
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

      {replyTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderLeftWidth: 3, borderLeftColor: colours.accent, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, marginBottom: 4, borderRadius: 8, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>{replyTo.senderName}</Text>
            <Text style={{ fontSize: 12, color: colours.muted }} numberOfLines={1}>{replyTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={16} color={colours.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colours.border, backgroundColor: colours.bg }}>
        <TouchableOpacity
          onPress={() => {
            if (__DEV__) console.log('[Image] button tapped');
            handleImagePick();
          }}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="image-outline" size={20} color={colours.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={sendLocation}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="location-outline" size={20} color={colours.muted} />
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
            <TouchableOpacity onPress={() => {
              Alert.prompt(
                'Rename group',
                'Enter a new name',
                async (newName) => {
                  if (!newName?.trim()) return;
                  await supabase.from('conversations').update({ name: newName.trim() }).eq('id', id);
                  setGroupName(newName.trim());
                  setShowSettings(false);
                },
                'plain-text',
                groupName
              );
            }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
              <Ionicons name="pencil-outline" size={20} color={colours.accent} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Rename group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Leave group',
                  'Are you sure you want to leave this group?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Leave',
                      style: 'destructive',
                      onPress: async () => {
                        if (!user) return;
                        await supabase
                          .from('conversation_members')
                          .delete()
                          .eq('conversation_id', id)
                          .eq('user_id', user.id);
                        setShowSettings(false);
                        router.back();
                      },
                    },
                  ]
                );
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#cc3b2a' + '12', borderWidth: 1, borderColor: '#cc3b2a' + '40' }}
            >
              <Ionicons name="exit-outline" size={20} color="#cc3b2a" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#cc3b2a' }}>Leave group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {reactionTarget && (
        <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => setReactionTarget(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setReactionTarget(null)} />
          <View style={{ backgroundColor: colours.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}>
            {/* Emoji reactions */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
              {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  onPress={async () => {
                    await supabase.from('messages').update({
                      metadata: { ...(reactionTarget.metadata || {}), reactions: { ...(reactionTarget.metadata?.reactions || {}), [user?.id || '']: emoji } }
                    }).eq('id', reactionTarget.id);
                    setReactionTarget(null);
                    loadMessages();
                  }}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Actions */}
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setReplyTo({
                    id: reactionTarget.id,
                    content: reactionTarget.content || '📷 Image',
                    senderName: reactionTarget.sender?.display_name || reactionTarget.sender?.username || 'Unknown'
                  });
                  setReactionTarget(null);
                }}
                style={{ padding: 16, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', marginBottom: 8 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Reply</Text>
              </TouchableOpacity>
              {reactionTarget.sender?.id === user?.id && (
                <TouchableOpacity
                  onPress={() => { deleteMessage(reactionTarget.id); setReactionTarget(null); }}
                  style={{ padding: 16, borderRadius: 12, backgroundColor: '#cc3b2a12', borderWidth: 1, borderColor: '#cc3b2a40', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#cc3b2a' }}>Delete message</Text>
                </TouchableOpacity>
              )}
              {reactionTarget.sender?.id !== user?.id && (
                <TouchableOpacity
                  onPress={() => { Alert.alert('Reported', 'Message reported.'); setReactionTarget(null); }}
                  style={{ padding: 16, borderRadius: 12, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colours.muted }}>Report</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}
