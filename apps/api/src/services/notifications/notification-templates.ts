// =====================================================
// Notification Template Library
// =====================================================
// All notification message templates with variable interpolation.
// Templates are localization-ready: string keys, no hardcoded text
// in services. Add new templates here; services stay unchanged.
//
// SECURITY: No sensitive financial data in templates.
// All content is safe for lock-screen display.
//
// VARIABLE FORMAT: {variableName} — replaced at render time.
// Unresolved variables are left as-is (never throw on missing vars).

import { NotificationCategory } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

export interface NotificationTemplate {
  /** Short, prominent text shown as the notification title */
  title: string;
  /** Main notification body — safe for lock screen */
  body: string;
  /** Icon variant key for the mobile client to resolve */
  iconType: string;
}

// =====================================================
// Template Definitions
// =====================================================

export const TEMPLATES: Record<string, NotificationTemplate> = {
  // ---- HIGH URGENCY: Settlement ----
  'settlement.win': {
    title: 'Victory! You Won!',
    body: 'Your slip just hit vs {opponentName}! Open to see your earnings.',
    iconType: 'win',
  },
  'settlement.loss': {
    title: 'Match Complete',
    body: '{opponentName} won this time. Better luck next match!',
    iconType: 'loss',
  },
  'settlement.draw': {
    title: "It's a Draw!",
    body: 'You tied with {opponentName}. Stakes returned.',
    iconType: 'draw',
  },

  // ---- HIGH URGENCY: PvP Challenge ----
  'pvp_challenge.received': {
    title: 'Challenge Received!',
    body: "{challengerName} just challenged you to a head-to-head on tonight's {eventDescription}",
    iconType: 'challenge',
  },
  'pvp_challenge.friend': {
    title: 'Friend Challenge!',
    body: '{challengerName} wants to battle — accept before the invite expires',
    iconType: 'challenge',
  },

  // ---- HIGH URGENCY: Slip Expiring ----
  'slip_expiring.warning': {
    title: 'Slip Locks Soon!',
    body: 'Your slip locks in {minutesRemaining} minutes — finalize or lose your entry',
    iconType: 'warning',
  },

  // ---- MEDIUM URGENCY: Game Reminder ----
  'game_reminder.upcoming': {
    title: 'Games Starting Soon',
    body: '{gameCount} games tip off in {hoursRemaining} hours — build your slip before lock',
    iconType: 'reminder',
  },

  // ---- MEDIUM URGENCY: Social ----
  'social.friend_parlay': {
    title: 'Rival Activity',
    body: 'Your friend @{friendName} just built a {legCount}-leg parlay — think you can beat it?',
    iconType: 'social',
  },
  'social.friend_request': {
    title: 'New Friend Request',
    body: '@{friendName} wants to be your rival',
    iconType: 'social',
  },

  // ---- MEDIUM URGENCY: Leaderboard ----
  'leaderboard.proximity': {
    title: 'Leaderboard Alert',
    body: "You're {pointsAway} points away from Top {targetRank} on this week's leaderboard",
    iconType: 'leaderboard',
  },

  // ---- LOW URGENCY: Daily Digest ----
  'daily_digest.evening': {
    title: "Tonight's Slate",
    body: "Tonight's slate: {gameCount} {sport} games. Your rivals are already building.",
    iconType: 'digest',
  },

  // ---- LOW URGENCY: Weekly Recap ----
  'weekly_recap.summary': {
    title: 'Your Weekly Recap',
    body: 'Last week you went {wins}-{losses}. You climbed {spotsClimbed} spots on the leaderboard.',
    iconType: 'recap',
  },

  // ---- LOW URGENCY: Win Streak ----
  'win_streak.milestone': {
    title: 'Streak Alert!',
    body: "You've hit {streakCount} slips in a row — keep the streak alive tonight",
    iconType: 'streak',
  },

  // ---- LOW URGENCY: Anti-Churn ----
  'inactivity.48h': {
    title: 'Missing in Action',
    body: "You're slipping on the leaderboard — defend your spot",
    iconType: 'alert',
  },
  'inactivity.7d': {
    title: 'We Miss You!',
    body: "Your rivals have been climbing the leaderboard. Come back and defend your spot.",
    iconType: 'alert',
  },
  'inactivity.friend_rejoined': {
    title: 'Rival Alert',
    body: 'Your rival @{friendName} just came back. Show them what they missed.',
    iconType: 'social',
  },
};

// =====================================================
// Template Category Mapping
// =====================================================

/**
 * Maps each NotificationCategory to the set of template IDs it owns.
 * Used to validate that a given templateId is appropriate for its category
 * and to enumerate all templates that belong to a suppressed category.
 */
export const CATEGORY_TEMPLATES: Record<NotificationCategory, string[]> = {
  [NotificationCategory.SETTLEMENT]: ['settlement.win', 'settlement.loss', 'settlement.draw'],
  [NotificationCategory.PVP_CHALLENGE]: ['pvp_challenge.received', 'pvp_challenge.friend'],
  [NotificationCategory.SLIP_EXPIRING]: ['slip_expiring.warning'],
  [NotificationCategory.GAME_REMINDER]: ['game_reminder.upcoming'],
  [NotificationCategory.SOCIAL]: ['social.friend_parlay', 'social.friend_request'],
  [NotificationCategory.LEADERBOARD]: ['leaderboard.proximity'],
  [NotificationCategory.DAILY_DIGEST]: ['daily_digest.evening'],
  [NotificationCategory.WEEKLY_RECAP]: ['weekly_recap.summary'],
  [NotificationCategory.WIN_STREAK]: ['win_streak.milestone'],
  [NotificationCategory.INACTIVITY]: [
    'inactivity.48h',
    'inactivity.7d',
    'inactivity.friend_rejoined',
  ],
};

// =====================================================
// Template Rendering
// =====================================================

/**
 * Render a notification template with variable substitution.
 *
 * Variables are expressed as {variableName} in template strings.
 * If a variable is present in the template but absent from the
 * `variables` map, the placeholder is left unchanged — no throw,
 * no silent empty string. This makes missing-variable bugs visible
 * in QA without crashing production sends.
 *
 * @param templateId - Key into the TEMPLATES map (e.g., 'settlement.win')
 * @param variables - Key-value substitution map (values coerced to string)
 * @returns Rendered NotificationTemplate with title, body, and iconType
 * @throws Error if templateId is not found — callers must use valid keys
 */
export function renderTemplate(
  templateId: string,
  variables: Record<string, string | number>,
): NotificationTemplate {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown notification template: "${templateId}"`);
  }

  const interpolate = (text: string): string =>
    text.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = variables[key];
      // Leave placeholder intact when variable not provided
      return value !== undefined ? String(value) : match;
    });

  return {
    title: interpolate(template.title),
    body: interpolate(template.body),
    iconType: template.iconType,
  };
}
