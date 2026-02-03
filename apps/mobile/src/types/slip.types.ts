// =====================================================
// Slip Builder Types (Client-Side)
// =====================================================
// Types for the local slip builder before submission to the API.
// These represent draft picks that haven't been persisted yet.

import { PickType, PickTier, MAX_PICKS_PER_SLIP, calculatePointValue } from '@pick-rivals/shared-types';

/**
 * A draft pick in the local slip builder.
 * This is a client-side representation before the slip is submitted.
 */
export interface DraftPick {
  /** Unique identifier for this draft pick (client-generated UUID) */
  id: string;
  /** The sports event this pick is for */
  sportsEventId: string;
  /** Type of bet: moneyline, spread, total, or prop */
  pickType: PickType;
  /** The selection made (e.g., "home", "away", "over", "under") */
  selection: string;
  /** Spread or total line value (null for moneyline) */
  line: number | null;
  /** American odds for this pick */
  odds: number;
  /** Point value this pick is worth (calculated from odds) */
  pointValue: number;
  /** Coin cost for this pick (from API, default 0) */
  coinCost: number;
  /** Tier required for this pick */
  tier: PickTier;
  /** Player name for prop bets */
  propPlayerName?: string;
  /** Prop type for prop bets (e.g., "passing_yards") */
  propType?: string;
  /** Event metadata for display purposes */
  eventInfo: DraftPickEventInfo;
}

/**
 * Event information attached to a draft pick for display.
 * Denormalized to avoid additional lookups when rendering the slip.
 */
export interface DraftPickEventInfo {
  homeTeamName: string;
  homeTeamAbbr?: string;
  awayTeamName: string;
  awayTeamAbbr?: string;
  scheduledAt: string; // ISO string for serialization
  sport: string;
  league: string;
}

/**
 * Input for adding a pick to the slip builder.
 * Used by UI components when user makes a selection.
 */
export interface AddPickInput {
  sportsEventId: string;
  pickType: PickType;
  selection: string;
  line: number | null;
  odds: number;
  /** Coin cost for this pick (from API or estimated) */
  coinCost?: number;
  /** Tier of this pick */
  tier?: PickTier;
  propPlayerName?: string;
  propType?: string;
  eventInfo: DraftPickEventInfo;
}

/**
 * Slip builder state for local persistence.
 */
export interface SlipBuilderState {
  picks: DraftPick[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// =====================================================
// Constants
// =====================================================

export const SLIP_BUILDER_STORAGE_KEY = 'slip-builder-draft';
export const SLIP_MAX_PICKS = MAX_PICKS_PER_SLIP;
export const SLIP_MIN_PICKS = 1;

// =====================================================
// Validation Helpers
// =====================================================

/**
 * Check if a pick can be added to the slip.
 * Returns an error message if invalid, null if valid.
 */
export function validateAddPick(
  existingPicks: DraftPick[],
  newPick: AddPickInput
): string | null {
  // Check max picks limit
  if (existingPicks.length >= SLIP_MAX_PICKS) {
    return `Maximum ${SLIP_MAX_PICKS} picks allowed per slip`;
  }

  // Check for duplicate pick on same event with same type/selection
  const isDuplicate = existingPicks.some(
    (pick) =>
      pick.sportsEventId === newPick.sportsEventId &&
      pick.pickType === newPick.pickType &&
      pick.selection === newPick.selection
  );

  if (isDuplicate) {
    return 'This pick is already in your slip';
  }

  // Check for conflicting picks on the same event
  // e.g., can't pick both home and away moneyline
  const hasConflict = existingPicks.some(
    (pick) =>
      pick.sportsEventId === newPick.sportsEventId &&
      pick.pickType === newPick.pickType &&
      pick.selection !== newPick.selection &&
      // Allow multiple prop bets if they're different prop types
      !(pick.pickType === 'prop' && pick.propType !== newPick.propType)
  );

  if (hasConflict) {
    return 'You already have a conflicting pick for this event';
  }

  return null;
}

/**
 * Calculate total point potential for a slip.
 */
export function calculateSlipPotential(picks: DraftPick[]): number {
  return picks.reduce((total, pick) => total + pick.pointValue, 0);
}

/**
 * Generate a unique ID for a draft pick.
 * Uses crypto.randomUUID if available, falls back to timestamp-based ID.
 */
export function generatePickId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `pick_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a DraftPick from input.
 */
export function createDraftPick(input: AddPickInput): DraftPick {
  return {
    id: generatePickId(),
    sportsEventId: input.sportsEventId,
    pickType: input.pickType,
    selection: input.selection,
    line: input.line,
    odds: input.odds,
    pointValue: calculatePointValue(input.odds),
    coinCost: input.coinCost ?? 0,
    tier: input.tier ?? PickTier.FREE,
    propPlayerName: input.propPlayerName,
    propType: input.propType,
    eventInfo: input.eventInfo,
  };
}
