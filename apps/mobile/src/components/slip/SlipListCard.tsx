// =====================================================
// SlipListCard Component
// =====================================================
// List-optimized card for displaying slip summary from API.
// Used in the slip history list view.

import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { SlipStatus } from '@pick-rivals/shared-types';
import { ApiSlipResponse } from '../../services/slip.service';
import { SlipStatusBadge } from './SlipStatusBadge';
import { PointsDisplay } from './PointsDisplay';
import { formatSlipDate } from '../../types/api-slip.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface SlipListCardProps {
  /** Slip data from API */
  slip: ApiSlipResponse;
  /** Press handler for navigation */
  onPress: () => void;
}

// =====================================================
// Component
// =====================================================

/**
 * SlipListCard - Compact card for slip list display
 *
 * Layout:
 * ┌────────────────────────────────────────────┐
 * │ [StatusBadge]              [Date] →        │
 * │                                            │
 * │ 5 Picks                                    │
 * │ ████████████░░░░░ 156/340 pts              │
 * └────────────────────────────────────────────┘
 *
 * Features:
 * - Status badge with color coding
 * - Relative date display
 * - Pick count
 * - Points display (potential vs earned based on status)
 * - Press feedback animation
 * - 44pt minimum touch target
 */
function SlipListCardComponent({
  slip,
  onPress,
}: SlipListCardProps): React.ReactElement {
  const {
    status,
    totalPicks,
    pointPotential,
    pointsEarned,
    createdAt,
    lockedAt,
  } = slip;

  // Use locked date if available, otherwise created date
  const displayDate = lockedAt || createdAt;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Slip with ${totalPicks} picks, ${status.toLowerCase()} status`}
      accessibilityHint="Tap to view slip details"
    >
      {/* Header Row */}
      <View style={styles.header}>
        <SlipStatusBadge status={status as SlipStatus} size="sm" />
        <View style={styles.headerRight}>
          <Text style={styles.dateText}>{formatSlipDate(displayDate)}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>

      {/* Pick Count */}
      <Text style={styles.pickCount}>
        {totalPicks} {totalPicks === 1 ? 'Pick' : 'Picks'}
      </Text>

      {/* Points Display */}
      <PointsDisplay
        status={status as SlipStatus}
        pointPotential={pointPotential}
        pointsEarned={pointsEarned}
        variant="compact"
      />
    </Pressable>
  );
}

// Memoize for FlatList performance
export const SlipListCard = memo(SlipListCardComponent);

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 100, // Comfortable touch target
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  chevron: {
    color: LUXURY_THEME.text.muted,
    fontSize: 20,
    fontWeight: '300',
  },
  pickCount: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
});

export default SlipListCard;
