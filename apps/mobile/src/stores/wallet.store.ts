// =====================================================
// Wallet Store
// =====================================================
// Zustand store for wallet state management.
// Handles balance, transactions, and allowance state.

import { create } from 'zustand';
import { WalletService } from '../services/wallet.service';
import {
  Wallet,
  Transaction,
  PaginationMeta,
  AllowanceEligibility,
  TransactionType,
} from '../types/wallet.types';

// =====================================================
// Types
// =====================================================

interface WalletState {
  // Wallet Balance
  wallet: Wallet | null;
  isLoadingWallet: boolean;
  walletError: string | null;

  // Transaction History
  transactions: Transaction[];
  transactionsPagination: PaginationMeta | null;
  isLoadingTransactions: boolean;
  isLoadingMoreTransactions: boolean;
  transactionsError: string | null;
  transactionFilter: TransactionType | null;

  // Allowance
  allowanceEligibility: AllowanceEligibility | null;
  allowanceAmount: number;
  isCheckingAllowance: boolean;
  isClaimingAllowance: boolean;
  allowanceError: string | null;

  // Actions
  initializeFromAuth: (walletData: { paidBalance: number; bonusBalance: number; totalBalance: number }) => void;
  fetchWallet: () => Promise<void>;
  fetchTransactions: (page?: number, filter?: TransactionType | null) => Promise<void>;
  loadMoreTransactions: () => Promise<void>;
  refreshAll: () => Promise<void>;
  checkAllowance: () => Promise<void>;
  claimAllowance: () => Promise<boolean>;
  setTransactionFilter: (filter: TransactionType | null) => void;
  clearErrors: () => void;
  reset: () => void;

  // Match Settlement Sync
  onMatchSettled: (matchId?: string) => Promise<void>;
  deductPendingStake: (stakeAmount: number) => void;
  revertPendingStake: () => void;
}

// =====================================================
// Initial State
// =====================================================

const initialState = {
  wallet: null,
  isLoadingWallet: false,
  walletError: null,

  transactions: [],
  transactionsPagination: null,
  isLoadingTransactions: false,
  isLoadingMoreTransactions: false,
  transactionsError: null,
  transactionFilter: null,

  allowanceEligibility: null,
  allowanceAmount: 0,
  isCheckingAllowance: false,
  isClaimingAllowance: false,
  allowanceError: null,
};

// =====================================================
// Store
// =====================================================

export const useWalletStore = create<WalletState>((set, get) => ({
  ...initialState,

  /**
   * Initialize wallet state from auth response data.
   * Called immediately after login/register to provide instant balance display.
   * This avoids an extra API call since wallet data is included in auth response.
   */
  initializeFromAuth: (walletData: { paidBalance: number; bonusBalance: number; totalBalance: number }) => {
    set({
      wallet: {
        id: '', // Will be populated on full fetch
        userId: '', // Will be populated on full fetch
        paidBalance: walletData.paidBalance,
        bonusBalance: walletData.bonusBalance,
        totalBalance: walletData.totalBalance,
        stats: {
          totalDeposited: 0,
          totalWon: 0,
          totalLost: 0,
          totalRakePaid: 0,
        },
      },
      isLoadingWallet: false,
      walletError: null,
    });
  },

  /**
   * Fetch the user's wallet balance and stats.
   */
  fetchWallet: async () => {
    set({ isLoadingWallet: true, walletError: null });

    try {
      const wallet = await WalletService.getWallet();
      set({ wallet, isLoadingWallet: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch wallet';
      set({ walletError: message, isLoadingWallet: false });
      console.error('Wallet fetch error:', error);
    }
  },

  /**
   * Fetch transaction history with optional filtering.
   * Resets pagination when called with page 1 or new filter.
   */
  fetchTransactions: async (page = 1, filter?: TransactionType | null) => {
    const currentFilter = filter !== undefined ? filter : get().transactionFilter;

    // Reset transactions if fetching first page or filter changed
    if (page === 1) {
      set({
        isLoadingTransactions: true,
        transactionsError: null,
        transactionFilter: currentFilter,
      });
    } else {
      set({ isLoadingMoreTransactions: true, transactionsError: null });
    }

    try {
      const response = await WalletService.getTransactionHistory({
        page,
        limit: 20,
        type: currentFilter ?? undefined,
      });

      set((state) => ({
        transactions: page === 1
          ? response.transactions
          : [...state.transactions, ...response.transactions],
        transactionsPagination: response.pagination,
        isLoadingTransactions: false,
        isLoadingMoreTransactions: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
      set({
        transactionsError: message,
        isLoadingTransactions: false,
        isLoadingMoreTransactions: false,
      });
      console.error('Transactions fetch error:', error);
    }
  },

  /**
   * Load the next page of transactions.
   */
  loadMoreTransactions: async () => {
    const { transactionsPagination, isLoadingMoreTransactions } = get();

    // Don't load more if already loading or no more pages
    if (isLoadingMoreTransactions || !transactionsPagination?.hasNext) {
      return;
    }

    await get().fetchTransactions(transactionsPagination.page + 1);
  },

  /**
   * Refresh all wallet data (balance, transactions, allowance).
   * Allowance check runs independently and won't block other operations.
   */
  refreshAll: async () => {
    // Run wallet and transactions in parallel (critical data)
    await Promise.all([
      get().fetchWallet(),
      get().fetchTransactions(1),
    ]);

    // Check allowance independently - don't let it block critical data
    // If this fails, it won't affect the wallet/transaction display
    get().checkAllowance().catch((error) => {
      console.warn('Allowance check failed (non-critical):', error);
      // Silently fail - allowance is optional/promotional feature
    });
  },

  /**
   * Check allowance eligibility.
   * This is a non-critical feature - failures are handled gracefully.
   */
  checkAllowance: async () => {
    set({ isCheckingAllowance: true, allowanceError: null });

    try {
      const response = await WalletService.checkAllowance();
      set({
        allowanceEligibility: response.eligibility,
        allowanceAmount: response.allowanceAmount,
        isCheckingAllowance: false,
      });
    } catch (error) {
      // Gracefully handle connection errors without crashing
      const message = error instanceof Error ? error.message : 'Failed to check allowance';

      // Check if it's a timeout or network error
      const isNetworkError = error instanceof Error &&
        (error.message.includes('timeout') ||
         error.message.includes('Network Error') ||
         error.message.includes('ECONNREFUSED'));

      if (isNetworkError) {
        console.warn('Allowance check network error (non-critical):', message);
        // Don't set error state for network issues - allowance is optional
        set({
          isCheckingAllowance: false,
          allowanceError: null, // Clear error to prevent UI disruption
        });
      } else {
        // Only show error for actual API errors (not eligible, etc.)
        set({ allowanceError: message, isCheckingAllowance: false });
        console.error('Allowance check error:', error);
      }
    }
  },

  /**
   * Claim the weekly allowance.
   * @returns true if claim was successful.
   */
  claimAllowance: async (): Promise<boolean> => {
    set({ isClaimingAllowance: true, allowanceError: null });

    try {
      const response = await WalletService.claimAllowance();

      if (response.claimed) {
        // Refresh wallet to get updated balance
        await get().fetchWallet();
        // Refresh allowance status
        await get().checkAllowance();
        // Refresh transactions to show the new allowance credit
        await get().fetchTransactions(1);

        set({ isClaimingAllowance: false });
        return true;
      }

      set({ isClaimingAllowance: false });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim allowance';
      set({ allowanceError: message, isClaimingAllowance: false });
      console.error('Allowance claim error:', error);
      return false;
    }
  },

  /**
   * Set transaction type filter and refetch.
   */
  setTransactionFilter: (filter: TransactionType | null) => {
    get().fetchTransactions(1, filter);
  },

  /**
   * Clear all error states.
   */
  clearErrors: () => {
    set({
      walletError: null,
      transactionsError: null,
      allowanceError: null,
    });
  },

  /**
   * Reset store to initial state.
   * Call on logout.
   */
  reset: () => {
    set(initialState);
  },

  /**
   * Handle match settlement event.
   * Called when a PvP match is finalized to sync balance with backend.
   * This ensures the UI reflects the correct balance after wins/losses.
   *
   * @param matchId - The settled match ID (for logging/debugging)
   */
  onMatchSettled: async (matchId?: string) => {
    console.log(`💰 Match settled${matchId ? ` (${matchId})` : ''}, refreshing wallet...`);

    // Refresh wallet balance to reflect settlement
    await get().fetchWallet();

    // Also refresh recent transactions to show the win/loss entry
    await get().fetchTransactions(1);
  },

  /**
   * Optimistic balance update for pending match entries.
   * Deducts the stake amount immediately for responsive UI.
   * Should be followed by fetchWallet() after confirmation.
   *
   * @param stakeAmount - Amount to deduct in cents
   */
  deductPendingStake: (stakeAmount: number) => {
    const { wallet } = get();
    if (!wallet) return;

    // Optimistically update the balance
    // Backend will deduct from bonus first, then paid
    const newBonusBalance = Math.max(0, wallet.bonusBalance - stakeAmount);
    const remainingDeduction = stakeAmount - (wallet.bonusBalance - newBonusBalance);
    const newPaidBalance = wallet.paidBalance - remainingDeduction;

    set({
      wallet: {
        ...wallet,
        bonusBalance: newBonusBalance,
        paidBalance: newPaidBalance,
        totalBalance: newPaidBalance + newBonusBalance,
      },
    });
  },

  /**
   * Revert an optimistic balance update.
   * Call this if a match entry fails after optimistic update.
   */
  revertPendingStake: () => {
    // Simply refetch the actual balance from server
    get().fetchWallet();
  },
}));

export default useWalletStore;
