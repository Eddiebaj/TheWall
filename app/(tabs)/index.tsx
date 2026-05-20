import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
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
  events: { title: string } | null;
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

function VideoCard({ item, isActive }: { item: Post; isActive: boolean }) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, video_url, caption, duration, created_at, user_id, event_id, profiles(username), events(title)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) setPosts(data as Post[]);
  };

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  });

  const handleUploadSuccess = useCallback(() => {
    setShowUpload(false);
    loadPosts();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {activeTab === 'foryou' ? (
        posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No posts yet</Text>
            <Text style={styles.emptyHint}>Be the first to share a moment</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <VideoCard item={item} isActive={index === activeIndex} />
            )}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={SCREEN_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            viewabilityConfig={viewabilityConfig.current}
            onViewableItemsChanged={onViewableItemsChanged.current}
          />
        )
      ) : (
        <View style={styles.followingPlaceholder}>
          <Text style={styles.followingIcon}>👥</Text>
          <Text style={styles.followingText}>Follow friends to see their activity</Text>
        </View>
      )}

      <TabToggle active={activeTab} onSelect={setActiveTab} insetTop={insets.top} />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
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
  followingPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  followingIcon: { fontSize: 40 },
  followingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
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
