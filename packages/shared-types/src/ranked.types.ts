// =====================================================
// Ranked System Types
// =====================================================

/**
 * Rank enum - matches Prisma schema exactly.
 * IMPORTANT: This MUST match the Rank enum in schema.prisma.
 * String-based enum for database compatibility.
 */
export enum Rank {
  BRONZE_1 = 'BRONZE_1',
  BRONZE_2 = 'BRONZE_2',
  BRONZE_3 = 'BRONZE_3',
  SILVER_1 = 'SILVER_1',
  SILVER_2 = 'SILVER_2',
  SILVER_3 = 'SILVER_3',
  GOLD_1 = 'GOLD_1',
  GOLD_2 = 'GOLD_2',
  GOLD_3 = 'GOLD_3',
  PLATINUM_1 = 'PLATINUM_1',
  PLATINUM_2 = 'PLATINUM_2',
  PLATINUM_3 = 'PLATINUM_3',
  DIAMOND_1 = 'DIAMOND_1',
  DIAMOND_2 = 'DIAMOND_2',
  DIAMOND_3 = 'DIAMOND_3',
}

// ===========================================
// Ranked Service Input/Output Types
// ===========================================

/**
 * Input to updateRankPoints.
 * Represents the result of a settled ranked match.
 */
export interface MatchResultForRP {
  matchId: string;
  seasonId: string;
  winnerId: string | null; // null = draw
  loserId: string | null; // null = draw
  isDraw: boolean;
  settledAt: string; // ISO 8601 format for JSON serialization
}

/**
 * Return from updateRankPoints.
 * Contains complete audit trail of rank point changes.
 *
 * Mobile UI flags:
 * - `promoted`/`demoted`: Use for animation triggers
 * - `rankTierChanged`: True if metal changed (e.g., SILVER -> GOLD)
 * - Placement context fields: Use for progress display during placement phase
 */
export interface RankUpdateResult {
  userId: string;
  seasonId: string;
  matchId: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  rpChange: number;
  rpBefore: number;
  rpAfter: number;
  rankBefore: Rank | null;
  rankAfter: Rank;
  isPlacement: boolean;

  // Mobile UI flags for rank change animations
  promoted: boolean;        // Rank increased (e.g., SILVER_2 -> SILVER_3)
  demoted: boolean;         // Rank decreased (e.g., GOLD_1 -> SILVER_3)
  rankTierChanged: boolean; // Metal tier changed (e.g., SILVER -> GOLD)

  // Placement phase context (present when isPlacement === true)
  placementMatchesPlayed?: number;    // How many placement matches completed
  placementMatchesRemaining?: number; // How many left until ranked

  // Backend-only field (ignore on mobile)
  isIdempotent: boolean;
}

/**
 * Return from distributeSeasonRewards.
 * Summary of reward distribution process.
 *
 * NOTE: This is an ADMIN-ONLY type. It is the return value of a batch
 * job that distributes rewards to all users at season end. Mobile users
 * will never receive this - they get individual SeasonRewardClaim records.
 */
export interface SeasonRewardDistributionResult {
  seasonId: string;
  totalEntries: number;
  rewardsClaimed: number;
  totalCoinsDistributed: number;
  errors: string[];
}

// ===========================================
// Rank Thresholds
// ===========================================

/**
 * Rank thresholds - RP required to reach each rank.
 * Used to calculate rank from accumulated rank points.
 */
export const RANK_THRESHOLDS: Record<Rank, number> = {
  [Rank.BRONZE_1]: 0,
  [Rank.BRONZE_2]: 100,
  [Rank.BRONZE_3]: 200,
  [Rank.SILVER_1]: 300,
  [Rank.SILVER_2]: 400,
  [Rank.SILVER_3]: 500,
  [Rank.GOLD_1]: 600,
  [Rank.GOLD_2]: 700,
  [Rank.GOLD_3]: 800,
  [Rank.PLATINUM_1]: 900,
  [Rank.PLATINUM_2]: 1000,
  [Rank.PLATINUM_3]: 1100,
  [Rank.DIAMOND_1]: 1200,
  [Rank.DIAMOND_2]: 1400,
  [Rank.DIAMOND_3]: 1600,
};

/**
 * Rank display metadata for mobile UI.
 * Provides consistent styling and naming across platforms.
 */
export interface RankDisplayInfo {
  name: string;         // Display name (e.g., "Bronze I")
  tier: string;         // Metal tier (e.g., "BRONZE")
  division: number;     // Division within tier (1, 2, or 3)
  color: string;        // Hex color for badges
  threshold: number;    // RP required to reach this rank
}

export const RANK_DISPLAY: Record<Rank, RankDisplayInfo> = {
  [Rank.BRONZE_1]: { name: 'Bronze I', tier: 'BRONZE', division: 1, color: '#CD7F32', threshold: 0 },
  [Rank.BRONZE_2]: { name: 'Bronze II', tier: 'BRONZE', division: 2, color: '#CD7F32', threshold: 100 },
  [Rank.BRONZE_3]: { name: 'Bronze III', tier: 'BRONZE', division: 3, color: '#CD7F32', threshold: 200 },
  [Rank.SILVER_1]: { name: 'Silver I', tier: 'SILVER', division: 1, color: '#C0C0C0', threshold: 300 },
  [Rank.SILVER_2]: { name: 'Silver II', tier: 'SILVER', division: 2, color: '#C0C0C0', threshold: 400 },
  [Rank.SILVER_3]: { name: 'Silver III', tier: 'SILVER', division: 3, color: '#C0C0C0', threshold: 500 },
  [Rank.GOLD_1]: { name: 'Gold I', tier: 'GOLD', division: 1, color: '#FFD700', threshold: 600 },
  [Rank.GOLD_2]: { name: 'Gold II', tier: 'GOLD', division: 2, color: '#FFD700', threshold: 700 },
  [Rank.GOLD_3]: { name: 'Gold III', tier: 'GOLD', division: 3, color: '#FFD700', threshold: 800 },
  [Rank.PLATINUM_1]: { name: 'Platinum I', tier: 'PLATINUM', division: 1, color: '#E5E4E2', threshold: 900 },
  [Rank.PLATINUM_2]: { name: 'Platinum II', tier: 'PLATINUM', division: 2, color: '#E5E4E2', threshold: 1000 },
  [Rank.PLATINUM_3]: { name: 'Platinum III', tier: 'PLATINUM', division: 3, color: '#E5E4E2', threshold: 1100 },
  [Rank.DIAMOND_1]: { name: 'Diamond I', tier: 'DIAMOND', division: 1, color: '#B9F2FF', threshold: 1200 },
  [Rank.DIAMOND_2]: { name: 'Diamond II', tier: 'DIAMOND', division: 2, color: '#B9F2FF', threshold: 1400 },
  [Rank.DIAMOND_3]: { name: 'Diamond III', tier: 'DIAMOND', division: 3, color: '#B9F2FF', threshold: 1600 },
};

/**
 * Ordered array of ranks from lowest to highest.
 * Useful for rank comparison and progression calculations.
 */
export const RANK_ORDER: readonly Rank[] = [
  Rank.BRONZE_1,
  Rank.BRONZE_2,
  Rank.BRONZE_3,
  Rank.SILVER_1,
  Rank.SILVER_2,
  Rank.SILVER_3,
  Rank.GOLD_1,
  Rank.GOLD_2,
  Rank.GOLD_3,
  Rank.PLATINUM_1,
  Rank.PLATINUM_2,
  Rank.PLATINUM_3,
  Rank.DIAMOND_1,
  Rank.DIAMOND_2,
  Rank.DIAMOND_3,
] as const;

// ===========================================
// Placement Status Types
// ===========================================

/**
 * Audit record for a single placement match.
 * Tracks match-by-match progression through placement phase.
 */
export interface PlacementMatchAudit {
  matchNumber: number;
  matchId: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  processedAt: string;
  rankAssigned: Rank | null;
}

/**
 * Complete placement status for a user in a season.
 * Used by frontend to display placement progress UI.
 */
export interface PlacementStatus {
  seasonId: string;
  isPlaced: boolean;
  placementMatchesPlayed: number;
  placementMatchesRemaining: number;
  placementMatchesWon: number;
  currentRank: Rank | null;
  initialRank: Rank | null;
  placedAt: string | null;
  rankPoints: number;
  matches: PlacementMatchAudit[];
}

/**
 * Ranked progression summary for a user in a season.
 * Used for displaying rank progression and stats after placement.
 */
export interface RankedProgress {
  seasonId: string;
  isPlaced: boolean;
  currentRank: Rank | null;
  highestRank: Rank | null;
  rankPoints: number;
  rpToNextRank: number;
  rpFromDemotion: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}
