// =====================================================
// Events Sync Queue - Background Sports Event Syncing
// =====================================================
// Handles scheduled and on-demand synchronization of
// sports events from external providers.
// CRITICAL: All jobs are idempotent - duplicate execution is safe.

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { getEventsSyncService } from '../services/events';
import { SportType, SportSyncResult, FullSyncResult } from '../services/events/types';

// ===========================================
// Queue Name Constants
// ===========================================

export const EVENTS_SYNC_QUEUE_NAME = 'events-sync';

// ===========================================
// Job Types
// ===========================================

export type EventsSyncJobType = 'sync-all' | 'sync-sport';

export interface EventsSyncJobData {
  type: EventsSyncJobType;
  sport?: SportType; // For single sport sync
  triggeredBy?: string; // 'scheduler' | 'manual' | 'api'
}

export interface EventsSyncJobResult {
  success: boolean;
  type: EventsSyncJobType;
  sportResult?: SportSyncResult;
  fullResult?: FullSyncResult;
  message: string;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let eventsSyncQueue: Queue<EventsSyncJobData, EventsSyncJobResult> | null = null;
let eventsSyncWorker: Worker<EventsSyncJobData, EventsSyncJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the events sync queue instance.
 */
export function getEventsSyncQueue(): Queue<EventsSyncJobData, EventsSyncJobResult> {
  if (!eventsSyncQueue) {
    eventsSyncQueue = new Queue<EventsSyncJobData, EventsSyncJobResult>(
      EVENTS_SYNC_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 seconds
          },
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        },
      }
    );

    logger.info(`Events sync queue initialized: ${EVENTS_SYNC_QUEUE_NAME}`);
  }

  return eventsSyncQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process events sync jobs.
 * CRITICAL: This processor is idempotent - running twice won't duplicate events.
 */
async function processEventsSyncJob(
  job: Job<EventsSyncJobData, EventsSyncJobResult>
): Promise<EventsSyncJobResult> {
  const { type, sport, triggeredBy = 'unknown' } = job.data;

  logger.info(`[EventsSyncQueue] Processing job ${job.id}`, {
    type,
    sport,
    triggeredBy,
    attempt: job.attemptsMade + 1,
  });

  const syncService = getEventsSyncService();

  try {
    if (type === 'sync-sport' && sport) {
      // Sync single sport
      const result = await syncService.syncSport(sport);

      // Update job progress
      await job.updateProgress(100);

      if (result.success) {
        logger.info(
          `[EventsSyncQueue] Sport sync completed for ${sport}: ` +
            `${result.eventsCreated} created, ${result.eventsUpdated} updated`
        );
        return {
          success: true,
          type,
          sportResult: result,
          message: `Synced ${result.eventsProcessed} ${sport} events`,
        };
      } else {
        const errorSummary = result.errors.slice(0, 3).join('; ');
        logger.warn(`[EventsSyncQueue] Sport sync had errors for ${sport}: ${errorSummary}`);
        return {
          success: false,
          type,
          sportResult: result,
          message: `Sync had ${result.errors.length} errors: ${errorSummary}`,
        };
      }
    } else if (type === 'sync-all') {
      // Sync all sports
      const result = await syncService.syncAllSports();

      // Update job progress
      await job.updateProgress(100);

      logger.info(
        `[EventsSyncQueue] Full sync completed: ` +
          `${result.totalEventsProcessed} processed, ` +
          `${result.totalEventsCreated} created, ` +
          `${result.totalEventsUpdated} updated`
      );

      return {
        success: result.success,
        type,
        fullResult: result,
        message: `Full sync complete: ${result.totalEventsProcessed} events processed`,
      };
    }

    throw new Error(`Unknown job type: ${type}`);
  } catch (error) {
    logger.error(`[EventsSyncQueue] Job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the events sync worker to process jobs.
 * Should be called once during application startup.
 */
export function startEventsSyncWorker(): Worker<EventsSyncJobData, EventsSyncJobResult> {
  if (eventsSyncWorker) {
    logger.warn('[EventsSyncQueue] Worker already running');
    return eventsSyncWorker;
  }

  eventsSyncWorker = new Worker<EventsSyncJobData, EventsSyncJobResult>(
    EVENTS_SYNC_QUEUE_NAME,
    processEventsSyncJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // Process one sync job at a time to avoid API rate limits
      limiter: {
        max: 4, // Max 4 jobs
        duration: 60000, // Per minute
      },
    }
  );

  eventsSyncWorker.on('completed', (job, result) => {
    logger.info(`[EventsSyncQueue] Job ${job.id} completed:`, {
      type: result.type,
      success: result.success,
      message: result.message,
    });
  });

  eventsSyncWorker.on('failed', (job, error) => {
    logger.error(`[EventsSyncQueue] Job ${job?.id} failed:`, error);
  });

  eventsSyncWorker.on('error', (error) => {
    logger.error('[EventsSyncQueue] Worker error:', error);
  });

  eventsSyncWorker.on('stalled', (jobId) => {
    logger.warn(`[EventsSyncQueue] Job ${jobId} stalled`);
  });

  logger.info('[EventsSyncQueue] Worker started');
  return eventsSyncWorker;
}

/**
 * Stop the events sync worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopEventsSyncWorker(): Promise<void> {
  if (eventsSyncWorker) {
    await eventsSyncWorker.close();
    eventsSyncWorker = null;
    logger.info('[EventsSyncQueue] Worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (eventsSyncQueue) {
    await eventsSyncQueue.close();
    eventsSyncQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule recurring events sync jobs.
 * Runs every 15 minutes to keep events and odds up to date.
 */
export async function scheduleEventsSyncJobs(): Promise<void> {
  const queue = getEventsSyncQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name.startsWith('scheduled-')) {
      await queue.removeRepeatableByKey(job.key);
      logger.info(`[EventsSyncQueue] Removed old repeatable job: ${job.name}`);
    }
  }

  // Schedule full sync every 15 minutes
  await queue.add(
    'scheduled-sync-all',
    {
      type: 'sync-all',
      triggeredBy: 'scheduler',
    },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      jobId: 'scheduled-events-sync',
    }
  );

  logger.info('[EventsSyncQueue] Scheduled events sync to run every 15 minutes');
}

/**
 * Queue an immediate sync for all sports.
 * Useful for manual triggers or after deployment.
 */
export async function queueImmediateSync(
  triggeredBy: string = 'manual'
): Promise<Job<EventsSyncJobData, EventsSyncJobResult>> {
  const queue = getEventsSyncQueue();

  const job = await queue.add(
    'manual-sync-all',
    {
      type: 'sync-all',
      triggeredBy,
    },
    {
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info(`[EventsSyncQueue] Queued immediate sync: ${job.id}`);
  return job;
}

/**
 * Queue a sync for a specific sport.
 */
export async function queueSportSync(
  sport: SportType,
  triggeredBy: string = 'manual'
): Promise<Job<EventsSyncJobData, EventsSyncJobResult>> {
  const queue = getEventsSyncQueue();

  const job = await queue.add(
    `sync-${sport.toLowerCase()}`,
    {
      type: 'sync-sport',
      sport,
      triggeredBy,
    },
    {
      priority: 2,
    }
  );

  logger.info(`[EventsSyncQueue] Queued ${sport} sync: ${job.id}`);
  return job;
}

// ===========================================
// Queue Monitoring
// ===========================================

/**
 * Get the current status of the events sync queue.
 */
export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  repeatableJobs: number;
}> {
  const queue = getEventsSyncQueue();

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
