import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';

const TEAL = '#00A78D';

const UNLOCKED_EN = [
  'AI Trip Assistant',
  'Leave Now Alerts',
  'Weekly Commute Insights',
  'Offline Schedules',
  'Custom Themes',
  'CO2 Tracker',
];

const UNLOCKED_FR = [
  'Assistant IA de trajet',
  'Alertes de depart',
  'Statistiques hebdomadaires',
  'Horaires hors ligne',
  'Themes personnalises',
  'Suivi CO2',
];

export default function PremiumSuccessScreen() {
  const { colours, fonts, t } = useApp();
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const items = t('en', 'fr') === 'fr' ? UNLOCKED_FR : UNLOCKED_EN;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      {/* Animated checkmark */}
      <Animated.View style={{
        transform: [{ scale: scaleAnim }],
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: TEAL + '18', borderWidth: 2, borderColor: TEAL,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <Ionicons name="checkmark" size={44} color={TEAL} />
      </Animated.View>

      <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 8 }}>
        {t('Welcome to RouteO+', 'Bienvenue dans RouteO+')}
      </Text>
      <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center', marginBottom: 28 }}>
        {t('You\'ve unlocked everything:', 'Vous avez tout debloque :')}
      </Text>

      {/* Unlocked features */}
      <Animated.View style={{ opacity: fadeAnim, width: '100%', gap: 10, marginBottom: 36 }}>
        {items.map((label, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-circle" size={20} color={TEAL} />
            <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{label}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Go button */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/map')}
        activeOpacity={0.85}
        style={{
          backgroundColor: TEAL, borderRadius: 14, paddingVertical: 16,
          paddingHorizontal: 48, alignItems: 'center',
        }}
        accessibilityRole="button"
        accessibilityLabel={t('Let\'s go', 'Allons-y')}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
          {t('Let\'s go', 'Allons-y')} →
        </Text>
      </TouchableOpacity>
    </View>
  );
}
