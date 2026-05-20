import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.35;

const POSTER_URL = 'https://theprescott.com/wp-content/uploads/2026/04/PSC_Karaoke_2026_IG-SQUARE.jpg';

const EVENTS = [
  { id: '1', poster: POSTER_URL, venueName: 'The Prescott', eventTitle: 'Karaoke Night' },
  { id: '2', poster: POSTER_URL, venueName: 'The Prescott', eventTitle: 'Saturday Live Music' },
  { id: '3', poster: POSTER_URL, venueName: 'The Prescott', eventTitle: 'Thursday DJ Night' },
  { id: '4', poster: POSTER_URL, venueName: 'The Prescott', eventTitle: 'Sunday Brunch Party' },
];

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<SortOption>('Tonight');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => setSort(opt)}
              style={[styles.sortBtn, sort === opt && styles.sortBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortBtnText, sort === opt && styles.sortBtnTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={EVENTS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.85}>
            <Image source={{ uri: item.poster }} style={styles.cardImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.cardGradient}
            >
              <Text style={styles.cardVenue} numberOfLines={1}>{item.venueName}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.eventTitle}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  sortBtnActive: {
    backgroundColor: '#FF3B5C',
    borderColor: '#FF3B5C',
  },
  sortBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  grid: {
    paddingHorizontal: CARD_MARGIN,
    paddingBottom: 24,
  },
  row: {
    gap: CARD_MARGIN,
    marginBottom: CARD_MARGIN,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 32,
    paddingBottom: 10,
  },
  cardVenue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
});
