import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';

const FEATURES = [
  { icon: 'notifications-outline', title: 'Early Access to Event Announcements', desc: 'Hear about events before they go public' },
  { icon: 'options-outline', title: 'Exclusive Event Filters', desc: 'Discover hidden gems, 18+ events, and free nights' },
  { icon: 'people-outline', title: 'Priority Friend Activity', desc: 'See what your friends are attending first in your feed' },
  { icon: 'bookmark-outline', title: 'Saved Events Sync', desc: 'Access your saved events on every device' },
  { icon: 'ribbon-outline', title: 'Supporter Badge', desc: 'Show your support with a badge on your profile' },
];

export default function PremiumScreen() {
  const { colours } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: 'flex-start', marginBottom: 24 }}>
            <Ionicons name="close" size={24} color={colours.muted} />
          </TouchableOpacity>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: '#e8a020' + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="star" size={36} color="#e8a020" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 8 }}>
            affiche Premium
          </Text>
          <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', lineHeight: 22 }}>
            Unlock the full affiche experience and never miss what Toronto has to offer.
          </Text>
        </View>

        {/* Features grid */}
        <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 32 }}>
          {FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#e8a020' + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={f.icon as any} size={20} color="#e8a020" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{f.title}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>{f.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#e8a020" />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Coming Soon CTA */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colours.bg, borderTopWidth: 1, borderTopColor: colours.border, padding: 20, paddingBottom: insets.bottom + 16, gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colours.muted }}>Coming Soon</Text>
        <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', lineHeight: 19 }}>
          You're getting full access during our launch period. Paid plans will be announced soon.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600' }}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
