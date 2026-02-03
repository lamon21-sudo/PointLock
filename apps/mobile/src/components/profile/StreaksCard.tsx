// =====================================================
// StreaksCard Component
// =====================================================
// Shows current and best winning streaks with emoji indicators

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

export interface StreaksCardProps {
  /** Current consecutive wins */
  currentStreak: number;
  /** All-time best winning streak */
  bestStreak: number;
}

// =====================================================
// Component
// =====================================================

export function StreaksCard({
  currentStreak,
  bestStreak,
}: StreaksCardProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* Card Title */}
      <Text style={styles.title}>Streaks</Text>

      {/* Current Streak */}
      <View style={styles.streakRow}>
        <View style={styles.streakInfo}>
          <Text style={styles.emoji}>🔥</Text>
          <Text style={styles.streakLabel}>Current Streak</Text>
        </View>
        <Text style={styles.streakValue}>{currentStreak}</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Best Streak */}
      <View style={styles.streakRow}>
        <View style={styles.streakInfo}>
          <Text style={styles.emoji}>🏆</Text>
          <Text style={styles.streakLabel}>Best Streak</Text>
        </View>
        <Text style={styles.streakValue}>{bestStreak}</Text>
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
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    // Subtle depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  streakInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  streakLabel: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
    fontWeight: '500',
  },
  streakValue: {
    fontSize: 24,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: LUXURY_THEME.border.muted,
    marginVertical: 12,
  },
});
