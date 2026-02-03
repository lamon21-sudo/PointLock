// =====================================================
// Settlement Service
// =====================================================
// Orchestrates the complete settlement process for PvP matches.
// This is the main entry point for settling matches after all
// events have completed.
//
// WORKFLOW:
// 1. Validate match can be settled (status, events complete)
// 2. Evaluate all picks against event results
// 3. Calculate slip scores for both players
// 4. Determine match winner
// 5. Execute financial settlement (atomic transaction)
// 6. Update all records with settlement details

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { creditWallet, bigIntToNumber } from '../../lib/wallet.service';
import { invalidateUserTierCache } from '../../lib/tier.service';

import { determinePickResult } from './pick-result';
import { calculateSlipScore, PickForScoring, summarizePickResults } from './slip-scorer';
import {
  determineMatchWinner,
  calculateSettlementAmounts,
  validateMatchForSettlement,
} from './match-winner';
import {
  SettlementResult,
  SlipScoreResult,
  PickResultInput,
  EventScores,
  FINAL_EVENT_STATUSES,
} from './settlement.types';
import { updateLeaderboardEntries } from '../../modules/leaderboard/leaderboard.service';

// ===========================================
// Constants
// ===========================================

const TRANSACTION_TIMEOUT = 30000; // 30 seconds for settlement transaction
// Note: HOUSE_USER_ID will be defined when house wallet is implemented
// const HOUSE_USER_ID = 'HOUSE'; // Special user ID for rake collection

// ===========================================
// Helper Functions
// ===========================================

/**
 * Converts Prisma Decimal to number.
 */
function decimalToNumber(value: any): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : parseFloat(value.toString());
}

/**
 * Checks if all events in a slip are final (completed).
 */
function areAllEventsFinal(picks: Array<{ event: { status: string } }>): boolean {
  return picks.every((pick) =>
    FINAL_EVENT_STATUSES.some(
      (status) => pick.event.status.toLowerCase() === status.toLowerCase()
    )
  );
}

/**
 * Generates idempotency keys for settlement transactions.
 */
function generateIdempotencyKey(matchId: string, type: string, userId?: string): string {
  const base = `settlement:${matchId}:${type}`;
  return userId ? `${base}:${userId}` : base;
}

// ===========================================
// User Statistics Helper
// ===========================================

/**
 * Updates user statistics after match settlement.
 * MUST be called within the settlement transaction for atomicity.
 *
 * Logic:
 * - Both players: matchesPlayed += 1
 * - Winner: matchesWon += 1, currentStreak += 1, bestStreak = max(bestStreak, newStreak)
 * - Loser: currentStreak = 0 (reset on loss)
 * - Draw: streaks unchanged (no winner/loser)
 *
 * @param tx - Prisma transaction client
 * @param creatorId - The match creator's user ID
 * @param opponentId - The opponent's user ID
 * @param winnerId - The winner's user ID (null if draw)
 * @param isDraw - Whether the match was a draw
 */
async function updateUserStats(
  tx: Prisma.TransactionClient,
  creatorId: string,
  opponentId: string,
  winnerId: string | null,
  isDraw: boolean
): Promise<void> {
  const creatorIsWinner = winnerId === creatorId;
  const opponentIsWinner = winnerId === opponentId;

  // OPTIMIZATION: Batch fetch both users' streak data upfront (if needed for winner calc)
  // This reduces 2 sequential queries to 1 batch query
  let creatorData: { currentStreak: number; bestStreak: number } | null = null;
  let opponentData: { currentStreak: number; bestStreak: number } | null = null;

  if (!isDraw) {
    // Only fetch if not a draw (need streak data for winner)
    const users = await tx.user.findMany({
      where: { id: { in: [creatorId, opponentId] } },
      select: { id: true, currentStreak: true, bestStreak: true },
    });
    creatorData = users.find((u) => u.id === creatorId) ?? null;
    opponentData = users.find((u) => u.id === opponentId) ?? null;
  }

  // Prepare update data for both users
  type UserUpdate = {
    matchesPlayed: { increment: number };
    matchesWon?: { increment: number };
    currentStreak?: number;
    bestStreak?: number;
  };

  const creatorUpdate: UserUpdate = { matchesPlayed: { increment: 1 } };
  const opponentUpdate: UserUpdate = { matchesPlayed: { increment: 1 } };

  if (isDraw) {
    // Draw: increment matchesPlayed only, streaks unchanged
    // (already set above)
  } else if (creatorIsWinner) {
    // Creator won
    const newStreak = (creatorData?.currentStreak ?? 0) + 1;
    creatorUpdate.matchesWon = { increment: 1 };
    creatorUpdate.currentStreak = newStreak;
    creatorUpdate.bestStreak = Math.max(newStreak, creatorData?.bestStreak ?? 0);
    // Opponent lost - reset streak
    opponentUpdate.currentStreak = 0;
  } else if (opponentIsWinner) {
    // Opponent won
    const newStreak = (opponentData?.currentStreak ?? 0) + 1;
    opponentUpdate.matchesWon = { increment: 1 };
    opponentUpdate.currentStreak = newStreak;
    opponentUpdate.bestStreak = Math.max(newStreak, opponentData?.bestStreak ?? 0);
    // Creator lost - reset streak
    creatorUpdate.currentStreak = 0;
  }

  // OPTIMIZATION: Run both updates in parallel
  await Promise.all([
    tx.user.update({ where: { id: creatorId }, data: creatorUpdate }),
    tx.user.update({ where: { id: opponentId }, data: opponentUpdate }),
  ]);
}

// ===========================================
// Audit Log Helper
// ===========================================

/**
 * Creates a settlement audit log entry.
 * Follows the same pattern as matches.service.ts createAuditLog.
 *
 * @param tx - Prisma transaction client
 * @param matchId - The match ID
 * @param action - The action performed (SETTLED, DRAW)
 * @param previousState - The match state before settlement
 * @param newState - The match state after settlement
 * @param metadata - Additional settlement metadata
 */
async function createSettlementAuditLog(
  tx: Prisma.TransactionClient,
  matchId: string,
  action: 'SETTLED' | 'DRAW',
  previousState: {
    status: string;
    creatorPoints: number;
    opponentPoints: number;
  },
  newState: {
    status: string;
    winnerId: string | null;
    creatorPoints: number;
    opponentPoints: number;
    totalPot: string;
    rakeAmount: string;
    winnerPayout: string | null;
  },
  metadata: {
    settlementReason: string;
  }
): Promise<void> {
  await tx.matchAuditLog.create({
    data: {
      matchId,
      action,
      performedBy: 'SYSTEM',
      previousState: previousState as Prisma.InputJsonValue,
      newState: newState as Prisma.InputJsonValue,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

// ===========================================
// Database Query Helpers
// ===========================================

/**
 * Fetches a match with all data needed for settlement.
 */
async function fetchMatchForSettlement(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      creatorSlip: {
        include: {
          picks: {
            include: {
              event: {
                select: {
                  id: true,
                  homeScore: true,
                  awayScore: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      opponentSlip: {
        include: {
          picks: {
            include: {
              event: {
                select: {
                  id: true,
                  homeScore: true,
                  awayScore: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return match;
}

// ===========================================
// Validation Functions
// ===========================================

/**
 * Validates that a match is eligible for settlement.
 */
function validateMatchEligibility(match: any): void {
  if (!match) {
    throw new NotFoundError('Match not found', ERROR_CODES.INTERNAL_ERROR);
  }

  // Check match status
  if (match.status === 'settled') {
    throw new BadRequestError(
      `Match ${match.id} has already been settled`,
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  if (match.status !== 'active') {
    throw new BadRequestError(
      `Match ${match.id} is not active (status: ${match.status}). Only active matches can be settled.`,
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  // Check both slips exist
  if (!match.creatorSlip || !match.opponentSlip) {
    throw new BadRequestError(
      'Match cannot be settled: both players must have submitted slips',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  // Check opponent exists
  if (!match.opponentId) {
    throw new BadRequestError(
      'Match cannot be settled: no opponent has joined',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  // Check all events are final
  const creatorEventsFinal = areAllEventsFinal(match.creatorSlip.picks);
  const opponentEventsFinal = areAllEventsFinal(match.opponentSlip.picks);

  if (!creatorEventsFinal) {
    throw new BadRequestError(
      'Cannot settle: creator slip has pending events',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  if (!opponentEventsFinal) {
    throw new BadRequestError(
      'Cannot settle: opponent slip has pending events',
      ERROR_CODES.INTERNAL_ERROR
    );
  }
}

// ===========================================
// Settlement Processing Functions
// ===========================================

/**
 * Processes a slip and returns the score result.
 */
function processSlip(
  slipId: string,
  picks: Array<{
    id: string;
    pickType: any;
    selection: string;
    line: any;
    pointValue: any;
    event: {
      id: string;
      homeScore: number | null;
      awayScore: number | null;
      status: string;
    };
  }>
): SlipScoreResult {
  // Evaluate each pick
  const picksForScoring: PickForScoring[] = picks.map((pick) => {
    const pickInput: PickResultInput = {
      id: pick.id,
      pickType: pick.pickType,
      selection: pick.selection,
      line: pick.line !== null ? decimalToNumber(pick.line) : null,
      pointValue: decimalToNumber(pick.pointValue),
    };

    const eventScores: EventScores = {
      id: pick.event.id,
      homeScore: pick.event.homeScore,
      awayScore: pick.event.awayScore,
      status: pick.event.status,
    };

    const result = determinePickResult(pickInput, eventScores);

    return {
      pickId: pick.id,
      pointValue: decimalToNumber(pick.pointValue),
      result,
    };
  });

  // Calculate slip score
  return calculateSlipScore(slipId, picksForScoring);
}

// ===========================================
// Main Settlement Function
// ===========================================

/**
 * Settles a PvP match after all events have completed.
 *
 * This function:
 * 1. Validates the match is eligible for settlement
 * 2. Evaluates all picks against event results
 * 3. Calculates scores for both players
 * 4. Determines the winner (or draw)
 * 5. Executes financial settlement in an atomic transaction
 * 6. Updates all records with settlement details
 *
 * @param matchId - The ID of the match to settle
 * @returns SettlementResult with all settlement details
 * @throws BadRequestError if match cannot be settled
 * @throws NotFoundError if match not found
 * @throws ConflictError if concurrent modification detected
 */
export async function settleMatch(matchId: string): Promise<SettlementResult> {
  logger.info(`[Settlement] Starting settlement for match ${matchId}`);

  // Fetch match with all related data
  const match = await fetchMatchForSettlement(matchId);

  // Validate eligibility
  validateMatchEligibility(match);

  // TypeScript now knows these exist after validation
  const creatorSlip = match!.creatorSlip!;
  const opponentSlip = match!.opponentSlip!;

  // Process both slips
  logger.info(`[Settlement] Processing creator slip ${creatorSlip.id}`);
  const creatorScore = processSlip(creatorSlip.id, creatorSlip.picks);
  const creatorSummary = summarizePickResults(creatorScore.pickResults);
  logger.info(
    `[Settlement] Creator score: ${creatorScore.pointsEarned} points ` +
      `(${creatorSummary.hits} hits, ${creatorSummary.misses} misses, ` +
      `${creatorSummary.pushes} pushes, ${creatorSummary.voids} voids)`
  );

  logger.info(`[Settlement] Processing opponent slip ${opponentSlip.id}`);
  const opponentScore = processSlip(opponentSlip.id, opponentSlip.picks);
  const opponentSummary = summarizePickResults(opponentScore.pickResults);
  logger.info(
    `[Settlement] Opponent score: ${opponentScore.pointsEarned} points ` +
      `(${opponentSummary.hits} hits, ${opponentSummary.misses} misses, ` +
      `${opponentSummary.pushes} pushes, ${opponentSummary.voids} voids)`
  );

  // Validate both slips are ready for settlement
  const validation = validateMatchForSettlement(creatorScore, opponentScore);
  if (!validation.isValid) {
    throw new BadRequestError(validation.reason!, ERROR_CODES.INTERNAL_ERROR);
  }

  // Determine winner
  const winnerResult = determineMatchWinner(
    match!.creatorId,
    match!.opponentId!,
    creatorScore,
    opponentScore
  );
  logger.info(`[Settlement] Winner determination: ${winnerResult.reason}`);

  // Calculate financial settlement
  const amounts = calculateSettlementAmounts(
    match!.stakeAmount,
    decimalToNumber(match!.rakePercentage),
    winnerResult.winnerId,
    winnerResult.isDraw
  );

  logger.info(
    `[Settlement] Financial: pot=${bigIntToNumber(amounts.totalPot)}, ` +
      `rake=${bigIntToNumber(amounts.rakeAmount)}, ` +
      `payout=${amounts.winnerPayout ? bigIntToNumber(amounts.winnerPayout) : 'N/A (draw)'}`
  );

  // Execute settlement in atomic transaction
  const settledAt = new Date();
  let settlementTxId: string | null = null;
  let rakeTxId: string | null = null;
  let creatorRefundTxId: string | null = null;
  let opponentRefundTxId: string | null = null;

  await prisma.$transaction(
    async (tx) => {
      // First: Update match with optimistic lock
      const matchUpdate = await tx.match.updateMany({
        where: {
          id: matchId,
          version: match!.version,
          status: 'active', // Double-check status in transaction
        },
        data: {
          status: winnerResult.isDraw ? 'draw' : 'settled',
          winnerId: winnerResult.winnerId,
          isDraw: winnerResult.isDraw,
          creatorPoints: creatorScore.pointsEarned,
          opponentPoints: opponentScore.pointsEarned,
          totalPot: amounts.totalPot,
          rakeAmount: amounts.rakeAmount,
          winnerPayout: amounts.winnerPayout,
          settledAt,
          settledBy: 'SYSTEM',
          settlementMethod: 'AUTO',
          settlementReason: winnerResult.reason,
          // Track if tiebreaker was used to determine winner
          tiebreakMethod: winnerResult.reason.includes('tiebreaker')
            ? 'fewer_valid_picks'
            : null,
          version: { increment: 1 },
        },
      });

      if (matchUpdate.count === 0) {
        throw new ConflictError(
          'Match was modified by another process. Settlement aborted.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Update all picks with their results
      for (const pickResult of creatorScore.pickResults) {
        await tx.slipPick.update({
          where: { id: pickResult.pickId },
          data: {
            status: pickResult.status,
            resultValue: pickResult.resultValue,
            settledAt,
          },
        });
      }

      for (const pickResult of opponentScore.pickResults) {
        await tx.slipPick.update({
          where: { id: pickResult.pickId },
          data: {
            status: pickResult.status,
            resultValue: pickResult.resultValue,
            settledAt,
          },
        });
      }

      // Update slips with final status and scores
      await tx.slip.update({
        where: { id: creatorSlip.id },
        data: {
          status: creatorScore.status,
          correctPicks: creatorScore.correctPicks,
          pointsEarned: creatorScore.pointsEarned,
          settledAt,
        },
      });

      await tx.slip.update({
        where: { id: opponentSlip.id },
        data: {
          status: opponentScore.status,
          correctPicks: opponentScore.correctPicks,
          pointsEarned: opponentScore.pointsEarned,
          settledAt,
        },
      });

      // =====================================================
      // Update user statistics (INSIDE transaction for atomicity)
      // =====================================================
      logger.info(`[Settlement] Updating user statistics for match ${matchId}`);
      await updateUserStats(
        tx,
        match!.creatorId,
        match!.opponentId!,
        winnerResult.winnerId,
        winnerResult.isDraw
      );

      // Invalidate tier cache for both users (streak may have changed)
      // Fire-and-forget - cache invalidation should not block settlement
      Promise.all([
        invalidateUserTierCache(match!.creatorId),
        invalidateUserTierCache(match!.opponentId!),
      ]).catch((err) => {
        logger.warn('[Settlement] Failed to invalidate tier cache:', err);
      });

      // =====================================================
      // Update leaderboard entries (INSIDE transaction for atomicity)
      // =====================================================
      logger.info(`[Settlement] Updating leaderboard entries for match ${matchId}`);
      await updateLeaderboardEntries(
        tx,
        match!.creatorId,
        match!.opponentId!,
        winnerResult.winnerId,
        winnerResult.isDraw,
        creatorScore.pointsEarned,
        opponentScore.pointsEarned
      );

      // =====================================================
      // Create settlement audit log
      // =====================================================
      await createSettlementAuditLog(
        tx,
        matchId,
        winnerResult.isDraw ? 'DRAW' : 'SETTLED',
        {
          status: 'active',
          creatorPoints: 0,
          opponentPoints: 0,
        },
        {
          status: winnerResult.isDraw ? 'draw' : 'settled',
          winnerId: winnerResult.winnerId,
          creatorPoints: creatorScore.pointsEarned,
          opponentPoints: opponentScore.pointsEarned,
          totalPot: amounts.totalPot.toString(),
          rakeAmount: amounts.rakeAmount.toString(),
          winnerPayout: amounts.winnerPayout?.toString() ?? null,
        },
        {
          settlementReason: winnerResult.reason,
        }
      );
    },
    { timeout: TRANSACTION_TIMEOUT }
  );

  // Financial settlements are done OUTSIDE the main transaction
  // to avoid long-running transaction issues with wallet service
  // Each financial operation has its own idempotency key

  if (winnerResult.isDraw) {
    // Draw: Refund both players
    logger.info(`[Settlement] Processing draw refunds for match ${matchId}`);

    try {
      const creatorRefund = await creditWallet({
        userId: match!.creatorId,
        amount: amounts.creatorRefund!,
        type: 'MATCH_REFUND',
        matchId,
        idempotencyKey: generateIdempotencyKey(matchId, 'refund', match!.creatorId),
        description: `Match ${matchId} ended in draw - stake refunded`,
      });
      creatorRefundTxId = creatorRefund.id;
      logger.info(`[Settlement] Creator refund completed: ${creatorRefund.id}`);
    } catch (error) {
      logger.error(`[Settlement] Creator refund failed:`, error);
      throw error;
    }

    try {
      const opponentRefund = await creditWallet({
        userId: match!.opponentId!,
        amount: amounts.opponentRefund!,
        type: 'MATCH_REFUND',
        matchId,
        idempotencyKey: generateIdempotencyKey(matchId, 'refund', match!.opponentId!),
        description: `Match ${matchId} ended in draw - stake refunded`,
      });
      opponentRefundTxId = opponentRefund.id;
      logger.info(`[Settlement] Opponent refund completed: ${opponentRefund.id}`);
    } catch (error) {
      logger.error(`[Settlement] Opponent refund failed:`, error);
      throw error;
    }
  } else {
    // Winner: Credit winner and collect rake
    logger.info(`[Settlement] Processing winner payout for match ${matchId}`);

    try {
      const winnerPayout = await creditWallet({
        userId: winnerResult.winnerId!,
        amount: amounts.winnerPayout!,
        type: 'MATCH_WIN',
        matchId,
        idempotencyKey: generateIdempotencyKey(matchId, 'payout', winnerResult.winnerId!),
        description: `Match ${matchId} won - payout`,
      });
      settlementTxId = winnerPayout.id;
      logger.info(`[Settlement] Winner payout completed: ${winnerPayout.id}`);
    } catch (error) {
      logger.error(`[Settlement] Winner payout failed:`, error);
      throw error;
    }

    // Rake collection (if rake > 0)
    if (amounts.rakeAmount > BigInt(0)) {
      // =====================================================
      // TODO: HOUSE WALLET IMPLEMENTATION
      // =====================================================
      // When a house wallet is implemented:
      // 1. Create a "HOUSE" or "SYSTEM" user with a wallet
      // 2. Uncomment and use the creditWallet call below
      // 3. Track rake in both Transaction table and MatchAuditLog
      //
      // const rakeTransaction = await creditWallet({
      //   userId: HOUSE_USER_ID,
      //   amount: amounts.rakeAmount,
      //   type: 'RAKE_FEE',
      //   matchId,
      //   idempotencyKey: generateIdempotencyKey(matchId, 'rake'),
      //   description: `Match ${matchId} rake`,
      // });
      // rakeTxId = rakeTransaction.id;
      // =====================================================

      logger.info(
        `[Settlement] Rake collected: ${bigIntToNumber(amounts.rakeAmount)} cents for match ${matchId}. ` +
          `(Recorded on Match.rakeAmount - house wallet not yet implemented)`
      );
    }
  }

  // Update match with transaction IDs and update audit log with financial operation results
  await prisma.$transaction(async (tx) => {
    // Update match with transaction IDs
    await tx.match.update({
      where: { id: matchId },
      data: {
        settlementTxId,
        rakeTxId,
      },
    });

    // Update audit log with final transaction IDs
    // Find the most recent settlement audit log and add tx IDs to metadata
    const auditLog = await tx.matchAuditLog.findFirst({
      where: {
        matchId,
        action: { in: ['SETTLED', 'DRAW'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (auditLog) {
      const existingMetadata = auditLog.metadata as Record<string, unknown>;
      await tx.matchAuditLog.update({
        where: { id: auditLog.id },
        data: {
          metadata: {
            ...existingMetadata,
            settlementTxId,
            rakeTxId,
            creatorRefundTxId,
            opponentRefundTxId,
          } as Prisma.InputJsonValue,
        },
      });
    }
  });

  logger.info(`[Settlement] Match ${matchId} settlement completed successfully`);

  return {
    matchId,
    status: winnerResult.isDraw ? 'draw' : 'settled',
    winnerId: winnerResult.winnerId,
    isDraw: winnerResult.isDraw,
    creatorPoints: winnerResult.creatorPoints,
    opponentPoints: winnerResult.opponentPoints,
    totalPot: amounts.totalPot,
    rakeAmount: amounts.rakeAmount,
    winnerPayout: amounts.winnerPayout,
    settlementTxId,
    rakeTxId,
    creatorRefundTxId,
    opponentRefundTxId,
    reason: winnerResult.reason,
    settledAt,
  };
}

/**
 * Checks if a match is ready for settlement (all events complete).
 * Use this before calling settleMatch to avoid unnecessary errors.
 *
 * @param matchId - The ID of the match to check
 * @returns Object with isReady flag and details
 */
export async function checkSettlementReadiness(matchId: string): Promise<{
  isReady: boolean;
  reason: string;
  pendingEvents: number;
  totalEvents: number;
}> {
  const match = await fetchMatchForSettlement(matchId);

  if (!match) {
    return {
      isReady: false,
      reason: 'Match not found',
      pendingEvents: 0,
      totalEvents: 0,
    };
  }

  if (match.status !== 'active') {
    return {
      isReady: false,
      reason: `Match is not active (status: ${match.status})`,
      pendingEvents: 0,
      totalEvents: 0,
    };
  }

  if (!match.creatorSlip || !match.opponentSlip) {
    return {
      isReady: false,
      reason: 'Both slips must be submitted',
      pendingEvents: 0,
      totalEvents: 0,
    };
  }

  const allPicks = [...match.creatorSlip.picks, ...match.opponentSlip.picks];
  const totalEvents = allPicks.length;
  const pendingEvents = allPicks.filter(
    (pick) =>
      !FINAL_EVENT_STATUSES.some(
        (status) => pick.event.status.toLowerCase() === status.toLowerCase()
      )
  ).length;

  if (pendingEvents > 0) {
    return {
      isReady: false,
      reason: `${pendingEvents} of ${totalEvents} events still pending`,
      pendingEvents,
      totalEvents,
    };
  }

  return {
    isReady: true,
    reason: 'Match is ready for settlement',
    pendingEvents: 0,
    totalEvents,
  };
}
