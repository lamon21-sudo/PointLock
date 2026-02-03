// =====================================================
// Match Service
// =====================================================
// Core business logic for private 1v1 PvP matches.
// CRITICAL: All financial operations use atomic transactions with optimistic locking.

import { Prisma, MatchStatus, SlipStatus, GameMode, QueueStatus, FriendshipStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { debitWallet, processRefund, bigIntToNumber } from '../../lib/wallet.service';
import {
  CreateMatchInput,
  ListMatchesQuery,
  MatchDetails,
  MatchListItem,
  PaginatedMatches,
  MATCH_DETAILS_SELECT,
  MATCH_LIST_SELECT,
  SlipBasic,
  PickBasic,
} from './matches.schemas';

// ===========================================
// Constants
// ===========================================

const INVITE_CODE_LENGTH = 10;
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes ambiguous chars (0, O, I, 1)
const DEFAULT_EXPIRY_HOURS = 24;
const TRANSACTION_TIMEOUT = 10000; // 10 seconds

// ===========================================
// Helper Functions
// ===========================================

/**
 * Generates a random alphanumeric invite code.
 * Excludes ambiguous characters for user-friendliness.
 */
function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    code += INVITE_CODE_CHARS[randomIndex];
  }
  return code;
}

/**
 * Calculates invite expiration timestamp.
 */
function calculateExpiryTime(hoursFromNow: number): Date {
  const now = new Date();
  return new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
}

/**
 * Transforms Prisma Match to MatchDetails (converts BigInt to number).
 */
function transformMatchDetails(match: any): MatchDetails {
  return {
    id: match.id,
    type: match.type,
    stakeAmount: bigIntToNumber(match.stakeAmount),
    rakePercentage: parseFloat(match.rakePercentage.toString()),
    creatorId: match.creatorId,
    opponentId: match.opponentId,
    winnerId: match.winnerId,
    creatorSlipId: match.creatorSlipId,
    opponentSlipId: match.opponentSlipId,
    creatorPoints: parseFloat(match.creatorPoints.toString()),
    opponentPoints: parseFloat(match.opponentPoints.toString()),
    status: match.status,
    settledAt: match.settledAt,
    settlementReason: match.settlementReason,
    totalPot: match.totalPot ? bigIntToNumber(match.totalPot) : null,
    rakeAmount: match.rakeAmount ? bigIntToNumber(match.rakeAmount) : null,
    winnerPayout: match.winnerPayout ? bigIntToNumber(match.winnerPayout) : null,
    inviteCode: match.inviteCode,
    inviteExpiresAt: match.inviteExpiresAt,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    startedAt: match.startedAt,
    version: match.version,
    matchedAt: match.matchedAt,
    cancelledAt: match.cancelledAt,
    cancellationReason: match.cancellationReason,
    creator: match.creator,
    opponent: match.opponent,
    winner: match.winner,
    creatorSlip: match.creatorSlip ? transformSlip(match.creatorSlip) : null,
    opponentSlip: match.opponentSlip ? transformSlip(match.opponentSlip) : null,
  };
}

/**
 * Transforms slip data (converts totalOdds Decimal to number).
 */
function transformSlip(slip: any): SlipBasic {
  return {
    id: slip.id,
    status: slip.status,
    totalPicks: slip.totalPicks,
    totalOdds: parseFloat(slip.totalOdds.toString()),
    createdAt: slip.createdAt,
    picks: slip.picks ? slip.picks.map(transformPick) : undefined,
  };
}

/**
 * Transforms pick data (converts odds Decimal to number).
 */
function transformPick(pick: any): PickBasic {
  return {
    id: pick.id,
    eventId: pick.eventId,
    team: pick.team,
    odds: parseFloat(pick.odds.toString()),
    result: pick.result,
  };
}

/**
 * Transforms Prisma Match to MatchListItem.
 */
function transformMatchListItem(match: any): MatchListItem {
  return {
    id: match.id,
    type: match.type,
    stakeAmount: bigIntToNumber(match.stakeAmount),
    status: match.status,
    creatorId: match.creatorId,
    opponentId: match.opponentId,
    winnerId: match.winnerId,
    inviteCode: match.inviteCode,
    inviteExpiresAt: match.inviteExpiresAt,
    createdAt: match.createdAt,
    matchedAt: match.matchedAt,
    settledAt: match.settledAt,
    creatorUsername: match.creatorUsername,
    opponentUsername: match.opponentUsername,
  };
}

/**
 * Validates that a slip is eligible for match entry.
 * - Must exist and belong to user
 * - Must be in DRAFT status
 * - Must have at least 1 pick
 */
async function validateSlipForMatch(
  slipId: string,
  userId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const slip = await tx.slip.findFirst({
    where: { id: slipId, userId },
    select: {
      id: true,
      status: true,
      totalPicks: true,
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
      'Cannot use a slip with no picks for a match',
      ERROR_CODES.INVALID_PICK_COUNT
    );
  }
}

/**
 * Creates an audit log entry for match state changes.
 */
async function createAuditLog(
  tx: Prisma.TransactionClient,
  matchId: string,
  action: string,
  userId: string | null,
  previousState?: Record<string, unknown>,
  newState?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<void> {
  await tx.matchAuditLog.create({
    data: {
      matchId,
      action,
      performedBy: userId || 'SYSTEM',
      previousState: (previousState || {}) as Prisma.InputJsonValue,
      newState: (newState || {}) as Prisma.InputJsonValue,
      metadata: (metadata || {}) as Prisma.InputJsonValue,
    },
  });
}

// ===========================================
// Service Methods
// ===========================================

/**
 * Creates a new match with invite code.
 *
 * Flow:
 * 1. Validate slip (DRAFT, owned by user, has picks)
 * 2. Generate unique invite code
 * 3. Atomic transaction:
 *    a. Debit creator's wallet
 *    b. Lock creator's slip (DRAFT → PENDING)
 *    c. Create match record
 *    d. Create audit log
 *
 * @throws {NotFoundError} Slip not found
 * @throws {ForbiddenError} Slip not DRAFT or not owned by user
 * @throws {BadRequestError} Slip has no picks
 * @throws {InsufficientBalanceError} Wallet balance too low
 */
export async function createMatch(
  userId: string,
  data: CreateMatchInput
): Promise<MatchDetails> {
  const { slipId, stakeAmount, inviteExpiresIn } = data;

  // Generate unique invite code (retry on collision)
  let inviteCode: string;
  let codeExists = true;
  let attempts = 0;
  const maxAttempts = 5;

  while (codeExists && attempts < maxAttempts) {
    inviteCode = generateInviteCode();
    const existing = await prisma.match.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    codeExists = !!existing;
    attempts++;
  }

  if (codeExists) {
    throw new ConflictError(
      'Failed to generate unique invite code. Please retry.',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  const inviteExpiresAt = calculateExpiryTime(inviteExpiresIn || DEFAULT_EXPIRY_HOURS);
  const stakeAmountBigInt = BigInt(stakeAmount);

  // Execute atomic transaction
  const match = await prisma.$transaction(
    async (tx) => {
      // 1. Validate slip
      await validateSlipForMatch(slipId, userId, tx);

      // 2. Debit creator's wallet
      const entryTx = await debitWallet({
        userId,
        amount: stakeAmountBigInt,
        type: 'MATCH_ENTRY',
        preferBonus: true,
        idempotencyKey: `match-create-${userId}-${Date.now()}-${slipId}`,
        description: `Match entry fee: ${stakeAmount} RC`,
      });

      logger.info(
        `[MatchService] Creator ${userId} debited ${stakeAmount} RC (tx: ${entryTx.id})`
      );

      // 3. Lock creator's slip
      await tx.slip.update({
        where: { id: slipId },
        data: {
          status: SlipStatus.PENDING,
          lockedAt: new Date(),
        },
      });

      logger.info(`[MatchService] Locked slip ${slipId} for match creation`);

      // 4. Create match
      const createdMatch = await tx.match.create({
        data: {
          type: 'private',
          stakeAmount: stakeAmountBigInt,
          creatorId: userId,
          creatorSlipId: slipId,
          creatorEntryTxId: entryTx.id,
          status: MatchStatus.pending,
          inviteCode: inviteCode!,
          inviteExpiresAt,
          version: 1,
        },
        select: MATCH_DETAILS_SELECT,
      });

      // 5. Create audit log
      await createAuditLog(
        tx,
        createdMatch.id,
        'CREATED',
        userId,
        {},
        { status: 'pending', stakeAmount },
        { inviteCode: inviteCode!, inviteExpiresAt: inviteExpiresAt.toISOString() }
      );

      logger.info(
        `[MatchService] Created match ${createdMatch.id} with invite code ${inviteCode}`
      );

      return createdMatch;
    },
    { timeout: TRANSACTION_TIMEOUT }
  );

  return transformMatchDetails(match);
}

/**
 * Joins an existing match as opponent.
 * Uses optimistic locking to prevent concurrent joins (race condition).
 *
 * Flow:
 * 1. Fetch match with current version
 * 2. Validate:
 *    - Match is pending
 *    - Invite not expired
 *    - Opponent ≠ creator
 * 3. Validate opponent's slip
 * 4. Atomic transaction:
 *    a. Debit opponent's wallet
 *    b. Lock opponent's slip
 *    c. Update match with version check (optimistic lock)
 *    d. Set status=matched, increment version
 *    e. Create audit log
 *
 * @throws {NotFoundError} Match or slip not found
 * @throws {BadRequestError} Match not joinable (expired, wrong status, self-join)
 * @throws {ConflictError} Concurrent join detected (version mismatch)
 * @throws {InsufficientBalanceError} Wallet balance too low
 */
export async function joinMatch(
  matchId: string,
  opponentId: string,
  opponentSlipId: string
): Promise<MatchDetails> {
  // 1. Fetch match with optimistic lock (read version)
  const existingMatch = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      version: true,
      status: true,
      creatorId: true,
      stakeAmount: true,
      inviteExpiresAt: true,
      inviteCode: true,
    },
  });

  if (!existingMatch) {
    throw new NotFoundError(
      `Match with ID ${matchId} not found`,
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  // 2. Validate match state
  if (existingMatch.status !== MatchStatus.pending) {
    throw new BadRequestError(
      `Match is not available to join (status: ${existingMatch.status})`,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (existingMatch.inviteExpiresAt && existingMatch.inviteExpiresAt < new Date()) {
    throw new BadRequestError(
      'Match invite has expired',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (existingMatch.creatorId === opponentId) {
    throw new BadRequestError(
      'Cannot join your own match',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const stakeAmount = existingMatch.stakeAmount;

  // 3. Execute atomic transaction with optimistic lock
  const updatedMatch = await prisma.$transaction(
    async (tx) => {
      // Validate opponent's slip
      await validateSlipForMatch(opponentSlipId, opponentId, tx);

      // Debit opponent's wallet
      const entryTx = await debitWallet({
        userId: opponentId,
        amount: stakeAmount,
        type: 'MATCH_ENTRY',
        preferBonus: true,
        matchId: matchId,
        idempotencyKey: `match-${matchId}-entry-${opponentId}`,
        description: `Match entry fee: ${bigIntToNumber(stakeAmount)} RC`,
      });

      logger.info(
        `[MatchService] Opponent ${opponentId} debited ${bigIntToNumber(stakeAmount)} RC (tx: ${entryTx.id})`
      );

      // Lock opponent's slip
      await tx.slip.update({
        where: { id: opponentSlipId },
        data: {
          status: SlipStatus.PENDING,
          lockedAt: new Date(),
        },
      });

      logger.info(`[MatchService] Locked slip ${opponentSlipId} for match join`);

      // Update match with optimistic lock (CRITICAL: version check)
      const updateResult = await tx.match.updateMany({
        where: {
          id: matchId,
          version: existingMatch.version, // CRITICAL: Must match current version
          status: MatchStatus.pending, // Double-check status hasn't changed
        },
        data: {
          opponentId,
          opponentSlipId,
          opponentEntryTxId: entryTx.id,
          status: MatchStatus.matched,
          matchedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // If no rows updated, version changed = concurrent modification
      if (updateResult.count === 0) {
        throw new ConflictError(
          'Match already joined by another player. Please refresh and try again.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      logger.info(`[MatchService] Match ${matchId} joined by opponent ${opponentId}`);

      // Fetch updated match with relations
      const match = await tx.match.findUnique({
        where: { id: matchId },
        select: MATCH_DETAILS_SELECT,
      });

      if (!match) {
        throw new NotFoundError('Match not found after update', ERROR_CODES.INTERNAL_ERROR);
      }

      // Create audit log
      await createAuditLog(
        tx,
        matchId,
        'OPPONENT_JOINED',
        opponentId,
        { status: 'pending' },
        { status: 'matched', opponentId },
        { opponentSlipId, stakeAmount: bigIntToNumber(stakeAmount) }
      );

      return match;
    },
    { timeout: TRANSACTION_TIMEOUT }
  );

  return transformMatchDetails(updatedMatch);
}

/**
 * Fetches a match by ID with full relations.
 * Optionally filters by userId (only returns if user is participant).
 *
 * @param matchId Match UUID
 * @param userId Optional user ID for authorization check
 * @returns MatchDetails or null if not found/unauthorized
 */
export async function getMatchById(
  matchId: string,
  userId?: string
): Promise<MatchDetails | null> {
  const whereClause: Prisma.MatchWhereInput = { id: matchId };

  // If userId provided, only return if user is participant
  if (userId) {
    whereClause.OR = [{ creatorId: userId }, { opponentId: userId }];
  }

  const match = await prisma.match.findFirst({
    where: whereClause,
    select: MATCH_DETAILS_SELECT,
  });

  if (!match) {
    return null;
  }

  return transformMatchDetails(match);
}

/**
 * Fetches user's matches with filters and pagination.
 *
 * @param userId User UUID
 * @param filters Status and role filters
 * @param pagination Page and limit
 * @returns Paginated list of matches
 */
export async function getUserMatches(
  userId: string,
  filters: ListMatchesQuery
): Promise<PaginatedMatches> {
  const { status, role, page, limit } = filters;

  // Build where clause
  const whereClause: Prisma.MatchWhereInput = {};

  // Role filter
  if (role === 'creator') {
    whereClause.creatorId = userId;
  } else if (role === 'opponent') {
    whereClause.opponentId = userId;
  } else {
    // role === 'any'
    whereClause.OR = [{ creatorId: userId }, { opponentId: userId }];
  }

  // Status filter
  if (status && status.length > 0) {
    whereClause.status = { in: status as MatchStatus[] };
  }

  // Count total matches
  const total = await prisma.match.count({ where: whereClause });

  // Fetch paginated matches
  const matches = await prisma.match.findMany({
    where: whereClause,
    select: MATCH_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    matches: matches.map(transformMatchListItem),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Fetches a match by invite code.
 * Used by opponents to look up matches before joining.
 *
 * PRIVACY: Does not include creator's slip picks to prevent sniping.
 *
 * @param inviteCode 10-character alphanumeric code
 * @returns MatchDetails (without creator picks) or null
 */
export async function getMatchByInviteCode(inviteCode: string): Promise<MatchDetails | null> {
  const match = await prisma.match.findUnique({
    where: { inviteCode },
    select: {
      ...MATCH_DETAILS_SELECT,
      // Override creatorSlip to exclude picks
      creatorSlip: {
        select: {
          id: true,
          status: true,
          totalPicks: true,
          totalOdds: true,
          createdAt: true,
          // NOTE: Explicitly excluding 'picks' for privacy
        },
      },
    },
  });

  if (!match) {
    return null;
  }

  return transformMatchDetails(match);
}

/**
 * Processes expired matches (called by background job).
 *
 * For each expired pending match:
 * 1. Update status to 'expired' with optimistic lock
 * 2. Refund creator's entry fee
 * 3. Unlock creator's slip (PENDING → DRAFT)
 * 4. Create audit log
 *
 * Returns count of processed matches.
 */
export async function processExpiredMatches(): Promise<number> {
  const now = new Date();

  const expiredMatches = await prisma.match.findMany({
    where: {
      status: MatchStatus.pending,
      inviteExpiresAt: { lt: now },
    },
    select: {
      id: true,
      creatorId: true,
      creatorSlipId: true,
      creatorEntryTxId: true,
      stakeAmount: true,
      version: true,
      inviteCode: true,
    },
  });

  if (expiredMatches.length === 0) {
    return 0;
  }

  logger.info(`[MatchService] Processing ${expiredMatches.length} expired matches in batch`);

  // OPTIMIZATION: Single transaction for batch operations where possible
  const processedMatchIds: string[] = [];
  const slipIdsToUnlock: string[] = [];
  const auditLogs: Array<{
    matchId: string;
    action: string;
    performedBy: string;
    previousState: Prisma.InputJsonValue;
    newState: Prisma.InputJsonValue;
    metadata: Prisma.InputJsonValue;
  }> = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. Batch update all match statuses
        const matchIds = expiredMatches.map((m) => m.id);
        const updateResult = await tx.match.updateMany({
          where: {
            id: { in: matchIds },
            status: MatchStatus.pending, // Only update still-pending matches
          },
          data: {
            status: MatchStatus.expired,
            cancelledAt: now,
            cancellationReason: 'Invite expired',
            version: { increment: 1 },
          },
        });

        logger.info(`[MatchService] Batch updated ${updateResult.count} match statuses`);

        // Track which matches were actually updated
        // Re-fetch to know which ones were processed
        const updatedMatches = await tx.match.findMany({
          where: {
            id: { in: matchIds },
            status: MatchStatus.expired,
            cancelledAt: now,
          },
          select: { id: true },
        });
        const updatedIds = new Set(updatedMatches.map((m) => m.id));

        // 2. Collect slip IDs and prepare audit logs for successfully updated matches
        for (const match of expiredMatches) {
          if (updatedIds.has(match.id)) {
            processedMatchIds.push(match.id);
            if (match.creatorSlipId) {
              slipIdsToUnlock.push(match.creatorSlipId);
            }
            auditLogs.push({
              matchId: match.id,
              action: 'EXPIRED',
              performedBy: 'SYSTEM',
              previousState: { status: 'pending' },
              newState: { status: 'expired' },
              metadata: { inviteCode: match.inviteCode, expiredAt: now.toISOString() },
            });
          }
        }

        // 3. Batch unlock all slips
        if (slipIdsToUnlock.length > 0) {
          await tx.slip.updateMany({
            where: { id: { in: slipIdsToUnlock } },
            data: {
              status: SlipStatus.DRAFT,
              lockedAt: null,
            },
          });
          logger.info(`[MatchService] Batch unlocked ${slipIdsToUnlock.length} slips`);
        }

        // 4. Batch create audit logs
        if (auditLogs.length > 0) {
          await tx.matchAuditLog.createMany({ data: auditLogs });
        }
      },
      { timeout: TRANSACTION_TIMEOUT * 2 } // Extended timeout for batch
    );

    // 5. Process refunds individually (required for idempotency)
    // This is done outside the main transaction to avoid long locks
    for (const match of expiredMatches) {
      if (processedMatchIds.includes(match.id) && match.creatorEntryTxId) {
        try {
          await processRefund({
            originalTransactionId: match.creatorEntryTxId,
            idempotencyKey: `match-${match.id}-refund-expire`,
            description: 'Match expired - entry fee refunded',
          });
        } catch (refundError) {
          // Log but don't fail - refund can be retried
          logger.error(
            `[MatchService] Failed to refund match ${match.id}:`,
            refundError
          );
        }
      }
    }

    logger.info(
      `[MatchService] Batch processed ${processedMatchIds.length}/${expiredMatches.length} expired matches`
    );
    return processedMatchIds.length;
  } catch (error) {
    logger.error('[MatchService] Batch processing failed, falling back to individual:', error);

    // Fallback: process individually if batch fails
    let fallbackCount = 0;
    for (const match of expiredMatches) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const updateResult = await tx.match.updateMany({
              where: {
                id: match.id,
                status: MatchStatus.pending,
              },
              data: {
                status: MatchStatus.expired,
                cancelledAt: now,
                cancellationReason: 'Invite expired',
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) return;

            if (match.creatorSlipId) {
              await tx.slip.update({
                where: { id: match.creatorSlipId },
                data: { status: SlipStatus.DRAFT, lockedAt: null },
              });
            }

            await createAuditLog(tx, match.id, 'EXPIRED', null, { status: 'pending' }, { status: 'expired' }, {});

            if (match.creatorEntryTxId) {
              await processRefund({
                originalTransactionId: match.creatorEntryTxId,
                idempotencyKey: `match-${match.id}-refund-expire`,
                description: 'Match expired - entry fee refunded',
              });
            }

            fallbackCount++;
          },
          { timeout: TRANSACTION_TIMEOUT }
        );
      } catch (err) {
        logger.error(`[MatchService] Failed to process match ${match.id}:`, err);
      }
    }
    return fallbackCount;
  }
}

// ===========================================
// Task 2.2: New Match Mode Methods
// ===========================================

/**
 * Checks if user has an active match (pending, matched, or active).
 * Used to prevent double-matching.
 *
 * @param userId User UUID
 * @returns true if user has an active match
 */
export async function checkActiveMatch(userId: string): Promise<boolean> {
  const activeMatch = await prisma.match.findFirst({
    where: {
      OR: [{ creatorId: userId }, { opponentId: userId }],
      status: { in: [MatchStatus.pending, MatchStatus.matched, MatchStatus.active] },
    },
    select: { id: true },
  });

  return !!activeMatch;
}

/**
 * Checks if user is currently in the matchmaking queue.
 * Used to prevent friend challenges to users in queue.
 *
 * @param userId User UUID
 * @returns true if user is in queue
 */
export async function checkUserInQueue(userId: string): Promise<boolean> {
  const queueEntry = await prisma.matchmakingQueue.findFirst({
    where: {
      userId,
      status: QueueStatus.WAITING,
    },
    select: { id: true },
  });

  return !!queueEntry;
}

/**
 * Creates a random match lobby (public, browsable).
 * Similar to createMatch but with gameMode=RANDOM_MATCH and type=public.
 *
 * Flow:
 * 1. Check user doesn't already have active match
 * 2. Check user doesn't already have pending public lobby
 * 3. Validate slip
 * 4. Generate invite code (for lobby lookup)
 * 5. Atomic transaction: debit, lock slip, create match
 *
 * @throws {ConflictError} User already has active match or pending lobby
 * @throws {NotFoundError} Slip not found
 * @throws {ForbiddenError} Slip not eligible
 */
export async function createRandomMatchLobby(
  userId: string,
  data: { slipId: string; stakeAmount: number; lobbyExpiresIn?: number }
): Promise<MatchDetails> {
  const { slipId, stakeAmount, lobbyExpiresIn = 1 } = data;

  // 1. Check for active match
  const hasActiveMatch = await checkActiveMatch(userId);
  if (hasActiveMatch) {
    throw new ConflictError(
      'You already have an active match. Complete or cancel it first.',
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  // 2. Check for existing pending public lobby
  const existingLobby = await prisma.match.findFirst({
    where: {
      creatorId: userId,
      type: 'public',
      gameMode: GameMode.RANDOM_MATCH,
      status: MatchStatus.pending,
    },
    select: { id: true, inviteCode: true },
  });

  if (existingLobby) {
    throw new ConflictError(
      `You already have a pending lobby (code: ${existingLobby.inviteCode}). Cancel it or wait for it to expire.`,
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  // 3. Generate unique invite code (used as lobby code)
  let inviteCode: string;
  let codeExists = true;
  let attempts = 0;
  const maxAttempts = 5;

  while (codeExists && attempts < maxAttempts) {
    inviteCode = generateInviteCode();
    const existing = await prisma.match.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    codeExists = !!existing;
    attempts++;
  }

  if (codeExists) {
    throw new ConflictError(
      'Failed to generate unique lobby code. Please retry.',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  const inviteExpiresAt = calculateExpiryTime(lobbyExpiresIn);
  const stakeAmountBigInt = BigInt(stakeAmount);

  // 4. Execute atomic transaction
  const match = await prisma.$transaction(
    async (tx) => {
      // Validate slip
      await validateSlipForMatch(slipId, userId, tx);

      // Debit creator's wallet
      const entryTx = await debitWallet({
        userId,
        amount: stakeAmountBigInt,
        type: 'MATCH_ENTRY',
        preferBonus: true,
        idempotencyKey: `random-match-${userId}-${Date.now()}-${slipId}`,
        description: `Random match lobby entry: ${stakeAmount} RC`,
      });

      logger.info(
        `[MatchService] Creator ${userId} debited ${stakeAmount} RC for random lobby (tx: ${entryTx.id})`
      );

      // Lock slip
      await tx.slip.update({
        where: { id: slipId },
        data: {
          status: SlipStatus.PENDING,
          lockedAt: new Date(),
        },
      });

      // Create match
      const createdMatch = await tx.match.create({
        data: {
          type: 'public',
          gameMode: GameMode.RANDOM_MATCH,
          stakeAmount: stakeAmountBigInt,
          creatorId: userId,
          creatorSlipId: slipId,
          creatorEntryTxId: entryTx.id,
          status: MatchStatus.pending,
          inviteCode: inviteCode!,
          inviteExpiresAt,
          version: 1,
        },
        select: MATCH_DETAILS_SELECT,
      });

      // Audit log
      await createAuditLog(
        tx,
        createdMatch.id,
        'RANDOM_LOBBY_CREATED',
        userId,
        {},
        { status: 'pending', stakeAmount, gameMode: 'RANDOM_MATCH' },
        { lobbyCode: inviteCode!, expiresAt: inviteExpiresAt.toISOString() }
      );

      logger.info(
        `[MatchService] Created random match lobby ${createdMatch.id} with code ${inviteCode}`
      );

      return createdMatch;
    },
    { timeout: TRANSACTION_TIMEOUT }
  );

  return transformMatchDetails(match);
}

/**
 * Creates a direct friend challenge match.
 *
 * Flow:
 * 1. Validate not self-challenge
 * 2. Validate friendship status (must be ACCEPTED)
 * 3. Validate target user exists and is not blocked
 * 4. Check target not in matchmaking queue
 * 5. Check neither user has active match
 * 6. Validate challenger's slip
 * 7. Atomic transaction: debit, lock slip, create challenge match
 *
 * @throws {BadRequestError} Self-challenge, invalid slip, target issues
 * @throws {ForbiddenError} Not friends, target blocked, target in queue
 * @throws {ConflictError} Active match exists
 * @throws {NotFoundError} Target user or slip not found
 */
export async function createFriendChallenge(
  challengerId: string,
  targetUserId: string,
  data: { slipId: string; stakeAmount: number; message?: string }
): Promise<MatchDetails> {
  const { slipId, stakeAmount, message } = data;

  // 1. Validate not self-challenge (also checked in controller, but double-check)
  if (challengerId === targetUserId) {
    throw new BadRequestError(
      'Cannot challenge yourself',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  // 2. OPTIMIZATION: Batch all validation queries in parallel (6 sequential -> 1 parallel)
  const [
    targetUser,
    friendship,
    challengerInQueue,
    targetInQueue,
    challengerActiveMatch,
    targetActiveMatch,
  ] = await Promise.all([
    // Target user exists and is active
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, status: true },
    }),
    // Friendship status (inline query to avoid import overhead)
    prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: challengerId, friendId: targetUserId },
          { userId: targetUserId, friendId: challengerId },
        ],
      },
      select: { status: true, userId: true },
    }),
    // Challenger not in queue
    prisma.matchmakingQueue.findFirst({
      where: { userId: challengerId, status: QueueStatus.WAITING },
      select: { id: true },
    }),
    // Target not in queue
    prisma.matchmakingQueue.findFirst({
      where: { userId: targetUserId, status: QueueStatus.WAITING },
      select: { id: true },
    }),
    // Challenger has no active match
    prisma.match.findFirst({
      where: {
        OR: [{ creatorId: challengerId }, { opponentId: challengerId }],
        status: { in: [MatchStatus.pending, MatchStatus.matched, MatchStatus.active] },
      },
      select: { id: true },
    }),
    // Target has no active match
    prisma.match.findFirst({
      where: {
        OR: [{ creatorId: targetUserId }, { opponentId: targetUserId }],
        status: { in: [MatchStatus.pending, MatchStatus.matched, MatchStatus.active] },
      },
      select: { id: true },
    }),
  ]);

  // 3. Validate target user
  if (!targetUser) {
    throw new NotFoundError(
      'Target user not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  if (targetUser.status !== 'active') {
    throw new ForbiddenError(
      'Target user account is not active',
      ERROR_CODES.FORBIDDEN
    );
  }

  // 4. Validate friendship status
  if (!friendship || friendship.status !== FriendshipStatus.ACCEPTED) {
    if (friendship?.status === FriendshipStatus.BLOCKED) {
      throw new ForbiddenError(
        'Cannot challenge this user',
        ERROR_CODES.FORBIDDEN
      );
    }
    throw new ForbiddenError(
      'You must be friends to send a direct challenge',
      ERROR_CODES.FORBIDDEN
    );
  }

  // 5. Check queue status
  if (challengerInQueue) {
    throw new ConflictError(
      'You are currently in matchmaking queue. Leave the queue first.',
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  if (targetInQueue) {
    throw new ConflictError(
      'Target user is currently in matchmaking queue. They must leave the queue first.',
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  // 6. Check active match status
  if (challengerActiveMatch) {
    throw new ConflictError(
      'You already have an active match',
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  if (targetActiveMatch) {
    throw new ConflictError(
      'Target user already has an active match',
      ERROR_CODES.MATCH_ALREADY_FULL
    );
  }

  // 6. Generate invite code for the challenge
  let inviteCode: string;
  let codeExists = true;
  let attempts = 0;
  const maxAttempts = 5;

  while (codeExists && attempts < maxAttempts) {
    inviteCode = generateInviteCode();
    const existing = await prisma.match.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    codeExists = !!existing;
    attempts++;
  }

  if (codeExists) {
    throw new ConflictError(
      'Failed to generate unique challenge code. Please retry.',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  const inviteExpiresAt = calculateExpiryTime(24); // 24-hour expiry for friend challenges
  const stakeAmountBigInt = BigInt(stakeAmount);

  // 7. Execute atomic transaction
  const match = await prisma.$transaction(
    async (tx) => {
      // Validate slip
      await validateSlipForMatch(slipId, challengerId, tx);

      // Debit challenger's wallet
      const entryTx = await debitWallet({
        userId: challengerId,
        amount: stakeAmountBigInt,
        type: 'MATCH_ENTRY',
        preferBonus: true,
        idempotencyKey: `friend-challenge-${challengerId}-${targetUserId}-${Date.now()}`,
        description: `Friend challenge entry: ${stakeAmount} RC`,
      });

      logger.info(
        `[MatchService] Challenger ${challengerId} debited ${stakeAmount} RC for friend challenge (tx: ${entryTx.id})`
      );

      // Lock slip
      await tx.slip.update({
        where: { id: slipId },
        data: {
          status: SlipStatus.PENDING,
          lockedAt: new Date(),
        },
      });

      // Create match
      // NOTE: Target friend info is stored in audit log metadata.
      // The invite code should only be shared with the target friend.
      const createdMatch = await tx.match.create({
        data: {
          type: 'private',
          gameMode: GameMode.PLAY_FRIEND,
          stakeAmount: stakeAmountBigInt,
          creatorId: challengerId,
          creatorSlipId: slipId,
          creatorEntryTxId: entryTx.id,
          status: MatchStatus.pending,
          inviteCode: inviteCode!,
          inviteExpiresAt,
          version: 1,
        },
        select: MATCH_DETAILS_SELECT,
      });

      // Audit log - stores the target friend info for tracking
      await createAuditLog(
        tx,
        createdMatch.id,
        'FRIEND_CHALLENGE_SENT',
        challengerId,
        {},
        { status: 'pending', stakeAmount, gameMode: 'PLAY_FRIEND' },
        { targetUserId, targetUsername: targetUser.username, message: message || null, inviteCode: inviteCode! }
      );

      logger.info(
        `[MatchService] Created friend challenge ${createdMatch.id} from ${challengerId} to ${targetUserId}`
      );

      // TODO: Send push notification to target user
      // await sendPushNotification(targetUserId, {
      //   type: 'FRIEND_CHALLENGE',
      //   matchId: createdMatch.id,
      //   challengerUsername: ...,
      // });

      return createdMatch;
    },
    { timeout: TRANSACTION_TIMEOUT }
  );

  return transformMatchDetails(match);
}
