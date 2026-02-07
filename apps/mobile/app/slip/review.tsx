// =====================================================
// Slip Review Screen
// =====================================================
// Shows current picks and allows submission via confirmation modal.
// Implements Task 5.2: Slip Submission Flow.

import { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import {
  useSlipStore,
  useSlipStoreHydration,
  usePointPotential,
  usePicksCount,
} from '../../src/stores/slip.store';
import { DraftPick, SLIP_MAX_PICKS } from '../../src/types/slip.types';
import { PickItem, ConfirmationModal } from '../../src/components/slip';
import {
  mapDraftPicksToPayload,
  validatePicksForSubmission,
  getPickValidationError,
} from '../../src/utils/slip-mapper';
import { createAndLockSlip } from '../../src/services/slip.service';
import { TEST_IDS } from '../../src/constants/testIds';

// =====================================================
// Main Component
// =====================================================

/**
 * SlipReview Screen
 *
 * Features:
 * - List of current picks with remove option
 * - Point potential summary
 * - Clear all action
 * - Lock slip with confirmation modal
 * - Success state with slip ID
 * - Navigation to challenge creation
 */
export default function SlipReviewScreen() {
  const router = useRouter();
  const isHydrated = useSlipStoreHydration();
  const picksCount = usePicksCount();
  const pointPotential = usePointPotential();

  // Store state
  const picks = useSlipStore((s) => s.picks);
  const removePick = useSlipStore((s) => s.removePick);
  const clearSlip = useSlipStore((s) => s.clearSlip);
  const isSubmitting = useSlipStore((s) => s.isSubmitting);
  const submittedSlipId = useSlipStore((s) => s.submittedSlipId);
  const submitError = useSlipStore((s) => s.submitError);
  const setSubmitting = useSlipStore((s) => s.setSubmitting);
  const setSubmissionSuccess = useSlipStore((s) => s.setSubmissionSuccess);
  const setSubmissionError = useSlipStore((s) => s.setSubmissionError);
  const clearSubmissionState = useSlipStore((s) => s.clearSubmissionState);

  // Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Per-pick validation - check for stale/invalid picks
  const pickValidationMap = useMemo(() => {
    const map = new Map<string, string>();
    picks.forEach((pick) => {
      const error = getPickValidationError(pick);
      if (error) {
        map.set(pick.id, error);
      }
    });
    return map;
  }, [picks]);

  // Check if any picks are invalid
  const hasInvalidPicks = pickValidationMap.size > 0;

  // Handle opening the confirmation modal
  const handleLockPress = useCallback(() => {
    // Validate picks before showing modal
    const errors = validatePicksForSubmission(picks);
    if (errors.length > 0) {
      setSubmissionError(errors[0]);
      return;
    }
    setIsModalVisible(true);
  }, [picks, setSubmissionError]);

  // Handle cancel from modal
  const handleCancel = useCallback(() => {
    if (!isSubmitting) {
      setIsModalVisible(false);
    }
  }, [isSubmitting]);

  // Handle confirm submission
  const handleConfirm = useCallback(async () => {
    // Prevent double-submit
    if (isSubmitting) return;

    setSubmitting(true);

    try {
      // Map picks to API format
      const payload = mapDraftPicksToPayload(picks);

      // Submit to API
      const result = await createAndLockSlip(payload);

      if (result.success && result.slip) {
        // Success! Store the slip ID and clear picks
        setSubmissionSuccess(result.slip.id);
        setIsModalVisible(false);
      } else {
        // Handle error
        setSubmissionError(result.error?.message || 'Failed to submit slip');
      }
    } catch (error: any) {
      setSubmissionError(error.message || 'An unexpected error occurred');
    }
  }, [picks, isSubmitting, setSubmitting, setSubmissionSuccess, setSubmissionError]);

  // Handle starting a new slip after success
  const handleNewSlip = useCallback(() => {
    clearSubmissionState();
    router.push('/(tabs)/events');
  }, [clearSubmissionState, router]);

  // Handle navigating to challenge creation
  const handleCreateChallenge = useCallback(() => {
    // Navigate to challenge creation with the slip ID
    router.push({
      pathname: '/challenge/create',
      params: { slipId: submittedSlipId },
    });
    clearSubmissionState();
  }, [submittedSlipId, clearSubmissionState, router]);

  // Loading state
  if (!isHydrated) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Review Slip',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Success state - slip was submitted
  if (submittedSlipId) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Slip Locked!',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
            headerLeft: () => null, // Hide back button on success
          }}
        />
        <SafeAreaView testID={TEST_IDS.slipReview.screen} style={styles.container} edges={['bottom']}>
          <View testID={TEST_IDS.slipReview.successState} style={styles.successContainer}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>Slip Locked!</Text>
            <Text style={styles.successMessage}>
              Your picks are locked and ready for a challenge.
            </Text>
            <View testID={TEST_IDS.slipReview.slipIdDisplay} style={styles.slipIdContainer}>
              <Text style={styles.slipIdLabel}>Slip ID</Text>
              <Text style={styles.slipIdValue}>{submittedSlipId.slice(0, 8)}...</Text>
            </View>
            <View style={styles.successButtons}>
              <Pressable testID={TEST_IDS.slipReview.createChallengeButton} style={styles.challengeButton} onPress={handleCreateChallenge}>
                <Text style={styles.challengeButtonText}>Create Challenge</Text>
              </Pressable>
              <Pressable testID={TEST_IDS.slipReview.newSlipButton} style={styles.newSlipButton} onPress={handleNewSlip}>
                <Text style={styles.newSlipButtonText}>Start New Slip</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Empty state
  if (picks.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Review Slip',
            headerStyle: { backgroundColor: '#0f0f23' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <SafeAreaView testID={TEST_IDS.slipReview.screen} style={styles.container} edges={['bottom']}>
          <View testID={TEST_IDS.slipReview.emptyState} style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>Your Slip is Empty</Text>
            <Text style={styles.emptyMessage}>
              Add picks from the events to get started
            </Text>
            <Pressable
              style={styles.addPicksButton}
              onPress={() => router.push('/(tabs)/events')}
            >
              <Text style={styles.addPicksButtonText}>Browse Events</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Render pick item with validation state
  const renderItem = ({ item }: { item: DraftPick }) => {
    const validationError = pickValidationMap.get(item.id);
    return (
      <PickItem
        pick={item}
        onRemove={() => removePick(item.id)}
        isInvalid={!!validationError}
        invalidReason={validationError}
      />
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Review Slip',
          headerStyle: { backgroundColor: '#0f0f23' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable onPress={clearSlip} hitSlop={12}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView testID={TEST_IDS.slipReview.screen} style={styles.container} edges={['bottom']}>
        {/* Picks List */}
        <FlatList
          testID={TEST_IDS.slipReview.picksList}
          data={picks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListFooterComponent={<View style={styles.listFooter} />}
        />

        {/* Error Banner */}
        {submitError && !isModalVisible && (
          <View testID={TEST_IDS.slipReview.errorBanner} style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmissionError('')} hitSlop={8}>
              <Text style={styles.errorDismiss}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Summary Footer */}
        <View style={styles.summaryContainer}>
          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text testID={TEST_IDS.slipReview.picksCount} style={styles.statValue}>{picksCount}</Text>
              <Text style={styles.statLabel}>Picks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text testID={TEST_IDS.slipReview.remainingCount} style={styles.statValue}>{SLIP_MAX_PICKS - picksCount}</Text>
              <Text style={styles.statLabel}>Remaining</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text testID={TEST_IDS.slipReview.pointPotential} style={[styles.statValue, styles.pointsValue]}>{pointPotential}</Text>
              <Text style={styles.statLabel}>Point Potential</Text>
            </View>
          </View>

          {/* Lock Slip Button */}
          <Pressable
            testID={TEST_IDS.slipReview.lockSlipButton}
            style={[styles.submitButton, (isSubmitting || hasInvalidPicks) && styles.submitButtonDisabled]}
            onPress={handleLockPress}
            disabled={isSubmitting || hasInvalidPicks}
          >
            <Text style={styles.submitButtonText}>
              {hasInvalidPicks ? 'Fix Invalid Picks' : 'Lock Slip'}
            </Text>
          </Pressable>
        </View>

        {/* Confirmation Modal */}
        <ConfirmationModal
          visible={isModalVisible}
          picks={picks}
          pointPotential={pointPotential}
          isSubmitting={isSubmitting}
          error={submitError}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 16,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
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
    marginBottom: 24,
  },
  addPicksButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  addPicksButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Success state
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  successTitle: {
    color: '#22c55e',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  successMessage: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  slipIdContainer: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 32,
    alignItems: 'center',
  },
  slipIdLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  slipIdValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  successButtons: {
    width: '100%',
    gap: 12,
  },
  challengeButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  challengeButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  newSlipButton: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  newSlipButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemSeparator: {
    height: 12,
  },
  listFooter: {
    height: 180, // Space for summary footer
  },
  // Header
  clearAllText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
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
  },
  errorBannerText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
  errorDismiss: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    paddingLeft: 12,
  },
  // Summary Footer
  summaryContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  pointsValue: {
    color: '#22c55e',
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2a2a3e',
    marginVertical: 4,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
});
