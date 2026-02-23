// =====================================================
// Notification Services - Barrel Export
// =====================================================

// Core notification service (gatekeeper + sender)
export { sendNotification, invalidatePreferenceCache } from './notification.service';
export type { NotificationRequest } from './notification.service';

// Expo Push API client
export {
  sendExpoPushBatch,
  checkExpoReceipts,
  deactivateToken,
  getActiveTokensForUser,
  isValidExpoToken,
} from './expo-push.service';

// Categories & configuration
export {
  NotificationCategory,
  NotificationUrgency,
  CATEGORY_CONFIG,
  getCategoryConfig,
  getUrgencyForCategory,
} from './notification-categories';

// Templates
export { renderTemplate, TEMPLATES, CATEGORY_TEMPLATES } from './notification-templates';

// Timezone utilities
export {
  isInQuietHours,
  getLocalDate,
  getLocalHour,
  getLocalTime,
  getLocalDayOfWeek,
  isLocalHourMatch,
  resolveTimezone,
  parseHHMM,
} from './timezone.utils';

// Scheduler processors
export * from './notification-scheduler.service';

// Legacy service (kept for fallback when FEATURE_NOTIFICATIONS_ENABLED=false)
export {
  sendSettlementNotification,
  sendMatchSettlementNotifications,
} from './push-notification.service.legacy';
