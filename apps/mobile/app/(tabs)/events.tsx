import { View, Text, SectionList, RefreshControl, StyleSheet, Pressable } from 'react-native';
import { CalendarIcon } from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/services/api';
import { SportsEvent } from '@pick-rivals/shared-types';
import { useState, useMemo, useCallback } from 'react';
import { EventCardSkeleton, LeagueFilterBar, LeagueFilterType } from '../../src/components/events';
import { BettingEventCard, SlipFAB } from '../../src/components/betting';
import { useSlipStoreHydration } from '../../src/stores/slip.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { getDateGroupKey } from '../../src/utils/date-helpers';
import { LUXURY_THEME } from '../../src/constants/theme';
import axios from 'axios';

// Using LeagueFilterType from LeagueFilterBar component

interface EventSection {
  title: string;
  data: SportsEvent[];
}

/**
 * Events Screen - Production Quality
 *
 * Features:
 * - SectionList for proper virtualization with date grouping
 * - Pull-to-refresh with proper feedback
 * - Skeleton loaders matching EventCard dimensions
 * - Premium segmented sport filter
 * - Graceful empty states with clear messaging
 * - Staggered animations for smooth appearance
 */
export default function EventsScreen() {
  const [filter, setFilter] = useState<LeagueFilterType>('ALL');
  const isHydrated = useSlipStoreHydration();
  const isAuthInitialized = useAuthStore((state) => state.isInitialized);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['events', filter],
    queryFn: async () => {
      const params = filter !== 'ALL' ? `?sport=${filter}&status=SCHEDULED` : '?status=SCHEDULED';
      const response = await api.get(`/events${params}`);
      return response.data;
    },
    enabled: isAuthInitialized, // Wait for auth initialization to prevent 401 race condition
    staleTime: 30000, // Consider data fresh for 30 seconds (betting odds change frequently)
    retry: 2, // Retry failed requests twice before showing error
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000), // Exponential backoff
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const events: SportsEvent[] = data?.data || [];

  // Group events by date for section list
  const sections: EventSection[] = useMemo(() => {
    if (events.length === 0) return [];

    const grouped = events.reduce((acc, event) => {
      const dateKey = getDateGroupKey(event.scheduledAt);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    }, {} as Record<string, SportsEvent[]>);

    // Convert to array of sections
    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data,
    }));
  }, [events]);

  const handleRefresh = () => {
    refetch();
  };

  // Render section header
  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <View className="bg-background px-4 py-3">
      <Text className="text-text-primary font-bold text-lg">{section.title}</Text>
    </View>
  );

  // Render individual event card with betting functionality
  const renderItem = ({ item, index }: { item: SportsEvent; index: number }) => (
    <BettingEventCard event={item} index={index} />
  );

  // Loading state - show skeleton loaders (also wait for slip store hydration)
  if (isLoading || !isHydrated) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <LeagueFilterBar selected={filter} onSelect={setFilter} />
        <View className="flex-1 px-4">
          {[0, 1, 2, 3].map((index) => (
            <EventCardSkeleton key={index} index={index} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    // Determine error type for better user messaging
    const isTimeoutError = axios.isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.message.includes('timeout'));
    const isNetworkError = axios.isAxiosError(error) &&
      (error.message.includes('Network Error') || error.code === 'ERR_NETWORK');

    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <LeagueFilterBar selected={filter} onSelect={setFilter} />
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-error/10 rounded-2xl p-6 w-full" style={styles.errorContainer}>
            <Text className="text-error font-bold text-xl mb-2 text-center">
              Unable to Load Events
            </Text>
            <Text className="text-text-secondary text-center text-base mb-4">
              {isTimeoutError
                ? 'The request took too long to complete'
                : isNetworkError
                ? 'Cannot connect to the server'
                : 'Please check your connection and try again'}
            </Text>
            <Text className="text-text-muted text-center text-sm mb-5">
              {isNetworkError || isTimeoutError
                ? 'Make sure the API server is running on port 3000 and the API URL in app.config.js matches your machine\'s IP address'
                : 'Pull down to refresh or try again'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <LeagueFilterBar selected={filter} onSelect={setFilter} />
        <View className="flex-1 items-center justify-center px-6">
          <CalendarIcon size={64} color={LUXURY_THEME.gold.main} weight="duotone" style={{ marginBottom: 16 }} />
          <Text className="text-text-primary font-bold text-xl mb-2">No Events Available</Text>
          <Text className="text-text-secondary text-center text-base">
            {filter !== 'ALL'
              ? `No ${filter} games scheduled at the moment`
              : 'No games scheduled at the moment'}
          </Text>
          <Text className="text-text-muted text-center text-sm mt-2">Pull down to refresh</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Main content with events grouped by date
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <LeagueFilterBar selected={filter} onSelect={setFilter} />

      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={true}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={LUXURY_THEME.gold.main}
            colors={[LUXURY_THEME.gold.main]}
            progressBackgroundColor={LUXURY_THEME.bg.secondary}
          />
        }
        // Performance optimizations
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={8}
        windowSize={10}
        removeClippedSubviews={true}
        // Footer padding for FAB
        ListFooterComponent={<View style={styles.footer} />}
      />

      {/* Floating Action Button for slip review */}
      <SlipFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0, // Card handles its own margin
  },
  errorContainer: {
    shadowColor: LUXURY_THEME.status.error,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: LUXURY_THEME.spacing.borderRadiusPill, // Pill shape
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    height: 120, // Space for floating dock + SlipFAB
  },
});
