import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, LUXURY_THEME, SHADOWS } from '../../constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated';
  showBorder?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Enable press interaction with scale feedback */
  pressable?: boolean;
  onPress?: () => void;
  /** Include default padding (24px) */
  padded?: boolean;
}

/**
 * Premium Glass Card Component
 * Features gradient background, gold border, and optional press interaction
 */
export function GlassCard({
  children,
  variant = 'default',
  showBorder = true,
  style,
  contentStyle,
  pressable = false,
  onPress,
  padded = false,
}: GlassCardProps) {
  const gradientColors = variant === 'elevated'
    ? GRADIENTS.glassCardElevated
    : GRADIENTS.glassCard;

  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const cardContent = (
    <>
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, padded && styles.padded, contentStyle]}>
        {children}
      </View>
    </>
  );

  if (pressable || onPress) {
    return (
      <Animated.View
        style={[
          styles.container,
          showBorder && styles.border,
          style,
          { transform: [{ scale: scaleValue }] },
        ]}
      >
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={StyleSheet.absoluteFill}
        >
          {cardContent}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.container, showBorder && styles.border, style]}>
      {cardContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: LUXURY_THEME.spacing.borderRadius, // 20px
    ...SHADOWS.card,
  },
  border: {
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },
  content: {
    position: 'relative',
  },
  padded: {
    padding: LUXURY_THEME.spacing.cardPadding, // 24px
  },
});

export default GlassCard;
