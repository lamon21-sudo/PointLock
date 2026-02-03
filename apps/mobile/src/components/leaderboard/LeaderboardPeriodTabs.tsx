// =====================================================
// LeaderboardPeriodTabs Component
// =====================================================
// Segmented control for switching between All Time / Weekly

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { LeaderboardPeriod } from '../../types/leaderboard.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface LeaderboardPeriodTabsProps {
  /** Currently selected period */
  selected: LeaderboardPeriod;
  /** Period change handler */
  onSelect: (period: LeaderboardPeriod) => void;
}

// =====================================================
// Config
// =====================================================

const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all-time', label: 'All Time' },
  { value: 'weekly', label: 'This Week' },
];

// =====================================================
// Component
// =====================================================

export function LeaderboardPeriodTabs({
  selected,
  onSelect,
}: LeaderboardPeriodTabsProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {PERIOD_OPTIONS.map((option) => {
        const isSelected = selected === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.tab,
              isSelected && styles.tabSelected,
              pressed && styles.tabPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[styles.tabText, isSelected && styles.tabTextSelected]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 44,
  },
  tabSelected: {
    backgroundColor: LUXURY_THEME.gold.main,
  },
  tabPressed: {
    opacity: 0.8,
  },
  tabText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: LUXURY_THEME.text.primary,
  },
});

export default LeaderboardPeriodTabs;
