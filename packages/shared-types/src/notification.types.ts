// =====================================================
// Notification Types
// =====================================================
// Type definitions for push notifications and settlement alerts.
// SECURITY: Payloads are designed to be safe for lock screen display.

/**
 * Settlement result for notification context.
 */
export type SettlementResult = 'WIN' | 'LOSS' | 'DRAW';

/**
 * Push notification payload for match settlement.
 * SECURITY: No sensitive financial data - visible on lock screen.
 */
export interface MatchSettledNotificationPayload {
  /** Notification type discriminator */
  type: 'MATCH_SETTLED';
  /** The settled match ID */
  matchId: string;
  /** Result from the recipient's perspective */
  result: SettlementResult;
  /** Display-safe opponent username */
  opponentUsername: string;
  /** Points earned by the recipient */
  pointsEarned: number;
  /** ISO timestamp of settlement */
  settledAt: string;
}

/**
 * Deep link data embedded in push notification for navigation.
 */
export interface NotificationDeepLinkData {
  /** Target screen identifier */
  screen: 'match';
  /** Navigation parameters */
  params: {
    id: string;
  };
}

/**
 * Combined notification data payload.
 */
export type SettlementNotificationData = MatchSettledNotificationPayload &
  NotificationDeepLinkData;

/**
 * Expo push notification message structure.
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */
export interface ExpoPushMessage {
  /** Expo push token (ExponentPushToken[...]) */
  to: string;
  /** Notification title (shown prominently) */
  title: string;
  /** Notification body text */
  body: string;
  /** Custom data payload for app handling */
  data?: SettlementNotificationData;
  /** Sound to play ('default' or null for silent) */
  sound?: 'default' | null;
  /** iOS badge number */
  badge?: number;
  /** Notification category for actions */
  categoryId?: string;
  /** Delivery priority */
  priority?: 'default' | 'normal' | 'high';
  /** Time-to-live in seconds */
  ttl?: number;
  /** Channel ID for Android */
  channelId?: string;
}

/**
 * Response from Expo Push API for a single notification.
 */
export interface ExpoPushTicket {
  /** Ticket status */
  status: 'ok' | 'error';
  /** Ticket ID for receipt lookup (only when status is 'ok') */
  id?: string;
  /** Error message (only when status is 'error') */
  message?: string;
  /** Error details */
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}

/**
 * WebSocket payload for match:settled event.
 * Broadcast to both participants when a match settles.
 */
export interface MatchSettledSocketPayload {
  /** The settled match ID */
  matchId: string;
  /** Settlement status */
  status: 'settled' | 'draw';
  /** Winner user ID (null if draw) */
  winnerId: string | null;
  /** Whether the match ended in a draw */
  isDraw: boolean;
  /** Creator's final point total */
  creatorPoints: number;
  /** Opponent's final point total */
  opponentPoints: number;
  /** Winner's payout amount as string (null if draw) */
  winnerPayout: string | null;
  /** ISO timestamp of settlement */
  settledAt: string;
  /** Human-readable settlement reason */
  reason: string;
}
