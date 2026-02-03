// =====================================================
// Player Tier Sync Queue - Daily Player Tier Assignment
// =====================================================
// BullMQ worker that syncs player tier assignments daily at 4 AM UTC.
// Auto-categorizes sports players into tiers based on performance stats.
//
// SCHEDULE: Daily at 4 AM UTC (cron: '0 4 * * *')
// TIMEZONE: UTC (configurable via PLAYER_TIER_SYNC_SCHEDULE env var)
//
// CRITICAL: All jobs are idempotent - duplicate execution is safe.
// =====================================================

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { SportType } from '@prisma/client';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { config } from '../config';
import { syncPlayerTiers, SyncResult } from '../lib/player-tier.service';

// ===========================================
// Queue Name Constants
// ===========================================

export const PLAYER_TIER_SYNC_QUEUE_NAME = 'player-tier-sync-queue';

// ===========================================
// Job Types
// ===========================================

export type PlayerTierSyncJobType = 'sync-all' | 'sync-sport';

export interface PlayerTierSyncJobData {
  type: PlayerTierSyncJobType;
  sport?: SportType;       // For sync-sport jobs
  triggeredBy: 'scheduled' | 'manual' | 'startup';
}

export interface PlayerTierSyncJobResult {
  success: boolean;
  type: PlayerTierSyncJobType;
  sport?: SportType;
  syncResult: SyncResult;
  message: string;
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let playerTierSyncQueue: Queue<PlayerTierSyncJobData, PlayerTierSyncJobResult> | null = null;
let playerTierSyncWorker: Worker<PlayerTierSyncJobData, PlayerTierSyncJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the player tier sync queue instance.
 */
export function getPlayerTierSyncQueue(): Queue<PlayerTierSyncJobData, PlayerTierSyncJobResult> {
  if (!playerTierSyncQueue) {
    playerTierSyncQueue = new Queue<PlayerTierSyncJobData, PlayerTierSyncJobResult>(
      PLAYER_TIER_SYNC_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5s, then 10s, then 20s
          },
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 100,        // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        },
      }
    );

    logger.info(`Player tier sync queue initialized: ${PLAYER_TIER_SYNC_QUEUE_NAME}`);
  }

  return playerTierSyncQueue;
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process player tier sync jobs.
 * CRITICAL: This processor is idempotent - running twice won't cause issues.
 */
async function processPlayerTierSyncJob(
  job: Job<PlayerTierSyncJobData, PlayerTierSyncJobResult>
): Promise<PlayerTierSyncJobResult> {
  const { type, sport, triggeredBy } = job.data;

  logger.info(`Processing player tier sync job: ${job.id}`, {
    type,
    sport: sport || 'all',
    triggeredBy,
  });

  try {
    // Update progress
    await job.updateProgress(10);

    // Execute sync based on job type
    let syncResult: SyncResult;

    if (type === 'sync-sport' && sport) {
      syncResult = await syncPlayerTiers(sport);
    } else {
      syncResult = await syncPlayerTiers();
    }

    // Update progress
    await job.updateProgress(100);

    const result: PlayerTierSyncJobResult = {
      success: syncResult.success,
      type,
      sport,
      syncResult,
      message: `Sync complete: ${syncResult.processed} processed, ${syncResult.updated} updated, ${syncResult.failed} failed`,
    };

    if (syncResult.success) {
      logger.info(`Player tier sync job ${job.id} completed successfully:`, result);
    } else {
      logger.warn(`Player tier sync job ${job.id} completed with errors:`, result);
    }

    return result;
  } catch (error) {
    logger.error(`Player tier sync job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the player tier sync worker to process jobs.
 * Should be called once during application startup.
 */
export function startPlayerTierSyncWorker(): Worker<PlayerTierSyncJobData, PlayerTierSyncJobResult> {
  if (playerTierSyncWorker) {
    logger.warn('Player tier sync worker already running');
    return playerTierSyncWorker;
  }

  playerTierSyncWorker = new Worker<PlayerTierSyncJobData, PlayerTierSyncJobResult>(
    PLAYER_TIER_SYNC_QUEUE_NAME,
    processPlayerTierSyncJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 2,  // Process up to 2 jobs concurrently
      limiter: {
        max: 5,        // Max 5 jobs
        duration: 60000, // Per minute
      },
    }
  );

  playerTierSyncWorker.on('completed', (job, result) => {
    logger.info(`Player tier sync job ${job.id} completed:`, {
      type: result.type,
      sport: result.sport || 'all',
      processed: result.syncResult.processed,
      updated: result.syncResult.updated,
    });
  });

  playerTierSyncWorker.on('failed', (job, error) => {
    logger.error(`Player tier sync job ${job?.id} failed:`, error);
  });

  playerTierSyncWorker.on('error', (error) => {
    logger.error('Player tier sync worker error:', error);
  });

  logger.info('Player tier sync worker started');
  return playerTierSyncWorker;
}

/**
 * Stop the player tier sync worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopPlayerTierSyncWorker(): Promise<void> {
  if (playerTierSyncWorker) {
    await playerTierSyncWorker.close();
    playerTierSyncWorker = null;
    logger.info('Player tier sync worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (playerTierSyncQueue) {
    await playerTierSyncQueue.close();
    playerTierSyncQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule the daily player tier sync job.
 * Runs at 4 AM UTC by default (configurable via PLAYER_TIER_SYNC_SCHEDULE).
 */
export async function scheduleDailyPlayerTierSync(): Promise<void> {
  const queue = getPlayerTierSyncQueue();
  const schedule = config.playerTiers?.syncSchedule || '0 4 * * *';

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'daily-tier-sync') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Check if auto-sync is enabled
  if (config.playerTiers?.autoSyncEnabled === false) {
    logger.info('Player tier auto-sync is disabled (PLAYER_TIER_AUTO_SYNC=false)');
    return;
  }

  // Schedule new daily job
  await queue.add(
    'daily-tier-sync',
    {
      type: 'sync-all',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: schedule,
      },
      jobId: 'daily-player-tier-sync',
    }
  );

  logger.info(`Daily player tier sync scheduled: ${schedule} (UTC)`);
}

/**
 * Queue an immediate player tier sync for processing.
 * Can sync all sports or a specific sport.
 *
 * @param sport - Optional: sync only this sport
 * @param triggeredBy - Source of the sync request
 * @returns The queued job
 */
export async function queueImmediatePlayerTierSync(
  sport?: SportType,
  triggeredBy: 'manual' | 'startup' = 'manual'
): Promise<Job<PlayerTierSyncJobData, PlayerTierSyncJobResult>> {
  const queue = getPlayerTierSyncQueue();

  const jobData: PlayerTierSyncJobData = sport
    ? { type: 'sync-sport', sport, triggeredBy }
    : { type: 'sync-all', triggeredBy };

  // Create unique job ID to allow multiple manual syncs
  const jobId = sport
    ? `immediate-${sport}-${Date.now()}`
    : `immediate-all-${Date.now()}`;

  const job = await queue.add(
    triggeredBy === 'startup' ? 'startup-sync' : 'immediate-sync',
    jobData,
    {
      jobId,
      priority: 1, // Higher priority for manual/startup syncs
    }
  );

  logger.info(`Immediate player tier sync queued: ${job.id}`, {
    sport: sport || 'all',
    triggeredBy,
  });

  return job;
}

/**
 * Get the current status of player tier sync jobs.
 */
export async function getPlayerTierSyncStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getPlayerTierSyncQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}
