import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  View,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, LUXURY_THEME, SHADOWS } from '../../constants/theme';

export interface QuickMatchButtonProps {
  title?: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Quick Match Button Component
 * Large, prominent CTA for instant matchmaking with metallic gold gradient
 */
export function QuickMatchButton({
  title = 'QUICK MATCH',
  subtitle = 'Find an opponent instantly',
  onPress,
  disabled = false,
  loading = false,
  style,
}: QuickMatchButtonProps) {
  const isDisabled = disabled || loading;
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

  return (
    <Animated.View
      style={[
        styles.container,
        isDisabled && styles.disabled,
        style,
        { transform: [{ scale: scaleValue }] },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={[...GRADIENTS.metallicGold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.contentContainer}>
          {loading ? (
            <ActivityIndicator
              color={LUXURY_THEME.bg.primary}
              size="large"
            />
          ) : (
            <>
              <View style={styles.iconContainer}>
                <Ionicons
                  name="flash"
                  size={28}
                  color={LUXURY_THEME.bg.primary}
                />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: LUXURY_THEME.spacing.borderRadius,
    minHeight: 80,
    ...SHADOWS.goldGlow,
  },
  disabled: {
    opacity: 0.5,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  iconContainer: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: LUXURY_THEME.bg.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: LUXURY_THEME.bg.primary,
    opacity: 0.8,
  },
});

export default QuickMatchButton;
