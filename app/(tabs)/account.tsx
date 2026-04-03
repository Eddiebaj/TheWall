let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView,
    StatusBar, Switch, Text, TextInput,
    TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { useBoard } from '../../context/BoardContext';
import { supabase } from '../../lib/supabase';
import { registerPushToken, syncSubscriptions } from '../../lib/pushNotifications';
import { SK_NOTIF_SETTINGS, SK_LEAVE_NOW_ALERTS } from '../../lib/storageKeys';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { cardShadow as sharedCardShadow } from '../../lib/styles';

type NotifSettings = {
  tripAlerts: boolean;
  serviceDisruptions: boolean;
  cityReminders: boolean;
  events: boolean;
  // Legacy keys still stored for backend sync
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

// Map master toggles to the granular keys synced to backend
const MASTER_KEY_MAP: Record<string, (keyof NotifSettings)[]> = {
  tripAlerts: ['leaveNow', 'arrivalAlerts', 'transferAtRisk', 'tripDisruption', 'lastBus'],
  serviceDisruptions: ['lrtDisruption', 'routeCancellation', 'significantDelay', 'serviceResumed', 'busRunningEarly'],
  cityReminders: ['garbageDay', 'recyclingReminder', 'roadClosureNearby', 'hydroOutage'],
  events: ['sportsGameDay', 'festivalEvents', 'liveEventsNearby'],
};

const NOTIF_SETTINGS_KEY = SK_NOTIF_SETTINGS;

export default function AccountScreen() {
  const {
    theme, setTheme, resolvedTheme, colours, fonts,
    language, setLanguage, t,
  } = useApp();
  const { savedBoard } = useBoard();

  const isLight = resolvedTheme === 'light';
  const cardShadow = isLight ? sharedCardShadow : {};

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
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
  }, []);

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
    { key: 'tripAlerts', label: t('Trip alerts', 'Alertes de trajet') },
    { key: 'serviceDisruptions', label: t('Service disruptions', 'Perturbations de service') },
    { key: 'cityReminders', label: t('City reminders', 'Rappels ville') },
    { key: 'events', label: t('Events', 'Evenements') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 }} />

        {/* Profile — simple text, no icon badge */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>{t('Settings', 'Parametres')}</Text>
        </View>

        {/* Ghost Bus Stats — compact inline */}
        {ghostStats && ghostStats.totalThisWeek > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <View style={{ backgroundColor: colours.warnBg, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.orange }}>
                {ghostStats.totalThisWeek} {t('ghost buses this week', 'bus fantomes cette semaine')}
                {ghostStats.mostAffectedRoute ? ` · ${t('Route', 'Route')} ${ghostStats.mostAffectedRoute}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Notifications — flat toggles, no sub-items, no descriptions */}
        <View style={[{
          borderWidth: 1, borderColor: colours.border, borderRadius: 16,
          marginHorizontal: 20, marginBottom: 20, overflow: 'hidden',
          backgroundColor: colours.surface,
        }, cardShadow]}>
          {notifPermission === 'denied' && (
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              style={{ backgroundColor: colours.warnBg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ flex: 1, fontSize: fonts.sm, fontWeight: '600', color: colours.orange }}>
                {t('Notifications off. Tap to fix.', 'Notifications desactivees. Appuyez pour corriger.')}
              </Text>
            </TouchableOpacity>
          )}
          {notifToggles.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: fonts.md, color: notifSettings[item.key as keyof NotifSettings] ? colours.text : colours.muted }}>
                  {item.label}
                </Text>
                <Switch
                  value={!!notifSettings[item.key as keyof NotifSettings]}
                  onValueChange={v => toggleMaster(item.key, v)}
                  trackColor={{ false: colours.border, true: colours.accent }}
                  thumbColor="white"
                  ios_backgroundColor={colours.border}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Language — plain row */}
        <View style={[{
          borderWidth: 1, borderColor: colours.border, borderRadius: 16,
          marginHorizontal: 20, marginBottom: 20, overflow: 'hidden',
          backgroundColor: colours.surface,
        }, cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: fonts.md, color: colours.text }}>
              {language === 'en' ? 'English' : 'Francais'}
            </Text>
            <Switch
              value={language === 'fr'}
              onValueChange={v => setLanguage(v ? 'fr' : 'en')}
              trackColor={{ false: colours.border, true: colours.lrt }}
              thumbColor="white"
              ios_backgroundColor={colours.border}
            />
          </View>
        </View>

        {/* Theme — keep the 3-option picker, it works */}
        <View style={[{
          borderWidth: 1, borderColor: colours.border, borderRadius: 16,
          marginHorizontal: 20, marginBottom: 20, overflow: 'hidden',
          backgroundColor: colours.surface, padding: 16,
        }, cardShadow]}>
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
                onPress={() => setTheme(th)}>
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
        </View>

        {/* Bug report — simple text link */}
        <TouchableOpacity
          onPress={() => { setBugModalVisible(true); setBugSent(false); setBugMessage(''); setBugScreen(''); }}
          style={{ paddingHorizontal: 20, paddingVertical: 14 }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t('Report a bug', 'Signaler un bogue')}
        >
          <Text style={{ fontSize: fonts.md, color: colours.red }}>{t('Report a bug', 'Signaler un bogue')}</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
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
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 16 }} />
            {bugSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="checkmark-circle" size={40} color={colours.accent} />
                <Text style={{ fontSize: fonts.xl, fontWeight: '700', color: colours.text, marginTop: 12 }}>{t('Sent', 'Envoye')}</Text>
                <TouchableOpacity
                  onPress={() => setBugModalVisible(false)}
                  style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
                  accessibilityRole="button">
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
                />

                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 4 }}>{t('Screen', 'Ecran')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['Home', 'Map', 'Planner', 'Alerts', 'Nearby', 'Saved', 'Other'].map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setBugScreen(bugScreen === s ? '' : s)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                        borderColor: bugScreen === s ? colours.red : colours.border,
                        backgroundColor: bugScreen === s ? colours.errorBg : colours.surface,
                      }}>
                      <Text style={{ fontSize: fonts.sm, color: bugScreen === s ? colours.red : colours.text }}>
                        {t(s, s === 'Home' ? 'Accueil' : s === 'Map' ? 'Carte' : s === 'Planner' ? 'Planificateur' : s === 'Alerts' ? 'Alertes' : s === 'Nearby' ? 'Proximite' : s === 'Saved' ? 'Favoris' : 'Autre')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setBugModalVisible(false)}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!bugMessage.trim()) return;
                      setBugSending(true);
                      try {
                        let deviceId: string | null = null;
                        try { deviceId = await AsyncStorage.getItem('routeo_device_id'); } catch (e) { if (__DEV__) console.warn(e); }
                        const appVersion = `RouteO ${Platform.OS} ${Platform.Version}`;
                        await supabase.from('bug_reports').insert({
                          message: bugMessage.trim(),
                          screen: bugScreen || null,
                          device_id: deviceId,
                          app_version: appVersion,
                        });
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
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: bugMessage.trim() ? colours.red : colours.border,
                    }}>
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
    </View>
  );
}
