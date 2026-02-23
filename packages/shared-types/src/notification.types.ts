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

// =====================================================
// Notification Categories & Preferences
// =====================================================

export enum NotificationCategory {
  SETTLEMENT = 'SETTLEMENT',
  PVP_CHALLENGE = 'PVP_CHALLENGE',
  SLIP_EXPIRING = 'SLIP_EXPIRING',
  SOCIAL = 'SOCIAL',
  GAME_REMINDER = 'GAME_REMINDER',
  LEADERBOARD = 'LEADERBOARD',
  DAILY_DIGEST = 'DAILY_DIGEST',
  WEEKLY_RECAP = 'WEEKLY_RECAP',
  WIN_STREAK = 'WIN_STREAK',
  INACTIVITY = 'INACTIVITY',
}

export enum NotificationUrgency {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum NotificationStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  SUPPRESSED_CAP = 'SUPPRESSED_CAP',
  SUPPRESSED_QUIET = 'SUPPRESSED_QUIET',
  SUPPRESSED_DISABLED = 'SUPPRESSED_DISABLED',
  SUPPRESSED_DEDUPE = 'SUPPRESSED_DEDUPE',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

export interface NotificationPreferenceDTO {
  settlementEnabled: boolean;
  pvpChallengeEnabled: boolean;
  slipExpiringEnabled: boolean;
  socialEnabled: boolean;
  gameReminderEnabled: boolean;
  leaderboardEnabled: boolean;
  dailyDigestEnabled: boolean;
  weeklyRecapEnabled: boolean;
  winStreakEnabled: boolean;
  inactivityEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  digestTimeLocal: string;
  recapDayOfWeek: number;
  allNotificationsEnabled: boolean;
}

export interface NotificationInboxItemDTO {
  id: string;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  title: string;
  body: string;
  iconType: string | null;
  deepLinkType: string;
  entityId: string | null;
  deepLinkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPayload {
  type: string;
  entityId?: string;
  deepLinkUrl?: string;
  category?: NotificationCategory;
}

export interface RegisterDeviceTokenDTO {
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  appVersion?: string;
}
