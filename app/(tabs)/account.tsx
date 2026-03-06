import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Alert, Linking, ScrollView,
  StatusBar, Switch, Text,
  TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';

const isNightTime = () => { const h = new Date().getHours(); return h >= 21 || h < 4; };

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

  useEffect(() => {
    const interval = setInterval(() => setIsNight(isNightTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  const startTripSharing = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('Location needed', 'Localisation requise'), t('Enable location to share your trip.', 'Activez la localisation pour partager votre trajet.'));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    setTripSharing(true);
    Alert.alert(t('Trip sharing on', 'Partage activé'), t('Your location is being shared. Stay safe!', 'Votre position est partagée. Soyez prudent!'));
  };

  const stopTripSharing = () => { setTripSharing(false); setLocation(null); };

  const shareLocation = () => {
    if (!location) return;
    const url = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    Linking.openURL(`sms:&body=${encodeURIComponent(t(`I'm taking transit home. My location: ${url}`, `Je prends le transport en commun. Ma position: ${url}`))}`);
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

  const EMERGENCY_CONTACTS = [
    { icon: 'alert-circle' as const, iconColor: colours.red, title: t('Call 911', 'Appeler le 911'), desc: t('Police, ambulance, fire', 'Police, ambulance, pompiers'), tel: '911' },
    { icon: 'bus' as const, iconColor: colours.accent, title: t('OC Transpo Info', 'Info OC Transpo'), desc: '613-560-1000', tel: '6135601000' },
    { icon: 'medkit' as const, iconColor: '#cc3b2a', title: t('Ottawa Hospital', "Hôpital d'Ottawa"), desc: '613-828-1275', tel: '6138281275' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 }}>
          <View>
            <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
              Route<Text style={{ color: colours.accent }}>O</Text>
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
              {t('ACCOUNT & SETTINGS', 'COMPTE & PARAMÈTRES')}
            </Text>
          </View>
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

        {/* Late Night Tips */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('LATE NIGHT TIPS', 'CONSEILS TARDIFS')}
        </Text>
        <Card>
          {LATE_NIGHT_TIPS.map((item, i) => (
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

        {/* ACCESSIBILITY */}
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 }}>
          {t('ACCESSIBILITY', 'ACCESSIBILITÉ')}
        </Text>
        <Card>
          {[
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
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>RouteO v0.4.0</Text>
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
    </View>
  );
}
