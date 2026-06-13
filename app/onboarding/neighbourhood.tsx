import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { SK_ONBOARDING_COMPLETE, SK_PROFILE_SETUP_DONE } from '../../lib/storageKeys';

const NEIGHBOURHOODS = [
  'Queen West',
  'Kensington Market',
  'Distillery District',
  'King West',
  'Leslieville',
  'The Annex',
  'Yorkville',
  'Liberty Village',
  'Waterfront',
  'Bloor West Village',
  'Roncesvalles',
  'Little Italy',
  'Chinatown',
  'Danforth / Greektown',
  'Little Portugal',
  'Parkdale',
  'Junction',
  'Ossington',
  'Cabbagetown',
  'Lawrence Park',
] as const;

const finishOnboarding = async () => {
  await AsyncStorage.setItem(SK_ONBOARDING_COMPLETE, 'true');
  await AsyncStorage.setItem(SK_PROFILE_SETUP_DONE, 'true');
  router.replace('/(tabs)/index' as any);
};

export default function NeighbourhoodScreen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const scaleRefs = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(NEIGHBOURHOODS.map(n => [n, new Animated.Value(1)]))
  );

  const toggle = (name: string) => {
    const scale = scaleRefs.current[name];
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 8 }),
    ]).start();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleContinue = async () => {
    setSaving(true);
    if (user && selected.size > 0) {
      await supabase
        .from('profiles')
        .update({ neighbourhood: Array.from(selected) })
        .eq('id', user.id);
    }
    setSaving(false);
    await finishOnboarding();
  };

  const handleSkip = async () => {
    await finishOnboarding();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Text style={styles.title}>Your neighbourhood?</Text>
        <Text style={styles.subtitle}>We'll show you events closest to where you're at.</Text>

        <View style={styles.grid}>
          {NEIGHBOURHOODS.map(name => {
            const isSelected = selected.has(name);
            return (
              <Animated.View key={name} style={{ transform: [{ scale: scaleRefs.current[name] }] }}>
                <TouchableOpacity
                  style={[styles.pill, isSelected && styles.pillSelected]}
                  onPress={() => toggle(name)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillLabel, isSelected && styles.pillLabelSelected]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueBtnText}>Let's go</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  skipText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
    marginBottom: 40,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 48,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  pillSelected: {
    borderColor: '#FF3B5C',
    backgroundColor: 'rgba(255,59,92,0.14)',
  },
  pillLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    fontWeight: '700',
  },
  pillLabelSelected: {
    color: '#FF3B5C',
  },
  continueBtn: {
    backgroundColor: '#FF3B5C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
