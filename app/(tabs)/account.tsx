let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, DeviceEventEmitter, Dimensions, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView,
    StatusBar, Switch, Text, TextInput,
    TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBoard } from '../../context/BoardContext';
import { supabase } from '../../lib/supabase';
import { useAnalytics } from '../../lib/analytics';
import { registerPushToken, syncSubscriptions } from '../../lib/pushNotifications';
import { SK_NOTIF_SETTINGS, SK_DEVICE_ID } from '../../lib/storageKeys';
import { useRouter } from 'expo-router';
import { cardShadow as sharedCardShadow } from '../../lib/styles';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';
import { filterPremiumNotifSubs } from '../../lib/commuteNotifications';

type NotifSettings = {
  events: boolean;
  friends: boolean;
  reminders: boolean;
};

const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
  events: true,
  friends: true,
  reminders: true,
};

const MASTER_KEY_MAP: Record<string, (keyof NotifSettings)[]> = {};

const NOTIF_SETTINGS_KEY = SK_NOTIF_SETTINGS;

function SectionHeader({ label, icon, colours, fonts }: { label: string; icon: string; colours: any; fonts: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 12, marginBottom: 4 }}>
      <Ionicons name={icon as any} size={16} color={colours.muted} />
      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function Divider({ colours }: { colours: any }) {
  return <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;
}

function SettingsRow({ label, icon, onPress, colours, fonts, right }: {
  label: string; icon: string; onPress: () => void; colours: any; fonts: any; right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={() => { hapticLight(); onPress(); }}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon as any} size={18} color={colours.accent} />
      <Text style={{ fontSize: fonts.md, color: colours.text, flex: 1 }}>{label}</Text>
      {right || <Ionicons name="chevron-forward" size={16} color={colours.muted} />}
    </TouchableOpacity>
  );
}

const WALL_CARD_GAP = 8;
const WALL_CARD_WIDTH = (Dimensions.get('window').width - 40 - WALL_CARD_GAP) / 2;
const WALL_CARD_HEIGHT = WALL_CARD_WIDTH * 1.35;

interface WallEvent {
  rsvpId: string;
  eventId: string;
  title: string;
  poster_url: string | null;
  venue_name: string;
}

function OrganizerDashboardSection({ colours, fonts }: { colours: any; fonts: any }) {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<{ id: string; title: string; rsvp_count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data: evRows } = await supabase
        .from('venue_events')
        .select('id, title')
        .eq('creator_id', user.id)
        .eq('source', 'user')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!evRows || evRows.length === 0) { setLoading(false); return; }

      const ids = evRows.map((e: any) => e.id);
      const { data: rsvpRows } = await supabase
        .from('venue_event_rsvps')
        .select('event_id')
        .in('event_id', ids)
        .eq('status', 'going');

      const counts: Record<string, number> = {};
      for (const r of (rsvpRows ?? []) as any[]) {
        counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      }

      setEvents(evRows.map((e: any) => ({ id: e.id, title: e.title, rsvp_count: counts[e.id] ?? 0 })));
      setLoading(false);
    })();
  }, [user]);

  const totalRsvps = events.reduce((s, e) => s + e.rsvp_count, 0);

  if (loading) {
    return <ActivityIndicator size="small" color={colours.accent} style={{ margin: 16 }} />;
  }

  return (
    <View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text }}>{events.length}</Text>
          <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600', marginTop: 2 }}>EVENTS</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text }}>{totalRsvps}</Text>
          <Text style={{ fontSize: 11, color: colours.muted, fontWeight: '600', marginTop: 2 }}>TOTAL RSVPs</Text>
        </View>
      </View>
      {events.length > 0 && <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />}
      {events.map((e, i) => (
        <TouchableOpacity
          key={e.id}
          onPress={() => router.push(`/event/${e.id}` as any)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colours.border,
          }}
        >
          <Text style={{ flex: 1, fontSize: fonts.md, color: colours.text, fontWeight: '500' }} numberOfLines={1}>{e.title}</Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, fontWeight: '600', marginRight: 6 }}>{e.rsvp_count} going</Text>
          <Ionicons name="chevron-forward" size={16} color={colours.muted} />
        </TouchableOpacity>
      ))}
      {events.length === 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: fonts.sm, color: colours.muted }}>No events yet. Tap + to create one.</Text>
        </View>
      )}
    </View>
  );
}

function MyEventsSection() {
  const { colours } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<{ id: string; title: string; event_date: string | null; rsvp_count: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: evRows } = await supabase
        .from('venue_events')
        .select('id, title, event_date')
        .eq('creator_id', user.id)
        .eq('source', 'user')
        .order('event_date', { ascending: true })
        .limit(50);

      if (!evRows || evRows.length === 0) return;

      const ids = evRows.map((e: any) => e.id);
      const { data: rsvpRows } = await supabase
        .from('venue_event_rsvps')
        .select('event_id')
        .in('event_id', ids)
        .eq('status', 'going');

      const counts: Record<string, number> = {};
      for (const r of (rsvpRows ?? []) as any[]) {
        counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      }

      setEvents(evRows.map((e: any) => ({ id: e.id, title: e.title, event_date: e.event_date, rsvp_count: counts[e.id] ?? 0 })));
    })();
  }, [user]);

  if (events.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>MY EVENTS</Text>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
        {events.map((e, i) => (
          <TouchableOpacity
            key={e.id}
            onPress={() => router.push(`/event/${e.id}` as any)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colours.border,
              backgroundColor: colours.surface,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text }} numberOfLines={1}>{e.title}</Text>
              {e.event_date ? (
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                  {new Date(e.event_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: colours.muted, fontWeight: '600', marginRight: 8 }}>{e.rsvp_count} going</Text>
            <Ionicons name="chevron-forward" size={16} color={colours.muted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MyWallSection({ onCountChange }: { onCountChange: (n: number) => void }) {
  const { colours } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<WallEvent[]>([]);

  useEffect(() => {
    if (!user) { onCountChange(0); return; }
    supabase
      .from('event_rsvps')
      .select('id, event_id, events(id, title, poster_url, venues(name))')
      .eq('user_id', user.id)
      .eq('status', 'going')
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        const mapped: WallEvent[] = (data || []).map((r: any) => ({
          rsvpId: r.id,
          eventId: r.events?.id ?? r.event_id,
          title: r.events?.title ?? '',
          poster_url: r.events?.poster_url ?? null,
          venue_name: r.events?.venues?.name ?? '',
        }));
        setEvents(mapped);
        onCountChange(mapped.length);
      });
  }, [user]);

  if (events.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>MY WALL</Text>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed', padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 4 }}>Your wall starts here</Text>
          <Text style={{ fontSize: 12, color: colours.muted, textAlign: 'center', lineHeight: 18 }}>
            RSVP to events to start your collection
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>MY WALL</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: WALL_CARD_GAP }}>
        {events.map((item) => (
          <TouchableOpacity
            key={item.rsvpId}
            style={{ width: WALL_CARD_WIDTH, height: WALL_CARD_HEIGHT, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a1a' }}
            activeOpacity={0.85}
            onPress={() => router.push(`/event/${item.eventId}` as any)}
          >
            {item.poster_url ? (
              <Image source={{ uri: item.poster_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, backgroundColor: '#2a2a2a' }} />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{item.venue_name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }} numberOfLines={1}>{item.title}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const {
    theme, setTheme, resolvedTheme, colours, fonts,
    language, setLanguage, t,

    largeText, setLargeText,
    highContrast, setHighContrast,
    reducedMotion, setReducedMotion,
  } = useApp();
  const { profile, user, signOut, isAdmin, isPremium, updateProfile } = useAuth();
  const { savedBoard } = useBoard();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { capture } = useAnalytics();

  useEffect(() => {
    capture('profile_viewed');
  }, []);

  // Auth state (shown when not signed in)
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authCodeSent, setAuthCodeSent] = useState(false);
  const [authOtp, setAuthOtp] = useState('');
  const [authVerifying, setAuthVerifying] = useState(false);

  const handleSendCode = async () => {
    setAuthError('');
    if (!authEmail.trim()) {
      setAuthError('Please enter your email.');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthOtp('');
      setAuthCodeSent(true);
    }
  };

  const handleVerifyOtp = async () => {
    if (authOtp.length !== 6) return;
    setAuthVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: authEmail.trim().toLowerCase(),
      token: authOtp,
      type: 'email',
    });
    setAuthVerifying(false);
    if (error) {
      setAuthError(error.message);
    }
    // On success, onAuthStateChange in AuthContext fires and routes automatically
  };

  const isLight = resolvedTheme === 'light';
  const cardShadow = isLight ? sharedCardShadow : {};

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugScreen, setBugScreen] = useState('');
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(false);

  const [wallCount, setWallCount] = useState(0);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(() => Date.now());
  const [profileStats, setProfileStats] = useState<{ eventsAttended: number; totalPosts: number; memberSince: string | null; mostVisitedVenue: string | null } | null>(null);
  const [savedEvents, setSavedEvents] = useState<{ id: string; title: string; venue_name: string; poster_url: string | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('saved_events')
      .select('event_id, events(id, title, poster_url, venues(name))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(async ({ data }) => {
        if (!data) return;
        const resolved: { id: string; title: string; venue_name: string; poster_url: string | null }[] = [];
        const unresolvedIds: string[] = [];
        for (const r of data as any[]) {
          if (r.events) {
            resolved.push({
              id: r.events.id,
              title: r.events.title ?? '',
              venue_name: r.events.venues?.name ?? '',
              poster_url: r.events.poster_url ?? null,
            });
          } else {
            unresolvedIds.push(r.event_id);
          }
        }
        if (unresolvedIds.length > 0) {
          const { data: veData } = await supabase
            .from('venue_events')
            .select('id, title, poster_url, venues(name)')
            .in('id', unresolvedIds);
          for (const ve of (veData ?? []) as any[]) {
            resolved.push({
              id: ve.id,
              title: ve.title ?? '',
              venue_name: ve.venues?.name ?? '',
              poster_url: ve.poster_url ?? null,
            });
          }
        }
        setSavedEvents(resolved);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [rsvpResult, postsResult, profileResult, venueResult] = await Promise.all([
        supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'going'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('profiles').select('created_at').eq('id', user.id).single(),
        supabase.from('event_rsvps').select('events(venues(name))').eq('user_id', user.id).eq('status', 'going'),
      ]);

      let mostVisitedVenue: string | null = null;
      if (venueResult.data && venueResult.data.length > 0) {
        const counts: Record<string, number> = {};
        for (const row of venueResult.data as any[]) {
          const name = row.events?.venues?.name;
          if (name) counts[name] = (counts[name] ?? 0) + 1;
        }
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top) mostVisitedVenue = top[0];
      }

      setProfileStats({
        eventsAttended: rsvpResult.count ?? 0,
        totalPosts: postsResult.count ?? 0,
        memberSince: profileResult.data?.created_at ?? null,
        mostVisitedVenue,
      });
    };
    fetchStats();
  }, [user]);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editUsernameStatus, setEditUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [editUsernameError, setEditUsernameError] = useState('');
  const editUsernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);

  // Profile setup (shown for new users who have no username yet)
  const [setupDisplayName, setSetupDisplayName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needsProfileSetup = !!user && !profile?.username;

  useEffect(() => {
    if (!setupUsername || setupUsername.length < 2) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    usernameDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', setupUsername)
        .maybeSingle();
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500);
  }, [setupUsername]);

  useEffect(() => {
    if (!editUsername || editUsername === profile?.username) {
      setEditUsernameStatus('idle');
      return;
    }
    if (editUsername.length < 2) { setEditUsernameStatus('idle'); return; }
    setEditUsernameStatus('checking');
    if (editUsernameDebounceRef.current) clearTimeout(editUsernameDebounceRef.current);
    editUsernameDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', editUsername)
        .maybeSingle();
      setEditUsernameStatus(data ? 'taken' : 'available');
    }, 500);
  }, [editUsername]);

  const handleSetupProfile = async () => {
    setSetupError('');
    if (!setupUsername.trim()) { setSetupError('Username is required.'); return; }
    if (usernameStatus === 'taken') { setSetupError('That username is taken.'); return; }
    if (usernameStatus === 'checking') { setSetupError('Still checking username…'); return; }
    setSetupSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      id: user!.id,
      display_name: setupDisplayName.trim() || null,
      username: setupUsername.trim(),
    });
    setSetupSaving(false);
    if (error) {
      setSetupError(error.message);
    } else {
      // Refresh profile in AuthContext by triggering a reload
      await updateProfile({ display_name: setupDisplayName.trim() || null, username: setupUsername.trim() });
    }
  };


  useEffect(() => {
    AsyncStorage.getItem(NOTIF_SETTINGS_KEY).then(val => {
      if (val) {
        try { setNotifSettings({ ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(val) }); }
        catch (e) { if (__DEV__) console.warn('Failed to parse notif settings:', e); }
      }
    }).catch(e => { if (__DEV__) console.warn('AsyncStorage notif read error:', e); });
    if (Notifications) Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status as 'granted' | 'denied' | 'undetermined')).catch(e => { if (__DEV__) console.warn('Notification permission check failed:', e); });
  }, []);

  const saveNotifSettings = async (updated: NotifSettings) => {
    setNotifSettings(updated);
    await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(updated));
    const subs = (Object.keys(updated) as (keyof NotifSettings)[]).map(key => ({
      type: key,
      enabled: updated[key],
    }));
    const filteredSubs = filterPremiumNotifSubs(subs, isPremium);
    registerPushToken(language).then(() => syncSubscriptions(filteredSubs)).catch(() => {
      setTimeout(() => {
        registerPushToken(language).then(() => syncSubscriptions(filteredSubs)).catch(() => {});
      }, 2000);
    });
  };

  const requestPermissionIfNeeded = async (): Promise<boolean> => {
    if (notifPermission === 'granted') return true;
    if (!Notifications) {
      Alert.alert(t('Not available', 'Non disponible'), t('Notifications are not available in this environment.', 'Les notifications ne sont pas disponibles dans cet environnement.'));
      return false;
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') { setNotifPermission('granted'); return true; }
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermission(status as 'granted' | 'denied' | 'undetermined');
    if (status !== 'granted') {
      Alert.alert(
        t('Notifications disabled', 'Notifications d\u00e9sactiv\u00e9es'),
        t('Enable notifications in Settings.', 'Activez les notifications dans les Parametres.'),
        [
          { text: t('Settings', 'Param\u00e8tres'), onPress: () => Linking.openSettings() },
          { text: t('Cancel', 'Annuler'), style: 'cancel' },
        ]
      );
      return false;
    }
    return true;
  };

  const toggleMaster = async (masterKey: string, value: boolean) => {
    hapticLight();
    const subKeys = MASTER_KEY_MAP[masterKey];
    if (value) {
      const granted = await requestPermissionIfNeeded();
      if (!granted) return;
    }
    const updated = { ...notifSettings, [masterKey]: value };
    if (subKeys) {
      for (const k of subKeys) updated[k] = value;
    }
    saveNotifSettings(updated);
  };

  const notifToggles = [
    { key: 'events', label: 'Events', description: 'Friend RSVPs and new events near you', icon: 'calendar-outline' },
    { key: 'friends', label: 'Friends', description: 'Friend requests and accepts', icon: 'people-outline' },
    { key: 'reminders', label: 'Reminders', description: '1 hour before an event you RSVPd to', icon: 'alarm-outline' },
  ];

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user) return;
    const filePath = `${user.id}/avatar.jpg`;

    // Optimistic update show selected image immediately
    setLocalAvatarUrl(uri);

    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        setLocalAvatarUrl(null);
        Alert.alert('Upload failed', uploadError.message);
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await updateProfile({ avatar_url: data.publicUrl });
      // Refresh cache-bust timestamp so the new avatar is fetched
      setAvatarCacheBust(Date.now());
      setLocalAvatarUrl(null);
    } catch (err: any) {
      setLocalAvatarUrl(null);
      Alert.alert('Upload failed', err.message ?? 'Something went wrong.');
    }
  };

  const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[{
      borderWidth: 1, borderColor: colours.border, borderRadius: 12,
      marginHorizontal: 20, marginBottom: 0, overflow: 'hidden',
      backgroundColor: colours.surface,
    }, cardShadow, style]}>
      {children}
    </View>
  );

  if (!user) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colours.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: colours.text, letterSpacing: -0.5 }}>affiche</Text>
            <Text style={{ fontSize: 14, color: colours.muted, marginTop: 6 }}>
              {authCodeSent ? 'Check your email' : 'Sign in or create an account'}
            </Text>
          </View>

          {authCodeSent ? (
            <>
              <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                Enter the 6-digit code sent to {authEmail}
              </Text>
              <TextInput
                style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 28, fontWeight: '700', color: colours.text, textAlign: 'center', letterSpacing: 8, marginBottom: 20 }}
                placeholder="000000"
                placeholderTextColor={colours.muted}
                value={authOtp}
                onChangeText={t => setAuthOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="go"
                onSubmitEditing={handleVerifyOtp}
              />

              {authError ? (
                <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600', marginBottom: 14, textAlign: 'center' }}>
                  {authError}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={authVerifying || authOtp.length !== 6}
                style={{ backgroundColor: authOtp.length === 6 ? colours.accent : colours.border, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 }}
                activeOpacity={0.85}
              >
                {authVerifying ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Verify</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendCode} disabled={authLoading} style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '600' }}>
                  {authLoading ? 'Sending…' : 'Resend code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setAuthCodeSent(false); setAuthOtp(''); setAuthError(''); }} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colours.muted }}>Use a different email</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Email</Text>
              <TextInput
                style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colours.text, marginBottom: 20 }}
                placeholder="you@example.com"
                placeholderTextColor={colours.muted}
                value={authEmail}
                onChangeText={setAuthEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!authLoading}
                returnKeyType="go"
                onSubmitEditing={handleSendCode}
              />

              {authError ? (
                <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600', marginBottom: 14, textAlign: 'center' }}>
                  {authError}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={handleSendCode}
                disabled={authLoading || !authEmail.trim()}
                style={{ backgroundColor: authEmail.trim() ? colours.accent : colours.border, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: authLoading ? 0.7 : 1 }}
                activeOpacity={0.85}
              >
                {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Send Code</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (needsProfileSetup) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colours.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="person-outline" size={30} color={colours.accent} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colours.text, letterSpacing: -0.5, marginBottom: 6 }}>Set up your profile</Text>
            <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', lineHeight: 20 }}>
              Choose a username so your friends can find you.
            </Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Display Name</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colours.text, marginBottom: 20 }}
            placeholder="Your name"
            placeholderTextColor={colours.muted}
            value={setupDisplayName}
            onChangeText={setSetupDisplayName}
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Username</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderWidth: 1, borderColor: usernameStatus === 'taken' ? '#FF3B5C' : usernameStatus === 'available' ? '#00C07A' : colours.border, borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }}>
            <Text style={{ fontSize: 15, color: colours.muted, marginRight: 2 }}>@</Text>
            <TextInput
              style={{ flex: 1, paddingVertical: 13, fontSize: 15, color: colours.text }}
              placeholder="yourhandle"
              placeholderTextColor={colours.muted}
              value={setupUsername}
              onChangeText={v => setSetupUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSetupProfile}
            />
            {usernameStatus === 'checking' && <ActivityIndicator size="small" color={colours.muted} />}
            {usernameStatus === 'available' && <Text style={{ fontSize: 13, color: '#00C07A', fontWeight: '700' }}>✓ available</Text>}
            {usernameStatus === 'taken' && <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '700' }}>✗ taken</Text>}
          </View>
          <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 24 }}>
            Lowercase letters, numbers, underscores and dots only.
          </Text>

          {setupError ? (
            <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '600', marginBottom: 14, textAlign: 'center' }}>
              {setupError}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleSetupProfile}
            disabled={setupSaving || !setupUsername.trim() || usernameStatus === 'taken' || usernameStatus === 'checking'}
            style={{
              backgroundColor: (setupUsername.trim() && usernameStatus === 'available') ? colours.accent : colours.border,
              borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            }}
            activeOpacity={0.85}
          >
            {setupSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Set up profile</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        <View style={{ backgroundColor: colours.bg, paddingTop: insets.top + 16, paddingBottom: 8, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <TouchableOpacity onPress={handleAvatarPress} style={{ position: 'relative' }}>
              {(localAvatarUrl || profile?.avatar_url) ? (
                <Image source={{ uri: localAvatarUrl ?? (profile!.avatar_url + '?t=' + avatarCacheBust) }} style={{ width: 56, height: 56, borderRadius: 14 }} />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colours.accent }}>
                    {profile?.display_name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={11} color="white" />
              </View>
            </TouchableOpacity>
            {/* Info */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>
                  {profile?.display_name || profile?.username || 'Your Name'}
                </Text>
                <TouchableOpacity onPress={() => {
                  setEditName(profile?.display_name || '');
                  setEditUsername(profile?.username || '');
                  setEditUsernameStatus('idle');
                  setEditUsernameError('');
                  setShowEditProfile(true);
                }}>
                  <Ionicons name="pencil-outline" size={16} color={colours.muted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: colours.muted }}>@{profile?.username || 'username'}</Text>
              {wallCount > 0 && (
                <Text style={{ fontSize: 12, color: colours.accent, fontWeight: '600', marginTop: 2 }}>
                  {wallCount} {wallCount === 1 ? 'night out' : 'nights out'}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* MY WALL */}
        <MyWallSection onCountChange={setWallCount} />

        {/* MY EVENTS */}
        <MyEventsSection />

        {/* SAVED EVENTS */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Saved Events</Text>
          {savedEvents.length === 0 ? (
            <Text style={{ fontSize: 13, color: colours.muted }}>No saved events yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {savedEvents.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => router.push(`/event/${ev.id}` as any)}
                  activeOpacity={0.85}
                  style={{ width: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: colours.card }}
                >
                  <Image
                    source={{ uri: ev.poster_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }}
                    style={{ width: 120, height: 100 }}
                    resizeMode="cover"
                  />
                  <View style={{ padding: 7 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }} numberOfLines={1}>{ev.venue_name}</Text>
                    <Text style={{ fontSize: 10, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{ev.title}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* PROFILE STATS */}
        {profileStats && (
          <View style={{ paddingHorizontal: 16, marginBottom: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Profile Stats</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { value: String(profileStats.eventsAttended), label: 'Events Attended' },
                { value: String(profileStats.totalPosts), label: 'Posts' },
                { value: profileStats.memberSince ? new Date(profileStats.memberSince).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '', label: 'Member Since' },
                { value: profileStats.mostVisitedVenue ?? '', label: 'Most Visited' },
              ].filter((stat) => stat.value !== '' && stat.value !== 'null').map((stat) => (
                <View
                  key={stat.label}
                  style={{ width: '47%', backgroundColor: colours.card, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: colours.border }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, textAlign: 'center' }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginTop: 12, marginBottom: 4 }}>
          <Text
            style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}
            accessibilityRole="header"
          >
            {t('Settings', 'Param\u00e8tres')}
          </Text>
        </View>

        {/* ── NOTIFICATIONS ── */}
        <SectionHeader label={t('Notifications', 'Notifications')} icon="notifications-outline" colours={colours} fonts={fonts} />
        <Card>
          {notifPermission === 'denied' && (
            <TouchableOpacity
              onPress={() => { hapticMedium(); Linking.openSettings().catch(() => {}); }}
              activeOpacity={0.7}
              style={{ backgroundColor: colours.warnBg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('Open settings to enable notifications', 'Ouvrir les parametres pour activer les notifications')}
            >
              <Ionicons name="alert-circle" size={18} color={colours.orange} />
              <Text style={{ flex: 1, fontSize: fonts.sm, fontWeight: '600', color: colours.orange }}>
                {t('Notifications off - tap to enable', 'Notifications desactivees - appuyez pour activer')}
              </Text>
              <Ionicons name="open-outline" size={14} color={colours.orange} />
            </TouchableOpacity>
          )}
          {notifToggles.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <Divider colours={colours} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
                <Ionicons name={item.icon as any} size={18} color={notifSettings[item.key as keyof NotifSettings] ? colours.accent : colours.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fonts.md, color: notifSettings[item.key as keyof NotifSettings] ? colours.text : colours.muted }}>
                    {item.label}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                    {(item as any).description}
                  </Text>
                </View>
                <Switch
                  value={!!notifSettings[item.key as keyof NotifSettings]}
                  onValueChange={v => toggleMaster(item.key, v)}
                  trackColor={{ false: colours.border, true: colours.accent }}
                  thumbColor="white"
                  ios_backgroundColor={colours.border}
                  accessibilityLabel={item.label}
                />
              </View>
            </View>
          ))}
        </Card>

        {/* ── APPEARANCE ── */}
        <SectionHeader label={t('Appearance', 'Apparence')} icon="color-palette-outline" colours={colours} fonts={fonts} />

        {/* Theme picker */}
        <Card style={{ padding: 16 }}>
          <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 12 }}>
            {t('Theme', 'Theme')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['dark', 'light', 'system'] as const).map(th => (
              <TouchableOpacity
                key={th}
                style={{
                  flex: 1, alignItems: 'center', gap: 6,
                  borderWidth: 1, borderRadius: 12, paddingVertical: 10,
                  backgroundColor: theme === th ? colours.tintBg : colours.bg,
                  borderColor: theme === th ? colours.accent : colours.border,
                }}
                onPress={() => { hapticLight(); setTheme(th); }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityState={{ selected: theme === th }}
                accessibilityLabel={th === 'dark' ? t('Dark mode', 'Mode sombre') : th === 'light' ? t('Light mode', 'Mode clair') : t('System theme', 'Th\u00e8me syst\u00e8me')}
              >
                <Ionicons
                  name={th === 'dark' ? 'moon' : th === 'light' ? 'sunny' : 'phone-portrait'}
                  size={18}
                  color={theme === th ? colours.accent : colours.muted}
                />
                <Text style={{ fontSize: fonts.sm, color: theme === th ? colours.accent : colours.muted }}>
                  {th === 'dark' ? t('Dark', 'Sombre') : th === 'light' ? t('Light', 'Clair') : t('Auto', 'Auto')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {isAdmin && (
          <>
            <SectionHeader label="Admin" icon="shield-checkmark-outline" colours={colours} fonts={fonts} />
            <Card>
              <SettingsRow
                label="Admin Panel"
                icon="shield-checkmark-outline"
                onPress={() => router.push('/admin' as any)}
                colours={colours}
                fonts={fonts}
              />
            </Card>
          </>
        )}

        {/* ── SUPPORT ── */}
        <SectionHeader label={t('Support', 'Soutien')} icon="help-circle-outline" colours={colours} fonts={fonts} />
        <Card>
          <SettingsRow
            label={t('Report a bug', 'Signaler un bogue')}
            icon="bug"
            onPress={() => { setBugModalVisible(true); setBugSent(false); setBugMessage(''); setBugScreen(''); }}
            colours={colours}
            fonts={fonts}
          />
          <Divider colours={colours} />
          <SettingsRow
            label={t('Rate affiche', 'Evaluer affiche')}
            icon="star"
            onPress={() => {
              Linking.openURL('https://apps.apple.com/app/id6741357152?action=write-review').catch(() => {});
            }}
            colours={colours}
            fonts={fonts}
            right={<Ionicons name="open-outline" size={16} color={colours.muted} />}
          />
          <Divider colours={colours} />
          <SettingsRow
            label={t('Privacy Policy', 'Politique de confidentialite')}
            icon="shield-checkmark"
            onPress={() => router.push('/privacy-policy')}
            colours={colours}
            fonts={fonts}
            right={<Ionicons name="chevron-forward" size={16} color={colours.muted} />}
          />
        </Card>

        {/* VENUE OWNER */}
        {!(profile as any)?.is_business && (
          <View style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 4 }}>
            <SectionHeader label="For Venue Owners" icon="business-outline" colours={colours} fonts={fonts} />
            <Card>
              <SettingsRow
                label="Set up business account"
                icon="storefront-outline"
                onPress={() => router.push('/business-setup' as any)}
                colours={colours}
                fonts={fonts}
              />
            </Card>
          </View>
        )}
        {(profile as any)?.is_business && (
          <View style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 4 }}>
            <SectionHeader label="Business" icon="business-outline" colours={colours} fonts={fonts} />
            <Card>
              <SettingsRow
                label="Business Dashboard"
                icon="stats-chart-outline"
                onPress={() => router.push('/business-dashboard' as any)}
                colours={colours}
                fonts={fonts}
              />
            </Card>
          </View>
        )}

        {/* ORGANIZER */}
        {!(profile as any)?.is_organizer && !(profile as any)?.is_business && (
          <View style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 4 }}>
            <SectionHeader label="For Organizers" icon="megaphone-outline" colours={colours} fonts={fonts} />
            <Card>
              <SettingsRow
                label="Become an Organizer"
                icon="ribbon-outline"
                onPress={() => {
                  const { STRIPE_LINKS } = require('../../lib/stripeLinks');
                  const url = STRIPE_LINKS.organizer_monthly || 'https://buy.stripe.com/organizer_placeholder';
                  Linking.openURL(url).catch(() => {});
                }}
                colours={colours}
                fonts={fonts}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>$19.99/mo</Text>
                    <Ionicons name="chevron-forward" size={16} color={colours.muted} />
                  </View>
                }
              />
            </Card>
          </View>
        )}
        {(profile as any)?.is_organizer && (
          <View style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 4 }}>
            <SectionHeader label="Organizer" icon="megaphone-outline" colours={colours} fonts={fonts} />
            <Card>
              <OrganizerDashboardSection colours={colours} fonts={fonts} />
            </Card>
          </View>
        )}

        <TouchableOpacity
          onPress={signOut}
          style={{ marginHorizontal: 20, marginTop: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#cc3b2a40', backgroundColor: '#cc3b2a12', alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#cc3b2a' }}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Bug Report Modal */}
      <Modal visible={bugModalVisible} animationType="slide" transparent onRequestClose={() => setBugModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 16 }} />
            {bugSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="checkmark-circle" size={40} color={colours.accent} />
                <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text, marginTop: 12 }}>{t('Sent', 'Envoye')}</Text>
                <TouchableOpacity
                  onPress={() => setBugModalVisible(false)}
                  activeOpacity={0.7}
                  style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Done', 'Fermer')}
                >
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: fonts.md }}>{t('Done', 'Fermer')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text, marginBottom: 16 }}>{t('Report a bug', 'Signaler un bogue')}</Text>

                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                  placeholder={t('What went wrong?', 'Que s\'est-il passe?')}
                  placeholderTextColor={colours.muted}
                  value={bugMessage}
                  onChangeText={setBugMessage}
                  multiline
                  accessibilityLabel={t('Bug description', 'Description du bogue')}
                />

                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 4 }}>{t('Screen', 'Ecran')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['Feed', 'Discover', 'Friends', 'Profile', 'Other'].map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => { hapticLight(); setBugScreen(bugScreen === s ? '' : s); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                        borderColor: bugScreen === s ? colours.red : colours.border,
                        backgroundColor: bugScreen === s ? colours.errorBg : colours.surface,
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: bugScreen === s }}
                    >
                      <Text style={{ fontSize: fonts.sm, color: bugScreen === s ? colours.red : colours.text }}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setBugModalVisible(false)}
                    activeOpacity={0.7}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Cancel', 'Annuler')}
                  >
                    <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!bugMessage.trim()) return;
                      setBugSending(true);
                      try {
                        let deviceId: string | null = null;
                        try { deviceId = await AsyncStorage.getItem(SK_DEVICE_ID); } catch (e) { if (__DEV__) console.warn(e); }
                        const appVersion = `affiche ${Platform.OS} ${Platform.Version}`;
                        await supabase.from('bug_reports').insert({
                          message: bugMessage.trim(),
                          screen: bugScreen || null,
                          device_id: deviceId,
                          app_version: appVersion,
                        });
                        hapticSuccess();
                        setBugSent(true);
                        const subject = encodeURIComponent('affiche Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@affiche.app?subject=${subject}&body=${body}`).catch(() => {});
                      } catch (e) {
                        if (__DEV__) console.warn('bug report failed:', e);
                        const subject = encodeURIComponent('affiche Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@affiche.app?subject=${subject}&body=${body}`).catch(() => Alert.alert(t('Could not send report', 'Impossible d\'envoyer le rapport')));
                        setBugSent(true);
                      }
                      setBugSending(false);
                    }}
                    disabled={!bugMessage.trim()}
                    activeOpacity={0.7}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: bugMessage.trim() ? colours.red : colours.border,
                      opacity: bugMessage.trim() ? 1 : 0.5,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Send bug report', 'Envoyer le rapport')}
                  >
                    {bugSending
                      ? <ActivityIndicator color="white" size="small" />
                      : <Text style={{ fontSize: fonts.md, fontWeight: '600', color: bugMessage.trim() ? 'white' : colours.muted }}>{t('Send', 'Envoyer')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowEditProfile(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, marginBottom: 24 }}>Edit Profile</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Display Name</Text>
            <TextInput
              style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text, marginBottom: 16 }}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor={colours.muted}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Username</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderWidth: 1, borderColor: editUsernameStatus === 'taken' ? '#FF3B5C' : editUsernameStatus === 'available' ? '#00C07A' : colours.border, borderRadius: 12, paddingHorizontal: 14, marginBottom: 4 }}>
              <Text style={{ fontSize: 15, color: colours.muted, marginRight: 2 }}>@</Text>
              <TextInput
                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: colours.text }}
                value={editUsername}
                onChangeText={v => { setEditUsernameError(''); setEditUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, '')); }}
                placeholder="username"
                placeholderTextColor={colours.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {editUsernameStatus === 'checking' && <ActivityIndicator size="small" color={colours.muted} />}
              {editUsernameStatus === 'available' && editUsername !== profile?.username && <Text style={{ fontSize: 13, color: '#00C07A', fontWeight: '700' }}>✓</Text>}
              {editUsernameStatus === 'taken' && <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '700' }}>✗ taken</Text>}
            </View>
            {editUsernameError ? (
              <Text style={{ fontSize: 12, color: '#FF3B5C', fontWeight: '600', marginBottom: 12 }}>{editUsernameError}</Text>
            ) : (
              <View style={{ marginBottom: 16 }} />
            )}

            <TouchableOpacity
              onPress={async () => {
                if (editUsernameStatus === 'taken') { setEditUsernameError('That username is already taken.'); return; }
                if (editUsernameStatus === 'checking') { setEditUsernameError('Still checking username…'); return; }
                setSaving(true);
                await updateProfile({ display_name: editName.trim(), username: editUsername.trim() });
                setSaving(false);
                setShowEditProfile(false);
              }}
              disabled={saving || editUsernameStatus === 'taken' || editUsernameStatus === 'checking'}
              style={{ backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: (editUsernameStatus === 'taken' || editUsernameStatus === 'checking') ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Save</Text>}
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}
