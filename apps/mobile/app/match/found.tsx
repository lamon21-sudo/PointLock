// =====================================================
// Match Found Screen
// =====================================================
// Displays when a match is found, before entering the match.

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LUXURY_THEME, SHADOWS } from '../../src/constants/theme';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GoldButton } from '../../src/components/ui/GoldButton';
import { useQueueStore } from '../../src/stores/queue.store';

// =====================================================
// Helpers
// =====================================================

function formatStakeAmount(amount: number | null | undefined, hasData: boolean): string {
  if (!hasData) return '—'; // Show dash when data is loading/missing
  if (!amount) return '0';
  return amount.toLocaleString();
}

function formatGameMode(mode: string | null | undefined): string {
  if (!mode) return 'Quick Match';
  switch (mode) {
    case 'QUICK_MATCH':
      return 'Quick Match';
    case 'RANDOM':
      return 'Random Match';
    case 'FRIEND_CHALLENGE':
      return 'Friend Challenge';
    default:
      return mode;
  }
}

// =====================================================
// Main Component
// =====================================================

export default function MatchFoundScreen() {
  const router = useRouter();
  const { matchId: paramMatchId } = useLocalSearchParams<{ matchId: string }>();

  // Queue store state
  const storeMatchId = useQueueStore((state) => state.matchId);
  const matchDetails = useQueueStore((state) => state.matchDetails);
  const gameMode = useQueueStore((state) => state.gameMode);
  const resetQueue = useQueueStore((state) => state.resetQueue);

  // Use store matchId first, fallback to route param
  const matchId = storeMatchId || paramMatchId;

  // Navigation prevention using ref (synchronous, prevents race conditions)
  const isNavigatingRef = useRef(false);
  // State for loading indicator (triggers re-render for UI)
  const [isNavigating, setIsNavigating] = useState(false);

  // Handle Android back button - prevent accidental exit
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Prevent back navigation on this screen
      return true;
    });
    return () => backHandler.remove();
  }, []);

  // Enter match handler with double-tap prevention using ref
  const handleEnterMatch = useCallback(() => {
    if (isNavigatingRef.current || !matchId) return;
    isNavigatingRef.current = true;
    setIsNavigating(true);

    // Navigate to match detail screen
    router.replace({
      pathname: '/match/[id]',
      params: { id: matchId },
    });
  }, [matchId, router]);

  // Back to home handler (error state)
  const handleBackToHome = useCallback(() => {
    resetQueue();
    router.replace('/(tabs)');
  }, [resetQueue, router]);

  // Match summary info
  const matchSummary = useMemo(
    () => ({
      gameMode: formatGameMode(gameMode || matchDetails?.type),
      stakeAmount: matchDetails?.stakeAmount || 0,
      inviteCode: matchDetails?.inviteCode,
    }),
    [gameMode, matchDetails]
  );

  // Handle missing matchId - error state
  if (!matchId) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle"
            size={48}
            color={LUXURY_THEME.status.error}
          />
          <Text style={styles.errorTitle}>Match Not Found</Text>
          <Text style={styles.errorMessage}>
            Unable to load match details. Please try again.
          </Text>
          <GoldButton onPress={handleBackToHome} variant="outline" size="md">
            Back to Home
          </GoldButton>
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
        {/* Celebration Section */}
        <View style={styles.celebrationSection}>
          <View style={styles.successIconContainer}>
            <Ionicons
              name="checkmark"
              size={40}
              color={LUXURY_THEME.bg.primary}
            />
          </View>
          <Text style={styles.matchFoundTitle}>Match Found!</Text>
          <Text style={styles.matchFoundSubtitle}>
            Get ready to compete
          </Text>
        </View>

        {/* Opponent Card */}
        <GlassCard style={styles.opponentCard}>
          <View style={styles.opponentCardContent}>
            <View style={styles.avatarPlaceholder}>
              <Ionicons
                name="person"
                size={32}
                color={LUXURY_THEME.text.secondary}
              />
            </View>
            <Text style={styles.opponentLabel}>Your Opponent</Text>
            <Text style={styles.opponentUsername}>Opponent Found</Text>
          </View>
        </GlassCard>

        {/* Match Summary Card */}
        <GlassCard style={styles.summaryCard} padded>
          <Text style={styles.summaryTitle}>Match Details</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Game Mode</Text>
            <Text style={styles.summaryValue}>{matchSummary.gameMode}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Entry Stake</Text>
            <View style={styles.stakeContainer}>
              <Text style={styles.stakeValue}>
                {formatStakeAmount(matchSummary.stakeAmount, matchDetails !== null)}
              </Text>
              <Text style={styles.stakeCurrency}>RC</Text>
            </View>
          </View>

          {matchSummary.inviteCode && (
            <>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Invite Code</Text>
                <Text style={styles.summaryValue}>{matchSummary.inviteCode}</Text>
              </View>
            </>
          )}
        </GlassCard>

        {/* Bottom spacer for footer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Footer with Enter Match Button */}
      <View style={styles.footer}>
        <GoldButton
          onPress={handleEnterMatch}
          variant="metallic"
          size="lg"
          fullWidth
          disabled={isNavigating}
          isLoading={isNavigating}
        >
          Enter Match
        </GoldButton>
      </View>
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

  // Celebration Section
  celebrationSection: {
    alignItems: 'center',
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
    paddingTop: 20,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LUXURY_THEME.gold.vibrant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...SHADOWS.goldGlow,
  },
  matchFoundTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  matchFoundSubtitle: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    marginTop: 8,
  },

  // Opponent Card
  opponentCard: {
    marginBottom: LUXURY_THEME.spacing.cardGap,
  },
  opponentCardContent: {
    padding: LUXURY_THEME.spacing.cardPadding,
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: LUXURY_THEME.surface.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: LUXURY_THEME.gold.border,
  },
  opponentLabel: {
    color: LUXURY_THEME.text.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  opponentUsername: {
    color: LUXURY_THEME.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },

  // Match Summary Card
  summaryCard: {
    marginBottom: LUXURY_THEME.spacing.cardGap,
  },
  summaryTitle: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryLabel: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
  },
  summaryValue: {
    color: LUXURY_THEME.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  stakeContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  stakeValue: {
    color: LUXURY_THEME.gold.vibrant,
    fontSize: 18,
    fontWeight: '700',
  },
  stakeCurrency: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: LUXURY_THEME.border.muted,
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

  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  errorMessage: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
