// =====================================================
// Game Settlement Queue - Automated Match Settlement
// =====================================================
// Handles automated settlement of PvP matches when all
// sports events in a match have completed.
// CRITICAL: All operations are idempotent using optimistic locking
// and BullMQ job deduplication.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';

// ===========================================
// Queue Name Constants
// ===========================================

export const GAME_SETTLEMENT_QUEUE_NAME = 'game-settlement';

// ===========================================
// Job Types
// ===========================================

export type GameSettlementJobType =
  | 'check-match-settlement'
  | 'settle-match'
  | 'void-match'
  | 'check-postponed-matches';

export interface GameSettlementJobData {
  type: GameSettlementJobType;
  matchId?: string; // Optional for check-postponed-matches (checks all)
  /** Optional: The event that triggered this check */
  eventId?: string;
  triggeredBy: 'event-completed' | 'manual' | 'retry' | 'scheduled' | 'event-cancelled' | 'postponement-timeout' | 'admin-void';
  receivedAt: string;
  /** For void-match jobs: the reason for voiding */
  voidReason?: string;
  /** For manual operations: the admin ID */
  performedBy?: string;
}

export interface GameSettlementJobResult {
  success: boolean;
  type: GameSettlementJobType;
  matchId?: string;
  settled: boolean;
  message: string;
  /** Settlement result details (if settled) */
  winnerId?: string | null;
  isDraw?: boolean;
  creatorPoints?: number;
  opponentPoints?: number;
  /** For void jobs: whether refunds were processed */
  refunded?: boolean;
  refundTransactionIds?: string[];
  /** For postponed checks: number of matches processed */
  matchesProcessed?: number;
  error?: string;
  durationMs: number;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let gameSettlementQueue: Queue<GameSettlementJobData, GameSettlementJobResult> | null = null;
let gameSettlementWorker: Worker<GameSettlementJobData, GameSettlementJobResult> | null = null;

/**
 * Get or create the game settlement queue instance.
 */
export function getGameSettlementQueue(): Queue<GameSettlementJobData, GameSettlementJobResult> {
  if (!gameSettlementQueue) {
    gameSettlementQueue = new Queue<GameSettlementJobData, GameSettlementJobResult>(
      GAME_SETTLEMENT_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay (settlement is important)
          },
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 1000, // Keep last 1000 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days for manual review
          },
        },
      }
    );

    logger.info(`[GameSettlement] Queue initialized: ${GAME_SETTLEMENT_QUEUE_NAME}`);
  }

  return gameSettlementQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process game settlement jobs.
 * CRITICAL: This processor is idempotent via:
 * 1. BullMQ job deduplication (jobId: settle-{matchId})
 * 2. Match.version optimistic locking in settlement service
 * 3. Idempotency keys for financial operations
 */
async function processGameSettlementJob(
  job: Job<GameSettlementJobData, GameSettlementJobResult>
): Promise<GameSettlementJobResult> {
  const startTime = Date.now();
  const { type, matchId, triggeredBy, eventId } = job.data;

  logger.info(`[GameSettlement] Processing job ${job.id}`, {
    type,
    matchId,
    triggeredBy,
    eventId,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Lazy imports to avoid circular dependencies
    const { settleMatch, checkSettlementReadiness } = await import(
      '../services/settlement/settlement.service'
    );
    const { broadcastMatchSettled } = await import(
      '../services/live-scores/live-scores.broadcaster'
    );
    const {
      processVoidMatchRefunds,
      checkPostponedMatches,
    } = await import('../services/settlement/settlement-edge-cases.service');

    switch (type) {
      case 'check-match-settlement': {
        // Check if match is ready for settlement
        if (!matchId) {
          throw new Error('matchId is required for check-match-settlement');
        }
        const readiness = await checkSettlementReadiness(matchId);

        logger.info(`[GameSettlement] Match ${matchId} readiness check:`, {
          isReady: readiness.isReady,
          reason: readiness.reason,
          pendingEvents: readiness.pendingEvents,
          totalEvents: readiness.totalEvents,
        });

        if (!readiness.isReady) {
          // Not ready yet - this is expected when some events are still pending
          return {
            success: true,
            type,
            matchId,
            settled: false,
            message: `Not ready: ${readiness.reason}`,
            durationMs: Date.now() - startTime,
          };
        }

        // Match is ready - queue the actual settlement job with deduplication
        const queue = getGameSettlementQueue();
        await queue.add(
          'settle-match',
          {
            type: 'settle-match',
            matchId,
            eventId,
            triggeredBy: 'event-completed',
            receivedAt: new Date().toISOString(),
          },
          {
            jobId: `settle-${matchId}`, // CRITICAL: Prevents duplicate settlement jobs
            priority: 1, // High priority for settlement
          }
        );

        logger.info(`[GameSettlement] Queued settlement job for match ${matchId}`);

        return {
          success: true,
          type,
          matchId,
          settled: false,
          message: 'Match ready for settlement, job queued',
          durationMs: Date.now() - startTime,
        };
      }

      case 'settle-match': {
        if (!matchId) {
          throw new Error('matchId is required for settle-match');
        }
        try {
          // Execute the settlement
          const result = await settleMatch(matchId);

          // Broadcast settlement to connected clients
          await broadcastMatchSettled(matchId, result);

          // Send push notifications (fire-and-forget, doesn't block settlement)
          try {
            const { sendNotification } = await import(
              '../services/notifications/notification.service'
            );
            const { NotificationCategory } = await import(
              '../services/notifications/notification-categories'
            );
            const { prisma } = await import('../lib/prisma');

            // Fetch match with usernames for notification messages
            const match = await prisma.match.findUnique({
              where: { id: matchId },
              select: {
                creatorId: true,
                opponentId: true,
                creator: { select: { username: true } },
                opponent: { select: { username: true } },
              },
            });

            if (match?.opponentId && match.opponent) {
              const creatorId = match.creatorId;
              const opponentId = match.opponentId;
              const creatorUsername = match.creator.username;
              const opponentUsername = match.opponent.username;
              const winnerId = result.winnerId;
              const isDraw = result.isDraw;

              // Notify creator
              void sendNotification({
                userId: creatorId,
                category: NotificationCategory.SETTLEMENT,
                templateId: winnerId === creatorId
                  ? 'settlement.win'
                  : (isDraw ? 'settlement.draw' : 'settlement.loss'),
                variables: {
                  opponentName: opponentUsername,
                },
                entityId: matchId,
                dedupeKey: `settlement:${matchId}:${creatorId}`,
              });

              // Notify opponent
              void sendNotification({
                userId: opponentId,
                category: NotificationCategory.SETTLEMENT,
                templateId: winnerId === opponentId
                  ? 'settlement.win'
                  : (isDraw ? 'settlement.draw' : 'settlement.loss'),
                variables: {
                  opponentName: creatorUsername,
                },
                entityId: matchId,
                dedupeKey: `settlement:${matchId}:${opponentId}`,
              });

              // Queue win streak check for winner (fire-and-forget)
              if (winnerId) {
                const { queueWinStreakCheck } = await import('./notification-scheduler.queue');
                await queueWinStreakCheck(winnerId, matchId);
              }
            }
          } catch (notificationError) {
            // Push notification failure should NOT fail settlement
            logger.error('[GameSettlement] Push notification failed:', notificationError);
          }

          // Queue leaderboard cache update (fire-and-forget)
          try {
            const { queueLeaderboardUpdateAfterSettlement } = await import('./leaderboard.queue');
            const { prisma: prismaClient } = await import('../lib/prisma');

            // Fetch match for user IDs if not already available
            const matchForCache = await prismaClient.match.findUnique({
              where: { id: matchId },
              select: { creatorId: true, opponentId: true },
            });

            if (matchForCache?.opponentId) {
              await queueLeaderboardUpdateAfterSettlement(
                matchId,
                matchForCache.creatorId,
                matchForCache.opponentId,
                result.creatorPoints,
                result.opponentPoints
              );
              logger.info(`[GameSettlement] Queued leaderboard cache update for match ${matchId}`);
            }
          } catch (cacheError) {
            // Cache update failure should NOT fail settlement
            logger.error('[GameSettlement] Failed to queue leaderboard cache update:', cacheError);
          }

          // Update ranked progression for both players (fire-and-forget)
          try {
            const { updateRankPoints } = await import('../services/ranked.service');
            const { prisma: prismaForRanked } = await import('../lib/prisma');

            const matchForRanked = await prismaForRanked.match.findUnique({
              where: { id: matchId },
              select: { creatorId: true, opponentId: true, seasonId: true },
            });

            if (matchForRanked?.seasonId && matchForRanked.opponentId) {
              const matchResultForRP = {
                matchId,
                seasonId: matchForRanked.seasonId,
                winnerId: result.winnerId,
                loserId: result.isDraw ? null :
                  (result.winnerId === matchForRanked.creatorId ? matchForRanked.opponentId : matchForRanked.creatorId),
                isDraw: result.isDraw,
                settledAt: result.settledAt.toISOString(),
              };

              // Update both players
              const rankedResults = await Promise.allSettled([
                updateRankPoints(matchForRanked.creatorId, matchResultForRP),
                updateRankPoints(matchForRanked.opponentId, matchResultForRP),
              ]);

              for (const rankedResult of rankedResults) {
                if (rankedResult.status === 'rejected') {
                  logger.error('[GameSettlement] Ranked update failed:', rankedResult.reason);
                }
              }

              logger.info(`[GameSettlement] Ranked progression updated for match ${matchId}`);
            }
          } catch (rankedError) {
            logger.error('[GameSettlement] Ranked update failed:', rankedError);
            // Don't fail settlement - ranked is auxiliary
          }

          logger.info(`[GameSettlement] Match ${matchId} settled successfully`, {
            winnerId: result.winnerId,
            isDraw: result.isDraw,
            creatorPoints: result.creatorPoints,
            opponentPoints: result.opponentPoints,
          });

          return {
            success: true,
            type,
            matchId,
            settled: true,
            message: `Settlement complete: ${result.reason}`,
            winnerId: result.winnerId,
            isDraw: result.isDraw,
            creatorPoints: result.creatorPoints,
            opponentPoints: result.opponentPoints,
            durationMs: Date.now() - startTime,
          };
        } catch (error: unknown) {
          // Handle expected idempotent scenarios
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Match already settled - this is OK (idempotent)
          if (errorMessage.includes('already been settled')) {
            logger.info(`[GameSettlement] Match ${matchId} already settled (idempotent)`);
            return {
              success: true,
              type,
              matchId,
              settled: false,
              message: 'Match already settled (idempotent)',
              durationMs: Date.now() - startTime,
            };
          }

          // Match not active - may have been cancelled or voided
          if (errorMessage.includes('is not active')) {
            logger.warn(`[GameSettlement] Match ${matchId} not active: ${errorMessage}`);
            return {
              success: true, // Not a failure - match state changed
              type,
              matchId,
              settled: false,
              message: `Match not active: ${errorMessage}`,
              durationMs: Date.now() - startTime,
            };
          }

          // Events still pending - should not happen but handle gracefully
          if (errorMessage.includes('pending events')) {
            logger.warn(`[GameSettlement] Match ${matchId} has pending events: ${errorMessage}`);
            return {
              success: true,
              type,
              matchId,
              settled: false,
              message: `Events still pending: ${errorMessage}`,
              durationMs: Date.now() - startTime,
            };
          }

          // Re-throw for retry (version conflict, DB errors, etc.)
          throw error;
        }
      }

      case 'void-match': {
        // Void a match and refund both players
        const { voidReason, performedBy } = job.data;
        const voidMatchId = job.data.matchId;

        if (!voidMatchId) {
          throw new Error('matchId is required for void-match job');
        }

        logger.info(`[GameSettlement] Voiding match ${voidMatchId}: ${voidReason}`);

        // Get match details for refund processing
        const { prisma } = await import('../lib/prisma');
        const match = await prisma.match.findUnique({
          where: { id: voidMatchId },
          select: {
            id: true,
            status: true,
            creatorId: true,
            opponentId: true,
            stakeAmount: true,
            version: true,
          },
        });

        if (!match) {
          return {
            success: false,
            type,
            matchId: voidMatchId,
            settled: false,
            message: 'Match not found',
            durationMs: Date.now() - startTime,
          };
        }

        // Skip if already voided (idempotent)
        if (match.status === 'voided') {
          return {
            success: true,
            type,
            matchId: voidMatchId,
            settled: false,
            message: 'Match already voided (idempotent)',
            durationMs: Date.now() - startTime,
          };
        }

        // Skip if not in a voidable state
        if (match.status === 'settled') {
          return {
            success: true,
            type,
            matchId: voidMatchId,
            settled: false,
            message: 'Match already settled, cannot void',
            durationMs: Date.now() - startTime,
          };
        }

        // Update match status to voided
        await prisma.match.updateMany({
          where: { id: voidMatchId, version: match.version },
          data: {
            status: 'voided',
            settledAt: new Date(),
            settledBy: performedBy || 'SYSTEM',
            settlementMethod: 'AUTO',
            settlementReason: voidReason || 'Events cancelled',
            version: { increment: 1 },
          },
        });

        // Process refunds
        const refundTxIds = await processVoidMatchRefunds(
          voidMatchId,
          match.creatorId,
          match.opponentId,
          match.stakeAmount
        );

        // Create audit log
        await prisma.matchAuditLog.create({
          data: {
            matchId: voidMatchId,
            action: 'VOIDED',
            performedBy: performedBy || 'SYSTEM',
            previousState: { status: match.status },
            newState: { status: 'voided', reason: voidReason },
            metadata: {
              triggeredBy: job.data.triggeredBy,
              refundTransactionIds: refundTxIds,
            },
          },
        });

        logger.info(`[GameSettlement] Match ${voidMatchId} voided with ${refundTxIds.length} refunds`);

        return {
          success: true,
          type,
          matchId: voidMatchId,
          settled: false,
          message: `Match voided: ${voidReason}`,
          refunded: true,
          refundTransactionIds: refundTxIds,
          durationMs: Date.now() - startTime,
        };
      }

      case 'check-postponed-matches': {
        // Check all postponed matches and process timeouts
        logger.info('[GameSettlement] Checking postponed matches');

        const results = await checkPostponedMatches();

        const autoCancelled = results.filter((r) => r.action === 'auto_cancelled').length;
        const resolved = results.filter((r) => r.action === 'settled').length;
        const waiting = results.filter((r) => r.action === 'waiting').length;

        logger.info(`[GameSettlement] Postponed check complete`, {
          total: results.length,
          autoCancelled,
          resolved,
          waiting,
        });

        return {
          success: true,
          type,
          settled: false,
          message: `Processed ${results.length} postponed matches (${autoCancelled} cancelled, ${resolved} resolved, ${waiting} waiting)`,
          matchesProcessed: results.length,
          durationMs: Date.now() - startTime,
        };
      }

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    logger.error(`[GameSettlement] Job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the game settlement worker to process jobs.
 * Should be called once during application startup.
 */
export function startGameSettlementWorker(): Worker<GameSettlementJobData, GameSettlementJobResult> {
  if (gameSettlementWorker) {
    logger.warn('[GameSettlement] Worker already running');
    return gameSettlementWorker;
  }

  gameSettlementWorker = new Worker<GameSettlementJobData, GameSettlementJobResult>(
    GAME_SETTLEMENT_QUEUE_NAME,
    processGameSettlementJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // CRITICAL: Process one job at a time to prevent race conditions
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // Per minute (conservative to avoid DB overload)
      },
    }
  );

  gameSettlementWorker.on('completed', (job, result) => {
    if (result.settled) {
      logger.info(`[GameSettlement] Job ${job.id} completed - match settled`, {
        matchId: result.matchId,
        winnerId: result.winnerId,
        isDraw: result.isDraw,
        durationMs: result.durationMs,
      });
    } else {
      logger.debug(`[GameSettlement] Job ${job.id} completed`, {
        matchId: result.matchId,
        message: result.message,
      });
    }
  });

  gameSettlementWorker.on('failed', (job, error) => {
    logger.error(`[GameSettlement] Job ${job?.id} failed:`, {
      matchId: job?.data.matchId,
      error: error.message,
      attempt: job?.attemptsMade,
    });
  });

  gameSettlementWorker.on('error', (error) => {
    logger.error('[GameSettlement] Worker error:', error);
  });

  gameSettlementWorker.on('stalled', (jobId) => {
    logger.warn(`[GameSettlement] Job ${jobId} stalled`);
  });

  logger.info('[GameSettlement] Worker started');
  return gameSettlementWorker;
}

/**
 * Stop the game settlement worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopGameSettlementWorker(): Promise<void> {
  if (gameSettlementWorker) {
    await gameSettlementWorker.close();
    gameSettlementWorker = null;
    logger.info('[GameSettlement] Worker stopped');
  }

  if (gameSettlementQueue) {
    await gameSettlementQueue.close();
    gameSettlementQueue = null;
  }
}

// ===========================================
// Job Queueing Functions
// ===========================================

/**
 * Queue a settlement check for a match.
 * Called when an event completes to check if the match is ready for settlement.
 *
 * @param matchId - The match ID to check
 * @param eventId - The event that triggered this check (optional)
 * @param triggeredBy - What triggered this check
 */
export async function queueSettlementCheck(
  matchId: string,
  eventId: string | undefined,
  triggeredBy: 'event-completed' | 'manual' | 'scheduled'
): Promise<Job<GameSettlementJobData, GameSettlementJobResult>> {
  const queue = getGameSettlementQueue();

  // Use matchId + eventId for job deduplication (same event won't trigger multiple checks)
  const jobId = eventId
    ? `check-${matchId}-${eventId}`
    : `check-${matchId}-${Date.now()}`;

  const job = await queue.add(
    'check-match-settlement',
    {
      type: 'check-match-settlement',
      matchId,
      eventId,
      triggeredBy,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId,
      priority: 2, // Normal priority for checks
    }
  );

  logger.debug(`[GameSettlement] Queued settlement check: ${job.id}`, {
    matchId,
    eventId,
    triggeredBy,
  });

  return job;
}

/**
 * Queue a direct settlement job for a match.
 * Use with caution - typically settlement should go through check first.
 *
 * @param matchId - The match ID to settle
 * @param triggeredBy - What triggered this settlement
 */
export async function queueDirectSettlement(
  matchId: string,
  triggeredBy: 'manual' | 'retry'
): Promise<Job<GameSettlementJobData, GameSettlementJobResult>> {
  const queue = getGameSettlementQueue();

  const job = await queue.add(
    'settle-match',
    {
      type: 'settle-match',
      matchId,
      triggeredBy,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId: `settle-${matchId}`, // Deduplication key
      priority: 1, // High priority
    }
  );

  logger.info(`[GameSettlement] Queued direct settlement: ${job.id}`, {
    matchId,
    triggeredBy,
  });

  return job;
}

// ===========================================
// Queue Monitoring
// ===========================================

/**
 * Get the current status of the game settlement queue.
 */
export async function getGameSettlementQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getGameSettlementQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get failed settlement jobs for manual review.
 */
export async function getFailedSettlementJobs(
  start = 0,
  end = 20
): Promise<Job<GameSettlementJobData, GameSettlementJobResult>[]> {
  const queue = getGameSettlementQueue();
  return queue.getFailed(start, end);
}

/**
 * Retry a failed settlement job by match ID.
 */
export async function retryFailedSettlement(matchId: string): Promise<void> {
  await queueDirectSettlement(matchId, 'retry');
}

// ===========================================
// Edge Case Job Queueing (Task 8.5)
// ===========================================

/**
 * Queue a void job for a match (e.g., when events are cancelled).
 *
 * @param matchId - The match ID to void
 * @param reason - Reason for voiding
 * @param triggeredBy - What triggered the void
 * @param performedBy - Optional admin ID for manual voids
 */
export async function queueVoidMatch(
  matchId: string,
  reason: string,
  triggeredBy: 'event-cancelled' | 'postponement-timeout' | 'admin-void',
  performedBy?: string
): Promise<Job<GameSettlementJobData, GameSettlementJobResult>> {
  const queue = getGameSettlementQueue();

  const job = await queue.add(
    'void-match',
    {
      type: 'void-match',
      matchId,
      voidReason: reason,
      triggeredBy,
      performedBy,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId: `void-${matchId}`, // Deduplication key
      priority: 1, // High priority for refunds
    }
  );

  logger.info(`[GameSettlement] Queued void job: ${job.id}`, {
    matchId,
    reason,
    triggeredBy,
  });

  return job;
}

/**
 * Queue the periodic postponed matches check.
 * Should be called by a cron job (e.g., every hour).
 */
export async function queuePostponedMatchesCheck(): Promise<Job<GameSettlementJobData, GameSettlementJobResult>> {
  const queue = getGameSettlementQueue();

  const job = await queue.add(
    'check-postponed-matches',
    {
      type: 'check-postponed-matches',
      triggeredBy: 'scheduled',
      receivedAt: new Date().toISOString(),
    },
    {
      jobId: `postponed-check-${new Date().toISOString().slice(0, 13)}`, // One per hour max
      priority: 3, // Lower priority than settlements
    }
  );

  logger.debug(`[GameSettlement] Queued postponed check: ${job.id}`);

  return job;
}

/**
 * Set up recurring postponed matches check (every hour).
 * Call this once during application startup.
 */
export async function schedulePostponedMatchesCheck(): Promise<void> {
  const queue = getGameSettlementQueue();

  // Remove any existing repeatable job
  const existingJobs = await queue.getRepeatableJobs();
  for (const repeatJob of existingJobs) {
    if (repeatJob.name === 'check-postponed-matches') {
      await queue.removeRepeatableByKey(repeatJob.key);
    }
  }

  // Add hourly recurring job
  await queue.add(
    'check-postponed-matches',
    {
      type: 'check-postponed-matches',
      triggeredBy: 'scheduled',
      receivedAt: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour at minute 0
      },
      jobId: 'scheduled-postponed-check',
    }
  );

  logger.info('[GameSettlement] Scheduled hourly postponed matches check');
}
