// =====================================================
// Event Detail Screen - Player Props View
// =====================================================
// Displays full event details with player props.
// Dynamic route: /event/[id]
// Supports hero transition from BettingEventCard.

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PropOdds } from '@pick-rivals/shared-types';
import { api } from '../../src/services/api';
import { useSlipStore } from '../../src/stores/slip.store';
import { PlayerPropsSection } from '../../src/components/betting/PlayerPropsSection';
import { SlipFAB } from '../../src/components/betting/SlipFAB';
import { LUXURY_THEME } from '../../src/constants/theme';
import { AddPickInput, DraftPickEventInfo } from '../../src/types/slip.types';
import { useHeroTransition } from '../../src/hooks/useHeroTransition';

// =====================================================
// Types
// =====================================================

interface EventPropsResponse {
  eventId: string;
  sport: string;
  lastUpdated: string | null;
  props: PropOdds[];
}

interface EventDetailsResponse {
  id: string;
  sport: string;
  league: string;
  homeTeamName: string;
  homeTeamAbbr?: string;
  awayTeamName: string;
  awayTeamAbbr?: string;
  scheduledAt: string;
  status: string;
}

// =====================================================
// Sub-components
// =====================================================

function PropsLoadingState() {
  return (
    <View style={styles.propsLoadingContainer}>
      <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
      <Text style={styles.loadingText}>Loading player props...</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function EventDetailScreen() {
  const { id, heroSource, eventSnapshot } = useLocalSearchParams<{
    id: string;
    heroSource?: string;
    eventSnapshot?: string;
  }>();
  const router = useRouter();

  // Parse snapshot for instant header render (avoids layout shift during hero)
  const snapshotData = useMemo<EventDetailsResponse | undefined>(() => {
    if (!eventSnapshot) return undefined;
    try {
      return JSON.parse(eventSnapshot) as EventDetailsResponse;
    } catch {
      return undefined;
    }
  }, [eventSnapshot]);

  // Hero transition hook
  const {
    heroRef,
    heroAnimatedStyle,
    contentFadeStyle,
    onHeroLayout,
  } = useHeroTransition({ heroSourceParam: heroSource });

  // Fetch event details (snapshot used as placeholder for instant render)
  const {
    data: eventData,
    isLoading: isEventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const response = await api.get(`/events/${id}`);
      return response.data.data as EventDetailsResponse;
    },
    enabled: !!id,
    placeholderData: snapshotData,
  });

  // Fetch event props
  const {
    data: propsData,
    isLoading: isPropsLoading,
    error: propsError,
    refetch: refetchProps,
  } = useQuery({
    queryKey: ['event-props', id],
    queryFn: async () => {
      const response = await api.get(`/events/${id}/props`);
      return response.data.data as EventPropsResponse;
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });

  // Slip store
  const addPick = useSlipStore((s) => s.addPick);
  const removePick = useSlipStore((s) => s.removePick);
  const picks = useSlipStore((s) => s.picks);

  // Track selected prop IDs
  const selectedPropIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pick of picks) {
      if (pick.pickType === 'prop' && pick.sportsEventId === id) {
        ids.add(`${id}-${pick.propType}-${pick.propPlayerName}-${pick.selection}`);
      }
    }
    return ids;
  }, [picks, id]);

  // Handle prop selection
  const handlePropSelect = useCallback(
    (prop: PropOdds, selection: 'over' | 'under') => {
      if (!eventData || !id) return;

      const pickKey = `${id}-${prop.propType}-${prop.playerName}-${selection}`;

      // Check if already selected
      if (selectedPropIds.has(pickKey)) {
        // Find and remove the pick
        const existingPick = picks.find(
          (p) =>
            p.sportsEventId === id &&
            p.pickType === 'prop' &&
            p.propType === prop.propType &&
            p.propPlayerName === prop.playerName &&
            p.selection === selection
        );
        if (existingPick) {
          removePick(existingPick.id);
        }
        return;
      }

      // Remove opposite selection if exists
      const oppositePick = picks.find(
        (p) =>
          p.sportsEventId === id &&
          p.pickType === 'prop' &&
          p.propType === prop.propType &&
          p.propPlayerName === prop.playerName
      );
      if (oppositePick) {
        removePick(oppositePick.id);
      }

      // Add new pick
      const odds = selection === 'over' ? prop.over : prop.under;
      const eventInfo: DraftPickEventInfo = {
        homeTeamName: eventData.homeTeamName,
        homeTeamAbbr: eventData.homeTeamAbbr,
        awayTeamName: eventData.awayTeamName,
        awayTeamAbbr: eventData.awayTeamAbbr,
        scheduledAt: eventData.scheduledAt,
        sport: eventData.sport,
        league: eventData.league,
      };

      const input: AddPickInput = {
        sportsEventId: id,
        pickType: 'prop',
        selection,
        line: prop.line,
        odds,
        propPlayerName: prop.playerName,
        propType: prop.propType,
        eventInfo,
      };

      addPick(input);
    },
    [eventData, id, picks, selectedPropIds, addPick, removePick]
  );

  const handleRefresh = useCallback(() => {
    refetchEvent();
    refetchProps();
  }, [refetchEvent, refetchProps]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Derive display data (from fetched data or snapshot)
  const displayEvent = eventData || snapshotData;

  // Full error state (no data at all, not even snapshot)
  if ((eventError || propsError) && !displayEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState
          message="Failed to load event details"
          onRetry={handleRefresh}
        />
      </SafeAreaView>
    );
  }

  // Loading state — only when we have NO data to show (no snapshot either)
  if (isEventLoading && !displayEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
          <Text style={styles.loadingText}>Loading event details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If somehow we still have no data, show error
  if (!displayEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState
          message="Failed to load event details"
          onRetry={handleRefresh}
        />
      </SafeAreaView>
    );
  }

  // Format date/time for display
  const scheduledDate = new Date(displayEvent.scheduledAt);
  const dateStr = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const props = propsData?.props || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={LUXURY_THEME.gold.main}
          />
        }
      >
        {/* ---- Event Header ---- */}
        <View style={styles.header}>
          {/* Back button — fades in with non-hero content */}
          <Reanimated.View style={contentFadeStyle}>
            <Pressable onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>{'<'} Back</Text>
            </Pressable>
          </Reanimated.View>

          {/* Hero: matchup section — animates from card position */}
          <Reanimated.View
            ref={heroRef}
            style={heroAnimatedStyle}
            onLayout={onHeroLayout}
          >
            <View style={styles.matchupContainer}>
              <View style={styles.teamBadge}>
                <Text style={styles.sportLabel}>{displayEvent.sport}</Text>
              </View>

              <View style={styles.teamsRow}>
                <Text style={styles.teamAbbr}>
                  {displayEvent.awayTeamAbbr || displayEvent.awayTeamName}
                </Text>
                <Text style={styles.atSymbol}>@</Text>
                <Text style={styles.teamAbbr}>
                  {displayEvent.homeTeamAbbr || displayEvent.homeTeamName}
                </Text>
              </View>
            </View>
          </Reanimated.View>

          {/* Detail metadata — fades in with non-hero content */}
          <Reanimated.View style={contentFadeStyle}>
            <View style={styles.detailMeta}>
              <Text style={styles.teamNames}>
                {displayEvent.awayTeamName} at {displayEvent.homeTeamName}
              </Text>
              <Text style={styles.dateTime}>
                {dateStr} {timeStr}
              </Text>
            </View>
          </Reanimated.View>
        </View>

        {/* ---- Player Props ---- */}
        <Reanimated.View style={contentFadeStyle}>
          <View style={styles.propsSection}>
            {isPropsLoading ? (
              <PropsLoadingState />
            ) : props.length > 0 ? (
              <PlayerPropsSection
                props={props}
                eventId={id!}
                onPropSelect={handlePropSelect}
                selectedPropIds={selectedPropIds}
                disabled={displayEvent.status !== 'SCHEDULED'}
              />
            ) : (
              <View style={styles.noPropsContainer}>
                <Text style={styles.noPropsTitle}>No Player Props Available</Text>
                <Text style={styles.noPropsText}>
                  Player props will appear here when available for this event.
                </Text>
              </View>
            )}
          </View>
        </Reanimated.View>
      </ScrollView>

      <SlipFAB />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: LUXURY_THEME.status.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: LUXURY_THEME.bg.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.subtle,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    color: LUXURY_THEME.gold.main,
    fontSize: 16,
    fontWeight: '500',
  },
  matchupContainer: {
    alignItems: 'center',
  },
  teamBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  sportLabel: {
    color: LUXURY_THEME.gold.main,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamAbbr: {
    color: LUXURY_THEME.text.primary,
    fontSize: 32,
    fontWeight: '700',
  },
  atSymbol: {
    color: LUXURY_THEME.text.muted,
    fontSize: 16,
    marginHorizontal: 16,
  },
  detailMeta: {
    alignItems: 'center',
  },
  teamNames: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
    marginBottom: 4,
  },
  dateTime: {
    color: LUXURY_THEME.text.muted,
    fontSize: 12,
  },
  propsSection: {
    paddingHorizontal: 16,
  },
  propsLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  noPropsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  noPropsTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noPropsText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
