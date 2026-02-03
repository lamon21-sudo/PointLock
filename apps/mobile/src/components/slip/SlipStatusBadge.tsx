// =====================================================
// SlipStatusBadge Component
// =====================================================
// Status badge for displaying slip state.
// Color-coded with pill shape for clear visual communication.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SlipStatus } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface SlipStatusBadgeProps {
  /** The slip status to display */
  status: SlipStatus;
  /** Size variant (default: 'md') */
  size?: 'sm' | 'md';
}

// =====================================================
// Status Configuration
// =====================================================

interface StatusConfig {
  label: string;
  color: string;
  backgroundColor: string;
}

const STATUS_CONFIG: Record<SlipStatus, StatusConfig> = {
  DRAFT: {
    label: 'Draft',
    color: LUXURY_THEME.text.muted,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
  },
  PENDING: {
    label: 'Pending',
    color: LUXURY_THEME.gold.main,
    backgroundColor: LUXURY_THEME.gold.glow,
  },
  ACTIVE: {
    label: 'Active',
    color: LUXURY_THEME.gold.vibrant,
    backgroundColor: LUXURY_THEME.gold.glow,
  },
  WON: {
    label: 'Won',
    color: LUXURY_THEME.status.success,
    backgroundColor: 'rgba(63, 208, 143, 0.2)',
  },
  LOST: {
    label: 'Lost',
    color: LUXURY_THEME.status.error,
    backgroundColor: 'rgba(255, 92, 108, 0.2)',
  },
  VOID: {
    label: 'Void',
    color: LUXURY_THEME.text.muted,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
  },
};

// =====================================================
// Component
// =====================================================

/**
 * SlipStatusBadge - Visual status indicator
 *
 * Features:
 * - Color-coded status with clear labels
 * - Two size variants for different contexts
 * - Pill-shaped design with rounded corners
 * - Accessible labels
 */
export function SlipStatusBadge({
  status,
  size = 'md',
}: SlipStatusBadgeProps): React.ReactElement {
  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.backgroundColor },
        size === 'sm' && styles.badgeSm,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Slip status: ${config.label}`}
    >
      <Text
        style={[
          styles.badgeText,
          { color: config.color },
          size === 'sm' && styles.badgeTextSm,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  badgeTextSm: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
});

export default SlipStatusBadge;
