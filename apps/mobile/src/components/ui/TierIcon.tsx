// =====================================================
// TierIcon Component
// =====================================================
// Rank tier badge with colored icon and glow effect.
// Each tier has a unique icon, color, and subtle glow backdrop.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  ShieldIcon,
  ShieldStarIcon,
  MedalIcon,
  DiamondIcon,
  CrownIcon,
} from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';

// =====================================================
// Tier Configuration
// =====================================================

interface TierConfig {
  icon: Icon;
  color: string;
  glowColor: string;
}

const TIER_CONFIG: Record<string, TierConfig> = {
  BRONZE: { icon: ShieldIcon, color: '#CD7F32', glowColor: 'rgba(205,127,50,0.2)' },
  SILVER: { icon: ShieldStarIcon, color: '#C0C0C0', glowColor: 'rgba(192,192,192,0.2)' },
  GOLD: { icon: MedalIcon, color: '#FFD700', glowColor: 'rgba(255,215,0,0.2)' },
  PLATINUM: { icon: DiamondIcon, color: '#E5E4E2', glowColor: 'rgba(229,228,226,0.25)' },
  DIAMOND: { icon: CrownIcon, color: '#B9F2FF', glowColor: 'rgba(185,242,255,0.25)' },
};

// =====================================================
// Props
// =====================================================

interface TierIconProps {
  tier: string;
  size?: number;
}

// =====================================================
// Component
// =====================================================

export function TierIcon({ tier, size = 24 }: TierIconProps) {
  const config = TIER_CONFIG[tier];
  if (!config) return null;

  const IconComp = config.icon;
  const glowSize = size + 12;

  return (
    <View style={[styles.container, { width: glowSize, height: glowSize }]}>
      <View
        style={[
          styles.glow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: config.glowColor,
          },
        ]}
      />
      <IconComp size={size} color={config.color} weight="duotone" />
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
});

export default TierIcon;
