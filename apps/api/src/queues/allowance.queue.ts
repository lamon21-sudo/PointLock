// =====================================================
// Allowance Queue - Weekly Allowance Distribution
// =====================================================
// Handles scheduled and on-demand allowance distribution jobs.
// CRITICAL: All jobs are idempotent - duplicate execution is safe.

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { creditAllowance, AllowanceEligibility } from '../lib/allowance.service';

// ===========================================
// Queue Name Constants
// ===========================================

export const ALLOWANCE_QUEUE_NAME = 'allowance-queue';

// ===========================================
// Job Types
// ===========================================

export interface AllowanceJobData {
  type: 'claim' | 'batch-distribute';
  userId?: string; // For single user claim
  batchSize?: number; // For batch distribution
  dryRun?: boolean; // For testing without credits
}

export interface AllowanceJobResult {
  success: boolean;
  userId?: string;
  processedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  message: string;
  eligibility?: AllowanceEligibility;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let allowanceQueue: Queue<AllowanceJobData, AllowanceJobResult> | null = null;
let allowanceWorker: Worker<AllowanceJobData, AllowanceJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the allowance queue instance.
 */
export function getAllowanceQueue(): Queue<AllowanceJobData, AllowanceJobResult> {
  if (!allowanceQueue) {
    allowanceQueue = new Queue<AllowanceJobData, AllowanceJobResult>(
      ALLOWANCE_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
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

    logger.info(`Allowance queue initialized: ${ALLOWANCE_QUEUE_NAME}`);
  }

  return allowanceQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process allowance distribution jobs.
 * CRITICAL: This processor is idempotent - running twice won't double-credit.
 */
async function processAllowanceJob(
  job: Job<AllowanceJobData, AllowanceJobResult>
): Promise<AllowanceJobResult> {
  const { type, userId, batchSize = 100, dryRun = false } = job.data;

  logger.info(`Processing allowance job: ${job.id}`, { type, userId, dryRun });

  try {
    if (type === 'claim' && userId) {
      // Single user claim
      const result = await creditAllowance(userId, dryRun);

      if (result.credited) {
        logger.info(`Allowance credited to user ${userId}: ${result.amount}`);
        return {
          success: true,
          userId,
          message: `Allowance of ${result.amount} credited successfully`,
          eligibility: result.eligibility,
        };
      } else {
        logger.info(`User ${userId} not eligible for allowance`, result.eligibility);
        return {
          success: false,
          userId,
          message: result.eligibility?.reason || 'Not eligible for allowance',
          eligibility: result.eligibility,
        };
      }
    } else if (type === 'batch-distribute') {
      // Batch distribution for all eligible users
      const stats = await processBatchDistribution(batchSize, dryRun, job);
      return {
        success: true,
        processedCount: stats.processed,
        skippedCount: stats.skipped,
        errorCount: stats.errors,
        message: `Batch distribution complete: ${stats.processed} credited, ${stats.skipped} skipped, ${stats.errors} errors`,
      };
    }

    throw new Error(`Unknown job type: ${type}`);
  } catch (error) {
    logger.error(`Allowance job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Process batch distribution of allowances to all eligible users.
 * Uses cursor-based pagination to handle large user bases.
 */
async function processBatchDistribution(
  batchSize: number,
  dryRun: boolean,
  job: Job<AllowanceJobData, AllowanceJobResult>
): Promise<{ processed: number; skipped: number; errors: number }> {
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let cursor: string | undefined;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  while (true) {
    // Fetch batch of potentially eligible users
    const wallets = await prisma.wallet.findMany({
      where: {
        OR: [
          { lastAllowanceAt: null }, // Never claimed
          { lastAllowanceAt: { lt: sevenDaysAgo } }, // Last claim > 7 days ago
        ],
      },
      select: {
        userId: true,
      },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { userId: cursor } } : {}),
      orderBy: { userId: 'asc' },
    });

    if (wallets.length === 0) {
      break; // No more users to process
    }

    // Process each user in the batch
    for (const wallet of wallets) {
      try {
        const result = await creditAllowance(wallet.userId, dryRun);
        if (result.credited) {
          processed++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        logger.error(`Error processing allowance for user ${wallet.userId}:`, error);
      }

      // Update job progress
      const progress = Math.min(99, ((processed + skipped + errors) / 100) * 100);
      await job.updateProgress(progress);
    }

    // Set cursor for next batch
    cursor = wallets[wallets.length - 1].userId;

    // Small delay to prevent overwhelming the database
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { processed, skipped, errors };
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the allowance worker to process jobs.
 * Should be called once during application startup.
 */
export function startAllowanceWorker(): Worker<AllowanceJobData, AllowanceJobResult> {
  if (allowanceWorker) {
    logger.warn('Allowance worker already running');
    return allowanceWorker;
  }

  allowanceWorker = new Worker<AllowanceJobData, AllowanceJobResult>(
    ALLOWANCE_QUEUE_NAME,
    processAllowanceJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second
      },
    }
  );

  allowanceWorker.on('completed', (job, result) => {
    logger.info(`Allowance job ${job.id} completed:`, result);
  });

  allowanceWorker.on('failed', (job, error) => {
    logger.error(`Allowance job ${job?.id} failed:`, error);
  });

  allowanceWorker.on('error', (error) => {
    logger.error('Allowance worker error:', error);
  });

  logger.info('Allowance worker started');
  return allowanceWorker;
}

/**
 * Stop the allowance worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopAllowanceWorker(): Promise<void> {
  if (allowanceWorker) {
    await allowanceWorker.close();
    allowanceWorker = null;
    logger.info('Allowance worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (allowanceQueue) {
    await allowanceQueue.close();
    allowanceQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule the weekly batch distribution job.
 * Runs every Sunday at 00:00 UTC.
 */
export async function scheduleWeeklyDistribution(): Promise<void> {
  const queue = getAllowanceQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'weekly-distribution') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new weekly job (every Sunday at 00:00 UTC)
  await queue.add(
    'weekly-distribution',
    {
      type: 'batch-distribute',
      batchSize: 100,
    },
    {
      repeat: {
        pattern: '0 0 * * 0', // Every Sunday at midnight UTC
      },
      jobId: 'weekly-allowance-distribution',
    }
  );

  logger.info('Weekly allowance distribution scheduled for Sundays at 00:00 UTC');
}

/**
 * Queue a single user's allowance claim for processing.
 * Returns the job for tracking.
 */
export async function queueAllowanceClaim(
  userId: string
): Promise<Job<AllowanceJobData, AllowanceJobResult>> {
  const queue = getAllowanceQueue();

  // Use userId as job ID to prevent duplicate claims in flight
  const jobId = `claim-${userId}-${Date.now()}`;

  const job = await queue.add(
    'claim',
    {
      type: 'claim',
      userId,
    },
    {
      jobId,
      priority: 1, // Higher priority for user-initiated claims
    }
  );

  logger.info(`Allowance claim queued for user ${userId}: ${job.id}`);
  return job;
}
