import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

interface ProgressBarProps {
  /** Left side percentage (0-100) */
  leftValue: number;
  /** Right side percentage (0-100) */
  rightValue: number;
  /** Label for left side (e.g., "KC -3.5") */
  leftLabel: string;
  /** Label for right side (e.g., "BUF +3.5") */
  rightLabel: string;
  /** Left bar color (default: gold) */
  leftColor?: string;
  /** Right bar color (default: muted) */
  rightColor?: string;
  /** Bar height in pixels (default: 6) */
  height?: number;
  /** Show percentage values */
  showPercentage?: boolean;
  /** Animate on mount */
  animated?: boolean;
}

/**
 * Two-tone Progress Bar Component
 * For displaying spread/total percentages like in SaaS financial dashboards
 */
export function ProgressBar({
  leftValue,
  rightValue,
  leftLabel,
  rightLabel,
  leftColor = LUXURY_THEME.gold.main,
  rightColor = LUXURY_THEME.text.muted,
  height = 6,
  showPercentage = true,
  animated = true,
}: ProgressBarProps) {
  // Normalize values to ensure they sum to 100
  const total = leftValue + rightValue;
  const normalizedLeft = total > 0 ? (leftValue / total) * 100 : 50;
  const normalizedRight = total > 0 ? (rightValue / total) * 100 : 50;

  // Animation
  const leftWidth = React.useRef(new Animated.Value(0)).current;
  const rightWidth = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.spring(leftWidth, {
          toValue: normalizedLeft,
          useNativeDriver: false,
          tension: 50,
          friction: 10,
        }),
        Animated.spring(rightWidth, {
          toValue: normalizedRight,
          useNativeDriver: false,
          tension: 50,
          friction: 10,
        }),
      ]).start();
    } else {
      leftWidth.setValue(normalizedLeft);
      rightWidth.setValue(normalizedRight);
    }
  }, [normalizedLeft, normalizedRight, animated]);

  const leftWidthInterpolated = animated
    ? leftWidth.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
      })
    : `${normalizedLeft}%`;

  const rightWidthInterpolated = animated
    ? rightWidth.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
      })
    : `${normalizedRight}%`;

  return (
    <View style={styles.container}>
      {/* Labels Row */}
      <View style={styles.labelsRow}>
        <View style={styles.labelContainer}>
          <Text style={[styles.label, { color: leftColor }]}>{leftLabel}</Text>
          {showPercentage && (
            <Text style={[styles.percentage, { color: leftColor }]}>
              {Math.round(normalizedLeft)}%
            </Text>
          )}
        </View>
        <View style={[styles.labelContainer, styles.labelContainerRight]}>
          {showPercentage && (
            <Text style={[styles.percentage, { color: rightColor }]}>
              {Math.round(normalizedRight)}%
            </Text>
          )}
          <Text style={[styles.label, { color: rightColor }]}>{rightLabel}</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.barContainer, { height }]}>
        <Animated.View
          style={[
            styles.barLeft,
            {
              width: leftWidthInterpolated,
              backgroundColor: leftColor,
              height,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.barRight,
            {
              width: rightWidthInterpolated,
              backgroundColor: rightColor,
              height,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Compact Progress Bar - Just the bar without labels
 * For inline use within cards
 */
export function CompactProgressBar({
  leftValue,
  rightValue,
  leftColor = LUXURY_THEME.gold.main,
  rightColor = LUXURY_THEME.text.muted,
  height = 4,
}: Omit<ProgressBarProps, 'leftLabel' | 'rightLabel' | 'showPercentage'>) {
  const total = leftValue + rightValue;
  const normalizedLeft = total > 0 ? (leftValue / total) * 100 : 50;
  const normalizedRight = total > 0 ? (rightValue / total) * 100 : 50;

  return (
    <View style={[styles.barContainer, { height }]}>
      <View
        style={[
          styles.barLeft,
          {
            width: `${normalizedLeft}%`,
            backgroundColor: leftColor,
            height,
          },
        ]}
      />
      <View
        style={[
          styles.barRight,
          {
            width: `${normalizedRight}%`,
            backgroundColor: rightColor,
            height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelContainerRight: {
    justifyContent: 'flex-end',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  percentage: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  barContainer: {
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: LUXURY_THEME.surface.card,
  },
  barLeft: {
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  barRight: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
});

export default ProgressBar;
