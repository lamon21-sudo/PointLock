// ===========================================
// Leaderboard Types
// ===========================================

export type LeaderboardTimeframe = 'GLOBAL' | 'WEEKLY';
export type LeaderboardPeriod = 'all-time' | 'weekly';

/**
 * Individual leaderboard entry from API
 */
export interface LeaderboardEntry {
  rank: number;
  previousRank: number | null;
  rankChange: number | null; // positive = improved, negative = dropped, null = new
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

/**
 * Leaderboard metadata
 */
export interface LeaderboardData {
  id: string;
  name: string;
  timeframe: LeaderboardTimeframe;
  periodStart: string | null;
  periodEnd: string | null;
  entries: LeaderboardEntry[];
}

/**
 * Pagination metadata
 */
export interface LeaderboardPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Full paginated API response
 */
export interface PaginatedLeaderboardResponse {
  leaderboard: LeaderboardData;
  pagination: LeaderboardPagination;
}

// ===========================================
// Medal Colors for Top 3
// ===========================================

export const MEDAL_COLORS = {
  GOLD: '#FFD700',
  SILVER: '#C0C0C0',
  BRONZE: '#CD7F32',
} as const;

// ===========================================
// Rank Change Styling
// ===========================================

export type RankChangeType = 'up' | 'down' | 'same' | 'new';

export function getRankChangeType(rankChange: number | null): RankChangeType {
  if (rankChange === null) return 'new';
  if (rankChange > 0) return 'up';
  if (rankChange < 0) return 'down';
  return 'same';
}

// ===========================================
// Helper Functions
// ===========================================

export function getMedalColor(rank: number): string | null {
  switch (rank) {
    case 1:
      return MEDAL_COLORS.GOLD;
    case 2:
      return MEDAL_COLORS.SILVER;
    case 3:
      return MEDAL_COLORS.BRONZE;
    default:
      return null;
  }
}

export function getMedalEmoji(rank: number): string | null {
  switch (rank) {
    case 1:
      return '\u{1F947}'; // Gold medal
    case 2:
      return '\u{1F948}'; // Silver medal
    case 3:
      return '\u{1F949}'; // Bronze medal
    default:
      return null;
  }
}
