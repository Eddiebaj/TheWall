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
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const TAGS = [
  { key: 'Concerts',     emoji: '🎵', label: 'Concerts' },
  { key: 'Nightlife',    emoji: '🍸', label: 'Nightlife' },
  { key: 'Comedy',       emoji: '😂', label: 'Comedy' },
  { key: 'Art & Culture',emoji: '🎨', label: 'Art & Culture' },
  { key: 'Sports',       emoji: '🏟️', label: 'Sports' },
  { key: 'Food & Drinks',emoji: '🍔', label: 'Food & Drinks' },
  { key: 'Outdoor',      emoji: '🌿', label: 'Outdoor' },
  { key: 'Networking',   emoji: '🤝', label: 'Networking' },
] as const;

export default function PreferencesScreen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const scaleRefs = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(TAGS.map(t => [t.key, new Animated.Value(1)]))
  );

  const toggle = (key: string) => {
    const scale = scaleRefs.current[key];
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 8 }),
    ]).start();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleContinue = async () => {
    setSaving(true);
    if (user && selected.size > 0) {
      await supabase
        .from('profiles')
        .update({ interests: Array.from(selected) })
        .eq('id', user.id);
    }
    setSaving(false);
    router.replace('/(tabs)/index' as any);
  };

  const handleSkip = () => {
    router.replace('/(tabs)/index' as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Text style={styles.title}>What's your vibe?</Text>
        <Text style={styles.subtitle}>Pick what you're into -- your feed will match</Text>

        <View style={styles.grid}>
          {TAGS.map(tag => {
            const isSelected = selected.has(tag.key);
            return (
              <Animated.View key={tag.key} style={{ transform: [{ scale: scaleRefs.current[tag.key] }] }}>
                <TouchableOpacity
                  style={[styles.pill, isSelected && styles.pillSelected]}
                  onPress={() => toggle(tag.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pillEmoji}>{tag.emoji}</Text>
                  <Text style={[styles.pillLabel, isSelected && styles.pillLabelSelected]}>
                    {tag.label}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  pillEmoji: {
    fontSize: 22,
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
