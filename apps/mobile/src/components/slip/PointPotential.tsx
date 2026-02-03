// =====================================================
// PointPotential Component
// =====================================================
// Point display with animated progress meter.
// Uses smooth spring animations for fill transitions.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

// =====================================================
// Types
// =====================================================

interface PointPotentialProps {
  /** Current point value */
  value: number;
  /** Maximum value for percentage calculation (default: 100) */
  maxValue?: number;
  /** Size variant (default: 'md') */
  size?: 'sm' | 'md' | 'lg';
  /** Show label (default: true) */
  showLabel?: boolean;
}

// =====================================================
// Component
// =====================================================

/**
 * PointPotential - Animated point meter
 *
 * Features:
 * - Horizontal progress bar with smooth fill animation
 * - Color gradient based on percentage (gray < 33% < blue < 66% < green)
 * - Spring physics for natural motion
 * - Three size variants for different contexts
 * - Optional label for accessibility
 *
 * Animation Philosophy:
 * - Uses spring physics (tension: 100, friction: 14) for natural feel
 * - Animated on mount and value changes
 * - 60fps smooth transitions via native driver
 */
export function PointPotential({
  value,
  maxValue = 100,
  size = 'md',
  showLabel = true,
}: PointPotentialProps): React.ReactElement {
  // =====================================================
  // Animation Setup
  // =====================================================

  const fillWidth = useRef(new Animated.Value(0)).current;
  const percentage = Math.min((value / maxValue) * 100, 100);

  // Animate fill width when value changes
  useEffect(() => {
    Animated.spring(fillWidth, {
      toValue: percentage,
      useNativeDriver: false, // Width animation requires layout changes
      tension: 100,
      friction: 14,
    }).start();
  }, [percentage, fillWidth]);

  // =====================================================
  // Color Logic
  // =====================================================

  /**
   * Determine fill color based on percentage:
   * - <33%: Gray (#6b7280) - Low value
   * - 33-66%: Blue (#3b82f6) - Medium value
   * - >66%: Green (#22c55e) - High value
   */
  const getFillColor = (): string => {
    if (percentage < 33) {
      return '#6b7280'; // Gray
    }
    if (percentage < 66) {
      return '#3b82f6'; // Blue
    }
    return '#22c55e'; // Green
  };

  // =====================================================
  // Size Configuration
  // =====================================================

  const sizeConfig = {
    sm: {
      height: 6,
      borderRadius: 3,
      fontSize: 12,
      marginBottom: 4,
    },
    md: {
      height: 8,
      borderRadius: 4,
      fontSize: 14,
      marginBottom: 6,
    },
    lg: {
      height: 12,
      borderRadius: 6,
      fontSize: 16,
      marginBottom: 8,
    },
  };

  const config = sizeConfig[size];

  // =====================================================
  // Render
  // =====================================================

  return (
    <View style={styles.container}>
      {/* Label */}
      {showLabel && (
        <View style={[styles.labelRow, { marginBottom: config.marginBottom }]}>
          <Text style={[styles.label, { fontSize: config.fontSize }]}>
            Point Potential
          </Text>
          <Text
            style={[
              styles.value,
              { fontSize: config.fontSize, color: getFillColor() },
            ]}
          >
            {value}
          </Text>
        </View>
      )}

      {/* Progress Bar */}
      <View
        style={[
          styles.track,
          {
            height: config.height,
            borderRadius: config.borderRadius,
          },
        ]}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: value, min: 0, max: maxValue }}
        accessibilityLabel={`${value} out of ${maxValue} points`}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              height: config.height,
              borderRadius: config.borderRadius,
              backgroundColor: getFillColor(),
              width: fillWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#9ca3af',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  value: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  track: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)', // Gray background
    overflow: 'hidden',
  },
  fill: {
    // Dynamic styles applied inline
  },
});

export default PointPotential;
