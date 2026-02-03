// =====================================================
// SlipCard Component
// =====================================================
// Reusable slip display with summary and full variants.
// Pressable card with smooth press feedback for navigation.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { SlipStatus } from '@pick-rivals/shared-types';
import { DraftPick } from '../../types/slip.types';
import { PickItem } from './PickItem';
import { SlipStatusBadge } from './SlipStatusBadge';
import { PointPotential } from './PointPotential';

// =====================================================
// Types
// =====================================================

interface SlipCardProps {
  /** Array of picks in this slip */
  picks: DraftPick[];
  /** Slip status (optional for draft slips) */
  status?: SlipStatus;
  /** Total point potential */
  pointPotential: number;
  /** Optional press handler for navigation */
  onPress?: () => void;
  /** Display variant (default: 'summary') */
  variant?: 'summary' | 'full';
}

// =====================================================
// Component
// =====================================================

/**
 * SlipCard - Reusable slip display
 *
 * Features:
 * - Two variants: summary (collapsed) and full (expanded)
 * - Summary shows: pick count, point potential, status badge
 * - Full shows: all picks with PickItem components
 * - Pressable with smooth visual feedback
 * - 44pt minimum touch target for accessibility
 * - Consistent card styling across the app
 *
 * Interaction Design:
 * - Press feedback via scale transform (0.98)
 * - Visual press state with opacity (0.9)
 * - Smooth transitions feel natural under thumb
 */
export function SlipCard({
  picks,
  status,
  pointPotential,
  onPress,
  variant = 'summary',
}: SlipCardProps): React.ReactElement {
  // =====================================================
  // Handlers
  // =====================================================

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  // =====================================================
  // Summary Variant
  // =====================================================

  if (variant === 'summary') {
    const CardContent = (
      <View style={styles.summaryContent}>
        {/* Header Row */}
        <View style={styles.summaryHeader}>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryPickCount}>
              {picks.length} {picks.length === 1 ? 'Pick' : 'Picks'}
            </Text>
            {status && <SlipStatusBadge status={status} size="sm" />}
          </View>
          {onPress && <Text style={styles.chevron}>›</Text>}
        </View>

        {/* Point Potential */}
        <View style={styles.summaryPoints}>
          <PointPotential
            value={pointPotential}
            size="sm"
            showLabel={false}
          />
          <Text style={styles.summaryPointsLabel}>{pointPotential} pts potential</Text>
        </View>
      </View>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            styles.summaryCard,
            pressed && styles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Slip with ${picks.length} picks, ${pointPotential} potential points`}
          accessibilityHint="Tap to view details"
        >
          {CardContent}
        </Pressable>
      );
    }

    return <View style={[styles.card, styles.summaryCard]}>{CardContent}</View>;
  }

  // =====================================================
  // Full Variant
  // =====================================================

  const CardContent = (
    <View style={styles.fullContent}>
      {/* Header */}
      <View style={styles.fullHeader}>
        <Text style={styles.fullTitle}>
          {picks.length} {picks.length === 1 ? 'Pick' : 'Picks'}
        </Text>
        {status && <SlipStatusBadge status={status} size="md" />}
      </View>

      {/* Point Potential */}
      <View style={styles.fullPoints}>
        <PointPotential value={pointPotential} size="md" />
      </View>

      {/* Picks List */}
      <View style={styles.picksList}>
        {picks.map((pick, index) => (
          <View
            key={pick.id}
            style={[
              styles.pickItemWrapper,
              index < picks.length - 1 && styles.pickItemWithMargin,
            ]}
          >
            <PickItem pick={pick} showRemove={false} compact />
          </View>
        ))}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          styles.fullCard,
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Slip with ${picks.length} picks, ${pointPotential} potential points`}
        accessibilityHint="Tap to view details"
      >
        {CardContent}
      </Pressable>
    );
  }

  return <View style={[styles.card, styles.fullCard]}>{CardContent}</View>;
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  // Summary Variant
  summaryCard: {
    padding: 16,
    minHeight: 88, // Ensure comfortable touch target
  },
  summaryContent: {
    gap: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  summaryPickCount: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chevron: {
    color: '#6b7280',
    fontSize: 28,
    fontWeight: '300',
    marginLeft: 8,
  },
  summaryPoints: {
    gap: 8,
  },
  summaryPointsLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  // Full Variant
  fullCard: {
    padding: 20,
  },
  fullContent: {
    gap: 16,
  },
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fullTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  fullPoints: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(107, 114, 128, 0.2)',
  },
  picksList: {
    gap: 8,
  },
  pickItemWrapper: {
    // Wrapper for individual pick items
  },
  pickItemWithMargin: {
    marginBottom: 4,
  },
});

export default SlipCard;
