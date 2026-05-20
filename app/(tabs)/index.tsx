import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface EventCard {
  id: string;
  poster: string | null;
  venueName: string;
  username: string;
  eventTitle: string;
  goingCount: number;
  isGoing: boolean;
}

function Card({ item, onToggleRsvp }: { item: EventCard; onToggleRsvp: (id: string) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.card, { height: SCREEN_HEIGHT }]}>
      <View style={styles.videoPlaceholder}>
        <Ionicons name="play-circle-outline" size={64} color="rgba(255,255,255,0.3)" />
      </View>

      {item.poster && (
        <TouchableOpacity
          style={[styles.posterThumb, { top: insets.top + 60 }]}
          activeOpacity={0.8}
        >
          <Image source={{ uri: item.poster }} style={styles.posterThumbImage} resizeMode="cover" />
        </TouchableOpacity>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.gradient, { paddingBottom: insets.bottom + 90 }]}
      >
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.venueName}>{item.venueName}</Text>
        <Text style={styles.eventTitle}>{item.eventTitle}</Text>

        <View style={styles.rsvpRow}>
          <TouchableOpacity
            style={[styles.rsvpBtn, item.isGoing && styles.rsvpBtnActive]}
            activeOpacity={0.85}
            onPress={() => onToggleRsvp(item.id)}
          >
            <Text style={styles.rsvpText}>{item.isGoing ? "I'm Going ✓" : "I'm Going"}</Text>
          </TouchableOpacity>
          {item.goingCount > 0 && (
            <Text style={styles.goingCount}>{item.goingCount} going</Text>
          )}
        </View>
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
  const [cards, setCards] = useState<EventCard[]>([]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  useEffect(() => {
    loadEvents();
  }, [user]);

  const loadEvents = async () => {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, poster_url, venues(name, username)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !events) return;

    // Fetch going counts for all events
    const eventIds = events.map((e: any) => e.id);
    const { data: rsvpCounts } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'going');

    // Fetch current user's RSVPs
    let userRsvpIds: string[] = [];
    if (user) {
      const { data: userRsvps } = await supabase
        .from('event_rsvps')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('user_id', user.id)
        .eq('status', 'going');
      userRsvpIds = (userRsvps || []).map((r: any) => r.event_id);
    }

    const countMap: Record<string, number> = {};
    for (const r of rsvpCounts || []) {
      countMap[r.event_id] = (countMap[r.event_id] || 0) + 1;
    }

    setCards(events.map((e: any) => ({
      id: e.id,
      poster: e.poster_url || null,
      venueName: e.venues?.name || '',
      username: e.venues?.username ? `@${e.venues.username}` : '',
      eventTitle: e.title,
      goingCount: countMap[e.id] || 0,
      isGoing: userRsvpIds.includes(e.id),
    })));
  };

  const handleToggleRsvp = useCallback(async (eventId: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to RSVP to events.');
      return;
    }

    const card = cards.find(c => c.id === eventId);
    if (!card) return;

    if (card.isGoing) {
      // Optimistic update
      setCards(prev => prev.map(c => c.id === eventId
        ? { ...c, isGoing: false, goingCount: Math.max(0, c.goingCount - 1) }
        : c
      ));
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user.id);
      if (error) {
        // Revert on failure
        setCards(prev => prev.map(c => c.id === eventId
          ? { ...c, isGoing: true, goingCount: c.goingCount + 1 }
          : c
        ));
      }
    } else {
      // Optimistic update
      setCards(prev => prev.map(c => c.id === eventId
        ? { ...c, isGoing: true, goingCount: c.goingCount + 1 }
        : c
      ));
      const { error } = await supabase
        .from('event_rsvps')
        .insert({ event_id: eventId, user_id: user.id, status: 'going' });
      if (error) {
        // Revert on failure
        setCards(prev => prev.map(c => c.id === eventId
          ? { ...c, isGoing: false, goingCount: Math.max(0, c.goingCount - 1) }
          : c
        ));
      }
    }
  }, [user, cards]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {activeTab === 'foryou' ? (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Card item={item} onToggleRsvp={handleToggleRsvp} />}
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
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rsvpBtn: {
    backgroundColor: '#FF3B5C',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignSelf: 'flex-start',
  },
  rsvpBtnActive: {
    backgroundColor: '#c0392b',
  },
  rsvpText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  goingCount: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
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
