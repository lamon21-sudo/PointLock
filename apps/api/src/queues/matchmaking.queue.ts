// =====================================================
// Matchmaking Queue - Automated PvP Match Creation
// =====================================================
// Handles automated matchmaking by periodically processing the
// matchmaking queue to pair compatible players.
// CRITICAL: Uses optimistic locking and claim expiry for concurrency safety.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// Queue Name Constants
// ===========================================

export const MATCHMAKING_QUEUE_NAME = 'matchmaking';

// ===========================================
// Job Types
// ===========================================

export type MatchmakingJobType = 'process-queue' | 'expire-entries';

export interface MatchmakingJobData {
  type: MatchmakingJobType;
  workerId: string;
  triggeredBy: 'scheduled' | 'manual';
  receivedAt: string;
}

export interface MatchmakingJobResult {
  success: boolean;
  type: MatchmakingJobType;
  workerId: string;
  processed: number;
  matched: number;
  expired: number;
  errors: number;
  durationMs: number;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let matchmakingQueue: Queue<MatchmakingJobData, MatchmakingJobResult> | null = null;
let matchmakingWorker: Worker<MatchmakingJobData, MatchmakingJobResult> | null = null;

/**
 * Get or create the matchmaking queue instance.
 */
export function getMatchmakingQueue(): Queue<MatchmakingJobData, MatchmakingJobResult> {
  if (!matchmakingQueue) {
    matchmakingQueue = new Queue<MatchmakingJobData, MatchmakingJobResult>(
      MATCHMAKING_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second delay
          },
          removeOnComplete: {
            age: 1 * 60 * 60, // Keep completed jobs for 1 hour
            count: 500, // Keep last 500 completed jobs
          },
          removeOnFail: {
            age: 24 * 60 * 60, // Keep failed jobs for 24 hours
          },
        },
      }
    );

    logger.info(`[Matchmaking] Queue initialized: ${MATCHMAKING_QUEUE_NAME}`);
  }

  return matchmakingQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process matchmaking jobs.
 * CRITICAL: This processor is idempotent via:
 * 1. Optimistic locking with version field
 * 2. Claim expiry (claimExpiresAt)
 * 3. Transaction boundaries
 */
async function processMatchmakingJob(
  job: Job<MatchmakingJobData, MatchmakingJobResult>
): Promise<MatchmakingJobResult> {
  const startTime = Date.now();
  const { type, workerId, triggeredBy } = job.data;

  logger.info(`[Matchmaking] Processing job ${job.id}`, {
    type,
    workerId,
    triggeredBy,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Lazy import to avoid circular dependencies
    const { processMatchmakingQueue } = await import('../services/matchmaking.service');

    switch (type) {
      case 'process-queue': {
        const stats = await processMatchmakingQueue(workerId);

        logger.info(`[Matchmaking] Queue processing complete`, {
          workerId,
          processed: stats.processed,
          matched: stats.matched,
          expired: stats.expired,
          errors: stats.errors,
          durationMs: stats.durationMs,
        });

        return {
          success: true,
          type,
          workerId,
          processed: stats.processed,
          matched: stats.matched,
          expired: stats.expired,
          errors: stats.errors,
          durationMs: Date.now() - startTime,
        };
      }

      case 'expire-entries': {
        // Legacy support - now handled by process-queue
        const stats = await processMatchmakingQueue(workerId);
        return {
          success: true,
          type,
          workerId,
          processed: 0,
          matched: 0,
          expired: stats.expired,
          errors: stats.errors,
          durationMs: Date.now() - startTime,
        };
      }

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    logger.error(`[Matchmaking] Job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the matchmaking worker to process jobs.
 * Should be called once during application startup.
 */
export function startMatchmakingWorker(): Worker<MatchmakingJobData, MatchmakingJobResult> {
  if (matchmakingWorker) {
    logger.warn('[Matchmaking] Worker already running');
    return matchmakingWorker;
  }

  matchmakingWorker = new Worker<MatchmakingJobData, MatchmakingJobResult>(
    MATCHMAKING_QUEUE_NAME,
    processMatchmakingJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // CRITICAL: One worker at a time to prevent race conditions
      limiter: {
        max: 20, // Max 20 jobs per duration
        duration: 60000, // Per minute
      },
    }
  );

  matchmakingWorker.on('completed', (job, result) => {
    if (result.matched > 0) {
      logger.info(`[Matchmaking] Job ${job.id} completed - ${result.matched / 2} matches created`, {
        workerId: result.workerId,
        matched: result.matched,
        processed: result.processed,
        durationMs: result.durationMs,
      });
    } else {
      logger.debug(`[Matchmaking] Job ${job.id} completed - no matches`, {
        workerId: result.workerId,
        processed: result.processed,
      });
    }
  });

  matchmakingWorker.on('failed', (job, error) => {
    logger.error(`[Matchmaking] Job ${job?.id} failed:`, {
      workerId: job?.data.workerId,
      error: error.message,
      attempt: job?.attemptsMade,
    });
  });

  matchmakingWorker.on('error', (error) => {
    logger.error('[Matchmaking] Worker error:', error);
  });

  logger.info('[Matchmaking] Worker started');
  return matchmakingWorker;
}

/**
 * Stop the matchmaking worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopMatchmakingWorker(): Promise<void> {
  if (matchmakingWorker) {
    logger.info('[Matchmaking] Stopping worker...');
    await matchmakingWorker.close();
    matchmakingWorker = null;
    logger.info('[Matchmaking] Worker stopped');
  }

  if (matchmakingQueue) {
    await matchmakingQueue.close();
    matchmakingQueue = null;
    logger.info('[Matchmaking] Queue closed');
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule the matchmaking processor to run every 5 seconds.
 * Uses a repeatable job pattern for consistent processing.
 */
export async function scheduleMatchmakingProcessor(): Promise<void> {
  const queue = getMatchmakingQueue();

  // Remove any existing repeatable job
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'process-matchmaking') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new repeatable job
  await queue.add(
    'process-matchmaking',
    {
      type: 'process-queue',
      workerId: `mm-worker-${uuidv4().slice(0, 8)}`,
      triggeredBy: 'scheduled',
      receivedAt: new Date().toISOString(),
    },
    {
      repeat: {
        every: 5000, // Every 5 seconds
      },
      jobId: 'matchmaking-processor',
    }
  );

  logger.info('[Matchmaking] Scheduled processor to run every 5 seconds');
}

// ===========================================
// Manual Job Submission
// ===========================================

/**
 * Manually trigger a matchmaking processing cycle.
 * Useful for testing or admin operations.
 *
 * @param triggeredBy - Who triggered the job ('manual' or specific admin ID)
 * @returns The created job
 */
export async function triggerMatchmakingRun(triggeredBy: string = 'manual'): Promise<Job<MatchmakingJobData, MatchmakingJobResult>> {
  const queue = getMatchmakingQueue();

  const job = await queue.add(
    'manual-process',
    {
      type: 'process-queue',
      workerId: `mm-manual-${uuidv4().slice(0, 8)}`,
      triggeredBy: 'manual',
      receivedAt: new Date().toISOString(),
    },
    {
      priority: 1, // Higher priority than scheduled runs
    }
  );

  logger.info(`[Matchmaking] Manual processing triggered by ${triggeredBy}`, {
    jobId: job.id,
  });

  return job;
}

// ===========================================
// Queue Status
// ===========================================

/**
 * Get the current status of the matchmaking queue.
 */
export async function getMatchmakingQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  repeatableJobCount: number;
}> {
  const queue = getMatchmakingQueue();
  const [waiting, active, completed, failed, delayed, repeatableJobs] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.getRepeatableJobs(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    repeatableJobCount: repeatableJobs.length,
  };
}
