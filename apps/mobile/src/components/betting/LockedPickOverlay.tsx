// =====================================================
// LockedPickOverlay Component
// =====================================================
// Semi-transparent overlay showing lock icon and tier requirement.
// Displayed over odds buttons that require higher tier access.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { TIER_NAMES } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

export interface LockedPickOverlayProps {
  /** Required tier to unlock (0-3) */
  requiredTier: number;
  /** Optional press handler (e.g., navigate to tier info) */
  onPress?: () => void;
}

/**
 * LockedPickOverlay - Shows lock state for premium picks
 *
 * Features:
 * - Semi-transparent dark overlay
 * - Lock icon with tier name
 * - Optional tap handler for more info
 * - Accessible with proper labels
 */
export function LockedPickOverlay({ requiredTier, onPress }: LockedPickOverlayProps) {
  const tierName = TIER_NAMES[requiredTier as 1 | 2 | 3 | 4] || 'Premium';

  const content = (
    <View style={styles.container} pointerEvents={onPress ? 'auto' : 'none'}>
      {/* Lock icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.lockIcon}>🔒</Text>
      </View>

      {/* Tier requirement text */}
      <Text style={styles.tierText}>
        Unlocks at{'\n'}
        <Text style={styles.tierName}>{tierName}</Text>
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Locked. Requires ${tierName} tier. Tap for more info.`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  iconContainer: {
    marginBottom: 4,
  },
  lockIcon: {
    fontSize: 20,
    opacity: 0.9,
  },
  tierText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
  },
  tierName: {
    color: LUXURY_THEME.gold.main,
    fontWeight: '700',
  },
});

export default LockedPickOverlay;
