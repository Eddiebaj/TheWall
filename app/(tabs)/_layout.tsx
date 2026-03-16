import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useApp } from '../../context/AppContext';

function TabLayout() {
  const { colours } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colours.surface,
          borderTopColor: colours.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarActiveTintColor: colours.accent,
        tabBarInactiveTintColor: colours.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'bus' : 'bus-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'location' : 'location-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarLabel: 'Live Map',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          tabBarLabel: 'Planner',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          tabBarLabel: 'News',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'newspaper' : 'newspaper-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} />
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