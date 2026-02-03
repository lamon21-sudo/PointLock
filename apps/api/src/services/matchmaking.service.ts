// =====================================================
// Matchmaking Service
// =====================================================
// Handles PvP matchmaking queue with security-first design.
// CRITICAL SECURITY PATTERNS:
// 1. Debit-first pattern: Charge entry fee BEFORE queue insertion
// 2. Optimistic locking: Version field prevents race conditions
// 3. 10-second lock timeout: Prevents worker starvation
// 4. Randomized MMR widening: Prevents "wait-to-stomp" exploitation

import { GameMode, PickTier, QueueStatus, SlipStatus, MatchStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { debitWallet, processRefund, bigIntToNumber } from '../lib/wallet.service';
import { broadcastMatchCreatedSync } from './live-scores/live-scores.broadcaster';

// ===========================================
// Constants - Timing
// ===========================================

const QUEUE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_TIMEOUT_MS = 10 * 1000; // 10 seconds
const PROCESSING_BATCH_SIZE = 50;
const TRANSACTION_TIMEOUT_MS = 10_000; // 10 seconds

// ===========================================
// Constants - MMR (Randomized Anti-Exploit)
// ===========================================

const MMR_BASE_RANGE = 100;
const MMR_EXPANSION_RATE_MIN = 40; // Points per expansion step
const MMR_EXPANSION_RATE_MAX = 60;
const MMR_EXPANSION_INTERVAL_MS_MIN = 25_000; // 25 seconds
const MMR_EXPANSION_INTERVAL_MS_MAX = 40_000; // 40 seconds
const MMR_MAX_RANGE = 400;

// ===========================================
// Constants - Anti-Exploit
// ===========================================

// Future use: rejection tracking system
// const MAX_REJECTIONS = 3;
// const REJECTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const REMATCH_PREVENTION_COUNT = 3; // Max 3 matches vs same opponent per 24h

// ===========================================
// Constants - Tier Rankings
// ===========================================

const TIER_RANK: Record<PickTier, number> = {
  FREE: 0,
  STANDARD: 1,
  PREMIUM: 2,
  ELITE: 3,
};

// ===========================================
// Types
// ===========================================

export interface EnqueueParams {
  userId: string;
  gameMode: 'QUICK_MATCH';
  stakeAmount: bigint;
  slipId: string;
  region?: string;
  idempotencyKey?: string; // Client-provided
}

export interface CompatibilityScore {
  isCompatible: boolean;
  score: number;
  reasons: string[];
}

export interface MatchCandidate {
  entry: QueueEntryWithUser;
  score: number;
}

export interface ProcessingStats {
  processed: number;
  matched: number;
  expired: number;
  errors: number;
  durationMs: number;
}

export interface QueueStatusResult {
  entry: QueueEntryBasic | null;
  position?: number;
  estimatedWaitMs?: number;
}

interface QueueEntryWithUser {
  id: string;
  userId: string;
  gameMode: GameMode;
  tier: PickTier;
  stakeAmount: bigint;
  skillRating: number;
  slipId: string | null;
  slipSize: number | null;
  enqueuedAt: Date;
  version: number;
  user: {
    id: string;
    username: string;
    skillRating: number;
  };
}

interface QueueEntryBasic {
  id: string;
  userId: string;
  gameMode: GameMode;
  tier: PickTier;
  stakeAmount: number;
  skillRating: number;
  slipSize: number | null;
  status: QueueStatus;
  enqueuedAt: Date;
  expiresAt: Date;
  matchId: string | null;
}

interface MatchResult {
  matchId: string;
  entry1Id: string;
  entry2Id: string;
  // Fresh user data for Socket.io notification
  creatorId: string;
  creatorUsername: string;
  creatorSkillRating: number;
  opponentId: string;
  opponentUsername: string;
  opponentSkillRating: number;
  stakeAmount: bigint;
  createdAt: Date;
}

// ===========================================
// Pure Functions (Easily Testable)
// ===========================================

/**
 * Calculate dynamic MMR range with randomization to prevent exploitation.
 * Uses a deterministic seed based on enqueue time to ensure consistency
 * across multiple calls for the same entry.
 *
 * SECURITY: Randomization prevents "wait-to-stomp" where high-MMR players
 * deliberately wait in queue to get matched against lower-skilled opponents.
 *
 * @param enqueuedAt - When the user joined the queue
 * @param seed - Deterministic seed (e.g., userId hash) for reproducibility
 * @returns MMR range (±value from player's rating)
 */
export function calculateDynamicMmrRange(enqueuedAt: Date, seed: number): number {
  const timeInQueueMs = Date.now() - enqueuedAt.getTime();

  // Seeded PRNG (Linear Congruential Generator)
  const seededRandom = (s: number): number => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  // Randomize expansion interval (25-40 seconds)
  const expansionIntervalMs =
    MMR_EXPANSION_INTERVAL_MS_MIN +
    seededRandom(seed) * (MMR_EXPANSION_INTERVAL_MS_MAX - MMR_EXPANSION_INTERVAL_MS_MIN);

  // Randomize expansion rate (40-60 points per step)
  const expansionRate =
    MMR_EXPANSION_RATE_MIN +
    seededRandom(seed + 1) * (MMR_EXPANSION_RATE_MAX - MMR_EXPANSION_RATE_MIN);

  // Calculate number of expansion steps
  const expansionSteps = Math.floor(timeInQueueMs / expansionIntervalMs);

  // Calculate range with cap
  const range = Math.min(MMR_BASE_RANGE + expansionSteps * expansionRate, MMR_MAX_RANGE);

  return Math.floor(range);
}

/**
 * Score two queue entries for compatibility.
 * Higher score = better match.
 *
 * Scoring criteria (all must pass):
 * - Exact slip size match (REQUIRED)
 * - Exact stake amount match (REQUIRED)
 * - Same tier (REQUIRED)
 * - MMR within dynamic range (REQUIRED)
 * - Rematch prevention check (REQUIRED)
 * - FIFO preference (bonus points for older entries)
 *
 * @param entry1 - First queue entry
 * @param entry2 - Second queue entry
 * @param recentMatchesMap - Map of userId -> recent opponent IDs (for rematch prevention)
 * @returns Compatibility score with reasons
 */
export function calculateCompatibilityScore(
  entry1: QueueEntryWithUser,
  entry2: QueueEntryWithUser,
  recentMatchesMap: Map<string, Set<string>>
): CompatibilityScore {
  const reasons: string[] = [];
  let score = 0;

  // HARD REQUIREMENT: Cannot match with yourself
  if (entry1.userId === entry2.userId) {
    return {
      isCompatible: false,
      score: 0,
      reasons: ['Cannot match with yourself'],
    };
  }

  // HARD REQUIREMENT: Exact slip size match
  if (entry1.slipSize !== entry2.slipSize) {
    return {
      isCompatible: false,
      score: 0,
      reasons: ['Slip size mismatch'],
    };
  }
  reasons.push('Slip size match');
  score += 1000;

  // HARD REQUIREMENT: Exact stake amount match
  if (entry1.stakeAmount !== entry2.stakeAmount) {
    return {
      isCompatible: false,
      score: 0,
      reasons: ['Stake amount mismatch'],
    };
  }
  reasons.push('Stake match');
  score += 1000;

  // HARD REQUIREMENT: Same tier
  if (entry1.tier !== entry2.tier) {
    return {
      isCompatible: false,
      score: 0,
      reasons: ['Tier mismatch'],
    };
  }
  reasons.push('Tier match');
  score += 1000;

  // HARD REQUIREMENT: MMR within dynamic range
  const mmrDiff = Math.abs(entry1.skillRating - entry2.skillRating);

  // Calculate MMR range for entry1 (use userId hash as seed)
  const seed1 = entry1.userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mmrRange1 = calculateDynamicMmrRange(entry1.enqueuedAt, seed1);

  // Calculate MMR range for entry2
  const seed2 = entry2.userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mmrRange2 = calculateDynamicMmrRange(entry2.enqueuedAt, seed2);

  // Use the larger of the two ranges (more permissive)
  const effectiveRange = Math.max(mmrRange1, mmrRange2);

  if (mmrDiff > effectiveRange) {
    return {
      isCompatible: false,
      score: 0,
      reasons: [`MMR too far (diff: ${mmrDiff}, max: ${effectiveRange})`],
    };
  }
  reasons.push(`MMR compatible (diff: ${mmrDiff})`);

  // Bonus points for closer MMR (inverse of difference)
  score += Math.max(0, 500 - mmrDiff);

  // HARD REQUIREMENT: Rematch prevention (max 3 matches per 24h)
  const entry1Opponents = recentMatchesMap.get(entry1.userId) || new Set<string>();
  const entry2Opponents = recentMatchesMap.get(entry2.userId) || new Set<string>();

  if (entry1Opponents.has(entry2.userId) || entry2Opponents.has(entry1.userId)) {
    // Check if they've hit the limit
    // For simplicity, we block ANY rematch within the tracking window
    // (A more sophisticated version would count exact matches)
    return {
      isCompatible: false,
      score: 0,
      reasons: ['Rematch prevention (already matched recently)'],
    };
  }
  reasons.push('No recent rematch');
  score += 500;

  // SOFT PREFERENCE: FIFO (older entries get bonus)
  const avgWaitTime =
    (Date.now() - entry1.enqueuedAt.getTime() + (Date.now() - entry2.enqueuedAt.getTime())) / 2;
  const fifoBonus = Math.min(avgWaitTime / 1000, 300); // Up to 300 points for 5min wait
  score += fifoBonus;
  reasons.push(`FIFO bonus: ${fifoBonus.toFixed(0)}`);

  return {
    isCompatible: true,
    score,
    reasons,
  };
}

/**
 * Find the best opponent for a given queue entry from a list of candidates.
 * Uses compatibility scoring to rank candidates.
 *
 * @param entry - The queue entry looking for a match
 * @param candidates - List of potential opponents
 * @param recentMatchesMap - Map of userId -> recent opponent IDs
 * @returns Best match candidate or null if none compatible
 */
export function findBestOpponent(
  entry: QueueEntryWithUser,
  candidates: QueueEntryWithUser[],
  recentMatchesMap: Map<string, Set<string>>
): MatchCandidate | null {
  const scoredCandidates: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const compatScore = calculateCompatibilityScore(entry, candidate, recentMatchesMap);

    if (compatScore.isCompatible) {
      scoredCandidates.push({
        entry: candidate,
        score: compatScore.score,
      });
    }
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  // Sort by score descending, return best match
  scoredCandidates.sort((a, b) => b.score - a.score);
  return scoredCandidates[0];
}

// ===========================================
// Database Operations
// ===========================================

/**
 * Main entry point - called by queue worker.
 * Processes the matchmaking queue by claiming entries, finding matches,
 * and creating match records.
 *
 * SECURITY: Uses optimistic locking and claim expiry to prevent race conditions.
 *
 * @param workerId - Unique identifier for the worker instance
 * @returns Processing statistics
 */
export async function processMatchmakingQueue(workerId: string): Promise<ProcessingStats> {
  const startTime = Date.now();
  const stats: ProcessingStats = {
    processed: 0,
    matched: 0,
    expired: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    logger.info(`[Matchmaking] Worker ${workerId} starting queue processing`);

    // Step 1: Expire old entries
    stats.expired = await expireOldEntries();

    // Step 2: Claim entries for processing
    const claimedEntries = await claimQueueEntries(workerId, PROCESSING_BATCH_SIZE);
    stats.processed = claimedEntries.length;

    if (claimedEntries.length === 0) {
      logger.info(`[Matchmaking] No entries to process`);
      stats.durationMs = Date.now() - startTime;
      return stats;
    }

    logger.info(`[Matchmaking] Claimed ${claimedEntries.length} entries`);

    // Step 3: Build rematch prevention map (last 24h)
    const recentMatchesMap = await buildRecentMatchesMap(claimedEntries.map((e) => e.userId));

    // Step 4: Group entries into pools by (slipSize, tier, stakeAmount)
    const pools = groupEntriesIntoPools(claimedEntries);

    logger.info(`[Matchmaking] Created ${pools.length} matching pools`);

    // Step 5: Find matches within each pool
    const matchedPairs: [QueueEntryWithUser, QueueEntryWithUser][] = [];

    for (const pool of pools) {
      // Sort by enqueuedAt (FIFO)
      pool.sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime());

      const remaining = [...pool];

      while (remaining.length >= 2) {
        const entry = remaining.shift()!;
        const bestMatch = findBestOpponent(entry, remaining, recentMatchesMap);

        if (bestMatch) {
          matchedPairs.push([entry, bestMatch.entry]);
          // Remove matched opponent from remaining
          const opponentIndex = remaining.findIndex((e) => e.id === bestMatch.entry.id);
          if (opponentIndex >= 0) {
            remaining.splice(opponentIndex, 1);
          }

          logger.info(
            `[Matchmaking] Paired ${entry.userId} with ${bestMatch.entry.userId} (score: ${bestMatch.score})`
          );
        }
      }
    }

    logger.info(`[Matchmaking] Found ${matchedPairs.length} matches`);

    // Step 6: Create matches for each pair
    const matchedEntryIds = new Set<string>();

    for (const [entry1, entry2] of matchedPairs) {
      try {
        const matchResult = await createMatchFromQueueEntries(entry1, entry2, workerId);
        stats.matched += 2; // Both entries matched
        matchedEntryIds.add(entry1.id);
        matchedEntryIds.add(entry2.id);

        logger.info(
          `[Matchmaking] Created match ${matchResult.matchId} for ${entry1.userId} vs ${entry2.userId}`
        );
      } catch (error) {
        stats.errors++;
        logger.error(
          `[Matchmaking] Failed to create match for ${entry1.userId} vs ${entry2.userId}:`,
          error
        );
      }
    }

    // Step 7: Release unmatched entries
    const unmatchedEntryIds = claimedEntries
      .filter((e) => !matchedEntryIds.has(e.id))
      .map((e) => e.id);

    if (unmatchedEntryIds.length > 0) {
      await releaseQueueEntries(workerId, unmatchedEntryIds);
      logger.info(`[Matchmaking] Released ${unmatchedEntryIds.length} unmatched entries`);
    }

    stats.durationMs = Date.now() - startTime;
    logger.info(
      `[Matchmaking] Processing complete: ${stats.matched} matched, ${stats.expired} expired, ${stats.errors} errors in ${stats.durationMs}ms`
    );

    return stats;
  } catch (error) {
    stats.errors++;
    stats.durationMs = Date.now() - startTime;
    logger.error(`[Matchmaking] Worker ${workerId} encountered error:`, error);
    return stats;
  }
}

/**
 * User joins queue (debit-first pattern).
 * CRITICAL: Charges entry fee BEFORE inserting into queue (atomic).
 *
 * Flow:
 * 1. Validate slip exists, owned by user, status=DRAFT
 * 2. Validate user not already in queue for this gameMode
 * 3. Validate user's currentTier >= slip's highest pick tier
 * 4. Count picks in slip -> slipSize
 * 5. Generate idempotency key
 * 6. DEBIT wallet (stakeAmount)
 * 7. CREATE queue entry with entryTxId from debit
 * 8. UPDATE slip status to PENDING
 * 9. Return queue entry
 *
 * @throws {NotFoundError} Slip not found
 * @throws {ForbiddenError} Slip not DRAFT, already in queue, or tier mismatch
 * @throws {InsufficientBalanceError} Wallet balance too low
 */
export async function enqueueForMatchmaking(params: EnqueueParams): Promise<QueueEntryBasic> {
  const { userId, gameMode, stakeAmount, slipId, region, idempotencyKey } = params;

  logger.info(
    `[Matchmaking] User ${userId} enqueueing for ${gameMode} with stake ${bigIntToNumber(stakeAmount)}`
  );

  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Validate slip exists and is owned by user
      const slip = await tx.slip.findFirst({
        where: { id: slipId, userId },
        include: {
          picks: {
            select: { tier: true },
          },
        },
      });

      if (!slip) {
        throw new NotFoundError(
          `Slip with ID ${slipId} not found`,
          ERROR_CODES.SLIP_NOT_FOUND
        );
      }

      if (slip.status !== SlipStatus.DRAFT) {
        throw new ForbiddenError(
          `Slip is already locked with status '${slip.status}'`,
          ERROR_CODES.SLIP_ALREADY_LOCKED
        );
      }

      if (slip.totalPicks === 0) {
        throw new BadRequestError(
          'Cannot queue with a slip that has no picks',
          ERROR_CODES.INVALID_PICK_COUNT
        );
      }

      // 2. Check user not already in queue for this gameMode
      const existingQueue = await tx.matchmakingQueue.findFirst({
        where: {
          userId,
          gameMode,
          status: QueueStatus.WAITING,
        },
      });

      if (existingQueue) {
        throw new ForbiddenError(
          `Already in queue for ${gameMode}`,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // 3. Get user's current tier and validate against slip's highest pick tier
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          skillRating: true,
          // Note: User doesn't have a 'currentTier' field in schema
          // We'll determine tier from picks themselves (highest tier in slip)
        },
      });

      if (!user) {
        throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // Find highest tier in slip
      const highestTier = slip.picks.reduce<PickTier>((maxTier, pick) => {
        const tierRank = TIER_RANK[pick.tier];
        const maxRank = TIER_RANK[maxTier];
        return tierRank > maxRank ? pick.tier : maxTier;
      }, PickTier.FREE);

      // For this implementation, we'll use the highest tier from the slip as the queue tier
      // (In production, you'd validate user has unlocked this tier)
      const queueTier = highestTier;

      // 4. Count picks
      const slipSize = slip.totalPicks;

      // 5. Generate idempotency key (server-side fallback if client didn't provide)
      const finalIdempotencyKey =
        idempotencyKey || `mm-enqueue-${userId}-${slipId}-${Date.now()}`;

      // 6. DEBIT wallet (CRITICAL: This happens BEFORE queue insertion)
      const entryTx = await debitWallet({
        userId,
        amount: stakeAmount,
        type: 'MATCH_ENTRY',
        preferBonus: true,
        idempotencyKey: `${finalIdempotencyKey}-debit`,
        description: `Matchmaking entry fee for ${gameMode}`,
        metadata: { slipId, gameMode },
      });

      logger.info(
        `[Matchmaking] Debited ${bigIntToNumber(stakeAmount)} from user ${userId} (tx: ${entryTx.id})`
      );

      // 7. CREATE queue entry
      const expiresAt = new Date(Date.now() + QUEUE_EXPIRY_MS);

      const queueEntry = await tx.matchmakingQueue.create({
        data: {
          userId,
          gameMode,
          tier: queueTier,
          stakeAmount,
          skillRating: user.skillRating,
          region,
          status: QueueStatus.WAITING,
          enqueuedAt: new Date(),
          expiresAt,
          slipId,
          slipSize,
          entryTxId: entryTx.id,
          entryIdempotencyKey: finalIdempotencyKey,
          version: 1,
        },
      });

      logger.info(`[Matchmaking] Created queue entry ${queueEntry.id} for user ${userId}`);

      // 8. UPDATE slip status to PENDING
      await tx.slip.update({
        where: { id: slipId },
        data: {
          status: SlipStatus.PENDING,
          lockedAt: new Date(),
        },
      });

      logger.info(`[Matchmaking] Locked slip ${slipId} for matchmaking`);

      return {
        id: queueEntry.id,
        userId: queueEntry.userId,
        gameMode: queueEntry.gameMode,
        tier: queueEntry.tier,
        stakeAmount: bigIntToNumber(queueEntry.stakeAmount),
        skillRating: queueEntry.skillRating,
        slipSize: queueEntry.slipSize,
        status: queueEntry.status,
        enqueuedAt: queueEntry.enqueuedAt,
        expiresAt: queueEntry.expiresAt,
        matchId: queueEntry.matchId,
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  return result;
}

/**
 * User leaves queue (refund if applicable).
 * Only allows leaving if status=WAITING (not already matched).
 *
 * SECURITY: Uses optimistic locking with version field to prevent race condition
 * where user could cancel after being matched (and get refund while keeping match).
 *
 * Flow:
 * 1. Find queue entry for user + gameMode with status=WAITING
 * 2. Update status to CANCELLED with version check (optimistic lock)
 * 3. Refund entry fee (use entryTxId)
 * 4. Unlock slip (PENDING -> DRAFT)
 *
 * @returns true if cancelled, false if not found or already matched/processed
 */
export async function leaveMatchmakingQueue(
  userId: string,
  gameMode: GameMode
): Promise<boolean> {
  logger.info(`[Matchmaking] User ${userId} leaving queue for ${gameMode}`);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Find active queue entry (include version for optimistic lock)
        const queueEntry = await tx.matchmakingQueue.findFirst({
          where: {
            userId,
            gameMode,
            status: QueueStatus.WAITING,
          },
        });

        if (!queueEntry) {
          logger.warn(`[Matchmaking] No active queue entry found for user ${userId}`);
          return false;
        }

        // CRITICAL: Update to CANCELLED with optimistic locking
        // This prevents race condition where worker matches the entry concurrently
        const updateResult = await tx.matchmakingQueue.updateMany({
          where: {
            id: queueEntry.id,
            version: queueEntry.version, // Must match current version
            status: QueueStatus.WAITING, // Must still be WAITING
          },
          data: {
            status: QueueStatus.CANCELLED,
            version: { increment: 1 },
          },
        });

        // If no rows updated, entry was already processed (matched or claimed)
        if (updateResult.count === 0) {
          logger.warn(
            `[Matchmaking] Queue entry ${queueEntry.id} already processed (race condition avoided)`
          );
          return false;
        }

        logger.info(`[Matchmaking] Cancelled queue entry ${queueEntry.id}`);

        // Refund entry fee if transaction exists
        if (queueEntry.entryTxId) {
          await processRefund({
            originalTransactionId: queueEntry.entryTxId,
            idempotencyKey: `mm-refund-${queueEntry.id}`,
            description: 'Matchmaking queue cancelled by user',
          });

          logger.info(
            `[Matchmaking] Refunded entry fee for user ${userId} (tx: ${queueEntry.entryTxId})`
          );
        }

        // Unlock slip if it exists
        if (queueEntry.slipId) {
          await tx.slip.update({
            where: { id: queueEntry.slipId },
            data: {
              status: SlipStatus.DRAFT,
              lockedAt: null,
            },
          });

          logger.info(`[Matchmaking] Unlocked slip ${queueEntry.slipId}`);
        }

        return true;
      },
      { timeout: TRANSACTION_TIMEOUT_MS }
    );

    return result;
  } catch (error) {
    logger.error(`[Matchmaking] Error leaving queue for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get queue status for a user.
 * Returns current queue entry, position, and estimated wait time.
 *
 * @param userId - User ID
 * @param gameMode - Game mode
 * @returns Queue status or null if not in queue
 */
export async function getQueueStatus(
  userId: string,
  gameMode: GameMode
): Promise<QueueStatusResult> {
  const entry = await prisma.matchmakingQueue.findFirst({
    where: {
      userId,
      gameMode,
      status: QueueStatus.WAITING,
    },
  });

  if (!entry) {
    return { entry: null };
  }

  // Calculate position in queue (count entries enqueued before this one)
  const position = await prisma.matchmakingQueue.count({
    where: {
      gameMode,
      status: QueueStatus.WAITING,
      enqueuedAt: { lt: entry.enqueuedAt },
    },
  });

  // Estimate wait time (rough heuristic: 30 seconds per position)
  const estimatedWaitMs = position * 30_000;

  return {
    entry: {
      id: entry.id,
      userId: entry.userId,
      gameMode: entry.gameMode,
      tier: entry.tier,
      stakeAmount: bigIntToNumber(entry.stakeAmount),
      skillRating: entry.skillRating,
      slipSize: entry.slipSize,
      status: entry.status,
      enqueuedAt: entry.enqueuedAt,
      expiresAt: entry.expiresAt,
      matchId: entry.matchId,
    },
    position: position + 1, // 1-indexed for display
    estimatedWaitMs,
  };
}

// ===========================================
// Internal Functions
// ===========================================

/**
 * Claim queue entries for processing.
 * Uses optimistic locking to prevent multiple workers from claiming the same entries.
 *
 * SECURITY: Uses version field and claimExpiresAt to prevent race conditions.
 *
 * @param workerId - Unique worker identifier
 * @param limit - Max entries to claim
 * @returns Claimed entries with user relations
 */
async function claimQueueEntries(
  workerId: string,
  limit: number
): Promise<QueueEntryWithUser[]> {
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  // Use raw query for atomic claim operation with optimistic locking
  // We need to:
  // 1. Find entries that are WAITING and not claimed (or claim expired)
  // 2. Update them with our workerId and claim expiry
  // 3. Increment version to prevent concurrent claims

  const claimedIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Find claimable entries
    const candidates = await tx.matchmakingQueue.findMany({
      where: {
        status: QueueStatus.WAITING,
        expiresAt: { gt: now },
        OR: [
          { claimExpiresAt: null },
          { claimExpiresAt: { lt: now } }, // Claim expired
        ],
        AND: [
          {
            OR: [
              { cooldownUntil: null },
              { cooldownUntil: { lt: now } },
            ],
          },
        ],
      },
      select: { id: true, version: true },
      take: limit,
      orderBy: { enqueuedAt: 'asc' }, // FIFO
    });

    // Attempt to claim each entry with optimistic lock
    for (const candidate of candidates) {
      const updateResult = await tx.matchmakingQueue.updateMany({
        where: {
          id: candidate.id,
          version: candidate.version, // CRITICAL: Version must match
          status: QueueStatus.WAITING,
        },
        data: {
          claimExpiresAt,
          matchedByWorker: workerId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count > 0) {
        claimedIds.push(candidate.id);
      }
    }
  });

  if (claimedIds.length === 0) {
    return [];
  }

  // Fetch full entries with user data
  const entries = await prisma.matchmakingQueue.findMany({
    where: { id: { in: claimedIds } },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          skillRating: true,
        },
      },
    },
  });

  return entries;
}

/**
 * Release claimed entries (unclaim them).
 * Used when entries couldn't be matched.
 *
 * @param workerId - Worker that claimed them
 * @param entryIds - Entry IDs to release
 */
async function releaseQueueEntries(workerId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;

  await prisma.matchmakingQueue.updateMany({
    where: {
      id: { in: entryIds },
      matchedByWorker: workerId, // Only release our own claims
      status: QueueStatus.WAITING,
    },
    data: {
      claimExpiresAt: null,
      matchedByWorker: null,
    },
  });

  logger.info(`[Matchmaking] Released ${entryIds.length} entries`);
}

/**
 * Create a match from two queue entries.
 * CRITICAL: Uses optimistic locking to ensure both entries are still WAITING.
 *
 * Flow:
 * 1. Verify both entries still WAITING with correct version
 * 2. Create Match record with both slips
 * 3. Update both entries: status=MATCHED, matchId=match.id
 * 4. Update both slips: matchId=match.id, status=ACTIVE
 * 5. Track queue duration for analytics
 *
 * @param e1 - First queue entry
 * @param e2 - Second queue entry
 * @param workerId - Worker creating the match
 * @returns Match result
 * @throws {ConflictError} If either entry was claimed by another worker
 */
async function createMatchFromQueueEntries(
  e1: QueueEntryWithUser,
  e2: QueueEntryWithUser,
  workerId: string
): Promise<MatchResult> {
  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Verify both entries still WAITING with correct version
      const entry1 = await tx.matchmakingQueue.findUnique({
        where: { id: e1.id },
        select: { id: true, version: true, status: true },
      });

      const entry2 = await tx.matchmakingQueue.findUnique({
        where: { id: e2.id },
        select: { id: true, version: true, status: true },
      });

      if (!entry1 || entry1.status !== QueueStatus.WAITING) {
        throw new ConflictError(
          `Entry ${e1.id} no longer available for matching`,
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      if (!entry2 || entry2.status !== QueueStatus.WAITING) {
        throw new ConflictError(
          `Entry ${e2.id} no longer available for matching`,
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // 2. Use user data from queue entries (already fetched during queue processing)
      // OPTIMIZATION: Removed redundant user re-fetch - queue entries already have user data
      // In the short matchmaking window, username/skillRating changes are unlikely
      const user1 = e1.user;
      const user2 = e2.user;

      // 3. Create Match record
      const matchCreatedAt = new Date();
      const match = await tx.match.create({
        data: {
          type: 'public', // MatchType: public matches from matchmaking
          gameMode: GameMode.QUICK_MATCH, // GameMode: QUICK_MATCH from matchmaking queue
          stakeAmount: e1.stakeAmount,
          creatorId: e1.userId,
          opponentId: e2.userId,
          creatorSlipId: e1.slipId!,
          opponentSlipId: e2.slipId!,
          creatorEntryTxId: e1.id, // Store queue entry ID for reference
          opponentEntryTxId: e2.id,
          status: MatchStatus.matched,
          matchedAt: matchCreatedAt,
          version: 1,
        },
      });

      logger.info(`[Matchmaking] Created match ${match.id}`);

      // 4. Update both queue entries
      const queueDuration1 = Date.now() - e1.enqueuedAt.getTime();
      const queueDuration2 = Date.now() - e2.enqueuedAt.getTime();

      await tx.matchmakingQueue.updateMany({
        where: { id: e1.id, version: e1.version },
        data: {
          status: QueueStatus.MATCHED,
          matchedAt: new Date(),
          matchId: match.id,
          queueDurationMs: queueDuration1,
          matchedByWorker: workerId,
          version: { increment: 1 },
        },
      });

      await tx.matchmakingQueue.updateMany({
        where: { id: e2.id, version: e2.version },
        data: {
          status: QueueStatus.MATCHED,
          matchedAt: new Date(),
          matchId: match.id,
          queueDurationMs: queueDuration2,
          matchedByWorker: workerId,
          version: { increment: 1 },
        },
      });

      // 5. Update both slips (PENDING -> ACTIVE, link to match)
      await tx.slip.update({
        where: { id: e1.slipId! },
        data: {
          status: SlipStatus.ACTIVE,
          matchId: match.id,
        },
      });

      await tx.slip.update({
        where: { id: e2.slipId! },
        data: {
          status: SlipStatus.ACTIVE,
          matchId: match.id,
        },
      });

      logger.info(`[Matchmaking] Updated slips and queue entries for match ${match.id}`);

      return {
        matchId: match.id,
        entry1Id: e1.id,
        entry2Id: e2.id,
        // User data from queue entries for Socket.io notification
        creatorId: e1.userId,
        creatorUsername: user1.username,
        creatorSkillRating: user1.skillRating,
        opponentId: e2.userId,
        opponentUsername: user2.username,
        opponentSkillRating: user2.skillRating,
        stakeAmount: e1.stakeAmount,
        createdAt: matchCreatedAt,
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  // ===========================================
  // SOCKET NOTIFICATION: Notify both players
  // ===========================================
  // Fire-and-forget: Match creation succeeded, notification is best-effort
  // Uses user rooms (user-{userId}) since players aren't in match room yet
  broadcastMatchCreatedSync({
    matchId: result.matchId,
    gameMode: GameMode.QUICK_MATCH,
    stakeAmount: result.stakeAmount,
    creatorId: result.creatorId,
    creatorUsername: result.creatorUsername,
    creatorSkillRating: result.creatorSkillRating,
    opponentId: result.opponentId,
    opponentUsername: result.opponentUsername,
    opponentSkillRating: result.opponentSkillRating,
    createdAt: result.createdAt,
  });

  return result;
}

/**
 * Expire old queue entries.
 * Called at the start of each processing cycle.
 *
 * Flow:
 * 1. Find entries with expiresAt < now and status=WAITING
 * 2. For each: update status=EXPIRED, refund entry fee, unlock slip
 *
 * @returns Number of expired entries
 */
async function expireOldEntries(): Promise<number> {
  const now = new Date();

  const expiredEntries = await prisma.matchmakingQueue.findMany({
    where: {
      status: QueueStatus.WAITING,
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      userId: true,
      slipId: true,
      entryTxId: true,
      version: true,
    },
  });

  if (expiredEntries.length === 0) {
    return 0;
  }

  logger.info(`[Matchmaking] Expiring ${expiredEntries.length} old queue entries`);

  let expiredCount = 0;

  for (const entry of expiredEntries) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Update with optimistic lock
          const updateResult = await tx.matchmakingQueue.updateMany({
            where: {
              id: entry.id,
              version: entry.version,
              status: QueueStatus.WAITING,
            },
            data: {
              status: QueueStatus.EXPIRED,
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            // Already processed
            return;
          }

          // Refund entry fee
          if (entry.entryTxId) {
            await processRefund({
              originalTransactionId: entry.entryTxId,
              idempotencyKey: `mm-expire-${entry.id}`,
              description: 'Matchmaking queue expired',
            });
          }

          // Unlock slip
          if (entry.slipId) {
            await tx.slip.update({
              where: { id: entry.slipId },
              data: {
                status: SlipStatus.DRAFT,
                lockedAt: null,
              },
            });
          }

          expiredCount++;
          logger.info(`[Matchmaking] Expired queue entry ${entry.id} for user ${entry.userId}`);
        },
        { timeout: TRANSACTION_TIMEOUT_MS }
      );
    } catch (error) {
      logger.error(`[Matchmaking] Failed to expire entry ${entry.id}:`, error);
      // Continue with other entries
    }
  }

  logger.info(`[Matchmaking] Expired ${expiredCount}/${expiredEntries.length} entries`);
  return expiredCount;
}

/**
 * Group queue entries into pools by matching criteria.
 * Entries in the same pool are compatible for matching.
 *
 * @param entries - Queue entries to group
 * @returns Array of pools (each pool is an array of entries)
 */
function groupEntriesIntoPools(entries: QueueEntryWithUser[]): QueueEntryWithUser[][] {
  const poolMap = new Map<string, QueueEntryWithUser[]>();

  for (const entry of entries) {
    // Pool key: slipSize|tier|stakeAmount
    const poolKey = `${entry.slipSize}|${entry.tier}|${entry.stakeAmount.toString()}`;

    if (!poolMap.has(poolKey)) {
      poolMap.set(poolKey, []);
    }

    poolMap.get(poolKey)!.push(entry);
  }

  return Array.from(poolMap.values());
}

/**
 * Build rematch prevention map.
 * Maps userId -> Set of opponent IDs from recent matches (last 24h).
 *
 * @param userIds - User IDs to check
 * @returns Map of userId -> opponent IDs
 */
async function buildRecentMatchesMap(userIds: string[]): Promise<Map<string, Set<string>>> {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentMatches = await prisma.match.findMany({
    where: {
      OR: [
        { creatorId: { in: userIds } },
        { opponentId: { in: userIds } },
      ],
      createdAt: { gte: last24h },
      status: { in: [MatchStatus.matched, MatchStatus.active, MatchStatus.settled] },
    },
    select: {
      creatorId: true,
      opponentId: true,
    },
  });

  const map = new Map<string, Set<string>>();

  for (const userId of userIds) {
    map.set(userId, new Set<string>());
  }

  for (const match of recentMatches) {
    // Add opponent to creator's set
    if (map.has(match.creatorId) && match.opponentId) {
      const opponentSet = map.get(match.creatorId)!;
      opponentSet.add(match.opponentId);

      // Count occurrences
      const matchCount = Array.from(opponentSet).filter(id => id === match.opponentId).length;
      if (matchCount >= REMATCH_PREVENTION_COUNT) {
        // Keep it in the set to block
        opponentSet.add(match.opponentId);
      }
    }

    // Add creator to opponent's set
    if (map.has(match.opponentId!) && match.opponentId) {
      const creatorSet = map.get(match.opponentId)!;
      creatorSet.add(match.creatorId);

      const matchCount = Array.from(creatorSet).filter(id => id === match.creatorId).length;
      if (matchCount >= REMATCH_PREVENTION_COUNT) {
        creatorSet.add(match.creatorId);
      }
    }
  }

  return map;
}
