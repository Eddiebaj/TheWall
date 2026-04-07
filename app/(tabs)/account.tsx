let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView,
    StatusBar, Switch, Text, TextInput,
    TouchableOpacity, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, PALETTE_LABELS, PaletteId } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { supabase } from '../../lib/supabase';
import { registerPushToken, syncSubscriptions } from '../../lib/pushNotifications';
import { SK_NOTIF_SETTINGS, SK_DEVICE_ID } from '../../lib/storageKeys';
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
} from '../../lib/commuteNotifications';

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
  garbageDay: boolean;
  recyclingReminder: boolean;
  roadClosureNearby: boolean;
  hydroOutage: boolean;
  sportsGameDay: boolean;
  festivalEvents: boolean;
  liveEventsNearby: boolean;
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
  garbageDay: true,
  recyclingReminder: true,
  roadClosureNearby: false,
  hydroOutage: true,
  sportsGameDay: true,
  festivalEvents: false,
  liveEventsNearby: false,
  criticalAlerts: true,
  delayAlerts: false,
};

const MASTER_KEY_MAP: Record<string, (keyof NotifSettings)[]> = {
  tripAlerts: ['leaveNow', 'arrivalAlerts', 'transferAtRisk', 'tripDisruption', 'lastBus'],
  serviceDisruptions: ['lrtDisruption', 'routeCancellation', 'significantDelay', 'serviceResumed', 'busRunningEarly'],
  cityReminders: ['garbageDay', 'recyclingReminder', 'roadClosureNearby', 'hydroOutage'],
  events: ['sportsGameDay', 'festivalEvents', 'liveEventsNearby'],
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
    palette, setPalette,
    largeText, setLargeText,
    highContrast, setHighContrast,
    reducedMotion, setReducedMotion,
  } = useApp();
  const { savedBoard } = useBoard();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [classModalVisible, setClassModalVisible] = useState(false);
  const [classSchedule, setClassSchedule] = useState<ClassSchedule | null>(null);

  const isLight = resolvedTheme === 'light';
  const cardShadow = isLight ? sharedCardShadow : {};

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [commuteAlert, setCommuteAlert] = useState<CommuteAlertSettings>({ enabled: false, hour: 7, minute: 15 });
  const [commuteTimePickerVisible, setCommuteTimePickerVisible] = useState(false);
  const [ghostStats, setGhostStats] = useState<{ totalThisWeek: number; mostAffectedRoute: string | null; mostAffectedCount: number } | null>(null);

  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugScreen, setBugScreen] = useState('');
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(false);

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
      'garbageDay', 'recyclingReminder', 'sportsGameDay',
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
    registerPushToken(language).then(() => syncSubscriptions(subs)).catch(() => {
      setTimeout(() => {
        registerPushToken(language).then(() => syncSubscriptions(subs)).catch(() => {});
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
  ];

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

        <View style={{ paddingTop: insets.top + 12, paddingBottom: 12 }} />

        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text
            style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}
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

          {/* Palette picker */}
          <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginTop: 16, marginBottom: 12 }}>
            {t('Color palette', 'Palette de couleurs')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(Object.keys(PALETTE_LABELS) as PaletteId[]).map(pid => {
              const pl = PALETTE_LABELS[pid];
              const active = palette === pid;
              return (
                <TouchableOpacity
                  key={pid}
                  onPress={() => { hapticLight(); setPalette(pid); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? pl.swatch : colours.border,
                    backgroundColor: active ? pl.swatch + '18' : colours.bg,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={language === 'fr' ? pl.fr : pl.en}
                >
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pl.swatch }} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: active ? '700' : '500', color: active ? pl.swatch : colours.muted }}>
                    {language === 'fr' ? pl.fr : pl.en}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
                  {['Home', 'Map', 'Planner', 'Alerts', 'Nearby', 'My Stops', 'Other'].map(s => (
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
                        {t(s, s === 'Home' ? 'Accueil' : s === 'Map' ? 'Carte' : s === 'Planner' ? 'Planificateur' : s === 'Alerts' ? 'Alertes' : s === 'Nearby' ? 'Proximite' : s === 'My Stops' ? 'Mes arr\u00eats' : 'Autre')}
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
    </View>
  );
}
