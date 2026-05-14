let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, DeviceEventEmitter, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView,
    StatusBar, Switch, Text, TextInput,
    TouchableOpacity, View,
} from 'react-native';
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
import ClassScheduleModal from '../../components/ClassScheduleModal';
import { ClassSchedule } from '../../lib/scheduleData';
import { SK_CLASS_SCHEDULE } from '../../lib/storageKeys';
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
  cityReminders: boolean;
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
  cityReminders: true,
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
  cityReminders: [],
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

  const [classModalVisible, setClassModalVisible] = useState(false);
  const [classSchedule, setClassSchedule] = useState<ClassSchedule | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const isLight = resolvedTheme === 'light';
  const cardShadow = isLight ? sharedCardShadow : {};

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [commuteAlert, setCommuteAlert] = useState<CommuteAlertSettings>({ enabled: false, hour: 7, minute: 15 });
  const [lastMinuteDeals, setLastMinuteDeals] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem('routeo_lastminute_notifs').then(v => setLastMinuteDeals(v === 'true'));
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
  const [isStudent, setIsStudent] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('routeo_is_student').then(val => setIsStudent(val === 'true')).catch(() => {});
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
    AsyncStorage.getItem(SK_CLASS_SCHEDULE).then(val => {
      if (val) { try { setClassSchedule(JSON.parse(val)); } catch {} }
    }).catch(() => {});
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
    { key: 'tripAlerts', label: t('Trip alerts', 'Alertes de trajet'), icon: 'bus' },
    { key: 'serviceDisruptions', label: t('Service disruptions', 'Perturbations de service'), icon: 'warning' },
    { key: 'cityReminders', label: t('City reminders', 'Rappels ville'), icon: 'home' },
    { key: 'events', label: t('Events', '\u00c9v\u00e9nements'), icon: 'calendar' },
    { key: 'commuteDeals', label: t('On my way home deals', 'Offres sur mon chemin'), icon: 'navigate' },
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

  const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[{
      borderWidth: 1, borderColor: colours.border, borderRadius: 16,
      marginHorizontal: 20, marginBottom: 20, overflow: 'hidden',
      backgroundColor: colours.surface,
    }, cardShadow, style]}>
      {children}
    </View>
  );

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
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: isAdmin ? '#e8a020' + '25' : colours.accent + '18', borderWidth: 1, borderColor: isAdmin ? '#e8a020' + '60' : colours.accent + '40' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: isAdmin ? '#e8a020' : colours.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {isAdmin ? 'Admin' : isPremium ? 'Premium' : 'Free'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: colours.muted }}>@{profile?.username || 'username'}</Text>
              {profile?.campus && (
                <Text style={{ fontSize: 12, color: colours.accent, marginTop: 2 }}>
                  {profile.campus === 'carleton' ? 'Carleton University' : profile.campus === 'uottawa' ? 'University of Ottawa' : profile.campus === 'algonquin' ? 'Algonquin College' : profile.campus}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text
            style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text, marginTop: 20 }}
            accessibilityRole="header"
          >
            {t('Settings', 'Param\u00e8tres')}
          </Text>
        </View>

        {/* Ghost Bus Stats */}
        {ghostStats && ghostStats.totalThisWeek > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <View style={{ backgroundColor: colours.warnBg, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="eye-off" size={18} color={colours.orange} />
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.orange, flex: 1 }}>
                {ghostStats.totalThisWeek} {t('ghost buses this week', 'bus fantomes cette semaine')}
                {ghostStats.mostAffectedRoute ? ` · ${t('Route', 'Route')} ${ghostStats.mostAffectedRoute}` : ''}
              </Text>
            </View>
          </View>
        )}

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
                {t('Notifications off — tap to enable', 'Notifications desactivees — appuyez pour activer')}
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

        {/* ── MORNING COMMUTE ── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <Ionicons name="sunny-outline" size={18} color={commuteAlert.enabled ? colours.accent : colours.muted} />
            <Text style={{ fontSize: fonts.md, color: commuteAlert.enabled ? colours.text : colours.muted, flex: 1 }}>
              {t('Morning commute alert', 'Alerte trajet du matin')}
            </Text>
            <Switch
              value={commuteAlert.enabled}
              onValueChange={async (v) => {
                if (v) {
                  const granted = await requestPermissionIfNeeded();
                  if (!granted) return;
                }
                hapticLight();
                const updated = { ...commuteAlert, enabled: v };
                setCommuteAlert(updated);
                saveCommuteAlertSettings(updated, language);
              }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
              accessibilityLabel={t('Morning commute alert', 'Alerte trajet du matin')}
            />
          </View>
          {commuteAlert.enabled && (
            <>
              <Divider colours={colours} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 8 }}>
                  {t('Daily notification time', 'Heure de notification quotidienne')}
                </Text>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={(() => { const d = new Date(); d.setHours(commuteAlert.hour, commuteAlert.minute, 0, 0); return d; })()}
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    onChange={(_, date) => {
                      if (!date) return;
                      const updated = { ...commuteAlert, hour: date.getHours(), minute: date.getMinutes() };
                      setCommuteAlert(updated);
                      saveCommuteAlertSettings(updated, language);
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setCommuteTimePickerVisible(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' }}>
                      <Ionicons name="time-outline" size={16} color={colours.accent} />
                      <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>
                        {`${commuteAlert.hour.toString().padStart(2, '0')}:${commuteAlert.minute.toString().padStart(2, '0')}`}
                      </Text>
                    </TouchableOpacity>
                    {commuteTimePickerVisible && (
                      <DateTimePicker
                        value={(() => { const d = new Date(); d.setHours(commuteAlert.hour, commuteAlert.minute, 0, 0); return d; })()}
                        mode="time"
                        display="spinner"
                        minuteInterval={5}
                        onChange={(_, date) => {
                          setCommuteTimePickerVisible(false);
                          if (!date) return;
                          const updated = { ...commuteAlert, hour: date.getHours(), minute: date.getMinutes() };
                          setCommuteAlert(updated);
                          saveCommuteAlertSettings(updated, language);
                        }}
                      />
                    )}
                  </>
                )}
                <Text style={{ fontSize: fonts.sm - 1, color: colours.muted, marginTop: 6 }}>
                  {t('Get a daily reminder to check live arrivals for your frequent routes before heading out.',
                     'Recevez un rappel quotidien pour consulter les arrivees en direct de vos trajets frequents.')}
                </Text>
              </View>
            </>
          )}
        </Card>

        {/* ── LAST-MINUTE DEALS ── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>Last-minute deals</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Get notified when a deal near you is about to expire</Text>
            </View>
            <Switch
              value={lastMinuteDeals}
              onValueChange={async (val) => {
                setLastMinuteDeals(val);
                await AsyncStorage.setItem('routeo_lastminute_notifs', val ? 'true' : 'false');
              }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
            />
          </View>
        </Card>

        {/* ── STUDENT MODE ── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{t('Student Mode', 'Mode étudiant')}</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>{t('Shows class schedule and campus info on My Board', 'Affiche l\'horaire et infos campus')}</Text>
            </View>
            <Switch
              value={isStudent}
              onValueChange={async (val) => {
                setIsStudent(val);
                await AsyncStorage.setItem('routeo_is_student', val ? 'true' : 'false');
              }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
            />
          </View>
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

        {/* Language */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <Ionicons name="language" size={18} color={colours.accent} />
            <Text style={{ fontSize: fonts.md, color: colours.text, flex: 1 }}>
              {language === 'en' ? 'English' : 'Fran\u00e7ais'}
            </Text>
            <Switch
              value={language === 'fr'}
              onValueChange={v => { hapticLight(); setLanguage(v ? 'fr' : 'en'); }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
              accessibilityLabel={t('Toggle language', 'Changer de langue')}
            />
          </View>
        </Card>

        {/* ── ACCESSIBILITY ── */}
        <SectionHeader label={t('Accessibility', 'Accessibilit\u00e9')} icon="accessibility-outline" colours={colours} fonts={fonts} />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <Ionicons name="text" size={18} color={largeText ? colours.accent : colours.muted} />
            <Text style={{ fontSize: fonts.md, color: colours.text, flex: 1 }}>
              {t('Larger text', 'Texte agrandi')}
            </Text>
            <Switch
              value={largeText}
              onValueChange={v => { hapticLight(); setLargeText(v); }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
              accessibilityLabel={t('Larger text', 'Texte agrandi')}
            />
          </View>
          <Divider colours={colours} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <Ionicons name="contrast" size={18} color={highContrast ? colours.accent : colours.muted} />
            <Text style={{ fontSize: fonts.md, color: colours.text, flex: 1 }}>
              {t('High contrast', 'Contraste \u00e9lev\u00e9')}
            </Text>
            <Switch
              value={highContrast}
              onValueChange={v => { hapticLight(); setHighContrast(v); }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
              accessibilityLabel={t('High contrast', 'Contraste \u00e9lev\u00e9')}
            />
          </View>
          <Divider colours={colours} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
            <Ionicons name="flash-off" size={18} color={reducedMotion ? colours.accent : colours.muted} />
            <Text style={{ fontSize: fonts.md, color: colours.text, flex: 1 }}>
              {t('Reduce motion', 'R\u00e9duire les animations')}
            </Text>
            <Switch
              value={reducedMotion}
              onValueChange={v => { hapticLight(); setReducedMotion(v); }}
              trackColor={{ false: colours.border, true: colours.accent }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
              accessibilityLabel={t('Reduce motion', 'R\u00e9duire les animations')}
            />
          </View>
        </Card>

        {/* ── MY PLACES ── */}
        <SectionHeader label={t('My Places', 'Mes lieux')} icon="location-outline" colours={colours} fonts={fonts} />
        <Card>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name="home-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted }}>{t('Home', 'Domicile')}</Text>
            </View>
            <TextInput
              style={{ fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: homeSaveStatus === 'error' ? '#e74c3c' : homeSaveStatus === 'saved' ? '#00C07A' : colours.border }}
              placeholder={t('e.g. 123 Main St, Ottawa', 'ex. 123 rue Principale, Ottawa')}
              placeholderTextColor={colours.muted}
              value={homeAddress}
              onChangeText={text => { setHomeAddress(text); setHomeSaveStatus('idle'); }}
              returnKeyType="done"
              onSubmitEditing={async () => {
                if (!homeAddress.trim()) { await AsyncStorage.removeItem(SK_HOME_ADDRESS).catch(() => {}); setHomeSaveStatus('idle'); return; }
                setHomeSaveStatus('saving');
                try {
                  const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=geocode&address=${encodeURIComponent(homeAddress + ', Ottawa, ON')}`);
                  if (r.ok) {
                    const d = await r.json();
                    if (d.results?.[0]?.geometry?.location) {
                      const { lat, lng } = d.results[0].geometry.location;
                      await AsyncStorage.setItem(SK_HOME_ADDRESS, JSON.stringify({ label: homeAddress, lat, lng }));
                      setHomeSaveStatus('saved');
                      return;
                    }
                  }
                  setHomeSaveStatus('error');
                } catch { setHomeSaveStatus('error'); }
              }}
            />
            {homeSaveStatus === 'saved' && <Text style={{ fontSize: fonts.sm, color: '#00C07A', marginTop: 4 }}>{t('Saved', 'Enregistre')} ✓</Text>}
            {homeSaveStatus === 'error' && <Text style={{ fontSize: fonts.sm, color: '#e74c3c', marginTop: 4 }}>{t('Address not found', 'Adresse introuvable')}</Text>}
            {homeSaveStatus === 'saving' && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4 }}>{t('Saving...', 'Enregistrement...')}</Text>}
          </View>
          <Divider colours={colours} />
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name="briefcase-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted }}>{t('Work', 'Travail')}</Text>
            </View>
            <TextInput
              style={{ fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: workSaveStatus === 'error' ? '#e74c3c' : workSaveStatus === 'saved' ? '#00C07A' : colours.border }}
              placeholder={t('e.g. 90 Sparks St, Ottawa', 'ex. 90 rue Sparks, Ottawa')}
              placeholderTextColor={colours.muted}
              value={workAddress}
              onChangeText={text => { setWorkAddress(text); setWorkSaveStatus('idle'); }}
              returnKeyType="done"
              onSubmitEditing={async () => {
                if (!workAddress.trim()) { await AsyncStorage.removeItem(SK_WORK_PLACE).catch(() => {}); setWorkSaveStatus('idle'); return; }
                setWorkSaveStatus('saving');
                try {
                  const r = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=geocode&address=${encodeURIComponent(workAddress + ', Ottawa, ON')}`);
                  if (r.ok) {
                    const d = await r.json();
                    if (d.results?.[0]?.geometry?.location) {
                      const { lat, lng } = d.results[0].geometry.location;
                      await AsyncStorage.setItem(SK_WORK_PLACE, JSON.stringify({ label: workAddress, lat, lng }));
                      setWorkSaveStatus('saved');
                      return;
                    }
                  }
                  setWorkSaveStatus('error');
                } catch { setWorkSaveStatus('error'); }
              }}
            />
            {workSaveStatus === 'saved' && <Text style={{ fontSize: fonts.sm, color: '#00C07A', marginTop: 4 }}>{t('Saved', 'Enregistre')} ✓</Text>}
            {workSaveStatus === 'error' && <Text style={{ fontSize: fonts.sm, color: '#e74c3c', marginTop: 4 }}>{t('Address not found', 'Adresse introuvable')}</Text>}
            {workSaveStatus === 'saving' && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4 }}>{t('Saving...', 'Enregistrement...')}</Text>}
          </View>
          <Divider colours={colours} />
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem(SK_RECENT_SEARCHES).catch(() => {});
              setRecentSearchCount(0);
              DeviceEventEmitter.emit('clearRecentSearches');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
            disabled={recentSearchCount === 0}
          >
            <Ionicons name="time-outline" size={18} color={recentSearchCount === 0 ? colours.muted : '#e74c3c'} />
            <Text style={{ fontSize: fonts.md, color: recentSearchCount === 0 ? colours.muted : '#e74c3c', flex: 1 }}>
              {recentSearchCount === 0 ? t('No search history', 'Aucun historique de recherche') : t(`Clear search history (${recentSearchCount})`, `Effacer l'historique (${recentSearchCount})`)}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* ── TOOLS ── */}
        <SectionHeader label={t('Tools', 'Outils')} icon="build-outline" colours={colours} fonts={fonts} />
        <Card>
          <SettingsRow
            label={t('Class Schedule', 'Horaire de cours')}
            icon="school"
            onPress={() => setClassModalVisible(true)}
            colours={colours}
            fonts={fonts}
          />
          <Divider colours={colours} />
          <SettingsRow
            label={t('Commute Insights', 'Statistiques de trajet')}
            icon="analytics"
            onPress={() => router.push('/insights' as any)}
            colours={colours}
            fonts={fonts}
          />
          <Divider colours={colours} />
          <SettingsRow
            label={t('Service Alerts', 'Alertes de service')}
            icon="megaphone"
            onPress={() => router.push('/(tabs)/alerts' as any)}
            colours={colours}
            fonts={fonts}
          />
        </Card>

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
            onPress={() => Linking.openURL('https://routeo.ca/privacy').catch(() => {})}
            colours={colours}
            fonts={fonts}
            right={<Ionicons name="open-outline" size={16} color={colours.muted} />}
          />
        </Card>

        {/* Footer */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, alignItems: 'center' }}>
          <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
            RouteO v{require('../../app.json').expo.version}
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
            {t('Live data from OC Transpo and STO', 'Donnees en direct d\'OC Transpo et STO')}
          </Text>
        </View>

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
                        const appVersion = `RouteO ${Platform.OS} ${Platform.Version}`;
                        await supabase.from('bug_reports').insert({
                          message: bugMessage.trim(),
                          screen: bugScreen || null,
                          device_id: deviceId,
                          app_version: appVersion,
                        });
                        hapticSuccess();
                        setBugSent(true);
                        const subject = encodeURIComponent('RouteO Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@routeo.ca?subject=${subject}&body=${body}`).catch(() => {});
                      } catch (e) {
                        if (__DEV__) console.warn('bug report failed:', e);
                        const subject = encodeURIComponent('RouteO Bug Report');
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

      <ClassScheduleModal
        visible={classModalVisible}
        onClose={() => setClassModalVisible(false)}
        colours={colours}
        fonts={fonts}
        t={t}
        language={language}
        schedule={classSchedule}
        onSave={setClassSchedule}
      />
      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureHint={t('Unlock custom colour palettes and more', 'Debloquez les palettes de couleurs et plus encore')}
      />
    </View>
  );
}
