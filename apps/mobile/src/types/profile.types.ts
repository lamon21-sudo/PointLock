// =====================================================
// Profile Types (Mobile)
// =====================================================

import type {
  UserProfileResponse,
  UserProfileStats,
  AvatarOption,
} from '@pick-rivals/shared-types';

// Re-export shared types for convenience
export type { UserProfileResponse, UserProfileStats, AvatarOption };
export { AVATAR_OPTIONS, getAvatarEmoji } from '@pick-rivals/shared-types';

// =====================================================
// Profile Mode
// =====================================================

export type ProfileMode = 'private' | 'public';

// =====================================================
// Edit Profile Form
// =====================================================

export interface EditProfileFormData {
  displayName: string;
  avatarId: string;
}

// =====================================================
// Mock Data
// =====================================================

export const MOCK_USER_PROFILE: UserProfileResponse = {
  id: 'mock-user-id',
  username: 'MockUser123',
  displayName: 'Mock User',
  avatarUrl: null,
  skillRating: 1000,
  stats: {
    matchesPlayed: 25,
    matchesWon: 15,
    matchesLost: 10,
    winRate: 60,
    currentStreak: 3,
    bestStreak: 7,
  },
  memberSince: new Date().toISOString(),
  currentTier: 0, // FREE tier
  totalCoinsEarned: 0,
  hasCompletedOnboarding: true,
  hasCompletedDemoSlip: true,
  featureFlags: {
    onboardingEnabled: true,
    demoSlipEnabled: true,
    bettingTooltipsEnabled: true,
  },
};

// =====================================================
// Utility Functions
// =====================================================

/**
 * Calculate win rate percentage from wins and total matches
 */
export function calculateWinRate(wins: number, played: number): number {
  if (played === 0) return 0;
  return Math.round((wins / played) * 100 * 100) / 100;
}

/**
 * Format skill rating with label
 */
export function formatSkillRating(rating: number): string {
  if (rating < 800) return 'Bronze';
  if (rating < 1000) return 'Silver';
  if (rating < 1200) return 'Gold';
  if (rating < 1500) return 'Platinum';
  if (rating < 2000) return 'Diamond';
  return 'Champion';
}

/**
 * Get skill rating color
 */
export function getSkillRatingColor(rating: number): string {
  if (rating < 800) return '#cd7f32'; // Bronze
  if (rating < 1000) return '#c0c0c0'; // Silver
  if (rating < 1200) return '#ffd700'; // Gold
  if (rating < 1500) return '#e5e4e2'; // Platinum
  if (rating < 2000) return '#b9f2ff'; // Diamond
  return '#ff6b6b'; // Champion
}
