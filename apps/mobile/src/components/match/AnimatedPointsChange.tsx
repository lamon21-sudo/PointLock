// =====================================================
// AnimatedPointsChange Component
// =====================================================
// Displays points with count-up animation and color pulse
// when the value changes (green for gain, red for loss).
//
// Features:
// - Count-up animation via AnimatedNumber
// - Color pulse on change
// - Scale bounce on settlement
// - Size variants (sm, md, lg)

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { AnimatedNumber } from '../ui/AnimatedNumber';

// =====================================================
// Types
// =====================================================

interface AnimatedPointsChangeProps {
  /** Current points value */
  points: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional suffix (default: none) */
  suffix?: string;
  /** Text color when not pulsing */
  color?: string;
  /** Animation duration in ms */
  duration?: number;
}

// =====================================================
// Constants
// =====================================================

const SIZE_CONFIG = {
  sm: { fontSize: 18, padding: 4 },
  md: { fontSize: 28, padding: 6 },
  lg: { fontSize: 36, padding: 8 },
};

const COLORS = {
  gain: 'rgba(34, 197, 94, 0.4)', // Green
  loss: 'rgba(239, 68, 68, 0.4)', // Red
  neutral: 'transparent',
};

// =====================================================
// Component
// =====================================================

export function AnimatedPointsChange({
  points,
  size = 'md',
  suffix = '',
  color = '#ffffff',
  duration = 800,
}: AnimatedPointsChangeProps): React.ReactElement {
  const sizeConfig = SIZE_CONFIG[size];

  // Track previous points for change detection
  const previousPointsRef = useRef(points);
  const isFirstRender = useRef(true);

  // Animation values
  const pulseColor = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  // Determine if this is a gain or loss
  const changeType = useRef<'gain' | 'loss' | 'neutral'>('neutral');

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousPointsRef.current = points;
      return;
    }

    const previousPoints = previousPointsRef.current;

    if (points !== previousPoints) {
      // Determine change direction
      changeType.current = points > previousPoints ? 'gain' : 'loss';

      // Reset animation values
      pulseColor.setValue(0);
      scaleValue.setValue(1);

      // Run pulse and scale animation
      Animated.parallel([
        // Color pulse: fade in then out
        Animated.sequence([
          Animated.timing(pulseColor, {
            toValue: 1,
            duration: 100,
            useNativeDriver: false,
          }),
          Animated.timing(pulseColor, {
            toValue: 0,
            duration: 600,
            useNativeDriver: false,
          }),
        ]),
        // Scale bounce
        Animated.sequence([
          Animated.spring(scaleValue, {
            toValue: 1.1,
            tension: 200,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.spring(scaleValue, {
            toValue: 1,
            tension: 100,
            friction: 14,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      previousPointsRef.current = points;
    }
  }, [points, pulseColor, scaleValue]);

  // Interpolate background color based on change type
  const backgroundColor = pulseColor.interpolate({
    inputRange: [0, 1],
    outputRange: [
      'transparent',
      changeType.current === 'gain' ? COLORS.gain : COLORS.loss,
    ],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor,
          transform: [{ scale: scaleValue }],
          padding: sizeConfig.padding,
          borderRadius: sizeConfig.padding * 2,
        },
      ]}
    >
      <AnimatedNumber
        value={points}
        fontSize={sizeConfig.fontSize}
        fontWeight="bold"
        color={color}
        suffix={suffix}
        duration={duration}
      />
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
});

export default AnimatedPointsChange;
