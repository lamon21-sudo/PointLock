// =====================================================
// Leaderboard Validation Schemas
// =====================================================
// Zod schemas for leaderboard endpoint validation and
// TypeScript types for API responses.

import { z } from 'zod';

// ===========================================
// Constants
// ===========================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ===========================================
// Query Schema for GET /leaderboard
// ===========================================

export const leaderboardQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val || String(DEFAULT_PAGE), 10);
      return isNaN(parsed) || parsed < 1 ? DEFAULT_PAGE : parsed;
    }),

  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val || String(DEFAULT_LIMIT), 10);
      if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
      return Math.min(parsed, MAX_LIMIT);
    }),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

// ===========================================
// Response Types
// ===========================================

export interface LeaderboardEntryResponse {
  rank: number;
  previousRank: number | null;
  rankChange: number | null; // positive = improved, negative = dropped, null = new entry
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winRate: number;
  currentStreak: number;
}

export interface LeaderboardResponse {
  id: string;
  name: string;
  timeframe: 'GLOBAL' | 'WEEKLY';
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntryResponse[];
}

export interface PaginatedLeaderboard {
  leaderboard: LeaderboardResponse;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
