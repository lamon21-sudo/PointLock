// =====================================================
// RankChangeBadge Component
// =====================================================
// Displays rank movement indicator (up/down/new/same)

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getRankChangeType, RankChangeType } from '../../types/leaderboard.types';

// =====================================================
// Types
// =====================================================

interface RankChangeBadgeProps {
  /** Rank change value (positive = improved, negative = dropped, null = new) */
  change: number | null;
  /** Size variant */
  size?: 'sm' | 'md';
}

// =====================================================
// Config
// =====================================================

const CONFIG: Record<
  RankChangeType,
  { icon: string; color: string; bg: string }
> = {
  up: { icon: '\u2191', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' },
  down: { icon: '\u2193', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
  same: { icon: '\u2013', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.2)' },
  new: { icon: '\u2605', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
};

// =====================================================
// Component
// =====================================================

export function RankChangeBadge({
  change,
  size = 'md',
}: RankChangeBadgeProps): React.ReactElement {
  const type = getRankChangeType(change);
  const config = CONFIG[type];
  const absChange = change !== null ? Math.abs(change) : 0;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg },
        size === 'sm' && styles.badgeSm,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: config.color },
          size === 'sm' && styles.textSm,
        ]}
      >
        {config.icon}
        {type !== 'same' && type !== 'new' && absChange > 0 && absChange}
      </Text>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSm: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    minWidth: 18,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  textSm: {
    fontSize: 10,
  },
});

export default RankChangeBadge;
