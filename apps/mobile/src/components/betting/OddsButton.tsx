// =====================================================
// OddsButton Component - Premium Glassmorphism Design
// =====================================================
// Atomic component with glassmorphism effect and gold highlights.
// Matches premium sportsbook aesthetic.

import React, { useCallback, useRef } from 'react';
import { Pressable, Text, Animated, StyleSheet, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PickType } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';
import { LockedPickOverlay } from './LockedPickOverlay';

// =====================================================
// Types
// =====================================================

export interface OddsButtonProps {
  /** Display label (e.g., "Over 220.5", "-3.5") */
  label: string;
  /** Formatted odds string (e.g., "-110", "+150") */
  odds: string;
  /** Whether this button is currently selected */
  isSelected: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Type of bet for accessibility */
  pickType: PickType;
  /** Selection side for accessibility */
  selection: string;
  /** Show compact version without label */
  compact?: boolean;
  /** Whether this pick is locked (requires higher tier) */
  locked?: boolean;
  /** Required tier to unlock (0-3) */
  requiredTier?: number;
  /** Coin cost for this pick */
  coinCost?: number;
}

// =====================================================
// Component
// =====================================================

export function OddsButton({
  label,
  odds,
  isSelected,
  disabled = false,
  onPress,
  pickType,
  selection,
  compact = false,
  locked = false,
  requiredTier,
  coinCost,
}: OddsButtonProps): React.ReactElement {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 400,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 400,
      friction: 10,
    }).start();
  }, [scaleAnim]);

  const accessibilityLabel = `${pickType} ${selection} ${label} ${odds}${
    isSelected ? ', selected' : ''
  }${disabled ? ', unavailable' : ''}${locked ? ', locked' : ''}${
    coinCost ? `, costs ${coinCost} coins` : ''
  }`;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || locked}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: disabled || locked }}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.button,
          isSelected && styles.buttonSelected,
          disabled && styles.buttonDisabled,
          locked && styles.buttonLocked,
        ]}
      >
        {/* Glassmorphism gradient background */}
        <LinearGradient
          colors={
            isSelected
              ? ['rgba(212, 175, 55, 0.15)', 'rgba(212, 175, 55, 0.05)']
              : ['rgba(30, 30, 30, 0.8)', 'rgba(20, 20, 20, 0.9)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Content */}
        <View style={styles.content}>
          {/* Label row (e.g., "+12.5" or "O 253.5") */}
          {!compact && label && (
            <Text
              style={[
                styles.label,
                isSelected && styles.labelSelected,
                disabled && styles.labelDisabled,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          )}

          {/* Odds value */}
          <Text
            style={[
              styles.odds,
              isSelected && styles.oddsSelected,
              disabled && styles.oddsDisabled,
            ]}
            numberOfLines={1}
          >
            {odds}
          </Text>

          {/* Coin cost badge */}
          {coinCost !== undefined && coinCost > 0 && !locked && (
            <Text style={styles.coinCost}>{coinCost}c</Text>
          )}
        </View>

        {/* Gold highlight border for selected state */}
        {isSelected && (
          <View style={styles.selectedBorder} pointerEvents="none" />
        )}

        {/* Locked overlay */}
        {locked && requiredTier !== undefined && (
          <LockedPickOverlay requiredTier={requiredTier} />
        )}
      </Pressable>
    </Animated.View>
  );
}

// =====================================================
// Styles - Premium Glassmorphism
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  button: {
    minHeight: 52,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    position: 'relative',
  },
  buttonSelected: {
    borderColor: LUXURY_THEME.gold.main,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: LUXURY_THEME.gold.main,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.35,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  buttonLocked: {
    opacity: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: LUXURY_THEME.text.secondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  labelSelected: {
    color: LUXURY_THEME.gold.main,
  },
  labelDisabled: {
    color: LUXURY_THEME.text.muted,
  },
  odds: {
    fontSize: 13,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
  },
  oddsSelected: {
    color: LUXURY_THEME.gold.light,
  },
  oddsDisabled: {
    color: LUXURY_THEME.text.muted,
  },
  coinCost: {
    fontSize: 10,
    fontWeight: '600',
    color: LUXURY_THEME.gold.main,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  selectedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: LUXURY_THEME.gold.main,
  },
});

export default OddsButton;
