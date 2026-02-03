// =====================================================
// Tier Status Hook
// =====================================================
// Provides tier progress and status information for UI display.
// Uses local calculation with shared-types constants.
// Will prefer API-provided values when backend adds tier fields.

import { useMemo } from 'react';
import { useProfileStore } from '../stores/profile.store';
import { PickTier } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

export interface TierStatus {
  /** User's current calculated tier */
  currentTier: PickTier;
  /** Highest tier ever unlocked */
  highestTierUnlocked: PickTier;
  /** Progress to next tier (0-1, based on whichever path is closer) */
  progressToNextTier: number;
  /** Next tier to unlock, or null if at ELITE */
  nextTier: PickTier | null;
  /** Coins needed to reach next tier via coin path */
  coinsNeeded: number;
  /** Wins needed in streak to reach next tier via streak path */
  streakNeeded: number;
  /** Check if user can access a specific tier */
  canAccessTier: (tier: PickTier) => boolean;
  /** Human-readable progress message */
  displayMessage: string;
  /** Whether tier data is loading */
  isLoading: boolean;
}

// =====================================================
// Constants
// =====================================================

// Tier unlock thresholds (matches backend tier.service.ts)
// User needs EITHER coins OR streak to unlock
const TIER_UNLOCK_THRESHOLDS: Record<PickTier, { coins: number; streak: number }> = {
  [PickTier.FREE]: { coins: 0, streak: 0 },
  [PickTier.STANDARD]: { coins: 2500, streak: 10 },
  [PickTier.PREMIUM]: { coins: 7500, streak: 20 },
  [PickTier.ELITE]: { coins: 15000, streak: 5 },
};

const TIER_ORDER: PickTier[] = [
  PickTier.FREE,
  PickTier.STANDARD,
  PickTier.PREMIUM,
  PickTier.ELITE,
];

const TIER_NAMES: Record<PickTier, string> = {
  [PickTier.FREE]: 'Free',
  [PickTier.STANDARD]: 'Standard',
  [PickTier.PREMIUM]: 'Premium',
  [PickTier.ELITE]: 'Elite',
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Calculate tier from stats (matches backend tier.service.ts logic).
 * User unlocks a tier if they meet EITHER the coin OR streak threshold.
 */
function calculateTierFromStats(coinsEarned: number, currentStreak: number): PickTier {
  // ELITE: 15,000 coins OR 5+ streak
  if (coinsEarned >= 15000 || currentStreak >= 5) {
    return PickTier.ELITE;
  }
  // PREMIUM: 7,500 coins OR 20+ streak
  if (coinsEarned >= 7500 || currentStreak >= 20) {
    return PickTier.PREMIUM;
  }
  // STANDARD: 2,500 coins OR 10+ streak
  if (coinsEarned >= 2500 || currentStreak >= 10) {
    return PickTier.STANDARD;
  }
  // FREE: default
  return PickTier.FREE;
}

/**
 * Get the next tier in progression, or null if at max.
 */
function getNextTier(current: PickTier): PickTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * Hook to get user's tier status and progress.
 *
 * @example
 * ```tsx
 * function TierDisplay() {
 *   const { currentTier, progressToNextTier, displayMessage, canAccessTier } = useTierStatus();
 *
 *   return (
 *     <View>
 *       <Text>Current Tier: {currentTier}</Text>
 *       <ProgressBar value={progressToNextTier} />
 *       <Text>{displayMessage}</Text>
 *       {!canAccessTier(PickTier.PREMIUM) && <Text>Premium picks locked</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
export function useTierStatus(): TierStatus {
  const myProfile = useProfileStore((s) => s.myProfile);
  const isLoading = useProfileStore((s) => s.isLoadingMyProfile);

  return useMemo(() => {
    // Safe defaults when profile not loaded
    if (!myProfile) {
      return {
        currentTier: PickTier.FREE,
        highestTierUnlocked: PickTier.FREE,
        progressToNextTier: 0,
        nextTier: PickTier.STANDARD,
        coinsNeeded: TIER_UNLOCK_THRESHOLDS[PickTier.STANDARD].coins,
        streakNeeded: TIER_UNLOCK_THRESHOLDS[PickTier.STANDARD].streak,
        canAccessTier: (tier: PickTier) => tier === PickTier.FREE,
        displayMessage: 'Loading...',
        isLoading: true,
      };
    }

    // Extract data with defensive handling
    // Future: API will provide these directly; for now, use fallbacks
    const profileAny = myProfile as unknown as Record<string, unknown>;
    const totalCoinsEarned = typeof profileAny.totalCoinsEarned === 'number'
      ? profileAny.totalCoinsEarned
      : 0;
    const currentStreak = Math.max(0, myProfile.stats?.currentStreak ?? 0);

    // Use API-provided tier if available, else calculate locally
    const apiTier = profileAny.currentTier as PickTier | undefined;
    const apiHighest = profileAny.highestTierUnlocked as PickTier | undefined;

    const calculatedTier = calculateTierFromStats(totalCoinsEarned, currentStreak);
    const currentTier = apiTier ?? calculatedTier;
    const highestTierUnlocked = apiHighest ?? currentTier;

    // Next tier calculation
    const nextTier = getNextTier(currentTier);

    let coinsNeeded = 0;
    let streakNeeded = 0;
    let progressToNextTier = 1;
    let displayMessage = 'Elite tier unlocked!';

    if (nextTier) {
      const threshold = TIER_UNLOCK_THRESHOLDS[nextTier];
      coinsNeeded = Math.max(0, threshold.coins - totalCoinsEarned);
      streakNeeded = Math.max(0, threshold.streak - currentStreak);

      // Calculate progress (use whichever path is closer to completion)
      const coinProgress = threshold.coins > 0
        ? Math.min(1, totalCoinsEarned / threshold.coins)
        : 1;
      const streakProgress = threshold.streak > 0
        ? Math.min(1, currentStreak / threshold.streak)
        : 1;
      progressToNextTier = Math.max(coinProgress, streakProgress);

      // Generate display message based on closest path
      const tierName = TIER_NAMES[nextTier];
      if (coinProgress >= 1 || streakProgress >= 1) {
        displayMessage = `${tierName} tier unlocked!`;
      } else if (coinProgress > streakProgress) {
        displayMessage = `${coinsNeeded.toLocaleString()} coins to ${tierName}`;
      } else {
        displayMessage = `${streakNeeded} win streak to ${tierName}`;
      }
    }

    // Helper to check tier access
    const canAccessTier = (tier: PickTier): boolean => {
      const highestIdx = TIER_ORDER.indexOf(highestTierUnlocked);
      const targetIdx = TIER_ORDER.indexOf(tier);
      return targetIdx <= highestIdx;
    };

    return {
      currentTier,
      highestTierUnlocked,
      progressToNextTier,
      nextTier,
      coinsNeeded,
      streakNeeded,
      canAccessTier,
      displayMessage,
      isLoading,
    };
  }, [myProfile, isLoading]);
}

export default useTierStatus;
