// =====================================================
// Slip Builder Screen
// =====================================================
// Main screen for selecting picks and building a betting slip.
// Features sport filters, event list, and floating review button.

import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { Stack } from 'expo-router';
import axios from 'axios';

import { WifiSlashIcon, CalendarIcon } from 'phosphor-react-native';
import { api } from '../../src/services/api';
import { SportsEvent } from '@pick-rivals/shared-types';
import { LeagueFilterBar } from '../../src/components/events/LeagueFilterBar';
import { EventCardSkeleton } from '../../src/components/events/EventCardSkeleton';
import { BettingEventCard, SlipTray } from '../../src/components/betting';
import { useSlipStoreHydration, usePicksCount } from '../../src/stores/slip.store';
import { useUserTier } from '../../src/stores/user.store';
import { getDateGroupKey } from '../../src/utils/date-helpers';
import { ProfileService } from '../../src/services/profile.service';
import { useUserStore } from '../../src/stores/user.store';

// =====================================================
// Types
// =====================================================

type LeagueFilterType = 'ALL' | 'NFL' | 'NBA' | 'MLB' | 'NHL';

interface GroupedEvent {
  type: 'header' | 'event';
  title?: string;
  event?: SportsEvent;
  id: string;
}

// =====================================================
// Component
// =====================================================

/**
 * SlipBuilder Screen
 *
 * Production-quality screen for building betting slips.
 *
 * Features:
 * - Premium sport filter with spring animations
 * - Virtualized FlatList for smooth scrolling (60fps)
 * - Pull-to-refresh with loading states
 * - Skeleton loaders during initial load
 * - SlipFAB showing pick count and points
 * - Date group headers for event organization
 * - Hydration-aware rendering (no flash)
 */
export default function SlipBuilderScreen() {
  const [filter, setFilter] = useState<LeagueFilterType>('ALL');
  const isHydrated = useSlipStoreHydration();
  const userTier = useUserTier();
  const setUserTierData = useUserStore((s) => s.setUserTierData);

  // Fetch user profile to get tier information
  const { data: profileData } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const profile = await ProfileService.getMyProfile();
      // Update user store with tier data
      setUserTierData(profile.currentTier, profile.totalCoinsEarned);
      return profile;
    },
    staleTime: 60000, // 1 minute
    retry: 1,
  });

  // Fetch events from API
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['events', filter, 'builder'],
    queryFn: async () => {
      const params = filter !== 'ALL' ? `?sport=${filter}&status=SCHEDULED` : '?status=SCHEDULED';
      const response = await api.get(`/events${params}`);
      return response.data;
    },
    staleTime: 30000, // 30s - odds change frequently
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),
    gcTime: 5 * 60 * 1000,
  });

  const events: SportsEvent[] = data?.data || [];

  // Flatten events with date headers for FlatList
  const flattenedData: GroupedEvent[] = useMemo(() => {
    if (events.length === 0) return [];

    // Group by date
    const grouped = events.reduce((acc, event) => {
      const dateKey = getDateGroupKey(event.scheduledAt);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    }, {} as Record<string, SportsEvent[]>);

    // Flatten into array with headers
    const result: GroupedEvent[] = [];
    Object.entries(grouped).forEach(([title, groupEvents]) => {
      // Add header
      result.push({ type: 'header', title, id: `header-${title}` });
      // Add events
      groupEvents.forEach((event) => {
        result.push({ type: 'event', event, id: event.id });
      });
    });

    return result;
  }, [events]);

  // Render item based on type
  const renderItem = useCallback(
    ({ item, index }: { item: GroupedEvent; index: number }) => {
      if (item.type === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{item.title}</Text>
          </View>
        );
      }

      if (item.event) {
        return <BettingEventCard event={item.event} index={index} userTier={userTier} />;
      }

      return null;
    },
    [userTier]
  );

  // Key extractor
  const keyExtractor = useCallback((item: GroupedEvent) => item.id, []);

  // Get item type for optimization
  const getItemType = useCallback(
    (item: GroupedEvent) => (item.type === 'header' ? 'header' : 'event'),
    []
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Loading state
  if (isLoading || !isHydrated) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Build Slip',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <LeagueFilterBar selected={filter} onSelect={setFilter} />
          <View style={styles.skeletonContainer}>
            {[0, 1, 2, 3, 4].map((index) => (
              <EventCardSkeleton key={index} index={index} />
            ))}
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Error state
  if (error) {
    const isNetworkError =
      axios.isAxiosError(error) &&
      (error.message.includes('Network Error') || error.code === 'ERR_NETWORK');

    return (
      <>
        <Stack.Screen
          options={{
            title: 'Build Slip',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <LeagueFilterBar selected={filter} onSelect={setFilter} />
          <View style={styles.errorContainer}>
            <WifiSlashIcon size={48} color="#ef4444" weight="duotone" style={{ marginBottom: 16 }} />
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorMessage}>
              {isNetworkError
                ? 'Cannot reach the server. Check your connection.'
                : 'Failed to load events. Please try again.'}
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Build Slip',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <LeagueFilterBar selected={filter} onSelect={setFilter} />
          <View style={styles.emptyContainer}>
            <CalendarIcon size={48} color="#9ca3af" weight="duotone" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>No Games Available</Text>
            <Text style={styles.emptyMessage}>
              {filter !== 'ALL'
                ? `No ${filter} games available for betting right now`
                : 'No games available for betting right now'}
            </Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Main content
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Build Slip',
          headerStyle: { backgroundColor: '#0f0f23' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* League Filter */}
        <LeagueFilterBar selected={filter} onSelect={setFilter} />

        {/* Events List */}
        <FlatList
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={undefined} // Variable height items
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor="#6366f1"
              colors={['#6366f1']}
              progressBackgroundColor="#1f2937"
            />
          }
          // Performance optimizations
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          initialNumToRender={6}
          windowSize={10}
          removeClippedSubviews={true}
          // Footer padding for FAB
          ListFooterComponent={<View style={styles.footer} />}
        />

        {/* Slip Tray */}
        <SlipTray />
      </SafeAreaView>
    </>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23', // bg-background
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 180, // Space for SlipTray (increased from 100 for FAB)
  },
  sectionHeader: {
    backgroundColor: '#0f0f23',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  sectionHeaderText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    height: 160, // Increased to account for taller SlipTray
  },
  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#6b7280',
    fontSize: 13,
  },
});
