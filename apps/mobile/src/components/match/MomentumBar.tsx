// =====================================================
// MomentumBar Component
// =====================================================
// Displays momentum indicator showing which player has
// recent pick momentum in a live match.
//
// Features:
// - Animated indicator that slides left/right
// - Label changes at ±0.15 threshold
// - Subtle glow pulse when momentum is not neutral
// - Dark luxury styling consistent with app theme

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

export interface MomentumBarProps {
  /** Momentum score from -1 (opponent) to +1 (user) */
  momentumScore: number;
  /** Label to display */
  label: 'you' | 'opponent' | 'even';
  /** Your current point total */
  yourPoints?: number;
  /** Opponent's current point total */
  opponentPoints?: number;
  /** Whether data is still loading */
  isLoading?: boolean;
}

// =====================================================
// Constants
// =====================================================

const USER_COLOR = '#22c55e'; // Green
const OPPONENT_COLOR = '#ef4444'; // Red
const NEUTRAL_COLOR = '#6b7280'; // Gray

// =====================================================
// Component
// =====================================================

export function MomentumBar({
  momentumScore,
  label,
  yourPoints = 0,
  opponentPoints = 0,
  isLoading = false,
}: MomentumBarProps): React.ReactElement {
  // Animation for indicator position (-1 to 1 maps to 0% to 100%)
  const positionAnim = useRef(new Animated.Value(0.5)).current;

  // Animation for background glow
  const glowAnim = useRef(new Animated.Value(0)).current;

  // =====================================================
  // Position Animation
  // =====================================================

  useEffect(() => {
    // Convert -1..1 to 0..1 for position (0 = left/opponent, 1 = right/you)
    const normalizedPosition = (momentumScore + 1) / 2;

    Animated.spring(positionAnim, {
      toValue: normalizedPosition,
      useNativeDriver: false, // Required for layout animation
      tension: 80,
      friction: 12,
    }).start();
  }, [momentumScore, positionAnim]);

  // =====================================================
  // Glow Animation
  // =====================================================

  useEffect(() => {
    // Pulse glow when not neutral
    if (label !== 'even') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      glowAnim.setValue(0);
    }
  }, [label, glowAnim]);

  // =====================================================
  // Derived Values
  // =====================================================

  // Determine active color based on label
  const activeColor =
    label === 'you' ? USER_COLOR : label === 'opponent' ? OPPONENT_COLOR : NEUTRAL_COLOR;

  // Interpolate indicator position (percentage)
  const indicatorPosition = positionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Interpolate glow opacity
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.25],
  });

  // Label text
  const labelText =
    label === 'you'
      ? 'Momentum: You'
      : label === 'opponent'
        ? 'Momentum: Opponent'
        : 'Momentum: Even';

  // Calculate percentage for center display
  const totalPoints = yourPoints + opponentPoints;
  const percentageText =
    totalPoints === 0
      ? 'EVEN'
      : `${Math.round((yourPoints / totalPoints) * 100)}%`;

  // =====================================================
  // Loading State
  // =====================================================

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingPlaceholder} />
      </View>
    );
  }

  // =====================================================
  // Render
  // =====================================================

  return (
    <View style={styles.container}>
      {/* Header with Label */}
      <View style={styles.header}>
        <Text style={[styles.label, { color: activeColor }]}>{labelText}</Text>
      </View>

      {/* Bar Track */}
      <View style={styles.track}>
        {/* Center Divider Line with Percentage */}
        <View style={styles.centerLine}>
          <View style={styles.percentageContainer}>
            <Text style={styles.percentageText}>{percentageText}</Text>
          </View>
        </View>

        {/* Opponent Side Glow (left half) */}
        <Animated.View
          style={[
            styles.sideGlow,
            styles.leftGlow,
            {
              backgroundColor: OPPONENT_COLOR,
              opacity: label === 'opponent' ? glowOpacity : 0,
            },
          ]}
        />

        {/* User Side Glow (right half) */}
        <Animated.View
          style={[
            styles.sideGlow,
            styles.rightGlow,
            {
              backgroundColor: USER_COLOR,
              opacity: label === 'you' ? glowOpacity : 0,
            },
          ]}
        />

        {/* Animated Indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              left: indicatorPosition,
              backgroundColor: activeColor,
            },
          ]}
        />
      </View>

      {/* Side Labels */}
      <View style={styles.labelsRow}>
        <Text style={[styles.sideLabel, { color: OPPONENT_COLOR }]}>Opponent</Text>
        <Text style={[styles.sideLabel, { color: USER_COLOR }]}>You</Text>
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },

  header: {
    alignItems: 'center',
    marginBottom: 12,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  track: {
    height: 8,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
  },

  centerLine: {
    position: 'absolute',
    left: '50%',
    top: -4,
    bottom: -4,
    width: 2,
    backgroundColor: 'rgba(107, 114, 128, 0.4)',
    marginLeft: -1,
    borderRadius: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  percentageContainer: {
    position: 'absolute',
    top: -22,
    backgroundColor: LUXURY_THEME.surface.card,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },

  percentageText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.3,
  },

  sideGlow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: 4,
  },

  leftGlow: {
    left: 0,
  },

  rightGlow: {
    right: 0,
  },

  indicator: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    top: -4,
    marginLeft: -8, // Center indicator on position
    borderWidth: 2,
    borderColor: LUXURY_THEME.bg.primary,
  },

  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  sideLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.7,
  },

  loadingPlaceholder: {
    height: 60,
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderRadius: 8,
  },
});

export default MomentumBar;
