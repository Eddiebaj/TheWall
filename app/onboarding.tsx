import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
let LinearGradientModule: typeof import('expo-linear-gradient') | null = null;
try { LinearGradientModule = require('expo-linear-gradient'); } catch {}
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Keyboard, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { SK_ONBOARDED, SK_SAVED_BOARD, SK_HOME_ADDRESS } from '../lib/storageKeys';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import stopsearch from './(tabs)/stopsearch.json';

const LinearGradient: any = LinearGradientModule?.LinearGradient ?? View;
const { width } = Dimensions.get('window');

type StopResult = { id: string; internalId: string; name: string };
const STOP_SEARCH: StopResult[] = stopsearch as StopResult[];

const TEAL = '#00A78D';
const SLIDE_COUNT = 5;

export default function OnboardingScreen() {
  const { t, language } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Slide 2 — Location
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);

  // Slide 3 — Stop search
  const [stopQuery, setStopQuery] = useState('');
  const [stopResults, setStopResults] = useState<StopResult[]>([]);
  const [addedStops, setAddedStops] = useState<StopResult[]>([]);

  // Slide 4 — Address search
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<{ placeId: string; name: string; address: string }[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<{ placeId: string; label: string; lat: number; lng: number } | null>(null);
  const addressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fr = language === 'fr';

  const goToSlide = (index: number) => {
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  };

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex) setCurrentIndex(index);
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      // Save added stops to board
      if (addedStops.length > 0) {
        const board = addedStops.map(s => ({ type: 'bus_stop', id: s.id, name: s.name }));
        await AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(board));
      }
      // Save home address
      if (selectedAddress) {
        await AsyncStorage.setItem(SK_HOME_ADDRESS, JSON.stringify(selectedAddress));
      }
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
      router.replace('/(tabs)');
    } catch (e) {
      if (__DEV__) console.warn('AsyncStorage error:', e);
      setFinishing(false);
    }
  };

  // ── Location permission ──────────────────────────────────────────
  const requestLocation = useCallback(async () => {
    setLocationRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
    } catch (e) {
      if (__DEV__) console.warn('Location permission error:', e);
    }
    setLocationRequesting(false);
  }, []);

  // ── Stop search ──────────────────────────────────────────────────
  const searchStops = useCallback((text: string) => {
    setStopQuery(text);
    if (text.length < 2) { setStopResults([]); return; }
    const q = text.toLowerCase();
    const addedIds = new Set(addedStops.map(s => s.id));
    const matches = STOP_SEARCH
      .filter(s => !addedIds.has(s.id) && (s.name.toLowerCase().includes(q) || s.id.includes(q)))
      .slice(0, 8);
    setStopResults(matches);
  }, [addedStops]);

  const addStop = useCallback((stop: StopResult) => {
    setAddedStops(prev => [...prev, stop]);
    setStopQuery('');
    setStopResults([]);
  }, []);

  const removeStop = useCallback((id: string) => {
    setAddedStops(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── Address autocomplete ─────────────────────────────────────────
  const searchAddress = useCallback((text: string) => {
    setAddressQuery(text);
    setSelectedAddress(null);
    if (addressTimer.current) clearTimeout(addressTimer.current);
    if (text.length < 3) { setAddressResults([]); return; }
    addressTimer.current = setTimeout(async () => {
      try {
        const resp = await fetchWithTimeout(
          `https://routeo-backend.vercel.app/api/places?action=autocomplete&input=${encodeURIComponent(text)}&location=45.4215,-75.6972&radius=50000`,
        );
        if (!resp.ok) return;
        const data = await resp.json();
        setAddressResults((data.predictions || []).slice(0, 5).map((p: any) => ({
          placeId: p.placeId || p.place_id,
          name: p.mainText || p.structured_formatting?.main_text || p.description,
          address: p.secondaryText || p.structured_formatting?.secondary_text || '',
        })));
      } catch (e) { if (__DEV__) console.warn('Address search error:', e); }
    }, 400);
  }, []);

  const selectAddress = useCallback(async (item: { placeId: string; name: string; address: string }) => {
    Keyboard.dismiss();
    setAddressQuery(item.name);
    setAddressResults([]);
    try {
      const resp = await fetchWithTimeout(
        `https://routeo-backend.vercel.app/api/places?action=details&placeId=${item.placeId}`,
      );
      if (!resp.ok) return;
      const data = await resp.json();
      const loc = data.geometry?.location || data.result?.geometry?.location;
      if (loc) {
        setSelectedAddress({ placeId: item.placeId, label: item.name, lat: loc.lat, lng: loc.lng });
      }
    } catch (e) { if (__DEV__) console.warn('Address details error:', e); }
  }, []);

  // ── Slide logic ──────────────────────────────────────────────────
  const isLast = currentIndex === SLIDE_COUNT - 1;
  const isStopSlide = currentIndex === 2;
  const isAddressSlide = currentIndex === 3;
  const canAdvanceStop = addedStops.length > 0;

  const accent = currentIndex === 0 ? TEAL : currentIndex === 1 ? TEAL : currentIndex === 2 ? '#004890' : currentIndex === 3 ? '#004890' : '#7b5ea7';

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#0a0f1a', '#0f1728', '#131d2e']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View style={{
        position: 'absolute', top: '25%', alignSelf: 'center',
        width: 300, height: 300, borderRadius: 150,
        backgroundColor: accent + '08',
      }} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={!isStopSlide || canAdvanceStop}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {/* ── Slide 1: Welcome ──────────────────────────────────── */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <Svg width={200} height={80} viewBox="0 0 200 80" style={{ marginBottom: 24, opacity: 0.85 }}>
            <Path
              d="M0 80 L0 55 L15 55 L15 50 L20 50 L20 45 L25 45 L25 50 L30 50 L30 55 L40 55 L40 48 L45 48 L45 42 L50 42 L50 48 L55 48 L55 55 L65 55 L65 50 L70 50 L70 40 L75 40 L75 35 L80 35 L80 30 L85 30 L85 25 L88 25 L88 20 L91 20 L91 15 L94 15 L94 10 L97 10 L97 5 L100 2 L103 5 L103 10 L106 10 L106 15 L109 15 L109 20 L112 20 L112 25 L115 25 L115 30 L120 30 L120 35 L125 35 L125 40 L130 40 L130 50 L135 50 L135 55 L145 55 L145 48 L150 48 L150 42 L155 42 L155 48 L160 48 L160 55 L170 55 L170 50 L175 50 L175 45 L180 45 L180 50 L185 50 L185 55 L200 55 L200 80 Z"
              fill={TEAL}
            />
          </Svg>
          <Text style={{ fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -2, marginBottom: 8 }}>
            Route<Text style={{ color: TEAL }}>O</Text>
          </Text>
          <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: TEAL, marginBottom: 32 }} />
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 12 }}>
            {t('Welcome to RouteO', 'Bienvenue sur RouteO')}
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            {t("Ottawa's transit app, built for Ottawa people.", "L'appli de transport d'Ottawa, faite pour les Ottaviens.")}
          </Text>
        </View>

        {/* ── Slide 2: Location ─────────────────────────────────── */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="location" size={64} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 12 }}>
            {t('See buses near you', 'Voir les bus pres de vous')}
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300, marginBottom: 32 }}>
            {t(
              'RouteO uses your location to show live arrivals at nearby stops.',
              'RouteO utilise votre position pour afficher les arrivees en direct aux arrets a proximite.',
            )}
          </Text>
          {locationGranted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={24} color={TEAL} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: TEAL }}>
                {t('Location enabled', 'Position activee')}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={requestLocation}
              disabled={locationRequesting}
              activeOpacity={0.85}
              style={{
                backgroundColor: TEAL, borderRadius: 16, paddingVertical: 14,
                paddingHorizontal: 32, alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8, opacity: locationRequesting ? 0.6 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={t('Enable Location', 'Activer la position')}
            >
              {locationRequesting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="location" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    {t('Enable Location', 'Activer la position')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Slide 3: Add stops (REQUIRED) ─────────────────────── */}
        <View style={{ width, flex: 1, paddingHorizontal: 36, paddingTop: 100 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 8 }}>
            {t('What do you take most often?', 'Quel trajet prenez-vous?')}
          </Text>
          <Text style={{ fontSize: 14, color: '#8899aa', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
            {t('You can always add more later', 'Vous pourrez en ajouter plus tard')}
          </Text>

          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: '#131d2e',
            borderRadius: 14, borderWidth: 1.5, borderColor: '#1e2a3a', paddingHorizontal: 14, gap: 10,
          }}>
            <Ionicons name="search" size={18} color="#5a6a7a" />
            <TextInput
              value={stopQuery}
              onChangeText={searchStops}
              placeholder={t('Search stop name or number...', "Rechercher un arret par nom ou numero...")}
              placeholderTextColor="#5a6a7a"
              style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 }}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>

          {/* Search results */}
          {stopResults.length > 0 && (
            <View style={{ marginTop: 8, backgroundColor: '#131d2e', borderRadius: 12, borderWidth: 1, borderColor: '#1e2a3a', maxHeight: 200, overflow: 'hidden' }}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {stopResults.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => addStop(s)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1e2a3a' }}
                  >
                    <Ionicons name="bus-outline" size={16} color={TEAL} />
                    <Text style={{ color: '#fff', fontSize: 14, flex: 1 }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ color: '#5a6a7a', fontSize: 12 }}>#{s.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Added chips */}
          {addedStops.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {addedStops.map(s => (
                <View key={s.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: TEAL + '20', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                  borderWidth: 1, borderColor: TEAL + '40',
                }}>
                  <Ionicons name="bus" size={14} color={TEAL} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    #{s.id}
                  </Text>
                  <TouchableOpacity onPress={() => removeStop(s.id)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                    <Ionicons name="close-circle" size={18} color="#5a6a7a" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Slide 4: Home address (OPTIONAL) ──────────────────── */}
        <View style={{ width, flex: 1, paddingHorizontal: 36, paddingTop: 100 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: '#004890' + '20', borderWidth: 1.5, borderColor: '#004890' + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 32, alignSelf: 'center',
          }}>
            <Ionicons name="home" size={36} color="#004890" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 8 }}>
            {t("Where do you commute from?", "D'ou venez-vous?")}
          </Text>
          <Text style={{ fontSize: 14, color: '#8899aa', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
            {t('We\'ll show you the best routes from home', 'On vous montrera les meilleurs trajets de chez vous')}
          </Text>

          {/* Address search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: '#131d2e',
            borderRadius: 14, borderWidth: 1.5, borderColor: selectedAddress ? TEAL + '60' : '#1e2a3a', paddingHorizontal: 14, gap: 10,
          }}>
            <Ionicons name="search" size={18} color="#5a6a7a" />
            <TextInput
              value={addressQuery}
              onChangeText={searchAddress}
              placeholder={t('Search your address...', 'Rechercher votre adresse...')}
              placeholderTextColor="#5a6a7a"
              style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 }}
              returnKeyType="search"
              autoCorrect={false}
            />
            {selectedAddress && <Ionicons name="checkmark-circle" size={20} color={TEAL} />}
          </View>

          {/* Address results */}
          {addressResults.length > 0 && (
            <View style={{ marginTop: 8, backgroundColor: '#131d2e', borderRadius: 12, borderWidth: 1, borderColor: '#1e2a3a', maxHeight: 200, overflow: 'hidden' }}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {addressResults.map(a => (
                  <TouchableOpacity
                    key={a.placeId}
                    onPress={() => selectAddress(a)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1e2a3a' }}
                  >
                    <Ionicons name="location-outline" size={16} color="#004890" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 14 }} numberOfLines={1}>{a.name}</Text>
                      {!!a.address && <Text style={{ color: '#5a6a7a', fontSize: 12 }} numberOfLines={1}>{a.address}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── Slide 5: You're set ───────────────────────────────── */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: '#7b5ea7' + '20', borderWidth: 1.5, borderColor: '#7b5ea7' + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="checkmark-done" size={44} color="#7b5ea7" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.5, lineHeight: 36, marginBottom: 12 }}>
            {t("You're all set!", 'Vous etes pret!')}
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            {addedStops.length > 0
              ? t(
                  `${addedStops.length} stop${addedStops.length > 1 ? 's' : ''} saved to your board.${selectedAddress ? ' Home address saved.' : ''} Let's go!`,
                  `${addedStops.length} arret${addedStops.length > 1 ? 's' : ''} enregistre${addedStops.length > 1 ? 's' : ''}.${selectedAddress ? ' Adresse enregistree.' : ''} C'est parti!`,
                )
              : t(
                  'Everything Ottawa, one tap away.',
                  'Tout Ottawa, en un seul tap.',
                )
            }
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom controls ─────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 52 }}>
        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                // Block navigation past stop slide if no stops added
                if (i > 2 && !canAdvanceStop) return;
                goToSlide(i);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t(`Go to slide ${i + 1}`, `Aller a la diapositive ${i + 1}`)}
              accessibilityState={{ selected: i === currentIndex }}
            >
              <View style={{
                width: i === currentIndex ? 28 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? accent : '#1e2a3a',
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Location slide: "Maybe later" link instead of skip */}
        {currentIndex === 1 ? (
          <>
            <TouchableOpacity
              style={{
                backgroundColor: TEAL, borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={() => goToSlide(2)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Next', 'Suivant')}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            {!locationGranted && (
              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: 'center' }}
                onPress={() => goToSlide(2)}
                accessibilityRole="button"
                accessibilityLabel={t('Maybe later', 'Peut-etre plus tard')}
              >
                <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>
                  {t('Maybe later', 'Peut-etre plus tard')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : isStopSlide ? (
          /* Stop slide: Next disabled until at least 1 stop added */
          <TouchableOpacity
            style={{
              backgroundColor: canAdvanceStop ? '#004890' : '#1e2a3a',
              borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: canAdvanceStop ? 1 : 0.5,
            }}
            onPress={() => canAdvanceStop && goToSlide(3)}
            disabled={!canAdvanceStop}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('Next', 'Suivant')}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
              {t('Next', 'Suivant')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        ) : isAddressSlide ? (
          /* Address slide: Next + Skip side by side */
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1, borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', borderWidth: 1.5, borderColor: '#3a4a5a',
              }}
              onPress={() => goToSlide(4)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Skip for now', 'Passer pour le moment')}
            >
              <Text style={{ color: '#8899aa', fontWeight: '700', fontSize: 16 }}>
                {t('Skip for now', 'Passer')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, backgroundColor: '#004890',
                borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={() => goToSlide(4)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Next', 'Suivant')}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : isLast ? (
          /* Final slide: Get Started */
          <TouchableOpacity
            style={{
              backgroundColor: '#7b5ea7', borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: finishing ? 0.6 : 1,
            }}
            onPress={finish}
            disabled={finishing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('Get Started', 'Commencer')}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
              {finishing ? t('Saving...', 'Sauvegarde...') : t('Get Started', 'Commencer')}
            </Text>
          </TouchableOpacity>
        ) : (
          /* Welcome slide: Next + Skip */
          <>
            <TouchableOpacity
              style={{
                backgroundColor: accent, borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={() => goToSlide(currentIndex + 1)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Next', 'Suivant')}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel={t('Skip onboarding', 'Passer la presentation')}
            >
              <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>
                {t('Skip', 'Passer')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
