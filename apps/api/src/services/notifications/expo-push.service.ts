// =====================================================
// Expo Push Notification Service
// =====================================================
// Low-level HTTP client for the Expo Push API.
// Handles batching, receipt checking, and token deactivation.
//
// SECURITY: Fire-and-forget pattern — failures don't block callers.

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import type { ExpoPushMessage, ExpoPushTicket } from '@pick-rivals/shared-types';

// =====================================================
// Constants
// =====================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';

// =====================================================
// Types
// =====================================================

export interface ExpoPushResult {
  ticketId: string | null;
  token: string;
  success: boolean;
  error?: string;
}

interface ExpoReceiptResult {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

// =====================================================
// Token Validation
// =====================================================

/**
 * Check whether a token string is a valid Expo push token.
 * Invalid tokens are filtered before sending to avoid wasteful API calls.
 */
export function isValidExpoToken(token: string): boolean {
  return token.startsWith(EXPO_TOKEN_PREFIX) && token.endsWith(']');
}

// =====================================================
// Batch Sending
// =====================================================

/**
 * Send push notifications via the Expo Push API in batches of 100.
 * Expo enforces a hard limit of 100 messages per request.
 * Returns one ExpoPushResult per message, preserving order.
 */
export async function sendExpoPushBatch(
  messages: ExpoPushMessage[],
): Promise<ExpoPushResult[]> {
  if (messages.length === 0) return [];

  const results: ExpoPushResult[] = [];

  // ---- Chunk into EXPO_BATCH_SIZE slices ----
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const batchResults = await sendSingleBatch(batch);
    results.push(...batchResults);
  }

  return results;
}

async function sendSingleBatch(
  messages: ExpoPushMessage[],
): Promise<ExpoPushResult[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('[ExpoPush] API returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
      });
      // Map every message in the batch to a failure result
      return messages.map((m) => ({
        ticketId: null,
        token: m.to,
        success: false,
        error: `HTTP ${response.status}`,
      }));
    }

    const data = (await response.json()) as { data: ExpoPushTicket[] };

    return data.data.map((ticket, idx) => ({
      ticketId: ticket.status === 'ok' ? (ticket.id ?? null) : null,
      token: messages[idx].to,
      success: ticket.status === 'ok',
      error:
        ticket.status === 'error'
          ? ticket.details?.error ?? ticket.message ?? 'Unknown error'
          : undefined,
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[ExpoPush] Request timed out', {
        batchSize: messages.length,
      });
    } else {
      logger.error('[ExpoPush] Failed to send batch', { error });
    }
    // On any exception, mark every message in the batch as failed
    return messages.map((m) => ({
      ticketId: null,
      token: m.to,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

// =====================================================
// Receipt Checking
// =====================================================

/**
 * Check delivery receipts for previously sent notifications.
 * Expo makes receipts available ~15 minutes after ticket issuance.
 * Deactivates device tokens that return DeviceNotRegistered.
 */
export async function checkExpoReceipts(ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('[ExpoPush] Receipt check returned non-OK status', {
        status: response.status,
      });
      return;
    }

    const data = (await response.json()) as {
      data: Record<string, ExpoReceiptResult>;
    };

    // ---- Process each receipt entry ----
    for (const [ticketId, receipt] of Object.entries(data.data)) {
      if (receipt.status === 'error') {
        logger.warn('[ExpoPush] Receipt error', {
          ticketId,
          error: receipt.details?.error,
          message: receipt.message,
        });

        // Update send log with receipt failure status
        await prisma.notificationSendLog.updateMany({
          where: { expoTicketId: ticketId },
          data: {
            expoReceiptStatus: receipt.details?.error ?? 'error',
            status: 'FAILED',
          },
        });

        // DeviceNotRegistered means the token is permanently stale
        if (receipt.details?.error === 'DeviceNotRegistered') {
          await deactivateTokenByTicketId(ticketId);
        }
      } else {
        // Mark as delivered on successful receipt
        await prisma.notificationSendLog.updateMany({
          where: { expoTicketId: ticketId },
          data: {
            expoReceiptStatus: 'ok',
            status: 'DELIVERED',
          },
        });
      }
    }
  } catch (error) {
    logger.error('[ExpoPush] Failed to check receipts', { error });
  }
}

// =====================================================
// Token Management
// =====================================================

/**
 * Deactivate the specific device token that produced a DeviceNotRegistered receipt.
 *
 * Looks up the send log entry to find the exact `deviceToken` that was sent to,
 * then deactivates only that token. This avoids the blast radius of disabling
 * all of a user's active device tokens when only one device is stale.
 *
 * Falls back to deactivating all user tokens only when the send log does not
 * have a `deviceToken` recorded (pre-migration rows).
 */
async function deactivateTokenByTicketId(ticketId: string): Promise<void> {
  try {
    const sendLog = await prisma.notificationSendLog.findFirst({
      where: { expoTicketId: ticketId },
      select: { userId: true, deviceToken: true },
    });

    if (!sendLog) return;

    if (sendLog.deviceToken) {
      // Targeted deactivation: only the specific stale token
      logger.info('[ExpoPush] DeviceNotRegistered — deactivating specific token', {
        userId: sendLog.userId,
        ticketId,
        tokenPrefix: sendLog.deviceToken.slice(0, 20) + '...',
      });

      await prisma.userDeviceToken.updateMany({
        where: { userId: sendLog.userId, token: sendLog.deviceToken, isActive: true },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
        },
      });
    } else {
      // Fallback for pre-migration logs without deviceToken — deactivate all
      logger.warn('[ExpoPush] DeviceNotRegistered — no deviceToken on log, deactivating all user tokens', {
        userId: sendLog.userId,
        ticketId,
      });

      await prisma.userDeviceToken.updateMany({
        where: { userId: sendLog.userId, isActive: true },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
        },
      });
    }
  } catch (error) {
    logger.error('[ExpoPush] Failed to deactivate token by ticket ID', { error, ticketId });
  }
}

/**
 * Deactivate a specific device token (soft delete).
 * Called immediately when a send attempt returns DeviceNotRegistered inline.
 */
export async function deactivateToken(token: string): Promise<void> {
  try {
    await prisma.userDeviceToken.updateMany({
      where: { token, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });
    // Truncate token in logs — tokens are sensitive identifiers
    logger.info('[ExpoPush] Token deactivated', {
      tokenPrefix: token.slice(0, 20) + '...',
    });
  } catch (error) {
    logger.error('[ExpoPush] Failed to deactivate token', { error });
  }
}

/**
 * Get all active, valid Expo push tokens for a user.
 * Ordered by most recently used first, so the primary device is notified first.
 * Invalid token formats are stripped before returning.
 */
export async function getActiveTokensForUser(userId: string): Promise<string[]> {
  const tokens = await prisma.userDeviceToken.findMany({
    where: { userId, isActive: true },
    select: { token: true },
    orderBy: { lastUsedAt: 'desc' },
  });

  return tokens.map((t) => t.token).filter(isValidExpoToken);
}
