/**
 * Task 0.3: Season & Ranked Competition Types
 * Defines types for seasonal ranked competitions
 */

import { Rank } from './ranked.types';

export enum SeasonStatus {
  SCHEDULED = 'SCHEDULED', // Not started yet
  ACTIVE = 'ACTIVE',       // In progress
  ENDED = 'ENDED',         // Finished, calculating rewards
  ARCHIVED = 'ARCHIVED',   // Historical, read-only
}

export interface Season {
  id: string;
  name: string;
  slug: string;
  startDate: Date;
  endDate: Date;
  status: SeasonStatus;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Task 4.3: Season Worker fields
  lockedAt?: Date | null;
  rankingsFinalizedAt?: Date | null;
  rewardsDistributedAt?: Date | null;
  lastRewardProcessedUserId?: string | null;
}

export interface SeasonEntry {
  id: string;
  userId: string;
  seasonId: string;
  rankPoints: number;
  currentRank?: Rank | null;
  highestRank?: Rank | null;
  placementMatchesPlayed: number;
  placementMatchesWon: number;
  wins: number;
  losses: number;
  draws: number;
  finalRank?: Rank | null;
  finalRankPoints?: number | null;
  rankPosition?: number | null;
  lastMatchAt?: Date | null;
  lastDecayAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeasonReward {
  id: string;
  seasonId: string;
  minRank: Rank;
  maxRank: Rank;
  coinReward: number;
  description?: string | null;
  createdAt: Date;
}

export interface SeasonRewardClaim {
  id: string;
  userId: string;
  seasonId: string;
  rewardId: string;
  transactionId?: string | null;
  claimedAt: Date;
}

export interface SeasonLeaderboardEntry {
  rank: number;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  rankPoints: number;
  currentRank?: Rank | null;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
}

export interface SeasonSummaryResponse {
  season: Season;
  userEntry: SeasonEntry | null;
  leaderboard: SeasonLeaderboardEntry[];
  availableRewards: SeasonReward[];
}

export interface ClaimRewardPayload {
  seasonId: string;
  rewardId: string;
}

// Constants for rank point changes
export const RANK_POINTS = {
  WIN: 25,
  LOSS: -20,
  PLACEMENT_WIN: 40,
  PLACEMENT_LOSS: -30,
  DAILY_DECAY: -2,
  PROMOTION_THRESHOLD: 100,
  DEMOTION_THRESHOLD: 0,
} as const;

// Placement match requirements
export const PLACEMENT_MATCHES_REQUIRED = 10;

// Rank thresholds for placement results
export const PLACEMENT_RESULTS: Record<number, Rank> = {
  10: Rank.GOLD_1,     // 10 wins
  9: Rank.GOLD_2,      // 9 wins
  8: Rank.GOLD_3,      // 8 wins
  7: Rank.SILVER_1,    // 7 wins
  6: Rank.SILVER_2,    // 6 wins
  5: Rank.SILVER_3,    // 5 wins
  4: Rank.BRONZE_1,    // 4 wins
  3: Rank.BRONZE_2,    // 3 wins
  2: Rank.BRONZE_3,    // 2 wins
  1: Rank.BRONZE_3,    // 1 win
  0: Rank.BRONZE_3,    // 0 wins
};

// Task 4.3: Season Worker Configuration
export const SEASON_WORKER_CONFIG = {
  /** Days of inactivity before rank decay applies */
  INACTIVITY_THRESHOLD_DAYS: 7,
  /** Hours after season end before rankings are finalized */
  GRACE_PERIOD_HOURS: 4,
  /** Batch size for processing entries */
  BATCH_SIZE: 100,
  /** Daily decay cron pattern (2 AM UTC) */
  DECAY_CRON: '0 2 * * *',
  /** Season end check cron pattern (every hour at :05) */
  SEASON_CHECK_CRON: '5 * * * *',
  /** Distributed lock TTL in seconds */
  LOCK_TTL_SECONDS: 300,
} as const;
