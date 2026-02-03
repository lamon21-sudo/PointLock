// =====================================================
// useWallet Hook
// =====================================================
// Convenient hook for accessing wallet balance and operations.
// Provides a clean API for components to interact with wallet state.

import { useCallback, useEffect } from 'react';
import { useWalletStore } from '../stores/wallet.store';
import { useAuthStore } from '../stores/auth.store';
import { formatRC, formatCurrency } from '../types/wallet.types';

/**
 * Hook for accessing wallet balance and operations.
 *
 * Features:
 * - Automatic balance initialization from auth
 * - Loading and error states
 * - Balance refresh and real-time sync capabilities
 * - Formatted balance strings for display
 *
 * @example
 * ```tsx
 * const { balance, isLoading, refreshBalance } = useWallet();
 *
 * if (isLoading) return <Skeleton />;
 *
 * return <Text>{balance.formatted}</Text>;
 * ```
 */
export function useWallet() {
  const { isAuthenticated } = useAuthStore();

  const {
    wallet,
    isLoadingWallet,
    walletError,
    fetchWallet,
    refreshAll,
    reset,
    onMatchSettled,
    deductPendingStake,
    revertPendingStake,
  } = useWalletStore();

  // Refresh balance from API
  const refreshBalance = useCallback(async () => {
    if (isAuthenticated) {
      await fetchWallet();
    }
  }, [isAuthenticated, fetchWallet]);

  // Computed balance values with formatting
  const balance = {
    // Raw values in cents
    paid: wallet?.paidBalance ?? 0,
    bonus: wallet?.bonusBalance ?? 0,
    total: wallet?.totalBalance ?? 0,

    // Formatted strings for display
    paidFormatted: formatRC(wallet?.paidBalance ?? 0),
    bonusFormatted: formatRC(wallet?.bonusBalance ?? 0),
    totalFormatted: formatRC(wallet?.totalBalance ?? 0),

    // Currency format (dollars)
    paidCurrency: formatCurrency(wallet?.paidBalance ?? 0),
    bonusCurrency: formatCurrency(wallet?.bonusBalance ?? 0),
    totalCurrency: formatCurrency(wallet?.totalBalance ?? 0),
  };

  // Stats from wallet
  const stats = wallet?.stats ?? {
    totalDeposited: 0,
    totalWon: 0,
    totalLost: 0,
    totalRakePaid: 0,
  };

  // Check if user has sufficient balance for a given amount
  const hasSufficientBalance = useCallback(
    (amountInCents: number): boolean => {
      return balance.total >= amountInCents;
    },
    [balance.total]
  );

  // Check if wallet is initialized (has data)
  const isInitialized = wallet !== null;

  return {
    // Balance data
    balance,
    stats,

    // State flags
    isLoading: isLoadingWallet,
    isInitialized,
    error: walletError,

    // Actions
    refreshBalance,
    refreshAll,
    reset,

    // Match Settlement Sync
    onMatchSettled,
    deductPendingStake,
    revertPendingStake,

    // Utilities
    hasSufficientBalance,

    // Raw wallet object (for advanced use cases)
    wallet,
  };
}

/**
 * Hook for subscribing to balance changes.
 * Useful for components that need to react to balance updates.
 *
 * @param onChange - Callback fired when balance changes
 */
export function useBalanceListener(
  onChange: (balance: { paid: number; bonus: number; total: number }) => void
) {
  const wallet = useWalletStore((state) => state.wallet);

  useEffect(() => {
    if (wallet) {
      onChange({
        paid: wallet.paidBalance,
        bonus: wallet.bonusBalance,
        total: wallet.totalBalance,
      });
    }
  }, [wallet?.paidBalance, wallet?.bonusBalance, wallet?.totalBalance, onChange]);
}

export default useWallet;
