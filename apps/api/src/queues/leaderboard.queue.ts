// =====================================================
// Leaderboard Update Queue
// =====================================================
// Handles leaderboard cache updates after match settlements.
// Ensures the Redis cache stays in sync with the database.
// CRITICAL: All operations are idempotent.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';

// ===========================================
// Queue Name Constants
// ===========================================

export const LEADERBOARD_UPDATE_QUEUE_NAME = 'leaderboard-update-queue';

// ===========================================
// Job Types
// ===========================================

export type LeaderboardUpdateJobType =
  | 'update-after-settlement' // Triggered after match settlement
  | 'full-cache-rebuild'; // Rebuild entire cache

export interface LeaderboardUpdateJobData {
  type: LeaderboardUpdateJobType;
  /** Match ID for settlement-triggered updates */
  matchId?: string;
  /** Creator user ID from settlement */
  creatorId?: string;
  /** Opponent user ID from settlement */
  opponentId?: string;
  /** Points earned by creator */
  creatorScore?: number;
  /** Points earned by opponent */
  opponentScore?: number;
  /** Current weekly leaderboard slug */
  weeklySlug?: string;
  /** What triggered this job */
  triggeredBy: 'settlement' | 'weekly-reset' | 'manual' | 'startup';
  /** ISO timestamp when job was received */
  receivedAt: string;
}

export interface LeaderboardUpdateJobResult {
  success: boolean;
  type: LeaderboardUpdateJobType;
  matchId?: string;
  globalEntriesUpdated: number;
  weeklyEntriesUpdated: number;
  message: string;
  durationMs: number;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let leaderboardUpdateQueue: Queue<LeaderboardUpdateJobData, LeaderboardUpdateJobResult> | null = null;
let leaderboardUpdateWorker: Worker<LeaderboardUpdateJobData, LeaderboardUpdateJobResult> | null = null;

/**
 * Get or create the leaderboard update queue instance.
 */
export function getLeaderboardUpdateQueue(): Queue<LeaderboardUpdateJobData, LeaderboardUpdateJobResult> {
  if (!leaderboardUpdateQueue) {
    leaderboardUpdateQueue = new Queue<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>(
      LEADERBOARD_UPDATE_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000, // Start with 1 second delay
          },
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 1000, // Keep last 1000 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        },
      }
    );

    logger.info(`[LeaderboardUpdate] Queue initialized: ${LEADERBOARD_UPDATE_QUEUE_NAME}`);
  }

  return leaderboardUpdateQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process leaderboard update jobs.
 * CRITICAL: This processor is idempotent.
 */
async function processLeaderboardUpdateJob(
  job: Job<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>
): Promise<LeaderboardUpdateJobResult> {
  const startTime = Date.now();
  const { type, matchId, creatorId, opponentId, creatorScore, opponentScore, triggeredBy } = job.data;

  logger.info(`[LeaderboardUpdate] Processing job ${job.id}`, {
    type,
    matchId,
    triggeredBy,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Lazy imports to avoid circular dependencies
    const {
      rebuildLeaderboardCaches,
      updateGlobalLeaderboardCache,
      updateWeeklyLeaderboardCache,
    } = await import('../modules/leaderboard/leaderboard-cache.service');

    switch (type) {
      case 'update-after-settlement': {
        // Incremental update after a match settlement
        if (!creatorId || !opponentId) {
          throw new Error('creatorId and opponentId required for settlement update');
        }

        // For settlement updates, we do a full cache rebuild to ensure accuracy
        // This is more reliable than incremental updates which may miss edge cases
        // (e.g., users moving in/out of top 100)
        const globalCount = await updateGlobalLeaderboardCache();
        const weeklyCount = await updateWeeklyLeaderboardCache();

        logger.info(`[LeaderboardUpdate] Settlement cache update for match ${matchId}`, {
          creatorId,
          opponentId,
          creatorScore,
          opponentScore,
          globalCount,
          weeklyCount,
        });

        return {
          success: true,
          type,
          matchId,
          globalEntriesUpdated: globalCount,
          weeklyEntriesUpdated: weeklyCount,
          message: 'Cache updated after settlement',
          durationMs: Date.now() - startTime,
        };
      }

      case 'full-cache-rebuild': {
        // Full cache rebuild (startup, weekly reset, manual trigger)
        const result = await rebuildLeaderboardCaches();

        logger.info(`[LeaderboardUpdate] Full cache rebuild complete`, {
          triggeredBy,
          globalCount: result.globalEntriesUpdated,
          weeklyCount: result.weeklyEntriesUpdated,
        });

        return {
          success: result.success,
          type,
          globalEntriesUpdated: result.globalEntriesUpdated,
          weeklyEntriesUpdated: result.weeklyEntriesUpdated,
          message: `Full cache rebuild completed (triggered by ${triggeredBy})`,
          durationMs: Date.now() - startTime,
        };
      }

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    logger.error(`[LeaderboardUpdate] Job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the leaderboard update worker to process jobs.
 * Should be called once during application startup.
 */
export function startLeaderboardUpdateWorker(): Worker<LeaderboardUpdateJobData, LeaderboardUpdateJobResult> {
  if (leaderboardUpdateWorker) {
    logger.warn('[LeaderboardUpdate] Worker already running');
    return leaderboardUpdateWorker;
  }

  leaderboardUpdateWorker = new Worker<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>(
    LEADERBOARD_UPDATE_QUEUE_NAME,
    processLeaderboardUpdateJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 5, // Cache updates are fast, can parallelize
      limiter: {
        max: 50, // Max 50 jobs
        duration: 60000, // Per minute
      },
    }
  );

  leaderboardUpdateWorker.on('completed', (job, result) => {
    logger.info(`[LeaderboardUpdate] Job ${job.id} completed`, {
      type: result.type,
      matchId: result.matchId,
      globalEntries: result.globalEntriesUpdated,
      weeklyEntries: result.weeklyEntriesUpdated,
      durationMs: result.durationMs,
    });
  });

  leaderboardUpdateWorker.on('failed', (job, error) => {
    logger.error(`[LeaderboardUpdate] Job ${job?.id} failed:`, {
      type: job?.data.type,
      matchId: job?.data.matchId,
      error: error.message,
      attempt: job?.attemptsMade,
    });
  });

  leaderboardUpdateWorker.on('error', (error) => {
    logger.error('[LeaderboardUpdate] Worker error:', error);
  });

  leaderboardUpdateWorker.on('stalled', (jobId) => {
    logger.warn(`[LeaderboardUpdate] Job ${jobId} stalled`);
  });

  logger.info('[LeaderboardUpdate] Worker started');
  return leaderboardUpdateWorker;
}

/**
 * Stop the leaderboard update worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopLeaderboardUpdateWorker(): Promise<void> {
  if (leaderboardUpdateWorker) {
    await leaderboardUpdateWorker.close();
    leaderboardUpdateWorker = null;
    logger.info('[LeaderboardUpdate] Worker stopped');
  }

  if (leaderboardUpdateQueue) {
    await leaderboardUpdateQueue.close();
    leaderboardUpdateQueue = null;
  }
}

// ===========================================
// Job Queueing Functions
// ===========================================

/**
 * Queue a leaderboard cache update after match settlement.
 * Called from game-settlement.queue.ts after settleMatch succeeds.
 *
 * @param matchId - The match that was settled
 * @param creatorId - Creator user ID
 * @param opponentId - Opponent user ID
 * @param creatorScore - Points earned by creator
 * @param opponentScore - Points earned by opponent
 */
export async function queueLeaderboardUpdateAfterSettlement(
  matchId: string,
  creatorId: string,
  opponentId: string,
  creatorScore: number,
  opponentScore: number
): Promise<Job<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>> {
  const queue = getLeaderboardUpdateQueue();

  // Use matchId for deduplication - same match won't trigger multiple updates
  const job = await queue.add(
    'update-after-settlement',
    {
      type: 'update-after-settlement',
      matchId,
      creatorId,
      opponentId,
      creatorScore,
      opponentScore,
      triggeredBy: 'settlement',
      receivedAt: new Date().toISOString(),
    },
    {
      jobId: `leaderboard-settlement-${matchId}`, // Deduplication key
      priority: 2, // Normal priority
    }
  );

  logger.debug(`[LeaderboardUpdate] Queued settlement update: ${job.id}`, {
    matchId,
    creatorId,
    opponentId,
  });

  return job;
}

/**
 * Queue a full cache rebuild.
 * Used on startup, weekly reset, or admin trigger.
 *
 * @param triggeredBy - What triggered this rebuild
 */
export async function queueFullCacheRebuild(
  triggeredBy: 'weekly-reset' | 'manual' | 'startup'
): Promise<Job<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>> {
  const queue = getLeaderboardUpdateQueue();

  // Use timestamp for unique job ID (allow multiple rebuilds)
  const jobId = `leaderboard-rebuild-${triggeredBy}-${Date.now()}`;

  const job = await queue.add(
    'full-cache-rebuild',
    {
      type: 'full-cache-rebuild',
      triggeredBy,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId,
      priority: 1, // Higher priority for rebuilds
    }
  );

  logger.info(`[LeaderboardUpdate] Queued full cache rebuild: ${job.id}`, {
    triggeredBy,
  });

  return job;
}

// ===========================================
// Queue Monitoring
// ===========================================

/**
 * Get the current status of the leaderboard update queue.
 */
export async function getLeaderboardUpdateQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getLeaderboardUpdateQueue();

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
 * Get failed leaderboard update jobs for manual review.
 */
export async function getFailedLeaderboardUpdateJobs(
  start = 0,
  end = 20
): Promise<Job<LeaderboardUpdateJobData, LeaderboardUpdateJobResult>[]> {
  const queue = getLeaderboardUpdateQueue();
  return queue.getFailed(start, end);
}
