// =====================================================
// AnimatedNumber Component
// =====================================================
// Displays a number with count-up/count-down animation.
// Uses React Native Animated API for smooth transitions.
//
// Features:
// - Smooth interpolation between values
// - Configurable duration and easing
// - Optional prefix/suffix
// - Customizable styling

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, Easing } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

// =====================================================
// Types
// =====================================================

interface AnimatedNumberProps {
  /** The target value to animate to */
  value: number;
  /** Animation duration in ms (default: 800) */
  duration?: number;
  /** Font size (default: 16) */
  fontSize?: number;
  /** Font weight */
  fontWeight?: TextStyle['fontWeight'];
  /** Text color */
  color?: string;
  /** Optional prefix (e.g., "$", "+") */
  prefix?: string;
  /** Optional suffix (e.g., " pts", "%") */
  suffix?: string;
  /** Additional text styles */
  style?: StyleProp<TextStyle>;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Number of decimal places (default: 0) */
  decimalPlaces?: number;
}

// =====================================================
// Component
// =====================================================

export function AnimatedNumber({
  value,
  duration = 800,
  fontSize = 16,
  fontWeight = 'normal',
  color = '#ffffff',
  prefix = '',
  suffix = '',
  style,
  onAnimationComplete,
  decimalPlaces = 0,
}: AnimatedNumberProps): React.ReactElement {
  // Track previous value for animation
  const previousValueRef = useRef(value);
  const animatedValue = useRef(new Animated.Value(value)).current;
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const previousValue = previousValueRef.current;

    if (previousValue !== value) {
      // Animate from previous to new value
      animatedValue.setValue(previousValue);

      Animated.timing(animatedValue, {
        toValue: value,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // Required for text content updates
      }).start(() => {
        onAnimationComplete?.();
      });

      previousValueRef.current = value;
    }
  }, [value, duration, animatedValue, onAnimationComplete]);

  // Listen to animated value changes
  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value: animValue }) => {
      setDisplayValue(animValue);
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue]);

  // Format the display value
  const formattedValue =
    decimalPlaces > 0
      ? displayValue.toFixed(decimalPlaces)
      : Math.round(displayValue).toString();

  return (
    <Text
      style={[
        styles.text,
        { fontSize, fontWeight, color },
        style,
      ]}
    >
      {prefix}
      {formattedValue}
      {suffix}
    </Text>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  text: {
    fontVariant: ['tabular-nums'], // Ensures consistent width for numbers
  },
});

export default AnimatedNumber;
