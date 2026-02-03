// =====================================================
// StakeAmountSelector Component
// =====================================================
// Allows users to select a stake amount via preset buttons or custom input.
// Implements real-time validation against wallet balance.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { Input } from '../ui/Input';
import { formatRC } from '../../types/wallet.types';
import { validateStakeAmount, sanitizeStakeInput } from '../../utils/validation';

/**
 * Props for StakeAmountSelector component
 */
export interface StakeAmountSelectorProps {
  /** Current selected stake amount in cents */
  value: number;

  /** Callback fired when stake amount changes */
  onChange: (amount: number) => void;

  /** User's current wallet balance in cents (for validation) */
  balance: number;

  /** Optional: Disable the entire component */
  disabled?: boolean;

  /** Optional: Additional className for container */
  className?: string;

  /** Optional: Override default preset values (in cents) */
  presets?: number[];
}

/**
 * Default preset stake amounts in cents
 * 1K, 5K, 10K, 25K RC
 */
const DEFAULT_PRESETS = [1000, 5000, 10000, 25000];

/**
 * StakeAmountSelector Component
 *
 * Features:
 * - Preset amount buttons with haptic feedback
 * - Custom amount input with real-time validation
 * - Automatic preset selection/deselection
 * - Balance display
 * - Error messaging
 *
 * Usage:
 * ```tsx
 * const [stake, setStake] = useState(0);
 * const { balance } = useWallet();
 *
 * <StakeAmountSelector
 *   value={stake}
 *   onChange={setStake}
 *   balance={balance.total}
 * />
 * ```
 */
export function StakeAmountSelector({
  value,
  onChange,
  balance,
  disabled = false,
  className = '',
  presets = DEFAULT_PRESETS,
}: StakeAmountSelectorProps) {
  // Local UI state
  const [customInput, setCustomInput] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(null);

  // Validation
  const validationResult = useMemo(
    () => validateStakeAmount(value, balance),
    [value, balance]
  );

  // Sync internal state when value prop changes externally
  // Determine if current value matches a preset or is custom
  useEffect(() => {
    if (value === 0) {
      // Reset state
      setActivePreset(null);
      setCustomInput('');
    } else if (presets.includes(value)) {
      // Value matches a preset
      setActivePreset(value);
      setCustomInput('');
    } else if (value > 0) {
      // Value is custom (not a preset)
      setActivePreset(null);
      setCustomInput(value.toString());
    }
  }, [value, presets]);

  /**
   * Handle preset button click
   * Triggers haptic feedback and updates parent value
   */
  const handlePresetClick = useCallback(
    (amount: number) => {
      // Haptic feedback for premium feel
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Update state
      setActivePreset(amount);
      setCustomInput('');

      // Notify parent
      onChange(amount);
    },
    [onChange]
  );

  /**
   * Handle custom input change
   * Sanitizes input and updates parent value
   */
  const handleCustomInput = useCallback(
    (text: string) => {
      // Update local input state
      setCustomInput(text);

      // Deselect any active preset
      setActivePreset(null);

      // Sanitize and parse input
      const sanitized = sanitizeStakeInput(text);

      if (sanitized !== null) {
        // Valid number parsed
        onChange(sanitized);
      } else if (text === '') {
        // Empty input - reset to 0
        onChange(0);
      }
      // If sanitized is null but text isn't empty, it means invalid input
      // We keep the text in the input field but don't update the value
    },
    [onChange]
  );

  /**
   * Check if a preset button should be disabled
   * Disabled if amount exceeds balance
   */
  const isPresetDisabled = useCallback(
    (amount: number) => {
      return disabled || amount > balance;
    },
    [disabled, balance]
  );

  return (
    <View className={className}>
      {/* Balance Display */}
      <View style={styles.balanceContainer}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>{formatRC(balance)}</Text>
      </View>

      {/* Preset Buttons */}
      <View style={styles.presetsSection}>
        <Text style={styles.sectionLabel}>Quick Select</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetsScroll}
        >
          {presets.map((amount) => {
            const isActive = activePreset === amount;
            const isDisabledPreset = isPresetDisabled(amount);

            return (
              <Pressable
                key={amount}
                onPress={() => handlePresetClick(amount)}
                disabled={isDisabledPreset}
                style={[
                  styles.presetButton,
                  isActive && styles.presetButtonActive,
                  isDisabledPreset && styles.presetButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.presetButtonText,
                    isActive && styles.presetButtonTextActive,
                    isDisabledPreset && styles.presetButtonTextDisabled,
                  ]}
                >
                  {formatRC(amount)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Custom Input */}
      <View style={styles.customInputSection}>
        <Input
          label="Custom Amount"
          placeholder="Enter amount"
          value={customInput}
          onChangeText={handleCustomInput}
          keyboardType="number-pad"
          returnKeyType="done"
          editable={!disabled}
          error={validationResult.error || undefined}
          helperText={
            !validationResult.error ? 'Enter amount in Rival Coins (RC)' : undefined
          }
        />
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  // Balance Display
  balanceContainer: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  balanceLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  balanceValue: {
    color: '#6366f1',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Presets Section
  presetsSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  presetsScroll: {
    paddingRight: 16,
  },
  presetButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4b5563',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    minWidth: 90,
    minHeight: 44, // Accessibility: Minimum touch target
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  presetButtonDisabled: {
    opacity: 0.4,
  },
  presetButtonText: {
    color: '#d1d5db',
    fontSize: 15,
    fontWeight: '600',
  },
  presetButtonTextActive: {
    color: '#ffffff',
  },
  presetButtonTextDisabled: {
    color: '#6b7280',
  },

  // Custom Input Section
  customInputSection: {
    // No additional styling needed, Input component handles it
  },
});

export default StakeAmountSelector;
