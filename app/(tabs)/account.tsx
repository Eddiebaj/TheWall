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


// Module-scope Card and Divider components (H6)
function Card({ children, borderColor, colours, cardShadow }: {
  children: React.ReactNode; borderColor?: string;
  colours: any; cardShadow: any;
}) {
  return (
    <View style={[{
      borderWidth: 1,
      borderColor: borderColor || colours.border,
      borderRadius: 16,
      marginHorizontal: 20,
      marginBottom: 20,
      overflow: 'hidden',
      backgroundColor: colours.surface,
    }, cardShadow]}>
      {children}
    </View>
  );
}

function Divider({ colours }: { colours: any }) {
  return <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;
}

type NotifSettings = {
  // Trip Notifications
  leaveNow: boolean;
  arrivalAlerts: boolean;
  transferAtRisk: boolean;
  tripDisruption: boolean;
  lastBus: boolean;
  // Transit Alerts
  lrtDisruption: boolean;
  routeCancellation: boolean;
  significantDelay: boolean;
  serviceResumed: boolean;
  busRunningEarly: boolean;
  // City Reminders
  garbageDay: boolean;
  recyclingReminder: boolean;
  roadClosureNearby: boolean;
  hydroOutage: boolean;
  // Events & Entertainment
  sportsGameDay: boolean;
  festivalEvents: boolean;
  liveEventsNearby: boolean;
  // Legacy (mapped to new keys)
  criticalAlerts: boolean;
  delayAlerts: boolean;
};

const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
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
  const [showNotifs, setShowNotifs] = useState(false);
  const [showTripNotifs, setShowTripNotifs] = useState(false);
  const [showTransitAlerts, setShowTransitAlerts] = useState(false);
  const [showCityReminders, setShowCityReminders] = useState(false);
  const [showEventsNotifs, setShowEventsNotifs] = useState(false);
  const [ghostStats, setGhostStats] = useState<{ totalThisWeek: number; mostAffectedRoute: string | null; mostAffectedCount: number } | null>(null);

  // Bug report modal
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugScreen, setBugScreen] = useState('');
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(false);

  useEffect(() => {
    // Fetch ghost bus stats
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
    // Sync push subscription preferences to backend
    const pushTypes: (keyof NotifSettings)[] = [
      'garbageDay', 'recyclingReminder', 'sportsGameDay',
      'lrtDisruption', 'routeCancellation', 'significantDelay',
      'serviceResumed', 'arrivalAlerts', 'tripDisruption',
    ];
    // Include saved stop IDs in arrivalAlerts metadata so server can check arrivals
    const stopIds = savedBoard
      .filter((i) => i.type === 'bus_stop' || i.type === 'lrt_station')
      .map((i) => 'id' in i ? i.id : '')
      .slice(0, 10); // Limit to 10 stops
    const subs = pushTypes.map(key => ({
      type: key,
      enabled: updated[key],
      ...(key === 'arrivalAlerts' ? { metadata: { stop_ids: stopIds } } : {}),
    }));
    registerPushToken(language).then(() => syncSubscriptions(subs)).catch(() => {
      // Retry once after 2s
      setTimeout(() => {
        registerPushToken(language).then(() => syncSubscriptions(subs)).catch(() => {});
      }, 2000);
    });
  };

  const handleNotifToggle = async (key: keyof NotifSettings, value: boolean): Promise<boolean> => {
    if (value && notifPermission !== 'granted') {
      if (!Notifications) { Alert.alert(t('Not available', 'Non disponible'), t('Notifications are not available in this environment.', 'Les notifications ne sont pas disponibles dans cet environnement.')); return false; }
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') { setNotifPermission('granted'); }
      else {
        const { status } = await Notifications.requestPermissionsAsync();
        setNotifPermission(status as 'granted' | 'denied' | 'undetermined');
        if (status !== 'granted') {
          Alert.alert(
            t('Notifications disabled', 'Notifications desactivees'),
            t('Enable notifications for RouteO in your device Settings.', 'Activez les notifications pour RouteO dans les Parametres.'),
            [
              { text: t('Open Settings', 'Ouvrir les Parametres'), onPress: () => Linking.openSettings() },
              { text: t('Cancel', 'Annuler'), style: 'cancel' },
            ]
          );
          return false;
        }
      }
    }
    saveNotifSettings({ ...notifSettings, [key]: value });
    return true;
  };

  const themeLabels: Record<string, string> = {
    dark: t('Dark', 'Sombre'),
    light: t('Light', 'Clair'),
    system: t('System', 'Systeme'),
  };

  const themeIcons = {
    dark: { name: 'moon' as const, color: '#7b8abf' },
    light: { name: 'sunny' as const, color: '#e8a020' },
    system: { name: 'phone-portrait' as const, color: '#6b7f99' },
  };

  // These are thin wrappers over module-scope Card/Divider defined above
  // eslint-disable-next-line react/no-unstable-nested-components
  const CCard = ({ children, borderColor }: { children: React.ReactNode; borderColor?: string }) => (
    <Card colours={colours} cardShadow={cardShadow} borderColor={borderColor}>{children}</Card>
  );
  // eslint-disable-next-line react/no-unstable-nested-components
  const CDivider = () => <Divider colours={colours} />;

  const NOTIF_GREEN = '#34C759';
  const NOTIF_RED = '#FF3B30';

  const notifGroups = [
    {
      id: 'trip', icon: 'navigate',
      label: t('Trip Notifications', 'Notifications de trajet'),
      expanded: showTripNotifs, setExpanded: setShowTripNotifs,
      items: [
        { key: 'leaveNow' as keyof NotifSettings, icon: 'alarm' as const, label: t('Leave Now Reminder', 'Rappel de depart'), desc: t('Alerts you when to leave for a saved trip', 'Vous alerte quand partir pour un trajet sauvegarde') },
        { key: 'arrivalAlerts' as keyof NotifSettings, icon: 'notifications' as const, label: t('Arrival Alerts', "Alertes d'arrivee"), desc: t('Notifies when a bus at a saved stop is 3 min away', 'Notifie quand un bus a un arret sauvegarde est a 3 min') },
        { key: 'transferAtRisk' as keyof NotifSettings, icon: 'swap-horizontal' as const, label: t('Transfer at Risk', 'Correspondance a risque'), desc: t('Warns if your connecting bus may be missed', 'Avertit si votre correspondance risque d\'etre manquee') },
        { key: 'tripDisruption' as keyof NotifSettings, icon: 'alert-circle' as const, label: t('Trip Disruption', 'Perturbation de trajet'), desc: t('Notifies if your active route is affected mid-journey', 'Notifie si votre trajet actif est perturbe en cours de route') },
        { key: 'lastBus' as keyof NotifSettings, icon: 'moon' as const, label: t('Last Bus Warning', 'Avertissement dernier bus'), desc: t('Alerts when the last bus of the night is approaching', 'Alerte quand le dernier bus de la nuit approche') },
      ],
    },
    {
      id: 'transit', icon: 'bus',
      label: t('Transit Alerts', 'Alertes de transport'),
      expanded: showTransitAlerts, setExpanded: setShowTransitAlerts,
      items: [
        { key: 'lrtDisruption' as keyof NotifSettings, icon: 'train' as const, label: t('LRT Disruption', 'Perturbation du TLR'), desc: t('Line suspensions and major incidents', 'Suspensions de ligne et incidents majeurs') },
        { key: 'routeCancellation' as keyof NotifSettings, icon: 'close-circle' as const, label: t('Route Cancellation', 'Annulation de route'), desc: t('Specific bus route cancelled', 'Route de bus specifique annulee') },
        { key: 'significantDelay' as keyof NotifSettings, icon: 'time' as const, label: t('Significant Delay', 'Retard important'), desc: t('Bus running severely behind schedule', 'Bus tres en retard sur l\'horaire') },
        { key: 'serviceResumed' as keyof NotifSettings, icon: 'checkmark-circle' as const, label: t('Service Resumed', 'Service repris'), desc: t('Line back online after disruption', 'Ligne de retour apres perturbation') },
        { key: 'busRunningEarly' as keyof NotifSettings, icon: 'speedometer' as const, label: t('Bus Running Early', 'Bus en avance'), desc: t('Warns if your bus is ahead of schedule', 'Avertit si votre bus est en avance sur l\'horaire') },
      ],
    },
    {
      id: 'city', icon: 'home',
      label: t('City Reminders', 'Rappels de la ville'),
      expanded: showCityReminders, setExpanded: setShowCityReminders,
      items: [
        { key: 'garbageDay' as keyof NotifSettings, icon: 'trash' as const, label: t('Garbage Day', 'Jour de collecte'), desc: t('8 pm reminder the evening before collection', 'Rappel a 20h la veille de la collecte') },
        { key: 'recyclingReminder' as keyof NotifSettings, icon: 'leaf' as const, label: t('Recycling vs Green Bin', 'Recyclage vs bac vert'), desc: t('Alternating week reminder', 'Rappel de semaine alternee') },
        { key: 'roadClosureNearby' as keyof NotifSettings, icon: 'warning' as const, label: t('Road Closure Nearby', 'Fermeture de route a proximite'), desc: t('Closures affecting your saved area', 'Fermetures affectant votre secteur sauvegarde') },
        { key: 'hydroOutage' as keyof NotifSettings, icon: 'flash' as const, label: t('Hydro Ottawa Outage', 'Panne Hydro Ottawa'), desc: t('Outage reported in your area', 'Panne signalee dans votre secteur') },
      ],
    },
    {
      id: 'events', icon: 'ticket',
      label: t('Events & Entertainment', 'Evenements & divertissement'),
      expanded: showEventsNotifs, setExpanded: setShowEventsNotifs,
      items: [
        { key: 'sportsGameDay' as keyof NotifSettings, icon: 'american-football' as const, label: t('Ottawa Sports Game Day', 'Jour de match Ottawa'), desc: t('Sens, REDBLACKS, Atletico Ottawa', 'Sens, REDBLACKS, Atletico Ottawa') },
        { key: 'festivalEvents' as keyof NotifSettings, icon: 'musical-notes' as const, label: t('Bluesfest / NAC Events', 'Bluesfest / Evenements CNA'), desc: t('Evening before reminder', 'Rappel la veille au soir') },
        { key: 'liveEventsNearby' as keyof NotifSettings, icon: 'location' as const, label: t('Live Events Nearby', 'Evenements en direct a proximite'), desc: t('Events happening near your location this week', 'Evenements pres de votre position cette semaine') },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Top spacer */}
        <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 }} />

        {/* Profile */}
        <View style={[{
          flexDirection: 'row', alignItems: 'center', gap: 14,
          borderWidth: 1, borderColor: colours.border, borderRadius: 16,
          marginHorizontal: 20, marginBottom: 24, padding: 16,
          backgroundColor: colours.surface,
        }, cardShadow]}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: colours.accent + '18',
            borderWidth: 1, borderColor: colours.accent + '40',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="person-circle" size={28} color={colours.accent} />
          </View>
          <View>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{t('Ottawa Rider', 'Usager Ottawa')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Coming soon', 'Bientot disponible')}</Text>
          </View>
        </View>

        {/* Ghost Bus Stats */}
        {ghostStats && ghostStats.totalThisWeek > 0 && (
          <CCard>
            <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF9500' + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="warning-outline" size={20} color="#FF9500" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                  {t(`Ghost buses reported this week: ${ghostStats.totalThisWeek}`, `Bus fant\u00f4mes signal\u00e9s cette semaine: ${ghostStats.totalThisWeek}`)}
                </Text>
                {ghostStats.mostAffectedRoute && (
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                    {t(`Most affected: Route ${ghostStats.mostAffectedRoute} (${ghostStats.mostAffectedCount} reports)`,
                       `Plus touch\u00e9: Route ${ghostStats.mostAffectedRoute} (${ghostStats.mostAffectedCount} signalements)`)}
                  </Text>
                )}
              </View>
            </View>
          </CCard>
        )}

        {/* NOTIFICATIONS (collapsible) */}
        <CCard>
          <TouchableOpacity
            onPress={() => setShowNotifs(!showNotifs)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('NOTIFICATIONS', 'NOTIFICATIONS')}
            </Text>
            <Ionicons name={showNotifs ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
          </TouchableOpacity>
          {showNotifs && (
            <>
              {notifPermission === 'denied' && (
                <TouchableOpacity
                  onPress={() => Linking.openSettings()}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 12, borderRadius: 12, borderWidth: 1,
                    backgroundColor: '#e8a020' + '15', borderColor: '#e8a020' + '40',
                    marginHorizontal: 16, marginBottom: 12,
                  }}
                >
                  <Ionicons name="notifications-off" size={16} color="#e8a020" />
                  <Text style={{ flex: 1, fontSize: fonts.sm, color: '#e8a020', fontWeight: '600' }}>
                    {t('Notifications are disabled. Tap to open Settings.', 'Les notifications sont desactivees. Appuyez pour ouvrir les Parametres.')}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#e8a020" />
                </TouchableOpacity>
              )}

              {notifGroups.map((group, gi) => {
                const masterOn = group.items.some(item => notifSettings[item.key]);
                return (
                  <View key={group.id}>
                    {gi > 0 && <CDivider />}
                    {/* Group header with master toggle */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colours.bg + '80' }}>
                      <TouchableOpacity
                        onPress={() => group.setExpanded(!group.expanded)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={group.icon as any} size={14} color={masterOn ? NOTIF_GREEN : colours.muted} />
                        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: masterOn ? colours.text : colours.muted }}>
                          {group.label}
                        </Text>
                        <Ionicons name={group.expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colours.muted} />
                      </TouchableOpacity>
                      <Switch
                        value={masterOn}
                        onValueChange={v => {
                          const updated = { ...notifSettings };
                          for (const item of group.items) updated[item.key] = v;
                          if (v && notifPermission !== 'granted') {
                            handleNotifToggle(group.items[0].key, true).then((granted) => {
                              if (!granted) return;
                              const rest = { ...notifSettings };
                              for (const item of group.items) rest[item.key] = true;
                              saveNotifSettings(rest);
                            });
                          } else {
                            saveNotifSettings(updated);
                          }
                          if (!group.expanded && v) group.setExpanded(true);
                        }}
                        trackColor={{ false: NOTIF_RED + '40', true: NOTIF_GREEN }}
                        thumbColor="white"
                        ios_backgroundColor={NOTIF_RED + '40'}
                      />
                    </View>

                    {/* Sub-toggles */}
                    {group.expanded && group.items.map((item, i) => (
                      <View key={item.key} style={{ opacity: masterOn ? 1 : 0.4 }}>
                        {i > 0 && <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 32 }} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 32, paddingRight: 16, paddingVertical: 12 }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colours.muted + '15', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={item.icon} size={14} color={colours.muted} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: masterOn ? colours.text : colours.muted }}>{item.label}</Text>
                            <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{item.desc}</Text>
                          </View>
                          <Switch
                            value={notifSettings[item.key]}
                            disabled={!masterOn}
                            onValueChange={v => {
                              if (v && notifPermission !== 'granted') {
                                handleNotifToggle(item.key, true).then(granted => {
                                  if (granted) saveNotifSettings({ ...notifSettings, [item.key]: true });
                                });
                              } else {
                                saveNotifSettings({ ...notifSettings, [item.key]: v });
                              }
                            }}
                            trackColor={{ false: NOTIF_RED + '40', true: NOTIF_GREEN }}
                            thumbColor="white"
                            ios_backgroundColor={NOTIF_RED + '40'}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </CCard>

        {/* PREFERENCES */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('PREFERENCES', 'PREFERENCES')}
        </Text>

        {/* Language */}
        <CCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>
                {language === 'en' ? 'English' : 'Francais'}
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {language === 'en' ? 'Switch to French' : 'Passer en anglais'}
              </Text>
            </View>
            <Switch
              value={language === 'fr'}
              onValueChange={v => setLanguage(v ? 'fr' : 'en')}
              trackColor={{ false: colours.border, true: colours.lrt }}
              thumbColor="white"
            />
          </View>
        </CCard>

        {/* Theme */}
        <CCard>
          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>{t('Theme', 'Theme')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
            {(['dark', 'light', 'system'] as const).map(th => (
              <TouchableOpacity
                key={th}
                style={{
                  flex: 1, alignItems: 'center', gap: 6,
                  borderWidth: 1, borderRadius: 12, paddingVertical: 10,
                  backgroundColor: theme === th ? colours.accent + '18' : colours.bg,
                  borderColor: theme === th ? colours.accent : colours.border,
                }}
                onPress={() => setTheme(th)}>
                <Ionicons
                  name={themeIcons[th].name}
                  size={20}
                  color={theme === th ? colours.accent : themeIcons[th].color}
                />
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: theme === th ? colours.accent : colours.muted }}>
                  {themeLabels[th]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </CCard>

        {/* ABOUT */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('ABOUT', 'A PROPOS')}
        </Text>
        <CCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 8,
                backgroundColor: colours.accent + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="bus" size={18} color={colours.accent} />
              </View>
              <View>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>RouteO v{require('../../app.json').expo.version}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Built in Ottawa for Ottawa', 'Fait a Ottawa pour Ottawa')}</Text>
              </View>
            </View>
          </View>
          <CDivider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 8,
                backgroundColor: colours.accent + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="radio" size={18} color={colours.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{t('Data Source', 'Source de donnees')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('OC Transpo GTFS-RT · Live every 30s', 'OC Transpo GTFS-RT · En direct toutes les 30s')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>LIVE</Text>
            </View>
          </View>
        </CCard>

        {/* Bug Report */}
        <CCard>
          <TouchableOpacity
            onPress={() => { setBugModalVisible(true); setBugSent(false); setBugMessage(''); setBugScreen(''); }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('Report a bug', 'Signaler un bogue')}
          >
            <View style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundColor: '#cc3b2a' + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="bug-outline" size={18} color="#cc3b2a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{t('Report a Bug', 'Signaler un bogue')}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Send us feedback or report an issue', 'Envoyez-nous vos commentaires ou signalez un probleme')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colours.muted} />
          </TouchableOpacity>
        </CCard>

        <Text style={{ textAlign: 'center', color: colours.muted, fontSize: 12, paddingVertical: 20 }}>RouteO+ coming soon</Text>

      </ScrollView>

      {/* Bug Report Modal */}
      <Modal visible={bugModalVisible} animationType="slide" transparent onRequestClose={() => setBugModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 16 }} />
            {bugSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                <Ionicons name="checkmark-circle" size={48} color="#00A78D" />
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginTop: 12 }}>{t('Thanks for your report!', 'Merci pour votre rapport!')}</Text>
                <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                  {t('We\'ll look into it. You can also follow up by email.', 'Nous allons examiner le probleme. Vous pouvez aussi nous contacter par courriel.')}
                </Text>
                <TouchableOpacity
                  onPress={() => setBugModalVisible(false)}
                  style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
                  accessibilityRole="button">
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>{t('Done', 'Fermer')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{t('Report a Bug', 'Signaler un bogue')}</Text>
                <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16 }}>{t('Help us improve RouteO for everyone', 'Aidez-nous a ameliorer RouteO pour tous')}</Text>

                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('What happened?', 'Que s\'est-il passe?')} *</Text>
                <TextInput
                  style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colours.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                  placeholder={t('Describe the issue...', 'Decrivez le probleme...')}
                  placeholderTextColor={colours.muted}
                  value={bugMessage}
                  onChangeText={setBugMessage}
                  multiline
                />

                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Which screen?', 'Quel ecran?')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['Home', 'Map', 'Planner', 'Alerts', 'Nearby', 'Saved', 'Other'].map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setBugScreen(bugScreen === s ? '' : s)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                        borderColor: bugScreen === s ? '#cc3b2a' : colours.border,
                        backgroundColor: bugScreen === s ? '#cc3b2a' + '18' : colours.surface,
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: bugScreen === s ? '#cc3b2a' : colours.text }}>
                        {t(s, s === 'Home' ? 'Accueil' : s === 'Map' ? 'Carte' : s === 'Planner' ? 'Planificateur' : s === 'Alerts' ? 'Alertes' : s === 'Nearby' ? 'Proximite' : s === 'Saved' ? 'Favoris' : 'Autre')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setBugModalVisible(false)}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
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
                        // Also open mailto as fallback
                        const subject = encodeURIComponent('RouteO Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@routeo.ca?subject=${subject}&body=${body}`).catch(() => {});
                      } catch (e) {
                        if (__DEV__) console.warn('bug report failed:', e);
                        // Fallback to email only
                        const subject = encodeURIComponent('RouteO Bug Report');
                        const body = encodeURIComponent(`${bugMessage.trim()}\n\n---\nScreen: ${bugScreen || 'N/A'}\nDevice: ${Platform.OS} ${Platform.Version}\nDate: ${new Date().toLocaleDateString('en-CA')}\n`);
                        Linking.openURL(`mailto:support@routeo.ca?subject=${subject}&body=${body}`).catch(() => Alert.alert(t('Could not send report', 'Impossible d\'envoyer le rapport')));
                        setBugSent(true);
                      }
                      setBugSending(false);
                    }}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: bugMessage.trim() ? '#cc3b2a' : colours.border,
                    }}>
                    {bugSending
                      ? <ActivityIndicator color="white" size="small" />
                      : <Text style={{ fontSize: 15, fontWeight: '700', color: bugMessage.trim() ? 'white' : colours.muted }}>{t('Submit', 'Soumettre')}</Text>
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
