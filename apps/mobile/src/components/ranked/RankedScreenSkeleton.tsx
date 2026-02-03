// =====================================================
// RankedScreenSkeleton Component
// =====================================================
// Loading skeleton for the ranked screen.

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Shimmer Animation Hook
// =====================================================

function useShimmer() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();

    return () => animation.stop();
  }, [shimmerAnim]);

  return shimmerAnim;
}

// =====================================================
// Skeleton Box Component
// =====================================================

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}

function SkeletonBox({ width, height, borderRadius = 8, style }: SkeletonBoxProps) {
  const shimmerAnim = useShimmer();

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={[styles.skeletonBox, { width, height, borderRadius }, style]}>
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export function RankedScreenSkeleton() {
  return (
    <View style={styles.container}>
      {/* Season card skeleton */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <SkeletonBox width={120} height={24} />
          <SkeletonBox width={60} height={20} />
        </View>
        <View style={styles.cardCenter}>
          <SkeletonBox width={160} height={40} />
        </View>
        <View style={styles.cardFooter}>
          <SkeletonBox width={80} height={12} />
        </View>
      </View>

      {/* Rank badge skeleton */}
      <View style={styles.rankSection}>
        <View style={styles.circleSkeleton} />
        <SkeletonBox width={100} height={16} style={styles.rankLabel} />
      </View>

      {/* Progress bar skeleton */}
      <View style={styles.card}>
        <View style={styles.progressHeader}>
          <SkeletonBox width={80} height={14} />
          <SkeletonBox width={80} height={14} />
        </View>
        <SkeletonBox width="100%" height={12} borderRadius={6} style={styles.progressBar} />
        <View style={styles.progressFooter}>
          <SkeletonBox width={60} height={14} />
          <SkeletonBox width={120} height={12} />
        </View>
      </View>

      {/* Stats skeleton */}
      <View style={styles.statsCard}>
        <SkeletonBox width={40} height={28} />
        <SkeletonBox width={12} height={20} />
        <SkeletonBox width={40} height={28} />
        <View style={styles.statsDivider} />
        <SkeletonBox width={50} height={28} />
      </View>

      {/* Rewards track skeleton */}
      <View style={styles.rewardsSection}>
        <SkeletonBox width={120} height={14} style={styles.rewardsLabel} />
        <View style={styles.rewardsRow}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.rewardCard}>
              <SkeletonBox width={60} height={16} style={styles.rewardTier} />
              <SkeletonBox width={50} height={32} style={styles.rewardAmount} />
              <SkeletonBox width={30} height={12} />
            </View>
          ))}
        </View>
      </View>

      {/* CTA skeleton */}
      <View style={styles.ctaSection}>
        <SkeletonBox width="100%" height={56} borderRadius={28} />
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCenter: {
    alignItems: 'center',
    marginTop: 20,
  },
  cardFooter: {
    alignItems: 'center',
    marginTop: 8,
  },
  rankSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  circleSkeleton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: LUXURY_THEME.surface.elevated,
  },
  rankLabel: {
    marginTop: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressBar: {
    marginBottom: 12,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  statsDivider: {
    width: 1,
    height: 32,
    backgroundColor: LUXURY_THEME.border.muted,
    marginHorizontal: 12,
  },
  rewardsSection: {
    marginBottom: 24,
  },
  rewardsLabel: {
    marginBottom: 16,
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rewardCard: {
    width: 140,
    height: 160,
    borderRadius: 16,
    backgroundColor: LUXURY_THEME.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  rewardTier: {
    marginBottom: 12,
  },
  rewardAmount: {
    marginBottom: 8,
  },
  ctaSection: {
    paddingHorizontal: 20,
  },
  skeletonBox: {
    backgroundColor: LUXURY_THEME.surface.elevated,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    width: 100,
  },
});

export default RankedScreenSkeleton;
