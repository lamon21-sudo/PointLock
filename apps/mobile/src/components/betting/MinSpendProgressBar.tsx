// =====================================================
// MinSpendProgressBar Component
// =====================================================
// Animated progress bar showing coin spend vs minimum requirement.
// Gold when under minimum, green when requirement is met.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

export interface MinSpendProgressBarProps {
  /** Current coin spend */
  currentSpend: number;
  /** Minimum coin spend required */
  minimumSpend: number;
  /** Enable spring animation (default: true) */
  animated?: boolean;
  /** Bar height in pixels (default: 8) */
  height?: number;
}

/**
 * MinSpendProgressBar - Shows progress toward minimum coin spend
 *
 * Features:
 * - Spring animation on value changes
 * - Gold fill when under minimum
 * - Green fill when minimum is met
 * - Shows "current/min coins" label
 * - Smooth 60fps animation
 */
export function MinSpendProgressBar({
  currentSpend,
  minimumSpend,
  animated = true,
  height = 8,
}: MinSpendProgressBarProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const prevSpend = useRef(currentSpend);

  // Calculate progress percentage (capped at 100%)
  const progressPercent = minimumSpend > 0
    ? Math.min((currentSpend / minimumSpend) * 100, 100)
    : 100;

  // Check if minimum is met
  const isMinimumMet = currentSpend >= minimumSpend;

  // Animate progress bar
  useEffect(() => {
    if (!animated) {
      progressAnim.setValue(progressPercent);
      return;
    }

    // Only animate if value changed
    if (currentSpend !== prevSpend.current) {
      Animated.spring(progressAnim, {
        toValue: progressPercent,
        useNativeDriver: false, // Width animation requires layout
        tension: 300,
        friction: 10,
      }).start();

      prevSpend.current = currentSpend;
    }
  }, [progressPercent, currentSpend, animated, progressAnim]);

  // Interpolate width
  const fillWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // Determine fill color
  const fillColor = isMinimumMet ? LUXURY_THEME.status.success : LUXURY_THEME.gold.main;

  return (
    <View style={styles.container}>
      {/* Progress bar track */}
      <View style={[styles.track, { height }]}>
        {/* Animated fill */}
        <Animated.View
          style={[
            styles.fill,
            {
              width: fillWidth,
              backgroundColor: fillColor,
              height,
            },
          ]}
        />
      </View>

      {/* Label */}
      <View style={styles.labelContainer}>
        <Text style={[styles.label, isMinimumMet && styles.labelMet]}>
          {currentSpend} / {minimumSpend} coins
        </Text>
        {isMinimumMet && (
          <Text style={styles.checkmark}>✓</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  track: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999, // Pill shape
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
    // Add subtle glow effect
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 6,
  },
  label: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  labelMet: {
    color: LUXURY_THEME.status.success,
  },
  checkmark: {
    color: LUXURY_THEME.status.success,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default MinSpendProgressBar;
