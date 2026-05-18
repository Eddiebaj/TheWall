import React from 'react';
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
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface EventCard {
  id: string;
  image: string;
  venueName: string;
  neighbourhood: string;
  eventTitle: string;
  coverCharge: string;
  goingCount: number;
}

const CARDS: EventCard[] = [
  {
    id: '1',
    image: 'https://theprescott.com/wp-content/uploads/2026/04/PSC_Karaoke_2026_IG-SQUARE.jpg',
    venueName: 'The Prescott',
    neighbourhood: 'ByWard Market, Toronto',
    eventTitle: 'Karaoke Night — Every Friday',
    coverCharge: 'No cover',
    goingCount: 24,
  },
];

function Card({ item }: { item: EventCard }) {
  const insets = useSafeAreaInsets();
  const imageHeight = SCREEN_HEIGHT * 0.7;

  return (
    <View style={[styles.card, { height: SCREEN_HEIGHT }]}>
      {/* Poster image — top 70% */}
      <Image
        source={{ uri: item.image }}
        style={[styles.poster, { height: imageHeight }]}
        resizeMode="cover"
      />

      {/* Info panel — bottom 30% */}
      <View style={[styles.infoPanel, { paddingBottom: insets.bottom + 90 }]}>
        <View style={styles.infoInner}>
          <Text style={styles.eventTitle}>{item.eventTitle}</Text>
          <Text style={styles.venueName}>{item.venueName}</Text>
          <Text style={styles.neighbourhood}>{item.neighbourhood}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaBadge}>
              <Ionicons name="ticket-outline" size={13} color="#fff" />
              <Text style={styles.metaText}>{item.coverCharge}</Text>
            </View>
            <View style={styles.metaBadge}>
              <Ionicons name="people-outline" size={13} color="#fff" />
              <Text style={styles.metaText}>{item.goingCount} going</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.rsvpBtn} activeOpacity={0.85}>
            <Text style={styles.rsvpText}>I'm Going</Text>
          </TouchableOpacity>
        </View>

        {/* Right action rail */}
        <View style={styles.rightActions}>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="heart-outline" size={26} color="#fff" />
            <Text style={styles.actionLabel}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="share-social-outline" size={26} color="#fff" />
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="bookmark-outline" size={26} color="#fff" />
            <Text style={styles.actionLabel}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function WallFeed() {
  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={CARDS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Card item={item} />}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  card: {
    width: SCREEN_WIDTH,
    backgroundColor: '#0a0a0a',
  },
  poster: {
    width: SCREEN_WIDTH,
  },
  infoPanel: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  infoInner: {
    flex: 1,
    paddingRight: 12,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  venueName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  neighbourhood: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rsvpBtn: {
    backgroundColor: '#FF3B5C',
    paddingVertical: 11,
    paddingHorizontal: 26,
    borderRadius: 24,
    alignSelf: 'flex-start',
  },
  rsvpText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  rightActions: {
    alignItems: 'center',
    gap: 18,
    paddingTop: 4,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 3,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
});
