import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface EventCardSkeletonProps {
  index?: number;
}

/**
 * Skeleton loader that matches EventCard dimensions exactly
 *
 * Features:
 * - Shimmer animation using Animated API
 * - Matches EventCard layout precisely to prevent layout shift
 * - Staggered appearance for multiple skeletons
 */
export function EventCardSkeleton({ index = 0 }: EventCardSkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in with stagger
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay: index * 50,
      useNativeDriver: true,
    }).start();

    // Continuous shimmer animation
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();

    return () => shimmer.stop();
  }, [shimmerAnim, fadeAnim, index]);

  // Interpolate shimmer opacity for smooth pulsing effect
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <View className="bg-surface rounded-2xl p-4 mb-3" style={styles.card}>
        {/* Header skeleton */}
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-row items-center">
            <Animated.View
              className="bg-surface-elevated rounded-lg mr-3"
              style={[styles.sportBadge, { opacity: shimmerOpacity }]}
            />
            <Animated.View
              className="bg-surface-elevated rounded"
              style={[styles.dateText, { opacity: shimmerOpacity }]}
            />
          </View>
        </View>

        {/* Teams skeleton */}
        <View className="mb-4">
          {/* Away team */}
          <View className="flex-row items-center mb-3">
            <Animated.View
              className="bg-surface-elevated rounded-full"
              style={[styles.teamLogo, { opacity: shimmerOpacity }]}
            />
            <View className="ml-3 flex-1">
              <Animated.View
                className="bg-surface-elevated rounded mb-2"
                style={[styles.teamName, { opacity: shimmerOpacity }]}
              />
              <Animated.View
                className="bg-surface-elevated rounded"
                style={[styles.teamLabel, { opacity: shimmerOpacity }]}
              />
            </View>
          </View>

          {/* Home team */}
          <View className="flex-row items-center">
            <Animated.View
              className="bg-surface-elevated rounded-full"
              style={[styles.teamLogo, { opacity: shimmerOpacity }]}
            />
            <View className="ml-3 flex-1">
              <Animated.View
                className="bg-surface-elevated rounded mb-2"
                style={[styles.teamName, { opacity: shimmerOpacity }]}
              />
              <Animated.View
                className="bg-surface-elevated rounded"
                style={[styles.teamLabel, { opacity: shimmerOpacity }]}
              />
            </View>
          </View>
        </View>

        {/* Odds skeleton */}
        <View className="border-t border-background pt-3">
          {/* Spread */}
          <View className="flex-row items-center mb-2">
            <Animated.View
              className="bg-surface-elevated rounded"
              style={[styles.oddsLabel, { opacity: shimmerOpacity }]}
            />
            <View className="flex-1 flex-row ml-16">
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
            </View>
          </View>

          {/* Moneyline */}
          <View className="flex-row items-center mb-2">
            <Animated.View
              className="bg-surface-elevated rounded"
              style={[styles.oddsLabel, { opacity: shimmerOpacity }]}
            />
            <View className="flex-1 flex-row ml-16">
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
            </View>
          </View>

          {/* Total */}
          <View className="flex-row items-center">
            <Animated.View
              className="bg-surface-elevated rounded"
              style={[styles.oddsLabel, { opacity: shimmerOpacity }]}
            />
            <View className="flex-1 flex-row ml-16">
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
              <Animated.View
                className="flex-1 bg-background rounded-lg mx-1"
                style={[styles.oddsButton, { opacity: shimmerOpacity }]}
              />
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {},
  card: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sportBadge: {
    width: 48,
    height: 24,
  },
  dateText: {
    width: 140,
    height: 12,
  },
  teamLogo: {
    width: 48,
    height: 48,
  },
  teamName: {
    width: 120,
    height: 18,
  },
  teamLabel: {
    width: 40,
    height: 12,
  },
  oddsLabel: {
    width: 48,
    height: 12,
  },
  oddsButton: {
    height: 44,
  },
});
