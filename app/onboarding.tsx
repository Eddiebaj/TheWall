import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions, ScrollView, StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../context/AppContext';
import { SK_ONBOARDED } from '../lib/storageKeys';

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

export default function OnboardingScreen() {
  const { colours, fonts, t, language } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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
    } catch (e) { console.warn('AsyncStorage error:', e); }
    router.replace('/(tabs)');
  };

  const isLast = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];

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
            <TouchableOpacity key={i} onPress={() => goToSlide(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <View style={{
                width: i === currentIndex ? 28 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? slide.accent : '#1e2a3a',
              }} />
            </TouchableOpacity>
          ))}
        </View>

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
        >
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 17 }}>
            {isLast
              ? t('Get Started', 'Commencer')
              : t('Next', 'Suivant')}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color="white" />}
        </TouchableOpacity>

        {/* Skip link (screens 1-3 only) */}
        {!isLast && (
          <TouchableOpacity
            style={{ paddingVertical: 14, alignItems: 'center' }}
            onPress={finish}
          >
            <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>
              {t('Skip', 'Passer')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
