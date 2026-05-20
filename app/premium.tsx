import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { STRIPE_LINKS } from '../lib/stripeLinks';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';

const FEATURES = [
  { icon: 'map-outline', title: 'Offline Maps', desc: 'Access maps without internet' },
  { icon: 'analytics-outline', title: 'Commute Insights', desc: 'Track your commute patterns' },
  { icon: 'git-branch-outline', title: 'Multi-stop Planner', desc: 'Plan trips with multiple stops' },
  { icon: 'notifications-outline', title: 'Advanced Notifications', desc: 'Custom alerts and reminders' },
  { icon: 'color-palette-outline', title: 'Custom Themes', desc: 'Personalize your The Wall' },
  { icon: 'time-outline', title: 'Extended Schedule', desc: 'See arrivals up to 2 hours ahead' },
  { icon: 'ticket-outline', title: 'Early Access Deals', desc: 'See deals before everyone else' },
  { icon: 'mic-outline', title: 'AI Trip Assistant', desc: 'Voice-powered trip planning' },
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
            The Wall Premium
          </Text>
          <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', lineHeight: 22 }}>
            The full Toronto experience - offline maps, AI assistant, commute insights and more.
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

      {/* Pricing CTAs */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colours.bg, borderTopWidth: 1, borderTopColor: colours.border, padding: 20, paddingBottom: insets.bottom + 16, gap: 10 }}>
        <TouchableOpacity onPress={() => Linking.openURL(STRIPE_LINKS.premium_annual)} style={{ backgroundColor: '#e8a020', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: 'white' }}>$19.99 / year</Text>
          <Text style={{ fontSize: 12, color: 'white', opacity: 0.8, marginTop: 2 }}>Best value - save 44%</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(STRIPE_LINKS.premium_monthly)} style={{ backgroundColor: colours.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colours.border }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>$2.99 / month</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: colours.muted }}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
