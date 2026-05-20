import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
let LinearGradientModule: typeof import('expo-linear-gradient') | null = null;
try { LinearGradientModule = require('expo-linear-gradient'); } catch {}
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions, Keyboard, ScrollView, StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import { SK_ONBOARDED } from '../lib/storageKeys';


const LinearGradient: any = LinearGradientModule?.LinearGradient ?? View;
const { width } = Dimensions.get('window');

const TEAL = '#00A78D';
const SLIDE_COUNT = 4;

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

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
      await AsyncStorage.setItem(SK_ONBOARDED, 'true');
      router.replace('/(tabs)');
    } catch (e) {
      if (__DEV__) console.warn('AsyncStorage error:', e);
      setFinishing(false);
    }
  };

  // Slide logic
  const isLast = currentIndex === SLIDE_COUNT - 1;
  const accent = TEAL;

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
        {/* Slide 1: Discover */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="sparkles" size={48} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            Discover Toronto's nightlife
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            Browse tonight's events and deals from the best venues in the city
          </Text>
        </View>

        {/* Slide 2: Friends */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="people" size={48} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            Tell friends you're going
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            RSVP to events and see which friends are heading out tonight
          </Text>
        </View>

        {/* Slide 3: Share */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="videocam" size={48} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            Share the moment
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            Post a short video from the night  -  tied to the venue, saved forever
          </Text>
        </View>

        {/* Slide 4: Memories */}
        <View style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: TEAL + '20', borderWidth: 1.5, borderColor: TEAL + '40',
            alignItems: 'center', justifyContent: 'center', marginBottom: 40,
          }}>
            <Ionicons name="bookmark" size={48} color={TEAL} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 36, marginBottom: 12 }}>
            Build your collection
          </Text>
          <Text style={{ fontSize: 16, color: '#8899aa', textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            Every event you attend becomes part of your permanent wall of memories
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
              accessibilityLabel={`Go to slide ${i + 1}`}
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

        {isLast ? (
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
            accessibilityLabel="Get Started"
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
              {finishing ? 'Loading...' : 'Get Started'}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={{
                backgroundColor: accent, borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={() => goToSlide(currentIndex + 1)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Next"
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>Next</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={finish}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip"
            >
              <Text style={{ color: '#5a6a7a', fontSize: 14, fontWeight: '600' }}>Skip</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
