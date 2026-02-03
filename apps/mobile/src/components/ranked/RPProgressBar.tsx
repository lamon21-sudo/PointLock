// =====================================================
// RPProgressBar Component
// =====================================================
// Displays RP (rank points) progress toward next rank.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Rank, RANK_DISPLAY, RANK_THRESHOLDS, RANK_ORDER } from '@pick-rivals/shared-types';
import { LUXURY_THEME, GRADIENTS } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface RPProgressBarProps {
  currentRP: number;
  currentRank: Rank;
  animated?: boolean;
}

// =====================================================
// Helper Functions
// =====================================================

function getNextRank(rank: Rank): Rank | null {
  const currentIndex = RANK_ORDER.indexOf(rank);
  if (currentIndex === RANK_ORDER.length - 1) {
    return null; // Already at max rank
  }
  return RANK_ORDER[currentIndex + 1];
}

function calculateProgress(currentRP: number, currentRank: Rank): number {
  const nextRank = getNextRank(currentRank);

  if (!nextRank) {
    return 100; // Max rank achieved
  }

  const currentThreshold = RANK_THRESHOLDS[currentRank];
  const nextThreshold = RANK_THRESHOLDS[nextRank];
  const range = nextThreshold - currentThreshold;

  if (range === 0) return 100;

  const progress = ((currentRP - currentThreshold) / range) * 100;
  return Math.max(0, Math.min(100, progress));
}

function getRPToNextRank(currentRP: number, currentRank: Rank): number {
  const nextRank = getNextRank(currentRank);

  if (!nextRank) {
    return 0; // Max rank achieved
  }

  const nextThreshold = RANK_THRESHOLDS[nextRank];
  return Math.max(0, nextThreshold - currentRP);
}

// =====================================================
// Component
// =====================================================

export function RPProgressBar({
  currentRP,
  currentRank,
  animated = true,
}: RPProgressBarProps) {
  const progress = calculateProgress(currentRP, currentRank);
  const nextRank = getNextRank(currentRank);
  const rpToNext = getRPToNextRank(currentRP, currentRank);
  const isMaxRank = nextRank === null;

  const currentInfo = RANK_DISPLAY[currentRank];
  const nextInfo = nextRank ? RANK_DISPLAY[nextRank] : null;

  // Animation
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.spring(widthAnim, {
        toValue: progress,
        tension: 40,
        friction: 8,
        useNativeDriver: false,
      }).start();
    } else {
      widthAnim.setValue(progress);
    }
  }, [progress, animated, widthAnim]);

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Header with current and next rank */}
      <View style={styles.header}>
        <View style={styles.rankInfo}>
          <View style={[styles.rankDot, { backgroundColor: currentInfo.color }]} />
          <Text style={styles.currentRankText}>{currentInfo.name}</Text>
        </View>

        {nextInfo && (
          <View style={styles.rankInfo}>
            <Text style={styles.nextRankText}>{nextInfo.name}</Text>
            <View style={[styles.rankDot, { backgroundColor: nextInfo.color }]} />
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFillWrapper, { width: animatedWidth }]}>
            <LinearGradient
              colors={GRADIENTS.goldButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.barFill}
            />
          </Animated.View>
        </View>
      </View>

      {/* RP values */}
      <View style={styles.footer}>
        <Text style={styles.rpValue}>
          {currentRP.toLocaleString()} RP
        </Text>

        {isMaxRank ? (
          <Text style={styles.maxRankText}>MAX RANK ACHIEVED</Text>
        ) : (
          <Text style={styles.rpToNext}>
            {rpToNext.toLocaleString()} RP to {nextInfo?.name}
          </Text>
        )}
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rankInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  currentRankText: {
    fontSize: 13,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
  },
  nextRankText: {
    fontSize: 13,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
  },
  barContainer: {
    marginBottom: 8,
  },
  barTrack: {
    height: 12,
    backgroundColor: LUXURY_THEME.surface.raised,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFillWrapper: {
    height: '100%',
  },
  barFill: {
    flex: 1,
    borderRadius: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rpValue: {
    fontSize: 14,
    fontWeight: '700',
    color: LUXURY_THEME.gold.brushed,
  },
  rpToNext: {
    fontSize: 12,
    fontWeight: '500',
    color: LUXURY_THEME.text.secondary,
  },
  maxRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: LUXURY_THEME.gold.vibrant,
    letterSpacing: 1,
  },
});

export default RPProgressBar;
