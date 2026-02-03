// =====================================================
// PlacementProgress Component
// =====================================================
// Displays placement match progress (10 matches required).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Rank, RANK_DISPLAY, PLACEMENT_RESULTS } from '@pick-rivals/shared-types';
import { LUXURY_THEME, GRADIENTS, SHADOWS } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface PlacementProgressProps {
  completed: number;
  total?: number;
  wins: number;
  losses: number;
  draws: number;
  /** Individual match results in order (oldest first) */
  matchResults?: Array<'WIN' | 'LOSS' | 'DRAW'>;
}

// =====================================================
// Helper Functions
// =====================================================

function getProjectedRank(wins: number): Rank {
  // Use the official PLACEMENT_RESULTS mapping
  const clampedWins = Math.max(0, Math.min(10, wins));
  return PLACEMENT_RESULTS[clampedWins] || Rank.BRONZE_3;
}

function getOutcomeColor(outcome: 'WIN' | 'LOSS' | 'DRAW' | null): string {
  switch (outcome) {
    case 'WIN':
      return LUXURY_THEME.status.success;
    case 'LOSS':
      return LUXURY_THEME.status.error;
    case 'DRAW':
      return LUXURY_THEME.text.muted;
    default:
      return LUXURY_THEME.surface.raised;
  }
}

// =====================================================
// Component
// =====================================================

export function PlacementProgress({
  completed,
  total = 10,
  wins,
  losses,
  draws,
  matchResults = [],
}: PlacementProgressProps) {
  const remaining = total - completed;
  const projectedRank = getProjectedRank(wins);
  const projectedInfo = RANK_DISPLAY[projectedRank];

  // Build match dots array
  const dots = Array.from({ length: total }, (_, index) => {
    if (index < matchResults.length) {
      return matchResults[index];
    }
    return null;
  });

  return (
    <LinearGradient
      colors={GRADIENTS.glassCard}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PLACEMENT MATCHES</Text>
        <Text style={styles.progress}>
          {completed} / {total}
        </Text>
      </View>

      {/* Match dots */}
      <View style={styles.dotsContainer}>
        {dots.map((outcome, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor: getOutcomeColor(outcome),
                borderColor: outcome ? getOutcomeColor(outcome) : LUXURY_THEME.border.muted,
              },
              outcome === null && styles.dotEmpty,
            ]}
          >
            {outcome && (
              <Text style={styles.dotLabel}>
                {outcome === 'WIN' ? 'W' : outcome === 'LOSS' ? 'L' : 'D'}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Record */}
      <View style={styles.recordContainer}>
        <View style={styles.recordItem}>
          <Text style={[styles.recordValue, { color: LUXURY_THEME.status.success }]}>
            {wins}
          </Text>
          <Text style={styles.recordLabel}>WINS</Text>
        </View>
        <View style={styles.recordDivider} />
        <View style={styles.recordItem}>
          <Text style={[styles.recordValue, { color: LUXURY_THEME.status.error }]}>
            {losses}
          </Text>
          <Text style={styles.recordLabel}>LOSSES</Text>
        </View>
        {draws > 0 && (
          <>
            <View style={styles.recordDivider} />
            <View style={styles.recordItem}>
              <Text style={[styles.recordValue, { color: LUXURY_THEME.text.muted }]}>
                {draws}
              </Text>
              <Text style={styles.recordLabel}>DRAWS</Text>
            </View>
          </>
        )}
      </View>

      {/* Projected rank */}
      <View style={styles.projectedContainer}>
        <Text style={styles.projectedLabel}>PROJECTED RANK</Text>
        <View style={styles.projectedRank}>
          <View
            style={[styles.projectedDot, { backgroundColor: projectedInfo.color }]}
          />
          <Text style={styles.projectedName}>{projectedInfo.name}</Text>
        </View>
        {remaining > 0 && (
          <Text style={styles.projectedHint}>
            Win {remaining} more to improve your rank
          </Text>
        )}
      </View>

      {/* CTA */}
      {remaining > 0 && (
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaText}>
            {remaining} match{remaining === 1 ? '' : 'es'} remaining
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: LUXURY_THEME.spacing.borderRadius,
    padding: LUXURY_THEME.spacing.cardPadding,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: LUXURY_THEME.text.secondary,
    letterSpacing: 1.5,
  },
  progress: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotEmpty: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  dotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  recordContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 24,
  },
  recordItem: {
    alignItems: 'center',
  },
  recordValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  recordLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 1,
    marginTop: 2,
  },
  recordDivider: {
    width: 1,
    height: 32,
    backgroundColor: LUXURY_THEME.border.muted,
  },
  projectedContainer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.muted,
  },
  projectedLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  projectedRank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  projectedName: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  projectedHint: {
    fontSize: 12,
    color: LUXURY_THEME.text.secondary,
    marginTop: 8,
  },
  ctaContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.muted,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    color: LUXURY_THEME.gold.brushed,
  },
});

export default PlacementProgress;
