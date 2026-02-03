// =====================================================
// MatchTypeSelector Component
// =====================================================
// Allows users to toggle between Public and Private match types.
// Implements a segmented control style similar to iOS.

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { MatchType } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

/**
 * Props for MatchTypeSelector component
 */
export interface MatchTypeSelectorProps {
  /** Current selected match type */
  value: MatchType;

  /** Callback fired when match type changes */
  onChange: (type: MatchType) => void;

  /** Optional: Disable the component */
  disabled?: boolean;

  /** Optional: Additional className for container */
  className?: string;
}

/**
 * MatchTypeSelector Component
 *
 * Features:
 * - Segmented control for Public/Private selection
 * - Clear visual distinction between states
 * - Descriptive help text for each option
 *
 * Match Types:
 * - **Public:** Anyone can join via browse/search
 * - **Private:** Only users with invite link can join
 *
 * Usage:
 * ```tsx
 * const [matchType, setMatchType] = useState<MatchType>('public');
 *
 * <MatchTypeSelector
 *   value={matchType}
 *   onChange={setMatchType}
 * />
 * ```
 */
export function MatchTypeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}: MatchTypeSelectorProps) {
  const handlePublicPress = useCallback(() => {
    if (!disabled) {
      onChange('public');
    }
  }, [onChange, disabled]);

  const handlePrivatePress = useCallback(() => {
    if (!disabled) {
      onChange('private');
    }
  }, [onChange, disabled]);

  return (
    <View className={className}>
      <Text style={styles.label}>Match Type</Text>

      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        {/* Public Option */}
        <Pressable
          onPress={handlePublicPress}
          disabled={disabled}
          style={[
            styles.segment,
            styles.segmentLeft,
            value === 'public' && styles.segmentActive,
            disabled && styles.segmentDisabled,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              value === 'public' && styles.segmentTextActive,
            ]}
          >
            Public
          </Text>
        </Pressable>

        {/* Private Option */}
        <Pressable
          onPress={handlePrivatePress}
          disabled={disabled}
          style={[
            styles.segment,
            styles.segmentRight,
            value === 'private' && styles.segmentActive,
            disabled && styles.segmentDisabled,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              value === 'private' && styles.segmentTextActive,
            ]}
          >
            Private
          </Text>
        </Pressable>
      </View>

      {/* Help Text */}
      <Text style={styles.helperText}>
        {value === 'public'
          ? 'Anyone can find and join this challenge'
          : 'Only players with your invite link can join'}
      </Text>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  label: {
    color: LUXURY_THEME.text.primary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // Accessibility: Minimum touch target
  },
  segmentLeft: {
    marginRight: 4,
  },
  segmentRight: {
    marginLeft: 4,
  },
  segmentActive: {
    backgroundColor: LUXURY_THEME.gold.main,
  },
  segmentDisabled: {
    opacity: 0.5,
  },
  segmentText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: LUXURY_THEME.text.primary,
  },

  // Helper Text
  helperText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});

export default MatchTypeSelector;
