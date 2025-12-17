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
