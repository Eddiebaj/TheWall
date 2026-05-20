let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
import { registerPushToken, syncSubscriptions } from '../../lib/pushNotifications';
import { SK_NOTIF_SETTINGS, SK_DEVICE_ID, SK_HOME_ADDRESS, SK_WORK_PLACE, SK_RECENT_SEARCHES } from '../../lib/storageKeys';
import { useRouter } from 'expo-router';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { cardShadow as sharedCardShadow } from '../../lib/styles';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';
import {
  CommuteAlertSettings,
  getCommuteAlertSettings,
  saveCommuteAlertSettings,
  refreshCommuteNotification,
  filterPremiumNotifSubs,
} from '../../lib/commuteNotifications';
import { useIsPremium } from '../../lib/premium';
import { PREMIUM_ENABLED } from '../../lib/flags';
import PaywallSheet from '../../components/PaywallSheet';

type NotifSettings = {
  tripAlerts: boolean;
  serviceDisruptions: boolean;
  events: boolean;
  leaveNow: boolean;
  arrivalAlerts: boolean;
  transferAtRisk: boolean;
  tripDisruption: boolean;
  lastBus: boolean;
  lrtDisruption: boolean;
  routeCancellation: boolean;
  significantDelay: boolean;
  serviceResumed: boolean;
  busRunningEarly: boolean;
  festivalEvents: boolean;
  liveEventsNearby: boolean;
  commuteDeals: boolean;
  criticalAlerts: boolean;
  delayAlerts: boolean;
};

const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
  tripAlerts: true,
  serviceDisruptions: true,
  events: true,
  leaveNow: true,
  arrivalAlerts: true,
  transferAtRisk: true,
  tripDisruption: true,
  lastBus: true,
  lrtDisruption: true,
  routeCancellation: true,
  significantDelay: false,
  serviceResumed: true,
  busRunningEarly: false,
  festivalEvents: false,
  liveEventsNearby: false,
  commuteDeals: true,
  criticalAlerts: true,
  delayAlerts: false,
};

const MASTER_KEY_MAP: Record<string, (keyof NotifSettings)[]> = {
  tripAlerts: ['leaveNow', 'arrivalAlerts', 'transferAtRisk', 'tripDisruption', 'lastBus'],
  serviceDisruptions: ['lrtDisruption', 'routeCancellation', 'significantDelay', 'serviceResumed', 'busRunningEarly'],
  events: ['festivalEvents', 'liveEventsNearby', 'commuteDeals'],
};

const NOTIF_SETTINGS_KEY = SK_NOTIF_SETTINGS;

function SectionHeader({ label, icon, colours, fonts }: { label: string; icon: string; colours: any; fonts: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 8, marginTop: 4 }}>
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
      <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
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
    <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
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

  const [paywallVisible, setPaywallVisible] = useState(false);

  // Auth state (shown when not signed in)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleAuth = async () => {
    setAuthError('');
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setAuthLoading(true);
    const { error } = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
      : await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
    } else if (authMode === 'signup') {
      setAuthError('Check your email to confirm your account.');
    }
  };

  const isLight = resolvedTheme === 'light';
  const cardShadow = isLight ? sharedCardShadow : {};

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [commuteAlert, setCommuteAlert] = useState<CommuteAlertSettings>({ enabled: false, hour: 7, minute: 15 });
  const [lastMinuteDeals, setLastMinuteDeals] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem('thewall_lastminute_notifs').then(v => setLastMinuteDeals(v === 'true'));
  }, []);
  const [commuteTimePickerVisible, setCommuteTimePickerVisible] = useState(false);
  const [ghostStats, setGhostStats] = useState<{ totalThisWeek: number; mostAffectedRoute: string | null; mostAffectedCount: number } | null>(null);

  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugScreen, setBugScreen] = useState('');
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(false);

  // My Places state
  const [homeAddress, setHomeAddress] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [recentSearchCount, setRecentSearchCount] = useState(0);
  const [homeSaveStatus, setHomeSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [workSaveStatus, setWorkSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [accessibleRoutingEnabled, setAccessibleRoutingEnabled] = useState(false);

  const [wallCount, setWallCount] = useState(0);
  const [profileStats, setProfileStats] = useState<{ eventsAttended: number; totalPosts: number; memberSince: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [rsvpResult, postsResult, profileResult] = await Promise.all([
        supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'going'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('profiles').select('created_at').eq('id', user.id).single(),
      ]);
      setProfileStats({
        eventsAttended: rsvpResult.count ?? 0,
        totalPosts: postsResult.count ?? 0,
        memberSince: profileResult.data?.created_at ?? null,
      });
    };
    fetchStats();
  }, [user]);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('thewall_accessibility_routing').then(v => { if (v === 'true') setAccessibleRoutingEnabled(true); }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { getDeviceId } = require('../../lib/pushNotifications');
        const deviceId = await getDeviceId();
        if (!deviceId) return;
        const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=ghost.device_stats&device_id=${deviceId}`);
        if (resp.ok) { const data = await resp.json(); setGhostStats(data); }
      } catch (e) { if (__DEV__) console.warn(e); }
    })();
    AsyncStorage.getItem(SK_HOME_ADDRESS).then(val => {
      try { if (val) { const p = JSON.parse(val); setHomeAddress(p.label || ''); } } catch {}
    }).catch(() => {});
    AsyncStorage.getItem(SK_WORK_PLACE).then(val => {
      try { if (val) { const p = JSON.parse(val); setWorkAddress(p.label || ''); } } catch {}
    }).catch(() => {});
    AsyncStorage.getItem(SK_RECENT_SEARCHES).then(val => {
      try { if (val) setRecentSearchCount(JSON.parse(val).length); } catch {}
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_SETTINGS_KEY).then(val => {
      if (val) {
        try { setNotifSettings({ ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(val) }); }
        catch (e) { if (__DEV__) console.warn('Failed to parse notif settings:', e); }
      }
    }).catch(e => { if (__DEV__) console.warn('AsyncStorage notif read error:', e); });
    if (Notifications) Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status as 'granted' | 'denied' | 'undetermined')).catch(e => { if (__DEV__) console.warn('Notification permission check failed:', e); });
    getCommuteAlertSettings().then(setCommuteAlert).catch(() => {});
  }, []);

  const saveNotifSettings = async (updated: NotifSettings) => {
    setNotifSettings(updated);
    await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(updated));
    const pushTypes: (keyof NotifSettings)[] = [
      'lrtDisruption', 'routeCancellation', 'significantDelay',
      'serviceResumed', 'arrivalAlerts', 'tripDisruption',
    ];
    const stopIds = savedBoard
      .filter((i) => i.type === 'bus_stop' || i.type === 'lrt_station')
      .map((i) => 'id' in i ? i.id : '')
      .slice(0, 10);
    const subs = pushTypes.map(key => ({
      type: key,
      enabled: updated[key],
      ...(key === 'arrivalAlerts' ? { metadata: { stop_ids: stopIds } } : {}),
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
    { key: 'events', label: t('Events', '\u00c9v\u00e9nements'), icon: 'calendar' },
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
    const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${user.id}/avatar.${fileExt}`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `avatar.${fileExt}`,
      type: `image/${fileExt}`,
    } as any);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, formData, { upsert: true, contentType: 'multipart/form-data' });

    console.log('[Avatar] upload error:', uploadError?.message);

    if (!uploadError) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      console.log('[Avatar] public url:', data.publicUrl);
      await updateProfile({ avatar_url: data.publicUrl });
    }
  };

  const TripHistoryCard = () => {
    const [tripCount, setTripCount] = useState(0);
    const [totalKm, setTotalKm] = useState(0);
    useEffect(() => {
      AsyncStorage.getItem('thewall_trip_history')
        .then(val => {
          if (!val) return;
          const trips = JSON.parse(val);
          setTripCount(trips.length);
          setTotalKm(Math.round(trips.reduce((s: number, t: any) => s + (t.distanceKm ?? 0), 0)));
        })
        .catch(() => {});
    }, []);
    if (tripCount === 0) return null;
    return (
      <TouchableOpacity
        onPress={() => router.push('/insights' as any)}
        style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: colours.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colours.border, ...cardShadow }}
        activeOpacity={0.8}
      >
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="map-outline" size={20} color={colours.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
            {tripCount} {t('trips this week', 'trajets cette semaine')}
          </Text>
          {totalKm > 0 && (
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
              {totalKm} km {t('travelled', 'parcourus')}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colours.muted} />
      </TouchableOpacity>
    );
  };

  const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[{
      borderWidth: 1, borderColor: colours.border, borderRadius: 16,
      marginHorizontal: 20, marginBottom: 20, overflow: 'hidden',
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
            <Text style={{ fontSize: 32, fontWeight: '900', color: colours.text, letterSpacing: -0.5 }}>TheWall</Text>
            <Text style={{ fontSize: 14, color: colours.muted, marginTop: 6 }}>
              {authMode === 'signin' ? 'Sign in to your account' : 'Create an account'}
            </Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Email</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colours.text, marginBottom: 14 }}
            placeholder="you@example.com"
            placeholderTextColor={colours.muted}
            value={authEmail}
            onChangeText={setAuthEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!authLoading}
          />

          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Password</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colours.text, marginBottom: 20 }}
            placeholder="••••••••"
            placeholderTextColor={colours.muted}
            value={authPassword}
            onChangeText={setAuthPassword}
            secureTextEntry
            editable={!authLoading}
          />

          {authError ? (
            <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600', marginBottom: 14, textAlign: 'center' }}>
              {authError}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleAuth}
            disabled={authLoading}
            style={{ backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: authLoading ? 0.7 : 1 }}
            activeOpacity={0.85}
          >
            {authLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                  {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setAuthMode(m => m === 'signin' ? 'signup' : 'signin'); setAuthError(''); }}
            style={{ marginTop: 20, alignItems: 'center' }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, color: colours.muted }}>
              {authMode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: colours.accent, fontWeight: '700' }}>
                {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        <View style={{ backgroundColor: colours.surface, borderBottomWidth: 1, borderBottomColor: colours.border, paddingTop: insets.top + 20, paddingBottom: 20, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <TouchableOpacity onPress={handleAvatarPress} style={{ position: 'relative' }}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url + '?t=' + Date.now() }} style={{ width: 56, height: 56, borderRadius: 14 }} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>
                  {profile?.display_name || profile?.username || 'Your Name'}
                </Text>
                <TouchableOpacity onPress={() => {
                  setEditName(profile?.display_name || '');
                  setEditUsername(profile?.username || '');
                  setShowEditProfile(true);
                }}>
                  <Ionicons name="pencil-outline" size={16} color={colours.muted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { if (!isAdmin && !isPremium) router.push('/premium' as any); }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: isAdmin ? '#e8a020' + '25' : colours.accent + '18', borderWidth: 1, borderColor: isAdmin ? '#e8a020' + '60' : colours.accent + '40' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isAdmin ? '#e8a020' : colours.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {isAdmin ? 'Admin' : isPremium ? 'Premium' : 'Free'}
                    </Text>
                  </View>
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

        {/* PROFILE STATS */}
        {profileStats && (
          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Profile Stats</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { value: profileStats.eventsAttended, label: 'Events Attended' },
                { value: profileStats.totalPosts, label: 'Posts' },
                { value: profileStats.memberSince ? new Date(profileStats.memberSince).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '—', label: 'Member Since' },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={{ flex: 1, backgroundColor: colours.card, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: colours.border }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colours.text, marginBottom: 4 }}>{stat.value}</Text>
                  <Text style={{ fontSize: 11, color: colours.muted, textAlign: 'center' }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text
            style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text, marginTop: 20 }}
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
                <Text style={{ fontSize: fonts.md, color: notifSettings[item.key as keyof NotifSettings] ? colours.text : colours.muted, flex: 1 }}>
                  {item.label}
                </Text>
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
          <Card>
            <SettingsRow
              label="Admin Panel"
              icon="shield-checkmark-outline"
              onPress={() => router.push('/admin' as any)}
              colours={colours}
              fonts={fonts}
            />
          </Card>
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
          {/* TODO: Uncomment when real App Store / Play Store IDs are available
          <Divider colours={colours} />
          <SettingsRow
            label={t('Rate RouteO', 'Evaluer RouteO')}
            icon="star"
            onPress={() => {
              const storeUrl = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/routeo/id000000000'
                : 'https://play.google.com/store/apps/details?id=ca.routeo.app';
              Linking.openURL(storeUrl).catch(() => {});
            }}
            colours={colours}
            fonts={fonts}
            right={<Ionicons name="open-outline" size={16} color={colours.muted} />}
          />
          */}
          <Divider colours={colours} />
          <SettingsRow
            label={t('Privacy Policy', 'Politique de confidentialite')}
            icon="shield-checkmark"
            onPress={() => Linking.openURL('https://thewall.app/privacy').catch(() => {})}
            colours={colours}
            fonts={fonts}
            right={<Ionicons name="open-outline" size={16} color={colours.muted} />}
          />
        </Card>

        {/* Footer */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, alignItems: 'center' }}>
          <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
            TheWall v1.0.0
          </Text>
        </View>

        {!isPremium && !isAdmin && (
          <TouchableOpacity
            onPress={() => router.push('/premium' as any)}
            style={{ marginHorizontal: 20, marginBottom: 16, padding: 20, borderRadius: 16, backgroundColor: '#e8a020' + '12', borderWidth: 1, borderColor: '#e8a020' + '40' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Ionicons name="star" size={20} color="#e8a020" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: colours.text }}>Upgrade to Premium</Text>
            </View>
            <View style={{ gap: 6, marginBottom: 16 }}>
              {['Venue boosts', 'Early event access', "See who's going", 'Group chat per event'].map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={14} color="#e8a020" />
                  <Text style={{ fontSize: 13, color: colours.muted }}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={{ backgroundColor: '#e8a020', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>Get Premium - $2.99/mo</Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={signOut}
          style={{ marginHorizontal: 20, marginTop: 24, marginBottom: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#cc3b2a40', backgroundColor: '#cc3b2a12', alignItems: 'center' }}
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
                  {['Home', 'Map', 'Alerts', 'Nearby', 'My Favourites', 'Other'].map(s => (
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
                        {t(s, s === 'Home' ? 'Accueil' : s === 'Map' ? 'Carte' : s === 'Alerts' ? 'Alertes' : s === 'Nearby' ? 'Proximite' : s === 'My Favourites' ? 'Mes favoris' : 'Autre')}
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
                        const appVersion = `The Wall ${Platform.OS} ${Platform.Version}`;
                        await supabase.from('bug_reports').insert({
                          message: bugMessage.trim(),
                          screen: bugScreen || null,
                          device_id: deviceId,
                          app_version: appVersion,
                        });
                        hapticSuccess();
                        setBugSent(true);
                        const subject = encodeURIComponent('The Wall Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@routeo.ca?subject=${subject}&body=${body}`).catch(() => {});
                      } catch (e) {
                        if (__DEV__) console.warn('bug report failed:', e);
                        const subject = encodeURIComponent('The Wall Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@routeo.ca?subject=${subject}&body=${body}`).catch(() => Alert.alert(t('Could not send report', 'Impossible d\'envoyer le rapport')));
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
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowEditProfile(false)} />
        <KeyboardAvoidingView behavior="padding">
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
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
            <TextInput
              style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text, marginBottom: 16 }}
              value={editUsername}
              onChangeText={t => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="username"
              placeholderTextColor={colours.muted}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={async () => {
                setSaving(true);
                await updateProfile({ display_name: editName.trim(), username: editUsername.trim() });
                setSaving(false);
                setShowEditProfile(false);
              }}
              style={{ backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureHint={t('Unlock custom colour palettes and more', 'Debloquez les palettes de couleurs et plus encore')}
      />
    </View>
  );
}
