import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { LUXURY_THEME } from '../constants/theme';

/**
 * SplashScreen Component
 *
 * Displayed during app initialization while auth state is being determined.
 * Provides a branded loading experience that prevents FOUC (Flash of Unprotected Content).
 *
 * Design Principles:
 * - Full screen coverage to prevent glimpses of underlying content
 * - Brand-aligned colors matching the app's dark theme
 * - Smooth, performant spinner animation
 * - Minimal but professional appearance
 */
export function SplashScreen() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      {/* Logo Placeholder - Replace with actual logo component when available */}
      <View className="mb-8">
        <View className="w-24 h-24 rounded-2xl bg-primary/20 items-center justify-center mb-4">
          <Text className="text-5xl">🎯</Text>
        </View>

        {/* App Name */}
        <Text className="text-3xl font-bold text-text-primary text-center tracking-wide">
          PickRivals
        </Text>
        <Text className="text-sm text-text-secondary text-center mt-1">
          Compete. Win. Repeat.
        </Text>
      </View>

      {/* Loading Indicator */}
      <View className="mt-12">
        <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
      </View>

      {/* Version/Footer - Optional */}
      <View className="absolute bottom-12">
        <Text className="text-xs text-text-muted">
          Initializing...
        </Text>
      </View>
    </View>
  );
}
