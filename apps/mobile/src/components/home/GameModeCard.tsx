import React from 'react';
import { Text, StyleSheet, ViewStyle, StyleProp, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../ui/GlassCard';
import { LUXURY_THEME } from '../../constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface GameModeCardProps {
  title: string;
  subtitle?: string;
  iconName?: IoniconsName;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Game Mode Card Component
 * Pressable glass card displaying game mode options with icon and text
 */
export function GameModeCard({
  title,
  subtitle,
  iconName = 'game-controller',
  onPress,
  disabled = false,
  style,
}: GameModeCardProps) {
  return (
    <GlassCard
      pressable
      onPress={onPress}
      style={[styles.container, disabled && styles.disabled, style]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={iconName}
            size={24}
            color={LUXURY_THEME.gold.main}
          />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 100,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: LUXURY_THEME.gold.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
  },
});

export default GameModeCard;
