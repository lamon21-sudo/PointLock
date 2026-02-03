import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { formatRC } from '../../types/wallet.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Balance Display Component
// =====================================================
// A reusable header widget that displays wallet balance information.
// Supports both compact (for tab bar) and full (for wallet screen) modes.

interface BalanceDisplayProps {
  /** Paid/cash balance in cents (withdrawable). */
  paidBalance: number;
  /** Bonus balance in cents (non-withdrawable). */
  bonusBalance: number;
  /** Loading state for skeleton display. */
  isLoading?: boolean;
  /** Display mode - compact for headers, full for wallet screen. */
  variant?: 'compact' | 'full';
  /** Optional press handler for navigation. */
  onPress?: () => void;
  /** Show the add funds button (full variant only). */
  showAddFunds?: boolean;
  /** Handler for add funds button. */
  onAddFunds?: () => void;
}

/**
 * BalanceDisplay Component
 *
 * Displays wallet balance with clear distinction between:
 * - Paid Balance: Real money, withdrawable
 * - Bonus Balance: Promotional credits, non-withdrawable
 * - Total Balance: Combined for betting
 *
 * The component maintains layout stability during loading with
 * skeleton placeholders to prevent layout shift.
 */
export const BalanceDisplay = memo(function BalanceDisplay({
  paidBalance,
  bonusBalance,
  isLoading = false,
  variant = 'full',
  onPress,
  showAddFunds = false,
  onAddFunds,
}: BalanceDisplayProps) {
  const totalBalance = paidBalance + bonusBalance;

  // Compact variant for headers/navigation
  if (variant === 'compact') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.compactContainer,
          pressed && styles.pressed,
        ]}
        accessibilityLabel={`Wallet balance: ${formatRC(totalBalance)}`}
        accessibilityRole="button"
      >
        {isLoading ? (
          <View style={styles.compactSkeleton} />
        ) : (
          <>
            <Text style={styles.compactIcon}>💰</Text>
            <Text style={styles.compactBalance}>{formatRC(totalBalance)}</Text>
          </>
        )}
      </Pressable>
    );
  }

  // Full variant for wallet screen
  return (
    <View style={styles.fullContainer}>
      {/* Total Balance - Prominent Display */}
      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Total Balance</Text>
        {isLoading ? (
          <View style={styles.totalSkeleton} />
        ) : (
          <Text style={styles.totalAmount}>{formatRC(totalBalance)}</Text>
        )}
      </View>

      {/* Balance Breakdown */}
      <View style={styles.breakdownContainer}>
        {/* Paid Balance */}
        <View style={styles.balanceRow}>
          <View style={styles.balanceInfo}>
            <View style={[styles.balanceIndicator, styles.paidIndicator]} />
            <View>
              <Text style={styles.balanceLabel}>Cash Balance</Text>
              <Text style={styles.balanceHint}>Withdrawable</Text>
            </View>
          </View>
          {isLoading ? (
            <View style={styles.balanceSkeleton} />
          ) : (
            <Text style={styles.balanceValue}>{formatRC(paidBalance)}</Text>
          )}
        </View>

        {/* Bonus Balance */}
        <View style={[styles.balanceRow, styles.lastBalanceRow]}>
          <View style={styles.balanceInfo}>
            <View style={[styles.balanceIndicator, styles.bonusIndicator]} />
            <View>
              <Text style={styles.balanceLabel}>Bonus Balance</Text>
              <Text style={styles.balanceHint}>Play only</Text>
            </View>
          </View>
          {isLoading ? (
            <View style={styles.balanceSkeleton} />
          ) : (
            <Text style={styles.balanceValue}>{formatRC(bonusBalance)}</Text>
          )}
        </View>
      </View>

      {/* Add Funds Button */}
      {showAddFunds && (
        <Pressable
          onPress={onAddFunds}
          style={({ pressed }) => [
            styles.addFundsButton,
            pressed && styles.addFundsPressed,
          ]}
          accessibilityLabel="Add funds to wallet"
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.addFundsText}>+ Add Coins</Text>
          )}
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Compact Variant Styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(214, 179, 106, 0.12)', // Gold tint
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 100,
    // Minimum touch target
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  compactIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  compactBalance: {
    fontSize: 14,
    fontWeight: '700',
    color: LUXURY_THEME.gold.main,
  },
  compactSkeleton: {
    width: 60,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
  },

  // Full Variant Styles
  fullContainer: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    // Subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  totalSection: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
  },
  totalLabel: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: LUXURY_THEME.gold.main, // Gold accent for total
    letterSpacing: -1,
  },
  totalSkeleton: {
    width: 140,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },

  // Breakdown Section
  breakdownContainer: {
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  lastBalanceRow: {
    borderBottomWidth: 0,
  },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  paidIndicator: {
    backgroundColor: LUXURY_THEME.status.success, // Mint green for cash
  },
  bonusIndicator: {
    backgroundColor: '#a855f7', // Keep purple for bonus
  },
  balanceLabel: {
    fontSize: 15,
    color: LUXURY_THEME.text.primary,
    fontWeight: '500',
  },
  balanceHint: {
    fontSize: 12,
    color: LUXURY_THEME.text.muted,
    marginTop: 1,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  balanceSkeleton: {
    width: 70,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
  },

  // Add Funds Button
  addFundsButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 4,
  },
  addFundsPressed: {
    backgroundColor: LUXURY_THEME.gold.depth,
    opacity: 0.9,
  },
  addFundsText: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary, // Dark text on gold
  },
});

export default BalanceDisplay;
