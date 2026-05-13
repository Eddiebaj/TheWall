import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, BookmarkSimple, User } from 'phosphor-react-native';
import { useApp } from '../../context/AppContext';

function TabLayout() {
  const { colours, language } = useApp();
  const insets = useSafeAreaInsets();
  const fr = language === 'fr';

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
        name="map"
        options={{
          tabBarLabel: fr ? 'Carte' : 'Live Map',
          tabBarIcon: ({ focused, color }) => (
            <MapPin size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: fr ? 'Mon tableau' : 'My Board',
          tabBarIcon: ({ focused, color }) => (
            <BookmarkSimple size={22} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
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
      <Tabs.Screen name="planner" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
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