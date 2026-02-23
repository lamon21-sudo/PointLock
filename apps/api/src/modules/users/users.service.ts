// =====================================================
// Users Service
// =====================================================
// Business logic for user profile operations.
// CRITICAL: All user data must be validated at boundaries.
// Stats calculations must be accurate and never expose invalid data.

import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { logger } from '../../utils/logger';
import { UpdateProfileInput } from './users.schemas';
import { calculateTierFromStats, TIER_RANK } from '../../lib/tier.service';
import { bigIntToNumber } from '../../lib/wallet.service';
import { config } from '../../config';

// ===========================================
// Types
// ===========================================

export interface UserStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  skillRating: number;
  stats: UserStats;
  memberSince: string;
  /** User's current tier (calculated from totalCoinsEarned and currentStreak) */
  currentTier: number;
  /** Lifetime coins earned (used for tier calculation) */
  totalCoinsEarned: number;
  /** Whether user has completed the onboarding walkthrough */
  hasCompletedOnboarding: boolean;
  /** Whether user has completed the demo slip tutorial */
  hasCompletedDemoSlip: boolean;
  /** Server-side feature flags for FTUE features */
  featureFlags: {
    onboardingEnabled: boolean;
    demoSlipEnabled: boolean;
    bettingTooltipsEnabled: boolean;
  };
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Calculate user statistics from User model fields.
 * Win rate is calculated as (matchesWon / matchesPlayed) * 100.
 * Returns 0 win rate if no matches played.
 */
function calculateUserStats(user: {
  matchesPlayed: number;
  matchesWon: number;
  currentStreak: number;
  bestStreak: number;
}): UserStats {
  const matchesLost = user.matchesPlayed - user.matchesWon;
  const winRate = user.matchesPlayed > 0
    ? (user.matchesWon / user.matchesPlayed) * 100
    : 0;

  return {
    matchesPlayed: user.matchesPlayed,
    matchesWon: user.matchesWon,
    matchesLost,
    winRate: Math.round(winRate * 100) / 100, // Round to 2 decimal places
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
  };
}

/**
 * Get the authenticated user's own profile.
 * Returns complete profile with calculated stats.
 * This should never fail if userId is valid (comes from auth token).
 *
 * @param userId - The authenticated user's ID
 * @returns UserProfile with stats
 * @throws NotFoundError if user doesn't exist (should never happen with valid auth)
 */
export async function getMyProfile(userId: string): Promise<UserProfile> {
  logger.info(`Fetching profile for user: ${userId}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      skillRating: true,
      matchesPlayed: true,
      matchesWon: true,
      currentStreak: true,
      bestStreak: true,
      createdAt: true,
      totalCoinsEarned: true,
      hasCompletedOnboarding: true,
      hasCompletedDemoSlip: true,
    },
  });

  if (!user) {
    logger.error(`User not found: ${userId}`);
    throw new NotFoundError(
      'User not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  const stats = calculateUserStats(user);
  const totalCoinsEarned = bigIntToNumber(user.totalCoinsEarned ?? BigInt(0));
  const tier = calculateTierFromStats(totalCoinsEarned, user.currentStreak);

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    skillRating: user.skillRating,
    stats,
    memberSince: user.createdAt.toISOString(),
    currentTier: TIER_RANK[tier],
    totalCoinsEarned,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    hasCompletedDemoSlip: user.hasCompletedDemoSlip,
    featureFlags: config.featureFlags,
  };
}

/**
 * Get a public user profile by user ID.
 * Returns the same data as getMyProfile but for any user.
 * Used for viewing other players' profiles.
 *
 * @param userId - The user ID to fetch
 * @returns UserProfile with stats
 * @throws NotFoundError if user doesn't exist
 */
export async function getPublicProfile(userId: string): Promise<UserProfile> {
  logger.info(`Fetching public profile for user: ${userId}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      skillRating: true,
      matchesPlayed: true,
      matchesWon: true,
      currentStreak: true,
      bestStreak: true,
      createdAt: true,
      totalCoinsEarned: true,
      hasCompletedOnboarding: true,
      hasCompletedDemoSlip: true,
    },
  });

  if (!user) {
    logger.warn(`Public profile not found: ${userId}`);
    throw new NotFoundError(
      'User not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  const stats = calculateUserStats(user);
  const totalCoinsEarned = bigIntToNumber(user.totalCoinsEarned ?? BigInt(0));
  const tier = calculateTierFromStats(totalCoinsEarned, user.currentStreak);

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    skillRating: user.skillRating,
    stats,
    memberSince: user.createdAt.toISOString(),
    currentTier: TIER_RANK[tier],
    totalCoinsEarned,
    // Onboarding fields are not relevant for public profiles.
    // Included to satisfy the unified UserProfile contract.
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    hasCompletedDemoSlip: user.hasCompletedDemoSlip,
    // Feature flags are not exposed on public profiles.
    featureFlags: {
      onboardingEnabled: false,
      demoSlipEnabled: false,
      bettingTooltipsEnabled: false,
    },
  };
}

/**
 * Update user profile fields.
 * Only updates displayName and avatarUrl.
 * CRITICAL: Input must be validated before calling this function.
 *
 * @param userId - The authenticated user's ID
 * @param data - The profile fields to update
 * @returns Updated UserProfile
 * @throws NotFoundError if user doesn't exist
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput
): Promise<UserProfile> {
  logger.info(`Updating profile for user: ${userId}`, {
    hasDisplayName: !!data.displayName,
    hasAvatarUrl: !!data.avatarUrl,
  });

  // Only update fields that are provided
  const updateData: {
    displayName?: string;
    avatarUrl?: string;
  } = {};

  if (data.displayName !== undefined) {
    updateData.displayName = data.displayName;
  }

  if (data.avatarUrl !== undefined) {
    updateData.avatarUrl = data.avatarUrl;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      skillRating: true,
      matchesPlayed: true,
      matchesWon: true,
      currentStreak: true,
      bestStreak: true,
      createdAt: true,
      totalCoinsEarned: true,
      hasCompletedOnboarding: true,
      hasCompletedDemoSlip: true,
    },
  });

  const stats = calculateUserStats(user);
  const totalCoinsEarned = bigIntToNumber(user.totalCoinsEarned ?? BigInt(0));
  const tier = calculateTierFromStats(totalCoinsEarned, user.currentStreak);

  logger.info(`Profile updated successfully for user: ${userId}`);

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    skillRating: user.skillRating,
    stats,
    memberSince: user.createdAt.toISOString(),
    currentTier: TIER_RANK[tier],
    totalCoinsEarned,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    hasCompletedDemoSlip: user.hasCompletedDemoSlip,
    featureFlags: config.featureFlags,
  };
}

/**
 * Update onboarding status flags.
 * Only allows setting flags to `true` (one-way, cannot be unset by client).
 *
 * @param userId - The authenticated user's ID
 * @param data - The onboarding flags to set (only `true` values accepted by schema)
 */
export async function updateOnboardingStatus(
  userId: string,
  data: { hasCompletedOnboarding?: true; hasCompletedDemoSlip?: true }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data,
  });

  logger.info(`Onboarding status updated for user: ${userId}`, { data });
}
