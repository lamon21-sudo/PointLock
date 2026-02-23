// =====================================================
// Notification Service (Gatekeeper + Sender)
// =====================================================
// Central orchestrator for all notification delivery.
// Every notification — real-time or scheduled — flows through here.
//
// Pipeline:
//   1. Render template
//   2. Run gatekeeper checks (master, category, dedupe, quiet hours, cap)
//   3. Route: send / inbox-only / defer / drop
//
// SECURITY: No sensitive data in payloads. Fire-and-forget pattern.

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { trackEvent } from '../../utils/analytics';
import { config } from '../../config';
import { getRedisConnection } from '../../queues/connection';
import { Prisma } from '@prisma/client';
import type { NotificationPreference } from '@prisma/client';
import {
  NotificationCategory,
  NotificationUrgency,
  NotificationStatus,
} from '@pick-rivals/shared-types';
import type { ExpoPushMessage } from '@pick-rivals/shared-types';
import { getCategoryConfig } from './notification-categories';
import type { CategoryConfig } from './notification-categories';
import { renderTemplate } from './notification-templates';
import type { NotificationTemplate } from './notification-templates';
import { isInQuietHours, getLocalDate, resolveTimezone } from './timezone.utils';
import {
  sendExpoPushBatch,
  getActiveTokensForUser,
} from './expo-push.service';

// =====================================================
// Types
// =====================================================

export interface NotificationRequest {
  userId: string;
  category: NotificationCategory;
  templateId: string;
  variables: Record<string, string | number>;
  entityId?: string;
  dedupeKey?: string;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

type GatekeeperReason =
  | 'allowed'
  | 'feature_disabled'
  | 'master_disabled'
  | 'category_disabled'
  | 'dedupe'
  | 'quiet_hours'
  | 'cap_exceeded';

interface GatekeeperResult {
  allowed: boolean;
  reason: GatekeeperReason;
}

// =====================================================
// Cache Keys
// =====================================================

const DEDUPE_PREFIX = 'notif:dedupe:';
const CAP_PREFIX = 'notif:cap:';
const PREF_CACHE_PREFIX = 'notif:pref:';
const PREF_CACHE_TTL_SECONDS = 300; // 5 minutes

// =====================================================
// Public API
// =====================================================

/**
 * Send a notification through the full gatekeeper pipeline.
 * This is the ONLY public entry point for sending notifications.
 *
 * The function is intentionally non-throwing: all errors are caught
 * and logged internally so that a notification failure never surfaces
 * to the calling job or HTTP handler.
 */
export async function sendNotification(request: NotificationRequest): Promise<void> {
  const startMs = Date.now();
  const categoryConfig = getCategoryConfig(request.category);

  // ---- Feature flag: kill-switch for the entire notification subsystem ----
  if (!config.notifications.enabled) {
    logger.debug('[Notification] Feature disabled globally, skipping', {
      userId: request.userId,
      category: request.category,
    });
    return;
  }

  try {
    // ---- 1. Render template first — fail fast on unknown templateId ----
    const rendered = renderTemplate(request.templateId, request.variables);

    // ---- 2. Build dedupe key ----
    const dedupeKey =
      request.dedupeKey ??
      `${request.category}:${request.userId}:${request.entityId ?? 'none'}`;

    // ---- 3. Resolve deep link URL from category pattern ----
    const deepLinkUrl = categoryConfig.deepLinkPattern.replace(
      '{entityId}',
      request.entityId ?? '',
    );

    // ---- 4. Run gatekeeper ----
    const gateResult = await checkGatekeeper(request.userId, request.category, dedupeKey);

    // ---- 5. Route based on gatekeeper outcome ----
    if (gateResult.allowed) {
      await handleAllowed(request, rendered, dedupeKey, deepLinkUrl, categoryConfig);
    } else if (gateResult.reason === 'quiet_hours') {
      await handleQuietHours(request, rendered, dedupeKey, deepLinkUrl);
    } else if (gateResult.reason === 'cap_exceeded') {
      await handleCapExceeded(request, rendered, dedupeKey, deepLinkUrl, categoryConfig);
    } else {
      await handleSuppressed(request, rendered, dedupeKey, gateResult.reason);
    }

    const durationMs = Date.now() - startMs;
    logger.info('[Notification] Processed', {
      userId: request.userId,
      category: request.category,
      templateId: request.templateId,
      result: gateResult.reason,
      durationMs,
    });
  } catch (error) {
    logger.error('[Notification] Failed to process', {
      userId: request.userId,
      category: request.category,
      templateId: request.templateId,
      error,
    });
  }
}

// =====================================================
// Gatekeeper
// =====================================================

async function checkGatekeeper(
  userId: string,
  category: NotificationCategory,
  dedupeKey: string,
): Promise<GatekeeperResult> {
  const categoryConfig = getCategoryConfig(category);

  // ---- 1. Load user preferences (Redis-cached) ----
  const prefs = await getCachedPreferences(userId);
  if (!prefs) {
    // New user with no preference row yet — default is all-on
    return { allowed: true, reason: 'allowed' };
  }

  // ---- 2. Master switch ----
  if (!prefs.allNotificationsEnabled) {
    return { allowed: false, reason: 'master_disabled' };
  }

  // ---- 3. Per-category toggle ----
  const prefField = categoryConfig.preferenceField as keyof typeof prefs;
  if (prefs[prefField] === false) {
    return { allowed: false, reason: 'category_disabled' };
  }

  // ---- 4. Deduplication (atomic Redis SETNX) ----
  const isDupe = await checkDedupe(dedupeKey, categoryConfig.dedupeWindowMs);
  if (isDupe) {
    return { allowed: false, reason: 'dedupe' };
  }

  // ---- Fetch user timezone once (shared by quiet hours + daily cap) ----
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = resolveTimezone(user?.timezone);

  // ---- 5. Quiet hours (bypass for HIGH urgency — settlements, challenges, slip expiry) ----
  if (prefs.quietHoursEnabled && categoryConfig.urgency !== NotificationUrgency.HIGH) {
    const inQuiet = isInQuietHours(timezone, prefs.quietHoursStart, prefs.quietHoursEnd);
    if (inQuiet) {
      return { allowed: false, reason: 'quiet_hours' };
    }
  }

  // ---- 6. Daily notification cap ----
  const capExceeded = await checkDailyCap(userId, timezone);
  if (capExceeded) {
    return { allowed: false, reason: 'cap_exceeded' };
  }

  return { allowed: true, reason: 'allowed' };
}

// =====================================================
// Gatekeeper Helpers
// =====================================================

/**
 * Fetch user notification preferences from Redis cache, falling back to DB.
 * Returns null when the user has no preference record (new users).
 *
 * The Redis cache stores a JSON-serialised Prisma NotificationPreference row.
 * We cast the parsed JSON to that type — the shape is stable because we
 * control what gets written into the cache (always from the same Prisma select).
 */
async function getCachedPreferences(userId: string): Promise<NotificationPreference | null> {
  const cacheKey = `${PREF_CACHE_PREFIX}${userId}`;

  try {
    const redis = getRedisConnection();
    const cached = await redis.get(cacheKey);

    if (cached) {
      // Safe cast: we wrote this value from a Prisma NotificationPreference row
      return JSON.parse(cached) as NotificationPreference;
    }

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (prefs) {
      await redis.set(cacheKey, JSON.stringify(prefs), 'EX', PREF_CACHE_TTL_SECONDS);
    }

    return prefs;
  } catch (error) {
    // Redis failure is non-fatal: fall back to DB directly
    logger.warn('[Notification] Redis preference cache unavailable, falling back to DB', {
      userId,
      error,
    });
    return prisma.notificationPreference.findUnique({ where: { userId } });
  }
}

/**
 * Attempt to set a dedupe key in Redis with atomic NX semantics.
 * Returns true if the key already existed (duplicate), false if newly set (allow).
 * On Redis failure, allows the notification through to avoid silent drops.
 */
async function checkDedupe(dedupeKey: string, windowMs: number): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const key = `${DEDUPE_PREFIX}${dedupeKey}`;
    // SET NX PX: set only if not exists, expire after windowMs
    const wasSet = await redis.set(key, '1', 'PX', windowMs, 'NX');
    // wasSet === null means the key already existed — this is a duplicate
    return wasSet === null;
  } catch (error) {
    logger.warn('[Notification] Dedupe check failed, allowing through', {
      dedupeKey,
      error,
    });
    return false;
  }
}

/**
 * Atomically check-and-increment the user's daily notification counter in Redis.
 * Returns true if the cap has been reached, false if there is remaining budget.
 *
 * Uses a Lua script to make the INCR-check-DECR cycle a single atomic operation,
 * eliminating the race condition where concurrent calls could both increment
 * past the cap before either has a chance to decrement.
 *
 * On Redis failure, allows the notification through to avoid silent drops.
 */
const DAILY_CAP_LUA = `
local key = KEYS[1]
local cap = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
if count > cap then
  redis.call('DECR', key)
  return 1
end
return 0
`;

async function checkDailyCap(userId: string, timezone: string): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const localDate = getLocalDate(timezone);
    const key = `${CAP_PREFIX}${userId}:${localDate}`;
    const cap = config.notifications.dailyCap;

    // Atomic: INCR → check → DECR-if-over in a single Lua eval
    const result = await redis.eval(DAILY_CAP_LUA, 1, key, cap, 172_800);

    return result === 1;
  } catch (error) {
    logger.warn('[Notification] Daily cap check failed, allowing through', {
      userId,
      error,
    });
    return false;
  }
}

// =====================================================
// Route Handlers
// =====================================================

/**
 * Notification passed all gatekeeper checks.
 * Send push to all active device tokens and write inbox item.
 */
async function handleAllowed(
  request: NotificationRequest,
  rendered: NotificationTemplate,
  dedupeKey: string,
  deepLinkUrl: string,
  categoryConfig: CategoryConfig,
): Promise<void> {
  // ---- Get all active device tokens for this user ----
  const tokens = await getActiveTokensForUser(request.userId);

  if (tokens.length === 0) {
    logger.debug('[Notification] No active push tokens for user', {
      userId: request.userId,
    });
  }

  // ---- Build one Expo message per device ----
  // ExpoPushMessage.data is typed as SettlementNotificationData in shared-types.
  // The notification system uses a broader NotificationPayload shape, so we cast
  // here at the boundary rather than widen the shared type for all consumers.
  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title: rendered.title,
    body: rendered.body,
    data: {
      type: request.category,
      entityId: request.entityId,
      deepLinkUrl,
      category: request.category,
    } as unknown as import('@pick-rivals/shared-types').SettlementNotificationData,
    sound: 'default' as const,
    priority: categoryConfig.urgency === NotificationUrgency.HIGH ? 'high' : 'normal',
    ttl: categoryConfig.ttlSeconds,
    channelId: categoryConfig.androidChannelId,
  }));

  // ---- Send via Expo Push API ----
  let pushResults: Awaited<ReturnType<typeof sendExpoPushBatch>> = [];
  if (messages.length > 0) {
    pushResults = await sendExpoPushBatch(messages);

    const failures = pushResults.filter((r) => !r.success);
    if (failures.length > 0) {
      logger.warn('[Notification] One or more push sends failed', {
        userId: request.userId,
        failed: failures.length,
        total: pushResults.length,
      });
    }
  }

  const inboxExpiry = new Date(
    Date.now() + config.notifications.inboxExpiryDays * 86_400_000,
  );

  // ---- Persist one SendLog per device token (for targeted receipt deactivation) ----
  const sendLogWrites =
    pushResults.length > 0
      ? pushResults.map((result) =>
          prisma.notificationSendLog.create({
            data: {
              userId: request.userId,
              category: request.category,
              urgency: categoryConfig.urgency,
              status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
              title: rendered.title,
              body: rendered.body,
              deepLinkType: request.category,
              entityId: request.entityId,
              expoTicketId: result.ticketId,
              deviceToken: result.token,
              dedupeKey,
              templateId: request.templateId,
              metadata: (request.metadata ?? {}) as Prisma.InputJsonValue,
              sentAt: new Date(),
            },
          }),
        )
      : [
          // No active tokens — still log the send attempt
          prisma.notificationSendLog.create({
            data: {
              userId: request.userId,
              category: request.category,
              urgency: categoryConfig.urgency,
              status: NotificationStatus.SENT,
              title: rendered.title,
              body: rendered.body,
              deepLinkType: request.category,
              entityId: request.entityId,
              dedupeKey,
              templateId: request.templateId,
              metadata: (request.metadata ?? {}) as Prisma.InputJsonValue,
              sentAt: new Date(),
            },
          }),
        ];

  // ---- Persist send logs and inbox item in parallel ----
  await Promise.all([
    ...sendLogWrites,
    prisma.notificationInboxItem.create({
      data: {
        userId: request.userId,
        category: request.category,
        urgency: categoryConfig.urgency,
        title: rendered.title,
        body: rendered.body,
        iconType: rendered.iconType,
        deepLinkType: request.category,
        entityId: request.entityId,
        deepLinkUrl,
        expiresAt: inboxExpiry,
      },
    }),
  ]);

  trackEvent({
    name: 'notification.sent',
    userId: request.userId,
    properties: {
      category: request.category,
      urgency: categoryConfig.urgency,
      templateId: request.templateId,
      deviceCount: tokens.length,
    },
  });
}

/**
 * Notification was blocked by quiet hours.
 * Write to inbox only — the user will see it when they next open the app.
 * No push is sent, no dedupe key is set (allow re-delivery after quiet window).
 */
async function handleQuietHours(
  request: NotificationRequest,
  rendered: NotificationTemplate,
  dedupeKey: string,
  deepLinkUrl: string,
): Promise<void> {
  const categoryConfig = getCategoryConfig(request.category);
  const inboxExpiry = new Date(
    Date.now() + config.notifications.inboxExpiryDays * 86_400_000,
  );

  await Promise.all([
    prisma.notificationInboxItem.create({
      data: {
        userId: request.userId,
        category: request.category,
        urgency: categoryConfig.urgency,
        title: rendered.title,
        body: rendered.body,
        iconType: rendered.iconType,
        deepLinkType: request.category,
        entityId: request.entityId,
        deepLinkUrl,
        expiresAt: inboxExpiry,
      },
    }),
    prisma.notificationSendLog.create({
      data: {
        userId: request.userId,
        category: request.category,
        urgency: categoryConfig.urgency,
        status: NotificationStatus.SUPPRESSED_QUIET,
        title: rendered.title,
        body: rendered.body,
        deepLinkType: request.category,
        entityId: request.entityId,
        dedupeKey,
        templateId: request.templateId,
        metadata: (request.metadata ?? {}) as Prisma.InputJsonValue,
      },
    }),
  ]);

  trackEvent({
    name: 'notification.suppressed',
    userId: request.userId,
    properties: { category: request.category, reason: 'quiet_hours' },
  });
}

/**
 * Notification was blocked because the user hit their daily cap.
 *
 * Routing by urgency:
 *   HIGH   — write to inbox (important enough to surface when app opens)
 *   MEDIUM — write to inbox
 *   LOW    — drop entirely (promotional/digest content; cap is the signal to stop)
 */
async function handleCapExceeded(
  request: NotificationRequest,
  rendered: NotificationTemplate,
  dedupeKey: string,
  deepLinkUrl: string,
  categoryConfig: CategoryConfig,
): Promise<void> {
  const inboxExpiry = new Date(
    Date.now() + config.notifications.inboxExpiryDays * 86_400_000,
  );

  const inboxWrites: Promise<unknown>[] = [];

  // ---- HIGH and MEDIUM urgency: preserve in inbox ----
  if (
    categoryConfig.urgency === NotificationUrgency.HIGH ||
    categoryConfig.urgency === NotificationUrgency.MEDIUM
  ) {
    inboxWrites.push(
      prisma.notificationInboxItem.create({
        data: {
          userId: request.userId,
          category: request.category,
          urgency: categoryConfig.urgency,
          title: rendered.title,
          body: rendered.body,
          iconType: rendered.iconType,
          deepLinkType: request.category,
          entityId: request.entityId,
          deepLinkUrl,
          expiresAt: inboxExpiry,
        },
      }),
    );
  }
  // LOW urgency: drop entirely — no inbox write, no retry

  await Promise.all([
    ...inboxWrites,
    prisma.notificationSendLog.create({
      data: {
        userId: request.userId,
        category: request.category,
        urgency: categoryConfig.urgency,
        status: NotificationStatus.SUPPRESSED_CAP,
        title: rendered.title,
        body: rendered.body,
        deepLinkType: request.category,
        entityId: request.entityId,
        dedupeKey,
        templateId: request.templateId,
        metadata: (request.metadata ?? {}) as Prisma.InputJsonValue,
      },
    }),
  ]);

  trackEvent({
    name: 'notification.suppressed',
    userId: request.userId,
    properties: { category: request.category, reason: 'cap_exceeded' },
  });
}

/**
 * Notification was blocked by master switch, category toggle, dedupe, or
 * the global feature flag. No inbox write — the user explicitly opted out
 * or the event was a duplicate. Log only for audit/analytics.
 */
async function handleSuppressed(
  request: NotificationRequest,
  rendered: NotificationTemplate,
  dedupeKey: string,
  reason: GatekeeperReason,
): Promise<void> {
  const categoryConfig = getCategoryConfig(request.category);

  const statusMap: Partial<Record<GatekeeperReason, NotificationStatus>> = {
    master_disabled: NotificationStatus.SUPPRESSED_DISABLED,
    category_disabled: NotificationStatus.SUPPRESSED_DISABLED,
    feature_disabled: NotificationStatus.SUPPRESSED_DISABLED,
    dedupe: NotificationStatus.SUPPRESSED_DEDUPE,
  };

  const status = statusMap[reason] ?? NotificationStatus.SUPPRESSED_DISABLED;

  await prisma.notificationSendLog.create({
    data: {
      userId: request.userId,
      category: request.category,
      urgency: categoryConfig.urgency,
      status,
      title: rendered.title,
      body: rendered.body,
      deepLinkType: request.category,
      entityId: request.entityId,
      dedupeKey,
      templateId: request.templateId,
      metadata: (request.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  trackEvent({
    name: 'notification.suppressed',
    userId: request.userId,
    properties: { category: request.category, reason },
  });
}

// =====================================================
// Preference Cache Invalidation
// =====================================================

/**
 * Invalidate the cached notification preferences for a user.
 * Must be called whenever the preferences API updates the DB record,
 * otherwise the cache will serve stale data for up to PREF_CACHE_TTL_SECONDS.
 */
export async function invalidatePreferenceCache(userId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(`${PREF_CACHE_PREFIX}${userId}`);
    logger.debug('[Notification] Preference cache invalidated', { userId });
  } catch (error) {
    // Non-fatal: the cache will expire on its own within 5 minutes
    logger.warn('[Notification] Failed to invalidate preference cache', {
      userId,
      error,
    });
  }
}
