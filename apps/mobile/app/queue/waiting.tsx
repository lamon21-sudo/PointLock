// =====================================================
// Queue Waiting Screen
// =====================================================
// Displays while searching for an opponent in matchmaking.

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  BackHandler,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LUXURY_THEME, SHADOWS } from '../../src/constants/theme';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GoldButton } from '../../src/components/ui/GoldButton';
import {
  useQueueStore,
  useMatchFound,
  useQueuePosition,
  useQueueError,
  selectHasExpired,
  selectExpiredReason,
  selectRefundedAmount,
} from '../../src/stores/queue.store';
import { useQueueSocket } from '../../src/hooks/useQueueSocket';

// =====================================================
// Constants
// =====================================================

const QUEUE_TIPS = [
  { icon: 'bulb-outline' as const, text: 'Higher stakes attract more competitive opponents' },
  { icon: 'flash-outline' as const, text: 'Quick Match finds opponents at your skill level' },
  { icon: 'trophy-outline' as const, text: 'Win streaks boost your tier ranking' },
];

// =====================================================
// Helpers
// =====================================================

function formatWaitTime(ms: number | null): string {
  if (!ms || ms <= 0) return '';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `~${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

// =====================================================
// Pulsing Indicator Component
// =====================================================

function PulsingIndicator() {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scaleAnim, opacityAnim]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[
          styles.pulseRing,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      />
      <View style={styles.pulseCore}>
        <Ionicons name="search" size={32} color={LUXURY_THEME.gold.vibrant} />
      </View>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function QueueWaitingScreen() {
  const router = useRouter();

  // Subscribe to queue socket events (queue:expired, match:created)
  useQueueSocket();

  // Queue state
  const inQueue = useQueueStore((state) => state.inQueue);
  const matchId = useQueueStore((state) => state.matchId);
  const estimatedWaitMs = useQueueStore((state) => state.estimatedWaitMs);
  const isLeavingQueue = useQueueStore((state) => state.isLeavingQueue);
  const leaveQueue = useQueueStore((state) => state.leaveQueue);
  const clearError = useQueueStore((state) => state.clearError);
  const clearExpiredState = useQueueStore((state) => state.clearExpiredState);

  // Expiration state
  const hasExpired = useQueueStore(selectHasExpired);
  const expiredReason = useQueueStore(selectExpiredReason);
  const refundedAmount = useQueueStore(selectRefundedAmount);

  // Convenience hooks
  const matchFound = useMatchFound();
  const position = useQueuePosition();
  const queueError = useQueueError();

  // Cancel handler with pre-cancel status check
  const handleCancel = useCallback(async () => {
    if (isLeavingQueue) return;

    // Check if match was found before canceling (race condition prevention)
    const currentMatchId = useQueueStore.getState().matchId;
    if (currentMatchId) {
      // Match was found, navigate to match instead of canceling
      router.replace({
        pathname: '/match/found' as any,
        params: { matchId: currentMatchId },
      });
      return;
    }

    await leaveQueue();
    router.replace('/(tabs)');
  }, [isLeavingQueue, leaveQueue, router]);

  // Navigate to match found screen when match is found
  useEffect(() => {
    if (matchFound && matchId) {
      router.replace({
        pathname: '/match/found' as any,
        params: { matchId },
      });
    }
  }, [matchFound, matchId, router]);

  // Redirect to home if not in queue, no match found, no error, and not expired
  useEffect(() => {
    if (!inQueue && !matchFound && !isLeavingQueue && !queueError && !hasExpired) {
      router.replace('/(tabs)');
    }
  }, [inQueue, matchFound, isLeavingQueue, queueError, hasExpired, router]);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Show confirmation dialog instead of navigating back
      Alert.alert(
        'Leave Queue?',
        'Your stake will be refunded if you leave now.',
        [
          { text: 'Stay in Queue', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: handleCancel },
        ]
      );
      return true; // Prevent default back behavior
    });
    return () => backHandler.remove();
  }, [handleCancel]);

  // Dismiss error
  const handleDismissError = useCallback(() => {
    clearError();
  }, [clearError]);

  // Handle retry after expiration
  const handleRetry = useCallback(() => {
    clearExpiredState();
    // Navigate back to play screen to re-enter queue
    router.replace('/(tabs)/play' as any);
  }, [clearExpiredState, router]);

  // Handle change settings after expiration
  const handleChangeSettings = useCallback(() => {
    clearExpiredState();
    router.replace('/(tabs)/play' as any);
  }, [clearExpiredState, router]);

  // Handle go home after expiration
  const handleGoHome = useCallback(() => {
    clearExpiredState();
    router.replace('/(tabs)');
  }, [clearExpiredState, router]);

  // Format display values
  const waitTimeDisplay = formatWaitTime(estimatedWaitMs);

  // Format refunded amount for display
  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error Banner */}
        {queueError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{queueError}</Text>
            <Pressable onPress={handleDismissError} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={20}
                color={LUXURY_THEME.status.error}
              />
            </Pressable>
          </View>
        )}

        {/* Expired Section */}
        {hasExpired ? (
          <View style={styles.expiredSection}>
            <View style={styles.expiredIconContainer}>
              <Ionicons
                name="time-outline"
                size={48}
                color={LUXURY_THEME.gold.brushed}
              />
            </View>
            <Text style={styles.expiredTitle}>Queue Timed Out</Text>
            <Text style={styles.expiredMessage}>
              {expiredReason || 'No opponents found within the time limit.'}
            </Text>
            {refundedAmount !== null && refundedAmount > 0 && (
              <Text style={styles.refundText}>
                Your stake of {formatCurrency(refundedAmount)} has been refunded.
              </Text>
            )}

            {/* Action Buttons */}
            <View style={styles.expiredActions}>
              <GoldButton
                onPress={handleRetry}
                variant="metallic"
                size="lg"
                fullWidth
              >
                Try Again
              </GoldButton>
              <GoldButton
                onPress={handleChangeSettings}
                variant="outline"
                size="md"
                fullWidth
                style={styles.secondaryButton}
              >
                Change Settings
              </GoldButton>
              <Pressable onPress={handleGoHome} style={styles.goHomeLink}>
                <Text style={styles.goHomeLinkText}>Return Home</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Searching Section */}
            <View style={styles.searchingSection}>
              <PulsingIndicator />
              <Text style={styles.statusText}>Searching for opponent...</Text>

              {position !== null && position > 0 && (
                <Text style={styles.positionText}>
                  Position: {position} in queue
                </Text>
              )}

              {waitTimeDisplay && (
                <Text style={styles.waitText}>{waitTimeDisplay}</Text>
              )}
            </View>

            {/* Tips Card */}
            <GlassCard style={styles.tipsCard} padded>
              <Text style={styles.tipsTitle}>Tips</Text>
              {QUEUE_TIPS.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Ionicons
                    name={tip.icon}
                    size={20}
                    color={LUXURY_THEME.gold.brushed}
                  />
                  <Text style={styles.tipText}>{tip.text}</Text>
                </View>
              ))}
            </GlassCard>
          </>
        )}

        {/* Bottom spacer for footer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Footer with Cancel Button (hidden when expired) */}
      {!hasExpired && (
        <View style={styles.footer}>
          <GoldButton
            onPress={handleCancel}
            variant="outline"
            size="lg"
            fullWidth
            isLoading={isLeavingQueue}
            disabled={isLeavingQueue}
          >
            Cancel Search
          </GoldButton>
        </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: LUXURY_THEME.spacing.sectionMargin,
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 92, 108, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: LUXURY_THEME.spacing.borderRadius / 2,
    marginBottom: 16,
    gap: 12,
  },
  errorText: {
    color: LUXURY_THEME.status.error,
    fontSize: 14,
    flex: 1,
  },

  // Searching Section
  searchingSection: {
    alignItems: 'center',
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
    paddingTop: 20,
  },
  statusText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
  },
  positionText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    marginBottom: 4,
  },
  waitText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 13,
  },

  // Pulse Animation
  pulseContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: LUXURY_THEME.gold.brushed,
  },
  pulseCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: LUXURY_THEME.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.goldGlowSubtle,
  },

  // Tips Card
  tipsCard: {
    marginTop: LUXURY_THEME.spacing.cardGap,
  },
  tipsTitle: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  tipText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    flex: 1,
  },

  // Footer
  footer: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.subtle,
    padding: LUXURY_THEME.spacing.cardPadding,
    paddingBottom: 32,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 120,
  },

  // Expired Section
  expiredSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  expiredIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LUXURY_THEME.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    ...SHADOWS.goldGlowSubtle,
  },
  expiredTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  expiredMessage: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  refundText: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  expiredActions: {
    width: '100%',
    gap: 12,
    marginTop: 16,
  },
  secondaryButton: {
    marginTop: 4,
  },
  goHomeLink: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  goHomeLinkText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
  },
});
