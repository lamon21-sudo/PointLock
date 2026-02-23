// =====================================================
// Notification Scheduler Service
// =====================================================
// Processor functions for each scheduled notification job type.
// Every function is called by the notification-scheduler queue worker
// and must be:
//
//   1. Non-throwing — catch all errors internally, return a result.
//   2. Idempotent — duplicate runs must not double-send (the gatekeeper
//      dedupe key in sendNotification() is the final guard).
//   3. Batch-safe — each scan queries a bounded set and logs counts.
//
// Notification delivery delegates entirely to sendNotification() which
// enforces the gatekeeper pipeline: master switch, category toggle,
// dedupe, quiet hours, and daily cap.

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { sendNotification } from './notification.service';
import { checkExpoReceipts } from './expo-push.service';
import {
  isLocalHourMatch,
  getLocalDate,
  getLocalDayOfWeek,
  resolveTimezone,
} from './timezone.utils';
import { NotificationCategory } from '@pick-rivals/shared-types';

// =====================================================
// Shared Result Type
// =====================================================

export interface ProcessorResult {
  success: boolean;
  processed: number;
  skipped: number;
  message: string;
}

// =====================================================
// Constants
// =====================================================

/** Game-reminder window: events starting between now+60min and now+120min */
const GAME_REMINDER_WINDOW_MINUTES_MIN = 60;
const GAME_REMINDER_WINDOW_MINUTES_MAX = 120;

/** Slip-expiring threshold: matches whose first event starts within 20 min */
const SLIP_EXPIRY_THRESHOLD_MINUTES = 20;

/** Inactivity thresholds */
const INACTIVITY_48H_MS = 48 * 60 * 60 * 1000;
const INACTIVITY_7D_MS = 7 * 24 * 60 * 60 * 1000;

/** Win-streak thresholds that trigger a notification */
const WIN_STREAK_THRESHOLDS = [3, 5, 10] as const;

/** How many points within Top-10 to trigger leaderboard proximity alert */
const LEADERBOARD_PROXIMITY_POINTS = 50;

/** Max users per leaderboard proximity scan (bounded to prevent OOM) */
const LEADERBOARD_SCAN_LIMIT = 500;

/** Max Expo ticket IDs to check in a single receipt-check run */
const RECEIPT_CHECK_BATCH_SIZE = 250;

/** Get ISO week number (1-53) for dedupe keys */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** How far back to look for SENT tickets awaiting receipt */
const RECEIPT_LOOKBACK_HOURS = 24;

// =====================================================
// processGameReminders
// =====================================================

/**
 * Scan for upcoming sports events and notify users who have active
 * SlipPicks tied to those events.
 *
 * Query window: events with status=SCHEDULED and scheduledAt between
 * (now + 60 min) and (now + 120 min).
 *
 * Dedupe key per event per user ensures one reminder per event regardless
 * of how many picks the user has in that event.
 */
export async function processGameReminders(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][game-reminders]';

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + GAME_REMINDER_WINDOW_MINUTES_MIN * 60_000);
    const windowEnd = new Date(now.getTime() + GAME_REMINDER_WINDOW_MINUTES_MAX * 60_000);

    // Query events in the reminder window
    const upcomingEvents = await prisma.sportsEvent.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      select: {
        id: true,
        homeTeamName: true,
        awayTeamName: true,
        scheduledAt: true,
        picks: {
          select: {
            slip: {
              select: {
                userId: true,
                status: true,
              },
            },
          },
          where: {
            slip: {
              status: { in: ['PENDING', 'ACTIVE'] },
            },
          },
        },
      },
    });

    if (upcomingEvents.length === 0) {
      logger.debug(`${label} No events in reminder window`);
      return { success: true, processed: 0, skipped: 0, message: 'No events in reminder window' };
    }

    let processed = 0;
    let skipped = 0;

    for (const event of upcomingEvents) {
      // Deduplicate users — multiple picks in one event should yield one notification
      const userIds = [...new Set(event.picks.map((p) => p.slip.userId))];

      if (userIds.length === 0) {
        skipped++;
        continue;
      }

      const minutesUntilStart = Math.round((event.scheduledAt.getTime() - now.getTime()) / 60_000);

      for (const userId of userIds) {
        try {
          await sendNotification({
            userId,
            category: NotificationCategory.GAME_REMINDER,
            templateId: 'game_reminder.upcoming',
            variables: {
              gameCount: 1,
              hoursRemaining: Math.round(minutesUntilStart / 60),
            },
            entityId: event.id,
            // Dedupe: one game-reminder per user per event per 2-hour window
            dedupeKey: `game-reminder:${userId}:${event.id}`,
          });
          processed++;
        } catch (sendError) {
          // sendNotification is non-throwing by contract; this is belt-and-suspenders
          logger.error(`${label} Unexpected error sending to user ${userId}`, { sendError });
          skipped++;
        }
      }
    }

    logger.info(`${label} Complete`, { processed, skipped, eventCount: upcomingEvents.length });
    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} game reminder(s) for ${upcomingEvents.length} event(s)`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processSlipExpiring
// =====================================================

/**
 * Notify users whose active match slips will lock within 20 minutes
 * because the first event in their match is about to start.
 *
 * Targets matches in status 'matched' or 'locked' (both slips submitted)
 * that have at least one SCHEDULED event starting within the threshold.
 * A user is only notified once — the gatekeeper dedupe key enforces this
 * via a 10-minute window keyed on slipId.
 */
export async function processSlipExpiring(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][slip-expiring]';

  try {
    const now = new Date();
    const threshold = new Date(now.getTime() + SLIP_EXPIRY_THRESHOLD_MINUTES * 60_000);

    // Find matches whose earliest event start is imminent
    const imminentMatches = await prisma.match.findMany({
      where: {
        status: { in: ['matched', 'locked'] },
        // At least one associated pick event starts within the threshold
        OR: [
          {
            creatorSlip: {
              picks: {
                some: {
                  event: {
                    status: 'SCHEDULED',
                    scheduledAt: { lte: threshold, gte: now },
                  },
                },
              },
            },
          },
          {
            opponentSlip: {
              picks: {
                some: {
                  event: {
                    status: 'SCHEDULED',
                    scheduledAt: { lte: threshold, gte: now },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        creatorId: true,
        opponentId: true,
        creatorSlipId: true,
        opponentSlipId: true,
        slipDeadlineAt: true,
      },
    });

    if (imminentMatches.length === 0) {
      logger.debug(`${label} No imminent match lockouts`);
      return { success: true, processed: 0, skipped: 0, message: 'No slips expiring soon' };
    }

    let processed = 0;
    let skipped = 0;

    for (const match of imminentMatches) {
      const minutesRemaining = match.slipDeadlineAt
        ? Math.max(0, Math.round((match.slipDeadlineAt.getTime() - now.getTime()) / 60_000))
        : SLIP_EXPIRY_THRESHOLD_MINUTES;

      const usersToNotify: Array<{ userId: string; slipId: string | null }> = [
        { userId: match.creatorId, slipId: match.creatorSlipId },
      ];
      if (match.opponentId) {
        usersToNotify.push({ userId: match.opponentId, slipId: match.opponentSlipId });
      }

      for (const { userId, slipId } of usersToNotify) {
        if (!slipId) {
          skipped++;
          continue;
        }
        try {
          await sendNotification({
            userId,
            category: NotificationCategory.SLIP_EXPIRING,
            templateId: 'slip_expiring.warning',
            variables: { minutesRemaining },
            entityId: slipId,
            // Dedupe: one warning per slip per 10 min (category config window is 600_000ms)
            dedupeKey: `slip-expiring:${slipId}`,
          });
          processed++;
        } catch (sendError) {
          logger.error(`${label} Unexpected error sending to user ${userId}`, { sendError });
          skipped++;
        }
      }
    }

    logger.info(`${label} Complete`, { processed, skipped });
    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} slip-expiring warning(s)`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processDailyDigest
// =====================================================

/**
 * Fan out the daily digest to users whose local hour matches their
 * configured digestTimeLocal preference.
 *
 * The cron fires every hour at :00 UTC. This function fetches all
 * users with NotificationPreference rows and checks each user's
 * IANA timezone against their digestTimeLocal. Only users whose
 * local clock reads the target hour receive a notification.
 *
 * This avoids per-user scheduling — one hourly cron covers all timezones.
 */
export async function processDailyDigest(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][daily-digest]';

  try {
    // Fetch all users with preferences and a valid timezone
    const usersWithPrefs = await prisma.notificationPreference.findMany({
      where: {
        allNotificationsEnabled: true,
        dailyDigestEnabled: true,
      },
      select: {
        userId: true,
        digestTimeLocal: true,
        user: {
          select: { timezone: true },
        },
      },
    });

    let processed = 0;
    let skipped = 0;
    const now = new Date();

    for (const pref of usersWithPrefs) {
      const timezone = resolveTimezone(pref.user.timezone, config.notifications.defaultTimezone);

      if (!isLocalHourMatch(timezone, pref.digestTimeLocal, now)) {
        skipped++;
        continue;
      }

      // Count events for the user's local date (not UTC) to avoid timezone skew
      const localDate = getLocalDate(timezone, now);
      const localDayStart = new Date(`${localDate}T00:00:00`);
      const localDayEnd = new Date(localDayStart.getTime() + 24 * 60 * 60_000);

      const todayEventCount = await prisma.sportsEvent.count({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: localDayStart, lt: localDayEnd },
        },
      });

      // No events for this user's local day — skip
      if (todayEventCount === 0) {
        skipped++;
        continue;
      }

      try {
        await sendNotification({
          userId: pref.userId,
          category: NotificationCategory.DAILY_DIGEST,
          templateId: 'daily_digest.evening',
          variables: {
            gameCount: todayEventCount,
            sport: 'sports', // Generic — could be refined with sport-specific counts
          },
          // Dedupe: one digest per user per local date
          dedupeKey: `daily-digest:${pref.userId}:${localDate}`,
        });
        processed++;
      } catch (sendError) {
        logger.error(`${label} Unexpected error sending to user ${pref.userId}`, { sendError });
        skipped++;
      }
    }

    logger.info(`${label} Complete`, { processed, skipped });
    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} daily digest(s)`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processWeeklyRecap
// =====================================================

/**
 * Fan out the weekly recap to users whose local day and local hour
 * match their configured recapDayOfWeek and digestTimeLocal.
 *
 * The cron fires at :00 every hour on Mondays (UTC). This processor
 * re-checks each user's local timezone to confirm it is actually
 * their configured recap day/time, avoiding incorrect sends when
 * Monday UTC is still Sunday locally.
 *
 * Win/loss record is derived from LeaderboardEntry for the current
 * weekly leaderboard to avoid expensive match aggregation.
 */
export async function processWeeklyRecap(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][weekly-recap]';

  try {
    const usersWithPrefs = await prisma.notificationPreference.findMany({
      where: {
        allNotificationsEnabled: true,
        weeklyRecapEnabled: true,
      },
      select: {
        userId: true,
        digestTimeLocal: true,
        recapDayOfWeek: true,
        user: {
          select: {
            timezone: true,
            leaderboardEntries: {
              where: {
                leaderboard: {
                  timeframe: 'WEEKLY',
                  status: 'active',
                },
              },
              select: {
                wins: true,
                losses: true,
                rank: true,
                previousRank: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    let processed = 0;
    let skipped = 0;
    const now = new Date();

    for (const pref of usersWithPrefs) {
      const timezone = resolveTimezone(pref.user.timezone, config.notifications.defaultTimezone);

      // ---- Check local day matches recapDayOfWeek ----
      const localDay = getLocalDayOfWeek(timezone, now);
      if (localDay !== pref.recapDayOfWeek) {
        skipped++;
        continue;
      }

      // ---- Check local hour matches digestTimeLocal ----
      if (!isLocalHourMatch(timezone, pref.digestTimeLocal, now)) {
        skipped++;
        continue;
      }

      // ---- Build recap variables from weekly leaderboard entry ----
      const entry = pref.user.leaderboardEntries[0];
      const wins = entry?.wins ?? 0;
      const losses = entry?.losses ?? 0;
      const currentRank = entry?.rank ?? 0;
      const previousRank = entry?.previousRank ?? currentRank;
      const spotsClimbed = Math.max(0, previousRank - currentRank); // Lower rank = better

      try {
        await sendNotification({
          userId: pref.userId,
          category: NotificationCategory.WEEKLY_RECAP,
          templateId: 'weekly_recap.summary',
          variables: { wins, losses, spotsClimbed },
          // Dedupe: one recap per user per ISO week number (not calendar date)
          dedupeKey: `weekly-recap:${pref.userId}:${getISOWeek(now)}`,
        });
        processed++;
      } catch (sendError) {
        logger.error(`${label} Unexpected error sending to user ${pref.userId}`, { sendError });
        skipped++;
      }
    }

    logger.info(`${label} Complete`, { processed, skipped });
    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} weekly recap(s)`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processInactivityCheck
// =====================================================

/**
 * Query users who have been inactive for 48 hours or 7 days and
 * send the appropriate re-engagement notification.
 *
 * Guarded by config.notifications.inactivityEnabled. When disabled
 * this processor returns immediately without querying the DB.
 *
 * The gatekeeper dedupe key (category config: 172_800_000ms = 48h window)
 * prevents double-sending if a user is caught in both windows.
 *
 * The 7-day scan runs first so that users who are both 48h and 7d
 * inactive receive only the 7d message (stronger re-engagement copy).
 */
export async function processInactivityCheck(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][inactivity]';

  if (!config.notifications.inactivityEnabled) {
    logger.debug(`${label} Inactivity notifications disabled (FEATURE_NOTIFICATION_INACTIVITY_ENABLED != true)`);
    return { success: true, processed: 0, skipped: 0, message: 'Inactivity notifications disabled' };
  }

  try {
    const now = new Date();
    const cutoff48h = new Date(now.getTime() - INACTIVITY_48H_MS);
    const cutoff7d = new Date(now.getTime() - INACTIVITY_7D_MS);

    let processed = 0;
    let skipped = 0;

    // ---- 7-day inactive users (stronger copy, checked first) ----
    const users7d = await prisma.user.findMany({
      where: {
        lastActiveAt: { lte: cutoff7d },
        status: 'active',
        notificationPreference: {
          allNotificationsEnabled: true,
          inactivityEnabled: true,
        },
      },
      select: { id: true },
    });

    const processedUserIds = new Set<string>();

    for (const user of users7d) {
      try {
        await sendNotification({
          userId: user.id,
          category: NotificationCategory.INACTIVITY,
          templateId: 'inactivity.7d',
          variables: {},
          dedupeKey: `inactivity:${user.id}:7d`,
        });
        processed++;
        processedUserIds.add(user.id);
      } catch (sendError) {
        logger.error(`${label} Error sending 7d inactivity to user ${user.id}`, { sendError });
        skipped++;
      }
    }

    // ---- 48-hour inactive users (exclude those already sent 7d message) ----
    const users48h = await prisma.user.findMany({
      where: {
        lastActiveAt: {
          lte: cutoff48h,
          gt: cutoff7d, // Already in the 7d bucket — exclude to avoid duplicate
        },
        status: 'active',
        id: { notIn: [...processedUserIds] },
        notificationPreference: {
          allNotificationsEnabled: true,
          inactivityEnabled: true,
        },
      },
      select: { id: true },
    });

    for (const user of users48h) {
      try {
        await sendNotification({
          userId: user.id,
          category: NotificationCategory.INACTIVITY,
          templateId: 'inactivity.48h',
          variables: {},
          dedupeKey: `inactivity:${user.id}:48h`,
        });
        processed++;
      } catch (sendError) {
        logger.error(`${label} Error sending 48h inactivity to user ${user.id}`, { sendError });
        skipped++;
      }
    }

    logger.info(`${label} Complete`, {
      processed,
      skipped,
      users7d: users7d.length,
      users48h: users48h.length,
    });

    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} inactivity notification(s) (7d: ${users7d.length}, 48h: ${users48h.length})`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processWinStreakCheck
// =====================================================

/**
 * Check whether a user's currentStreak has crossed a notable threshold
 * (3, 5, or 10) and send a WIN_STREAK notification if so.
 *
 * Called ad-hoc after match settlement via queueWinStreakCheck().
 * When userId is undefined the function logs a warning and returns —
 * this should never occur via the queue helper but is guarded defensively.
 *
 * The gatekeeper dedupe key encodes the streak count to prevent re-sending
 * the same milestone notification if the job fires twice (e.g., retry).
 *
 * @param userId - The user to check. Undefined only if misconfigured job.
 */
export async function processWinStreakCheck(userId: string | undefined): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][win-streaks]';

  if (!userId) {
    logger.warn(`${label} Invoked without userId — skipping`);
    return { success: true, processed: 0, skipped: 1, message: 'No userId provided' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, currentStreak: true, status: true },
    });

    if (!user || user.status !== 'active') {
      return { success: true, processed: 0, skipped: 1, message: 'User not found or inactive' };
    }

    const streak = user.currentStreak;

    // Only notify at exact threshold crossings
    const isThreshold = (WIN_STREAK_THRESHOLDS as readonly number[]).includes(streak);
    if (!isThreshold) {
      logger.debug(`${label} Streak ${streak} for user ${userId} is not a milestone`);
      return {
        success: true,
        processed: 0,
        skipped: 1,
        message: `Streak ${streak} is not a threshold`,
      };
    }

    await sendNotification({
      userId,
      category: NotificationCategory.WIN_STREAK,
      templateId: 'win_streak.milestone',
      variables: { streakCount: streak },
      // Dedupe key encodes the streak count — prevents re-sending same milestone on retry
      dedupeKey: `win-streak:${userId}:${streak}`,
    });

    logger.info(`${label} Sent win-streak notification`, { userId, streak });
    return {
      success: true,
      processed: 1,
      skipped: 0,
      message: `Sent win-streak notification for streak ${streak}`,
    };
  } catch (error) {
    logger.error(`${label} Failed for user ${userId}`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Failed: ${String(error)}` };
  }
}

// =====================================================
// processLeaderboardProximity
// =====================================================

/**
 * Identify users within LEADERBOARD_PROXIMITY_POINTS points of the Top-10
 * on the current weekly leaderboard and send a LEADERBOARD notification.
 *
 * Algorithm:
 *   1. Find the active WEEKLY leaderboard.
 *   2. Find the score of the user ranked 10th (the proximity target).
 *   3. Query users ranked 11-LEADERBOARD_SCAN_LIMIT whose score is
 *      within LEADERBOARD_PROXIMITY_POINTS of the Top-10 threshold.
 *   4. Send a notification to each qualifying user.
 *
 * The gatekeeper dedupe window for LEADERBOARD is 86_400_000ms (24h)
 * so each user receives at most one proximity alert per day.
 */
export async function processLeaderboardProximity(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][leaderboard-proximity]';

  try {
    // Find the active weekly leaderboard
    const weeklyLeaderboard = await prisma.leaderboard.findFirst({
      where: {
        timeframe: 'WEEKLY',
        status: 'active',
      },
      select: { id: true },
    });

    if (!weeklyLeaderboard) {
      logger.info(`${label} No active weekly leaderboard found`);
      return { success: true, processed: 0, skipped: 0, message: 'No active weekly leaderboard' };
    }

    // Find the Top-10 boundary score
    const top10Entry = await prisma.leaderboardEntry.findFirst({
      where: {
        leaderboardId: weeklyLeaderboard.id,
        rank: 10,
      },
      select: { score: true },
    });

    if (!top10Entry) {
      logger.info(`${label} Leaderboard has fewer than 10 entries — skipping proximity check`);
      return { success: true, processed: 0, skipped: 0, message: 'Fewer than 10 leaderboard entries' };
    }

    const top10Score = Number(top10Entry.score);
    const proximityFloor = top10Score - LEADERBOARD_PROXIMITY_POINTS;

    // Find users just outside Top-10 but within the proximity window
    const nearbyEntries = await prisma.leaderboardEntry.findMany({
      where: {
        leaderboardId: weeklyLeaderboard.id,
        rank: { gt: 10 },
        score: { gte: proximityFloor },
      },
      select: {
        userId: true,
        rank: true,
        score: true,
      },
      orderBy: { rank: 'asc' },
      take: LEADERBOARD_SCAN_LIMIT,
    });

    if (nearbyEntries.length === 0) {
      logger.info(`${label} No users within proximity window`);
      return { success: true, processed: 0, skipped: 0, message: 'No users near Top-10' };
    }

    let processed = 0;
    let skipped = 0;

    for (const entry of nearbyEntries) {
      const pointsAway = Math.round(top10Score - Number(entry.score));

      try {
        await sendNotification({
          userId: entry.userId,
          category: NotificationCategory.LEADERBOARD,
          templateId: 'leaderboard.proximity',
          variables: {
            pointsAway,
            targetRank: 10,
          },
          dedupeKey: `leaderboard-proximity:${entry.userId}:${weeklyLeaderboard.id}`,
        });
        processed++;
      } catch (sendError) {
        logger.error(`${label} Error sending to user ${entry.userId}`, { sendError });
        skipped++;
      }
    }

    logger.info(`${label} Complete`, { processed, skipped, nearbyCount: nearbyEntries.length });
    return {
      success: true,
      processed,
      skipped,
      message: `Sent ${processed} leaderboard proximity alert(s)`,
    };
  } catch (error) {
    logger.error(`${label} Scan failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Scan failed: ${String(error)}` };
  }
}

// =====================================================
// processExpoReceipts
// =====================================================

/**
 * Collect Expo ticket IDs from recent NotificationSendLog rows with
 * status=SENT and a non-null expoTicketId, then call checkExpoReceipts()
 * to verify delivery and handle DeviceNotRegistered token deactivation.
 *
 * Expo makes receipts available ~15 minutes after ticket issuance, so
 * this job runs every 15 minutes and looks back up to RECEIPT_LOOKBACK_HOURS.
 *
 * Only processes RECEIPT_CHECK_BATCH_SIZE tickets per run to bound
 * request payload size and avoid Expo API throttling.
 */
export async function processExpoReceipts(): Promise<ProcessorResult> {
  const label = '[NotificationScheduler][expo-receipts]';

  try {
    const lookbackCutoff = new Date(Date.now() - RECEIPT_LOOKBACK_HOURS * 60 * 60_000);

    const pendingLogs = await prisma.notificationSendLog.findMany({
      where: {
        status: 'SENT',
        expoTicketId: { not: null },
        createdAt: { gte: lookbackCutoff },
      },
      select: { expoTicketId: true },
      orderBy: { createdAt: 'asc' },
      take: RECEIPT_CHECK_BATCH_SIZE,
    });

    if (pendingLogs.length === 0) {
      logger.debug(`${label} No pending tickets to check`);
      return { success: true, processed: 0, skipped: 0, message: 'No pending Expo tickets' };
    }

    // expoTicketId is guaranteed non-null by the WHERE clause above
    const ticketIds = pendingLogs
      .map((log) => log.expoTicketId)
      .filter((id): id is string => id !== null);

    await checkExpoReceipts(ticketIds);

    logger.info(`${label} Checked ${ticketIds.length} Expo receipt(s)`);
    return {
      success: true,
      processed: ticketIds.length,
      skipped: 0,
      message: `Checked ${ticketIds.length} Expo receipt(s)`,
    };
  } catch (error) {
    logger.error(`${label} Receipt check failed`, { error });
    return { success: false, processed: 0, skipped: 0, message: `Receipt check failed: ${String(error)}` };
  }
}

// =====================================================
// processDeferredNotifications
// =====================================================

/**
 * Process notifications that were deferred by the gatekeeper
 * (e.g., quiet-hours suppressed HIGH urgency items that should
 * be re-attempted once the quiet window ends).
 *
 * NOT YET IMPLEMENTED. Currently a placeholder that logs and returns
 * a no-op result. The deferred delivery pipeline requires a dedicated
 * schema column (deferredUntil) on NotificationSendLog and a targeted
 * re-send path through sendNotification() that bypasses the dedupe
 * check. Implement when the deferred-delivery spec is finalised.
 */
export async function processDeferredNotifications(): Promise<ProcessorResult> {
  logger.info('[NotificationScheduler][deferred] Deferred notification processing not yet implemented');
  return {
    success: true,
    processed: 0,
    skipped: 0,
    message: 'Deferred notification processing not yet implemented',
  };
}
