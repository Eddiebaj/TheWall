/**
 * Placeholder screen for the center tab button.
 * The tab button in _layout.tsx routes organizers directly to /create-event.
 * Non-organizers land here and see the "Become an Organizer" prompt.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';

export default function CreateScreen() {
  const { colours } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      flex: 1,
      backgroundColor: colours.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingBottom: insets.bottom,
    }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: colours.accent + '18',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <Ionicons name="calendar-outline" size={36} color={colours.accent} />
      </View>

      <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 10 }}>
        Post events in Toronto
      </Text>
      <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
        Organizer accounts can list events, manage RSVPs, and reach Toronto's nightlife audience.
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/business/signup' as any)}
        style={{
          width: '100%',
          backgroundColor: colours.accent,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          marginBottom: 12,
        }}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Become an Organizer</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/index' as any)}
        style={{ paddingVertical: 12 }}
        activeOpacity={0.7}
      >
        <Text style={{ color: colours.muted, fontSize: 14, fontWeight: '600' }}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}
