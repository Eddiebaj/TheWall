import { useEffect, useRef } from 'react';
import { Animated, Dimensions, DimensionValue, View, ViewStyle } from 'react-native';

type ShimmerProps = {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  baseColor?: string;
};

function ShimmerBlock({ width, height, borderRadius = 8, style, baseColor = '#e0e0e0' }: ShimmerProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: baseColor, opacity },
        style,
      ]}
    />
  );
}

type SkeletonCardProps = {
  colours: { surface: string; border: string; bg: string };
  cardShadow?: Record<string, unknown>;
};

/** Board card skeleton */
export function BoardCardSkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ width: 160, height: 160, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, padding: 14, justifyContent: 'space-between' }}>
      <ShimmerBlock width={40} height={40} borderRadius={12} baseColor={base} />
      <View style={{ gap: 6 }}>
        <ShimmerBlock width="80%" height={12} baseColor={base} />
        <ShimmerBlock width="50%" height={10} baseColor={base} />
      </View>
    </View>
  );
}

/** Arrival row skeleton */
export function ArrivalRowSkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
      <ShimmerBlock width={44} height={44} borderRadius={12} baseColor={base} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <ShimmerBlock width="60%" height={12} baseColor={base} />
        <ShimmerBlock width="40%" height={10} baseColor={base} />
      </View>
      <ShimmerBlock width={36} height={20} borderRadius={10} baseColor={base} />
    </View>
  );
}

/** Alert card skeleton */
export function AlertCardSkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <ShimmerBlock width={60} height={18} borderRadius={6} baseColor={base} />
        <ShimmerBlock width={30} height={18} borderRadius={6} baseColor={base} />
      </View>
      <ShimmerBlock width="90%" height={14} baseColor={base} style={{ marginBottom: 6 }} />
      <ShimmerBlock width="70%" height={14} baseColor={base} />
    </View>
  );
}

/** Place / nearby card skeleton */
export function PlaceCardSkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ShimmerBlock width={48} height={48} borderRadius={14} baseColor={base} />
        <View style={{ flex: 1, gap: 6 }}>
          <ShimmerBlock width="70%" height={14} baseColor={base} />
          <ShimmerBlock width="50%" height={10} baseColor={base} />
          <ShimmerBlock width="30%" height={10} baseColor={base} />
        </View>
      </View>
    </View>
  );
}

/** Section header + horizontal cards skeleton */
export function HorizontalCardsSkeleton({ colours, count = 3 }: SkeletonCardProps & { count?: number }) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View>
      <ShimmerBlock width={120} height={12} baseColor={base} style={{ marginLeft: 20, marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', paddingLeft: 20, gap: 12 }}>
        {Array.from({ length: count }).map((_, i) => (
          <ShimmerBlock key={i} width={200} height={140} borderRadius={16} baseColor={base} />
        ))}
      </View>
    </View>
  );
}

/** Planner itinerary skeleton */
export function ItinerarySkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <ShimmerBlock width={80} height={16} baseColor={base} />
        <ShimmerBlock width={50} height={16} baseColor={base} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        <ShimmerBlock width={60} height={24} borderRadius={12} baseColor={base} />
        <ShimmerBlock width={40} height={24} borderRadius={12} baseColor={base} />
        <ShimmerBlock width={60} height={24} borderRadius={12} baseColor={base} />
      </View>
      <ShimmerBlock width="45%" height={10} baseColor={base} />
    </View>
  );
}

/** Generic content skeleton for neighbourhood sheet tabs */
export function ContentSkeleton({ colours, rows = 4 }: SkeletonCardProps & { rows?: number }) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ gap: 12, padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ShimmerBlock width={40} height={40} borderRadius={10} baseColor={base} />
          <View style={{ flex: 1, gap: 6 }}>
            <ShimmerBlock width={`${70 - i * 10}%`} height={12} baseColor={base} />
            <ShimmerBlock width={`${50 - i * 5}%`} height={10} baseColor={base} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Discover feed card skeleton */
export function FeedCardSkeleton({ colours }: SkeletonCardProps) {
  const base = colours.bg === '#f0f4f8' ? '#e2e8f0' : '#2a2f3a';
  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 12, marginHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ShimmerBlock width={44} height={44} borderRadius={12} baseColor={base} />
        <View style={{ flex: 1, gap: 6 }}>
          <ShimmerBlock width="75%" height={13} baseColor={base} />
          <ShimmerBlock width="45%" height={10} baseColor={base} />
        </View>
      </View>
    </View>
  );
}

// ─── Nightlife app (dark-only) skeletons ─────────────────────────────────────

const DARK_BASE = '#1e2130'; // visible against #0a0a0a bg, darker than surface

/**
 * Home "For You" feed — 2-column card grid.
 * Mirrors: GRID_PADDING=16, GRID_GAP=8, CARD_WIDTH=(SW-40)/2, height=width*1.25
 */
export function FeedGridSkeleton({ paddingTop = 0, count = 6 }: { paddingTop?: number; count?: number }) {
  const SW = Dimensions.get('window').width;
  const GRID_PADDING = 16;
  const GRID_GAP = 8;
  const CARD_W = (SW - GRID_PADDING * 2 - GRID_GAP) / 2;
  const CARD_H = Math.round(CARD_W * 1.25);
  const pairs = Math.ceil(count / 2);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop, paddingHorizontal: GRID_PADDING }}>
      {Array.from({ length: pairs }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP }}>
          {[0, 1].map(col => {
            const idx = row * 2 + col;
            if (idx >= count) return <View key={col} style={{ width: CARD_W }} />;
            return (
              <View key={col} style={{ width: CARD_W, height: CARD_H, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' }}>
                <ShimmerBlock width={CARD_W} height={CARD_H} borderRadius={0} baseColor={DARK_BASE} />
                {/* Mimic gradient+text overlay at the bottom */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, gap: 5 }}>
                  <ShimmerBlock width="55%" height={8} borderRadius={3} baseColor="rgba(255,255,255,0.1)" />
                  <ShimmerBlock width="80%" height={10} borderRadius={3} baseColor="rgba(255,255,255,0.15)" />
                  <ShimmerBlock width="45%" height={8} borderRadius={3} baseColor="rgba(255,255,255,0.08)" />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Discover screen — 2 category row placeholders.
 * Mirrors: section header + horizontal scroll of CARD_W=160 × CARD_H=220 cards.
 */
export function DiscoverRowsSkeleton() {
  const CARD_W = 160;
  const CARD_H = 220;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {[0, 1].map(section => (
        <View key={section} style={{ marginTop: section === 0 ? 8 : 24 }}>
          {/* Section header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShimmerBlock width={22} height={22} borderRadius={4} baseColor={DARK_BASE} />
              <ShimmerBlock width={100} height={14} borderRadius={6} baseColor={DARK_BASE} />
            </View>
            <ShimmerBlock width={52} height={12} borderRadius={6} baseColor={DARK_BASE} />
          </View>
          {/* Horizontal card strip */}
          <View style={{ flexDirection: 'row', paddingLeft: 16, gap: 10 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' }}>
                <ShimmerBlock width={CARD_W} height={CARD_H} borderRadius={0} baseColor={DARK_BASE} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, gap: 5 }}>
                  <ShimmerBlock width="60%" height={9} borderRadius={3} baseColor="rgba(255,255,255,0.12)" />
                  <ShimmerBlock width="85%" height={11} borderRadius={3} baseColor="rgba(255,255,255,0.18)" />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Event detail screen — hero poster + content rows.
 * Mirrors: POSTER_HEIGHT=300, then scrollable content with paddingHorizontal=20.
 */
export function EventDetailSkeleton({ paddingTop = 0, bg = '#0a0a0a' }: { paddingTop?: number; bg?: string }) {
  const SW = Dimensions.get('window').width;
  const POSTER_H = 300;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Hero image area */}
      <ShimmerBlock width={SW} height={POSTER_H} borderRadius={0} baseColor={DARK_BASE} />

      {/* Content */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 10 }}>
        {/* Title */}
        <ShimmerBlock width="90%" height={28} borderRadius={6} baseColor={DARK_BASE} />
        <ShimmerBlock width="60%" height={28} borderRadius={6} baseColor={DARK_BASE} />
        {/* Venue */}
        <ShimmerBlock width="45%" height={14} borderRadius={5} baseColor={DARK_BASE} style={{ marginTop: 4 }} />
        {/* Tags row */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <ShimmerBlock width={72} height={24} borderRadius={12} baseColor={DARK_BASE} />
          <ShimmerBlock width={56} height={24} borderRadius={12} baseColor={DARK_BASE} />
          <ShimmerBlock width={64} height={24} borderRadius={12} baseColor={DARK_BASE} />
        </View>
        {/* Info rows */}
        {[0, 1, 2].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <ShimmerBlock width={20} height={20} borderRadius={4} baseColor={DARK_BASE} />
            <ShimmerBlock width={`${55 - i * 8}%`} height={13} borderRadius={5} baseColor={DARK_BASE} />
          </View>
        ))}
      </View>
    </View>
  );
}

export { ShimmerBlock };
