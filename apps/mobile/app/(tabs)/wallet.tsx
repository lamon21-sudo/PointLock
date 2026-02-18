import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GiftIcon, WalletIcon, WarningIcon, ReceiptIcon } from 'phosphor-react-native';

import { useWalletStore } from '../../src/stores/wallet.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { BalanceDisplay } from '../../src/components/wallet/BalanceDisplay';
import { TransactionItem } from '../../src/components/wallet/TransactionItem';
import { Transaction, TransactionType } from '../../src/types/wallet.types';
import { LUXURY_THEME } from '../../src/constants/theme';

// =====================================================
// Wallet Screen
// =====================================================
// Main wallet screen displaying balance and transaction history.
// Features pull-to-refresh and infinite scroll for transactions.

/**
 * Transaction type filter options.
 */
const FILTER_OPTIONS: { label: string; value: TransactionType | null }[] = [
  { label: 'All', value: null },
  { label: 'Wins', value: 'MATCH_WIN' },
  { label: 'Entries', value: 'MATCH_ENTRY' },
  { label: 'Bonus', value: 'BONUS' },
  { label: 'Deposits', value: 'DEPOSIT' },
];

/**
 * Empty state component for transaction list.
 */
function EmptyTransactions({ isFiltered }: { isFiltered: boolean }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.iconWrapper}>
        <ReceiptIcon size={48} color={LUXURY_THEME.text.muted} weight="duotone" />
      </View>
      <Text style={styles.emptyTitle}>
        {isFiltered ? 'No matching transactions' : 'No transactions yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isFiltered
          ? 'Try changing the filter to see more transactions'
          : 'Your transaction history will appear here'}
      </Text>
    </View>
  );
}

/**
 * Loading skeleton for transactions.
 */
function TransactionSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonItem}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonSubtitle} />
          </View>
          <View style={styles.skeletonAmount} />
        </View>
      ))}
    </View>
  );
}

/**
 * Allowance banner component.
 */
function AllowanceBanner({
  eligible,
  amount,
  isLoading,
  onClaim,
}: {
  eligible: boolean;
  amount: number;
  isLoading: boolean;
  onClaim: () => void;
}) {
  if (!eligible) return null;

  return (
    <Pressable
      onPress={onClaim}
      disabled={isLoading}
      style={({ pressed }) => [
        styles.allowanceBanner,
        pressed && styles.allowanceBannerPressed,
      ]}
    >
      <View style={styles.allowanceContent}>
        <GiftIcon size={24} color={LUXURY_THEME.bg.primary} weight="duotone" />
        <View>
          <Text style={styles.allowanceTitle}>Weekly Allowance Available!</Text>
          <Text style={styles.allowanceSubtitle}>
            Claim {amount.toLocaleString()} RC for free
          </Text>
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Text style={styles.allowanceButton}>Claim</Text>
      )}
    </Pressable>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const {
    wallet,
    isLoadingWallet,
    walletError,
    transactions,
    transactionsPagination,
    isLoadingTransactions,
    isLoadingMoreTransactions,
    transactionsError,
    transactionFilter,
    allowanceEligibility,
    allowanceAmount,
    isClaimingAllowance,
    fetchWallet,
    fetchTransactions,
    loadMoreTransactions,
    refreshAll,
    checkAllowance,
    claimAllowance,
    setTransactionFilter,
  } = useWalletStore();

  // Get initialization state to prevent 401 errors on app startup
  const isInitialized = useAuthStore((state) => state.isInitialized);

  // Initial data fetch - wait for auth initialization to prevent 401 errors
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      refreshAll();
    }
  }, [isAuthenticated, isInitialized, refreshAll]);

  // Pull to refresh handler
  const handleRefresh = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  // Load more transactions on scroll
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMoreTransactions && transactionsPagination?.hasNext) {
      loadMoreTransactions();
    }
  }, [isLoadingMoreTransactions, transactionsPagination, loadMoreTransactions]);

  // Handle allowance claim
  const handleClaimAllowance = useCallback(async () => {
    const success = await claimAllowance();
    if (success) {
      // Could show a success toast here
    }
  }, [claimAllowance]);

  // Handle add funds
  const handleAddFunds = useCallback(() => {
    // TODO: Navigate to add funds flow
    console.log('Add funds pressed');
  }, []);

  // Handle transaction press
  const handleTransactionPress = useCallback((transaction: Transaction) => {
    // TODO: Navigate to transaction details
    console.log('Transaction pressed:', transaction.id);
  }, []);

  // Render transaction item
  const renderTransaction: ListRenderItem<Transaction> = useCallback(
    ({ item }) => (
      <TransactionItem transaction={item} onPress={handleTransactionPress} />
    ),
    [handleTransactionPress]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  // Loading footer for infinite scroll
  const renderFooter = useCallback(() => {
    if (!isLoadingMoreTransactions) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
      </View>
    );
  }, [isLoadingMoreTransactions]);

  // Check if refreshing
  const isRefreshing = isLoadingWallet && wallet !== null;

  // Header component with balance and filters
  const ListHeader = useMemo(
    () => (
      <View>
        {/* Balance Display */}
        <BalanceDisplay
          paidBalance={wallet?.paidBalance ?? 0}
          bonusBalance={wallet?.bonusBalance ?? 0}
          isLoading={isLoadingWallet && !wallet}
          variant="full"
          showAddFunds
          onAddFunds={handleAddFunds}
        />

        {/* Allowance Banner */}
        <View style={styles.allowanceContainer}>
          <AllowanceBanner
            eligible={allowanceEligibility?.eligible ?? false}
            amount={allowanceAmount}
            isLoading={isClaimingAllowance}
            onClaim={handleClaimAllowance}
          />
        </View>

        {/* Transaction History Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterContainer}>
          {FILTER_OPTIONS.map((option) => (
            <Pressable
              key={option.value ?? 'all'}
              onPress={() => setTransactionFilter(option.value)}
              style={[
                styles.filterPill,
                transactionFilter === option.value && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  transactionFilter === option.value && styles.filterPillTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    ),
    [
      wallet,
      isLoadingWallet,
      handleAddFunds,
      allowanceEligibility,
      allowanceAmount,
      isClaimingAllowance,
      handleClaimAllowance,
      transactionFilter,
      setTransactionFilter,
    ]
  );

  // Guest mode view
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.guestContainer}>
          <View style={styles.iconWrapper}>
            <WalletIcon size={64} color={LUXURY_THEME.gold.main} weight="duotone" />
          </View>
          <Text style={styles.guestTitle}>Sign in to view your wallet</Text>
          <Text style={styles.guestSubtitle}>
            Track your balance, view transactions, and manage your funds.
          </Text>
          <Pressable
            onPress={() => router.push('/login')}
            style={styles.signInButton}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (walletError && !wallet) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <View style={styles.iconWrapper}>
            <WarningIcon size={48} color={LUXURY_THEME.status.warning} weight="duotone" />
          </View>
          <Text style={styles.errorTitle}>Unable to load wallet</Text>
          <Text style={styles.errorSubtitle}>{walletError}</Text>
          <Pressable onPress={fetchWallet} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          isLoadingTransactions ? (
            <TransactionSkeleton />
          ) : (
            <EmptyTransactions isFiltered={transactionFilter !== null} />
          )
        }
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={LUXURY_THEME.gold.main}
            colors={[LUXURY_THEME.gold.main]}
            progressBackgroundColor={LUXURY_THEME.bg.secondary}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        getItemLayout={(_, index) => ({
          length: 64,
          offset: 64 * index,
          index,
        })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },

  // Icon spacing wrapper — replaces emoji marginBottom
  iconWrapper: {
    marginBottom: 16,
  },

  // Section Header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },

  // Filter Pills
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: LUXURY_THEME.border.muted,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: LUXURY_THEME.gold.main,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
  },
  filterPillTextActive: {
    color: LUXURY_THEME.text.primary,
  },

  // Allowance Banner
  allowanceContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  allowanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LUXURY_THEME.gold.main,
    borderRadius: 12,
    padding: 16,
  },
  allowanceBannerPressed: {
    opacity: 0.9,
  },
  allowanceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  allowanceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
  },
  allowanceSubtitle: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.7)',
    marginTop: 2,
  },
  allowanceButton: {
    fontSize: 14,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Skeleton Loading
  skeletonContainer: {
    paddingHorizontal: 0,
  },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LUXURY_THEME.border.muted,
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    width: 100,
    height: 14,
    borderRadius: 4,
    backgroundColor: LUXURY_THEME.border.muted,
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: 70,
    height: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  skeletonAmount: {
    width: 60,
    height: 16,
    borderRadius: 4,
    backgroundColor: LUXURY_THEME.border.muted,
  },

  // Loading Footer
  loadingFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Guest State
  guestContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  guestSubtitle: {
    fontSize: 15,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  signInButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },

  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
  },
});
