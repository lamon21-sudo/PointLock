// =====================================================
// Ranked Screen
// =====================================================
// Main ranked/season screen displaying rank progress, placements, and rewards.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/auth.store';
import { useRanked } from '../../src/hooks/useRanked';
import {
  SeasonInfoCard,
  RankBadge,
  RPProgressBar,
  PlacementProgress,
  RewardsTrack,
} from '../../src/components/ranked';
import { GoldButton } from '../../src/components/ui/GoldButton';
import { LUXURY_THEME } from '../../src/constants/theme';

// =====================================================
// Loading Skeleton Component
// =====================================================

function RankedScreenSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {/* Season card skeleton */}
      <View style={styles.skeletonCard}>
        <View style={styles.skeletonHeader}>
          <View style={[styles.skeletonBox, { width: 120, height: 24 }]} />
          <View style={[styles.skeletonBox, { width: 60, height: 20 }]} />
        </View>
        <View style={[styles.skeletonBox, { width: 160, height: 40, alignSelf: 'center', marginTop: 16 }]} />
      </View>

      {/* Rank section skeleton */}
      <View style={styles.skeletonCard}>
        <View style={[styles.skeletonCircle, { alignSelf: 'center' }]} />
        <View style={[styles.skeletonBox, { width: 100, height: 16, alignSelf: 'center', marginTop: 12 }]} />
        <View style={[styles.skeletonBox, { width: '100%', height: 12, marginTop: 20 }]} />
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonBox, { width: 60, height: 14 }]} />
          <View style={[styles.skeletonBox, { width: 100, height: 14 }]} />
        </View>
      </View>

      {/* Rewards skeleton */}
      <View style={styles.skeletonRewards}>
        <View style={[styles.skeletonBox, { width: 120, height: 14, marginBottom: 16 }]} />
        <View style={styles.skeletonRewardsRow}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRewardCard} />
          ))}
        </View>
      </View>
    </View>
  );
}

// =====================================================
// Empty State Component
// =====================================================

function NoSeasonState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🏆</Text>
      <Text style={styles.emptyTitle}>No Active Season</Text>
      <Text style={styles.emptyText}>
        Check back soon for the next ranked season!
      </Text>
    </View>
  );
}

// =====================================================
// Error State Component
// =====================================================

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={48} color={LUXURY_THEME.status.error} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{message}</Text>
      <GoldButton
        onPress={onRetry}
        variant="outline"
        size="md"
        style={styles.retryButton}
      >
        Try Again
      </GoldButton>
    </View>
  );
}

// =====================================================
// Guest State Component
// =====================================================

function GuestState() {
  return (
    <View style={styles.guestContainer}>
      <Text style={styles.guestIcon}>🎮</Text>
      <Text style={styles.guestTitle}>Sign in to compete</Text>
      <Text style={styles.guestText}>
        Log in or create an account to participate in ranked seasons.
      </Text>
      <GoldButton
        onPress={() => router.push('/login')}
        variant="solid"
        size="lg"
        style={styles.signInButton}
      >
        Sign In
      </GoldButton>
    </View>
  );
}

// =====================================================
// Quick Stats Component
// =====================================================

interface QuickStatsProps {
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

function QuickStats({ wins, losses, draws, winRate }: QuickStatsProps) {
  return (
    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{wins}</Text>
        <Text style={styles.statLabel}>W</Text>
      </View>
      <Text style={styles.statDivider}>-</Text>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{losses}</Text>
        <Text style={styles.statLabel}>L</Text>
      </View>
      {draws > 0 && (
        <>
          <Text style={styles.statDivider}>-</Text>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{draws}</Text>
            <Text style={styles.statLabel}>D</Text>
          </View>
        </>
      )}
      <View style={styles.winRateContainer}>
        <Text style={styles.winRateValue}>{winRate.toFixed(0)}%</Text>
        <Text style={styles.winRateLabel}>WIN RATE</Text>
      </View>
    </View>
  );
}

// =====================================================
// Main Screen Component
// =====================================================

export default function RankedScreen() {
  const { isAuthenticated, isInitialized } = useAuthStore();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const {
    season,
    placement,
    progress,
    rewards,
    isLoading,
    isRefreshing,
    isClaiming,
    error,
    refresh,
    claimReward,
    isInPlacement,
    isPlaced,
    hasActiveSeason,
  } = useRanked();

  // Claim reward handler
  const handleClaimReward = useCallback(
    async (rewardId: string) => {
      setClaimingId(rewardId);
      await claimReward(rewardId);
      setClaimingId(null);
    },
    [claimReward]
  );

  // Build match results array for PlacementProgress
  const matchResults = placement?.matches?.map((m) => m.outcome) ?? [];

  // =====================================================
  // Render States
  // =====================================================

  // Auth initializing
  if (!isInitialized) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={LUXURY_THEME.gold.brushed} />
        </View>
      </SafeAreaView>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <GuestState />
      </SafeAreaView>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <RankedScreenSkeleton />
      </SafeAreaView>
    );
  }

  // Error
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ErrorState message={error} onRetry={refresh} />
      </SafeAreaView>
    );
  }

  // No active season
  if (!hasActiveSeason || !season) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <NoSeasonState />
      </SafeAreaView>
    );
  }

  // =====================================================
  // Main Content
  // =====================================================

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={LUXURY_THEME.gold.brushed}
            colors={[LUXURY_THEME.gold.brushed]}
          />
        }
      >
        {/* Season Info */}
        <SeasonInfoCard
          name={season.name}
          endDate={season.endDate}
          status={season.status}
        />

        {/* Placement Phase UI */}
        {isInPlacement && placement && (
          <View style={styles.section}>
            <PlacementProgress
              completed={placement.placementMatchesPlayed}
              total={10}
              wins={placement.placementMatchesWon}
              losses={
                placement.placementMatchesPlayed -
                placement.placementMatchesWon -
                (matchResults.filter((r) => r === 'DRAW').length)
              }
              draws={matchResults.filter((r) => r === 'DRAW').length}
              matchResults={matchResults}
            />
          </View>
        )}

        {/* Ranked UI (after placement) */}
        {isPlaced && progress && progress.currentRank && (
          <>
            {/* Rank Badge */}
            <View style={styles.rankSection}>
              <RankBadge
                rank={progress.currentRank}
                size="hero"
                showLabel
                animated
              />
            </View>

            {/* RP Progress */}
            <View style={styles.section}>
              <RPProgressBar
                currentRP={progress.rankPoints}
                currentRank={progress.currentRank}
                animated
              />
            </View>

            {/* Quick Stats */}
            <View style={styles.section}>
              <QuickStats
                wins={progress.wins}
                losses={progress.losses}
                draws={progress.draws}
                winRate={progress.winRate}
              />
            </View>
          </>
        )}

        {/* Rewards Track (only show if placed) */}
        {isPlaced && rewards.length > 0 && (
          <RewardsTrack
            rewards={rewards}
            onClaim={handleClaimReward}
            isClaiming={isClaiming}
            claimingId={claimingId}
          />
        )}

        {/* Play Ranked CTA */}
        <View style={styles.ctaSection}>
          <GoldButton
            onPress={() => router.push('/queue/waiting')}
            variant="metallic"
            size="lg"
          >
            {isInPlacement ? 'CONTINUE PLACEMENTS' : 'FIND RANKED MATCH'}
          </GoldButton>
        </View>

        {/* Bottom spacer for tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    marginTop: 24,
  },
  rankSection: {
    marginTop: 32,
    alignItems: 'center',
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    marginTop: 2,
  },
  statDivider: {
    fontSize: 20,
    fontWeight: '300',
    color: LUXURY_THEME.text.muted,
  },
  winRateContainer: {
    marginLeft: 24,
    paddingLeft: 24,
    borderLeftWidth: 1,
    borderLeftColor: LUXURY_THEME.border.muted,
    alignItems: 'center',
  },
  winRateValue: {
    fontSize: 24,
    fontWeight: '700',
    color: LUXURY_THEME.gold.brushed,
  },
  winRateLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 1,
    marginTop: 2,
  },

  // CTA
  ctaSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 100,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
  },

  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    minWidth: 140,
  },

  // Guest state
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  guestIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  guestText: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  signInButton: {
    minWidth: 160,
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  skeletonCard: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonBox: {
    backgroundColor: LUXURY_THEME.surface.elevated,
    borderRadius: 8,
  },
  skeletonCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: LUXURY_THEME.surface.elevated,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  skeletonRewards: {
    marginTop: 24,
  },
  skeletonRewardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonRewardCard: {
    width: 140,
    height: 160,
    borderRadius: 16,
    backgroundColor: LUXURY_THEME.surface.card,
  },
});
