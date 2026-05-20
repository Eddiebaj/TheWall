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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const POSTER_URL = 'https://theprescott.com/wp-content/uploads/2026/04/PSC_Karaoke_2026_IG-SQUARE.jpg';

interface EventCard {
  id: string;
  poster: string;
  venueName: string;
  username: string;
  eventTitle: string;
}

const CARDS: EventCard[] = [
  {
    id: '1',
    poster: POSTER_URL,
    venueName: 'The Prescott',
    username: '@theprescott',
    eventTitle: 'Karaoke Night — Every Friday',
  },
  {
    id: '2',
    poster: POSTER_URL,
    venueName: 'The Prescott',
    username: '@theprescott',
    eventTitle: 'Saturday Night Live Music',
  },
];

function Card({ item }: { item: EventCard }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.card, { height: SCREEN_HEIGHT }]}>
      {/* Black background with video placeholder */}
      <View style={styles.videoPlaceholder}>
        <Ionicons name="play-circle-outline" size={64} color="rgba(255,255,255,0.3)" />
      </View>

      {/* Top-right poster thumbnail */}
      <TouchableOpacity
        style={[styles.posterThumb, { top: insets.top + 60 }]}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.poster }} style={styles.posterThumbImage} resizeMode="cover" />
      </TouchableOpacity>

      {/* Bottom overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.gradient, { paddingBottom: insets.bottom + 90 }]}
      >
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.venueName}>{item.venueName}</Text>
        <Text style={styles.eventTitle}>{item.eventTitle}</Text>

        <TouchableOpacity style={styles.rsvpBtn} activeOpacity={0.85}>
          <Text style={styles.rsvpText}>I'm Going</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

function TabToggle({ active, onSelect, insetTop }: { active: 'foryou' | 'following'; onSelect: (t: 'foryou' | 'following') => void; insetTop: number }) {
  return (
    <View style={[styles.tabBar, { top: insetTop + 12 }]}>
      <TouchableOpacity onPress={() => onSelect('foryou')} style={styles.tabBtn}>
        <Text style={[styles.tabText, active === 'foryou' && styles.tabTextActive]}>For You</Text>
        {active === 'foryou' && <View style={styles.tabUnderline} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onSelect('following')} style={styles.tabBtn}>
        <Text style={[styles.tabText, active === 'following' && styles.tabTextActive]}>Following</Text>
        {active === 'following' && <View style={styles.tabUnderline} />}
      </TouchableOpacity>
    </View>
  );
}

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {activeTab === 'foryou' ? (
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
      ) : (
        <View style={styles.followingPlaceholder}>
          <Text style={styles.followingIcon}>👥</Text>
          <Text style={styles.followingText}>Follow friends to see their activity</Text>
        </View>
      )}

      <TabToggle active={activeTab} onSelect={setActiveTab} insetTop={insets.top} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  card: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  videoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterThumb: {
    position: 'absolute',
    right: 14,
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  posterThumbImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  username: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  venueName: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 18,
  },
  rsvpBtn: {
    backgroundColor: '#FF3B5C',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignSelf: 'flex-start',
  },
  rsvpText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    zIndex: 10,
  },
  tabBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabUnderline: {
    marginTop: 3,
    height: 2,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  followingPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  followingIcon: {
    fontSize: 40,
  },
  followingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
  },
});
