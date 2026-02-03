import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, LUXURY_THEME, SHADOWS } from '../../constants/theme';

type ButtonVariant = 'solid' | 'metallic' | 'outline';

interface GoldButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Button variant: solid (default), metallic (5-color gradient), outline */
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Premium Gold Button Component
 * Primary CTA with multiple gradient variants and pill shape
 */
export function GoldButton({
  onPress,
  children,
  isLoading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  variant = 'solid',
  style,
  textStyle,
}: GoldButtonProps) {
  const isDisabled = disabled || isLoading;

  const sizeStyles = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  };

  const textSizeStyles = {
    sm: styles.textSm,
    md: styles.textMd,
    lg: styles.textLg,
  };

  // Select gradient based on variant
  const getGradientColors = () => {
    switch (variant) {
      case 'metallic':
        return [...GRADIENTS.metallicGold];
      case 'outline':
        return ['transparent', 'transparent'];
      case 'solid':
      default:
        return [...GRADIENTS.goldButton];
    }
  };

  // Metallic gradient uses diagonal direction
  const getGradientDirection = () => {
    if (variant === 'metallic') {
      return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
    }
    return { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
  };

  const gradientDirection = getGradientDirection();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.container,
        variant === 'metallic' && styles.metallicGlow,
        variant === 'outline' && styles.outline,
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={getGradientColors()}
        start={gradientDirection.start}
        end={gradientDirection.end}
        style={StyleSheet.absoluteFill}
      />
      {isLoading ? (
        <ActivityIndicator
          color={variant === 'outline' ? LUXURY_THEME.gold.main : LUXURY_THEME.bg.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            textSizeStyles[size],
            variant === 'outline' && styles.outlineText,
            textStyle
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: LUXURY_THEME.spacing.borderRadiusPill, // Pill shape
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    // Default gold glow
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  metallicGlow: {
    // Enhanced glow for metallic variant
    ...SHADOWS.goldGlow,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: LUXURY_THEME.gold.main,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  sizeSm: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 40,
  },
  sizeMd: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
  },
  sizeLg: {
    paddingVertical: 18,
    paddingHorizontal: 36,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  text: {
    color: LUXURY_THEME.bg.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  outlineText: {
    color: LUXURY_THEME.gold.main,
  },
  textSm: {
    fontSize: 12,
  },
  textMd: {
    fontSize: 14,
  },
  textLg: {
    fontSize: 16,
  },
});

export default GoldButton;
