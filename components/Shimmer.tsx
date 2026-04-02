import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, View, ViewStyle } from 'react-native';

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

export { ShimmerBlock };
