// =====================================================
// Match Expiry Queue - Auto-expire and Refund
// =====================================================
// Handles scheduled checks for expired match invites.
// CRITICAL: All operations are idempotent using optimistic locking.

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { processExpiredMatches } from '../modules/matches/matches.service';

// ===========================================
// Queue Name Constants
// ===========================================

export const MATCH_EXPIRY_QUEUE_NAME = 'match-expiry-queue';

// ===========================================
// Job Types
// ===========================================

export interface MatchExpiryJobData {
  type: 'check-expired';
  triggeredBy: 'scheduled' | 'manual';
}

export interface MatchExpiryJobResult {
  success: boolean;
  processedCount: number;
  message: string;
  timestamp: string;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let matchExpiryQueue: Queue<MatchExpiryJobData, MatchExpiryJobResult> | null = null;
let matchExpiryWorker: Worker<MatchExpiryJobData, MatchExpiryJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the match expiry queue instance.
 */
export function getMatchExpiryQueue(): Queue<MatchExpiryJobData, MatchExpiryJobResult> {
  if (!matchExpiryQueue) {
    matchExpiryQueue = new Queue<MatchExpiryJobData, MatchExpiryJobResult>(
      MATCH_EXPIRY_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second delay
          },
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 500, // Keep last 500 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        },
      }
    );

    logger.info(`Match expiry queue initialized: ${MATCH_EXPIRY_QUEUE_NAME}`);
  }

  return matchExpiryQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process match expiry check jobs.
 * CRITICAL: This processor is idempotent due to optimistic locking in service layer.
 */
async function processMatchExpiryJob(
  job: Job<MatchExpiryJobData, MatchExpiryJobResult>
): Promise<MatchExpiryJobResult> {
  const { type, triggeredBy } = job.data;

  logger.info(`Processing match expiry job: ${job.id}`, { type, triggeredBy });

  try {
    if (type === 'check-expired') {
      const processedCount = await processExpiredMatches();

      const result: MatchExpiryJobResult = {
        success: true,
        processedCount,
        message: `Processed ${processedCount} expired matches`,
        timestamp: new Date().toISOString(),
      };

      logger.info(`Match expiry job ${job.id} completed:`, result);
      return result;
    }

    throw new Error(`Unknown job type: ${type}`);
  } catch (error) {
    logger.error(`Match expiry job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the match expiry worker to process jobs.
 * Should be called once during application startup.
 */
export function startMatchExpiryWorker(): Worker<MatchExpiryJobData, MatchExpiryJobResult> {
  if (matchExpiryWorker) {
    logger.warn('Match expiry worker already running');
    return matchExpiryWorker;
  }

  matchExpiryWorker = new Worker<MatchExpiryJobData, MatchExpiryJobResult>(
    MATCH_EXPIRY_QUEUE_NAME,
    processMatchExpiryJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // Process one job at a time to avoid conflicts
      limiter: {
        max: 5, // Max 5 jobs
        duration: 60000, // Per minute (rate limit to avoid overwhelming DB)
      },
    }
  );

  matchExpiryWorker.on('completed', (job, result) => {
    logger.info(`Match expiry job ${job.id} completed:`, result);
  });

  matchExpiryWorker.on('failed', (job, error) => {
    logger.error(`Match expiry job ${job?.id} failed:`, error);
  });

  matchExpiryWorker.on('error', (error) => {
    logger.error('Match expiry worker error:', error);
  });

  logger.info('Match expiry worker started');
  return matchExpiryWorker;
}

/**
 * Stop the match expiry worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopMatchExpiryWorker(): Promise<void> {
  if (matchExpiryWorker) {
    await matchExpiryWorker.close();
    matchExpiryWorker = null;
    logger.info('Match expiry worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (matchExpiryQueue) {
    await matchExpiryQueue.close();
    matchExpiryQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule the recurring match expiry check job.
 * Runs every 5 minutes to check for expired matches.
 */
export async function scheduleMatchExpiryChecks(): Promise<void> {
  const queue = getMatchExpiryQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'check-expired-matches') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new recurring job (every 5 minutes)
  await queue.add(
    'check-expired-matches',
    {
      type: 'check-expired',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: '*/5 * * * *', // Every 5 minutes
      },
      jobId: 'match-expiry-check',
    }
  );

  logger.info('Match expiry checks scheduled to run every 5 minutes');
}

/**
 * Queue an immediate expiry check (for manual triggers or testing).
 * Returns the job for tracking.
 */
export async function queueImmediateExpiryCheck(): Promise<
  Job<MatchExpiryJobData, MatchExpiryJobResult>
> {
  const queue = getMatchExpiryQueue();

  const jobId = `expiry-check-${Date.now()}`;

  const job = await queue.add(
    'check-expired-immediate',
    {
      type: 'check-expired',
      triggeredBy: 'manual',
    },
    {
      jobId,
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info(`Immediate match expiry check queued: ${job.id}`);
  return job;
}
