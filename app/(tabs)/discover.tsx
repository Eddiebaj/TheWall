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

const TORONTO_VENUES = [
  { id: '1', venue: 'Bar Hop', neighbourhood: 'King West', event: 'Friday Night Craft Beer', date: 'Fri May 23', time: '5PM - 2AM', cover: 'No cover' },
  { id: '2', venue: 'The Drake Hotel', neighbourhood: 'Queen West', event: 'Saturday Live Music', date: 'Sat May 24', time: '9PM - 2AM', cover: '$10' },
  { id: '3', venue: 'Horseshoe Tavern', neighbourhood: 'Queen West', event: 'Indie Night', date: 'Fri May 23', time: '10PM - 3AM', cover: '$15' },
  { id: '4', venue: "Lee's Palace", neighbourhood: 'Bloor', event: 'Live Concert', date: 'Sat May 24', time: '8PM - 1AM', cover: '$20' },
  { id: '5', venue: 'The Garrison', neighbourhood: 'Dundas West', event: 'DJ Night', date: 'Fri May 23', time: '10PM - 3AM', cover: '$10' },
  { id: '6', venue: 'Wrongbar', neighbourhood: 'Queen West', event: 'Electronic Night', date: 'Sat May 24', time: '11PM - 4AM', cover: '$15' },
  { id: '7', venue: 'Adelaide Hall', neighbourhood: 'King West', event: 'Hip Hop Night', date: 'Fri May 23', time: '10PM - 3AM', cover: '$20' },
  { id: '8', venue: 'The Great Hall', neighbourhood: 'Queen West', event: 'Karaoke Night', date: 'Thu May 22', time: '8PM - 1AM', cover: 'No cover' },
  { id: '9', venue: 'Coda', neighbourhood: 'College', event: 'Techno Night', date: 'Sat May 24', time: '11PM - 6AM', cover: '$25' },
  { id: '10', venue: '99 Sudbury', neighbourhood: 'West Queen West', event: 'Art + Music Night', date: 'Fri May 23', time: '9PM - 2AM', cover: '$10' },
  { id: '11', venue: 'Rec Room', neighbourhood: 'Entertainment District', event: 'Games Night', date: 'Sat May 24', time: '5PM - 1AM', cover: 'No cover' },
  { id: '12', venue: 'Baro', neighbourhood: 'King West', event: 'Latin Night', date: 'Fri May 23', time: '10PM - 3AM', cover: '$20' },
];

const TONIGHT_DATES = ['Fri May 23', 'Thu May 22'];

const SORT_OPTIONS = ['Tonight', 'This Week', 'Near Me'] as const;
type SortOption = typeof SORT_OPTIONS[number];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<SortOption>('Tonight');

  const filtered = sort === 'Tonight'
    ? TORONTO_VENUES.filter((v) => TONIGHT_DATES.includes(v.date))
    : TORONTO_VENUES;

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
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.85}>
            <Image source={{ uri: POSTER_URL }} style={styles.cardImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={styles.cardGradient}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{item.neighbourhood}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{item.cover}</Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.cardVenue} numberOfLines={1}>{item.venue}</Text>
                <Text style={styles.cardEvent} numberOfLines={1}>{item.event}</Text>
                <Text style={styles.cardDatetime}>{item.date} · {item.time}</Text>
              </View>
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
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '55%',
  },
  pillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  cardBottom: {
    gap: 1,
  },
  cardVenue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  cardEvent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  cardDatetime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    marginTop: 2,
  },
});
