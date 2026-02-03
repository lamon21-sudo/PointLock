// =====================================================
// User Types
// =====================================================

export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending_verification';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  kycVerified: boolean;
  skillRating: number;
  matchesPlayed: number;
  matchesWon: number;
  currentStreak: number;
  bestStreak: number;
  referralCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  skillRating: number;
  matchesPlayed: number;
  matchesWon: number;
  currentStreak: number;
  bestStreak: number;
}

export interface UserStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  totalPointsEarned: number;
  averagePointsPerMatch: number;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string;
}

// =====================================================
// Profile Response Types
// =====================================================

export interface UserProfileStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
}

export interface UserProfileResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  skillRating: number;
  stats: UserProfileStats;
  memberSince: string;
  /** User's current tier (calculated from totalCoinsEarned and currentStreak) */
  currentTier: number;
  /** Lifetime coins earned (used for tier calculation, not current balance) */
  totalCoinsEarned: number;
}

// =====================================================
// Avatar Options (MVP)
// =====================================================

export interface AvatarOption {
  id: string;
  emoji: string;
  label: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'default', emoji: '👤', label: 'Default' },
  { id: 'flame', emoji: '🔥', label: 'Flame' },
  { id: 'star', emoji: '⭐', label: 'Star' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'lightning', emoji: '⚡', label: 'Lightning' },
  { id: 'dice', emoji: '🎲', label: 'Dice' },
  { id: 'target', emoji: '🎯', label: 'Target' },
];

export function getAvatarEmoji(avatarUrl: string | null): string {
  if (!avatarUrl) return '👤';
  const avatar = AVATAR_OPTIONS.find((a) => a.id === avatarUrl);
  return avatar?.emoji ?? '👤';
}
