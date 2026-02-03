// =====================================================
// Live Scores Queue - Real-Time Score Processing
// =====================================================
// Handles live score updates from webhooks and polling.
// Processes updates, validates scores, and triggers broadcasts.
// CRITICAL: All jobs are idempotent - duplicate execution is safe.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { SportType } from '@prisma/client';
import type {
  LiveScoresJobType,
  LiveScoresJobData,
  LiveScoresJobResult,
  NormalizedScoreUpdate,
} from '../services/live-scores/types';

// ===========================================
// Queue Name Constants
// ===========================================

export const LIVE_SCORES_QUEUE_NAME = 'live-scores';

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let liveScoresQueue: Queue<LiveScoresJobData, LiveScoresJobResult> | null = null;
let liveScoresWorker: Worker<LiveScoresJobData, LiveScoresJobResult> | null = null;

/**
 * Get or create the live scores queue instance.
 */
export function getLiveScoresQueue(): Queue<LiveScoresJobData, LiveScoresJobResult> {
  if (!liveScoresQueue) {
    liveScoresQueue = new Queue<LiveScoresJobData, LiveScoresJobResult>(
      LIVE_SCORES_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 seconds (faster than events-sync)
          },
          removeOnComplete: {
            age: 4 * 60 * 60, // Keep completed jobs for 4 hours (live data is ephemeral)
            count: 1000, // Keep last 1000 completed jobs
          },
          removeOnFail: {
            age: 24 * 60 * 60, // Keep failed jobs for 24 hours
          },
        },
      }
    );

    logger.info(`[LiveScoresQueue] Queue initialized: ${LIVE_SCORES_QUEUE_NAME}`);
  }

  return liveScoresQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process live scores jobs.
 * CRITICAL: This processor is idempotent - running twice won't duplicate updates.
 */
async function processLiveScoresJob(
  job: Job<LiveScoresJobData, LiveScoresJobResult>
): Promise<LiveScoresJobResult> {
  const startTime = Date.now();
  const { type, triggeredBy = 'unknown' } = job.data;

  logger.info(`[LiveScoresQueue] Processing job ${job.id}`, {
    type,
    triggeredBy,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Lazy import to avoid circular dependencies
    const { processScoreUpdate, processBatchUpdates } = await import(
      '../services/live-scores/live-scores.processor'
    );
    const { pollLiveGames } = await import(
      '../services/live-scores/providers'
    );

    let result: LiveScoresJobResult;

    switch (type) {
      case 'process-update': {
        // Single score update from webhook
        if (!job.data.update) {
          throw new Error('Missing update data for process-update job');
        }

        const processResult = await processScoreUpdate(job.data.update);

        result = {
          success: processResult.success,
          type,
          processedCount: 1,
          updatedCount: processResult.updated ? 1 : 0,
          broadcastCount: processResult.affectedMatchIds.length,
          errors: processResult.error ? [processResult.error] : [],
          durationMs: Date.now() - startTime,
        };
        break;
      }

      case 'batch-process': {
        // Batch of updates from polling
        if (!job.data.updates || job.data.updates.length === 0) {
          result = {
            success: true,
            type,
            processedCount: 0,
            updatedCount: 0,
            broadcastCount: 0,
            errors: [],
            durationMs: Date.now() - startTime,
          };
          break;
        }

        const batchResult = await processBatchUpdates(job.data.updates);

        // Update progress based on batch processing
        await job.updateProgress(100);

        result = {
          success: batchResult.success,
          type,
          processedCount: batchResult.totalReceived,
          updatedCount: batchResult.updatedCount,
          broadcastCount: batchResult.broadcastCount,
          errors: batchResult.results
            .filter((r) => r.error)
            .map((r) => r.error as string),
          durationMs: batchResult.durationMs,
        };
        break;
      }

      case 'poll-live-games': {
        // Scheduled polling job
        const sport = job.data.sport;
        if (!sport) {
          throw new Error('Missing sport for poll-live-games job');
        }

        const updates = await pollLiveGames(sport);

        if (updates.length === 0) {
          result = {
            success: true,
            type,
            processedCount: 0,
            updatedCount: 0,
            broadcastCount: 0,
            errors: [],
            durationMs: Date.now() - startTime,
          };
          break;
        }

        // Process the fetched updates
        const pollBatchResult = await processBatchUpdates(updates);

        result = {
          success: pollBatchResult.success,
          type,
          processedCount: pollBatchResult.totalReceived,
          updatedCount: pollBatchResult.updatedCount,
          broadcastCount: pollBatchResult.broadcastCount,
          errors: pollBatchResult.results
            .filter((r) => r.error)
            .map((r) => r.error as string),
          durationMs: Date.now() - startTime,
        };
        break;
      }

      case 'check-stale-games': {
        // Detect games that stopped updating
        // TODO: Implement stale game detection
        logger.warn('[LiveScoresQueue] check-stale-games not yet implemented');
        result = {
          success: true,
          type,
          processedCount: 0,
          updatedCount: 0,
          broadcastCount: 0,
          errors: [],
          durationMs: Date.now() - startTime,
        };
        break;
      }

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    logger.info(`[LiveScoresQueue] Job ${job.id} completed`, {
      type: result.type,
      processedCount: result.processedCount,
      updatedCount: result.updatedCount,
      durationMs: result.durationMs,
    });

    return result;
  } catch (error) {
    logger.error(`[LiveScoresQueue] Job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the live scores worker to process jobs.
 * Should be called once during application startup.
 */
export function startLiveScoresWorker(): Worker<LiveScoresJobData, LiveScoresJobResult> {
  if (liveScoresWorker) {
    logger.warn('[LiveScoresQueue] Worker already running');
    return liveScoresWorker;
  }

  liveScoresWorker = new Worker<LiveScoresJobData, LiveScoresJobResult>(
    LIVE_SCORES_QUEUE_NAME,
    processLiveScoresJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 5, // Higher concurrency for live updates
      limiter: {
        max: 100, // Max 100 jobs
        duration: 60000, // Per minute
      },
    }
  );

  liveScoresWorker.on('completed', (job, result) => {
    if (result.updatedCount > 0 || result.errors.length > 0) {
      logger.info(`[LiveScoresQueue] Job ${job.id} completed:`, {
        type: result.type,
        success: result.success,
        processedCount: result.processedCount,
        updatedCount: result.updatedCount,
        broadcastCount: result.broadcastCount,
      });
    }
  });

  liveScoresWorker.on('failed', (job, error) => {
    logger.error(`[LiveScoresQueue] Job ${job?.id} failed:`, error);
  });

  liveScoresWorker.on('error', (error) => {
    logger.error('[LiveScoresQueue] Worker error:', error);
  });

  liveScoresWorker.on('stalled', (jobId) => {
    logger.warn(`[LiveScoresQueue] Job ${jobId} stalled`);
  });

  logger.info('[LiveScoresQueue] Worker started');
  return liveScoresWorker;
}

/**
 * Stop the live scores worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopLiveScoresWorker(): Promise<void> {
  if (liveScoresWorker) {
    await liveScoresWorker.close();
    liveScoresWorker = null;
    logger.info('[LiveScoresQueue] Worker stopped');
  }

  if (liveScoresQueue) {
    await liveScoresQueue.close();
    liveScoresQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule recurring live scores polling jobs.
 * Runs every 30 seconds for each sport with live games.
 */
export async function scheduleLiveScoresPolling(): Promise<void> {
  const queue = getLiveScoresQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name.startsWith('poll-')) {
      await queue.removeRepeatableByKey(job.key);
      logger.info(`[LiveScoresQueue] Removed old repeatable job: ${job.name}`);
    }
  }

  // Schedule polling for each sport that supports live scores
  const sportsToTrack: SportType[] = [
    SportType.NFL,
    SportType.NBA,
    SportType.MLB,
    SportType.NHL,
    SportType.NCAAF,
    SportType.NCAAB,
  ];

  for (const sport of sportsToTrack) {
    await queue.add(
      `poll-${sport.toLowerCase()}`,
      {
        type: 'poll-live-games',
        sport,
        triggeredBy: 'scheduler',
        receivedAt: new Date().toISOString(),
      },
      {
        repeat: {
          pattern: '*/30 * * * * *', // Every 30 seconds
        },
        jobId: `poll-live-${sport.toLowerCase()}`,
        priority: 2, // Normal priority for scheduled polling
      }
    );
  }

  logger.info(`[LiveScoresQueue] Scheduled live polling for ${sportsToTrack.length} sports (every 30 seconds)`);
}

// ===========================================
// Manual Job Queueing
// ===========================================

/**
 * Queue a single score update (typically from webhook).
 */
export async function queueScoreUpdate(
  update: NormalizedScoreUpdate,
  triggeredBy: 'webhook' | 'manual' = 'webhook'
): Promise<Job<LiveScoresJobData, LiveScoresJobResult>> {
  const queue = getLiveScoresQueue();

  const job = await queue.add(
    `update-${update.externalEventId}`,
    {
      type: 'process-update',
      update,
      triggeredBy,
      receivedAt: new Date().toISOString(),
      priority: 1, // High priority for webhooks
    },
    {
      priority: 1,
    }
  );

  logger.debug(`[LiveScoresQueue] Queued score update: ${job.id} for event ${update.externalEventId}`);
  return job;
}

/**
 * Queue a batch of score updates (typically from polling).
 */
export async function queueBatchUpdates(
  updates: NormalizedScoreUpdate[],
  triggeredBy: 'polling' | 'manual' = 'polling'
): Promise<Job<LiveScoresJobData, LiveScoresJobResult>> {
  const queue = getLiveScoresQueue();

  const job = await queue.add(
    `batch-${Date.now()}`,
    {
      type: 'batch-process',
      updates,
      triggeredBy,
      receivedAt: new Date().toISOString(),
      priority: 2, // Normal priority for batch
    },
    {
      priority: 2,
    }
  );

  logger.info(`[LiveScoresQueue] Queued batch update: ${job.id} with ${updates.length} updates`);
  return job;
}

/**
 * Queue an immediate poll for a specific sport.
 */
export async function queueImmediatePoll(
  sport: SportType,
  triggeredBy: 'manual' | 'api' = 'manual'
): Promise<Job<LiveScoresJobData, LiveScoresJobResult>> {
  const queue = getLiveScoresQueue();

  const job = await queue.add(
    `poll-${sport.toLowerCase()}-immediate`,
    {
      type: 'poll-live-games',
      sport,
      triggeredBy,
      receivedAt: new Date().toISOString(),
      priority: 1,
    },
    {
      priority: 1,
    }
  );

  logger.info(`[LiveScoresQueue] Queued immediate poll for ${sport}: ${job.id}`);
  return job;
}

// ===========================================
// Queue Monitoring
// ===========================================

/**
 * Get the current status of the live scores queue.
 */
export async function getLiveScoresQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  repeatableJobs: number;
}> {
  const queue = getLiveScoresQueue();

  const [waiting, active, completed, failed, delayed, repeatableJobs] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.getRepeatableJobs().then((jobs) => jobs.length),
  ]);

  return { waiting, active, completed, failed, delayed, repeatableJobs };
}

// Re-export types for convenience
export type { LiveScoresJobType, LiveScoresJobData, LiveScoresJobResult };
