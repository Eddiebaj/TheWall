import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

function useFriendsBadge(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const { data: requests } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      const pendingCount = (requests as any)?.length ?? 0;

      const { data: convs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      let unreadCount = 0;
      if (convs?.length) {
        const convIds = convs.map((c: any) => c.conversation_id);
        const { data: msgs } = await supabase
          .from('messages')
          .select('id')
          .in('conversation_id', convIds)
          .neq('sender_id', userId);

        if (msgs?.length) {
          const msgIds = msgs.map((m: any) => m.id);
          const { data: reads } = await supabase
            .from('message_reads')
            .select('message_id')
            .eq('user_id', userId)
            .in('message_id', msgIds);

          const readSet = new Set((reads || []).map((r: any) => r.message_id));
          unreadCount = msgs.filter((m: any) => !readSet.has(m.id)).length;
        }
      }

      setCount(pendingCount + unreadCount);
    };

    load();
  }, [userId]);

  return count;
}

function TabLayout() {
  const { colours } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const friendsBadge = useFriendsBadge(user?.id);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0C0E12',
          borderTopColor: '#1E2230',
          borderTopWidth: 0.5,
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#FF3B5C',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 1,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'play-circle' : 'play-circle-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          href: null,
          tabBarLabel: '',
          tabBarButton: () => (
            <TouchableOpacity
              onPress={() => router.push('/create-event' as any)}
              activeOpacity={0.85}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: insets.bottom > 0 ? 0 : 4,
              }}
            >
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#FF3B5C',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#FF3B5C',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 6,
              }}>
                <Ionicons name="add" size={26} color="#fff" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          tabBarLabel: 'Friends',
          tabBarBadge: friendsBadge > 0 ? (friendsBadge > 99 ? '99+' : friendsBadge) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF3B5C', fontSize: 10, minWidth: 16, height: 16 },
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="account" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TabLayout />
    </GestureHandlerRootView>
  );
}
