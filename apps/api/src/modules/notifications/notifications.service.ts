// =====================================================
// Notification Module Service (DB Operations)
// =====================================================
// CRUD operations for preferences, inbox items, and device tokens.
// This is distinct from the push-notification sender service at
// src/services/notifications/notification.service.ts.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { invalidatePreferenceCache } from '../../services/notifications/notification.service';
import type { UpdatePreferencesInput } from './notifications.schemas';

// =====================================================
// Return Types
// =====================================================

export type NotificationPreferenceRecord =
  Prisma.NotificationPreferenceGetPayload<Record<string, never>>;

export type NotificationInboxItemRecord =
  Prisma.NotificationInboxItemGetPayload<Record<string, never>>;

export interface PaginatedInbox {
  items: NotificationInboxItemRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// =====================================================
// Device Tokens
// =====================================================

/**
 * Register or reactivate a device push token for the given user.
 * Uses upsert on the (userId, token) compound unique key so re-registering
 * a token that already exists simply reactivates it rather than duplicating.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string,
  deviceId?: string,
  appVersion?: string,
): Promise<void> {
  await prisma.userDeviceToken.upsert({
    where: {
      userId_token: { userId, token },
    },
    update: {
      platform,
      deviceId,
      appVersion,
      isActive: true,
      lastUsedAt: new Date(),
      deactivatedAt: null,
    },
    create: {
      userId,
      token,
      platform,
      deviceId,
      appVersion,
    },
  });

  logger.info('[Notifications] Device token registered', { userId, platform });
}

/**
 * Soft-deactivate a device token.
 * Uses updateMany so a missing token is silently treated as a no-op —
 * DELETE requests are idempotent from the client's perspective.
 */
export async function removeDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  const result = await prisma.userDeviceToken.updateMany({
    where: { userId, token },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    },
  });

  logger.info('[Notifications] Device token deactivated', {
    userId,
    affected: result.count,
  });
}

// =====================================================
// Preferences
// =====================================================

/**
 * Retrieve notification preferences for the user.
 * Auto-creates a row with schema defaults if one does not exist yet.
 */
export async function getPreferences(
  userId: string,
): Promise<NotificationPreferenceRecord> {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/**
 * Merge the provided fields into the user's notification preferences.
 * Creates the preference row with schema defaults first if it does not exist.
 *
 * IMPORTANT: If a Redis preference cache is ever introduced, call the cache
 * invalidation helper immediately after this write. Stale cached preferences
 * will cause notifications to be silently suppressed for up to the TTL window.
 */
export async function updatePreferences(
  userId: string,
  updates: UpdatePreferencesInput,
): Promise<NotificationPreferenceRecord> {
  // Strip undefined fields so Prisma does not attempt to write NULL for
  // optional keys that were not included in the request payload.
  // We cast to the update input type for the update clause, and build a
  // separate plain-value create payload to avoid Prisma's union type
  // rejecting the spread of operation wrapper objects in the create clause.
  const sanitizedUpdate = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  ) as Prisma.NotificationPreferenceUpdateInput;

  // The create payload must be typed as the unchecked create input so that
  // Prisma accepts `userId` as a plain string alongside optional preference
  // fields. Spreading sanitizedUpdate here is safe because the only values
  // present are boolean | string | number literals — Prisma's update
  // operation wrappers (e.g. { set: true }) are only generated when Prisma
  // itself constructs them; our input from Zod is always a plain scalar.
  const sanitizedCreate = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  ) as Prisma.NotificationPreferenceUncheckedCreateInput;

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: sanitizedUpdate,
    create: { userId, ...sanitizedCreate },
  });

  // Invalidate Redis preference cache immediately so the gatekeeper
  // sees the updated values on the next notification attempt.
  await invalidatePreferenceCache(userId);

  logger.info('[Notifications] Preferences updated', { userId });

  return prefs;
}

// =====================================================
// Inbox
// =====================================================

/**
 * Fetch a paginated list of inbox items for the user.
 * Items are ordered newest-first to match mobile feed conventions.
 */
export async function getInbox(
  userId: string,
  page: number,
  limit: number,
  unreadOnly: boolean,
): Promise<PaginatedInbox> {
  const where: Prisma.NotificationInboxItemWhereInput = {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
    // Exclude expired items (expiresAt is nullable — null means no expiry)
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  };

  const [items, total] = await Promise.all([
    prisma.notificationInboxItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationInboxItem.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Mark a single inbox item as read.
 * Returns true when the item existed and belonged to the user, false otherwise.
 * The userId check prevents cross-user read-marking (broken access control).
 */
export async function markInboxItemRead(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const result = await prisma.notificationInboxItem.updateMany({
    where: { id: itemId, userId },
    data: { isRead: true, readAt: new Date() },
  });

  return result.count > 0;
}

/**
 * Mark every unread inbox item as read for the user in a single query.
 * Returns the number of records updated.
 */
export async function markAllInboxRead(userId: string): Promise<number> {
  const result = await prisma.notificationInboxItem.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  logger.info('[Notifications] All inbox items marked read', {
    userId,
    count: result.count,
  });

  return result.count;
}

/**
 * Return the count of unread inbox items for the user.
 * Drives notification badge counts on the client.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notificationInboxItem.count({
    where: {
      userId,
      isRead: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
}

/**
 * Hard-delete a single inbox item.
 * Returns true when the item existed and belonged to the user, false otherwise.
 * The userId filter prevents cross-user deletion (broken access control).
 */
export async function deleteInboxItem(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const result = await prisma.notificationInboxItem.deleteMany({
    where: { id: itemId, userId },
  });

  return result.count > 0;
}
