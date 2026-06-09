/**
 * Placeholder screen for the center tab button.
 * The tab button in _layout.tsx routes organizers directly to /create-event.
 * Non-organizers land here and see the "Become an Organizer" prompt.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function CreateScreen() {
  const { colours } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [organizerRequest, setOrganizerRequest] = useState<
    { id: string; status: string; reviewed_at: string | null } | null | undefined
  >(undefined);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('organizer_requests')
      .select('id, status, reviewed_at')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOrganizerRequest(data ?? null));
  }, [user?.id]);

  const isPending = organizerRequest?.status === 'pending';
  const cooldownMs = 24 * 60 * 60 * 1000;
  const msSinceReview = organizerRequest?.reviewed_at
    ? Date.now() - new Date(organizerRequest.reviewed_at).getTime()
    : Infinity;
  const isRejectedCoolingDown = organizerRequest?.status === 'rejected' && msSinceReview < cooldownMs;
  const hoursRemaining = isRejectedCoolingDown
    ? Math.ceil((cooldownMs - msSinceReview) / (60 * 60 * 1000))
    : 0;

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

      {organizerRequest === undefined ? (
        <TouchableOpacity
          disabled
          style={{ width: '100%', backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: 0.5 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Loading...</Text>
        </TouchableOpacity>
      ) : isPending ? (
        <TouchableOpacity
          disabled
          style={{ width: '100%', backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: 0.6 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Request pending — under review</Text>
        </TouchableOpacity>
      ) : isRejectedCoolingDown ? (
        <TouchableOpacity
          disabled
          style={{ width: '100%', backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: 0.6 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Request denied — try again in {hoursRemaining}h</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            onPress={async () => {
              const { error } = await supabase
                .from('organizer_requests')
                .insert({ user_id: user!.id, status: 'pending' });
              if (error) {
                Alert.alert('Already submitted', 'You already have a request in review.');
              } else {
                setOrganizerRequest({ id: '', status: 'pending', reviewed_at: null });
                Alert.alert('Request submitted!', "We'll review your organizer access request within 48 hours.");
              }
            }}
            style={{ width: '100%', backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
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
        </>
      )}
    </View>
  );
}
