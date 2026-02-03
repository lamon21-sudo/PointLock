// =====================================================
// SlipFilterControl Component
// =====================================================
// Segmented control for filtering slips by status group.
// Draft | Active | Completed

import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import {
  SlipFilterType,
  SLIP_FILTER_CONFIG,
} from '../../types/api-slip.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface SlipFilterControlProps {
  /** Currently selected filter */
  selected: SlipFilterType;
  /** Called when filter selection changes */
  onSelect: (filter: SlipFilterType) => void;
  /** Optional counts for each filter */
  counts?: Partial<Record<SlipFilterType, number>>;
}

// =====================================================
// Constants
// =====================================================

const FILTER_OPTIONS: SlipFilterType[] = ['draft', 'active', 'completed'];

// =====================================================
// Component
// =====================================================

/**
 * SlipFilterControl - Segmented filter for slip status
 *
 * Features:
 * - Three filter options: Draft, Active, Completed
 * - Active state with primary color
 * - Optional count badges
 * - 44pt minimum touch targets
 * - Smooth press feedback
 */
export function SlipFilterControl({
  selected,
  onSelect,
  counts,
}: SlipFilterControlProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {FILTER_OPTIONS.map((filterType) => {
        const config = SLIP_FILTER_CONFIG[filterType];
        const isSelected = selected === filterType;
        const count = counts?.[filterType];

        return (
          <Pressable
            key={filterType}
            onPress={() => onSelect(filterType)}
            style={({ pressed }) => [
              styles.filterButton,
              isSelected && styles.filterButtonSelected,
              pressed && styles.filterButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${config.label} filter${count !== undefined ? `, ${count} items` : ''}`}
          >
            <Text
              style={[
                styles.filterLabel,
                isSelected && styles.filterLabelSelected,
              ]}
            >
              {config.label}
            </Text>
            {count !== undefined && count > 0 && (
              <View
                style={[
                  styles.countBadge,
                  isSelected && styles.countBadgeSelected,
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    isSelected && styles.countTextSelected,
                  ]}
                >
                  {count > 99 ? '99+' : count}
                </Text>
              </View>
            )}
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
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    minHeight: 44, // Accessibility
    gap: 6,
  },
  filterButtonSelected: {
    backgroundColor: LUXURY_THEME.gold.main,
  },
  filterButtonPressed: {
    opacity: 0.8,
  },
  filterLabel: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterLabelSelected: {
    color: LUXURY_THEME.text.primary,
  },
  countBadge: {
    backgroundColor: 'rgba(156, 163, 175, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  countTextSelected: {
    color: LUXURY_THEME.text.primary,
  },
});

export default SlipFilterControl;
