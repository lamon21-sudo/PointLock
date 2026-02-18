import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  Transaction,
  TransactionType,
  getTransactionCategory,
  formatRC,
} from '../../types/wallet.types';
import AppIcon, { IconName } from '../ui/AppIcon';

// =====================================================
// Transaction Item Component
// =====================================================
// Displays a single transaction in the history list.
// Optimized for 60fps scrolling with memo and minimal re-renders.

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
}

/**
 * Get the Phosphor icon name for a transaction type.
 * Icons are chosen to be instantly recognizable at a glance.
 */
function getTransactionIcon(type: TransactionType): IconName {
  switch (type) {
    case 'DEPOSIT':
      return 'CreditCard';
    case 'WITHDRAWAL':
      return 'Bank';
    case 'MATCH_ENTRY':
      return 'Crosshair';
    case 'MATCH_WIN':
      return 'Trophy';
    case 'MATCH_REFUND':
      return 'ArrowULeftDown';
    case 'RAKE_FEE':
      return 'ChartBar';
    case 'BONUS':
      return 'Gift';
    case 'WEEKLY_ALLOWANCE':
      return 'CalendarCheck';
    case 'ADMIN_ADJUSTMENT':
      return 'GearSix';
    default:
      return 'Wallet';
  }
}

/**
 * Get a human-readable label for the transaction type.
 */
function getTransactionLabel(type: TransactionType): string {
  switch (type) {
    case 'DEPOSIT':
      return 'Deposit';
    case 'WITHDRAWAL':
      return 'Withdrawal';
    case 'MATCH_ENTRY':
      return 'Match Entry';
    case 'MATCH_WIN':
      return 'Match Won';
    case 'MATCH_REFUND':
      return 'Refund';
    case 'RAKE_FEE':
      return 'Platform Fee';
    case 'BONUS':
      return 'Bonus';
    case 'WEEKLY_ALLOWANCE':
      return 'Weekly Allowance';
    case 'ADMIN_ADJUSTMENT':
      return 'Adjustment';
    default:
      return 'Transaction';
  }
}

/**
 * Format a date string for display.
 * Shows "Today", "Yesterday", or the date.
 */
function formatTransactionDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (txDate.getTime() === today.getTime()) {
    return `Today, ${date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })}`;
  }

  if (txDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * TransactionItem Component
 *
 * Displays a transaction with:
 * - Type-specific icon
 * - Transaction label and optional description
 * - Amount with color coding (green for credits, red for debits)
 * - Formatted timestamp
 *
 * Touch target is 48px minimum for accessibility.
 */
export const TransactionItem = memo(function TransactionItem({
  transaction,
  onPress,
}: TransactionItemProps) {
  const { type, amount, description, createdAt } = transaction;
  const category = getTransactionCategory(type);

  // Determine text color based on transaction category
  const getAmountColor = (): string => {
    switch (category) {
      case 'credit':
      case 'bonus':
      case 'refund':
        return '#22c55e'; // success green
      case 'debit':
        return '#ef4444'; // red-500
      default:
        return '#ffffff';
    }
  };

  // Background tint for visual grouping
  const getIconBackground = (): string => {
    switch (category) {
      case 'credit':
        return 'rgba(34, 197, 94, 0.15)'; // green tint
      case 'bonus':
        return 'rgba(168, 85, 247, 0.15)'; // purple tint
      case 'refund':
        return 'rgba(59, 130, 246, 0.15)'; // blue tint
      case 'debit':
        return 'rgba(239, 68, 68, 0.15)'; // red tint
      default:
        return 'rgba(255, 255, 255, 0.1)';
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress(transaction);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
    >
      {/* Icon Container */}
      <View style={[styles.iconContainer, { backgroundColor: getIconBackground() }]}>
        <AppIcon name={getTransactionIcon(type)} size={20} color="#ffffff" />
      </View>

      {/* Transaction Details */}
      <View style={styles.detailsContainer}>
        <Text style={styles.label} numberOfLines={1}>
          {getTransactionLabel(type)}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={1}>
            {description}
          </Text>
        ) : (
          <Text style={styles.timestamp}>{formatTransactionDate(createdAt)}</Text>
        )}
      </View>

      {/* Amount */}
      <View style={styles.amountContainer}>
        <Text style={[styles.amount, { color: getAmountColor() }]}>
          {formatRC(amount, true)}
        </Text>
        {description && (
          <Text style={styles.timestamp}>{formatTransactionDate(createdAt)}</Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    // Minimum touch target
    minHeight: 64,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: '#25253a',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailsContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
});

export default TransactionItem;
