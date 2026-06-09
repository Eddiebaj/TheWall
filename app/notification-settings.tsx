import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIF_PREFS_KEY = 'notification_prefs';

export type NotifPrefs = {
  friend_request: boolean;
  friend_accepted: boolean;
  friend_going: boolean;
  new_message: boolean;
  event_reminder: boolean;
  happy_hour: boolean;
  friend_checkin: boolean;
  plan_invite: boolean;
  plan_crew_going: boolean;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  friend_request: true,
  friend_accepted: true,
  friend_going: true,
  new_message: true,
  event_reminder: true,
  happy_hour: true,
  friend_checkin: true,
  plan_invite: true,
  plan_crew_going: true,
};

const TOGGLES: { key: keyof NotifPrefs; label: string; description: string; icon: string }[] = [
  { key: 'friend_request',  label: 'Friend Requests',  description: 'When someone sends you a friend request',   icon: 'person-add-outline' },
  { key: 'friend_accepted', label: 'Friend Accepted',  description: 'When someone accepts your request',         icon: 'checkmark-circle-outline' },
  { key: 'friend_going',    label: 'Friend Activity',  description: 'When a friend RSVPs to an event',            icon: 'people-outline' },
  { key: 'new_message',     label: 'Messages',         description: 'When you receive a new message',             icon: 'chatbubble-outline' },
  { key: 'event_reminder',  label: 'Event Reminders',  description: "Reminders before events you're attending",   icon: 'alarm-outline' },
  { key: 'happy_hour',      label: 'Happy Hour Alerts',description: 'Nearby happy hour deals',                    icon: 'wine-outline' },
  { key: 'friend_checkin',  label: 'Check-in Alerts',  description: 'When a friend checks in nearby',             icon: 'location-outline' },
  { key: 'plan_invite',     label: 'Plan Invites',     description: 'When someone invites you to a plan',         icon: 'calendar-outline' },
  { key: 'plan_crew_going', label: 'Plan Updates',     description: 'When crew members respond to plans',         icon: 'people-circle-outline' },
];

const BG = '#0a0a0a';
const SURFACE = '#161A22';
const BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#FF3B5C';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREFS_KEY).then(val => {
      if (!val) return;
      try { setPrefs({ ...DEFAULT_NOTIF_PREFS, ...JSON.parse(val) }); } catch {}
    });
  }, []);

  const toggle = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: BORDER,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={ACCENT} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }}>Notification Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ marginTop: 20, marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: BORDER }}>
          {TOGGLES.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <View style={{ height: 0.5, backgroundColor: BORDER, marginLeft: 60 }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: prefs[item.key] ? 'rgba(255,59,92,0.15)' : '#1C1C1E',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 14, borderWidth: 1, borderColor: BORDER,
                }}>
                  <Ionicons name={item.icon as any} size={16} color={prefs[item.key] ? ACCENT : '#888'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: '#fff', fontWeight: '500' }}>{item.label}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{item.description}</Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={v => toggle(item.key, v)}
                  trackColor={{ false: '#2a2a2a', true: ACCENT }}
                  thumbColor="white"
                  ios_backgroundColor="#2a2a2a"
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
