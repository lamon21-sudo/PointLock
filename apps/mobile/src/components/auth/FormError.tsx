import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface FormErrorProps {
  message?: string;
  className?: string;
  /** testID for E2E testing */
  testID?: string;
}

export function FormError({ message, className = '', testID }: FormErrorProps) {
  // Animated values for entrance
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    if (message) {
      // Reset animations
      fadeAnim.setValue(0);
      slideAnim.setValue(-10);

      // Animate in with spring physics
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
      ]).start();
    }
  }, [message, fadeAnim, slideAnim]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      className={className}
    >
      <View className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4">
        <Text className="text-error text-sm font-medium">
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
