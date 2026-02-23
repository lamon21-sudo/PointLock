// =====================================================
// Push Notification Service
// =====================================================
// Sends push notifications via Expo Push Notification Service.
//
// SECURITY:
// - Only sends after DB transaction commits
// - No sensitive financial data in payloads
// - Idempotency via in-memory deduplication cache
//
// ARCHITECTURE:
// - Fire-and-forget pattern (failures don't block settlement)
// - Graceful degradation if service unavailable

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import type {
  SettlementResult,
  ExpoPushMessage,
  ExpoPushTicket,
} from '@pick-rivals/shared-types';

// =====================================================
// Constants
// =====================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';
const DEDUP_TTL_MS = 60000; // 1 minute
const REQUEST_TIMEOUT_MS = 5000;

// =====================================================
// In-Memory Deduplication Cache
// =====================================================

/**
 * Track recently sent notifications to prevent duplicates.
 * Key: `${matchId}:${userId}`
 * Value: timestamp when sent
 */
const recentlySent = new Map<string, number>();

/**
 * Check if notification was already sent for this match/user combo.
 */
function wasNotificationSent(matchId: string, userId: string): boolean {
  const key = `${matchId}:${userId}`;
  const cachedTime = recentlySent.get(key);

  if (cachedTime && Date.now() - cachedTime < DEDUP_TTL_MS) {
    return true;
  }

  return false;
}

/**
 * Mark notification as sent for deduplication.
 */
function markNotificationSent(matchId: string, userId: string): void {
  const key = `${matchId}:${userId}`;
  recentlySent.set(key, Date.now());

  // Cleanup old entries periodically to prevent memory bloat
  if (recentlySent.size > 1000) {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [k, v] of recentlySent) {
      if (v < cutoff) {
        recentlySent.delete(k);
      }
    }
  }
}

// =====================================================
// Database Helpers
// =====================================================

/**
 * Get Expo push token for a user.
 * Returns null if user has no token registered.
 */
async function getUserPushToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  return user?.fcmToken || null;
}

// =====================================================
// Message Building
// =====================================================

/**
 * Build user-friendly notification title and body based on result.
 */
function buildSettlementMessage(
  result: SettlementResult,
  opponentUsername: string,
  pointsEarned: number
): { title: string; body: string } {
  switch (result) {
    case 'WIN':
      return {
        title: 'Victory! You Won!',
        body: `You beat ${opponentUsername} with ${pointsEarned} points!`,
      };
    case 'LOSS':
      return {
        title: 'Match Complete',
        body: `${opponentUsername} won this time. Better luck next match!`,
      };
    case 'DRAW':
      return {
        title: "It's a Draw!",
        body: `You tied with ${opponentUsername}. Stakes returned.`,
      };
  }
}

// =====================================================
// Expo Push API
// =====================================================

/**
 * Send a push notification via Expo Push API.
 * Returns true if successful, false otherwise.
 */
async function sendExpoPushNotification(
  message: ExpoPushMessage
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('[PushNotification] Expo API returned non-OK status:', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }

    const data = (await response.json()) as { data: ExpoPushTicket[] };

    // Check for Expo-specific errors in the response
    if (data.data?.[0]?.status === 'error') {
      const ticket = data.data[0];
      logger.warn('[PushNotification] Expo ticket error:', {
        message: ticket.message,
        error: ticket.details?.error,
      });

      // Handle specific error types
      if (ticket.details?.error === 'DeviceNotRegistered') {
        // Token is invalid - could clear it from DB here if desired
        logger.info('[PushNotification] Device not registered, token may be stale');
      }

      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[PushNotification] Request timed out');
    } else {
      logger.error('[PushNotification] Failed to send:', error);
    }
    return false;
  }
}

// =====================================================
// Public API
// =====================================================

/**
 * Send settlement notification to a single user.
 *
 * CRITICAL: Only call this AFTER the settlement transaction has committed.
 *
 * @param userId - The user to notify
 * @param matchId - The settled match ID
 * @param result - WIN, LOSS, or DRAW from user's perspective
 * @param opponentUsername - Display name of opponent
 * @param pointsEarned - Points the user earned
 * @param settledAt - Settlement timestamp
 */
export async function sendSettlementNotification(
  userId: string,
  matchId: string,
  result: SettlementResult,
  opponentUsername: string,
  pointsEarned: number,
  settledAt: Date
): Promise<void> {
  // Idempotency check
  if (wasNotificationSent(matchId, userId)) {
    logger.debug(`[PushNotification] Skipping duplicate for ${matchId}:${userId}`);
    return;
  }

  // Get user's push token
  const pushToken = await getUserPushToken(userId);
  if (!pushToken) {
    logger.debug(`[PushNotification] No push token for user ${userId}`);
    return;
  }

  // Validate Expo push token format
  if (!pushToken.startsWith(EXPO_TOKEN_PREFIX)) {
    logger.warn(`[PushNotification] Invalid token format for user ${userId}`);
    return;
  }

  const { title, body } = buildSettlementMessage(result, opponentUsername, pointsEarned);

  const message: ExpoPushMessage = {
    to: pushToken,
    title,
    body,
    data: {
      type: 'MATCH_SETTLED',
      matchId,
      result,
      opponentUsername,
      pointsEarned,
      settledAt: settledAt.toISOString(),
      screen: 'match',
      params: { id: matchId },
    },
    sound: 'default',
    priority: 'high',
  };

  const success = await sendExpoPushNotification(message);

  if (success) {
    markNotificationSent(matchId, userId);
    logger.info('[PushNotification] Sent settlement notification', {
      userId,
      matchId,
      result,
    });
  }
}

/**
 * Send settlement notifications to both match participants.
 *
 * CRITICAL: Only call this AFTER the settlement transaction has committed.
 *
 * This function:
 * - Determines WIN/LOSS/DRAW result for each user
 * - Sends notifications in parallel
 * - Uses Promise.allSettled to ensure one failure doesn't block the other
 *
 * @param matchId - The settled match ID
 * @param creatorId - Creator user ID
 * @param opponentId - Opponent user ID
 * @param winnerId - Winner user ID (null if draw)
 * @param isDraw - Whether the match was a draw
 * @param creatorPoints - Creator's final points
 * @param opponentPoints - Opponent's final points
 * @param creatorUsername - Creator's display username
 * @param opponentUsername - Opponent's display username
 * @param settledAt - Settlement timestamp
 */
export async function sendMatchSettlementNotifications(
  matchId: string,
  creatorId: string,
  opponentId: string,
  winnerId: string | null,
  isDraw: boolean,
  creatorPoints: number,
  opponentPoints: number,
  creatorUsername: string,
  opponentUsername: string,
  settledAt: Date
): Promise<void> {
  // Determine results for each player
  let creatorResult: SettlementResult;
  let opponentResult: SettlementResult;

  if (isDraw) {
    creatorResult = 'DRAW';
    opponentResult = 'DRAW';
  } else if (winnerId === creatorId) {
    creatorResult = 'WIN';
    opponentResult = 'LOSS';
  } else {
    creatorResult = 'LOSS';
    opponentResult = 'WIN';
  }

  // Send notifications in parallel (fire and forget)
  const results = await Promise.allSettled([
    sendSettlementNotification(
      creatorId,
      matchId,
      creatorResult,
      opponentUsername,
      creatorPoints,
      settledAt
    ),
    sendSettlementNotification(
      opponentId,
      matchId,
      opponentResult,
      creatorUsername,
      opponentPoints,
      settledAt
    ),
  ]);

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const userId = index === 0 ? creatorId : opponentId;
      logger.error(`[PushNotification] Failed for user ${userId}:`, result.reason);
    }
  });
}
