// =====================================================
// Season Queue
// =====================================================
// Handles all season-related background jobs:
// 1. Daily rank decay for inactive players
// 2. Season end transition (ACTIVE -> ENDED)
// 3. Ranking finalization after grace period
// 4. Season reward distribution
//
// CRITICAL: Uses distributed locks to prevent concurrent processing.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { SeasonStatus, Rank } from '@prisma/client';
import {
  RANK_POINTS,
  SEASON_WORKER_CONFIG,
} from '@pick-rivals/shared-types';
import { calculateNewRank, distributeSeasonRewards } from '../services/ranked.service';

// ===========================================
// Queue Name Constants
// ===========================================

export const SEASON_QUEUE_NAME = 'season-queue';

// ===========================================
// Job Types
// ===========================================

export type SeasonJobType =
  | 'daily-decay'
  | 'check-season-end'
  | 'end-season'
  | 'finalize-rankings'
  | 'distribute-rewards';

export interface SeasonJobData {
  type: SeasonJobType;
  seasonId?: string; // Required for season-specific jobs
  triggeredBy: 'scheduled' | 'manual';
}

export interface SeasonJobResult {
  success: boolean;
  message: string;
  timestamp: string;
  stats?: {
    decayedEntries?: number;
    skippedEntries?: number;
    seasonsEnded?: number;
    entriesFinalized?: number;
    rewardsClaimed?: number;
    totalCoinsDistributed?: number;
    errors?: string[];
  };
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let seasonQueue: Queue<SeasonJobData, SeasonJobResult> | null = null;
let seasonWorker: Worker<SeasonJobData, SeasonJobResult> | null = null;

/**
 * Get or create the season queue instance.
 */
export function getSeasonQueue(): Queue<SeasonJobData, SeasonJobResult> {
  if (!seasonQueue) {
    seasonQueue = new Queue<SeasonJobData, SeasonJobResult>(
      SEASON_QUEUE_NAME,
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

    logger.info(`Season queue initialized: ${SEASON_QUEUE_NAME}`);
  }

  return seasonQueue;
}

// ===========================================
// Job Processors
// ===========================================

/**
 * Process season jobs.
 */
async function processSeasonJob(
  job: Job<SeasonJobData, SeasonJobResult>
): Promise<SeasonJobResult> {
  const { type, seasonId, triggeredBy } = job.data;

  logger.info(`Processing season job: ${job.id}`, { type, seasonId, triggeredBy });

  try {
    switch (type) {
      case 'daily-decay':
        return await processDailyDecay();
      case 'check-season-end':
        return await processSeasonEndCheck();
      case 'end-season':
        if (!seasonId) {
          throw new Error('seasonId is required for end-season job');
        }
        return await processSeasonEnd(seasonId);
      case 'finalize-rankings':
        if (!seasonId) {
          throw new Error('seasonId is required for finalize-rankings job');
        }
        return await processFinalizeRankings(seasonId);
      case 'distribute-rewards':
        if (!seasonId) {
          throw new Error('seasonId is required for distribute-rewards job');
        }
        return await processRewardDistribution(seasonId);
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    logger.error(`Season job ${job.id} failed:`, error);
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Process daily rank decay for inactive players.
 * Applies RANK_POINTS.DAILY_DECAY to players who haven't played in 7+ days.
 */
async function processDailyDecay(): Promise<SeasonJobResult> {
  logger.info('[Season] Starting daily rank decay process');

  const now = new Date();
  const inactivityThreshold = new Date(
    now.getTime() - SEASON_WORKER_CONFIG.INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );

  // Get all ACTIVE seasons
  const activeSeasons = await prisma.season.findMany({
    where: { status: SeasonStatus.ACTIVE },
    select: { id: true, name: true },
  });

  if (activeSeasons.length === 0) {
    logger.info('[Season] No active seasons found for decay processing');
    return {
      success: true,
      message: 'No active seasons to process',
      timestamp: now.toISOString(),
      stats: { decayedEntries: 0, skippedEntries: 0 },
    };
  }

  let totalDecayed = 0;
  let totalSkipped = 0;

  for (const season of activeSeasons) {
    logger.info(`[Season] Processing decay for season: ${season.name} (${season.id})`);

    // Distributed lock to prevent concurrent processing
    const redis = getRedisConnection();
    const lockKey = `season:decay:${season.id}:lock`;
    const lockResult = await redis.set(lockKey, 'worker', 'EX', SEASON_WORKER_CONFIG.LOCK_TTL_SECONDS, 'NX');

    // Redis SET NX returns 'OK' on success, null if key exists
    if (lockResult !== 'OK') {
      logger.info(`[Season] Lock held by another worker for season ${season.id}, skipping`);
      continue;
    }

    try {
      // Find entries eligible for decay:
      // 1. isPlaced = true (only ranked players)
      // 2. Last activity > 7 days ago
      // 3. No decay applied today
      const eligibleEntries = await prisma.$queryRaw<Array<{
        id: string;
        userId: string;
        rankPoints: number;
        currentRank: Rank | null;
        version: number;
      }>>`
        SELECT id, user_id as "userId", rank_points as "rankPoints", current_rank as "currentRank", version
        FROM season_entries
        WHERE season_id = ${season.id}
          AND is_placed = true
          AND COALESCE(last_match_at, created_at) < ${inactivityThreshold}
          AND (
            last_decay_at IS NULL
            OR DATE_TRUNC('day', last_decay_at) < DATE_TRUNC('day', ${now})
          )
      `;

      logger.info(`[Season] Found ${eligibleEntries.length} entries eligible for decay in season ${season.id}`);

      let decayed = 0;
      let skipped = 0;

      // Process in batches
      const BATCH_SIZE = SEASON_WORKER_CONFIG.BATCH_SIZE;
      for (let i = 0; i < eligibleEntries.length; i += BATCH_SIZE) {
        const batch = eligibleEntries.slice(i, i + BATCH_SIZE);

        for (const entry of batch) {
          try {
            // Calculate new RP (floor at 0)
            const newRp = Math.max(0, entry.rankPoints + RANK_POINTS.DAILY_DECAY);
            const newRank = calculateNewRank(newRp);

            // Update with optimistic locking
            const updateResult = await prisma.seasonEntry.updateMany({
              where: {
                id: entry.id,
                version: entry.version, // Optimistic lock
              },
              data: {
                rankPoints: newRp,
                currentRank: newRank,
                lastDecayAt: now,
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              // Version conflict - skip this entry
              logger.warn(`[Season] Version conflict for entry ${entry.id}, skipping decay`);
              skipped += 1;
              continue;
            }

            decayed += 1;

            logger.info(
              `[Season] Applied decay to user ${entry.userId}: ${entry.rankPoints} -> ${newRp} RP | ` +
              `Rank: ${entry.currentRank ?? 'UNRANKED'} -> ${newRank}`
            );
          } catch (error) {
            logger.error(`[Season] Failed to apply decay to entry ${entry.id}:`, error);
            skipped += 1;
          }
        }
      }

      totalDecayed += decayed;
      totalSkipped += skipped;

      logger.info(`[Season] Decay complete for season ${season.id}: ${decayed} decayed, ${skipped} skipped`);
    } finally {
      // Release lock
      await redis.del(lockKey);
    }
  }

  const message = `Daily decay complete: ${totalDecayed} entries decayed across ${activeSeasons.length} seasons`;
  logger.info(`[Season] ${message}`);

  return {
    success: true,
    message,
    timestamp: now.toISOString(),
    stats: {
      decayedEntries: totalDecayed,
      skippedEntries: totalSkipped,
    },
  };
}

/**
 * Check if any seasons should transition to ENDED status.
 * Finds seasons where endDate <= now and status = ACTIVE.
 */
async function processSeasonEndCheck(): Promise<SeasonJobResult> {
  logger.info('[Season] Checking for seasons ready to end');

  const now = new Date();

  // Find seasons that should end
  const seasonsToEnd = await prisma.season.findMany({
    where: {
      status: SeasonStatus.ACTIVE,
      endDate: { lte: now },
    },
    select: { id: true, name: true, endDate: true },
  });

  if (seasonsToEnd.length === 0) {
    logger.info('[Season] No seasons ready to end');
    return {
      success: true,
      message: 'No seasons to end',
      timestamp: now.toISOString(),
      stats: { seasonsEnded: 0 },
    };
  }

  logger.info(`[Season] Found ${seasonsToEnd.length} seasons ready to end`);

  // Queue end-season job for each
  const queue = getSeasonQueue();
  for (const season of seasonsToEnd) {
    await queue.add(
      'end-season',
      {
        type: 'end-season',
        seasonId: season.id,
        triggeredBy: 'scheduled',
      },
      {
        jobId: `season-end-${season.id}`,
        priority: 1, // High priority for season transitions
      }
    );

    logger.info(`[Season] Queued end-season job for: ${season.name} (${season.id})`);
  }

  return {
    success: true,
    message: `Queued ${seasonsToEnd.length} seasons for ending`,
    timestamp: now.toISOString(),
    stats: { seasonsEnded: seasonsToEnd.length },
  };
}

/**
 * Transition a specific season from ACTIVE to ENDED.
 * Idempotent - safe to call multiple times.
 */
async function processSeasonEnd(seasonId: string): Promise<SeasonJobResult> {
  logger.info(`[Season] Ending season: ${seasonId}`);

  const now = new Date();

  // Distributed lock to prevent concurrent season end processing
  const redis = getRedisConnection();
  const lockKey = `season:end:${seasonId}:lock`;
  const lockResult = await redis.set(lockKey, 'worker', 'EX', SEASON_WORKER_CONFIG.LOCK_TTL_SECONDS, 'NX');

  if (lockResult !== 'OK') {
    logger.info(`[Season] Lock held by another worker for season end ${seasonId}`);
    return {
      success: true,
      message: `Season ${seasonId} end processing in progress by another worker`,
      timestamp: now.toISOString(),
    };
  }

  try {
    // Update season status (idempotent)
    const updateResult = await prisma.season.updateMany({
      where: {
        id: seasonId,
        status: SeasonStatus.ACTIVE, // Only transition if still ACTIVE
      },
      data: {
        status: SeasonStatus.ENDED,
        lockedAt: now,
      },
    });

    if (updateResult.count === 0) {
      logger.info(`[Season] Season ${seasonId} already ended or not found`);
      return {
        success: true,
        message: `Season ${seasonId} already ended`,
        timestamp: now.toISOString(),
      };
    }

    logger.info(`[Season] Season ${seasonId} transitioned to ENDED`);

    // Queue finalize-rankings job with grace period delay
    const graceDelayMs = SEASON_WORKER_CONFIG.GRACE_PERIOD_HOURS * 60 * 60 * 1000;
    const queue = getSeasonQueue();

    await queue.add(
      'finalize-rankings',
      {
        type: 'finalize-rankings',
        seasonId,
        triggeredBy: 'scheduled',
      },
      {
        jobId: `finalize-rankings-${seasonId}`,
        delay: graceDelayMs,
        priority: 2, // Lower priority than season end
      }
    );

    logger.info(
      `[Season] Queued finalize-rankings for season ${seasonId} with ${SEASON_WORKER_CONFIG.GRACE_PERIOD_HOURS}h delay`
    );

    return {
      success: true,
      message: `Season ${seasonId} ended and ranking finalization scheduled`,
      timestamp: now.toISOString(),
    };
  } finally {
    // Release distributed lock
    await redis.del(lockKey);
  }
}

/**
 * Finalize rankings for an ended season.
 * Sets rankPosition, finalRank, and finalRankPoints for all entries.
 * Idempotent - skips if already finalized.
 */
async function processFinalizeRankings(seasonId: string): Promise<SeasonJobResult> {
  logger.info(`[Season] Finalizing rankings for season: ${seasonId}`);

  const now = new Date();

  // Check if already finalized
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      id: true,
      name: true,
      status: true,
      rankingsFinalizedAt: true,
    },
  });

  if (!season) {
    throw new Error(`Season ${seasonId} not found`);
  }

  if (season.rankingsFinalizedAt) {
    logger.info(`[Season] Rankings already finalized for season ${seasonId}`);
    return {
      success: true,
      message: `Rankings already finalized for season ${seasonId}`,
      timestamp: now.toISOString(),
    };
  }

  if (season.status !== SeasonStatus.ENDED) {
    throw new Error(
      `Cannot finalize rankings: Season ${seasonId} is not ENDED (status: ${season.status})`
    );
  }

  // Get all entries ordered by rank points
  const entries = await prisma.seasonEntry.findMany({
    where: { seasonId },
    orderBy: { rankPoints: 'desc' },
    select: {
      id: true,
      userId: true,
      rankPoints: true,
      currentRank: true,
    },
  });

  logger.info(`[Season] Found ${entries.length} entries to finalize in season ${seasonId}`);

  // Update rank positions in batches
  const BATCH_SIZE = SEASON_WORKER_CONFIG.BATCH_SIZE;
  let finalized = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((entry, batchIndex) =>
        prisma.seasonEntry.update({
          where: { id: entry.id },
          data: {
            rankPosition: i + batchIndex + 1,
            finalRank: entry.currentRank,
            finalRankPoints: entry.rankPoints,
          },
        })
      )
    );

    finalized += batch.length;
    logger.info(`[Season] Finalized ${finalized}/${entries.length} entries`);
  }

  // Mark season as finalized
  await prisma.season.update({
    where: { id: seasonId },
    data: { rankingsFinalizedAt: now },
  });

  logger.info(`[Season] Rankings finalized for season ${seasonId}: ${finalized} entries`);

  // Queue reward distribution
  const queue = getSeasonQueue();
  await queue.add(
    'distribute-rewards',
    {
      type: 'distribute-rewards',
      seasonId,
      triggeredBy: 'scheduled',
    },
    {
      jobId: `distribute-rewards-${seasonId}`,
      priority: 3, // Lower priority than finalization
    }
  );

  logger.info(`[Season] Queued reward distribution for season ${seasonId}`);

  return {
    success: true,
    message: `Rankings finalized for season ${seasonId}`,
    timestamp: now.toISOString(),
    stats: { entriesFinalized: finalized },
  };
}

/**
 * Distribute rewards for a finalized season.
 * Idempotent - skips if already distributed.
 */
async function processRewardDistribution(seasonId: string): Promise<SeasonJobResult> {
  logger.info(`[Season] Distributing rewards for season: ${seasonId}`);

  const now = new Date();

  // Distributed lock to prevent concurrent reward distribution
  const redis = getRedisConnection();
  const lockKey = `season:rewards:${seasonId}:lock`;
  const lockResult = await redis.set(lockKey, 'worker', 'EX', 600, 'NX'); // 10 min for reward distribution

  if (lockResult !== 'OK') {
    logger.info(`[Season] Lock held by another worker for reward distribution ${seasonId}`);
    return {
      success: true,
      message: `Reward distribution in progress by another worker for season ${seasonId}`,
      timestamp: now.toISOString(),
    };
  }

  try {
    // Check if already distributed
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: {
        id: true,
        name: true,
        status: true,
        rewardsDistributedAt: true,
      },
    });

    if (!season) {
      throw new Error(`Season ${seasonId} not found`);
    }

    if (season.rewardsDistributedAt) {
      logger.info(`[Season] Rewards already distributed for season ${seasonId}`);
      return {
        success: true,
        message: `Rewards already distributed for season ${seasonId}`,
        timestamp: now.toISOString(),
      };
    }

    if (season.status !== SeasonStatus.ENDED) {
      throw new Error(
        `Cannot distribute rewards: Season ${seasonId} is not ENDED (status: ${season.status})`
      );
    }

    // Call reward distribution service
    const result = await distributeSeasonRewards(seasonId);

    // Mark season as distributed (with optimistic check)
    const updateResult = await prisma.season.updateMany({
      where: {
        id: seasonId,
        rewardsDistributedAt: null, // Only update if not already set
      },
      data: {
        rewardsDistributedAt: now,
      },
    });

    if (updateResult.count === 0) {
      logger.warn(`[Season] Rewards may have been distributed concurrently for season ${seasonId}`);
    } else {
      logger.info(`[Season] Marked season ${seasonId} as rewards distributed`);
    }

    return {
      success: true,
      message: `Rewards distributed for season ${seasonId}: ${result.rewardsClaimed}/${result.totalEntries} claimed`,
      timestamp: now.toISOString(),
      stats: {
        rewardsClaimed: result.rewardsClaimed,
        totalCoinsDistributed: result.totalCoinsDistributed,
        errors: result.errors,
      },
    };
  } finally {
    // Release distributed lock
    await redis.del(lockKey);
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the season worker to process jobs.
 * Should be called once during application startup.
 */
export function startSeasonWorker(): Worker<SeasonJobData, SeasonJobResult> {
  if (seasonWorker) {
    logger.warn('Season worker already running');
    return seasonWorker;
  }

  seasonWorker = new Worker<SeasonJobData, SeasonJobResult>(
    SEASON_QUEUE_NAME,
    processSeasonJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1, // Process one job at a time to avoid race conditions
    }
  );

  seasonWorker.on('completed', (job, result) => {
    logger.info(`Season job ${job.id} completed:`, result);
  });

  seasonWorker.on('failed', (job, error) => {
    logger.error(`Season job ${job?.id} failed:`, error);
  });

  seasonWorker.on('error', (error) => {
    logger.error('Season worker error:', error);
  });

  logger.info('Season worker started');
  return seasonWorker;
}

/**
 * Stop the season worker gracefully.
 * Should be called during application shutdown.
 */
export async function stopSeasonWorker(): Promise<void> {
  if (seasonWorker) {
    await seasonWorker.close();
    seasonWorker = null;
    logger.info('Season worker stopped');
  }

  if (seasonQueue) {
    await seasonQueue.close();
    seasonQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule recurring season jobs.
 * Runs:
 * - Daily decay: Every day at 2:00 AM UTC
 * - Season end check: Every hour at :05
 */
export async function scheduleSeasonJobs(): Promise<void> {
  const queue = getSeasonQueue();

  // Remove existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'season-daily-decay' || job.name === 'season-end-check') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule daily decay job
  await queue.add(
    'season-daily-decay',
    {
      type: 'daily-decay',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: SEASON_WORKER_CONFIG.DECAY_CRON, // '0 2 * * *' - 2 AM UTC
        tz: 'UTC',
      },
      jobId: 'season-daily-decay-scheduled',
    }
  );

  logger.info(`Season daily decay scheduled: ${SEASON_WORKER_CONFIG.DECAY_CRON}`);

  // Schedule season end check job
  await queue.add(
    'season-end-check',
    {
      type: 'check-season-end',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: SEASON_WORKER_CONFIG.SEASON_CHECK_CRON, // '5 * * * *' - Every hour at :05
        tz: 'UTC',
      },
      jobId: 'season-end-check-scheduled',
    }
  );

  logger.info(`Season end check scheduled: ${SEASON_WORKER_CONFIG.SEASON_CHECK_CRON}`);
}

// ===========================================
// Manual Job Triggers
// ===========================================

/**
 * Queue an immediate daily decay job (for manual triggers or testing).
 */
export async function queueManualDecay(): Promise<Job<SeasonJobData, SeasonJobResult>> {
  const queue = getSeasonQueue();

  const jobId = `season-decay-manual-${Date.now()}`;

  const job = await queue.add(
    'season-daily-decay-manual',
    {
      type: 'daily-decay',
      triggeredBy: 'manual',
    },
    {
      jobId,
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info(`Manual season decay queued: ${job.id}`);
  return job;
}

/**
 * Queue an immediate season end job for a specific season (for manual triggers or testing).
 */
export async function queueManualSeasonEnd(seasonId: string): Promise<Job<SeasonJobData, SeasonJobResult>> {
  const queue = getSeasonQueue();

  const jobId = `season-end-manual-${seasonId}-${Date.now()}`;

  const job = await queue.add(
    'season-end-manual',
    {
      type: 'end-season',
      seasonId,
      triggeredBy: 'manual',
    },
    {
      jobId,
      priority: 1, // Higher priority for manual triggers
    }
  );

  logger.info(`Manual season end queued for ${seasonId}: ${job.id}`);
  return job;
}
