// =====================================================
// ChallengePreview Component
// =====================================================
// Displays a summary of the challenge being created.
// Shows stake amount, match type, rake, and potential winnings.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlobeIcon, LockIcon, LightbulbIcon } from 'phosphor-react-native';
import type { MatchType } from '@pick-rivals/shared-types';
import { DEFAULT_RAKE_PERCENTAGE } from '@pick-rivals/shared-types';

import { formatRC, formatCurrency } from '../../types/wallet.types';

/**
 * Props for ChallengePreview component
 */
export interface ChallengePreviewProps {
  /** Stake amount in cents */
  stakeAmount: number;

  /** Match type (public or private) */
  matchType: MatchType;

  /** Optional: Override default rake percentage */
  rakePercentage?: number;

  /** Optional: Additional className for container */
  className?: string;
}

/**
 * ChallengePreview Component
 *
 * Features:
 * - Summary card showing challenge details
 * - Calculated pot size (stake × 2)
 * - Rake amount (5% of pot)
 * - Potential winnings (pot - rake)
 * - Match type indicator
 *
 * Usage:
 * ```tsx
 * <ChallengePreview
 *   stakeAmount={5000}
 *   matchType="public"
 * />
 * ```
 */
export function ChallengePreview({
  stakeAmount,
  matchType,
  rakePercentage = DEFAULT_RAKE_PERCENTAGE,
  className = '',
}: ChallengePreviewProps) {
  // Calculate pot and winnings
  const calculations = useMemo(() => {
    const totalPot = stakeAmount * 2; // Both players contribute
    const rakeAmount = Math.floor((totalPot * rakePercentage) / 100);
    const winnerPayout = totalPot - rakeAmount;

    return {
      totalPot,
      rakeAmount,
      winnerPayout,
    };
  }, [stakeAmount, rakePercentage]);

  return (
    <View style={styles.container} className={className}>
      <Text style={styles.title}>Challenge Summary</Text>

      {/* Match Type Badge */}
      <View style={styles.badgeContainer}>
        <View
          style={[
            styles.badge,
            matchType === 'public' ? styles.badgePublic : styles.badgePrivate,
          ]}
        >
          <View style={styles.badgeContent}>
            {matchType === 'public' ? (
              <GlobeIcon size={14} color="#22c55e" weight="duotone" />
            ) : (
              <LockIcon size={14} color="#fbbf24" weight="duotone" />
            )}
            <Text style={styles.badgeText}>
              {matchType === 'public' ? 'Public' : 'Private'}
            </Text>
          </View>
        </View>
      </View>

      {/* Details Grid */}
      <View style={styles.detailsGrid}>
        {/* Your Stake */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Your Stake</Text>
          <Text style={styles.detailValue}>{formatRC(stakeAmount)}</Text>
        </View>

        {/* Total Pot */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total Pot</Text>
          <Text style={[styles.detailValue, styles.detailValueHighlight]}>
            {formatRC(calculations.totalPot)}
          </Text>
        </View>

        {/* Rake Fee */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>
            Rake ({rakePercentage}%)
          </Text>
          <Text style={styles.detailValueSubdued}>
            -{formatRC(calculations.rakeAmount)}
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Potential Winnings */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabelBold}>If You Win</Text>
          <Text style={styles.detailValueSuccess}>
            +{formatRC(calculations.winnerPayout)}
          </Text>
        </View>
      </View>

      {/* Info Note */}
      <View style={styles.infoBox}>
        <View style={styles.infoContent}>
          <LightbulbIcon size={14} color="#93c5fd" weight="duotone" style={styles.infoIcon} />
          <Text style={styles.infoText}>
            Winner takes the pot minus rake fee. Both players' stakes are at risk.
          </Text>
        </View>
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },

  // Badge
  badgeContainer: {
    marginBottom: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePublic: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  badgePrivate: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Details Grid
  detailsGrid: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  detailLabelBold: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '700',
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  detailValueHighlight: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '700',
  },
  detailValueSubdued: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  detailValueSuccess: {
    color: '#22c55e',
    fontSize: 17,
    fontWeight: '700',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#2a2a3e',
    marginVertical: 8,
  },

  // Info Box
  infoBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    color: '#93c5fd',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});

export default ChallengePreview;
