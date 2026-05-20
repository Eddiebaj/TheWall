import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import UploadModal from '../../components/UploadModal';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface Post {
  id: string;
  video_url: string;
  caption: string | null;
  duration: number | null;
  created_at: string;
  user_id: string;
  event_id: string | null;
  profiles: { username: string } | null;
  events: { title: string; venues: { neighbourhood: string | null } | null } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const REPORT_REASONS = [
  'Inappropriate content',
  'Spam',
  'Harassment',
  'Other',
];

function VideoCard({ item, isActive, userId }: { item: Post; isActive: boolean; userId: string | undefined }) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  const showReasonSheet = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...REPORT_REASONS, 'Cancel'],
          cancelButtonIndex: REPORT_REASONS.length,
          title: 'Why are you reporting this?',
        },
        async (idx) => {
          if (idx === REPORT_REASONS.length) return;
          await submitReport(REPORT_REASONS[idx]);
        }
      );
    } else {
      // Android fallback via Alert
      Alert.alert('Report reason', 'Select a reason', [
        ...REPORT_REASONS.map(r => ({ text: r, onPress: () => submitReport(r) })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const submitReport = async (reason: string) => {
    if (!userId) {
      Alert.alert('Sign in required', 'You must be signed in to report content.');
      return;
    }
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      post_id: item.id,
      reason,
    });
    if (error) {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } else {
      Alert.alert('Thanks for reporting', "We'll review this content.");
    }
  };

  const showMenuSheet = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Report', 'Cancel'],
          cancelButtonIndex: 1,
          destructiveButtonIndex: 0,
        },
        (idx) => {
          if (idx === 0) showReasonSheet();
        }
      );
    } else {
      Alert.alert('Options', undefined, [
        { text: 'Report', style: 'destructive', onPress: showReasonSheet },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isActive]);

  return (
    <View style={[styles.card, { height: SCREEN_HEIGHT }]}>
      <TouchableOpacity
        style={[styles.menuBtn, { top: insets.top + 12 }]}
        onPress={showMenuSheet}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
      </TouchableOpacity>
      <Video
        ref={videoRef}
        source={{ uri: item.video_url }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted
        shouldPlay={false}
        useNativeControls={false}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.gradient, { paddingBottom: insets.bottom + 90 }]}
      >
        <Text style={styles.username}>
          {item.profiles?.username ? `@${item.profiles.username}` : '@user'}
        </Text>
        {item.events?.title && (
          <Text style={styles.eventTag}>{item.events.title}</Text>
        )}
        {item.caption ? (
          <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
        ) : null}
        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
      </LinearGradient>
    </View>
  );
}

function TabToggle({
  active,
  onSelect,
  insetTop,
}: {
  active: 'foryou' | 'following';
  onSelect: (t: 'foryou' | 'following') => void;
  insetTop: number;
}) {
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [hasFriends, setHasFriends] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [followingActiveIndex, setFollowingActiveIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadPosts();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'following') loadFollowingPosts();
  }, [activeTab, user]);

  const loadPosts = async () => {
    const [postsRes, friendsRes, rsvpRes] = await Promise.all([
      supabase
        .from('posts')
        .select('id, video_url, caption, duration, created_at, user_id, event_id, profiles(username), events(title, venues(neighbourhood))')
        .order('created_at', { ascending: false })
        .limit(50),
      user
        ? supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from('event_rsvps')
            .select('events(venues(neighbourhood))')
            .eq('user_id', user.id)
            .eq('status', 'going')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setLoading(false);
    if (postsRes.error || !postsRes.data) return;

    const friendIds = new Set<string>(
      (friendsRes.data ?? []).map((f: any) =>
        f.requester_id === user?.id ? f.addressee_id : f.requester_id
      )
    );

    const userNeighbourhood: string | null =
      (rsvpRes.data as any)?.events?.venues?.neighbourhood ?? null;

    const scored = (postsRes.data as Post[]).map(post => {
      let score = 1;
      if (user && friendIds.has(post.user_id)) {
        score = 3;
      } else if (
        userNeighbourhood &&
        post.events?.venues?.neighbourhood === userNeighbourhood
      ) {
        score = 2;
      }
      return { post, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime();
    });

    setPosts(scored.map(s => s.post));
  };

  const loadFollowingPosts = async () => {
    if (!user) { setHasFriends(false); setFollowingPosts([]); return; }

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships || friendships.length === 0) {
      setHasFriends(false);
      setFollowingPosts([]);
      return;
    }

    setHasFriends(true);
    const friendIds = friendships.map(f =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    const { data, error } = await supabase
      .from('posts')
      .select('id, video_url, caption, duration, created_at, user_id, event_id, profiles(username), events(title)')
      .in('user_id', friendIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) setFollowingPosts(data as Post[]);
  };

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  });
  const onFollowingViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setFollowingActiveIndex(viewableItems[0].index ?? 0);
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    if (activeTab === 'following') await loadFollowingPosts();
    setRefreshing(false);
  }, [activeTab]);

  const handleUploadSuccess = useCallback(() => {
    setShowUpload(false);
    loadPosts();
  }, []);

  const renderFeed = (data: Post[], activeIdx: number, onViewable: React.MutableRefObject<any>, emptyIcon: string, emptyText: string, emptyHint: string, refreshCtrl?: React.ReactElement) => {
    if (data.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name={emptyIcon as any} size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>{emptyText}</Text>
          <Text style={styles.emptyHint}>{emptyHint}</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <VideoCard item={item} isActive={index === activeIdx} userId={user?.id} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewable.current}
        refreshControl={refreshCtrl}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {activeTab === 'foryou'
        ? (posts.length === 0 && !loading
          ? (
            <View style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No Moments yet</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/discover')}>
                  <Text style={styles.emptyBtnText}>Discover Events</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/friends')}>
                  <Text style={styles.emptyBtnText}>Add Friends</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
          : renderFeed(posts, activeIndex, onViewableItemsChanged, 'videocam-outline', 'No moments yet', 'Be the first to share a moment', <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />)
        )
        : !hasFriends
          ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>Add friends to see their Moments</Text>
              <Text style={styles.emptyHint}>Find friends in the Friends tab</Text>
            </View>
          )
          : renderFeed(followingPosts, followingActiveIndex, onFollowingViewableItemsChanged, 'videocam-outline', "Your friends haven't posted any Moments yet", 'Check back soon', <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B5C" />)
      }

      <TabToggle active={activeTab} onSelect={setActiveTab} insetTop={insets.top} />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 8 }]}
        onPress={() => setShowUpload(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <UploadModal
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={handleUploadSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  card: { width: SCREEN_WIDTH, backgroundColor: '#000' },
  menuBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    padding: 6,
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventTag: {
    color: '#FF3B5C',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  caption: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 6,
  },
  timeAgo: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
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
  tabBtn: { alignItems: 'center', paddingVertical: 4 },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabTextActive: { color: '#fff' },
  tabUnderline: {
    marginTop: 3,
    height: 2,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  emptyBtn: {
    borderWidth: 1.5,
    borderColor: '#FF3B5C',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  emptyBtnText: {
    color: '#FF3B5C',
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B5C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#FF3B5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
