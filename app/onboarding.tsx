import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, ScrollView, StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../context/AppContext';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'bus' as const,
    iconColor: '#00A78D',
    title_en: 'Ottawa in\nyour pocket.',
    title_fr: 'Ottawa dans\nvotre poche.',
    sub_en: 'Real-time arrivals for every OC Transpo stop — bus, O-Train, and more.',
    sub_fr: 'Arrivées en temps réel pour chaque arrêt OC Transpo — bus, O-Train et plus.',
    accent: '#00A78D',
  },
  {
    id: '2',
    icon: 'map' as const,
    iconColor: '#004890',
    title_en: 'Explore what\'s\nnearby.',
    title_fr: 'Explorez ce\nqui est proche.',
    sub_en: 'Find coffee, food, gyms and more sorted by walking distance from your stop.',
    sub_fr: 'Trouvez cafés, restos, gyms et plus, triés par distance à pied de votre arrêt.',
    accent: '#004890',
  },
  {
    id: '3',
    icon: 'shield' as const,
    iconColor: '#7b5ea7',
    title_en: 'Stay safe\nout there.',
    title_fr: 'Restez en\nsécurité.',
    sub_en: 'Trip sharing, late night tips, and emergency contacts — always one tap away.',
    sub_fr: 'Partage de trajet, conseils tardifs et contacts d\'urgence — toujours à portée.',
    accent: '#7b5ea7',
  },
];

export default function OnboardingScreen() {
  const { colours, fonts, language, t } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateSlide = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
    animateSlide();
  };

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
      animateSlide();
    }
  };

  const finish = async () => {
    await AsyncStorage.setItem('routeo_onboarded', 'true');
    router.replace('/(tabs)');
  };

  const requestLocation = async () => {
    setLocationLoading(true);
    await Location.requestForegroundPermissionsAsync();
    setLocationLoading(false);
    finish();
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle="light-content" />

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
        {SLIDES.map((s, i) => (
          <View key={s.id} style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>

            {/* Big icon circle */}
            <View style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: s.accent + '18',
              borderWidth: 1.5, borderColor: s.accent + '40',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 48,
            }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: s.accent + '25',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={s.icon} size={36} color={s.iconColor} />
              </View>
            </View>

            {/* Text */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
              <Text style={{
                fontSize: 36, fontWeight: '800', color: colours.text,
                textAlign: 'center', letterSpacing: -1, lineHeight: 42,
                marginBottom: 16,
              }}>
                {language === 'fr' ? s.title_fr : s.title_en}
              </Text>
              <Text style={{
                fontSize: fonts.md, color: colours.muted,
                textAlign: 'center', lineHeight: 24, maxWidth: 300,
              }}>
                {language === 'fr' ? s.sub_fr : s.sub_en}
              </Text>
            </Animated.View>

          </View>
        ))}
      </ScrollView>

      {/* Bottom area */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 52 }}>

        {/* Dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
              <View style={{
                width: i === currentIndex ? 24 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? slide.accent : colours.border,
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA button */}
        {isLastSlide ? (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: slide.accent,
                borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8,
              }}
              onPress={requestLocation}
              disabled={locationLoading}
            >
              <Ionicons name="location" size={18} color="white" />
              <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.lg }}>
                {locationLoading ? t('Getting location...', 'Localisation...') : t('Enable Location', 'Activer la localisation')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 12, alignItems: 'center' }}
              onPress={finish}
            >
              <Text style={{ color: colours.muted, fontSize: fonts.sm, fontWeight: '600' }}>
                {t('Skip for now', 'Passer pour l\'instant')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              backgroundColor: slide.accent,
              borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row',
              justifyContent: 'center', gap: 8,
            }}
            onPress={() => goToSlide(currentIndex + 1)}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.lg }}>
              {t('Next', 'Suivant')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* RouteO wordmark top left */}
      <View style={{ position: 'absolute', top: 60, left: 24 }}>
        <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text, letterSpacing: -0.5 }}>
          Route<Text style={{ color: slide.accent }}>O</Text>
        </Text>
      </View>

    </View>
  );
}
