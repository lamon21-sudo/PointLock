// =====================================================
// MenuRow Component
// =====================================================
// Reusable menu row for profile settings list
// Follows TransactionItem pattern for consistency

import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

export interface MenuRowProps {
  /** Emoji icon to display */
  icon: string;
  /** Primary label text */
  label: string;
  /** Optional subtitle/hint text */
  subtitle?: string;
  /** Optional right-side value display */
  value?: string;
  /** Show chevron indicator (default: true) */
  showChevron?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Whether this is the last item (no bottom border) */
  isLast?: boolean;
  /** Destructive styling (red text) */
  destructive?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

// =====================================================
// Component
// =====================================================

export const MenuRow = memo(function MenuRow({
  icon,
  label,
  subtitle,
  value,
  showChevron = true,
  onPress,
  isLast = false,
  destructive = false,
  disabled = false,
}: MenuRowProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.container,
        !isLast && styles.borderBottom,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      android_ripple={{
        color: LUXURY_THEME.border.muted,
        borderless: false,
      }}
    >
      {/* Icon Container */}
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      {/* Label Section */}
      <View style={styles.labelContainer}>
        <Text
          style={[
            styles.label,
            destructive && styles.labelDestructive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right Section (Value + Chevron) */}
      <View style={styles.rightSection}>
        {value && (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        )}
        {showChevron && (
          <Text style={styles.chevron}>›</Text>
        )}
      </View>
    </Pressable>
  );
});

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: Platform.OS === 'ios' ? LUXURY_THEME.surface.raised : undefined,
  },
  disabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LUXURY_THEME.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  labelContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: LUXURY_THEME.text.primary,
  },
  labelDestructive: {
    color: LUXURY_THEME.status.error,
  },
  subtitle: {
    fontSize: 13,
    color: LUXURY_THEME.text.muted,
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  value: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    marginRight: 4,
  },
  chevron: {
    fontSize: 20,
    color: LUXURY_THEME.text.muted,
    marginLeft: 4,
  },
});

export default MenuRow;
