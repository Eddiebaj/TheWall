import React, { useState } from 'react';
import {
  ActivityIndicator,
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

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size === 0 || !user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ interests: Array.from(selected) })
      .eq('id', user.id);
    setSaving(false);
    router.replace('/(tabs)/index' as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>We'll personalize your feed</Text>

        <View style={styles.grid}>
          {TAGS.map(tag => {
            const isSelected = selected.has(tag.key);
            return (
              <TouchableOpacity
                key={tag.key}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => toggle(tag.key)}
                activeOpacity={0.8}
              >
                <Text style={styles.cardEmoji}>{tag.emoji}</Text>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, selected.size === 0 && styles.continueBtnDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={selected.size === 0 || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueBtnText}>Continue</Text>
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
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 60,
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 48,
  },
  card: {
    width: '47%',
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  cardSelected: {
    borderColor: '#FF3B5C',
    backgroundColor: 'rgba(255,59,92,0.12)',
  },
  cardEmoji: {
    fontSize: 30,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardLabelSelected: {
    color: '#FF3B5C',
  },
  continueBtn: {
    backgroundColor: '#FF3B5C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
