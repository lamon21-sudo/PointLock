// =====================================================
// Notification Scheduler Queue
// =====================================================
// Drives all scheduled notification scans: game reminders,
// slip expiry warnings, daily digest, weekly recap, inactivity
// re-engagement, win streak checks, leaderboard proximity
// alerts, Expo receipt verification, and deferred delivery.
//
// Architecture: one queue, one worker, multiple job types.
// The worker delegates to processor functions defined in
// notification-scheduler.service. Each repeatable job fires
// with a typed NotificationSchedulerJobData payload.
//
// Scheduler start is guarded by config.notifications.schedulerEnabled.
// The worker always starts so settlement-triggered ad-hoc jobs
// (e.g., win-streak checks) are processed even when the scheduler
// is disabled for scheduled cron-style work.

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection, getSubscriberConnection } from './connection';
import { config } from '../config';
import { logger } from '../utils/logger';

// =====================================================
// Queue Name Constant
// =====================================================

export const NOTIFICATION_SCHEDULER_QUEUE_NAME = 'notification-scheduler';

// =====================================================
// Job Types
// =====================================================

export type NotificationSchedulerJobType =
  | 'scan-game-reminders'
  | 'scan-slip-expiring'
  | 'send-daily-digest'
  | 'send-weekly-recap'
  | 'scan-inactivity'
  | 'scan-win-streaks'
  | 'scan-leaderboard-proximity'
  | 'check-expo-receipts'
  | 'process-deferred-notifications';

export interface NotificationSchedulerJobData {
  type: NotificationSchedulerJobType;
  triggeredBy: 'scheduled' | 'settlement' | 'manual';
  receivedAt: string;
  /** Scoped to a single user for ad-hoc jobs (e.g., win-streak after settlement) */
  userId?: string;
  /** Event or match ID that triggered an ad-hoc job */
  matchId?: string;
  /** IANA timezone bucket for digest/recap fan-out, if pre-segmented */
  timezoneBucket?: string;
  /** Pagination cursor for large scan batches */
  batchCursor?: string;
}

export interface NotificationSchedulerJobResult {
  success: boolean;
  type: NotificationSchedulerJobType;
  processed: number;
  skipped: number;
  message: string;
  durationMs: number;
  error?: string;
}

// =====================================================
// Queue Instance (Singleton)
// =====================================================

let notificationSchedulerQueue: Queue<NotificationSchedulerJobData, NotificationSchedulerJobResult> | null = null;
let notificationSchedulerWorker: Worker<NotificationSchedulerJobData, NotificationSchedulerJobResult> | null = null;

/**
 * Get or create the notification scheduler queue instance.
 * Lazy singleton — connection is not established until first call.
 */
export function getNotificationSchedulerQueue(): Queue<NotificationSchedulerJobData, NotificationSchedulerJobResult> {
  if (!notificationSchedulerQueue) {
    notificationSchedulerQueue = new Queue<NotificationSchedulerJobData, NotificationSchedulerJobResult>(
      NOTIFICATION_SCHEDULER_QUEUE_NAME,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10_000, // Start at 10 s — notification scans are not time-critical
          },
          removeOnComplete: {
            age: 6 * 60 * 60, // Keep completed jobs for 6 hours
            count: 500,
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        },
      }
    );

    logger.info(`[NotificationScheduler] Queue initialized: ${NOTIFICATION_SCHEDULER_QUEUE_NAME}`);
  }

  return notificationSchedulerQueue;
}

// =====================================================
// Job Processor
// =====================================================

/**
 * Route an incoming job to the appropriate processor function.
 * All processor functions are defined in notification-scheduler.service
 * and are imported lazily to avoid circular dependencies.
 *
 * The processor catches and logs its own errors. If an unrecoverable
 * error propagates up, BullMQ handles the retry via defaultJobOptions.
 */
async function processNotificationSchedulerJob(
  job: Job<NotificationSchedulerJobData, NotificationSchedulerJobResult>
): Promise<NotificationSchedulerJobResult> {
  const startTime = Date.now();
  const { type, triggeredBy, userId, matchId } = job.data;

  logger.info(`[NotificationScheduler] Processing job ${job.id}`, {
    type,
    triggeredBy,
    userId,
    matchId,
    attempt: job.attemptsMade + 1,
  });

  // Lazy import — keeps this file free of circular dep chains
  const service = await import('../services/notifications/notification-scheduler.service');

  try {
    let result: Omit<NotificationSchedulerJobResult, 'type' | 'durationMs'>;

    switch (type) {
      case 'scan-game-reminders':
        result = await service.processGameReminders();
        break;

      case 'scan-slip-expiring':
        result = await service.processSlipExpiring();
        break;

      case 'send-daily-digest':
        result = await service.processDailyDigest();
        break;

      case 'send-weekly-recap':
        result = await service.processWeeklyRecap();
        break;

      case 'scan-inactivity':
        result = await service.processInactivityCheck();
        break;

      case 'scan-win-streaks':
        // Ad-hoc win-streak jobs carry a userId; scheduled scans do not
        result = await service.processWinStreakCheck(userId);
        break;

      case 'scan-leaderboard-proximity':
        result = await service.processLeaderboardProximity();
        break;

      case 'check-expo-receipts':
        result = await service.processExpoReceipts();
        break;

      case 'process-deferred-notifications':
        result = await service.processDeferredNotifications();
        break;

      default: {
        // Exhaustiveness guard — TypeScript will flag missing cases at compile time
        const exhaustive: never = type;
        throw new Error(`[NotificationScheduler] Unknown job type: ${exhaustive}`);
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info(`[NotificationScheduler] Job ${job.id} complete`, {
      type,
      processed: result.processed,
      skipped: result.skipped,
      durationMs,
    });

    return { ...result, type, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(`[NotificationScheduler] Job ${job.id} failed`, {
      type,
      error,
      attempt: job.attemptsMade + 1,
    });
    throw error; // Let BullMQ handle retry via defaultJobOptions
  }
}

// =====================================================
// Worker Management
// =====================================================

/**
 * Start the notification scheduler worker.
 * Should be called once during application startup.
 *
 * The worker always starts regardless of schedulerEnabled — ad-hoc jobs
 * (e.g., win-streak checks fired by the settlement queue) must be
 * processable even when the scheduler cron jobs are disabled.
 */
export function startNotificationSchedulerWorker(): Worker<NotificationSchedulerJobData, NotificationSchedulerJobResult> {
  if (notificationSchedulerWorker) {
    logger.warn('[NotificationScheduler] Worker already running');
    return notificationSchedulerWorker;
  }

  notificationSchedulerWorker = new Worker<NotificationSchedulerJobData, NotificationSchedulerJobResult>(
    NOTIFICATION_SCHEDULER_QUEUE_NAME,
    processNotificationSchedulerJob,
    {
      connection: getSubscriberConnection(),
      // Higher concurrency than settlement — notification scans are read-heavy
      // and independently scoped (no shared write locks between job types).
      concurrency: 3,
      limiter: {
        max: 20,
        duration: 60_000, // Max 20 notification jobs per minute to protect DB
      },
    }
  );

  notificationSchedulerWorker.on('completed', (job, result) => {
    logger.debug(`[NotificationScheduler] Job ${job.id} completed`, {
      type: result.type,
      processed: result.processed,
      durationMs: result.durationMs,
    });
  });

  notificationSchedulerWorker.on('failed', (job, error) => {
    logger.error(`[NotificationScheduler] Job ${job?.id} failed`, {
      type: job?.data.type,
      error: error.message,
      attempt: job?.attemptsMade,
    });
  });

  notificationSchedulerWorker.on('error', (error) => {
    logger.error('[NotificationScheduler] Worker error:', error);
  });

  notificationSchedulerWorker.on('stalled', (jobId) => {
    logger.warn(`[NotificationScheduler] Job ${jobId} stalled`);
  });

  logger.info('[NotificationScheduler] Worker started');
  return notificationSchedulerWorker;
}

/**
 * Stop the notification scheduler worker and queue gracefully.
 * Should be called during application shutdown.
 */
export async function stopNotificationSchedulerWorker(): Promise<void> {
  if (notificationSchedulerWorker) {
    await notificationSchedulerWorker.close();
    notificationSchedulerWorker = null;
    logger.info('[NotificationScheduler] Worker stopped');
  }

  if (notificationSchedulerQueue) {
    await notificationSchedulerQueue.close();
    notificationSchedulerQueue = null;
  }
}

// =====================================================
// Job Scheduling (Repeatable Cron Jobs)
// =====================================================

// ---- Cron definitions ----
// Each entry maps a job type to its BullMQ repeat pattern.
// All patterns are evaluated in UTC.

interface RepeatableJobDef {
  name: NotificationSchedulerJobType;
  /** Standard cron expression (5-field, UTC) */
  pattern: string;
  /** Stable job ID — prevents duplicate repeatable registrations */
  jobId: string;
}

const REPEATABLE_JOB_DEFS: RepeatableJobDef[] = [
  // ---- Scan game reminders every 15 min ----
  {
    name: 'scan-game-reminders',
    pattern: '*/15 * * * *',
    jobId: 'scheduled-scan-game-reminders',
  },
  // ---- Scan slip expiry every 5 min ----
  {
    name: 'scan-slip-expiring',
    pattern: '*/5 * * * *',
    jobId: 'scheduled-scan-slip-expiring',
  },
  // ---- Daily digest fan-out — fires every hour at :00 ----
  // The processor internally filters which users are in the right local hour.
  {
    name: 'send-daily-digest',
    pattern: '0 * * * *',
    jobId: 'scheduled-send-daily-digest',
  },
  // ---- Weekly recap fan-out — fires at :00 on Mondays ----
  // Processor checks users whose local day/hour matches their preference.
  {
    name: 'send-weekly-recap',
    pattern: '0 * * * 1',
    jobId: 'scheduled-send-weekly-recap',
  },
  // ---- Inactivity check every 6 hours ----
  {
    name: 'scan-inactivity',
    pattern: '0 */6 * * *',
    jobId: 'scheduled-scan-inactivity',
  },
  // ---- Leaderboard proximity alert — daily at 17:00 UTC ----
  {
    name: 'scan-leaderboard-proximity',
    pattern: '0 17 * * *',
    jobId: 'scheduled-scan-leaderboard-proximity',
  },
  // ---- Expo receipt polling every 15 min ----
  // Receipts become available ~15 min after ticket issuance.
  {
    name: 'check-expo-receipts',
    pattern: '*/15 * * * *',
    jobId: 'scheduled-check-expo-receipts',
  },
  // ---- Deferred notification processing — hourly at :30 ----
  {
    name: 'process-deferred-notifications',
    pattern: '30 * * * *',
    jobId: 'scheduled-process-deferred-notifications',
  },
];

/**
 * Register all repeatable notification cron jobs.
 *
 * Idempotent: removes existing repeatables before re-adding to ensure
 * cron pattern changes take effect without manual Redis cleanup.
 *
 * Guarded by config.notifications.schedulerEnabled. When disabled the
 * worker still runs (ad-hoc jobs must process), but no cron jobs fire.
 */
export async function scheduleNotificationJobs(): Promise<void> {
  if (!config.notifications.schedulerEnabled) {
    logger.info(
      '[NotificationScheduler] Scheduler disabled (FEATURE_NOTIFICATION_SCHEDULER_ENABLED != true). ' +
      'Repeatable jobs will not be registered. Ad-hoc jobs remain processable.'
    );
    return;
  }

  const queue = getNotificationSchedulerQueue();

  // ---- Purge stale repeatables to pick up any pattern changes ----
  const existingJobs = await queue.getRepeatableJobs();
  for (const existing of existingJobs) {
    const isOwned = REPEATABLE_JOB_DEFS.some((def) => def.name === existing.name);
    if (isOwned) {
      await queue.removeRepeatableByKey(existing.key);
      logger.debug(`[NotificationScheduler] Removed stale repeatable: ${existing.name}`);
    }
  }

  // ---- Register each repeatable job ----
  for (const def of REPEATABLE_JOB_DEFS) {
    await queue.add(
      def.name,
      {
        type: def.name,
        triggeredBy: 'scheduled',
        receivedAt: new Date().toISOString(),
      },
      {
        repeat: {
          pattern: def.pattern,
          tz: 'UTC',
        },
        jobId: def.jobId,
      }
    );

    logger.info(`[NotificationScheduler] Registered repeatable job: ${def.name} (${def.pattern})`);
  }

  logger.info(`[NotificationScheduler] ${REPEATABLE_JOB_DEFS.length} repeatable jobs registered`);
}

// =====================================================
// Ad-hoc Job Helpers
// =====================================================

/**
 * Queue an immediate win-streak check for a specific user.
 * Called by the game settlement queue after a match settles —
 * the settlement worker does not know thresholds so it delegates here.
 *
 * Uses a jobId that deduplicates within a 1-hour window: if two
 * matches settle concurrently for the same user, only one streak check runs.
 *
 * @param userId - The user whose streak should be evaluated
 * @param matchId - The match that just settled (for log traceability)
 */
export async function queueWinStreakCheck(userId: string, matchId: string): Promise<void> {
  const queue = getNotificationSchedulerQueue();

  // Deduplicate: one win-streak check per user per hour maximum
  const hourBucket = new Date().toISOString().slice(0, 13); // "2026-02-23T14"
  const jobId = `win-streak-${userId}-${hourBucket}`;

  await queue.add(
    'scan-win-streaks',
    {
      type: 'scan-win-streaks',
      triggeredBy: 'settlement',
      receivedAt: new Date().toISOString(),
      userId,
      matchId,
    },
    {
      jobId,
      priority: 5, // Lower priority than settlement jobs
    }
  );

  logger.debug(`[NotificationScheduler] Queued win-streak check`, {
    userId,
    matchId,
    jobId,
  });
}
