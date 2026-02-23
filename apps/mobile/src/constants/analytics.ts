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
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
