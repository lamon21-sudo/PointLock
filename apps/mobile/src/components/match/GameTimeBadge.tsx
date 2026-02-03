// =====================================================
// GameTimeBadge Component
// =====================================================
// Displays live game time information (period, clock).
// Shows period type (Q1, 1st Half, etc.) and clock when available.
//
// Features:
// - Period and type display
// - Clock display when available
// - Halftime/overtime handling
// - Hidden when no game time data

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { GameTime, EventStatus } from '../../types/socket.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

type BadgeSize = 'sm' | 'md';

interface GameTimeBadgeProps {
  /** Game time data from socket */
  gameTime: GameTime | undefined;
  /** Event status */
  status: EventStatus;
  /** Size variant */
  size?: BadgeSize;
}

// =====================================================
// Size Configuration
// =====================================================

const SIZE_CONFIG: Record<BadgeSize, { fontSize: number; paddingH: number; paddingV: number }> = {
  sm: { fontSize: 10, paddingH: 8, paddingV: 4 },
  md: { fontSize: 11, paddingH: 10, paddingV: 5 },
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Format period display based on period type and number.
 * Examples: "Q1", "2nd Half", "3rd Period", "OT", "ET"
 */
function formatPeriod(gameTime: GameTime): string {
  const { period, periodType, isHalftime, isOvertime } = gameTime;

  // Handle special states first
  if (isHalftime) {
    return 'Halftime';
  }

  if (isOvertime) {
    // For overtime, show OT with period number if > 1
    if (period > 1) {
      return `OT${period}`;
    }
    return 'OT';
  }

  // Format based on period type
  switch (periodType) {
    case 'quarter':
      return `Q${period}`;

    case 'half':
      if (period === 1) return '1st Half';
      if (period === 2) return '2nd Half';
      return `${period}H`;

    case 'period':
      // Hockey/Soccer periods
      if (period === 1) return '1st';
      if (period === 2) return '2nd';
      if (period === 3) return '3rd';
      return `${period}th`;

    case 'inning':
      // Baseball innings
      if (period === 1) return '1st';
      if (period === 2) return '2nd';
      if (period === 3) return '3rd';
      return `${period}th`;

    case 'overtime':
      if (period > 1) return `OT${period}`;
      return 'OT';

    case 'extra_time':
      return 'ET';

    default:
      return `P${period}`;
  }
}

// =====================================================
// Component
// =====================================================

export function GameTimeBadge({
  gameTime,
  status,
  size = 'md',
}: GameTimeBadgeProps): React.ReactElement | null {
  // Don't render if no game time or not live
  if (!gameTime || status !== 'LIVE') {
    return null;
  }

  const sizeConfig = SIZE_CONFIG[size];
  const periodText = formatPeriod(gameTime);
  const showClock = gameTime.clock && !gameTime.isHalftime;

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: sizeConfig.paddingH,
          paddingVertical: sizeConfig.paddingV,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Game time: ${periodText}${showClock ? ` ${gameTime.clock}` : ''}`}
    >
      <Text style={[styles.periodText, { fontSize: sizeConfig.fontSize }]}>
        {periodText}
      </Text>
      {showClock && (
        <>
          <View style={styles.separator} />
          <Text style={[styles.clockText, { fontSize: sizeConfig.fontSize }]}>
            {gameTime.clock}
          </Text>
        </>
      )}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 6,
  },
  periodText: {
    color: '#3b82f6',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  separator: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  clockText: {
    color: '#60a5fa',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

export default GameTimeBadge;
