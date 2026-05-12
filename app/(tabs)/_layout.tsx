import { useEffect, useRef } from 'react';
import { Tabs, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, BookmarkSimple, User, House } from 'phosphor-react-native';
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';

function TabLayout() {
  const { colours, language } = useApp();
  const { savedBoard, boardLoaded } = useBoard();
  const insets = useSafeAreaInsets();
  const fr = language === 'fr';

  // Redirect to My Stops tab on first mount if user has 2+ transit stops
  const redirected = useRef(false);
  useEffect(() => {
    if (!boardLoaded || redirected.current) return;
    redirected.current = true;
    const stopCount = savedBoard.filter(
      item => item.type === 'bus_stop' || item.type === 'lrt_station'
    ).length;
    if (stopCount >= 2) {
      router.replace('/(tabs)/saved');
    }
  }, [boardLoaded]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colours.surface,
          borderTopColor: colours.border,
          borderTopWidth: 0.5,
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: colours.accent,
        tabBarInactiveTintColor: colours.muted,
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
          tabBarLabel: fr ? 'Accueil' : 'Home',
          tabBarIcon: ({ focused, color }) => (
            <House size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarLabel: fr ? 'Carte' : 'Live Map',
          tabBarIcon: ({ focused, color }) => (
            <MapPin size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          tabBarLabel: fr ? 'Mes favoris' : 'My Favourites',
          tabBarIcon: ({ focused, color }) => (
            <BookmarkSimple size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarLabel: fr ? 'Compte' : 'Account',
          tabBarIcon: ({ focused, color }) => (
            <User size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen name="discover" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
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