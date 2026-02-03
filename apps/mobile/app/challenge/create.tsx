// =====================================================
// Challenge Creation Screen
// =====================================================
// Allows users to create a PVP challenge with their locked slip.
// Implements Task 6.3: Stake Selection UI.

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Match, MatchType } from '@pick-rivals/shared-types';

import { useWallet } from '../../src/hooks/useWallet';
import {
  StakeAmountSelector,
  MatchTypeSelector,
  ChallengePreview,
  InviteShareModal,
} from '../../src/components/challenge';
import { Button } from '../../src/components/ui/Button';
import { validateStakeAmount } from '../../src/utils/validation';
import { MatchService } from '../../src/services/match.service';
import { getSlipById, ApiSlipResponse } from '../../src/services/slip.service';

// =====================================================
// Main Component
// =====================================================

/**
 * Challenge Creation Screen
 *
 * Flow:
 * 1. User arrives from slip review success state with slipId param
 * 2. User selects match type (public/private)
 * 3. User selects stake amount (presets or custom)
 * 4. User reviews challenge preview
 * 5. User submits to create match
 * 6. Navigate to matches tab on success
 *
 * Features:
 * - Real-time stake validation
 * - Balance checking
 * - Challenge preview with calculations
 * - Error handling with user-friendly messages
 */
export default function ChallengeCreateScreen() {
  const router = useRouter();
  const { slipId } = useLocalSearchParams<{ slipId: string }>();
  const { balance, refreshBalance } = useWallet();

  // Form state
  const [stakeAmount, setStakeAmount] = useState(0);
  const [matchType, setMatchType] = useState<MatchType>('public');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success state - match and slip details for invite modal
  const [createdMatch, setCreatedMatch] = useState<Match | null>(null);
  const [slipDetails, setSlipDetails] = useState<ApiSlipResponse | null>(null);

  // Validation
  const validationResult = useMemo(
    () => validateStakeAmount(stakeAmount, balance.total),
    [stakeAmount, balance.total]
  );

  const canSubmit =
    validationResult.isValid && !isSubmitting && stakeAmount > 0 && !!slipId;

  // Handle stake amount change
  const handleStakeChange = useCallback((amount: number) => {
    setStakeAmount(amount);
    setSubmitError(null); // Clear error when user changes input
  }, []);

  // Handle match type change
  const handleMatchTypeChange = useCallback((type: MatchType) => {
    setMatchType(type);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !slipId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Create match via API
      const match = await MatchService.createMatch({
        slipId,
        stakeAmount,
        type: matchType,
      });

      // Refresh wallet to sync actual balance
      await refreshBalance();

      // Fetch slip details to show in invite modal
      const slip = await getSlipById(slipId);

      // Show invite share modal instead of immediate navigation
      setCreatedMatch(match);
      setSlipDetails(slip);
      setIsSubmitting(false);
    } catch (error: any) {
      // Handle errors
      const errorMessage = error.message || 'Failed to create challenge';
      setSubmitError(errorMessage);
      setIsSubmitting(false);
    }
  }, [canSubmit, slipId, stakeAmount, matchType, refreshBalance]);

  // Handle closing the invite modal and navigating to matches
  const handleCloseInviteModal = useCallback(() => {
    if (!createdMatch) return;

    const matchId = createdMatch.id;
    setCreatedMatch(null);
    setSlipDetails(null);

    router.replace({
      pathname: '/(tabs)/matches',
      params: { highlightMatchId: matchId },
    });
  }, [createdMatch, router]);

  // Handle cancel/back
  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // Missing slip ID - shouldn't happen but handle gracefully
  if (!slipId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>No Slip Selected</Text>
          <Text style={styles.errorMessage}>
            Please create and lock a slip first.
          </Text>
          <Pressable style={styles.backButton} onPress={handleCancel}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Slip ID Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Slip</Text>
          <View style={styles.slipIdCard}>
            <Text style={styles.slipIdLabel}>Slip ID</Text>
            <Text style={styles.slipIdValue}>{slipId.slice(0, 8)}...</Text>
          </View>
        </View>

        {/* Match Type Section */}
        <View style={styles.section}>
          <MatchTypeSelector value={matchType} onChange={handleMatchTypeChange} />
        </View>

        {/* Stake Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stake Amount</Text>
          <StakeAmountSelector
            value={stakeAmount}
            onChange={handleStakeChange}
            balance={balance.total}
            disabled={isSubmitting}
          />
        </View>

        {/* Challenge Preview - Only show when stake > 0 */}
        {stakeAmount > 0 && (
          <View style={styles.section}>
            <ChallengePreview stakeAmount={stakeAmount} matchType={matchType} />
          </View>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Error Banner */}
      {submitError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{submitError}</Text>
          <Pressable onPress={() => setSubmitError(null)} hitSlop={8}>
            <Text style={styles.errorDismiss}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* Submit Button Footer */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          disabled={!canSubmit}
          isLoading={isSubmitting}
        >
          {isSubmitting ? 'Creating Challenge...' : 'Create Challenge'}
        </Button>
      </View>

      {/* Invite Share Modal - Shows after successful challenge creation */}
      {createdMatch && slipDetails && (
        <InviteShareModal
          visible={!!createdMatch}
          match={createdMatch}
          slipSummary={{
            picks: slipDetails.picks.map(pick => ({
              id: pick.id,
              sportsEventId: pick.sportsEventId,
              pickType: pick.pickType as any,
              selection: pick.selection,
              line: pick.line,
              odds: pick.odds,
              pointValue: pick.pointValue,
              coinCost: (pick as any).coinCost ?? 0,
              tier: (pick as any).tier ?? 1,
              eventInfo: {
                homeTeamName: pick.event.homeTeamName,
                homeTeamAbbr: pick.event.homeTeamAbbr || undefined,
                awayTeamName: pick.event.awayTeamName,
                awayTeamAbbr: pick.event.awayTeamAbbr || undefined,
                scheduledAt: pick.event.scheduledAt,
                sport: pick.event.sport,
                league: pick.event.league,
              },
            })),
            pointPotential: slipDetails.pointPotential,
          }}
          onClose={handleCloseInviteModal}
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
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100, // Space for footer
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },

  // Slip ID Card
  slipIdCard: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  slipIdLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 6,
  },
  slipIdValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'monospace',
  },

  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 20,
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
  backButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
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
    lineHeight: 20,
  },
  errorDismiss: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
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
    paddingBottom: 24,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 20,
  },
});
