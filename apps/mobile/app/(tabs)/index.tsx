import { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { GoldButton } from '../../src/components/ui/GoldButton';
import {
  QuickMatchButton,
  GameModeCard,
  TierProgressBar,
  LiveMatchesCarousel,
  LiveMatchData,
} from '../../src/components/home';
import { LUXURY_THEME } from '../../src/constants/theme';
import { useTierStatus } from '../../src/hooks/useTierStatus';
import { useSlips } from '../../src/hooks/useSlips';
import { PickTier } from '@pick-rivals/shared-types';

// =====================================================
// Helper Functions
// =====================================================

function getTierName(tier: PickTier): string {
  const names: Record<PickTier, string> = {
    [PickTier.FREE]: 'Free',
    [PickTier.STANDARD]: 'Standard',
    [PickTier.PREMIUM]: 'Premium',
    [PickTier.ELITE]: 'Elite',
  };
  return names[tier] || 'Free';
}

// =====================================================
// Main Component
// =====================================================

export default function HomeScreen() {
  // Data hooks
  const {
    currentTier,
    progressToNextTier,
    nextTier,
    displayMessage,
  } = useTierStatus();

  const {
    slips: activeSlips,
    isLoading: isSlipsLoading,
  } = useSlips({ initialFilter: 'active', limit: 10 });

  // Navigation handlers
  const handleQuickMatch = useCallback(() => {
    Alert.alert(
      'Quick Match',
      'Build a slip first, then enter matchmaking to find an opponent instantly.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Build Slip', onPress: () => router.push('/(tabs)/events') }
      ]
    );
  }, []);

  const handlePlayFriend = useCallback(() => {
    router.push('/friends');
  }, []);

  const handleInviteFriend = useCallback(async () => {
    try {
      await Share.share({
        message: 'Join me on Pick Rivals! Challenge me to head-to-head picks. Download now: https://pickrivals.com/download',
        title: 'Invite to Pick Rivals',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  }, []);

  const handleRandomMatch = useCallback(() => {
    Alert.alert(
      'Random Match',
      'Build a slip first, then create a public lobby for anyone to join.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Build Slip', onPress: () => router.push('/(tabs)/events') }
      ]
    );
  }, []);

  const handleLiveMatchPress = useCallback((matchId: string) => {
    router.push(`/slip/${matchId}`);
  }, []);

  const handleBuildSlip = useCallback(() => {
    router.push('/(tabs)/events');
  }, []);

  // TODO: Replace with useMatches() when PvP match API is available
  // Currently showing active slips as "live matches" for MVP
  const liveMatches: LiveMatchData[] = activeSlips.map((slip) => ({
    id: slip.id,
    opponent: `${slip.correctPicks}/${slip.totalPicks} picks`,
    status: slip.status === 'ACTIVE' ? 'LIVE' : slip.status,
    yourPoints: slip.pointsEarned,
    opponentPoints: slip.pointPotential,
    totalPotential: slip.pointPotential,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================= */}
        {/* Hero Section - Balance */}
        {/* ============================================= */}
        <View style={styles.heroSection}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>BALANCE</Text>
            <Ionicons
              name="notifications-outline"
              size={22}
              color={LUXURY_THEME.text.secondary}
            />
          </View>

          <View style={styles.balanceRow}>
            <Text style={styles.balanceAmount}>10,000</Text>
            <Text style={styles.balanceCurrency}>RC</Text>
          </View>

          <Text style={styles.balanceSubtext}>Rival Coins Available</Text>

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <GoldButton
              onPress={() => {}}
              variant="outline"
              size="sm"
              style={styles.actionButton}
            >
              Cash Out
            </GoldButton>
            <GoldButton
              onPress={() => router.push('/(tabs)/wallet')}
              variant="solid"
              size="sm"
              style={styles.actionButton}
            >
              Add Coins
            </GoldButton>
          </View>
        </View>

        {/* ============================================= */}
        {/* Quick Match - Primary CTA */}
        {/* ============================================= */}
        <View style={styles.quickMatchSection}>
          <QuickMatchButton onPress={handleQuickMatch} />
        </View>

        {/* ============================================= */}
        {/* Action Cards Row */}
        {/* ============================================= */}
        <View style={styles.actionCardsSection}>
          <View style={styles.actionCardsRow}>
            <GameModeCard
              title="Play Friend"
              subtitle="Challenge your rivals"
              iconName="people"
              onPress={handlePlayFriend}
              style={styles.actionCard}
            />
            <GameModeCard
              title="Invite Friend"
              subtitle="Share the app"
              iconName="person-add"
              onPress={handleInviteFriend}
              style={styles.actionCard}
            />
            <GameModeCard
              title="Random"
              subtitle="Public lobby"
              iconName="shuffle"
              onPress={handleRandomMatch}
              style={styles.actionCard}
            />
          </View>
        </View>

        {/* ============================================= */}
        {/* Tier Progress Bar */}
        {/* ============================================= */}
        <TierProgressBar
          currentTierLabel={getTierName(currentTier)}
          progress={progressToNextTier}
          nextTierLabel={nextTier ? getTierName(nextTier) : null}
          hintText={displayMessage}
          style={styles.tierSection}
        />

        {/* ============================================= */}
        {/* Live Matches Carousel */}
        {/* ============================================= */}
        <Text style={styles.sectionTitle}>LIVE MATCHES</Text>
        <LiveMatchesCarousel
          matches={liveMatches}
          loading={isSlipsLoading}
          onPressMatch={handleLiveMatchPress}
          onEmptyStateCTA={handleBuildSlip}
          emptyStateTitle="No Live Matches"
          emptyStateSubtitle="Build a slip and challenge someone to get started"
          emptyStateCTALabel="Build Slip"
          style={styles.liveCarousel}
        />

        {/* Bottom spacing for floating dock */}
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero Section
  heroSection: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroLabel: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  balanceAmount: {
    color: LUXURY_THEME.text.primary,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
  },
  balanceCurrency: {
    color: LUXURY_THEME.gold.main,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 10,
  },
  balanceSubtext: {
    color: LUXURY_THEME.text.muted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },

  // Section Title
  sectionTitle: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // Quick Match Section
  quickMatchSection: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },

  // Action Cards Section
  actionCardsSection: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },
  actionCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
  },

  // Tier Progress Section
  tierSection: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },

  // Live Matches Carousel
  liveCarousel: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },

  // Bottom Spacer for floating dock
  bottomSpacer: {
    height: 100,
  },
});
