// =====================================================
// LeaderboardSkeleton Component
// =====================================================
// Loading skeleton for leaderboard list

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LEADERBOARD_ROW_HEIGHT } from './LeaderboardRow';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Component
// =====================================================

export function LeaderboardSkeleton(): React.ReactElement {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rank} />
          <View style={styles.avatar} />
          <View style={styles.info}>
            <View style={styles.name} />
            <View style={styles.stats} />
          </View>
          <View style={styles.score} />
        </View>
      ))}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: LEADERBOARD_ROW_HEIGHT,
    backgroundColor: LUXURY_THEME.surface.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  rank: {
    width: 32,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    width: 100,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    marginBottom: 8,
  },
  stats: {
    width: 70,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
  },
  score: {
    width: 50,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
  },
});

export default LeaderboardSkeleton;
