// =====================================================
// Settlement Edge Cases Service
// Task 8.5: Settlement Edge Cases
// =====================================================
//
// Handles edge cases in match settlement:
// 1. Cancelled games (partial or full void)
// 2. Postponed games (hold mechanism)
// 3. Push results (0% rake refunds)
// 4. Manual admin settlement
//
// CRITICAL: All financial operations use idempotency keys.
// Race conditions prevented via optimistic locking.

import { Prisma, AdminRole, MatchStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { creditWallet } from '../../lib/wallet.service';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';

import {
  CancelledGameResult,
  PostponedGameResult,
  PostponedMatchCheckResult,
  ManualSettlementParams,
  ManualSettlementResult,
  ForceSettleResult,
  VoidAndRefundResult,
  SettlementEligibility,
  SETTLEMENT_EDGE_CASE_CONSTANTS,
  generateVoidMatchRefundKey,
  generateManualPayoutKey,
  generateManualRefundKey,
} from './settlement-edge-cases.types';

// ===========================================
// Constants
// ===========================================

const {
  POSTPONEMENT_TIMEOUT_MS,
  POSTPONEMENT_CHECK_INTERVAL_MS,
  TRANSACTION_TIMEOUT_MS,
  MIN_JUSTIFICATION_LENGTH,
} = SETTLEMENT_EDGE_CASE_CONSTANTS;

// ===========================================
// 1. CANCELLED GAMES HANDLER
// ===========================================

/**
 * Handles event cancellation and updates all affected matches.
 *
 * Flow:
 * 1. Mark event as CANCELED
 * 2. Find all picks for this event
 * 3. Update picks to VOID status
 * 4. For each affected match:
 *    a. Recalculate slip status (may still be valid if other picks exist)
 *    b. If ALL picks void -> void entire match and refund
 *    c. If PARTIAL void -> continue match with remaining picks
 * 5. Create audit logs for all changes
 *
 * @param eventId - The cancelled event ID
 * @param reason - Cancellation reason
 * @returns Array of affected match results
 */
export async function handleCancelledEvent(
  eventId: string,
  reason: string
): Promise<CancelledGameResult[]> {
  logger.info(`[EdgeCases] Handling cancelled event ${eventId}: ${reason}`);

  const results: CancelledGameResult[] = [];
  const matchIdsToRefund: Array<{
    matchId: string;
    creatorId: string;
    opponentId: string | null;
    stakeAmount: bigint;
  }> = [];

  await prisma.$transaction(
    async (tx) => {
      // Verify event exists
      const event = await tx.sportsEvent.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });

      if (!event) {
        throw new NotFoundError('Event not found', ERROR_CODES.INTERNAL_ERROR);
      }

      // Mark event as CANCELED
      await tx.sportsEvent.update({
        where: { id: eventId },
        data: {
          status: 'CANCELED',
          endedAt: new Date(),
        },
      });

      // Find all picks for this event that aren't already settled
      const affectedPicks = await tx.slipPick.findMany({
        where: {
          sportsEventId: eventId,
          status: { in: ['PENDING'] }, // Only void pending picks
        },
        include: {
          slip: {
            include: {
              creatorMatch: {
                select: {
                  id: true,
                  status: true,
                  creatorId: true,
                  opponentId: true,
                  stakeAmount: true,
                  version: true,
                },
              },
              opponentMatch: {
                select: {
                  id: true,
                  status: true,
                  creatorId: true,
                  opponentId: true,
                  stakeAmount: true,
                  version: true,
                },
              },
            },
          },
        },
      });

      if (affectedPicks.length === 0) {
        logger.info(`[EdgeCases] No pending picks found for cancelled event ${eventId}`);
        return;
      }

      logger.info(`[EdgeCases] Found ${affectedPicks.length} picks to void for event ${eventId}`);

      // Update all affected picks to VOID
      await tx.slipPick.updateMany({
        where: {
          id: { in: affectedPicks.map((p) => p.id) },
        },
        data: {
          status: 'VOID',
          settledAt: new Date(),
        },
      });

      // Get unique matches affected (only active matches)
      const matchMap = new Map<
        string,
        {
          id: string;
          status: MatchStatus;
          creatorId: string;
          opponentId: string | null;
          stakeAmount: bigint;
          version: number;
        }
      >();

      for (const pick of affectedPicks) {
        const creatorMatch = pick.slip.creatorMatch;
        const opponentMatch = pick.slip.opponentMatch;

        if (creatorMatch && creatorMatch.status === 'active') {
          matchMap.set(creatorMatch.id, creatorMatch);
        }
        if (opponentMatch && opponentMatch.status === 'active') {
          matchMap.set(opponentMatch.id, opponentMatch);
        }
      }

      // Process each affected match
      for (const match of matchMap.values()) {
        const result = await handleMatchWithVoidedPicks(tx, match.id, reason);
        results.push(result);

        // If match was voided, queue for refund (outside transaction)
        if (result.matchStatus === 'voided') {
          matchIdsToRefund.push({
            matchId: match.id,
            creatorId: match.creatorId,
            opponentId: match.opponentId,
            stakeAmount: match.stakeAmount,
          });
        }
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  // Process refunds outside the main transaction (idempotent)
  for (const refundInfo of matchIdsToRefund) {
    const txIds = await processVoidMatchRefunds(
      refundInfo.matchId,
      refundInfo.creatorId,
      refundInfo.opponentId,
      refundInfo.stakeAmount
    );

    // Update the result with transaction IDs
    const resultIndex = results.findIndex((r) => r.matchId === refundInfo.matchId);
    if (resultIndex !== -1) {
      results[resultIndex].refundTransactionIds = txIds;
    }
  }

  return results;
}

/**
 * Internal: Handles a match that has one or more voided picks.
 * Determines if match should be voided entirely or continue with remaining picks.
 */
async function handleMatchWithVoidedPicks(
  tx: Prisma.TransactionClient,
  matchId: string,
  reason: string
): Promise<CancelledGameResult> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      creatorSlip: {
        include: {
          picks: true,
        },
      },
      opponentSlip: {
        include: {
          picks: true,
        },
      },
    },
  });

  if (!match) {
    throw new NotFoundError('Match not found', ERROR_CODES.INTERNAL_ERROR);
  }

  // Count void vs valid picks across both slips
  const creatorPicks = match.creatorSlip?.picks || [];
  const opponentPicks = match.opponentSlip?.picks || [];
  const allPicks = [...creatorPicks, ...opponentPicks];

  const voidPicksCount = allPicks.filter((p) => p.status === 'VOID').length;
  const totalPicksCount = allPicks.length;

  // Check if either slip is fully voided
  const creatorVoidCount = creatorPicks.filter((p) => p.status === 'VOID').length;
  const opponentVoidCount = opponentPicks.filter((p) => p.status === 'VOID').length;
  const creatorFullyVoided = creatorPicks.length > 0 && creatorVoidCount === creatorPicks.length;
  const opponentFullyVoided =
    opponentPicks.length > 0 && opponentVoidCount === opponentPicks.length;

  // RULE: If EITHER slip is fully voided, void the entire match
  if (creatorFullyVoided || opponentFullyVoided) {
    logger.info(
      `[EdgeCases] Match ${matchId} fully voided (creator: ${creatorFullyVoided}, opponent: ${opponentFullyVoided})`
    );

    // Update match to voided status with optimistic lock
    const updateResult = await tx.match.updateMany({
      where: {
        id: matchId,
        version: match.version,
        status: 'active',
      },
      data: {
        status: 'voided',
        settledAt: new Date(),
        settledBy: 'SYSTEM',
        settlementMethod: 'AUTO',
        settlementReason: `Events cancelled: ${reason}`,
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictError(
        'Match was modified during void operation',
        ERROR_CODES.INTERNAL_ERROR
      );
    }

    // Update slips to VOID
    if (match.creatorSlip) {
      await tx.slip.update({
        where: { id: match.creatorSlip.id },
        data: { status: 'VOID', settledAt: new Date() },
      });
    }
    if (match.opponentSlip) {
      await tx.slip.update({
        where: { id: match.opponentSlip.id },
        data: { status: 'VOID', settledAt: new Date() },
      });
    }

    // Create audit log
    await tx.matchAuditLog.create({
      data: {
        matchId,
        action: 'VOIDED',
        performedBy: 'SYSTEM',
        previousState: { status: match.status } as Prisma.InputJsonValue,
        newState: {
          status: 'voided',
          reason,
          voidPicksCount,
          totalPicksCount,
          creatorFullyVoided,
          opponentFullyVoided,
        } as Prisma.InputJsonValue,
        metadata: { cancelledEventReason: reason } as Prisma.InputJsonValue,
      },
    });

    return {
      matchId,
      affectedPicksCount: totalPicksCount,
      voidPicksCount,
      matchStatus: 'voided',
      refunded: true,
      refundTransactionIds: [], // Will be populated after refunds
      reason: `Match voided: ${reason}`,
    };
  }

  // PARTIAL VOID: Match continues with remaining valid picks
  logger.info(
    `[EdgeCases] Match ${matchId} partially affected (${voidPicksCount}/${totalPicksCount} picks voided)`
  );

  // Create audit log for partial void
  await tx.matchAuditLog.create({
    data: {
      matchId,
      action: 'PARTIAL_VOID',
      performedBy: 'SYSTEM',
      previousState: { voidPicks: 0 } as Prisma.InputJsonValue,
      newState: {
        voidPicks: voidPicksCount,
        remainingPicks: totalPicksCount - voidPicksCount,
      } as Prisma.InputJsonValue,
      metadata: { cancelledEventReason: reason } as Prisma.InputJsonValue,
    },
  });

  return {
    matchId,
    affectedPicksCount: totalPicksCount,
    voidPicksCount,
    matchStatus: 'active', // Match continues
    refunded: false,
    refundTransactionIds: [],
    reason: `Partial cancellation: ${voidPicksCount}/${totalPicksCount} picks voided`,
  };
}

/**
 * Processes refunds for a voided match.
 * MUST be called OUTSIDE the main transaction (separate financial operation).
 * Uses idempotency keys to prevent double refunds.
 */
export async function processVoidMatchRefunds(
  matchId: string,
  creatorId: string,
  opponentId: string | null,
  stakeAmount: bigint
): Promise<string[]> {
  const refundTxIds: string[] = [];

  try {
    // Refund creator
    const creatorRefund = await creditWallet({
      userId: creatorId,
      amount: stakeAmount,
      type: 'MATCH_REFUND',
      matchId,
      idempotencyKey: generateVoidMatchRefundKey(matchId, creatorId),
      description: `Match ${matchId} voided - events cancelled`,
    });
    refundTxIds.push(creatorRefund.id);

    // Refund opponent (if exists)
    if (opponentId) {
      const opponentRefund = await creditWallet({
        userId: opponentId,
        amount: stakeAmount,
        type: 'MATCH_REFUND',
        matchId,
        idempotencyKey: generateVoidMatchRefundKey(matchId, opponentId),
        description: `Match ${matchId} voided - events cancelled`,
      });
      refundTxIds.push(opponentRefund.id);
    }

    logger.info(`[EdgeCases] Processed ${refundTxIds.length} refunds for voided match ${matchId}`);
  } catch (error) {
    logger.error(`[EdgeCases] Error processing refunds for match ${matchId}:`, error);
    throw error;
  }

  return refundTxIds;
}

// ===========================================
// 2. POSTPONED GAMES HANDLER
// ===========================================

/**
 * Handles event postponement by marking affected matches on hold.
 * Matches will NOT auto-settle until postponed events are resolved.
 *
 * @param eventId - The postponed event ID
 * @param reason - Postponement reason
 * @param rescheduledTo - Optional rescheduled date
 */
export async function handlePostponedEvent(
  eventId: string,
  reason: string,
  rescheduledTo?: Date
): Promise<PostponedGameResult[]> {
  logger.info(`[EdgeCases] Handling postponed event ${eventId}: ${reason}`);

  const results: PostponedGameResult[] = [];

  await prisma.$transaction(
    async (tx) => {
      // Update event status
      await tx.sportsEvent.update({
        where: { id: eventId },
        data: {
          status: 'POSTPONED',
          postponedAt: new Date(),
          postponedReason: reason,
          rescheduledTo,
        },
      });

      // Find all pending picks for this event
      const affectedPicks = await tx.slipPick.findMany({
        where: {
          sportsEventId: eventId,
          status: 'PENDING',
        },
        include: {
          slip: {
            include: {
              creatorMatch: { select: { id: true, status: true } },
              opponentMatch: { select: { id: true, status: true } },
            },
          },
        },
      });

      // Get unique active matches
      const matchIds = new Set<string>();
      for (const pick of affectedPicks) {
        if (pick.slip.creatorMatch?.status === 'active') {
          matchIds.add(pick.slip.creatorMatch.id);
        }
        if (pick.slip.opponentMatch?.status === 'active') {
          matchIds.add(pick.slip.opponentMatch.id);
        }
      }

      // Mark each match as having postponed events
      for (const matchId of matchIds) {
        const nextCheckAt = rescheduledTo
          ? new Date(rescheduledTo.getTime() + 60 * 60 * 1000) // 1 hour after reschedule
          : new Date(Date.now() + POSTPONEMENT_CHECK_INTERVAL_MS);

        await tx.match.update({
          where: { id: matchId },
          data: {
            hasPostponedEvents: true,
            postponedCheckAt: nextCheckAt,
          },
        });

        // Create audit log
        await tx.matchAuditLog.create({
          data: {
            matchId,
            action: 'POSTPONED_EVENT',
            performedBy: 'SYSTEM',
            previousState: { hasPostponedEvents: false } as Prisma.InputJsonValue,
            newState: {
              hasPostponedEvents: true,
              postponedCheckAt: nextCheckAt.toISOString(),
              eventId,
            } as Prisma.InputJsonValue,
            metadata: {
              postponedEventReason: reason,
              rescheduledTo: rescheduledTo?.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        const affectedPicksForMatch = affectedPicks.filter(
          (p) =>
            p.slip.creatorMatch?.id === matchId || p.slip.opponentMatch?.id === matchId
        ).length;

        results.push({
          matchId,
          affectedPicksCount: affectedPicksForMatch,
          nextCheckAt,
          willAutoSettle: !!rescheduledTo,
          reason: `Event postponed: ${reason}`,
        });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  return results;
}

/**
 * Scheduled worker function to check postponed matches.
 * Should be called periodically (e.g., every hour) to check if postponed events resolved.
 */
export async function checkPostponedMatches(): Promise<PostponedMatchCheckResult[]> {
  const now = new Date();
  const results: PostponedMatchCheckResult[] = [];

  const postponedMatches = await prisma.match.findMany({
    where: {
      hasPostponedEvents: true,
      postponedCheckAt: { lte: now },
      status: 'active',
    },
    include: {
      creatorSlip: {
        include: {
          picks: {
            include: { event: true },
          },
        },
      },
      opponentSlip: {
        include: {
          picks: {
            include: { event: true },
          },
        },
      },
    },
  });

  logger.info(`[EdgeCases] Checking ${postponedMatches.length} postponed matches`);

  for (const match of postponedMatches) {
    const allPicks = [
      ...(match.creatorSlip?.picks || []),
      ...(match.opponentSlip?.picks || []),
    ];

    // Check if any events are still postponed
    const stillPostponed = allPicks.some((p) => p.event.status === 'POSTPONED');

    // Check if any postponed events have timed out (72 hours)
    const timedOutEvents = allPicks.filter((p) => {
      if (p.event.status !== 'POSTPONED' || !p.event.postponedAt) return false;
      const postponedDuration = now.getTime() - p.event.postponedAt.getTime();
      return postponedDuration > POSTPONEMENT_TIMEOUT_MS;
    });

    if (timedOutEvents.length > 0) {
      // Auto-cancel timed out postponed events
      logger.info(
        `[EdgeCases] Match ${match.id} has ${timedOutEvents.length} timed out postponed events`
      );

      for (const pick of timedOutEvents) {
        await handleCancelledEvent(
          pick.event.id,
          `Postponement timeout (>${POSTPONEMENT_TIMEOUT_MS / (60 * 60 * 1000)} hours)`
        );
      }

      results.push({
        matchId: match.id,
        resolved: true,
        action: 'auto_cancelled',
      });
    } else if (!stillPostponed) {
      // All postponed events resolved - clear flag and allow settlement
      await prisma.match.update({
        where: { id: match.id },
        data: {
          hasPostponedEvents: false,
          postponedCheckAt: null,
        },
      });

      logger.info(
        `[EdgeCases] Match ${match.id} postponement resolved - eligible for settlement`
      );

      results.push({
        matchId: match.id,
        resolved: true,
        action: 'settled',
      });
    } else {
      // Still postponed - reschedule check
      const nextCheck = new Date(Date.now() + POSTPONEMENT_CHECK_INTERVAL_MS);
      await prisma.match.update({
        where: { id: match.id },
        data: { postponedCheckAt: nextCheck },
      });

      logger.debug(
        `[EdgeCases] Match ${match.id} still postponed - next check ${nextCheck.toISOString()}`
      );

      results.push({
        matchId: match.id,
        resolved: false,
        action: 'waiting',
        nextCheckAt: nextCheck,
      });
    }
  }

  return results;
}

// ===========================================
// 3. SETTLEMENT ELIGIBILITY CHECK
// ===========================================

/**
 * Enhanced settlement eligibility check that handles edge cases.
 * Returns whether match is eligible and what action to take.
 */
export async function checkSettlementEligibility(
  matchId: string
): Promise<SettlementEligibility> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      creatorSlip: {
        include: {
          picks: {
            include: { event: true },
          },
        },
      },
      opponentSlip: {
        include: {
          picks: {
            include: { event: true },
          },
        },
      },
    },
  });

  if (!match) {
    return {
      eligible: false,
      action: 'wait',
      reason: 'Match not found',
    };
  }

  if (match.status !== 'active') {
    return {
      eligible: false,
      action: 'wait',
      reason: `Match is ${match.status}, not active`,
    };
  }

  const allPicks = [
    ...(match.creatorSlip?.picks || []),
    ...(match.opponentSlip?.picks || []),
  ];

  if (allPicks.length === 0) {
    return {
      eligible: false,
      action: 'wait',
      reason: 'No picks found',
    };
  }

  const completedEvents = allPicks.filter(
    (p) => p.event.status === 'COMPLETED'
  ).length;
  const cancelledEvents = allPicks.filter(
    (p) => p.event.status === 'CANCELED'
  ).length;
  const postponedEvents = allPicks.filter(
    (p) => p.event.status === 'POSTPONED'
  ).length;
  const totalEvents = allPicks.length;

  const details = {
    completedEvents,
    cancelledEvents,
    postponedEvents,
    totalEvents,
  };

  // All cancelled -> void match
  if (cancelledEvents === totalEvents) {
    return {
      eligible: true,
      action: 'void',
      reason: 'All events cancelled',
      details,
    };
  }

  // Some postponed -> wait
  if (postponedEvents > 0) {
    return {
      eligible: false,
      action: 'wait',
      reason: 'Postponed events pending',
      details,
    };
  }

  // All completed or cancelled (partial cancellation) -> settle
  if (completedEvents + cancelledEvents === totalEvents) {
    return {
      eligible: true,
      action: 'settle',
      reason: 'All events finalized',
      details,
    };
  }

  return {
    eligible: false,
    action: 'wait',
    reason: 'Events still in progress',
    details,
  };
}

// ===========================================
// 4. ADMIN PERMISSION VALIDATION
// ===========================================

/**
 * Validates admin has permission for settlement operations.
 * @throws ForbiddenError if user is not authorized
 */
export async function validateAdminPermission(
  userId: string,
  requiredRole: AdminRole = 'SETTLEMENT_ADMIN'
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminRole: true },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  if (!user.adminRole) {
    throw new ForbiddenError(
      'Admin role required for this operation',
      ERROR_CODES.FORBIDDEN
    );
  }

  // Role hierarchy: SUPER_ADMIN > SETTLEMENT_ADMIN > SUPPORT_ADMIN > VIEWER
  const roleHierarchy: Record<AdminRole, number> = {
    SUPER_ADMIN: 4,
    SETTLEMENT_ADMIN: 3,
    SUPPORT_ADMIN: 2,
    VIEWER: 1,
  };

  const userLevel = roleHierarchy[user.adminRole];
  const requiredLevel = roleHierarchy[requiredRole];

  if (userLevel < requiredLevel) {
    throw new ForbiddenError(
      `Insufficient admin permissions. Required: ${requiredRole}, Has: ${user.adminRole}`,
      ERROR_CODES.FORBIDDEN
    );
  }
}

// ===========================================
// 5. MANUAL ADMIN SETTLEMENT
// ===========================================

/**
 * Manual settlement endpoint handler.
 * Allows admins to override automatic settlement for dispute resolution or corrections.
 *
 * CRITICAL: All manual settlements are logged with full audit trail.
 */
export async function manualSettleMatch(
  params: ManualSettlementParams
): Promise<ManualSettlementResult> {
  const { matchId, adminId, action, winnerId, reason, metadata = {}, ipAddress, userAgent } =
    params;

  // Validate admin permission
  await validateAdminPermission(adminId);

  // Validate reason length
  if (reason.length < MIN_JUSTIFICATION_LENGTH) {
    throw new BadRequestError(
      `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters`,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  logger.warn(`[EdgeCases] MANUAL SETTLEMENT initiated by ${adminId} for match ${matchId}`, {
    action,
    winnerId,
    reason,
  });

  let auditLogId: string;
  let refunded = false;
  let finalStatus: string;
  let transactionIds: string[] = [];

  switch (action) {
    case 'force_settle': {
      if (!winnerId) {
        throw new BadRequestError(
          'winnerId is required for force_settle action',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const result = await forceSettleMatch(
        matchId,
        winnerId,
        adminId,
        reason,
        metadata,
        ipAddress,
        userAgent
      );
      auditLogId = result.auditLogId;
      transactionIds = [result.payoutTxId];
      finalStatus = 'settled';
      break;
    }

    case 'void_and_refund': {
      const result = await voidAndRefundMatch(
        matchId,
        adminId,
        reason,
        metadata,
        ipAddress,
        userAgent
      );
      auditLogId = result.auditLogId;
      transactionIds = result.refundTransactionIds;
      refunded = true;
      finalStatus = 'voided';
      break;
    }

    case 'resolve_dispute': {
      // If winnerId provided, force settle. Otherwise, void and refund.
      if (winnerId) {
        const result = await forceSettleMatch(
          matchId,
          winnerId,
          adminId,
          reason,
          metadata,
          ipAddress,
          userAgent
        );
        auditLogId = result.auditLogId;
        transactionIds = [result.payoutTxId];
        finalStatus = 'settled';
      } else {
        const result = await voidAndRefundMatch(
          matchId,
          adminId,
          reason,
          metadata,
          ipAddress,
          userAgent
        );
        auditLogId = result.auditLogId;
        transactionIds = result.refundTransactionIds;
        refunded = true;
        finalStatus = 'voided';
      }
      break;
    }

    default: {
      throw new BadRequestError(
        `Unknown manual settlement action: ${action}`,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  return {
    matchId,
    action,
    status: finalStatus,
    winnerId: winnerId || null,
    refunded,
    auditLogId,
    performedBy: adminId,
    performedAt: new Date(),
    transactionIds,
  };
}

/**
 * Internal: Force settle with specific winner.
 */
async function forceSettleMatch(
  matchId: string,
  winnerId: string,
  adminId: string,
  reason: string,
  metadata: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<ForceSettleResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      creatorSlip: true,
      opponentSlip: true,
    },
  });

  if (!match) {
    throw new NotFoundError('Match not found', ERROR_CODES.INTERNAL_ERROR);
  }

  if (match.status === 'settled' || match.status === 'voided') {
    throw new BadRequestError(`Match already ${match.status}`, ERROR_CODES.INTERNAL_ERROR);
  }

  if (winnerId !== match.creatorId && winnerId !== match.opponentId) {
    throw new BadRequestError(
      'winnerId must be either creator or opponent',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  // Calculate settlement amounts (full pot to winner, rake still applies)
  const stakeAmount = match.stakeAmount;
  const totalPot = stakeAmount * BigInt(2);
  const rakeAmount =
    (totalPot * BigInt(Math.floor(Number(match.rakePercentage) * 100))) / BigInt(10000);
  const winnerPayout = totalPot - rakeAmount;

  let auditLogId: string = '';

  await prisma.$transaction(
    async (tx) => {
      // Update match with optimistic lock
      const updateResult = await tx.match.updateMany({
        where: {
          id: matchId,
          version: match.version,
        },
        data: {
          status: 'settled',
          winnerId,
          isDraw: false,
          totalPot,
          rakeAmount,
          winnerPayout,
          settledAt: new Date(),
          settledBy: adminId,
          settlementMethod: 'MANUAL',
          settlementReason: reason,
          isManuallySettled: true,
          manualSettleReason: reason,
          manualSettledBy: adminId,
          manualSettledAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError(
          'Match was modified during manual settlement',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Update slips
      if (match.creatorSlip) {
        await tx.slip.update({
          where: { id: match.creatorSlip.id },
          data: {
            status: winnerId === match.creatorId ? 'WON' : 'LOST',
            settledAt: new Date(),
          },
        });
      }

      if (match.opponentSlip) {
        await tx.slip.update({
          where: { id: match.opponentSlip.id },
          data: {
            status: winnerId === match.opponentId ? 'WON' : 'LOST',
            settledAt: new Date(),
          },
        });
      }

      // Create audit log with full details
      const auditLog = await tx.matchAuditLog.create({
        data: {
          matchId,
          action: 'MANUAL_SETTLE',
          performedBy: adminId,
          ipAddress,
          userAgent,
          previousState: {
            status: match.status,
            winnerId: match.winnerId,
          } as Prisma.InputJsonValue,
          newState: {
            status: 'settled',
            winnerId,
            totalPot: totalPot.toString(),
            winnerPayout: winnerPayout.toString(),
            rakeAmount: rakeAmount.toString(),
          } as Prisma.InputJsonValue,
          metadata: {
            reason,
            adminOverride: true,
            ...metadata,
          } as Prisma.InputJsonValue,
        },
      });

      auditLogId = auditLog.id;
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  // Process payout (outside transaction, idempotent)
  const payoutTx = await creditWallet({
    userId: winnerId,
    amount: winnerPayout,
    type: 'MATCH_WIN',
    matchId,
    idempotencyKey: generateManualPayoutKey(matchId, winnerId),
    description: `Manual settlement: Match ${matchId} - ${reason}`,
  });

  logger.warn(`[EdgeCases] Force settled match ${matchId} with winner ${winnerId}`);

  return {
    auditLogId,
    payoutTxId: payoutTx.id,
    winnerPayout,
    rakeAmount,
  };
}

/**
 * Internal: Void match and refund both players.
 */
async function voidAndRefundMatch(
  matchId: string,
  adminId: string,
  reason: string,
  metadata: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<VoidAndRefundResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    throw new NotFoundError('Match not found', ERROR_CODES.INTERNAL_ERROR);
  }

  if (match.status === 'voided') {
    throw new BadRequestError('Match already voided', ERROR_CODES.INTERNAL_ERROR);
  }

  let auditLogId: string = '';

  await prisma.$transaction(
    async (tx) => {
      // Update match with optimistic lock
      const updateResult = await tx.match.updateMany({
        where: {
          id: matchId,
          version: match.version,
        },
        data: {
          status: 'voided',
          settledAt: new Date(),
          settledBy: adminId,
          settlementMethod: 'MANUAL',
          settlementReason: reason,
          isManuallySettled: true,
          manualSettleReason: reason,
          manualSettledBy: adminId,
          manualSettledAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError(
          'Match was modified during manual void',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Create audit log
      const auditLog = await tx.matchAuditLog.create({
        data: {
          matchId,
          action: 'MANUAL_VOID',
          performedBy: adminId,
          ipAddress,
          userAgent,
          previousState: { status: match.status } as Prisma.InputJsonValue,
          newState: { status: 'voided' } as Prisma.InputJsonValue,
          metadata: {
            reason,
            adminOverride: true,
            ...metadata,
          } as Prisma.InputJsonValue,
        },
      });

      auditLogId = auditLog.id;
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );

  // Process refunds (outside transaction, idempotent)
  const refundTxIds: string[] = [];

  const creatorRefund = await creditWallet({
    userId: match.creatorId,
    amount: match.stakeAmount,
    type: 'MATCH_REFUND',
    matchId,
    idempotencyKey: generateManualRefundKey(matchId, match.creatorId),
    description: `Manual void: Match ${matchId} - ${reason}`,
  });
  refundTxIds.push(creatorRefund.id);

  if (match.opponentId) {
    const opponentRefund = await creditWallet({
      userId: match.opponentId,
      amount: match.stakeAmount,
      type: 'MATCH_REFUND',
      matchId,
      idempotencyKey: generateManualRefundKey(matchId, match.opponentId),
      description: `Manual void: Match ${matchId} - ${reason}`,
    });
    refundTxIds.push(opponentRefund.id);
  }

  logger.warn(`[EdgeCases] Voided match ${matchId} with refunds`);

  return {
    auditLogId,
    refundTransactionIds: refundTxIds,
    totalRefunded: match.stakeAmount * BigInt(match.opponentId ? 2 : 1),
  };
}
