import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp, Animated } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

export interface TierProgressBarProps {
  currentTierLabel: string;
  progress: number;
  nextTierLabel?: string | null;
  hintText?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tier Progress Bar Component
 * Displays player tier progression with animated progress bar
 */
export function TierProgressBar({
  currentTierLabel,
  progress,
  nextTierLabel,
  hintText,
  style,
}: TierProgressBarProps) {
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progressWidth, {
      toValue: Math.max(0, Math.min(1, progress)),
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
  }, [progress]);

  const progressPercentage = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.tierBadge}>
          <Text style={styles.tierBadgeText}>{currentTierLabel}</Text>
        </View>
        {hintText && (
          <Text style={styles.hintText}>{hintText}</Text>
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: progressPercentage },
          ]}
        />
      </View>

      {/* Next Tier Label */}
      {nextTierLabel && (
        <Text style={styles.nextTierLabel}>
          Next: {nextTierLabel}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tierBadge: {
    backgroundColor: LUXURY_THEME.gold.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: LUXURY_THEME.spacing.borderRadiusPill,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: LUXURY_THEME.gold.main,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hintText: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
  },
  progressTrack: {
    height: 8,
    backgroundColor: LUXURY_THEME.surface.raised,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: LUXURY_THEME.gold.main,
    borderRadius: 4,
  },
  nextTierLabel: {
    fontSize: 12,
    color: LUXURY_THEME.text.muted,
    textAlign: 'right',
  },
});

export default TierProgressBar;
