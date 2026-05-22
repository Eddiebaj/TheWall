import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions, FlatList, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SK_ONBOARDED } from '../lib/storageKeys';
import { useAnalytics } from '../lib/analytics';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    headline: 'The Wall',
    subtext: 'Discover what\'s happening tonight in Toronto. Real venues, real events, updated daily.',
    icon: 'flame' as const,
  },
  {
    headline: 'See Who\'s Going',
    subtext: 'RSVP to events and see which of your friends are going out tonight. No more group chat spam.',
    icon: 'people' as const,
  },
  {
    headline: 'Your City Tonight',
    subtext: 'From rooftop bars to underground shows, find your scene and never miss a night worth going to.',
    icon: 'location' as const,
  },
];

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const { capture } = useAnalytics();

  const isLast = currentIndex === SLIDES.length - 1;

  const goToSlide = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
    capture('onboarding_step', { step: index + 1 });
  };

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const handleSkipOrFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      capture('onboarding_completed');
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
      router.replace('/auth');
    } catch (e) {
      if (__DEV__) console.warn('AsyncStorage error:', e);
      setFinishing(false);
    }
  };

  const handleContinue = () => {
    if (isLast) {
      handleSkipOrFinish();
    } else {
      goToSlide(currentIndex + 1);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity
          onPress={handleSkipOrFinish}
          activeOpacity={0.7}
          style={{
            position: 'absolute',
            top: 60,
            right: 24,
            zIndex: 10,
            paddingVertical: 6,
            paddingHorizontal: 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={{ color: '#666', fontSize: 15, fontWeight: '500' }}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={{
            width,
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 40,
          }}>
            <View style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: '#1a1a1a',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 44,
            }}>
              <Ionicons name={item.icon} size={44} color="#fff" />
            </View>

            <Text style={{
              fontSize: 32,
              fontWeight: '700',
              color: '#fff',
              textAlign: 'center',
              lineHeight: 40,
              marginBottom: 16,
              letterSpacing: -0.5,
            }}>
              {item.headline}
            </Text>

            <Text style={{
              fontSize: 16,
              color: '#999',
              textAlign: 'center',
              lineHeight: 24,
              maxWidth: 300,
            }}>
              {item.subtext}
            </Text>
          </View>
        )}
        style={{ flex: 1 }}
      />

      {/* Bottom controls */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 52 }}>
        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 32 }}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === currentIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === currentIndex ? '#fff' : '#333',
              }}
            />
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            paddingVertical: 17,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: finishing ? 0.6 : 1,
          }}
          onPress={handleContinue}
          disabled={finishing}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get Started' : 'Continue'}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 17 }}>
            {isLast ? (finishing ? 'Loading...' : 'Get Started') : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
