import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function BusinessSetupScreen() {
  const { colours } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [venueName, setVenueName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !venueName.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (!user) {
      setError('You must be signed in.');
      return;
    }
    setLoading(true);
    try {
      // Find matching active subscription by email
      const { data: sub } = await supabase
        .from('business_subscriptions')
        .select('id, venue_id, plan')
        .eq('business_email', email.trim().toLowerCase())
        .eq('status', 'active')
        .maybeSingle();

      if (!sub) {
        setError('No active subscription found for this email. Sign up at affiche.app/business');
        setLoading(false);
        return;
      }

      // Verify venue name matches
      const { data: venue } = await supabase
        .from('venues')
        .select('id, name')
        .ilike('name', `%${venueName.trim()}%`)
        .eq('id', sub.venue_id)
        .maybeSingle();

      const venueId = venue?.id ?? sub.venue_id;

      // Update profile with business info
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          is_business: true,
          business_email: email.trim().toLowerCase(),
          venue_id: venueId,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      router.replace('/business-dashboard' as any);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colours.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color={colours.text} />
        </TouchableOpacity>

        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colours.text, marginBottom: 6 }}>Business Setup</Text>
          <Text style={{ fontSize: 14, color: colours.muted, lineHeight: 20 }}>
            Link your affiche business subscription to your account to access the venue dashboard.
          </Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Business Email
        </Text>
        <TextInput
          style={{
            backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
            color: colours.text, marginBottom: 16,
          }}
          placeholder="email@yourvenue.com"
          placeholderTextColor={colours.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Venue Name
        </Text>
        <TextInput
          style={{
            backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
            color: colours.text, marginBottom: 24,
          }}
          placeholder="Your venue name"
          placeholderTextColor={colours.muted}
          value={venueName}
          onChangeText={setVenueName}
          autoCorrect={false}
        />

        {!!error && (
          <View style={{ backgroundColor: '#cc3b2a15', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#cc3b2a30' }}>
            <Text style={{ fontSize: 14, color: '#cc3b2a', lineHeight: 20 }}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={{
            backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16,
            alignItems: 'center', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Connect Account</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
