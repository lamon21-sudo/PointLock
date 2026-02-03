// =====================================================
// PointsDisplay Component
// =====================================================
// Contextual points display showing either Point Potential
// or Points Earned based on slip status.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import type { SlipStatus } from '@pick-rivals/shared-types';
import { isSlipSettled, getSlipStatusColor } from '../../types/api-slip.types';

// =====================================================
// Types
// =====================================================

interface PointsDisplayProps {
  /** Slip status determines display mode */
  status: SlipStatus;
  /** Maximum possible points */
  pointPotential: number;
  /** Actual points earned (for settled slips) */
  pointsEarned: number;
  /** Display variant */
  variant?: 'compact' | 'full';
  /** Maximum value for progress bar (default: 500) */
  maxProgressValue?: number;
}

// =====================================================
// Component
// =====================================================

/**
 * PointsDisplay - Contextual points visualization
 *
 * Display modes based on status:
 * - DRAFT/PENDING/ACTIVE: Shows Point Potential with blue styling
 * - WON/LOST/PUSH: Shows Points Earned vs Potential with status color
 * - CANCELLED: Shows "Cancelled" with gray styling
 *
 * Features:
 * - Animated progress bar
 * - Color-coded by status
 * - Compact and full variants
 * - Status hint text for active slips
 */
export function PointsDisplay({
  status,
  pointPotential,
  pointsEarned,
  variant = 'compact',
  maxProgressValue = 500,
}: PointsDisplayProps): React.ReactElement {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const upperStatus = status.toUpperCase();
  const settled = isSlipSettled(status);
  const isCancelled = upperStatus === 'CANCELLED';
  const isActive = upperStatus === 'ACTIVE';
  const isPending = upperStatus === 'PENDING';
  const isDraft = upperStatus === 'DRAFT';

  // Calculate progress percentage
  const progressValue = settled ? pointsEarned : pointPotential;
  const progressMax = settled ? pointPotential : maxProgressValue;
  const progressPercent = progressMax > 0 ? (progressValue / progressMax) * 100 : 0;

  // Get status color
  const statusColor = getSlipStatusColor(status);

  // Animate progress bar
  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: progressPercent,
      useNativeDriver: false,
      tension: 100,
      friction: 14,
    }).start();
  }, [progressPercent, progressAnim]);

  // =====================================================
  // Cancelled State
  // =====================================================

  if (isCancelled) {
    return (
      <View style={[styles.container, variant === 'full' && styles.containerFull]}>
        <Text style={styles.cancelledText}>Slip Cancelled</Text>
      </View>
    );
  }

  // =====================================================
  // Settled State (WON/LOST/PUSH)
  // =====================================================

  if (settled) {
    return (
      <View style={[styles.container, variant === 'full' && styles.containerFull]}>
        {/* Label Row */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>Points Earned</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: statusColor }]}>
              {pointsEarned}
            </Text>
            <Text style={styles.secondary}> / {pointPotential}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: statusColor,
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Status Hint */}
        {variant === 'full' && (
          <Text style={[styles.statusHint, { color: statusColor }]}>
            {upperStatus === 'WON' && 'You won!'}
            {upperStatus === 'LOST' && 'Better luck next time'}
            {upperStatus === 'PUSH' && 'Push - picks refunded'}
          </Text>
        )}
      </View>
    );
  }

  // =====================================================
  // Active/Pending/Draft State
  // =====================================================

  return (
    <View style={[styles.container, variant === 'full' && styles.containerFull]}>
      {/* Label Row */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Point Potential</Text>
        <Text style={[styles.value, styles.potentialValue]}>
          {pointPotential}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Animated.View
          style={[
            styles.progressBar,
            styles.progressBarPotential,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Status Hint */}
      {variant === 'full' && (
        <Text style={styles.statusHint}>
          {isDraft && 'Draft - not yet submitted'}
          {isPending && 'Awaiting game start'}
          {isActive && 'Games in progress'}
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
    gap: 6,
  },
  containerFull: {
    gap: 10,
    padding: 16,
    backgroundColor: '#0f0f23',
    borderRadius: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  potentialValue: {
    color: '#3b82f6',
  },
  secondary: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  progressBarPotential: {
    backgroundColor: '#3b82f6',
  },
  statusHint: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  cancelledText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
  },
});

export default PointsDisplay;
