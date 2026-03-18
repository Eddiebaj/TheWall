import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
let LinearGradientModule: typeof import('expo-linear-gradient') | null = null;
try { LinearGradientModule = require('expo-linear-gradient'); } catch {}
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions, Image, ScrollView, StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { SK_CAMPUS, SK_ONBOARDED } from '../lib/storageKeys';
import type { CampusId } from '../lib/campusData';

const LinearGradient: any = LinearGradientModule?.LinearGradient ?? View;
const { width } = Dimensions.get('window');

const CAMPUS_LOGOS: Record<string, any> = {
  carleton: require('../assets/schools/carleton.png'),
  uottawa: require('../assets/schools/uottawa.png'),
  algonquin: require('../assets/schools/algonquin.png'),
};

const SLIDES = [
  {
    id: 'welcome',
    icon: null,
    iconBg: null,
    title_en: 'Welcome to RouteO',
    title_fr: 'Bienvenue sur RouteO',
    body_en: "Ottawa's transit app, built for Ottawa people.",
    body_fr: "L'appli de transport d'Ottawa, faite pour les Ottaviens.",
    accent: '#00A78D',
    isWelcome: true,
  },
  {
    id: 'board',
    icon: 'grid' as const,
    iconBg: '#004890',
    title_en: 'Build your board',
    title_fr: 'Construisez votre tableau',
    body_en: 'Save your bus stops, O-Train stations, and favourite Ottawa services. Everything you need, one tap away.',
    body_fr: "Sauvegardez vos arr\u00EAts de bus, stations O-Train et services pr\u00E9f\u00E9r\u00E9s. Tout ce qu'il faut, en un seul tap.",
    accent: '#004890',
    isWelcome: false,
  },
  {
    id: 'live',
    icon: 'bus' as const,
    iconBg: '#00A78D',
    title_en: 'Live arrivals',
    title_fr: 'Arriv\u00E9es en direct',
    body_en: "Real-time bus predictions powered by OC Transpo's live feed. Know exactly when your bus is coming.",
    body_fr: "Pr\u00E9dictions en temps r\u00E9el aliment\u00E9es par le flux OC Transpo. Sachez exactement quand votre bus arrive.",
    accent: '#00A78D',
    isWelcome: false,
  },
  {
    id: 'campus',
    icon: 'school' as const,
    iconBg: '#00A78D',
    title_en: 'Where do you study?',
    title_fr: 'O\u00F9 \u00E9tudiez-vous?',
    body_en: "We'll show campus info on your Home tab",
    body_fr: 'On affichera les infos campus sur votre onglet Accueil',
    accent: '#00A78D',
    isWelcome: false,
    isCampus: true,
  },
{
    id: 'more',
    icon: 'sparkles' as const,
    iconBg: '#7b5ea7',
    title_en: 'Ottawa, all in one place',
    title_fr: 'Ottawa, tout en un seul endroit',
    body_en: 'Happy hour deals, Senators scores, gas prices, garbage day, 311 reports \u2014 everything Ottawa in one app.',
    body_fr: "Offres happy hour, r\u00E9sultats des S\u00E9nateurs, prix d'essence, collecte des d\u00E9chets, signalements 311 \u2014 tout Ottawa dans une appli.",
    accent: '#7b5ea7',
    isWelcome: false,
  },
];

const CAMPUS_CHOICES: { id: CampusId; name_en: string; name_fr: string; accent: string }[] = [
  { id: 'carleton', name_en: 'Carleton University', name_fr: 'Universit\u00E9 Carleton', accent: '#8B1A2B' },
  { id: 'uottawa', name_en: 'University of Ottawa', name_fr: "Universit\u00E9 d'Ottawa", accent: '#004890' },
  { id: 'algonquin', name_en: 'Algonquin College', name_fr: 'Coll\u00E8ge Algonquin', accent: '#006341' },
];

export default function OnboardingScreen() {
  const { colours, fonts, t, language } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSchool, setActiveSchool] = useState<CampusId | null>(null);
  const [finishing, setFinishing] = useState(false);

  const goToSlide = (index: number) => {
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
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
      router.replace('/(tabs)');
    } catch (e) {
      if (__DEV__) console.warn('AsyncStorage error:', e);
      setFinishing(false);
    }
  };

  const saveCampus = async (campus: CampusId | null) => {
    try {
      if (campus) {
        await AsyncStorage.setItem(SK_CAMPUS, campus);
      } else {
        await AsyncStorage.removeItem(SK_CAMPUS);
      }
    } catch (e) { if (__DEV__) console.warn('campus save error:', e); }
  };

  const isLast = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];
  const isCampusSlide = 'isCampus' in slide && (slide as any).isCampus;
  const isPickerSlide = isCampusSlide;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <StatusBar barStyle="light-content" />

      {/* Gradient background */}
      <LinearGradient
        colors={['#0a0f1a', '#0f1728', '#131d2e']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Subtle accent glow */}
      <View style={{
        position: 'absolute', top: '25%', alignSelf: 'center',
        width: 300, height: 300, borderRadius: 150,
        backgroundColor: slide.accent + '08',
      }} />

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <View key={s.id} style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>

            {s.isWelcome ? (
              <>
                {/* Parliament Hill silhouette */}
                <Svg width={200} height={80} viewBox="0 0 200 80" style={{ marginBottom: 24, opacity: 0.85 }}>
                  <Path
                    d="M0 80 L0 55 L15 55 L15 50 L20 50 L20 45 L25 45 L25 50 L30 50 L30 55 L40 55 L40 48 L45 48 L45 42 L50 42 L50 48 L55 48 L55 55 L65 55 L65 50 L70 50 L70 40 L75 40 L75 35 L80 35 L80 30 L85 30 L85 25 L88 25 L88 20 L91 20 L91 15 L94 15 L94 10 L97 10 L97 5 L100 2 L103 5 L103 10 L106 10 L106 15 L109 15 L109 20 L112 20 L112 25 L115 25 L115 30 L120 30 L120 35 L125 35 L125 40 L130 40 L130 50 L135 50 L135 55 L145 55 L145 48 L150 48 L150 42 L155 42 L155 48 L160 48 L160 55 L170 55 L170 50 L175 50 L175 45 L180 45 L180 50 L185 50 L185 55 L200 55 L200 80 Z"
                    fill={s.accent}
                  />
                </Svg>
                {/* Welcome screen: logo */}
                <Text style={{
                  fontSize: 52, fontWeight: '900', color: '#fff',
                  letterSpacing: -2, marginBottom: 8,
                }}>
                  Route<Text style={{ color: s.accent }}>O</Text>
                </Text>
                <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: s.accent, marginBottom: 32 }} />
                <Text style={{
                  fontSize: 28, fontWeight: '800', color: '#fff',
                  textAlign: 'center', letterSpacing: -0.5, lineHeight: 36,
                  marginBottom: 12,
                }}>
                  {language === 'fr' ? s.title_fr : s.title_en}
                </Text>
                <Text style={{
                  fontSize: 16, color: '#8899aa', textAlign: 'center',
                  lineHeight: 24, maxWidth: 300,
                }}>
                  {language === 'fr' ? s.body_fr : s.body_en}
                </Text>
              </>
            ) : 'isCampus' in s && (s as any).isCampus ? (
              <>
                {/* Campus selection screen */}
                <Text style={{
                  fontSize: 28, fontWeight: '800', color: '#fff',
                  textAlign: 'center', letterSpacing: -0.5, lineHeight: 36,
                  marginBottom: 8,
                }}>
                  {language === 'fr' ? s.title_fr : s.title_en}
                </Text>
                <Text style={{
                  fontSize: 14, color: '#8899aa', textAlign: 'center',
                  lineHeight: 20, marginBottom: 32,
                }}>
                  {language === 'fr' ? s.body_fr : s.body_en}
                </Text>
                <View style={{ width: '100%', gap: 12 }}>
                  {CAMPUS_CHOICES.map((c) => {
                    const selected = activeSchool === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={0.8}
                        onPress={() => setActiveSchool(selected ? null : c.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: selected ? c.accent + '18' : '#131d2e',
                          borderWidth: 2,
                          borderColor: selected ? '#00A78D' : '#1e2a3a',
                          borderRadius: 14, padding: 16, gap: 14,
                        }}
                      >
                        <Image source={CAMPUS_LOGOS[c.id]} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
                        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>
                          {language === 'fr' ? c.name_fr : c.name_en}
                        </Text>
                        {selected && (
                          <View style={{
                            width: 28, height: 28, borderRadius: 14,
                            backgroundColor: '#00A78D',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                {/* Feature screens: icon circle */}
                <View style={{
                  width: 100, height: 100, borderRadius: 50,
                  backgroundColor: s.iconBg + '20',
                  borderWidth: 1.5, borderColor: s.iconBg + '40',
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 40,
                }}>
                  <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: s.iconBg + '30',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={s.icon!} size={30} color={s.iconBg!} />
                    {s.id === 'live' && (
                      <View style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#0a0f1a',
                      }} />
                    )}
                  </View>
                </View>
                <Text style={{
                  fontSize: 28, fontWeight: '800', color: '#fff',
                  textAlign: 'center', letterSpacing: -0.5, lineHeight: 36,
                  marginBottom: 12,
                }}>
                  {language === 'fr' ? s.title_fr : s.title_en}
                </Text>
                <Text style={{
                  fontSize: 16, color: '#8899aa', textAlign: 'center',
                  lineHeight: 24, maxWidth: 300,
                }}>
                  {language === 'fr' ? s.body_fr : s.body_en}
                </Text>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Bottom area */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 52 }}>

        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel={t(`Go to slide ${i + 1}`, `Aller à la diapositive ${i + 1}`)} accessibilityState={{ selected: i === currentIndex }}>
              <View style={{
                width: i === currentIndex ? 28 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? slide.accent : '#1e2a3a',
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {isPickerSlide ? (
          /* Campus or Neighbourhood slide: Skip + Continue side by side */
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1, borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', borderWidth: 1.5, borderColor: '#3a4a5a',
              }}
              onPress={() => {
                saveCampus(null);
                goToSlide(currentIndex + 1);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Skip', 'Passer')}
            >
              <Text style={{ color: '#8899aa', fontWeight: '700', fontSize: 16 }}>
                {t('Skip', 'Passer')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, backgroundColor: '#00A78D',
                borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8,
              }}
              onPress={() => {
                saveCampus(activeSchool);
                goToSlide(currentIndex + 1);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Continue', 'Continuer')}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                {t('Continue', 'Continuer')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Next / Get Started button */}
            <TouchableOpacity
              style={{
                backgroundColor: slide.accent,
                borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8,
                opacity: finishing ? 0.6 : 1,
              }}
              onPress={() => isLast ? finish() : goToSlide(currentIndex + 1)}
              disabled={finishing}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('Get Started', 'Commencer') : t('Next slide', 'Diapositive suivante')}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>
                {isLast
                  ? (finishing ? t('Saving...', 'Sauvegarde...') : t('Get Started', 'Commencer'))
                  : t('Next', 'Suivant')}
              </Text>
              {!isLast && <Ionicons name="arrow-forward" size={18} color="white" />}
            </TouchableOpacity>

            {/* Skip link (non-last, non-picker screens) */}
            {!isLast && (
              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: 'center' }}
                onPress={finish}
                accessibilityRole="button"
                accessibilityLabel={t('Skip onboarding', 'Passer la pr\u00E9sentation')}
              >
                <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>
                  {t('Skip', 'Passer')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}
