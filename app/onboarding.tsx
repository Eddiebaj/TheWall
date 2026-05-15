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
import { SK_ONBOARDED, SK_SAVED_BOARD } from '../lib/storageKeys';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import stopsearch from './(tabs)/stopsearch.json';

const LinearGradient: any = LinearGradientModule?.LinearGradient ?? View;
const { width } = Dimensions.get('window');

type StopResult = { id: string; internalId: string; name: string };
const STOP_SEARCH: StopResult[] = stopsearch as StopResult[];

const TEAL = '#00A78D';
const SLIDE_COUNT = 4;

export default function OnboardingScreen() {
  const { t } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Slide 2 - Location
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);

  // Slide 3 - Stop search
  const [stopQuery, setStopQuery] = useState('');
  const [stopResults, setStopResults] = useState<StopResult[]>([]);
  const [addedStops, setAddedStops] = useState<StopResult[]>([]);

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
        const existing = await AsyncStorage.getItem(SK_SAVED_BOARD);
        const existingBoard = existing ? JSON.parse(existing) : [];
        const newStops = addedStops.map(s => ({ type: 'bus_stop' as const, id: s.id, name: s.name }));
        const merged = [...existingBoard, ...newStops.filter(ns => !existingBoard.some((e: any) => e.type === 'bus_stop' && e.id === ns.id))];
        await AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(merged));
      }
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
      router.replace('/(tabs)');
    } catch (e) {
      if (__DEV__) console.warn('AsyncStorage error:', e);
      setFinishing(false);
    }
  };

  // Location permission
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

  // Stop search
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

  // Slide logic
  const isLast = currentIndex === SLIDE_COUNT - 1;
  const isStopSlide = currentIndex === 2;
  const canAdvanceStop = addedStops.length > 0;

  const accent = currentIndex <= 1 ? TEAL : currentIndex === 2 ? '#004890' : TEAL;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#0a0f1a', '#0f1728', '#131d2e']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={false}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {/* Slide 1: Welcome - sell the core value */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <Text style={{ fontSize: 52, fontWeight: '700', color: '#fff', marginBottom: 8 }}>
            Route<Text style={{ color: TEAL }}>O</Text>
          </Text>
          <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: TEAL, marginBottom: 32 }} />
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            {t('Know before you go', 'Sachez avant de partir')}
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300, marginBottom: 28 }}>
            {t(
              'Live arrivals, ghost bus alerts, and reliability scores for Ottawa riders.',
              'Arriv\u00e9es en direct, alertes bus fant\u00f4mes et scores de fiabilit\u00e9 pour les usagers d\u2019Ottawa.',
            )}
          </Text>
          {/* Feature highlights */}
          <View style={{ gap: 14, width: '100%', maxWidth: 300 }}>
            {[
              { icon: 'time-outline' as const, en: 'Real-time arrivals that actually update', fr: 'Arriv\u00e9es en temps r\u00e9el toujours \u00e0 jour' },
              { icon: 'alert-circle-outline' as const, en: 'Ghost bus detection', fr: 'D\u00e9tection de bus fant\u00f4mes' },
              { icon: 'stats-chart-outline' as const, en: 'Route reliability scores from real data', fr: 'Scores de fiabilit\u00e9 bas\u00e9s sur des donn\u00e9es r\u00e9elles' },
            ].map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: TEAL + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={f.icon} size={18} color={TEAL} />
                </View>
                <Text style={{ color: '#ccd6e0', fontSize: 14, flex: 1, lineHeight: 20 }}>
                  {t(f.en, f.fr)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Slide 2: Location */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="location" size={64} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            {t('See buses near you', 'Voir les bus pr\u00e8s de vous')}
          </Text>
          <Text style={{ fontSize: 14, color: '#8899aa', textAlign: 'center', lineHeight: 20, maxWidth: 280, marginBottom: 32 }}>
            {t(
              'We\u2019ll show nearby stops and live buses on the map.',
              'On vous montrera les arr\u00eats proches et les bus en direct sur la carte.',
            )}
          </Text>
          {locationGranted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={24} color={TEAL} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: TEAL }}>
                {t('Location enabled', 'Position activ\u00e9e')}
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
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {t('Enable Location', 'Activer la position')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Slide 3: Add stops */}
        <View style={{ width, flex: 1, paddingHorizontal: 36, paddingTop: 100 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 8 }}>
            {t('Save your stops', 'Enregistrez vos arr\u00eats')}
          </Text>
          <Text style={{ fontSize: 14, color: '#8899aa', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
            {t('Get live arrivals, ghost alerts, and reliability for your daily stops', 'Recevez les arriv\u00e9es en direct, les alertes fant\u00f4mes et la fiabilit\u00e9 pour vos arr\u00eats quotidiens')}
          </Text>

          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: '#131d2e',
            borderRadius: 16, borderWidth: 1.5, borderColor: '#1e2a3a', paddingHorizontal: 14, gap: 10,
          }}>
            <Ionicons name="search" size={18} color="#5a6a7a" />
            <TextInput
              value={stopQuery}
              onChangeText={searchStops}
              placeholder={t('Search stop name or number...', "Rechercher un arr\u00eat par nom ou num\u00e9ro...")}
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
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={s.name}
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
                  <TouchableOpacity onPress={() => removeStop(s.id)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel={t('Remove stop', 'Retirer l\'arret')}>
                    <Ionicons name="close-circle" size={18} color="#5a6a7a" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Slide 4: You're set */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="checkmark-done" size={44} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            {t("You're all set!", 'Vous \u00eates pr\u00eat!')}
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300, marginBottom: 20 }}>
            {addedStops.length > 0
              ? t(
                  `${addedStops.length} stop${addedStops.length > 1 ? 's' : ''} saved. We'll track arrivals, flag ghost buses, and show reliability.`,
                  `${addedStops.length} arr\u00eat${addedStops.length > 1 ? 's' : ''} enregistr\u00e9${addedStops.length > 1 ? 's' : ''}. On suit les arriv\u00e9es, signale les bus fant\u00f4mes et affiche la fiabilit\u00e9.`,
                )
              : t(
                  'Ghost bus alerts, reliability scores, and live arrivals all in one place.',
                  'Alertes bus fant\u00f4mes, scores de fiabilit\u00e9 et arriv\u00e9es en direct, tout au m\u00eame endroit.',
                )
            }
          </Text>
        </View>
      </ScrollView>

      {/* Bottom controls */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 52 }}>
        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                // Allow all dot navigation (skip is now available on stop slide)
                goToSlide(i);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t(`Go to slide ${i + 1}`, `Aller a la diapositive ${i + 1}`)}
              accessibilityState={{ selected: i === currentIndex }}
            >
              <View style={{
                width: i === currentIndex ? 28 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? accent : '#1e2a3a',
                opacity: 1,
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
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            {!locationGranted && (
              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: 'center' }}
                onPress={() => goToSlide(2)}
                activeOpacity={0.7}
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
          /* Stop slide: Next + Skip */
          <>
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
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={finish}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('Skip adding stops', 'Passer l\'ajout d\'arrets')}
            >
              <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>
                {t('Maybe later', 'Peut-être plus tard')}
              </Text>
            </TouchableOpacity>
          </>
        ) : isLast ? (
          /* Final slide: Get Started */
          <TouchableOpacity
            style={{
              backgroundColor: TEAL, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: finishing ? 0.6 : 1,
            }}
            onPress={finish}
            disabled={finishing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('Get Started', 'Commencer')}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
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
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
                {t('Next', 'Suivant')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={finish}
              activeOpacity={0.7}
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
