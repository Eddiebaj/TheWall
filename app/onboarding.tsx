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
import { useApp } from '../context/AppContext';
import { SK_CAMPUS, SK_HOME_NEIGHBOURHOOD, SK_ONBOARDED } from '../lib/storageKeys';
import { NEIGHBOURHOODS } from '../lib/neighbourhoodData';
import type { CampusId } from '../lib/campusData';

const LinearGradient: any = LinearGradientModule?.LinearGradient ?? View;
const { width } = Dimensions.get('window');

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
    id: 'neighbourhood',
    icon: 'location' as const,
    iconBg: '#c0852a',
    title_en: 'Your Neighbourhood',
    title_fr: 'Votre quartier',
    body_en: "Select your home neighbourhood to personalize events and deals near you.",
    body_fr: "Choisissez votre quartier pour personnaliser les evenements et offres pres de chez vous.",
    accent: '#c0852a',
    isWelcome: false,
    isNeighbourhood: true,
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
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState<string | null>(null);

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  };

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex) setCurrentIndex(index);
  };

  const finish = async () => {
    try {
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
    } catch (e) { if (__DEV__) console.warn('AsyncStorage error:', e); }
    router.replace('/(tabs)');
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

  const saveNeighbourhood = async (id: string | null) => {
    try {
      if (id) {
        await AsyncStorage.setItem(SK_HOME_NEIGHBOURHOOD, id);
      } else {
        await AsyncStorage.removeItem(SK_HOME_NEIGHBOURHOOD);
      }
    } catch (e) { if (__DEV__) console.warn('neighbourhood save error:', e); }
  };

  const isLast = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];
  const isCampusSlide = 'isCampus' in slide && (slide as any).isCampus;
  const isNeighbourhoodSlide = 'isNeighbourhood' in slide && (slide as any).isNeighbourhood;
  const isPickerSlide = isCampusSlide || isNeighbourhoodSlide;

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
                        <View style={{
                          width: 44, height: 44, borderRadius: 22,
                          backgroundColor: c.accent + '25',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name="school" size={22} color={c.accent} />
                        </View>
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
            ) : 'isNeighbourhood' in s && (s as any).isNeighbourhood ? (
              <>
                {/* Neighbourhood selection screen */}
                <Text style={{
                  fontSize: 28, fontWeight: '800', color: '#fff',
                  textAlign: 'center', letterSpacing: -0.5, lineHeight: 36,
                  marginBottom: 8,
                }}>
                  {language === 'fr' ? s.title_fr : s.title_en}
                </Text>
                <Text style={{
                  fontSize: 14, color: '#8899aa', textAlign: 'center',
                  lineHeight: 20, marginBottom: 24,
                }}>
                  {language === 'fr' ? s.body_fr : s.body_en}
                </Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ width: '100%', maxHeight: 340 }}
                  contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 8 }}
                >
                  {NEIGHBOURHOODS.map((n) => {
                    const selected = selectedNeighbourhood === n.id;
                    const name = language === 'fr' ? n.name_fr : n.name_en;
                    return (
                      <TouchableOpacity
                        key={n.id}
                        activeOpacity={0.85}
                        onPress={() => setSelectedNeighbourhood(selected ? null : n.id)}
                        style={{
                          width: (width - 72 - 10) / 2,
                          height: 80,
                          borderRadius: 12,
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor: selected ? '#00A78D' : 'transparent',
                        }}
                      >
                        <Image
                          source={{ uri: n.photoUrl }}
                          style={{ position: 'absolute', width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        <LinearGradient
                          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)']}
                          style={{ position: 'absolute', width: '100%', height: '100%' }}
                          pointerEvents="none"
                        />
                        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 8 }}>
                          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 }}>
                            {name}
                          </Text>
                        </View>
                        {selected && (
                          <View style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: '#00A78D',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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
                if (isCampusSlide) saveCampus(null);
                if (isNeighbourhoodSlide) saveNeighbourhood(null);
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
                if (isCampusSlide) saveCampus(activeSchool);
                if (isNeighbourhoodSlide) saveNeighbourhood(selectedNeighbourhood);
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
              }}
              onPress={() => isLast ? finish() : goToSlide(currentIndex + 1)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('Get Started', 'Commencer') : t('Next slide', 'Diapositive suivante')}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>
                {isLast
                  ? t('Get Started', 'Commencer')
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
