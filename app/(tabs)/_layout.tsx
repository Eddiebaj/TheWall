import { Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { AppProvider, useApp } from '../../context/AppContext';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const { colours } = useApp();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 40, width: 72 }}>
      <Text
        numberOfLines={1}
        style={{ color: focused ? colours.accent : colours.muted, fontSize: 11, fontWeight: focused ? '700' : '500' }}
      >
        {label}
      </Text>
    </View>
  );
}

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
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }} />
      <Tabs.Screen name="nearby" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Explore" focused={focused} /> }} />
      <Tabs.Screen name="discover" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Saved" focused={focused} /> }} />
      <Tabs.Screen name="safety" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Account" focused={focused} /> }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <TabLayout />
    </AppProvider>
  );
}