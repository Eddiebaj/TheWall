import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { routeForNotification, NotificationType } from '../lib/notificationTypes';

const BG = '#0a0a0a';
const SURFACE = '#161A22';
const BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#FF3B5C';
const MUTED = 'rgba(255,255,255,0.4)';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read_at: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function iconForType(type: string): string {
  switch (type) {
    case 'friend_going': return 'people-outline';
    case 'friend_request': return 'person-add-outline';
    case 'friend_accepted': return 'checkmark-circle-outline';
    case 'event_reminder': return 'alarm-outline';
    case 'message':
    case 'new_message': return 'chatbubble-outline';
    case 'activity': return 'pulse-outline';
    default: return 'notifications-outline';
  }
}

export default function NotificationsScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
  };

  const handlePress = (item: Notification) => {
    const route = routeForNotification(item.type as NotificationType, item.data);
    if (route) router.push(route as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: BORDER,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={ACCENT} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }}>Notifications</Text>
      </View>

      {!authLoading && !user ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <Ionicons name="lock-closed-outline" size={48} color={MUTED} />
          <Text style={{ fontSize: 16, color: MUTED, textAlign: 'center' }}>Sign in to see notifications</Text>
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <Ionicons name="notifications-off-outline" size={48} color={MUTED} />
          <Text style={{ fontSize: 16, color: MUTED, textAlign: 'center' }}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handlePress(item)}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 0.5,
                borderBottomColor: BORDER,
                backgroundColor: item.read_at ? 'transparent' : 'rgba(255,59,92,0.05)',
              }}
            >
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Ionicons name={iconForType(item.type) as any} size={20} color={item.read_at ? MUTED : ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: item.read_at ? 'rgba(255,255,255,0.7)' : '#fff', marginBottom: 2 }}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }}>{item.body}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{timeAgo(item.created_at)}</Text>
              </View>
              {!item.read_at && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, marginTop: 6, flexShrink: 0 }} />
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
