// =====================================================
// Notification Category Configuration
// =====================================================
// Defines all notification categories, urgency levels,
// cap priorities, dedupe windows, and deep link patterns.

// Re-export enums from shared types for convenience
export { NotificationCategory, NotificationUrgency } from '@pick-rivals/shared-types';
import { NotificationCategory, NotificationUrgency } from '@pick-rivals/shared-types';

// =====================================================
// Category Configuration
// =====================================================

export interface CategoryConfig {
  urgency: NotificationUrgency;
  defaultEnabled: boolean;
  androidChannelId: string;
  capPriority: number;
  dedupeWindowMs: number;
  ttlSeconds: number;
  deepLinkPattern: string;
  preferenceField: string;
}

export const CATEGORY_CONFIG: Record<NotificationCategory, CategoryConfig> = {
  [NotificationCategory.SETTLEMENT]: {
    urgency: NotificationUrgency.HIGH,
    defaultEnabled: true,
    androidChannelId: 'match-settlement',
    capPriority: 1,
    dedupeWindowMs: 60_000,
    ttlSeconds: 86400,
    deepLinkPattern: '/match/{entityId}',
    preferenceField: 'settlementEnabled',
  },
  [NotificationCategory.PVP_CHALLENGE]: {
    urgency: NotificationUrgency.HIGH,
    defaultEnabled: true,
    androidChannelId: 'pvp-challenge',
    capPriority: 2,
    dedupeWindowMs: 300_000,
    ttlSeconds: 86400,
    deepLinkPattern: '/challenge/join?code={entityId}',
    preferenceField: 'pvpChallengeEnabled',
  },
  [NotificationCategory.SLIP_EXPIRING]: {
    urgency: NotificationUrgency.HIGH,
    defaultEnabled: true,
    androidChannelId: 'slip-expiring',
    capPriority: 3,
    dedupeWindowMs: 600_000,
    ttlSeconds: 900,
    deepLinkPattern: '/slip/{entityId}',
    preferenceField: 'slipExpiringEnabled',
  },
  [NotificationCategory.GAME_REMINDER]: {
    urgency: NotificationUrgency.MEDIUM,
    defaultEnabled: true,
    androidChannelId: 'game-reminders',
    capPriority: 4,
    dedupeWindowMs: 7_200_000,
    ttlSeconds: 7200,
    deepLinkPattern: '/event/{entityId}',
    preferenceField: 'gameReminderEnabled',
  },
  [NotificationCategory.SOCIAL]: {
    urgency: NotificationUrgency.MEDIUM,
    defaultEnabled: true,
    androidChannelId: 'social',
    capPriority: 5,
    dedupeWindowMs: 3_600_000,
    ttlSeconds: 43200,
    deepLinkPattern: '/users/{entityId}',
    preferenceField: 'socialEnabled',
  },
  [NotificationCategory.LEADERBOARD]: {
    urgency: NotificationUrgency.MEDIUM,
    defaultEnabled: true,
    androidChannelId: 'leaderboard',
    capPriority: 6,
    dedupeWindowMs: 86_400_000,
    ttlSeconds: 43200,
    deepLinkPattern: '/(tabs)/leaderboard',
    preferenceField: 'leaderboardEnabled',
  },
  [NotificationCategory.DAILY_DIGEST]: {
    urgency: NotificationUrgency.LOW,
    defaultEnabled: true,
    androidChannelId: 'daily-digest',
    capPriority: 7,
    dedupeWindowMs: 86_400_000,
    ttlSeconds: 43200,
    deepLinkPattern: '/(tabs)/events',
    preferenceField: 'dailyDigestEnabled',
  },
  [NotificationCategory.WEEKLY_RECAP]: {
    urgency: NotificationUrgency.LOW,
    defaultEnabled: true,
    androidChannelId: 'weekly-recap',
    capPriority: 8,
    dedupeWindowMs: 604_800_000,
    ttlSeconds: 86400,
    deepLinkPattern: '/(tabs)/leaderboard',
    preferenceField: 'weeklyRecapEnabled',
  },
  [NotificationCategory.WIN_STREAK]: {
    urgency: NotificationUrgency.LOW,
    defaultEnabled: true,
    androidChannelId: 'win-streak',
    capPriority: 9,
    dedupeWindowMs: 86_400_000,
    ttlSeconds: 43200,
    deepLinkPattern: '/(tabs)/matches',
    preferenceField: 'winStreakEnabled',
  },
  [NotificationCategory.INACTIVITY]: {
    urgency: NotificationUrgency.LOW,
    defaultEnabled: true,
    androidChannelId: 're-engagement',
    capPriority: 10,
    dedupeWindowMs: 172_800_000,
    ttlSeconds: 86400,
    deepLinkPattern: '/(tabs)/home',
    preferenceField: 'inactivityEnabled',
  },
};

// =====================================================
// Helpers
// =====================================================

export function getCategoryConfig(category: NotificationCategory): CategoryConfig {
  return CATEGORY_CONFIG[category];
}

export function getUrgencyForCategory(category: NotificationCategory): NotificationUrgency {
  return CATEGORY_CONFIG[category].urgency;
}
