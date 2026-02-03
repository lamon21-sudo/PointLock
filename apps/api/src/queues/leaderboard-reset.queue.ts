// =====================================================
// Leaderboard Weekly Reset Queue
// =====================================================
// Handles the weekly leaderboard reset process:
// 1. Snapshot current ranks as previousRank
// 2. Archive the old weekly leaderboard
// 3. Create new weekly leaderboard
//
// Runs every Monday at 00:00 UTC.

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  getWeekStart,
  getWeekEnd,
  getISOWeekNumber,
  generateWeeklySlug,
  GLOBAL_LEADERBOARD_SLUG,
} from '../modules/leaderboard/leaderboard.service';

// ===========================================
// Queue Name Constants
// ===========================================

export const LEADERBOARD_RESET_QUEUE_NAME = 'leaderboard-reset-queue';

// ===========================================
// Job Types
// ===========================================

export interface LeaderboardResetJobData {
  type: 'weekly-reset';
  triggeredBy: 'scheduled' | 'manual';
}

export interface LeaderboardResetJobResult {
  success: boolean;
  archivedLeaderboard: string | null;
  newLeaderboard: string | null;
  globalRanksUpdated: number;
  message: string;
  timestamp: string;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let leaderboardResetQueue: Queue<LeaderboardResetJobData, LeaderboardResetJobResult> | null = null;
let leaderboardResetWorker: Worker<LeaderboardResetJobData, LeaderboardResetJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the leaderboard reset queue instance.
 */
export function getLeaderboardResetQueue(): Queue<LeaderboardResetJobData, LeaderboardResetJobResult> {
  if (!leaderboardResetQueue) {
    leaderboardResetQueue = new Queue<LeaderboardResetJobData, LeaderboardResetJobResult>(
      LEADERBOARD_RESET_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay
          },
          removeOnComplete: {
            age: 7 * 24 * 60 * 60, // Keep completed jobs for 7 days
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 30 * 24 * 60 * 60, // Keep failed jobs for 30 days
          },
        },
      }
    );

    logger.info(`Leaderboard reset queue initialized: ${LEADERBOARD_RESET_QUEUE_NAME}`);
  }

  return leaderboardResetQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process leaderboard weekly reset jobs.
 */
async function processLeaderboardResetJob(
  job: Job<LeaderboardResetJobData, LeaderboardResetJobResult>
): Promise<LeaderboardResetJobResult> {
  const { type, triggeredBy } = job.data;

  logger.info(`Processing leaderboard reset job: ${job.id}`, { type, triggeredBy });

  try {
    if (type === 'weekly-reset') {
      const result = await executeWeeklyReset();
      logger.info(`Leaderboard reset job ${job.id} completed:`, result);
      return result;
    }

    throw new Error(`Unknown job type: ${type}`);
  } catch (error) {
    logger.error(`Leaderboard reset job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Execute the weekly leaderboard reset.
 */
async function executeWeeklyReset(): Promise<LeaderboardResetJobResult> {
  logger.info('[LeaderboardReset] Starting weekly reset...');

  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentWeeklySlug = generateWeeklySlug(currentWeekStart);

  // Get the previous week's dates
  const prevWeekStart = new Date(currentWeekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
  const prevWeeklySlug = generateWeeklySlug(prevWeekStart);

  let archivedLeaderboard: string | null = null;
  let newLeaderboard: string | null = null;
  let globalRanksUpdated = 0;

  await prisma.$transaction(async (tx) => {
    // 1. Archive previous week's leaderboard
    const prevWeekly = await tx.leaderboard.findUnique({
      where: { slug: prevWeeklySlug },
    });

    if (prevWeekly && prevWeekly.status === 'active') {
      // Snapshot ranks before archiving using raw query with ROW_NUMBER
      const entries = await tx.$queryRaw<Array<{ id: string; rank: bigint }>>`
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY score DESC, win_rate DESC, matches_played DESC
          ) as rank
        FROM leaderboard_entries
        WHERE leaderboard_id = ${prevWeekly.id}
      `;

      // Update stored ranks
      for (const entry of entries) {
        await tx.leaderboardEntry.update({
          where: { id: entry.id },
          data: { rank: Number(entry.rank) },
        });
      }

      // Archive the leaderboard
      await tx.leaderboard.update({
        where: { id: prevWeekly.id },
        data: {
          status: 'archived',
          archivedAt: now,
        },
      });

      archivedLeaderboard = prevWeeklySlug;
      logger.info(`[LeaderboardReset] Archived leaderboard: ${prevWeeklySlug}`);
    }

    // 2. Update global leaderboard previousRank values
    const globalLeaderboard = await tx.leaderboard.findUnique({
      where: { slug: GLOBAL_LEADERBOARD_SLUG },
    });

    if (globalLeaderboard) {
      const globalEntries = await tx.$queryRaw<Array<{ id: string; rank: bigint }>>`
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY score DESC, win_rate DESC, matches_played DESC
          ) as rank
        FROM leaderboard_entries
        WHERE leaderboard_id = ${globalLeaderboard.id}
      `;

      for (const entry of globalEntries) {
        await tx.leaderboardEntry.update({
          where: { id: entry.id },
          data: {
            previousRank: Number(entry.rank),
            rank: Number(entry.rank),
          },
        });
      }

      globalRanksUpdated = globalEntries.length;
      logger.info(`[LeaderboardReset] Updated ${globalRanksUpdated} global previousRank values`);
    }

    // 3. Create new weekly leaderboard (if doesn't exist)
    const existingCurrent = await tx.leaderboard.findUnique({
      where: { slug: currentWeeklySlug },
    });

    if (!existingCurrent) {
      const weekEnd = getWeekEnd(currentWeekStart);
      const weekNum = getISOWeekNumber(currentWeekStart);

      await tx.leaderboard.create({
        data: {
          name: `Weekly Leaderboard - Week ${weekNum}, ${currentWeekStart.getUTCFullYear()}`,
          slug: currentWeeklySlug,
          timeframe: 'WEEKLY',
          status: 'active',
          periodStart: currentWeekStart,
          periodEnd: weekEnd,
          displayOrder: 1,
        },
      });

      newLeaderboard = currentWeeklySlug;
      logger.info(`[LeaderboardReset] Created new weekly leaderboard: ${currentWeeklySlug}`);
    }
  });

  // Trigger full cache rebuild after weekly reset
  try {
    const { queueFullCacheRebuild } = await import('./leaderboard.queue');
    await queueFullCacheRebuild('weekly-reset');
    logger.info('[LeaderboardReset] Queued cache rebuild after weekly reset');
  } catch (cacheError) {
    // Cache rebuild failure should not fail the reset
    logger.error('[LeaderboardReset] Failed to queue cache rebuild:', cacheError);
  }

  logger.info('[LeaderboardReset] Weekly reset complete');

  return {
    success: true,
    archivedLeaderboard,
    newLeaderboard,
    globalRanksUpdated,
    message: `Weekly reset completed. Archived: ${archivedLeaderboard ?? 'none'}, Created: ${newLeaderboard ?? 'none'}`,
    timestamp: now.toISOString(),
  };
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the leaderboard reset worker to process jobs.
 * Should be called once during application startup.
 */
export function startLeaderboardResetWorker(): Worker<LeaderboardResetJobData, LeaderboardResetJobResult> {
  if (leaderboardResetWorker) {
    logger.warn('Leaderboard reset worker already running');
    return leaderboardResetWorker;
  }

  leaderboardResetWorker = new Worker<LeaderboardResetJobData, LeaderboardResetJobResult>(
    LEADERBOARD_RESET_QUEUE_NAME,
    processLeaderboardResetJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // Process one job at a time
    }
  );

  leaderboardResetWorker.on('completed', (job, result) => {
    logger.info(`Leaderboard reset job ${job.id} completed:`, result);
  });

  leaderboardResetWorker.on('failed', (job, error) => {
    logger.error(`Leaderboard reset job ${job?.id} failed:`, error);
  });

  leaderboardResetWorker.on('error', (error) => {
    logger.error('Leaderboard reset worker error:', error);
  });

  logger.info('Leaderboard reset worker started');
  return leaderboardResetWorker;
}

/**
 * Stop the leaderboard reset worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopLeaderboardResetWorker(): Promise<void> {
  if (leaderboardResetWorker) {
    await leaderboardResetWorker.close();
    leaderboardResetWorker = null;
    logger.info('Leaderboard reset worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (leaderboardResetQueue) {
    await leaderboardResetQueue.close();
    leaderboardResetQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule the recurring weekly leaderboard reset job.
 * Runs every Monday at 00:00 UTC.
 */
export async function scheduleWeeklyLeaderboardReset(): Promise<void> {
  const queue = getLeaderboardResetQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'weekly-leaderboard-reset') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new recurring job (every Monday at 00:00 UTC)
  await queue.add(
    'weekly-leaderboard-reset',
    {
      type: 'weekly-reset',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: '0 0 * * 1', // At 00:00 on Monday
        tz: 'UTC',
      },
      jobId: 'leaderboard-weekly-reset',
    }
  );

  logger.info('Leaderboard weekly reset scheduled to run every Monday at 00:00 UTC');
}

/**
 * Queue an immediate weekly reset (for manual triggers or testing).
 * Returns the job for tracking.
 */
export async function queueImmediateLeaderboardReset(): Promise<
  Job<LeaderboardResetJobData, LeaderboardResetJobResult>
> {
  const queue = getLeaderboardResetQueue();

  const jobId = `leaderboard-reset-${Date.now()}`;

  const job = await queue.add(
    'weekly-leaderboard-reset-immediate',
    {
      type: 'weekly-reset',
      triggeredBy: 'manual',
    },
    {
      jobId,
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info(`Immediate leaderboard reset queued: ${job.id}`);
  return job;
}
