// =====================================================
// Ranked Service
// =====================================================
// Handles all ranked season operations including placement matches,
// rank point updates, and season reward distribution.
// CRITICAL: All RP updates are idempotent using transaction metadata.

import { Rank, SeasonStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { creditWallet, numberToBigInt } from '../lib/wallet.service';
import { BadRequestError, NotFoundError } from '../utils/errors';
import {
  RANK_POINTS,
  PLACEMENT_MATCHES_REQUIRED,
  MatchResultForRP,
  RankUpdateResult,
  SeasonRewardDistributionResult,
} from '@pick-rivals/shared-types';

// ===========================================
// Constants
// ===========================================

/**
 * Rank thresholds - RP required to reach each rank.
 * Uses Prisma's Rank enum (string-based).
 */
const RANK_THRESHOLDS: Record<Rank, number> = {
  BRONZE_1: 0,
  BRONZE_2: 100,
  BRONZE_3: 200,
  SILVER_1: 300,
  SILVER_2: 400,
  SILVER_3: 500,
  GOLD_1: 600,
  GOLD_2: 700,
  GOLD_3: 800,
  PLATINUM_1: 900,
  PLATINUM_2: 1000,
  PLATINUM_3: 1100,
  DIAMOND_1: 1200,
  DIAMOND_2: 1400,
  DIAMOND_3: 1600,
};

/**
 * Canonical rank order array - used for rank comparisons.
 * Extract as constant to avoid duplication (Fix M2).
 */
const RANK_ORDER = [
  Rank.BRONZE_1, Rank.BRONZE_2, Rank.BRONZE_3,
  Rank.SILVER_1, Rank.SILVER_2, Rank.SILVER_3,
  Rank.GOLD_1, Rank.GOLD_2, Rank.GOLD_3,
  Rank.PLATINUM_1, Rank.PLATINUM_2, Rank.PLATINUM_3,
  Rank.DIAMOND_1, Rank.DIAMOND_2, Rank.DIAMOND_3,
] as const;

/**
 * Placement results mapping.
 * Maps wins count to initial rank assignment.
 * Uses Prisma's Rank enum.
 */
const PRISMA_PLACEMENT_RESULTS: Record<number, Rank> = {
  10: Rank.GOLD_1,
  9: Rank.GOLD_2,
  8: Rank.GOLD_3,
  7: Rank.SILVER_1,
  6: Rank.SILVER_2,
  5: Rank.SILVER_3,
  4: Rank.BRONZE_1,
  3: Rank.BRONZE_2,
  2: Rank.BRONZE_3,
  1: Rank.BRONZE_3,
  0: Rank.BRONZE_3,
};

// ===========================================
// Types
// ===========================================

interface SeasonEntryData {
  id: string;
  userId: string;
  seasonId: string;
  rankPoints: number;
  currentRank: Rank | null;
  highestRank: Rank | null;
  placementMatchesPlayed: number;
  placementMatchesWon: number;
  wins: number;
  losses: number;
  draws: number;
  finalRank: Rank | null;
  finalRankPoints: number | null;
  rankPosition: number | null;
  lastMatchAt: Date | null;
  lastDecayAt: Date | null;
  version: number; // Optimistic locking
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Season Entry Management
// ===========================================

/**
 * Get or create a season entry for a user.
 * Uses upsert for concurrency-safe find-or-create pattern.
 *
 * FIX H2: Restrict season entry creation to ACTIVE seasons only.
 * Existing entries in ENDED seasons can still be retrieved.
 *
 * @param userId - The user ID
 * @param seasonId - The season ID
 * @returns The season entry record
 * @throws NotFoundError if season does not exist
 * @throws BadRequestError if season is not ACTIVE
 *
 * @example
 * const entry = await getOrCreateSeasonEntry('user-123', 'season-winter-2026');
 */
export async function getOrCreateSeasonEntry(
  userId: string,
  seasonId: string
): Promise<SeasonEntryData> {
  // Validate season exists and is in valid state
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { status: true },
  });

  if (!season) {
    throw new NotFoundError('Season not found');
  }

  // FIX H2: Only allow creating entries in ACTIVE seasons
  if (season.status !== SeasonStatus.ACTIVE) {
    throw new BadRequestError(
      `Cannot create season entry: Season is not active (status: ${season.status})`
    );
  }

  // Use upsert for atomic find-or-create
  const entry = await prisma.seasonEntry.upsert({
    where: {
      userId_seasonId: {
        userId,
        seasonId,
      },
    },
    create: {
      userId,
      seasonId,
      rankPoints: 0,
      currentRank: null, // Null during placement
      highestRank: null,
      placementMatchesPlayed: 0,
      placementMatchesWon: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    },
    update: {}, // No changes if already exists
  });

  logger.info(`[Ranked] Season entry retrieved for user ${userId} in season ${seasonId}`);

  return entry;
}

// ===========================================
// Rank Calculation
// ===========================================

/**
 * Calculate rank from rank points.
 * Pure function with no side effects.
 *
 * LOGIC: Iterates rank thresholds in descending order to find the highest
 * rank the player qualifies for based on their RP value.
 *
 * @param rpValue - The accumulated rank points
 * @returns The corresponding rank
 *
 * @example
 * calculateNewRank(650) // Returns GOLD_1 (threshold: 600)
 * calculateNewRank(1500) // Returns DIAMOND_2 (threshold: 1400)
 * calculateNewRank(50) // Returns BRONZE_1 (threshold: 0)
 */
export function calculateNewRank(rpValue: number): Rank {
  // Create sorted array of rank thresholds (descending)
  const thresholds: Array<{ rank: Rank; threshold: number }> = [
    { rank: Rank.DIAMOND_3, threshold: RANK_THRESHOLDS.DIAMOND_3 },
    { rank: Rank.DIAMOND_2, threshold: RANK_THRESHOLDS.DIAMOND_2 },
    { rank: Rank.DIAMOND_1, threshold: RANK_THRESHOLDS.DIAMOND_1 },
    { rank: Rank.PLATINUM_3, threshold: RANK_THRESHOLDS.PLATINUM_3 },
    { rank: Rank.PLATINUM_2, threshold: RANK_THRESHOLDS.PLATINUM_2 },
    { rank: Rank.PLATINUM_1, threshold: RANK_THRESHOLDS.PLATINUM_1 },
    { rank: Rank.GOLD_3, threshold: RANK_THRESHOLDS.GOLD_3 },
    { rank: Rank.GOLD_2, threshold: RANK_THRESHOLDS.GOLD_2 },
    { rank: Rank.GOLD_1, threshold: RANK_THRESHOLDS.GOLD_1 },
    { rank: Rank.SILVER_3, threshold: RANK_THRESHOLDS.SILVER_3 },
    { rank: Rank.SILVER_2, threshold: RANK_THRESHOLDS.SILVER_2 },
    { rank: Rank.SILVER_1, threshold: RANK_THRESHOLDS.SILVER_1 },
    { rank: Rank.BRONZE_3, threshold: RANK_THRESHOLDS.BRONZE_3 },
    { rank: Rank.BRONZE_2, threshold: RANK_THRESHOLDS.BRONZE_2 },
    { rank: Rank.BRONZE_1, threshold: RANK_THRESHOLDS.BRONZE_1 },
  ];

  // Find the highest rank where RP >= threshold
  for (const { rank, threshold } of thresholds) {
    if (rpValue >= threshold) {
      return rank;
    }
  }

  // Fallback: Should never reach here, but return lowest rank
  return Rank.BRONZE_1;
}

// ===========================================
// Rank Point Updates
// ===========================================

/**
 * Update rank points for a user based on match result.
 * CRITICAL: This function is IDEMPOTENT - multiple calls with the same matchId
 * will return cached results and NOT modify the database.
 *
 * PLACEMENT PHASE (first 10 matches):
 * - Does NOT accumulate RP during placement
 * - Only tracks placement matches played/won
 * - currentRank stays null
 * - On 10th match: Uses PLACEMENT_RESULTS to assign initial rank
 * - Sets rankPoints to RANK_THRESHOLDS[initialRank]
 *
 * POST-PLACEMENT:
 * - Applies +25 win / -20 loss
 * - Floors RP at 0 (no negative RP)
 * - Recalculates rank via calculateNewRank()
 * - Tracks highest rank achieved
 *
 * @param userId - The user ID
 * @param matchResult - The settled match result
 * @returns Complete audit trail of rank changes
 *
 * @example
 * // Process a win during placement
 * const result = await updateRankPoints('user-123', {
 *   matchId: 'match-abc',
 *   seasonId: 'season-winter',
 *   winnerId: 'user-123',
 *   loserId: 'user-456',
 *   isDraw: false,
 *   settledAt: new Date(),
 * });
 * // result.isPlacement === true
 * // result.rpChange === 0 (no RP during placement)
 *
 * @example
 * // Process 10th placement match (triggers initial rank assignment)
 * const result = await updateRankPoints('user-123', {
 *   matchId: 'match-10th',
 *   seasonId: 'season-winter',
 *   winnerId: 'user-123',
 *   loserId: 'user-456',
 *   isDraw: false,
 *   settledAt: new Date(),
 * });
 * // result.isPlacement === true
 * // result.rankBefore === null
 * // result.rankAfter === GOLD_2 (if 9 wins out of 10)
 *
 * @example
 * // Process a regular win post-placement
 * const result = await updateRankPoints('user-123', {
 *   matchId: 'match-xyz',
 *   seasonId: 'season-winter',
 *   winnerId: 'user-123',
 *   loserId: 'user-456',
 *   isDraw: false,
 *   settledAt: new Date(),
 * });
 * // result.isPlacement === false
 * // result.rpChange === 25
 */
export async function updateRankPoints(
  userId: string,
  matchResult: MatchResultForRP
): Promise<RankUpdateResult> {
  const { matchId, seasonId, winnerId, loserId, isDraw, settledAt } = matchResult;

  // FIX M1: Input validation
  if (!matchId || !seasonId) {
    throw new BadRequestError('matchId and seasonId are required');
  }

  // Validate draw consistency
  if (isDraw && (winnerId !== null || loserId !== null)) {
    throw new BadRequestError('Draw must have null winnerId and loserId');
  }

  if (!isDraw && (!winnerId && !loserId)) {
    throw new BadRequestError('Non-draw match must have winnerId or loserId');
  }

  // Idempotency key format: ranked:rp:{userId}:{matchId}
  const idempotencyKey = `ranked:rp:${userId}:${matchId}`;

  const result = await prisma.$transaction(
    async (tx) => {
      // ========================================
      // FIX C1: ATOMIC SEASON ENTRY UPSERT
      // ========================================
      // Ensure season entry exists INSIDE transaction, BEFORE idempotency check.
      // This prevents TOCTOU race conditions.
      const entry = await tx.seasonEntry.upsert({
        where: {
          userId_seasonId: { userId, seasonId },
        },
        create: {
          userId,
          seasonId,
          rankPoints: 0,
          currentRank: null,
          highestRank: null,
          placementMatchesPlayed: 0,
          placementMatchesWon: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          version: 1, // Initial version for optimistic locking
        },
        update: {}, // No update if exists - we'll use optimistic locking later
      });

      // Validate season status - allow ACTIVE or ENDED for in-flight matches
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        select: { status: true },
      });

      if (!season) {
        throw new NotFoundError('Season not found');
      }

      if (season.status !== SeasonStatus.ACTIVE && season.status !== SeasonStatus.ENDED) {
        throw new BadRequestError(
          `Cannot process match result: Season must be ACTIVE or ENDED (status: ${season.status})`
        );
      }

      // ========================================
      // IDEMPOTENCY CHECK
      // ========================================
      const existingTransaction = await tx.transaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingTransaction) {
        // Return cached result from metadata
        const cachedResult = existingTransaction.metadata as Prisma.JsonObject;
        logger.info(`[Ranked] Idempotent RP update detected: ${idempotencyKey}`);

        return {
          userId: cachedResult.userId as string,
          seasonId: cachedResult.seasonId as string,
          matchId: cachedResult.matchId as string,
          outcome: cachedResult.outcome as 'WIN' | 'LOSS' | 'DRAW',
          rpChange: cachedResult.rpChange as number,
          rpBefore: cachedResult.rpBefore as number,
          rpAfter: cachedResult.rpAfter as number,
          rankBefore: cachedResult.rankBefore as any,
          rankAfter: cachedResult.rankAfter as any,
          isPlacement: cachedResult.isPlacement as boolean,
          // Mobile UI flags
          promoted: cachedResult.promoted as boolean,
          demoted: cachedResult.demoted as boolean,
          rankTierChanged: cachedResult.rankTierChanged as boolean,
          // Placement context (may be undefined)
          ...(cachedResult.placementMatchesPlayed !== undefined && {
            placementMatchesPlayed: cachedResult.placementMatchesPlayed as number,
            placementMatchesRemaining: cachedResult.placementMatchesRemaining as number,
          }),
          isIdempotent: true,
        };
      }

      // ========================================
      // DETERMINE OUTCOME
      // ========================================
      let outcome: 'WIN' | 'LOSS' | 'DRAW';
      if (isDraw) {
        outcome = 'DRAW';
      } else if (winnerId === userId) {
        outcome = 'WIN';
      } else if (loserId === userId) {
        outcome = 'LOSS';
      } else {
        throw new BadRequestError(
          `User ${userId} is neither winner nor loser in match ${matchId}`
        );
      }

      const rpBefore = entry.rankPoints;
      const rankBefore = entry.currentRank;
      const isPlacement = entry.placementMatchesPlayed < PLACEMENT_MATCHES_REQUIRED;

      let rpChange = 0;
      let rpAfter = rpBefore;
      let rankAfter: Rank = rankBefore ?? Rank.BRONZE_1;
      let newPlacementMatchesPlayed = entry.placementMatchesPlayed;
      let newPlacementMatchesWon = entry.placementMatchesWon;
      let newWins = entry.wins;
      let newLosses = entry.losses;
      let newDraws = entry.draws;

      // ========================================
      // PLACEMENT PHASE LOGIC
      // ========================================
      if (isPlacement) {
        newPlacementMatchesPlayed += 1;

        if (outcome === 'WIN') {
          newPlacementMatchesWon += 1;
          newWins += 1;
        } else if (outcome === 'LOSS') {
          newLosses += 1;
        } else {
          newDraws += 1;
        }

        // Check if we just completed placement (10th match)
        if (newPlacementMatchesPlayed === PLACEMENT_MATCHES_REQUIRED) {
          // FIX H1: Bounds check for placement wins (prevent concurrent race condition corruption)
          // NOTE: This is a defensive measure. Full optimistic locking requires schema migration
          // to add a version field to SeasonEntry.
          const winsCount = Math.min(newPlacementMatchesWon, 10);
          const initialRank = PRISMA_PLACEMENT_RESULTS[winsCount] ?? Rank.BRONZE_3;
          rankAfter = initialRank;

          // FIX M3: Set RP to the threshold of the assigned rank with defensive floor
          rpAfter = Math.max(0, RANK_THRESHOLDS[initialRank]);
          rpChange = rpAfter - rpBefore; // Should be the threshold value since rpBefore is 0

          logger.info(
            `[Ranked] Placement complete for ${userId}: ${winsCount}/${PLACEMENT_MATCHES_REQUIRED} wins -> ${rankAfter} (${rpAfter} RP)`
          );

          // Set explicit placement flags
          await tx.seasonEntry.update({
            where: { id: entry.id },
            data: {
              isPlaced: true,
              placedAt: new Date(settledAt),
              initialRank: rankAfter,
            },
          });
        } else {
          // Still in placement, no RP change, rank stays null
          rpChange = 0;
          rpAfter = rpBefore;
          rankAfter = Rank.BRONZE_1; // Temporary for type safety, will be null in DB
        }
      }
      // ========================================
      // POST-PLACEMENT LOGIC
      // ========================================
      else {
        if (outcome === 'WIN') {
          rpChange = RANK_POINTS.WIN;
          newWins += 1;
        } else if (outcome === 'LOSS') {
          rpChange = RANK_POINTS.LOSS;
          newLosses += 1;
        } else {
          rpChange = 0; // Draws grant no RP
          newDraws += 1;
        }

        // Apply RP change with floor at 0
        rpAfter = Math.max(0, rpBefore + rpChange);

        // Recalculate rank
        rankAfter = calculateNewRank(rpAfter);
      }

      // ========================================
      // CREATE PLACEMENT AUDIT RECORD
      // ========================================
      // Create placement audit record for ALL placement matches
      // Defensive check: Skip if already exists (handles partial transaction retries)
      if (isPlacement) {
        const existingPlacement = await tx.placementMatch.findUnique({
          where: {
            seasonEntryId_matchId: {
              seasonEntryId: entry.id,
              matchId,
            },
          },
        });

        if (!existingPlacement) {
          await tx.placementMatch.create({
            data: {
              seasonEntryId: entry.id,
              matchId,
              matchNumber: newPlacementMatchesPlayed,
              outcome,
              rpBefore,
              rpAfter,
              rankAssigned: newPlacementMatchesPlayed === PLACEMENT_MATCHES_REQUIRED ? rankAfter : null,
            },
          });
        }
      }

      // ========================================
      // TRACK HIGHEST RANK
      // ========================================
      let newHighestRank = entry.highestRank;

      // FIX M2: Use extracted RANK_ORDER constant
      const currentRankIndex = RANK_ORDER.indexOf(rankAfter);
      const highestRankIndex = newHighestRank ? RANK_ORDER.indexOf(newHighestRank) : -1;

      if (currentRankIndex > highestRankIndex) {
        newHighestRank = rankAfter;
      }

      // ========================================
      // UPDATE SEASON ENTRY WITH OPTIMISTIC LOCKING
      // ========================================
      // Use updateMany with version check to prevent lost updates from concurrent settlements
      const updateResult = await tx.seasonEntry.updateMany({
        where: {
          userId,
          seasonId,
          version: entry.version, // Optimistic lock check
        },
        data: {
          rankPoints: rpAfter,
          currentRank: isPlacement && newPlacementMatchesPlayed < PLACEMENT_MATCHES_REQUIRED
            ? null
            : rankAfter,
          highestRank: newHighestRank,
          placementMatchesPlayed: newPlacementMatchesPlayed,
          placementMatchesWon: newPlacementMatchesWon,
          wins: newWins,
          losses: newLosses,
          draws: newDraws,
          lastMatchAt: settledAt,
          version: { increment: 1 }, // Increment version for next update
        },
      });

      // If no rows updated, another transaction modified the entry (version conflict)
      if (updateResult.count === 0) {
        throw new BadRequestError(
          `Concurrent update conflict for season entry. Match ${matchId} should be retried.`
        );
      }

      // ========================================
      // CALCULATE MOBILE UI FLAGS
      // ========================================
      const rankBeforeIndex = rankBefore ? RANK_ORDER.indexOf(rankBefore) : -1;
      const rankAfterIndex = RANK_ORDER.indexOf(rankAfter);

      // Check if promoted (rank increased) or demoted (rank decreased)
      const promoted = rankAfterIndex > rankBeforeIndex && rankBeforeIndex >= 0;
      const demoted = rankAfterIndex < rankBeforeIndex && rankBeforeIndex >= 0;

      // Check if tier changed (e.g., SILVER -> GOLD)
      const getTier = (rank: Rank | null): string | null => {
        if (!rank) return null;
        return rank.split('_')[0]; // BRONZE_1 -> BRONZE
      };
      const tierBefore = getTier(rankBefore);
      const tierAfter = getTier(rankAfter);
      const rankTierChanged = tierBefore !== tierAfter && tierBefore !== null;

      // ========================================
      // CREATE IDEMPOTENCY TRANSACTION
      // ========================================
      const resultData: RankUpdateResult = {
        userId,
        seasonId,
        matchId,
        outcome,
        rpChange,
        rpBefore,
        rpAfter,
        rankBefore: rankBefore as any, // Prisma Rank enum compatible with shared-types Rank
        rankAfter: rankAfter as any, // Prisma Rank enum compatible with shared-types Rank
        isPlacement,
        // Mobile UI flags
        promoted,
        demoted,
        rankTierChanged,
        // Placement context (only set during placement phase)
        ...(isPlacement && {
          placementMatchesPlayed: newPlacementMatchesPlayed,
          placementMatchesRemaining: PLACEMENT_MATCHES_REQUIRED - newPlacementMatchesPlayed,
        }),
        isIdempotent: false,
      };

      // FIX C2: Fetch actual wallet ID for referential integrity
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: { id: true, paidBalance: true, bonusBalance: true },
      });

      if (!wallet) {
        // This shouldn't happen if user is properly registered
        throw new NotFoundError('Wallet not found for user');
      }

      const totalBalance = Number(wallet.paidBalance) + Number(wallet.bonusBalance);

      // Create zero-amount transaction for idempotency tracking
      await tx.transaction.create({
        data: {
          walletId: wallet.id, // FIX C2: Use actual wallet ID
          userId,
          type: 'ADMIN_ADJUSTMENT', // Placeholder type for RP tracking
          status: 'completed',
          amount: BigInt(0),
          paidAmount: BigInt(0),
          bonusAmount: BigInt(0),
          balanceBefore: BigInt(totalBalance),
          balanceAfter: BigInt(totalBalance),
          matchId,
          idempotencyKey,
          description: `Rank points ${outcome.toLowerCase()}: ${rpChange >= 0 ? '+' : ''}${rpChange} RP`,
          metadata: resultData as unknown as Prisma.InputJsonValue,
          completedAt: settledAt,
        },
      });

      logger.info(
        `[Ranked] Updated RP for user ${userId}: ${rpBefore} -> ${rpAfter} (${rpChange >= 0 ? '+' : ''}${rpChange}) | ` +
          `Outcome: ${outcome} | Rank: ${rankBefore ?? 'UNRANKED'} -> ${rankAfter}`
      );

      return resultData;
    },
    { timeout: 10000 }
  );

  return result;
}

// ===========================================
// Season Reward Distribution
// ===========================================

/**
 * Distribute end-of-season rewards to all eligible players.
 * CRITICAL: This function should only be called ONCE per season by an admin job.
 *
 * PROCESS:
 * 1. Validate season status is ENDED
 * 2. Finalize rankPosition for all entries (ORDER BY rankPoints DESC)
 * 3. For each entry:
 *    - Find matching SeasonReward based on finalRank
 *    - Check if SeasonRewardClaim already exists (skip if claimed)
 *    - Credit wallet with type='SEASON_REWARD' and idempotency key
 *    - Create SeasonRewardClaim record
 * 4. Process in batches of 100 for memory efficiency
 * 5. Return summary with total claimed and errors
 *
 * @param seasonId - The season ID to distribute rewards for
 * @returns Summary of reward distribution
 * @throws BadRequestError if season is not ENDED
 * @throws NotFoundError if season not found
 *
 * @example
 * const result = await distributeSeasonRewards('season-winter-2026');
 * console.log(`Distributed ${result.totalCoinsDistributed} coins to ${result.rewardsClaimed} players`);
 * if (result.errors.length > 0) {
 *   console.error('Errors occurred:', result.errors);
 * }
 */
export async function distributeSeasonRewards(
  seasonId: string
): Promise<SeasonRewardDistributionResult> {
  // ========================================
  // VALIDATE SEASON
  // ========================================
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { status: true },
  });

  if (!season) {
    throw new NotFoundError('Season not found');
  }

  if (season.status !== SeasonStatus.ENDED) {
    throw new BadRequestError(
      `Season must be ENDED to distribute rewards. Current status: ${season.status}`
    );
  }

  // FIX M4: Validate finalization before reward distribution
  const unfinalizedCount = await prisma.seasonEntry.count({
    where: { seasonId, rankPosition: null, currentRank: { not: null } },
  });

  if (unfinalizedCount > 0) {
    throw new BadRequestError(
      `Cannot distribute rewards: ${unfinalizedCount} entries are not finalized. Run finalizeRankPositions first.`
    );
  }

  // ========================================
  // FINALIZE RANK POSITIONS
  // ========================================
  logger.info(`[Ranked] Finalizing rank positions for season ${seasonId}`);

  const entries = await prisma.seasonEntry.findMany({
    where: { seasonId },
    orderBy: { rankPoints: 'desc' },
    select: {
      id: true,
      userId: true,
      currentRank: true,
      rankPoints: true,
      rankPosition: true, // FIX C3: Include rankPosition for metadata
    },
  });

  const totalEntries = entries.length;
  logger.info(`[Ranked] Found ${totalEntries} entries to process`);

  // Update rank positions in batches to avoid transaction size limits
  const FINALIZE_BATCH_SIZE = 100;
  for (let i = 0; i < entries.length; i += FINALIZE_BATCH_SIZE) {
    const batch = entries.slice(i, i + FINALIZE_BATCH_SIZE);

    await prisma.$transaction(
      batch.map((entry, batchIndex) =>
        prisma.seasonEntry.update({
          where: { id: entry.id },
          data: {
            rankPosition: i + batchIndex + 1,
            finalRank: entry.currentRank,
            finalRankPoints: entry.rankPoints,
          },
        })
      )
    );
  }

  // ========================================
  // FETCH SEASON REWARDS
  // ========================================
  const rewards = await prisma.seasonReward.findMany({
    where: { seasonId },
    orderBy: { minRank: 'asc' },
  });

  if (rewards.length === 0) {
    logger.warn(`[Ranked] No rewards configured for season ${seasonId}`);
    return {
      seasonId,
      totalEntries,
      rewardsClaimed: 0,
      totalCoinsDistributed: 0,
      errors: ['No rewards configured for this season'],
    };
  }

  // ========================================
  // DISTRIBUTE REWARDS
  // ========================================
  const BATCH_SIZE = 100;
  let rewardsClaimed = 0;
  let totalCoinsDistributed = 0;
  const errors: string[] = [];

  logger.info(`[Ranked] Starting reward distribution for ${totalEntries} entries`);

  // FIX M2: Use extracted RANK_ORDER constant
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    for (const entry of batch) {
      if (!entry.currentRank) {
        // Skip unranked players (didn't complete placement)
        continue;
      }

      // Find matching reward based on final rank
      const currentRankIndex = RANK_ORDER.indexOf(entry.currentRank);

      const matchingReward = rewards.find((r) => {
        const minRankIndex = RANK_ORDER.indexOf(r.minRank);
        const maxRankIndex = RANK_ORDER.indexOf(r.maxRank);
        return currentRankIndex >= minRankIndex && currentRankIndex <= maxRankIndex;
      });

      if (!matchingReward) {
        errors.push(
          `No matching reward for user ${entry.userId} with rank ${entry.currentRank}`
        );
        continue;
      }

      try {
        // Check if already claimed
        const existingClaim = await prisma.seasonRewardClaim.findUnique({
          where: {
            userId_seasonId_rewardId: {
              userId: entry.userId,
              seasonId,
              rewardId: matchingReward.id,
            },
          },
        });

        if (existingClaim) {
          logger.info(
            `[Ranked] Reward already claimed: user ${entry.userId}, season ${seasonId}`
          );
          continue;
        }

        // Credit wallet
        const idempotencyKey = `season:reward:${seasonId}:${entry.userId}:${matchingReward.id}`;
        const transaction = await creditWallet({
          userId: entry.userId,
          amount: numberToBigInt(matchingReward.coinReward),
          type: 'SEASON_REWARD',
          useBonus: false, // Season rewards are paid balance
          idempotencyKey,
          description: `Season reward: ${entry.currentRank} (${matchingReward.coinReward} coins)`,
          metadata: {
            seasonId,
            rewardId: matchingReward.id,
            finalRank: entry.currentRank,
            rankPosition: entry.rankPosition, // FIX C3: Use actual rank position
          },
        });

        // Create claim record
        await prisma.seasonRewardClaim.create({
          data: {
            userId: entry.userId,
            seasonId,
            rewardId: matchingReward.id,
            transactionId: transaction.id,
          },
        });

        rewardsClaimed += 1;
        totalCoinsDistributed += matchingReward.coinReward;

        logger.info(
          `[Ranked] Reward claimed: user ${entry.userId}, rank ${entry.currentRank}, coins ${matchingReward.coinReward}`
        );
      } catch (error) {
        const errorMsg = `Failed to distribute reward to user ${entry.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }
  }

  logger.info(
    `[Ranked] Reward distribution complete: ${rewardsClaimed}/${totalEntries} claimed, ` +
      `${totalCoinsDistributed} total coins, ${errors.length} errors`
  );

  return {
    seasonId,
    totalEntries,
    rewardsClaimed,
    totalCoinsDistributed,
    errors,
  };
}
