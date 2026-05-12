/**
 * RsvpButton — "I'm Going" toggle for event cards.
 *
 * Free users: see the button, can toggle RSVP, see total count.
 * Premium users: additionally tap "See who's going" to open an attendee list.
 *
 * Uses anonymous device ID (SK_DEVICE_ID) as the user identifier.
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { PREMIUM_ENABLED } from '../lib/flags';
import { useIsPremium } from '../lib/premium';
import { supabase } from '../lib/supabase';
import { SK_DEVICE_ID } from '../lib/storageKeys';
import PaywallSheet from './PaywallSheet';

type Props = {
  eventId: string;
  eventSource: 'ticketmaster' | 'eventbrite' | 'happyhour';
  onGoing?: (eventId: string) => void;
};

type Attendee = { user_id: string; created_at: string };

function anonLabel(userId: string): string {
  // Deterministic short display name from device ID suffix
  const suffix = userId.slice(-4).toUpperCase();
  return `Rider ${suffix}`;
}

export default function RsvpButton({ eventId, eventSource, onGoing }: Props) {
  const { colours, fonts, t } = useApp();
  const isPremium = useIsPremium();
  const insets = useSafeAreaInsets();

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [showAttendees, setShowAttendees] = useState(false);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Load device ID and initial RSVP state
  useEffect(() => {
    AsyncStorage.getItem(SK_DEVICE_ID).then(id => {
      const uid = id ?? '';
      setDeviceId(uid);

      // Fetch count and whether this device has RSVPed
      Promise.resolve(
        supabase
          .from('event_rsvps')
          .select('user_id', { count: 'exact' })
          .eq('event_id', eventId)
      ).then(({ data, count: c }) => {
        setCount(c ?? 0);
        setGoing((data ?? []).some((r: any) => r.user_id === uid));
        setLoading(false);
      }).catch(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [eventId]);

  const toggle = async () => {
    if (!deviceId || toggling) return;
    setToggling(true);
    try {
      if (going) {
        await supabase
          .from('event_rsvps')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', deviceId);
        setGoing(false);
        setCount(prev => Math.max(0, prev - 1));
      } else {
        await supabase
          .from('event_rsvps')
          .insert({ event_id: eventId, event_source: eventSource, user_id: deviceId });
        setGoing(true);
        setCount(prev => prev + 1);
        onGoing?.(eventId);
      }
    } catch (e) {
      if (__DEV__) console.warn('[RsvpButton] toggle error:', e);
    }
    setToggling(false);
  };

  const openAttendees = async () => {
    if (PREMIUM_ENABLED && !isPremium) { setPaywallVisible(true); return; }
    setAttendeesLoading(true);
    setShowAttendees(true);
    try {
      const { data } = await supabase
        .from('event_rsvps')
        .select('user_id, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
        .limit(50);
      setAttendees(data ?? []);
    } catch {}
    setAttendeesLoading(false);
  };

  if (loading) {
    return (
      <View style={{ paddingHorizontal: 10, paddingBottom: 10, alignItems: 'flex-start' }}>
        <ActivityIndicator size="small" color={colours.muted} />
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 10, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {/* I'm Going toggle */}
      <TouchableOpacity
        onPress={toggle}
        disabled={toggling}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={going ? t("I'm Going", "J'y vais") : t("I'm Going", "J'y vais")}
        accessibilityState={{ checked: going }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: going ? colours.accent : colours.bg,
          borderRadius: 8, borderWidth: 1,
          borderColor: going ? colours.accent : colours.border,
          paddingHorizontal: 10, paddingVertical: 5,
        }}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={going ? '#fff' : colours.accent} />
        ) : (
          <Ionicons
            name={going ? 'checkmark-circle' : 'add-circle-outline'}
            size={14}
            color={going ? '#fff' : colours.accent}
          />
        )}
        <Text style={{ fontSize: 11, fontWeight: '700', color: going ? '#fff' : colours.accent }}>
          {going ? t("I'm Going", "J'y vais") : t("I'm Going", "J'y vais")}
        </Text>
      </TouchableOpacity>

      {/* Attendee count + "See who's going" */}
      {count > 0 && (
        <TouchableOpacity
          onPress={openAttendees}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t("See who's going", "Voir qui y va")}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="people-outline" size={13} color={colours.muted} />
          <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600' }}>
            {count}
            {PREMIUM_ENABLED && !isPremium && (
              <Text> <Ionicons name="lock-closed" size={9} color={colours.muted} /></Text>
            )}
          </Text>
        </TouchableOpacity>
      )}

      {/* Attendee list modal (premium) */}
      <Modal
        visible={showAttendees}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttendees(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: colours.surface,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 12, maxHeight: '60%',
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 12, marginBottom: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                {t("Who's Going", "Qui y va")} ({count})
              </Text>
              <TouchableOpacity onPress={() => setShowAttendees(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={colours.muted} />
              </TouchableOpacity>
            </View>

            {attendeesLoading ? (
              <ActivityIndicator color={colours.accent} style={{ paddingVertical: 24 }} />
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {attendees.map((a, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {/* Anonymous avatar */}
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: colours.accent + '20',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>
                        {a.user_id.slice(-2).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }}>
                        {anonLabel(a.user_id)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colours.muted }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    {a.user_id === deviceId && (
                      <View style={{
                        backgroundColor: colours.accent + '18',
                        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 'auto',
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>
                          {t('You', 'Vous')}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
                {attendees.length === 0 && (
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', paddingVertical: 20 }}>
                    {t('No attendees yet', 'Aucun participant pour l\'instant')}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureHint={t("See who's going to events — Premium only", "Voir qui participe aux evenements — Premium uniquement")}
      />
    </View>
  );
}
