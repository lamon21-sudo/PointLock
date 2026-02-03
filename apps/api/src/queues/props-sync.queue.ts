// =====================================================
// Props Sync Queue - Background Player Props Syncing
// =====================================================
// Handles scheduled synchronization of player props for
// upcoming sports events. Runs less frequently than events
// sync to reduce API costs.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { logger } from '../utils/logger';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { SportType, OddsData, PlayerPropData } from '../services/events/types';
import { NBAFetcher } from '../services/events/fetchers/nba.fetcher';
import { NFLFetcher } from '../services/events/fetchers/nfl.fetcher';
import { BaseSportsFetcher } from '../services/events/fetchers/base.fetcher';

// ===========================================
// Queue Name Constants
// ===========================================

export const PROPS_SYNC_QUEUE_NAME = 'props-sync';

// ===========================================
// Job Types
// ===========================================

export interface PropsSyncJobData {
  type: 'sync-props';
  eventId?: string; // Optional: sync specific event
  triggeredBy: string;
}

export interface PropsSyncJobResult {
  success: boolean;
  eventsProcessed: number;
  propsUpdated: number;
  errors: string[];
}

// ===========================================
// Queue Instance (Singleton)
// ===========================================

let propsSyncQueue: Queue<PropsSyncJobData, PropsSyncJobResult> | null = null;
let propsSyncWorker: Worker<PropsSyncJobData, PropsSyncJobResult> | null = null;

/**
 * Get or create the props sync queue instance.
 */
export function getPropsSyncQueue(): Queue<PropsSyncJobData, PropsSyncJobResult> {
  if (!propsSyncQueue) {
    propsSyncQueue = new Queue<PropsSyncJobData, PropsSyncJobResult>(
      PROPS_SYNC_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 24 * 60 * 60,
            count: 50,
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60,
          },
        },
      }
    );

    logger.info(`Props sync queue initialized: ${PROPS_SYNC_QUEUE_NAME}`);
  }

  return propsSyncQueue;
}

// ===========================================
// Fetcher Management
// ===========================================

const fetchers: Map<SportType, BaseSportsFetcher> = new Map();

function getFetcherForSport(sport: SportType): BaseSportsFetcher | null {
  if (!fetchers.has(sport)) {
    switch (sport) {
      case SportType.NBA:
        fetchers.set(sport, new NBAFetcher());
        break;
      case SportType.NFL:
        fetchers.set(sport, new NFLFetcher());
        break;
      default:
        return null;
    }
  }
  return fetchers.get(sport) || null;
}

// ===========================================
// Helper Functions
// ===========================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Update event's oddsData with player props
 */
async function updateEventProps(eventId: string, props: PlayerPropData[]): Promise<void> {
  const event = await prisma.sportsEvent.findUnique({
    where: { id: eventId },
    select: { oddsData: true },
  });

  if (!event) return;

  const currentOdds = (event.oddsData || {}) as OddsData;
  const updatedOdds: OddsData = {
    ...currentOdds,
    provider: currentOdds.provider || 'Mock Sportsbook',
    lastUpdated: currentOdds.lastUpdated || new Date().toISOString(),
    markets: {
      ...currentOdds.markets,
      props: {
        lastUpdated: new Date().toISOString(),
        players: props,
      },
    },
  };

  await prisma.sportsEvent.update({
    where: { id: eventId },
    data: {
      oddsData: updatedOdds,
      oddsUpdatedAt: new Date(),
    },
  });
}

// ===========================================
// Job Processor
// ===========================================

/**
 * Process props sync jobs.
 */
async function processPropsSyncJob(
  job: Job<PropsSyncJobData, PropsSyncJobResult>
): Promise<PropsSyncJobResult> {
  const { triggeredBy } = job.data;

  logger.info(`[PropsSyncQueue] Processing job ${job.id}`, {
    triggeredBy,
    attempt: job.attemptsMade + 1,
  });

  const result: PropsSyncJobResult = {
    success: false,
    eventsProcessed: 0,
    propsUpdated: 0,
    errors: [],
  };

  if (!config.playerProps.enabled && !config.playerProps.useMockData) {
    logger.info('[PropsSyncQueue] Player props disabled, skipping sync');
    result.success = true;
    return result;
  }

  try {
    // Get events within fetch window
    const windowEnd = new Date();
    windowEnd.setHours(windowEnd.getHours() + config.playerProps.fetchWindowHours);

    const events = await prisma.sportsEvent.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: new Date(),
          lte: windowEnd,
        },
        sport: {
          in: [SportType.NBA, SportType.NFL],
        },
      },
      select: {
        id: true,
        externalId: true,
        sport: true,
      },
      take: config.playerProps.maxEventsPerSync,
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    logger.info(`[PropsSyncQueue] Found ${events.length} events to sync props for`);

    // Fetch props for each event
    for (const event of events) {
      try {
        const fetcher = getFetcherForSport(event.sport);
        if (!fetcher) {
          logger.debug(`[PropsSyncQueue] No fetcher for sport ${event.sport}`);
          continue;
        }

        const props = await fetcher.fetchEventProps(event.externalId);

        if (props.length > 0) {
          await updateEventProps(event.id, props);
          result.propsUpdated += props.length;
          logger.debug(`[PropsSyncQueue] Updated ${props.length} props for event ${event.id}`);
        }

        result.eventsProcessed++;

        // Update progress
        await job.updateProgress(Math.round((result.eventsProcessed / events.length) * 100));

        // Small delay between events to be nice to API
        await sleep(200);
      } catch (error) {
        const errorMsg = `Event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        logger.warn(`[PropsSyncQueue] ${errorMsg}`);
      }
    }

    result.success = result.errors.length === 0;

    logger.info(
      `[PropsSyncQueue] Sync completed: ${result.eventsProcessed} events, ` +
        `${result.propsUpdated} props updated, ${result.errors.length} errors`
    );

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    logger.error(`[PropsSyncQueue] Job ${job.id} failed:`, error);
    throw error;
  }
}

// ===========================================
// Worker Management
// ===========================================

/**
 * Start the props sync worker to process jobs.
 */
export function startPropsSyncWorker(): Worker<PropsSyncJobData, PropsSyncJobResult> {
  if (propsSyncWorker) {
    logger.warn('[PropsSyncQueue] Worker already running');
    return propsSyncWorker;
  }

  propsSyncWorker = new Worker<PropsSyncJobData, PropsSyncJobResult>(
    PROPS_SYNC_QUEUE_NAME,
    processPropsSyncJob,
    {
      connection: getSubscriberConnection(),
      concurrency: 1,
      limiter: {
        max: 2,
        duration: 60000,
      },
    }
  );

  propsSyncWorker.on('completed', (job, result) => {
    logger.info(`[PropsSyncQueue] Job ${job.id} completed:`, {
      success: result.success,
      eventsProcessed: result.eventsProcessed,
      propsUpdated: result.propsUpdated,
    });
  });

  propsSyncWorker.on('failed', (job, error) => {
    logger.error(`[PropsSyncQueue] Job ${job?.id} failed:`, error);
  });

  propsSyncWorker.on('error', (error) => {
    logger.error('[PropsSyncQueue] Worker error:', error);
  });

  logger.info('[PropsSyncQueue] Worker started');
  return propsSyncWorker;
}

/**
 * Stop the props sync worker gracefully.
 */
export async function stopPropsSyncWorker(): Promise<void> {
  if (propsSyncWorker) {
    await propsSyncWorker.close();
    propsSyncWorker = null;
    logger.info('[PropsSyncQueue] Worker stopped');
  }

  if (propsSyncQueue) {
    await propsSyncQueue.close();
    propsSyncQueue = null;
  }
}

// ===========================================
// Job Scheduling
// ===========================================

/**
 * Schedule recurring props sync jobs.
 * Runs based on config interval (default: 30 minutes).
 */
export async function schedulePropsSyncJobs(): Promise<void> {
  if (!config.playerProps.enabled && !config.playerProps.useMockData) {
    logger.info('[PropsSyncQueue] Player props disabled, skipping schedule');
    return;
  }

  const queue = getPropsSyncQueue();

  // Remove any existing scheduled jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name.startsWith('scheduled-')) {
      await queue.removeRepeatableByKey(job.key);
      logger.info(`[PropsSyncQueue] Removed old repeatable job: ${job.name}`);
    }
  }

  // Schedule props sync based on config interval
  const interval = config.playerProps.syncIntervalMinutes;
  await queue.add(
    'scheduled-props-sync',
    {
      type: 'sync-props',
      triggeredBy: 'scheduler',
    },
    {
      repeat: {
        pattern: `*/${interval} * * * *`,
      },
      jobId: 'scheduled-props-sync',
    }
  );

  logger.info(`[PropsSyncQueue] Scheduled props sync to run every ${interval} minutes`);
}

/**
 * Queue an immediate props sync.
 */
export async function queueImmediatePropsSync(
  triggeredBy: string = 'manual'
): Promise<Job<PropsSyncJobData, PropsSyncJobResult>> {
  const queue = getPropsSyncQueue();

  const job = await queue.add(
    'manual-props-sync',
    {
      type: 'sync-props',
      triggeredBy,
    },
    {
      priority: 1,
    }
  );

  logger.info(`[PropsSyncQueue] Queued immediate props sync: ${job.id}`);
  return job;
}
