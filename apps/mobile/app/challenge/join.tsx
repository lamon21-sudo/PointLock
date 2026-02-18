// =====================================================
// Challenge Join Screen
// =====================================================
// Deep link destination for accepting challenges with inline slip builder.
// Allows users to view challenge details and build their slip to join.

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MatchWithDetails } from '@pick-rivals/shared-types';

import { MatchService } from '../../src/services/match.service';
import { createAndLockSlip } from '../../src/services/slip.service';
import { useWallet } from '../../src/hooks/useWallet';
import { mapDraftPicksToPayload } from '../../src/utils/slip-mapper';
import { DraftPick, SLIP_MAX_PICKS } from '../../src/types/slip.types';
import { WarningIcon, XCircleIcon, XIcon } from 'phosphor-react-native';
import { PickItem } from '../../src/components/slip/PickItem';
import { BettingEventCard } from '../../src/components/betting/BettingEventCard';
import { useEvents } from '../../src/hooks/useEvents';

// =====================================================
// Main Component
// =====================================================

export default function ChallengeJoinScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { balance, refreshBalance } = useWallet();
  const {
    events,
    isLoading: isLoadingEvents,
    isRefreshing,
    refresh: refreshEvents,
  } = useEvents();

  // Match details state
  const [matchDetails, setMatchDetails] = useState<MatchWithDetails | null>(null);
  const [isLoadingMatch, setIsLoadingMatch] = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Draft picks state (local slip builder)
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sport filter
  const [sportFilter, setSportFilter] = useState<'ALL' | 'NFL' | 'NBA'>('ALL');

  // Calculate point potential
  const pointPotential = useMemo(
    () => draftPicks.reduce((sum, pick) => sum + pick.pointValue, 0),
    [draftPicks]
  );

  // Filter events by sport
  const filteredEvents = useMemo(() => {
    if (sportFilter === 'ALL') return events;
    return events.filter((event) => event.league === sportFilter);
  }, [events, sportFilter]);

  // Fetch match details on mount
  useEffect(() => {
    if (!code) return;

    const fetchMatchDetails = async () => {
      setIsLoadingMatch(true);
      setMatchError(null);

      try {
        const match = await MatchService.getMatchByInviteCode(code);
        setMatchDetails(match);
      } catch (error: any) {
        setMatchError(error.message || 'Failed to load challenge details');
      } finally {
        setIsLoadingMatch(false);
      }
    };

    fetchMatchDetails();
  }, [code]);

  // Handle adding a pick
  const handleAddPick = useCallback(
    (pick: DraftPick) => {
      // Check if already at max picks
      if (draftPicks.length >= SLIP_MAX_PICKS) {
        setSubmitError(`Maximum ${SLIP_MAX_PICKS} picks allowed`);
        return;
      }

      // Check for duplicate event
      const hasDuplicateEvent = draftPicks.some(
        (p) => p.sportsEventId === pick.sportsEventId
      );
      if (hasDuplicateEvent) {
        // Replace existing pick for this event
        setDraftPicks((prev) =>
          prev.map((p) => (p.sportsEventId === pick.sportsEventId ? pick : p))
        );
      } else {
        // Add new pick
        setDraftPicks((prev) => [...prev, pick]);
      }

      setSubmitError(null);
    },
    [draftPicks]
  );

  // Handle removing a pick
  const handleRemovePick = useCallback((pickId: string) => {
    setDraftPicks((prev) => prev.filter((p) => p.id !== pickId));
    setSubmitError(null);
  }, []);

  // Check if user can join
  const canJoin = useMemo(() => {
    if (!matchDetails) return false;
    if (draftPicks.length === 0) return false;
    if (isSubmitting) return false;
    if (balance.total < matchDetails.stakeAmount) return false;
    return true;
  }, [matchDetails, draftPicks, isSubmitting, balance.total]);

  // Handle joining the challenge
  const handleJoin = useCallback(async () => {
    if (!canJoin || !matchDetails) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Create and lock slip from picks
      const slipPayload = mapDraftPicksToPayload(draftPicks);
      const result = await createAndLockSlip(slipPayload);

      if (!result.success || !result.slip) {
        throw new Error(result.error?.message || 'Failed to create slip');
      }

      // 2. Join match with slip
      await MatchService.joinMatch(matchDetails.id, { slipId: result.slip.id });

      // 3. Refresh balance
      await refreshBalance();

      // 4. Navigate to matches tab with highlight
      router.replace({
        pathname: '/(tabs)/matches',
        params: { highlightMatchId: matchDetails.id },
      });
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to join challenge');
      setIsSubmitting(false);
    }
  }, [canJoin, matchDetails, draftPicks, refreshBalance, router]);

  // Handle pull-to-refresh
  const handleRefresh = useCallback(() => {
    refreshEvents();
  }, [refreshEvents]);

  // Invalid invite code
  if (!code) {
    return (
      <>
        <Stack.Screen options={{ title: 'Invalid Invite' }} />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.errorContainer}>
            <WarningIcon size={64} color="#f59e0b" weight="duotone" style={{ marginBottom: 20 }} />
            <Text style={styles.errorTitle}>Invalid Invite Link</Text>
            <Text style={styles.errorMessage}>
              This invite link is not valid. Please check the link and try again.
            </Text>
            <Pressable style={styles.actionButton} onPress={() => router.back()}>
              <Text style={styles.actionButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Loading match details
  if (isLoadingMatch) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading Challenge...' }} />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Loading challenge details...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Error loading match
  if (matchError || !matchDetails) {
    return (
      <>
        <Stack.Screen options={{ title: 'Challenge Error' }} />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.errorContainer}>
            <XCircleIcon size={64} color="#ef4444" weight="duotone" style={{ marginBottom: 20 }} />
            <Text style={styles.errorTitle}>
              {matchError?.includes('expired')
                ? 'Invite Expired'
                : matchError?.includes('full')
                ? 'Challenge Full'
                : 'Challenge Not Found'}
            </Text>
            <Text style={styles.errorMessage}>
              {matchError || 'This challenge could not be loaded'}
            </Text>
            <Pressable style={styles.actionButton} onPress={() => router.replace('/(tabs)/matches')}>
              <Text style={styles.actionButtonText}>Browse Matches</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Join Challenge',
          headerStyle: { backgroundColor: '#0f0f23' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#6366f1" />
          }
        >
          {/* Match Details Card */}
          <View style={styles.matchCard}>
            <View style={styles.matchHeader}>
              <Text style={styles.matchTitle}>Challenge from</Text>
              <Text style={styles.creatorName}>{matchDetails.creator.username}</Text>
            </View>

            <View style={styles.matchDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Stake</Text>
                <Text style={styles.detailValue}>{matchDetails.stakeAmount.toLocaleString()} RC</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <View style={[styles.typeBadge, matchDetails.type === 'public' && styles.typeBadgePublic]}>
                  <Text style={styles.typeBadgeText}>
                    {matchDetails.type === 'public' ? 'Public' : 'Private'}
                  </Text>
                </View>
              </View>
              {matchDetails.inviteExpiresAt && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Expires</Text>
                  <Text style={styles.detailValue}>
                    {new Date(matchDetails.inviteExpiresAt).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Your Picks Section */}
          {draftPicks.length > 0 && (
            <View style={styles.picksSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Picks ({draftPicks.length})</Text>
                <Text style={styles.pointsText}>{pointPotential} pts</Text>
              </View>
              {draftPicks.map((pick) => (
                <View key={pick.id} style={styles.pickItem}>
                  <PickItem pick={pick} onRemove={() => handleRemovePick(pick.id)} showRemove />
                </View>
              ))}
            </View>
          )}

          {/* Sport Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Select Events</Text>
            <View style={styles.filterButtons}>
              {(['ALL', 'NFL', 'NBA'] as const).map((sport) => (
                <Pressable
                  key={sport}
                  style={[styles.filterButton, sportFilter === sport && styles.filterButtonActive]}
                  onPress={() => setSportFilter(sport)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      sportFilter === sport && styles.filterButtonTextActive,
                    ]}
                  >
                    {sport}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Events List */}
          <View style={styles.eventsSection}>
            {isLoadingEvents ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#6366f1" />
                <Text style={styles.loadingText}>Loading events...</Text>
              </View>
            ) : filteredEvents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No events available</Text>
              </View>
            ) : (
              <FlatList
                data={filteredEvents}
                renderItem={({ item }) => (
                  <BettingEventCard
                    event={item}
                    existingPicks={draftPicks}
                    onPickSelect={handleAddPick}
                    onPickRemove={handleRemovePick}
                    disabled={isSubmitting}
                  />
                )}
                keyExtractor={(item) => item.id}
                ItemSeparatorComponent={() => <View style={styles.eventSeparator} />}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* Bottom spacing for footer */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Error Banner */}
        {submitError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} hitSlop={8}>
              <XIcon size={18} color="#ffffff" weight="bold" />
            </Pressable>
          </View>
        )}

        {/* Join Button Footer */}
        <View style={styles.footer}>
          {/* Balance Warning */}
          {matchDetails && balance.total < matchDetails.stakeAmount && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                Insufficient balance. Required: {matchDetails.stakeAmount.toLocaleString()} RC,
                Available: {balance.total.toLocaleString()} RC
              </Text>
            </View>
          )}

          {/* Pick Count */}
          <View style={styles.pickCountRow}>
            <Text style={styles.pickCountText}>
              {draftPicks.length}/{SLIP_MAX_PICKS} picks
            </Text>
            <Text style={styles.pointPotentialText}>{pointPotential} point potential</Text>
          </View>

          {/* Join Button */}
          <Pressable
            style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]}
            onPress={handleJoin}
            disabled={!canJoin}
          >
            {isSubmitting ? (
              <View style={styles.submittingContent}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.joinButtonText}>Joining...</Text>
              </View>
            ) : (
              <Text style={styles.joinButtonText}>
                {draftPicks.length === 0
                  ? 'Add picks to join'
                  : balance.total < (matchDetails?.stakeAmount || 0)
                  ? 'Insufficient balance'
                  : 'Join Challenge'}
              </Text>
            )}
          </Pressable>
        </View>
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
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 200, // Space for footer
  },

  // Loading/Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  actionButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },

  // Match Details Card
  matchCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  matchHeader: {
    marginBottom: 16,
  },
  matchTitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 4,
  },
  creatorName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  matchDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: '#2a2a3e',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgePublic: {
    backgroundColor: '#6366f1',
  },
  typeBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Picks Section
  picksSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  pointsText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  pickItem: {
    marginBottom: 8,
  },

  // Filter Section
  filterSection: {
    marginBottom: 20,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterButton: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  filterButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  filterButtonText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },

  // Events Section
  eventsSection: {
    marginBottom: 20,
  },
  eventSeparator: {
    height: 12,
  },

  // Error Banner
  errorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  errorBannerText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
  errorDismiss: {
    paddingLeft: 12,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    padding: 16,
    paddingBottom: 32,
  },
  warningBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 13,
    textAlign: 'center',
  },
  pickCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickCountText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  pointPotentialText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  joinButtonDisabled: {
    backgroundColor: '#2a2a3e',
    shadowOpacity: 0,
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  submittingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  bottomSpacer: {
    height: 40,
  },
});
