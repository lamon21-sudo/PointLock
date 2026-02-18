// =====================================================
// Matches Screen (Slip History)
// =====================================================
// Displays user's slips with filtering and pagination.
// Tab name kept as "Matches" for future PvP match integration.

import { useCallback, useMemo } from 'react';
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
import { useSlips } from '../../src/hooks/useSlips';
import { SlipFilterControl } from '../../src/components/slip/SlipFilterControl';
import { SlipListCard } from '../../src/components/slip/SlipListCard';
import { ApiSlipResponse } from '../../src/services/slip.service';
import { SLIP_FILTER_CONFIG, SlipFilterType } from '../../src/types/api-slip.types';
import { LUXURY_THEME } from '../../src/constants/theme';
import { AppIcon } from '../../src/components/ui/AppIcon';

// =====================================================
// Constants
// =====================================================

const CARD_HEIGHT = 124; // Approximate card height for getItemLayout

// =====================================================
// Sub-components
// =====================================================

/**
 * Empty state component for each filter type
 */
function EmptyState({
  filter,
  onBuildSlip,
}: {
  filter: SlipFilterType;
  onBuildSlip: () => void;
}) {
  const config = SLIP_FILTER_CONFIG[filter];

  return (
    <View style={styles.emptyContainer}>
      <AppIcon name={config.emptyIconName} size={48} color={LUXURY_THEME.text.muted} />
      <Text style={styles.emptyTitle}>
        {filter === 'draft'
          ? 'No Draft Slips'
          : filter === 'active'
          ? 'No Active Slips'
          : 'No Completed Slips'}
      </Text>
      <Text style={styles.emptyMessage}>{config.emptyMessage}</Text>
      {filter === 'draft' && (
        <Pressable style={styles.ctaButton} onPress={onBuildSlip}>
          <Text style={styles.ctaButtonText}>Build a Slip</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Error state component
 */
function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const isNetworkError =
    error.includes('Network') || error.includes('timeout') || error.includes('connection');

  return (
    <View style={styles.errorContainer}>
      <AppIcon name={isNetworkError ? 'WifiSlash' : 'Warning'} size={48} color={isNetworkError ? LUXURY_THEME.status.error : LUXURY_THEME.status.warning} />
      <Text style={styles.errorTitle}>
        {isNetworkError ? 'Connection Issue' : 'Something Went Wrong'}
      </Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

/**
 * Loading skeleton for initial load
 */
function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonBadge} />
            <View style={styles.skeletonDate} />
          </View>
          <View style={styles.skeletonPicks} />
          <View style={styles.skeletonProgress} />
        </View>
      ))}
    </View>
  );
}

/**
 * Footer component for loading more
 */
function ListFooter({ isLoading }: { isLoading: boolean }) {
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

export default function MatchesScreen() {
  const router = useRouter();

  // Fetch slips with hook
  const {
    slips,
    pagination,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    filter,
    setFilter,
    refresh,
    loadMore,
    fetchSlips,
  } = useSlips({ initialFilter: 'active' });

  // =====================================================
  // Handlers
  // =====================================================

  const handleSlipPress = useCallback(
    (slip: ApiSlipResponse) => {
      router.push(`/slip/${slip.id}`);
    },
    [router]
  );

  const handleBuildSlip = useCallback(() => {
    router.push('/(tabs)/events');
  }, [router]);

  // =====================================================
  // Render Functions
  // =====================================================

  const renderItem = useCallback(
    ({ item }: { item: ApiSlipResponse }) => (
      <SlipListCard slip={item} onPress={() => handleSlipPress(item)} />
    ),
    [handleSlipPress]
  );

  const keyExtractor = useCallback((item: ApiSlipResponse) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_HEIGHT,
      offset: CARD_HEIGHT * index,
      index,
    }),
    []
  );

  const ListEmptyComponent = useMemo(
    () => (
      <EmptyState filter={filter} onBuildSlip={handleBuildSlip} />
    ),
    [filter, handleBuildSlip]
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Slips</Text>
        {pagination && pagination.total > 0 && (
          <Text style={styles.headerCount}>
            {pagination.total} {pagination.total === 1 ? 'slip' : 'slips'}
          </Text>
        )}
      </View>

      {/* Filter Control */}
      <SlipFilterControl selected={filter} onSelect={setFilter} />

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={fetchSlips} />
      ) : (
        <FlatList
          data={slips}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Performance optimizations
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerCount: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 100, // Space for tab bar
    flexGrow: 1,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyMessage: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  ctaButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  ctaButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  errorTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
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
  // Loading Skeleton
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    height: CARD_HEIGHT - 12,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  skeletonBadge: {
    width: 70,
    height: 24,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 6,
  },
  skeletonDate: {
    width: 60,
    height: 16,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 4,
  },
  skeletonPicks: {
    width: 80,
    height: 20,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 4,
    marginBottom: 10,
  },
  skeletonProgress: {
    height: 6,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 3,
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
