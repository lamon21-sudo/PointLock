// =====================================================
// Match Detail Screen
// =====================================================
// Displays PvP match details with real-time score updates.
// Dynamic route: /match/[id]
//
// Features:
// - Real-time score updates via WebSocket
// - VersusView with side-by-side user comparison
// - LiveTracker showing pick-by-pick status
// - Connection status indicator
// - Opponent presence tracking

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useMatchSocket, useMomentum } from '../../src/hooks';
import { useMatchWithSlips } from '../../src/hooks/useMatchWithSlips';
import { useAuthStore } from '../../src/stores/auth.store';
import { useWalletStore } from '../../src/stores/wallet.store';
import { useToast } from '../../src/contexts/ToastContext';
import { usePickSettlement } from '../../src/hooks/usePickSettlement';
import { VersusView } from '../../src/components/match/VersusView';
import { MatchStatusBadge } from '../../src/components/match/MatchStatusBadge';
import { MatchCompletionModal } from '../../src/components/match/MatchCompletionModal';
import { MomentumBar } from '../../src/components/match/MomentumBar';
import { PickProgressFeed } from '../../src/components/match/PickProgressFeed';
import { GameTimeBadge } from '../../src/components/match/GameTimeBadge';
import type { PickForSettlement, SettlementResult } from '../../src/utils/settlement-helpers';

// =====================================================
// Sub-components
// =====================================================

/**
 * Connection status indicator (green/red dot)
 */
function ConnectionIndicator({
  isConnected,
  isInRoom,
}: {
  isConnected: boolean;
  isInRoom: boolean;
}) {
  const color = isConnected && isInRoom ? '#22c55e' : isConnected ? '#eab308' : '#ef4444';
  const label = isConnected && isInRoom
    ? 'Live'
    : isConnected
    ? 'Connecting...'
    : 'Offline';

  return (
    <View style={styles.connectionIndicator}>
      <View style={[styles.connectionDot, { backgroundColor: color }]} />
      <Text style={[styles.connectionLabel, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * Opponent presence badge
 */
function OpponentBadge({
  isPresent,
  username,
}: {
  isPresent: boolean;
  username?: string;
}) {
  if (!isPresent) {
    return (
      <View style={styles.opponentBadge}>
        <View style={[styles.presenceDot, { backgroundColor: '#6b7280' }]} />
        <Text style={styles.opponentText}>Opponent offline</Text>
      </View>
    );
  }

  return (
    <View style={styles.opponentBadge}>
      <View style={[styles.presenceDot, { backgroundColor: '#22c55e' }]} />
      <Text style={styles.opponentText}>
        {username ? `${username} is watching` : 'Opponent online'}
      </Text>
    </View>
  );
}

/**
 * Loading state
 */
function LoadingState() {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.loadingText}>Loading match...</Text>
    </View>
  );
}

/**
 * Error state
 */
function ErrorState({
  error,
  onRetry,
  onGoBack,
}: {
  error: string;
  onRetry: () => void;
  onGoBack: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorIcon}>{'\u26A0\uFE0F'}</Text>
      <Text style={styles.errorTitle}>Error Loading Match</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <View style={styles.errorButtons}>
        <Pressable style={styles.secondaryButton} onPress={onGoBack}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onRetry}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function MatchDetailScreen() {
  const router = useRouter();
  const { id: matchId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { onMatchSettled } = useWalletStore();
  const { showToast } = useToast();

  // State for completion modal
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const hasShownCompletionRef = useRef(false);
  const initialWasSettledRef = useRef<boolean | null>(null);

  // Combined data fetching hook
  const {
    match,
    creatorSlip,
    opponentSlip,
    isLoading,
    error,
    refetch,
  } = useMatchWithSlips(matchId);

  // WebSocket hook for real-time updates
  const {
    isConnected,
    isInRoom,
    isJoining,
    joinError,
    scores,
    opponentPresence,
    settlementData,
    refresh: refreshSocket,
  } = useMatchSocket({ matchId: matchId || '' });

  // Convert slip picks to settlement format
  const picksForSettlement = useMemo((): PickForSettlement[] => {
    if (!creatorSlip?.picks) return [];

    const isCreator = match?.creatorId === user?.id;
    const userSlip = isCreator ? creatorSlip : opponentSlip;

    if (!userSlip?.picks) return [];

    return userSlip.picks.map((pick: any) => ({
      id: pick.id,
      sportsEventId: pick.sportsEventId,
      pickType: pick.pickType,
      selection: pick.selection,
      line: pick.line,
      pointValue: pick.pointValue,
      status: pick.status,
      event: pick.event,
    }));
  }, [creatorSlip, opponentSlip, match?.creatorId, user?.id]);

  // Handle pick settlement callback
  const handlePickSettled = useCallback(
    (result: SettlementResult) => {
      const toastType =
        result.status === 'HIT'
          ? 'pick_hit'
          : result.status === 'MISS'
          ? 'pick_miss'
          : 'pick_push';

      const toastTitle =
        result.status === 'HIT'
          ? 'Pick Hit!'
          : result.status === 'MISS'
          ? 'Pick Missed'
          : 'Push';

      showToast({
        type: toastType,
        title: toastTitle,
        message: `${result.pickDetails.teamName} - ${result.pickDetails.pickType}`,
      });
    },
    [showToast]
  );

  // Pick settlement detection hook
  usePickSettlement({
    matchId: matchId || '',
    picks: picksForSettlement,
    scores,
    onPickSettled: handlePickSettled,
    enabled: !!matchId && picksForSettlement.length > 0,
  });

  // Track initial settled state (to prevent modal on page load if already settled)
  useEffect(() => {
    if (match && initialWasSettledRef.current === null) {
      initialWasSettledRef.current = match.status === 'settled';
    }
  }, [match]);

  // Detect match completion from WebSocket event (immediate)
  useEffect(() => {
    if (
      settlementData &&
      !hasShownCompletionRef.current &&
      initialWasSettledRef.current === false
    ) {
      hasShownCompletionRef.current = true;

      // Refetch match data to get complete settlement details
      refetch();

      // Small delay for dramatic effect
      setTimeout(() => setShowCompletionModal(true), 300);
    }
  }, [settlementData, refetch]);

  // Fallback: Detect match completion from API poll
  useEffect(() => {
    if (
      match?.status === 'settled' &&
      !hasShownCompletionRef.current &&
      initialWasSettledRef.current === false
    ) {
      hasShownCompletionRef.current = true;
      // Small delay for dramatic effect
      setTimeout(() => setShowCompletionModal(true), 500);
    }
  }, [match?.status]);

  // Trigger wallet refresh on match settlement
  useEffect(() => {
    if (match?.status === 'settled') {
      onMatchSettled(match.id);
    }
  }, [match?.status, match?.id, onMatchSettled]);

  // Determine if any events are live
  const hasLiveEvents = useMemo(() => {
    return Array.from(scores.values()).some((score) => score.status === 'LIVE');
  }, [scores]);

  // Extract game time from the first live event
  const liveGameTime = useMemo(() => {
    for (const score of scores.values()) {
      if (score.status === 'LIVE' && score.gameTime) {
        return score.gameTime;
      }
    }
    return undefined;
  }, [scores]);

  // Determine which slip belongs to user vs opponent
  const isCreator = match?.creatorId === user?.id;
  const userSlip = isCreator ? creatorSlip : opponentSlip;
  const opponentSlipData = isCreator ? opponentSlip : creatorSlip;
  const userPoints = isCreator ? (match?.creatorPoints ?? 0) : (match?.opponentPoints ?? 0);
  const opponentPoints = isCreator ? (match?.opponentPoints ?? 0) : (match?.creatorPoints ?? 0);

  // Compute momentum for the MomentumBar
  const momentum = useMomentum({
    userPicks: userSlip?.picks || [],
    opponentPicks: opponentSlipData?.picks || [],
    currentUserId: user?.id || '',
    userPoints,
    opponentPoints,
  });

  // Get opponent display name
  const opponentDisplayName = useMemo(() => {
    if (isCreator) {
      return match?.opponent?.displayName || match?.opponent?.username || 'Opponent';
    }
    return match?.creator?.displayName || match?.creator?.username || 'Opponent';
  }, [isCreator, match?.opponent, match?.creator]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetch(), refreshSocket()]);
  }, [refetch, refreshSocket]);

  // Navigation handlers
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Modal handlers
  const handleDismissCompletionModal = useCallback(() => {
    setShowCompletionModal(false);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setShowCompletionModal(false);
    // Navigate to create new challenge
    router.push('/challenge/create' as any);
  }, [router]);

  const handleBackToHome = useCallback(() => {
    setShowCompletionModal(false);
    router.replace('/');
  }, [router]);

  // =====================================================
  // Render
  // =====================================================

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: 'Match Details',
            headerRight: () => null,
          }}
        />
        <LoadingState />
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Match Details' }} />
        <ErrorState
          error={error || 'Match not found'}
          onRetry={refetch}
          onGoBack={handleGoBack}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Match Details',
          headerRight: () => (
            <ConnectionIndicator isConnected={isConnected} isInRoom={isInRoom} />
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
      >
        {/* Match Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View style={styles.matchInfo}>
              <MatchStatusBadge
                status={match.status}
                hasLiveEvents={hasLiveEvents}
                size="md"
              />
              {hasLiveEvents && liveGameTime && (
                <GameTimeBadge gameTime={liveGameTime} status="LIVE" size="md" />
              )}
              <Text style={styles.matchType}>
                {match.type === 'public' ? 'Public Match' : 'Private Match'}
              </Text>
            </View>

            {/* Opponent Presence (only show for active matches) */}
            {match.status === 'active' && match.opponent && (
              <OpponentBadge
                isPresent={opponentPresence.isPresent}
                username={opponentPresence.username}
              />
            )}
          </View>
        </View>

        {/* Socket Join Error */}
        {joinError && (
          <View style={styles.joinErrorBanner}>
            <Text style={styles.joinErrorText}>{joinError}</Text>
            <Pressable onPress={refreshSocket} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Socket Joining Indicator */}
        {isJoining && (
          <View style={styles.joiningBanner}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.joiningText}>Connecting to live updates...</Text>
          </View>
        )}

        {/* Versus View */}
        <View style={styles.versusSection}>
          <VersusView
            match={match}
            currentUserId={user?.id || ''}
            liveScores={scores}
            creatorSlip={creatorSlip}
            opponentSlip={opponentSlip}
          />
        </View>

        {/* Momentum Bar (active matches only) */}
        {match.status === 'active' && (
          <View style={styles.momentumSection}>
            <MomentumBar
              momentumScore={momentum.score}
              label={momentum.label}
              yourPoints={userPoints}
              opponentPoints={opponentPoints}
            />
          </View>
        )}

        {/* Pick Progress Feed (active matches only) */}
        {match.status === 'active' && userSlip && opponentSlipData && (
          <View style={styles.feedSection}>
            <PickProgressFeed
              userPicks={userSlip.picks || []}
              opponentPicks={opponentSlipData.picks || []}
              currentUserId={user?.id || ''}
              userName="You"
              opponentName={opponentDisplayName}
              liveScores={scores}
            />
          </View>
        )}

        {/* Match Details Footer */}
        {match.status === 'settled' && match.winnerId && (
          <View style={styles.settlementSection}>
            <View style={styles.settlementCard}>
              <Text style={styles.settlementLabel}>Winner Payout</Text>
              <Text style={styles.settlementValue}>
                {match.winnerPayout?.toLocaleString() ?? 0} RC
              </Text>
              {match.rakeAmount && (
                <Text style={styles.rakeText}>
                  ({match.rakePercentage}% rake: {match.rakeAmount.toLocaleString()} RC)
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Match Completion Modal */}
      <MatchCompletionModal
        visible={showCompletionModal}
        match={{
          id: match.id,
          status: match.status,
          creatorId: match.creatorId,
          opponentId: match.opponentId,
          winnerId: match.winnerId,
          creatorPoints: match.creatorPoints ?? 0,
          opponentPoints: match.opponentPoints ?? 0,
          stakeAmount: match.stakeAmount,
          totalPot: match.totalPot,
          winnerPayout: match.winnerPayout,
          rakeAmount: match.rakeAmount,
          settlementReason: match.settlementReason,
        }}
        currentUserId={user?.id || ''}
        creator={match.creator}
        opponent={match.opponent}
        creatorSlip={
          creatorSlip
            ? {
                totalPicks: creatorSlip.totalPicks,
                correctPicks: creatorSlip.correctPicks,
                pointsEarned: creatorSlip.pointsEarned,
                pointPotential: creatorSlip.pointPotential,
              }
            : null
        }
        opponentSlip={
          opponentSlip
            ? {
                totalPicks: opponentSlip.totalPicks,
                correctPicks: opponentSlip.correctPicks,
                pointsEarned: opponentSlip.pointsEarned,
                pointPotential: opponentSlip.pointPotential,
              }
            : null
        }
        onDismiss={handleDismissCompletionModal}
        onPlayAgain={handlePlayAgain}
        onBackToHome={handleBackToHome}
      />
    </SafeAreaView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Connection Indicator
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Opponent Badge
  opponentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  opponentText: {
    color: '#9ca3af',
    fontSize: 13,
  },

  // Header Section
  headerSection: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  matchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  matchType: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },

  // Join Error Banner
  joinErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  joinErrorText: {
    color: '#ef4444',
    fontSize: 13,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    marginLeft: 12,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Joining Banner
  joiningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  joiningText: {
    color: '#3b82f6',
    fontSize: 13,
  },

  // Versus Section
  versusSection: {
    paddingHorizontal: 16,
  },

  // Momentum Section
  momentumSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },

  // Feed Section
  feedSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },

  // Settlement Section
  settlementSection: {
    padding: 16,
    marginTop: 8,
  },
  settlementCard: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  settlementLabel: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  settlementValue: {
    color: '#22c55e',
    fontSize: 28,
    fontWeight: '800',
  },
  rakeText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },

  // Center Container (Loading/Error)
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 15,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  secondaryButtonText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
});
