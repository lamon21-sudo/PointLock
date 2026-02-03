import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { calculatePasswordStrength } from '../../schemas/auth.schemas';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  className = '',
}: PasswordStrengthIndicatorProps) {
  const { strength, score } = calculatePasswordStrength(password);

  // Animated value for progress bar width
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Calculate percentage (max score is 7)
  const percentage = (score / 7) * 100;

  useEffect(() => {
    // Animate to new percentage with spring physics for natural motion
    Animated.spring(progressAnim, {
      toValue: percentage,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  }, [percentage, progressAnim]);

  // Don't show indicator if password is empty
  if (!password) {
    return null;
  }

  // Color scheme based on strength
  const strengthColors = {
    weak: '#ef4444', // error red
    medium: '#f59e0b', // warning orange
    strong: '#22c55e', // success green
  };

  const strengthLabels = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
  };

  const color = strengthColors[strength];

  return (
    <View className={`mb-4 ${className}`}>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xs text-gray-400">Password Strength</Text>
        <Text
          className="text-xs font-semibold"
          style={{ color }}
        >
          {strengthLabels[strength]}
        </Text>
      </View>

      {/* Progress bar container */}
      <View className="h-2 bg-surface rounded-full overflow-hidden">
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: color,
            },
          ]}
        />
      </View>

      {/* Strength requirements hint */}
      {strength !== 'strong' && (
        <Text className="text-xs text-gray-500 mt-2">
          {strength === 'weak' && 'Add uppercase, numbers, and special characters (!@#$%)'}
          {strength === 'medium' && 'Add a special character (!@#$%^&*) for stronger security'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progressBar: {
    height: '100%',
    borderRadius: 9999,
  },
});
