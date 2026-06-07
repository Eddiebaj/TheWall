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
import { PREMIUM_ENABLED } from '../../lib/flags';
import { useIsPremium } from '../../lib/premium';
import { STRIPE_LINKS } from '../../lib/stripeLinks';
import PaywallSheet from '../../components/PaywallSheet';
import PremiumBadge from '../../components/PremiumBadge';

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

  if (loading) {
    return <ActivityIndicator size="small" color="#FF3B5C" style={{ margin: 16 }} />;
  }

  const totalRsvps = events.reduce((s, e) => s + e.rsvp_count, 0);

  return (
    <View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{events.length}</Text>
          <Text style={{ fontSize: 11, color: '#888', fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Events</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{totalRsvps}</Text>
          <Text style={{ fontSize: 11, color: '#888', fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>RSVPs</Text>
        </View>
      </View>
      {events.map((e, i) => (
        <TouchableOpacity
          key={e.id}
          onPress={() => router.push(`/event/${e.id}` as any)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
            borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' }} numberOfLines={1}>{e.title}</Text>
          <Text style={{ fontSize: 13, color: '#888', fontWeight: '600', marginRight: 6 }}>{e.rsvp_count} going</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
      ))}
      {events.length === 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 14, color: '#888' }}>No events yet.</Text>
        </View>
      )}
    </View>
  );
}

function MyEventsSection() {
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
    <View style={{ marginBottom: 6 }}>
      {events.map((e, i) => (
        <TouchableOpacity
          key={e.id}
          onPress={() => router.push(`/event/${e.id}` as any)}
          activeOpacity={0.75}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
            minHeight: 52,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }} numberOfLines={1}>{e.title}</Text>
            {e.event_date ? (
              <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {new Date(e.event_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: '#888', fontWeight: '600', marginRight: 8 }}>{e.rsvp_count} going</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MyWallSection({ onCountChange }: { onCountChange: (n: number) => void }) {
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
      <View style={{ marginHorizontal: 16, marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed', padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>Your wall starts here</Text>
        <Text style={{ fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 18 }}>
          RSVP to events to start your collection
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
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
              <View style={{ flex: 1, backgroundColor: '#1a1a1a' }} />
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

// Colored icon square, iOS-style settings row
function SettingsRow({
  label, icon, iconBg, onPress, right, destructive,
}: {
  label: string;
  icon?: string;
  iconBg?: string;
  onPress: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={() => { hapticLight(); onPress(); }}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 0,
        minHeight: 52,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon && iconBg && (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
          <Ionicons name={icon as any} size={16} color="#fff" />
        </View>
      )}
      <Text style={{ flex: 1, fontSize: 16, color: destructive ? '#FF3B5C' : '#fff', fontWeight: '400' }}>{label}</Text>
      {right !== undefined ? right : (
        icon ? <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" /> : null
      )}
    </TouchableOpacity>
  );
}

function RowDivider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 16 + 30 + 14 }} />;
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      {children}
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
  const { profile, user, signOut, isAdmin, isPremium: _isPremiumAuth, updateProfile, loading: userLoading } = useAuth();
  const isPremium = useIsPremium();
  const { savedBoard } = useBoard();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { capture } = useAnalytics();

  useEffect(() => {
    capture('profile_viewed');
  }, []);

  useEffect(() => {
    if (!userLoading && !user) router.replace('/auth' as any);
  }, [userLoading, user]);

  const [insightsPaywallVisible, setInsightsPaywallVisible] = useState(false);
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
      options: { shouldCreateUser: true, emailRedirectTo: 'affiche://auth/callback' },
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
  };

  const isLight = resolvedTheme === 'light';

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
  const [friendCount, setFriendCount] = useState(0);
  const [eventsCreatedCount, setEventsCreatedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .then(({ count }) => setFriendCount(count ?? 0));

    supabase
      .from('venue_events')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .eq('source', 'user')
      .then(({ count }) => setEventsCreatedCount(count ?? 0));
  }, [user]);

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

  const [setupDisplayName, setSetupDisplayName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needsProfileSetup = !!user && !profile?.username;

  useEffect(() => {
    if (!setupUsername || setupUsername.length < 3) {
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
    if (editUsername.length < 3) { setEditUsernameStatus('idle'); return; }
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
    if (setupUsername.trim().length < 3) { setSetupError('Username must be at least 3 characters.'); return; }
    if (usernameStatus === 'taken') { setSetupError('That username is taken.'); return; }
    if (usernameStatus === 'checking') { setSetupError('Still checking username...'); return; }
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
        t('Notifications disabled', 'Notifications desactivees'),
        t('Enable notifications in Settings.', 'Activez les notifications dans les Parametres.'),
        [
          { text: t('Settings', 'Parametres'), onPress: () => Linking.openSettings() },
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
      setAvatarCacheBust(Date.now());
      setLocalAvatarUrl(null);
    } catch (err: any) {
      setLocalAvatarUrl(null);
      Alert.alert('Upload failed', err.message ?? 'Something went wrong.');
    }
  };

  const openEditProfile = () => {
    setEditName(profile?.display_name || '');
    setEditUsername(profile?.username || '');
    setEditUsernameStatus('idle');
    setEditUsernameError('');
    setShowEditProfile(true);
  };

  if (!user) {
    return null;
  }

  if (needsProfileSetup) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FF3B5C20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="person-outline" size={30} color="#FF3B5C" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 6 }}>Set up your profile</Text>
            <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 }}>
              Choose a username so your friends can find you.
            </Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Display Name</Text>
          <TextInput
            style={{ backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#fff', marginBottom: 20 }}
            placeholder="Your name"
            placeholderTextColor="#666"
            value={setupDisplayName}
            onChangeText={setSetupDisplayName}
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Username</Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#111', borderWidth: 1,
            borderColor: usernameStatus === 'taken' ? '#FF3B5C' : usernameStatus === 'available' ? '#00C07A' : 'rgba(255,255,255,0.08)',
            borderRadius: 12, paddingHorizontal: 14, marginBottom: 8,
          }}>
            <Text style={{ fontSize: 15, color: '#666', marginRight: 2 }}>@</Text>
            <TextInput
              style={{ flex: 1, paddingVertical: 13, fontSize: 15, color: '#fff' }}
              placeholder="yourhandle"
              placeholderTextColor="#666"
              value={setupUsername}
              onChangeText={v => setSetupUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleSetupProfile}
            />
            {usernameStatus === 'checking' && <ActivityIndicator size="small" color="#888" />}
            {usernameStatus === 'available' && <Text style={{ fontSize: 13, color: '#00C07A', fontWeight: '700' }}>available</Text>}
            {usernameStatus === 'taken' && <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '700' }}>taken</Text>}
          </View>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 24 }}>
            3–20 characters. Letters, numbers, underscores and dots only.
          </Text>

          {setupError ? (
            <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '600', marginBottom: 14, textAlign: 'center' }}>
              {setupError}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleSetupProfile}
            disabled={setupSaving || setupUsername.trim().length < 3 || usernameStatus === 'taken' || usernameStatus === 'checking'}
            style={{
              backgroundColor: (setupUsername.trim().length >= 3 && usernameStatus === 'available') ? '#FF3B5C' : '#222',
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

  const avatarUri = localAvatarUrl ?? (profile?.avatar_url ? profile.avatar_url + '?t=' + avatarCacheBust : null);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* Profile card */}
        <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={{ backgroundColor: '#111', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
              {/* Avatar */}
              <TouchableOpacity onPress={handleAvatarPress} style={{ position: 'relative' }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF3B5C18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: '#FF3B5C' }}>
                      {profile?.display_name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: '#333', borderWidth: 2, borderColor: '#111',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="camera" size={11} color="#fff" />
                </View>
              </TouchableOpacity>

              {/* Name + username */}
              <View style={{ flex: 1, paddingTop: 2 }}>
                <Text style={{ fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.4, marginBottom: 3 }}>
                  {profile?.display_name || profile?.username || 'Your Name'}
                </Text>
                <Text style={{ fontSize: 14, color: '#888', marginBottom: isPremium ? 6 : 12 }}>
                  @{profile?.username || 'username'}
                </Text>
                {isPremium && <PremiumBadge size="small" />}
                <TouchableOpacity
                  onPress={openEditProfile}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Edit profile</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
                  {profileStats?.eventsAttended ?? 0}
                </Text>
                <Text style={{ fontSize: 11, color: '#888', fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Going</Text>
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>{friendCount}</Text>
                <Text style={{ fontSize: 11, color: '#888', fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Friends</Text>
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>{eventsCreatedCount}</Text>
                <Text style={{ fontSize: 11, color: '#888', fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Created</Text>
              </View>
            </View>
          </View>
        </View>

        {/* My Wall */}
        <MyWallSection onCountChange={setWallCount} />

        {/* Saved Events */}
        {savedEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 12 }}>Saved Events</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {savedEvents.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => router.push(`/event/${ev.id}` as any)}
                  activeOpacity={0.85}
                  style={{ width: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' }}
                >
                  <Image
                    source={{ uri: ev.poster_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80' }}
                    style={{ width: 120, height: 100 }}
                    resizeMode="cover"
                  />
                  <View style={{ padding: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }} numberOfLines={1}>{ev.venue_name}</Text>
                    <Text style={{ fontSize: 10, color: '#888', marginTop: 1 }} numberOfLines={1}>{ev.title}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* My Events */}
        <SettingsGroup>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44, paddingVertical: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name="calendar" size={16} color="#fff" />
            </View>
            <Text style={{ flex: 1, fontSize: 16, color: '#fff', fontWeight: '400' }}>My Events</Text>
          </View>
          <MyEventsSection />
        </SettingsGroup>

        {/* Notifications section */}
        <View style={{ marginTop: 24, marginBottom: 8 }}>
          {notifPermission === 'denied' && (
            <TouchableOpacity
              onPress={() => { hapticMedium(); Linking.openSettings().catch(() => {}); }}
              activeOpacity={0.7}
              style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(255,149,0,0.08)', padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,149,0,0.2)' }}
            >
              <Ionicons name="alert-circle" size={18} color="#ff9500" />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#ff9500' }}>
                Notifications off -- tap to enable
              </Text>
              <Ionicons name="open-outline" size={14} color="#ff9500" />
            </TouchableOpacity>
          )}
          <SettingsGroup>
            {notifToggles.map((item, i) => (
              <View key={item.key}>
                {i > 0 && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 60 }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 0, minHeight: 52 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <Ionicons
                      name={item.icon as any}
                      size={16}
                      color={notifSettings[item.key as keyof NotifSettings] ? '#FF3B5C' : '#888'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, color: '#fff', fontWeight: '400' }}>{item.label}</Text>
                    <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{(item as any).description}</Text>
                  </View>
                  <Switch
                    value={!!notifSettings[item.key as keyof NotifSettings]}
                    onValueChange={v => toggleMaster(item.key, v)}
                    trackColor={{ false: '#2a2a2a', true: '#FF3B5C' }}
                    thumbColor="white"
                    ios_backgroundColor="#2a2a2a"
                  />
                </View>
              </View>
            ))}
          </SettingsGroup>
        </View>

        {/* Group 2: Account actions */}
        <SettingsGroup>
          <SettingsRow
            label="Business Portal"
            icon="storefront"
            iconBg="#7C3AED"
            onPress={() => {
              if ((profile as any)?.is_business) {
                router.push('/business-dashboard' as any);
              } else {
                router.push('/business-setup' as any);
              }
            }}
          />
          <RowDivider />
          <SettingsRow
            label="Insights"
            icon="stats-chart"
            iconBg="#0891B2"
            onPress={() => {
              if (PREMIUM_ENABLED && !isPremium) {
                setInsightsPaywallVisible(true);
              } else {
                router.push('/insights' as any);
              }
            }}
          />
          {!(profile as any)?.is_organizer && !(profile as any)?.is_business && (
            <>
              <RowDivider />
              <SettingsRow
                label="Become an Organizer"
                icon="ribbon"
                iconBg="#059669"
                onPress={() => {
                  if (STRIPE_LINKS.organizer_monthly) {
                    Linking.openURL(STRIPE_LINKS.organizer_monthly).catch(() =>
                      Alert.alert('Error', 'Could not open the payment page. Please try again.')
                    );
                  } else {
                    Alert.alert('Coming Soon', 'Organizer plans will be available shortly. Stay tuned!');
                  }
                }}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#888' }}>$19.99/mo</Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                  </View>
                }
              />
            </>
          )}
          {(profile as any)?.is_organizer && (
            <>
              <RowDivider />
              <OrganizerDashboardSection colours={colours} fonts={fonts} />
            </>
          )}
        </SettingsGroup>

        {/* Admin */}
        {isAdmin && (
          <SettingsGroup>
            <SettingsRow
              label="Admin Panel"
              icon="shield-checkmark"
              iconBg="#DC2626"
              onPress={() => router.push('/admin' as any)}
            />
          </SettingsGroup>
        )}

        {/* Group 3: Support */}
        <SettingsGroup>
          <SettingsRow
            label="Rate affiche"
            icon="star"
            iconBg="#D97706"
            onPress={() => {
              Linking.openURL('https://apps.apple.com/app/id6741357152?action=write-review').catch(() => {});
            }}
            right={<Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.2)" />}
          />
          <RowDivider />
          <SettingsRow
            label="Report a bug"
            icon="bug"
            iconBg="#EA580C"
            onPress={() => { setBugModalVisible(true); setBugSent(false); setBugMessage(''); setBugScreen(''); }}
          />
          <RowDivider />
          <SettingsRow
            label="Privacy Policy"
            icon="shield-checkmark"
            iconBg="#2563EB"
            onPress={() => router.push('/privacy-policy')}
          />
          <RowDivider />
          <SettingsRow
            label="Terms of Service"
            icon="document-text"
            iconBg="#4B5563"
            onPress={() => router.push('/terms-of-service' as any)}
          />
        </SettingsGroup>

        {/* Group 4: Danger zone */}
        <SettingsGroup>
          <TouchableOpacity
            onPress={signOut}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 }}
          >
            <Text style={{ flex: 1, fontSize: 16, color: '#fff', fontWeight: '400' }}>Sign Out</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Delete your account?',
                'This will permanently delete your profile, events, RSVPs, messages, and all other data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        'Are you absolutely sure?',
                        'Your account will be permanently deleted immediately.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete Account',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                const { error } = await supabase.rpc('delete_my_account');
                                if (error) throw error;
                                await supabase.auth.signOut();
                                Alert.alert('Your account has been deleted.', '', [
                                  { text: 'OK', onPress: () => router.replace('/auth' as any) },
                                ]);
                              } catch {
                                Alert.alert('Something went wrong. Please try again or contact support@affiche.app');
                              }
                            },
                          },
                        ]
                      );
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 }}
          >
            <Text style={{ flex: 1, fontSize: 16, color: '#FF3B5C', fontWeight: '400' }}>Delete Account</Text>
          </TouchableOpacity>
        </SettingsGroup>

        {__DEV__ && (
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.clear();
              await supabase.auth.signOut();
            }}
            style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,153,0,0.3)', backgroundColor: 'rgba(255,153,0,0.06)', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#ff9900' }}>Reset App (Dev)</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      <PaywallSheet
        visible={insightsPaywallVisible}
        onClose={() => setInsightsPaywallVisible(false)}
        featureHint="Unlock Insights to see your event history and stats"
      />

      {/* Bug Report Modal */}
      <Modal visible={bugModalVisible} animationType="slide" transparent onRequestClose={() => setBugModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 12, marginBottom: 16 }} />
            {bugSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="checkmark-circle" size={40} color="#FF3B5C" />
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 12 }}>{t('Sent', 'Envoye')}</Text>
                <TouchableOpacity
                  onPress={() => setBugModalVisible(false)}
                  activeOpacity={0.7}
                  style={{ marginTop: 20, backgroundColor: '#FF3B5C', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
                >
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>{t('Done', 'Fermer')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 }}>{t('Report a bug', 'Signaler un bogue')}</Text>
                <TextInput
                  style={{ backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#fff', minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                  placeholder={t('What went wrong?', "Que s'est-il passe?")}
                  placeholderTextColor="#666"
                  value={bugMessage}
                  onChangeText={setBugMessage}
                  multiline
                />
                <Text style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{t('Screen', 'Ecran')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['Feed', 'Discover', 'Friends', 'Profile', 'Other'].map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => { hapticLight(); setBugScreen(bugScreen === s ? '' : s); }}
                      activeOpacity={0.7}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                        borderColor: bugScreen === s ? '#FF3B5C' : 'rgba(255,255,255,0.1)',
                        backgroundColor: bugScreen === s ? 'rgba(255,59,92,0.08)' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: bugScreen === s ? '#FF3B5C' : '#888' }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setBugModalVisible(false)}
                    activeOpacity={0.7}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#888' }}>{t('Cancel', 'Annuler')}</Text>
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
                        Alert.alert('Report submitted', "We'll review it shortly.");
                      } catch (e) {
                        if (__DEV__) console.warn('bug report failed:', e);
                        const subject = encodeURIComponent('affiche Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@affiche.app?subject=${subject}&body=${body}`).catch(() => Alert.alert(t('Could not send report', "Impossible d'envoyer le rapport")));
                        setBugSent(true);
                      }
                      setBugSending(false);
                    }}
                    disabled={!bugMessage.trim()}
                    activeOpacity={0.7}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: bugMessage.trim() ? '#FF3B5C' : '#222',
                    }}
                  >
                    {bugSending
                      ? <ActivityIndicator color="white" size="small" />
                      : <Text style={{ fontSize: 15, fontWeight: '600', color: bugMessage.trim() ? 'white' : '#666' }}>{t('Send', 'Envoyer')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
            activeOpacity={1}
            onPress={() => setShowEditProfile(false)}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 20 }} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 24, letterSpacing: -0.3 }}>Edit Profile</Text>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Display Name</Text>
              <TextInput
                style={{ backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#fff', marginBottom: 16 }}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor="#666"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Username</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#1a1a1a', borderWidth: 1,
                borderColor: editUsernameStatus === 'taken' ? '#FF3B5C' : editUsernameStatus === 'available' ? '#00C07A' : 'rgba(255,255,255,0.08)',
                borderRadius: 12, paddingHorizontal: 14, marginBottom: 4,
              }}>
                <Text style={{ fontSize: 15, color: '#666', marginRight: 2 }}>@</Text>
                <TextInput
                  style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: '#fff' }}
                  value={editUsername}
                  onChangeText={v => { setEditUsernameError(''); setEditUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)); }}
                  placeholder="username"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
                {editUsernameStatus === 'checking' && <ActivityIndicator size="small" color="#888" />}
                {editUsernameStatus === 'available' && editUsername !== profile?.username && (
                  <Text style={{ fontSize: 13, color: '#00C07A', fontWeight: '700' }}>available</Text>
                )}
                {editUsernameStatus === 'taken' && <Text style={{ fontSize: 13, color: '#FF3B5C', fontWeight: '700' }}>taken</Text>}
              </View>
              {editUsernameError ? (
                <Text style={{ fontSize: 12, color: '#FF3B5C', fontWeight: '600', marginBottom: 20 }}>{editUsernameError}</Text>
              ) : (
                <View style={{ marginBottom: 20 }} />
              )}

              <TouchableOpacity
                onPress={async () => {
                  if (!editUsername.trim()) { setEditUsernameError('Username is required.'); return; }
                  if (editUsername.trim().length < 3) { setEditUsernameError('Username must be at least 3 characters.'); return; }
                  if (editUsernameStatus === 'taken') { setEditUsernameError('That username is already taken.'); return; }
                  if (editUsernameStatus === 'checking') { setEditUsernameError('Still checking username...'); return; }
                  setSaving(true);
                  await updateProfile({ display_name: editName.trim() || null, username: editUsername.trim() });
                  setSaving(false);
                  setShowEditProfile(false);
                }}
                disabled={saving || !editUsername.trim() || editUsername.trim().length < 3 || editUsernameStatus === 'taken' || editUsernameStatus === 'checking'}
                style={{
                  backgroundColor: '#FF3B5C', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                  opacity: (saving || !editUsername.trim() || editUsername.trim().length < 3 || editUsernameStatus === 'taken' || editUsernameStatus === 'checking') ? 0.6 : 1,
                }}
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
