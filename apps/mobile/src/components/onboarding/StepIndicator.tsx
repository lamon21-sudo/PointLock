// =====================================================
// StepIndicator Component
// =====================================================
// Progress dots for the onboarding walkthrough.
//
// Visual language:
//   - Active step: wide gold pill (28px) — clearly dominant
//   - Inactive steps: small muted circle (10px)
//
// The pill-shaped active dot gives users a stronger
// spatial anchor than a simple color change alone.

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number;
}

// =====================================================
// Single Dot
// =====================================================

interface DotProps {
  isActive: boolean;
  index: number;
}

function Dot({ isActive, index }: DotProps) {
  const widthAnim = useRef(new Animated.Value(isActive ? 28 : 10)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.3)).current;

  useEffect(() => {
    // Animate width and opacity in parallel for a smooth pill-expand effect.
    // Spring physics ensures the dot "snaps" to size naturally.
    Animated.parallel([
      Animated.spring(widthAnim, {
        toValue: isActive ? 28 : 10,
        tension: 200,
        friction: 20,
        useNativeDriver: false, // width is not a native-driver prop
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.3,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive, widthAnim, opacityAnim]);

  return (
    <Animated.View
      key={index}
      style={[
        styles.dot,
        {
          width: widthAnim,
          opacity: opacityAnim,
          backgroundColor: isActive
            ? LUXURY_THEME.gold.main
            : 'rgba(255, 255, 255, 0.3)',
        },
      ]}
    />
  );
}

// =====================================================
// Main Component
// =====================================================

export function StepIndicator({ totalSteps, currentStep }: StepIndicatorProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <Dot key={index} index={index} isActive={index === currentStep} />
      ))}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    // Width is driven by Animated.Value above
    height: 10,
    borderRadius: 5,
  },
});

export default StepIndicator;
