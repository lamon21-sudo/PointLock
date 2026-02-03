// =====================================================
// LeagueFilterBar Component
// =====================================================
// Premium horizontal filter for league selection.
// Based on SportFilter pattern with gold accent on selected tab.

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

export type LeagueFilterType = 'ALL' | 'NFL' | 'NBA' | 'MLB' | 'NHL';

interface LeagueFilterBarProps {
  selected: LeagueFilterType;
  onSelect: (league: LeagueFilterType) => void;
}

const LEAGUES: LeagueFilterType[] = ['ALL', 'NFL', 'NBA', 'MLB', 'NHL'];

// Fixed width for each button segment (for indicator calculation)
// 5 buttons at 56px + 4 gaps at 4px + 8px padding = 304px (fits most screens)
const BUTTON_WIDTH = 56;
const BUTTON_GAP = 4;
const PADDING = 4;

/**
 * LeagueFilterBar - Premium league filter with 5 tabs
 *
 * Features:
 * - 5 league tabs: ALL / NFL / NBA / MLB / NHL
 * - Gold accent on selected tab
 * - Spring animation on selection
 * - Fits comfortably on screen without scrolling
 */
export function LeagueFilterBar({ selected, onSelect }: LeagueFilterBarProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Calculate position based on selected index
  const selectedIndex = LEAGUES.indexOf(selected);

  useEffect(() => {
    // Animate selection indicator to new position with spring physics
    Animated.spring(slideAnim, {
      toValue: selectedIndex * (BUTTON_WIDTH + BUTTON_GAP),
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }, [selectedIndex, slideAnim]);

  const handleSelect = (league: LeagueFilterType) => {
    if (league !== selected) {
      onSelect(league);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Animated selection indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        />

        {/* League buttons */}
        <View style={styles.buttonRow}>
          {LEAGUES.map((league) => {
            const isSelected = league === selected;

            return (
              <Pressable
                key={league}
                onPress={() => handleSelect(league)}
                style={({ pressed }) => [
                  styles.button,
                  pressed && !isSelected && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Filter by ${league === 'ALL' ? 'all leagues' : league}`}
              >
                <Text
                  style={[
                    styles.buttonText,
                    isSelected && styles.buttonTextSelected,
                  ]}
                >
                  {league}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    padding: PADDING,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  indicator: {
    position: 'absolute',
    top: PADDING,
    left: PADDING,
    bottom: PADDING,
    width: BUTTON_WIDTH,
    backgroundColor: LUXURY_THEME.gold.main,
    borderRadius: 12,
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: BUTTON_GAP,
  },
  button: {
    // Fixed width for consistent indicator animation
    width: BUTTON_WIDTH,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // Ensure buttons are above indicator
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 0.3,
  },
  buttonTextSelected: {
    color: LUXURY_THEME.bg.primary, // Dark text on gold background
  },
});
