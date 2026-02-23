// =====================================================
// Analytics Event Name Constants
// =====================================================
// Central registry of all trackEvent() name strings.
// Keeping them here prevents string typos and makes
// rename refactors trivially safe.

export const ANALYTICS_EVENTS = {
  // ---- Onboarding walkthrough ----
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // ---- Demo slip ----
  DEMO_SLIP_STARTED: 'demo_slip_started',
  DEMO_SLIP_PICK_ADDED: 'demo_slip_pick_added',
  DEMO_SLIP_COMPLETED: 'demo_slip_completed',
  DEMO_SLIP_SKIPPED: 'demo_slip_skipped',

  // ---- Contextual tooltips ----
  TOOLTIP_OPENED: 'tooltip_opened',
  TOOLTIP_LEARN_MORE: 'tooltip_learn_more',

  // ---- Signup bonus ----
  SIGNUP_BONUS_VIEWED: 'signup_bonus_viewed',

  // ---- Notification permissions ----
  NOTIFICATION_PERMISSION_PROMPTED: 'notification_permission_prompted',
  NOTIFICATION_PERMISSION_GRANTED: 'notification_permission_granted',
  NOTIFICATION_PERMISSION_DENIED: 'notification_permission_denied',

  // ---- Notification inbox ----
  NOTIFICATION_INBOX_OPENED: 'notification_inbox_opened',
  NOTIFICATION_ITEM_TAPPED: 'notification_item_tapped',
  NOTIFICATION_ITEM_READ: 'notification_item_read',
  NOTIFICATION_ALL_MARKED_READ: 'notification_all_marked_read',
  NOTIFICATION_ITEM_DELETED: 'notification_item_deleted',

  // ---- Notification preferences ----
  NOTIFICATION_PREFERENCES_OPENED: 'notification_preferences_opened',
  NOTIFICATION_PREFERENCE_TOGGLED: 'notification_preference_toggled',
  NOTIFICATION_QUIET_HOURS_TOGGLED: 'notification_quiet_hours_toggled',

  // ---- Push notification deep links ----
  NOTIFICATION_DEEP_LINK_RESOLVED: 'notification_deep_link_resolved',
  NOTIFICATION_DEEP_LINK_UNHANDLED: 'notification_deep_link_unhandled',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
