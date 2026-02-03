// =====================================================
// StatsCard Component
// =====================================================
// Horizontal 3-column grid showing matches, wins, and win rate

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

export interface StatsCardProps {
  /** Total matches played */
  matchesPlayed: number;
  /** Total matches won */
  matchesWon: number;
  /** Win rate percentage (0-100) */
  winRate: number;
}

// =====================================================
// Component
// =====================================================

export function StatsCard({
  matchesPlayed,
  matchesWon,
  winRate,
}: StatsCardProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* Matches Played */}
      <View style={styles.statColumn}>
        <Text style={styles.statValue}>{matchesPlayed}</Text>
        <Text style={styles.statLabel}>Matches</Text>
      </View>

      {/* Vertical Divider */}
      <View style={styles.divider} />

      {/* Matches Won */}
      <View style={styles.statColumn}>
        <Text style={[styles.statValue, styles.winsValue]}>{matchesWon}</Text>
        <Text style={styles.statLabel}>Wins</Text>
      </View>

      {/* Vertical Divider */}
      <View style={styles.divider} />

      {/* Win Rate */}
      <View style={styles.statColumn}>
        <Text style={styles.statValue}>{winRate.toFixed(0)}%</Text>
        <Text style={styles.statLabel}>Win Rate</Text>
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginBottom: 16,
    // Subtle depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  winsValue: {
    color: LUXURY_THEME.status.success, // Success green for wins
  },
  statLabel: {
    fontSize: 12,
    color: LUXURY_THEME.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: LUXURY_THEME.border.muted,
  },
});
