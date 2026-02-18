// =====================================================
// Leaderboard Screen
// =====================================================
// Displays global and weekly leaderboards with current user position

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TrophyIcon, WarningIcon } from 'phosphor-react-native';

import { useLeaderboard } from '../../src/hooks/useLeaderboard';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  LeaderboardRow,
  LEADERBOARD_ROW_HEIGHT,
  UserRankCard,
  LeaderboardPeriodTabs,
  LeaderboardSkeleton,
} from '../../src/components/leaderboard';
import type { LeaderboardEntry } from '../../src/types/leaderboard.types';
import { LUXURY_THEME } from '../../src/constants/theme';

// =====================================================
// Sub-components
// =====================================================

function EmptyState({ period }: { period: string }): React.ReactElement {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.iconWrapper}>
        <TrophyIcon size={48} color={LUXURY_THEME.gold.main} weight="duotone" />
      </View>
      <Text style={styles.emptyTitle}>No Rankings Yet</Text>
      <Text style={styles.emptyMessage}>
        {period === 'weekly'
          ? "Be the first to climb this week's leaderboard!"
          : 'Complete matches to appear on the leaderboard'}
      </Text>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <View style={styles.errorContainer}>
      <View style={styles.iconWrapper}>
        <WarningIcon size={48} color={LUXURY_THEME.status.warning} weight="duotone" />
      </View>
      <Text style={styles.errorTitle}>Failed to Load</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function ListFooter({
  isLoading,
}: {
  isLoading: boolean;
}): React.ReactElement | null {
  if (!isLoading) return null;
  return (
    <View style={styles.footerContainer}>
      <ActivityIndicator color={LUXURY_THEME.gold.main} size="small" />
      <Text style={styles.footerText}>Loading more...</Text>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function LeaderboardScreen(): React.ReactElement {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const user = useAuthStore((state) => state.user);

  const {
    entries,
    pagination,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    period,
    setPeriod,
    refresh,
    loadMore,
    currentUserEntry,
  } = useLeaderboard({ initialPeriod: 'all-time' });

  // =====================================================
  // Handlers
  // =====================================================

  const handleUserPress = useCallback((entry: LeaderboardEntry) => {
    // Don't navigate to own profile from leaderboard
    if (entry.userId === user?.id) return;
    router.push({ pathname: '/users/[id]', params: { id: entry.userId } });
  }, [user?.id, router]);

  // =====================================================
  // Render Functions
  // =====================================================

  const renderItem = useCallback(
    ({ item }: { item: LeaderboardEntry }) => (
      <LeaderboardRow
        entry={item}
        isCurrentUser={item.userId === user?.id}
        onPress={handleUserPress}
      />
    ),
    [user?.id, handleUserPress]
  );

  const keyExtractor = useCallback(
    (item: LeaderboardEntry) => item.userId,
    []
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: LEADERBOARD_ROW_HEIGHT + 8, // Row height + margin
      offset: (LEADERBOARD_ROW_HEIGHT + 8) * index,
      index,
    }),
    []
  );

  const ListHeaderComponent = useMemo(
    () => (
      <View>
        {/* Period Tabs */}
        <LeaderboardPeriodTabs selected={period} onSelect={setPeriod} />

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {period === 'weekly' ? 'This Week' : 'All Time'} Rankings
          </Text>
          {pagination && pagination.total > 0 && (
            <Text style={styles.sectionCount}>{pagination.total} players</Text>
          )}
        </View>
      </View>
    ),
    [period, setPeriod, pagination]
  );

  const ListEmptyComponent = useMemo(
    () => <EmptyState period={period} />,
    [period]
  );

  const ListFooterComponent = useMemo(
    () => <ListFooter isLoading={isLoadingMore} />,
    [isLoadingMore]
  );

  // =====================================================
  // Render
  // =====================================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Main Content */}
      {isLoading ? (
        <View>
          <LeaderboardPeriodTabs selected={period} onSelect={setPeriod} />
          <LeaderboardSkeleton />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <FlatList
          data={entries}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Performance optimizations
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={15}
          // Pull-to-refresh
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={LUXURY_THEME.gold.main}
              colors={[LUXURY_THEME.gold.main]}
              progressBackgroundColor={LUXURY_THEME.bg.secondary}
            />
          }
          // Infinite scroll
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
        />
      )}

      {/* Sticky User Rank Card at Bottom */}
      {isAuthenticated && !error && (
        <UserRankCard entry={currentUserEntry} isLoading={isLoading} />
      )}
    </SafeAreaView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  sectionCount: {
    fontSize: 13,
    color: LUXURY_THEME.text.muted,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  // Icon spacing wrapper — replaces emoji marginBottom
  iconWrapper: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  retryButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  // Footer
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
  },
});
