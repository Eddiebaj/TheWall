import * as Location from 'expo-location';
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    Alert, Linking, Modal, Platform, ScrollView,
    StatusBar, Switch, Text,
    TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { registerPushToken, syncSubscriptions } from '../../lib/pushNotifications';
import { SK_FAVS, SK_SAVED_PLACES, SK_SAVED_BOARD, SK_NOTIF_SETTINGS, SK_TRIP_SHARING, SK_TRIP_HISTORY } from '../../lib/storageKeys';

const isNightTime = () => { const h = new Date().getHours(); return h >= 21 || h < 4; };

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
    theme, setTheme, colours, fonts,
    largeText, setLargeText,
    highContrast, setHighContrast,
    reducedMotion, setReducedMotion,
    language, setLanguage, t,
  } = useApp();

  const isLight = theme === 'light';

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  const [tripSharing, setTripSharing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNight, setIsNight] = useState(isNightTime());
  const [notifSettings, setNotifSettings] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showTripNotifs, setShowTripNotifs] = useState(false);
  const [showTransitAlerts, setShowTransitAlerts] = useState(false);
  const [showCityReminders, setShowCityReminders] = useState(false);
  const [showEventsNotifs, setShowEventsNotifs] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [savedFavs, setSavedFavs] = useState<any[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<any[]>([]);
  const [savedBoard, setSavedBoard] = useState<any[]>([]);
  const [commuteStats, setCommuteStats] = useState<{ tripsThisWeek: number; totalMinutes: number; avgDuration: number; topRoute: string | null } | null>(null);
  const [fareStats, setFareStats] = useState<{ tripsToday: number; tripsWeek: number; tripsMonth: number; costToday: number; costWeek: number; costMonth: number } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      try {
        if (!val) return;
        const trips = JSON.parse(val);
        if (!Array.isArray(trips) || trips.length === 0) return;
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
        const weekTrips = trips.filter((tr: any) => new Date(tr.plannedAt).getTime() >= weekStart.getTime());
        const totalMins = weekTrips.reduce((s: number, tr: any) => s + (tr.durationMins || 0), 0);
        const routeCounts: Record<string, number> = {};
        for (const tr of weekTrips) {
          const label = `${tr.fromLabel} → ${tr.toLabel}`;
          routeCounts[label] = (routeCounts[label] || 0) + 1;
        }
        const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        setCommuteStats({
          tripsThisWeek: weekTrips.length,
          totalMinutes: totalMins,
          avgDuration: weekTrips.length > 0 ? Math.round(totalMins / weekTrips.length) : 0,
          topRoute,
        });
      } catch {}
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SK_TRIP_HISTORY).then(val => {
      try {
        if (!val) return;
        const trips = JSON.parse(val);
        if (!Array.isArray(trips) || trips.length === 0) return;
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const day = now.getDay(); // 0=Sun
        const mondayOffset = day === 0 ? 6 : day - 1;
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - mondayOffset); weekStart.setHours(0, 0, 0, 0);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        let tripsToday = 0, tripsWeek = 0, tripsMonth = 0;
        for (const tr of trips) {
          const d = new Date(tr.plannedAt);
          if (d.getTime() >= monthStart.getTime()) { tripsMonth++; }
          if (d.getTime() >= weekStart.getTime()) { tripsWeek++; }
          if (d.getTime() >= todayStart.getTime()) { tripsToday++; }
        }
        const FARE = 4.10;
        setFareStats({
          tripsToday, tripsWeek, tripsMonth,
          costToday: tripsToday * FARE,
          costWeek: tripsWeek * FARE,
          costMonth: tripsMonth * FARE,
        });
      } catch {}
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setIsNight(isNightTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_SETTINGS_KEY).then(val => {
      if (val) {
        try { setNotifSettings({ ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(val) }); }
        catch (e) { if (__DEV__) console.warn('Failed to parse notif settings:', e); }
      }
    }).catch(e => { if (__DEV__) console.warn('AsyncStorage notif read error:', e); });
    if (Notifications) Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status as any)).catch(e => { if (__DEV__) console.warn('Notification permission check failed:', e); });
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
    const subs = pushTypes.map(key => ({ type: key, enabled: updated[key] }));
    registerPushToken(language).then(() => syncSubscriptions(subs)).catch(() => {});
  };

  const handleNotifToggle = async (key: keyof NotifSettings, value: boolean) => {
    if (value && notifPermission !== 'granted') {
      if (!Notifications) { Alert.alert(t('Not available', 'Non disponible'), t('Notifications are not available in this environment.', 'Les notifications ne sont pas disponibles dans cet environnement.')); return; }
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') { setNotifPermission('granted'); }
      else {
        const { status } = await Notifications.requestPermissionsAsync();
        setNotifPermission(status as any);
        if (status !== 'granted') {
          Alert.alert(
            t('Notifications disabled', 'Notifications désactivées'),
            t('Enable notifications for RouteO in your device Settings.', 'Activez les notifications pour RouteO dans les Paramètres.'),
            [
              { text: t('Open Settings', 'Ouvrir les Paramètres'), onPress: () => Linking.openSettings() },
              { text: t('Cancel', 'Annuler'), style: 'cancel' },
            ]
          );
          return;
        }
      }
    }
    saveNotifSettings({ ...notifSettings, [key]: value });
  };

  const startTripSharing = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('Location needed', 'Localisation requise'), t('Enable location to share your trip.', 'Activez la localisation pour partager votre trajet.'));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    setTripSharing(true);
    AsyncStorage.setItem(SK_TRIP_SHARING, 'true');
    Alert.alert(t('Trip sharing on', 'Partage activé'), t('Your location is being shared. Stay safe!', 'Votre position est partagée. Soyez prudent!'));
  };

  const stopTripSharing = () => { setTripSharing(false); setLocation(null); AsyncStorage.removeItem(SK_TRIP_SHARING); };

  const shareLocation = () => {
    if (!location) return;
    const url = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    Linking.openURL(`sms:?body=${encodeURIComponent(t(`I'm taking transit home. My location: ${url}`, `Je prends le transport en commun. Ma position: ${url}`))}`);
  };

  const themeLabels: Record<string, string> = {
    dark: t('Dark', 'Sombre'),
    light: t('Light', 'Clair'),
    system: t('System', 'Système'),
  };

  const themeIcons: Record<string, { name: string; color: string }> = {
    dark: { name: 'moon', color: '#7b8abf' },
    light: { name: 'sunny', color: '#e8a020' },
    system: { name: 'phone-portrait', color: '#6b7f99' },
  };

  const Card = ({ children, borderColor }: { children: React.ReactNode; borderColor?: string }) => (
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

  const Divider = () => <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />;

  const LATE_NIGHT_TIPS = [
    { icon: 'bulb' as const, tip: t('Wait under lights — avoid dark shelters late at night', 'Attendez sous les lumières — évitez les abris sombres') },
    { icon: 'people' as const, tip: t('Board the first or second car — closer to the operator', 'Montez dans le premier ou deuxième wagon') },
    { icon: 'phone-portrait' as const, tip: t('Keep your phone charged and location services on', 'Gardez votre téléphone chargé et la localisation activée') },
    { icon: 'train' as const, tip: t('Hurdman and Bayview have 24h security cameras', 'Hurdman et Bayview ont des caméras de sécurité 24h') },
    { icon: 'notifications' as const, tip: t('Tell someone your route before boarding late night', "Dites à quelqu'un votre trajet avant de partir tard") },
  ];

  const NOTIF_GREEN = '#34C759';
  const NOTIF_RED = '#FF3B30';

  const notifGroups = [
    {
      id: 'trip', icon: 'navigate',
      label: t('Trip Notifications', 'Notifications de trajet'),
      expanded: showTripNotifs, setExpanded: setShowTripNotifs,
      items: [
        { key: 'leaveNow' as keyof NotifSettings, icon: 'alarm' as const, label: t('Leave Now Reminder', 'Rappel de depart'), desc: t('Alerts you when to leave for a saved trip', 'Vous alerte quand partir pour un trajet sauvegarde') },
        { key: 'arrivalAlerts' as keyof NotifSettings, icon: 'notifications' as const, label: t('Arrival Alerts', "Alertes d'arrivée"), desc: t('Notifies when a bus at a saved stop is 3 min away', 'Notifie quand un bus à un arrêt sauvegardé est à 3 min') },
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

  const EMERGENCY_CONTACTS = [
    { icon: 'alert-circle' as const, iconColor: colours.red, title: t('Call 911', 'Appeler le 911'), desc: t('Police, ambulance, fire', 'Police, ambulance, pompiers'), tel: '911' },
    { icon: 'bus' as const, iconColor: colours.accent, title: t('OC Transpo Info', 'Info OC Transpo'), desc: '613-560-1000', tel: '6135601000' },
    { icon: 'medkit' as const, iconColor: '#cc3b2a', title: t('Ottawa Hospital', "Hôpital d'Ottawa"), desc: '613-828-1275', tel: '6138281275' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Top spacer + night badge */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 }}>
          {isNight && (
            <View style={{ backgroundColor: colours.accentAlt + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colours.accentAlt + '60' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="moon" size={12} color={colours.accentAlt} />
                <Text style={{ color: colours.accentAlt, fontSize: fonts.sm, fontWeight: '700' }}>{t('Night', 'Nuit')}</Text>
              </View>
            </View>
          )}
        </View>

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
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Sign in coming in Phase 6', 'Connexion disponible en Phase 6')}</Text>
          </View>
        </View>

        {/* MY COMMUTE */}
        {commuteStats && commuteStats.tripsThisWeek > 0 && (<>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
            {t('MY COMMUTE', 'MON TRAJET')}
          </Text>
          <Card>
            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.accent }}>{commuteStats.tripsThisWeek}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>{t('trips', 'trajets')}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>{commuteStats.totalMinutes}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>{t('min total', 'min total')}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>{commuteStats.avgDuration}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, marginTop: 2 }}>{t('min avg', 'min moy')}</Text>
                </View>
              </View>
              {commuteStats.topRoute && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colours.border }}>
                  <Ionicons name="navigate" size={14} color={colours.accent} />
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, flex: 1 }} numberOfLines={1}>{t('Top route', 'Trajet principal')}: <Text style={{ fontWeight: '700', color: colours.text }}>{commuteStats.topRoute}</Text></Text>
                </View>
              )}
            </View>
          </Card>
        </>)}

        {/* SAFETY */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('SAFETY', 'SÉCURITÉ')}
        </Text>

        <Card borderColor={tripSharing ? colours.accent : colours.border}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{t('Trip Sharing', 'Partage de trajet')}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {tripSharing ? t('● Sharing your location', '● Position partagée') : t('Share your live location with a contact', 'Partagez votre position en direct')}
              </Text>
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tripSharing ? colours.accent : colours.muted }} />
          </View>
          {!tripSharing ? (
            <TouchableOpacity
              style={{ margin: 16, marginTop: 0, backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={startTripSharing}>
              <Ionicons name="shield" size={18} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.lg }}>{t('Start Trip Sharing', 'Démarrer le partage')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ padding: 16, paddingTop: 0, gap: 10 }}>
              <TouchableOpacity
                style={{ backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={shareLocation}>
                <Ionicons name="location" size={16} color={colours.accent} />
                <Text style={{ fontWeight: '700', fontSize: fonts.md, color: colours.accent }}>{t('Send Location via SMS', 'Envoyer la position par SMS')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                onPress={stopTripSharing}>
                <Text style={{ fontWeight: '600', fontSize: fonts.md, color: colours.muted }}>{t('Stop Sharing', 'Arrêter le partage')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Emergency */}
        <Card>
          {EMERGENCY_CONTACTS.map((item, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <TouchableOpacity
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
                onPress={() => {
                  if (item.tel === '911') {
                    Alert.alert(t('Call 911?', 'Appeler le 911?'), t('This will call emergency services.', "Ceci appellera les services d'urgence."), [
                      { text: t('Cancel', 'Annuler'), style: 'cancel' },
                      { text: t('Call 911', 'Appeler le 911'), style: 'destructive', onPress: () => Linking.openURL('tel:911') }
                    ]);
                  } else Linking.openURL(`tel:${item.tel}`);
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: item.iconColor + '15',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={item.icon} size={18} color={item.iconColor} />
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{item.title}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{item.desc}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </Card>

        {/* SAVED ITEMS */}
        <Card>
          <TouchableOpacity
            onPress={async () => {
              const [f, p, b] = await Promise.all([
                AsyncStorage.getItem(SK_FAVS),
                AsyncStorage.getItem(SK_SAVED_PLACES),
                AsyncStorage.getItem(SK_SAVED_BOARD),
              ]);
              try { setSavedFavs(f ? JSON.parse(f) : []); } catch { setSavedFavs([]); }
              try { setSavedPlaces(p ? JSON.parse(p) : []); } catch { setSavedPlaces([]); }
              try { setSavedBoard(b ? JSON.parse(b) : []); } catch { setSavedBoard([]); }
              setShowSaved(true);
            }}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: colours.accent + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="bookmark" size={18} color={colours.accent} />
              </View>
              <View>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{t('Saved Items', 'Articles sauvegardés')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Stops, places & board items', 'Arrêts, lieux et éléments du tableau')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colours.muted} />
          </TouchableOpacity>
        </Card>

        {/* FARE TRACKER */}
        {fareStats && (
          <Card>
            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: colours.accent + '15',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="ticket-outline" size={18} color={colours.accent} />
                </View>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                  {t('Fare Tracker', 'Suivi des tarifs')}
                </Text>
              </View>

              <Text style={{ fontSize: fonts.sm, color: colours.text, marginBottom: 6 }}>
                {t(
                  `${fareStats.tripsWeek} trip${fareStats.tripsWeek !== 1 ? 's' : ''} this week \u00B7 $${fareStats.costWeek.toFixed(2)}`,
                  `${fareStats.tripsWeek} trajet${fareStats.tripsWeek !== 1 ? 's' : ''} cette semaine \u00B7 ${fareStats.costWeek.toFixed(2)} $`
                )}
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.text, marginBottom: 14 }}>
                {t(
                  `${fareStats.tripsMonth} trip${fareStats.tripsMonth !== 1 ? 's' : ''} this month \u00B7 $${fareStats.costMonth.toFixed(2)}`,
                  `${fareStats.tripsMonth} trajet${fareStats.tripsMonth !== 1 ? 's' : ''} ce mois \u00B7 ${fareStats.costMonth.toFixed(2)} $`
                )}
              </Text>

              {/* Daily cap */}
              <Text style={{ fontSize: fonts.xs, color: colours.muted, marginBottom: 4 }}>
                {t(
                  `$${fareStats.costToday.toFixed(2)} / $13.50 daily cap`,
                  `${fareStats.costToday.toFixed(2)} $ / 13,50 $ plafond quotidien`
                )}
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colours.border, marginBottom: 12 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colours.accent, width: `${Math.min(100, (fareStats.costToday / 13.50) * 100)}%` }} />
              </View>

              {/* Monthly cap */}
              <Text style={{ fontSize: fonts.xs, color: colours.muted, marginBottom: 4 }}>
                {t(
                  `$${fareStats.costMonth.toFixed(2)} / $139.00 monthly cap`,
                  `${fareStats.costMonth.toFixed(2)} $ / 139,00 $ plafond mensuel`
                )}
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colours.border, marginBottom: 12 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colours.accent, width: `${Math.min(100, (fareStats.costMonth / 139) * 100)}%` }} />
              </View>

              <Text style={{ fontSize: fonts.xs, color: colours.muted, fontStyle: 'italic' }}>
                {t('Based on $4.10/trip', 'Bas\u00E9 sur 4,10 $/trajet')}
              </Text>
            </View>
          </Card>
        )}

        {/* NOTIFICATIONS (collapsible) */}
        <Card>
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
                    {t('Notifications are disabled. Tap to open Settings.', 'Les notifications sont désactivées. Appuyez pour ouvrir les Paramètres.')}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#e8a020" />
                </TouchableOpacity>
              )}

              {notifGroups.map((group, gi) => {
                const masterOn = group.items.some(item => notifSettings[item.key]);
                return (
                  <View key={group.id}>
                    {gi > 0 && <Divider />}
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
                            handleNotifToggle(group.items[0].key, true).then(() => {
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
                              saveNotifSettings({ ...notifSettings, [item.key]: v });
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
        </Card>

        {/* LATE NIGHT TIPS (collapsible) */}
        <Card>
          <TouchableOpacity
            onPress={() => setShowTips(!showTips)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('LATE NIGHT TIPS', 'CONSEILS TARDIFS')}
            </Text>
            <Ionicons name={showTips ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
          </TouchableOpacity>
          {showTips && LATE_NIGHT_TIPS.map((item, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }}>
                <View style={{ marginTop: 1 }}>
                  <Ionicons name={item.icon} size={18} color={colours.muted} />
                </View>
                <Text style={{ flex: 1, fontSize: fonts.md, color: colours.muted, lineHeight: 20 }}>{item.tip}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* ACCESSIBILITY (collapsible) */}
        <Card>
          <TouchableOpacity
            onPress={() => setShowA11y(!showA11y)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('ACCESSIBILITY', 'ACCESSIBILITÉ')}
            </Text>
            <Ionicons name={showA11y ? 'chevron-up' : 'chevron-down'} size={16} color={colours.muted} />
          </TouchableOpacity>
          {showA11y && [
            { label: t('Large Text', 'Grand texte'), desc: t('Increase font size throughout the app', 'Augmenter la taille de police'), val: largeText, set: setLargeText },
            { label: t('High Contrast', 'Contraste élevé'), desc: t('Stronger colour contrast for readability', 'Meilleur contraste pour la lisibilité'), val: highContrast, set: setHighContrast },
            { label: t('Reduced Motion', 'Mouvement réduit'), desc: t('Minimize animations and transitions', 'Minimiser les animations'), val: reducedMotion, set: setReducedMotion },
          ].map((item, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{item.label}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{item.desc}</Text>
                </View>
                <Switch
                  value={item.val}
                  onValueChange={v => item.set(v)}
                  trackColor={{ false: colours.border, true: colours.accent }}
                  thumbColor={item.val ? 'white' : colours.muted}
                />
              </View>
            </View>
          ))}
        </Card>

        {/* DISPLAY */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('DISPLAY', 'AFFICHAGE')}
        </Text>
        <Card>
          <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>{t('Theme', 'Thème')}</Text>
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
                  name={themeIcons[th].name as any}
                  size={20}
                  color={theme === th ? colours.accent : themeIcons[th].color}
                />
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: theme === th ? colours.accent : colours.muted }}>
                  {themeLabels[th]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* LANGUAGE */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('LANGUAGE', 'LANGUE')}
        </Text>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>
                {language === 'en' ? 'English' : 'Français'}
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
        </Card>

        {/* ABOUT */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('ABOUT', 'À PROPOS')}
        </Text>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: colours.accent + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="bus" size={18} color={colours.accent} />
              </View>
              <View>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>RouteO v{require('../../app.json').expo.version}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Built in Ottawa for Ottawa', 'Fait à Ottawa pour Ottawa')}</Text>
              </View>
            </View>
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: colours.accent + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="radio" size={18} color={colours.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{t('Data Source', 'Source de données')}</Text>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('OC Transpo GTFS-RT · Live every 30s', 'OC Transpo GTFS-RT · En direct toutes les 30s')}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>LIVE</Text>
            </View>
          </View>
        </Card>

      </ScrollView>

      {showSaved && <Modal visible={showSaved} animationType="slide" transparent onRequestClose={() => setShowSaved(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
              <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{t('Saved Items', 'Articles sauvegardés')}</Text>
              <TouchableOpacity onPress={() => setShowSaved(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colours.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}>
              {savedFavs.length === 0 && savedPlaces.length === 0 && savedBoard.length === 0 && (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <Ionicons name="bookmark-outline" size={40} color={colours.muted} />
                  <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 10 }}>{t('No saved items yet', 'Aucun élément sauvegardé')}</Text>
                </View>
              )}
              {savedFavs.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('STOPS', 'ARRÊTS')} ({savedFavs.length})
                  </Text>
                  {savedFavs.map((fav: any) => (
                    <View key={fav.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="bus" size={16} color={colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{fav.name}</Text>
                        <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{fav.id}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { const next = savedFavs.filter((f: any) => f.id !== fav.id); setSavedFavs(next); AsyncStorage.setItem(SK_FAVS, JSON.stringify(next)); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="close" size={14} color={colours.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {savedPlaces.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('PLACES', 'LIEUX')} ({savedPlaces.length})
                  </Text>
                  {savedPlaces.map((place: any) => (
                    <View key={place.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: (place.categoryColor || colours.accent) + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={(place.categoryIcon || 'location') as any} size={16} color={place.categoryColor || colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={1}>{place.name}</Text>
                        {place.vicinity && <Text style={{ fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>{place.vicinity}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => { const next = savedPlaces.filter((p: any) => p.id !== place.id); setSavedPlaces(next); AsyncStorage.setItem(SK_SAVED_PLACES, JSON.stringify(next)); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="close" size={14} color={colours.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {savedBoard.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('BOARD ITEMS', 'ÉLÉMENTS DU TABLEAU')} ({savedBoard.length})
                  </Text>
                  {savedBoard.map((item: any, idx: number) => (
                    <View key={`${item.type}-${item.id || idx}`} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={({ bus_stop: 'bus', lrt_station: 'train', garbage: 'trash', service_alert: 'alert-circle', gas_prices: 'speedometer', otrain: 'train', services: 'grid', discover: 'compass', saved_team: 'american-football', external_link: 'link', campus: 'school', news: 'newspaper', neighbourhood: 'map' }[item.type] || 'cube') as any} size={16} color={colours.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={1}>
                          {item.name || (language === 'fr' ? (item.name_fr || item.label_fr) : (item.name_en || item.label_en)) || item.type.replace(/_/g, ' ')}
                        </Text>
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, textTransform: 'capitalize' }}>{item.type.replace(/_/g, ' ')}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { const next = savedBoard.filter((_: any, i: number) => i !== idx); setSavedBoard(next); AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(next)); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="close" size={14} color={colours.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>}
    </View>
  );
}
