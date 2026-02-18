// =====================================================
// RankBadge Component
// =====================================================
// Displays a rank badge with tier-appropriate colors.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Rank, RANK_DISPLAY } from '@pick-rivals/shared-types';
import { LUXURY_THEME, SHADOWS } from '../../constants/theme';
import { TierIcon } from '../ui/TierIcon';

// =====================================================
// Types
// =====================================================

type BadgeSize = 'sm' | 'md' | 'lg' | 'hero';

interface RankBadgeProps {
  rank: Rank;
  size?: BadgeSize;
  showLabel?: boolean;
  animated?: boolean;
}

// =====================================================
// Size Configuration
// =====================================================

const SIZES: Record<BadgeSize, { diameter: number; fontSize: number; iconSize: number }> = {
  sm: { diameter: 40, fontSize: 10, iconSize: 16 },
  md: { diameter: 60, fontSize: 12, iconSize: 24 },
  lg: { diameter: 80, fontSize: 14, iconSize: 32 },
  hero: { diameter: 120, fontSize: 18, iconSize: 48 },
};

// =====================================================
// Helper Functions
// =====================================================

function getGradientColors(rank: Rank): readonly [string, string, ...string[]] {
  const info = RANK_DISPLAY[rank];
  const baseColor = info.color;

  // Create gradient from slightly darker to slightly lighter
  switch (info.tier) {
    case 'BRONZE':
      return ['#8B5A2B', '#CD7F32', '#DDA15E'];
    case 'SILVER':
      return ['#8A8A8A', '#C0C0C0', '#D4D4D4'];
    case 'GOLD':
      return ['#B8860B', '#FFD700', '#FFE55C'];
    case 'PLATINUM':
      return ['#A8A8B8', '#E5E4E2', '#F5F5F0'];
    case 'DIAMOND':
      return ['#7EC8E3', '#B9F2FF', '#E0FFFF'];
    default:
      return [baseColor, baseColor, baseColor];
  }
}

function getBorderColor(rank: Rank): string {
  const info = RANK_DISPLAY[rank];
  switch (info.tier) {
    case 'BRONZE':
      return '#8B5A2B';
    case 'SILVER':
      return '#8A8A8A';
    case 'GOLD':
      return '#B8860B';
    case 'PLATINUM':
      return '#A8A8B8';
    case 'DIAMOND':
      return '#7EC8E3';
    default:
      return LUXURY_THEME.border.gold;
  }
}

// =====================================================
// Component
// =====================================================

export function RankBadge({
  rank,
  size = 'md',
  showLabel = true,
  animated = false,
}: RankBadgeProps) {
  const info = RANK_DISPLAY[rank];
  const sizeConfig = SIZES[size];
  const gradientColors = getGradientColors(rank);
  const borderColor = getBorderColor(rank);

  // Animation
  const scaleAnim = useRef(new Animated.Value(animated ? 0.8 : 1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      // Scale in animation
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }).start();

      // Glow pulse animation for Diamond rank
      if (info.tier === 'DIAMOND') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    }
  }, [animated, info.tier, scaleAnim, glowAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const isMaxRank = rank === Rank.DIAMOND_3;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.badgeWrapper,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Glow effect for max rank */}
        {isMaxRank && (
          <Animated.View
            style={[
              styles.glow,
              {
                width: sizeConfig.diameter + 20,
                height: sizeConfig.diameter + 20,
                borderRadius: (sizeConfig.diameter + 20) / 2,
                opacity: animated ? glowOpacity : 0.4,
              },
            ]}
          />
        )}

        {/* Badge circle */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.badge,
            {
              width: sizeConfig.diameter,
              height: sizeConfig.diameter,
              borderRadius: sizeConfig.diameter / 2,
              borderColor: borderColor,
            },
            isMaxRank && SHADOWS.goldGlow,
          ]}
        >
          <TierIcon tier={info.tier} size={sizeConfig.iconSize} />
          <Text
            style={[
              styles.division,
              { fontSize: sizeConfig.fontSize - 2 },
            ]}
          >
            {info.division}
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* Rank label */}
      {showLabel && (
        <Text
          style={[
            styles.label,
            { fontSize: size === 'hero' ? 16 : size === 'lg' ? 14 : 12 },
          ]}
        >
          {info.name}
        </Text>
      )}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  badgeWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: '#B9F2FF',
    ...SHADOWS.goldGlow,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    ...SHADOWS.card,
  },
  division: {
    color: '#000000',
    fontWeight: '800',
    position: 'absolute',
    bottom: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  label: {
    marginTop: 8,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    letterSpacing: 0.5,
  },
});

export default RankBadge;
