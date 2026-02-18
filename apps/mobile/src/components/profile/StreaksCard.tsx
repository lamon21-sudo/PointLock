// =====================================================
// StreaksCard Component
// =====================================================
// Shows current and best winning streaks with emoji indicators

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FireIcon, TrophyIcon } from 'phosphor-react-native';
import { LUXURY_THEME } from '../../constants/theme';
import { GlassCard } from '../ui/GlassCard';

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
    <GlassCard padded>
      {/* Card Title */}
      <Text style={styles.title}>Streaks</Text>

      {/* Current Streak */}
      <View style={styles.streakRow}>
        <View style={styles.streakInfo}>
          <FireIcon size={24} color={LUXURY_THEME.gold.main} weight="duotone" style={{ marginRight: 12 }} />
          <Text style={styles.streakLabel}>Current Streak</Text>
        </View>
        <Text style={styles.streakValue}>{currentStreak}</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Best Streak */}
      <View style={styles.streakRow}>
        <View style={styles.streakInfo}>
          <TrophyIcon size={24} color={LUXURY_THEME.gold.main} weight="duotone" style={{ marginRight: 12 }} />
          <Text style={styles.streakLabel}>Best Streak</Text>
        </View>
        <Text style={styles.streakValue}>{bestStreak}</Text>
      </View>
    </GlassCard>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
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
