// =====================================================
// Slip Mapper Utility
// =====================================================
// Maps client-side DraftPick[] to API PickInput[] format.
// Ensures all required fields are present for submission.

import { DraftPick, SLIP_MAX_PICKS, SLIP_MIN_PICKS } from '../types/slip.types';

/**
 * API Pick input format (matches slips.schemas.ts on backend)
 */
export interface ApiPickInput {
  sportsEventId: string;
  pickType: string;
  selection: string;
  line?: number;
  odds: number;
  oddsDecimal?: number;
  pointValue: number;
  propType?: string;
  propPlayerId?: string;
  propPlayerName?: string;
}

/**
 * Create slip payload for API
 */
export interface CreateSlipPayload {
  name?: string;
  picks: ApiPickInput[];
  stake?: number;
}

/**
 * Convert American odds to decimal odds
 */
function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

/**
 * Map a single DraftPick to API format
 */
export function mapDraftPickToApiPick(pick: DraftPick): ApiPickInput {
  const apiPick: ApiPickInput = {
    sportsEventId: pick.sportsEventId,
    pickType: pick.pickType,
    selection: pick.selection,
    odds: pick.odds,
    oddsDecimal: americanToDecimal(pick.odds),
    pointValue: pick.pointValue,
  };

  // Add optional line for spread/total picks
  if (pick.line !== null && pick.line !== undefined) {
    apiPick.line = pick.line;
  }

  // Add prop-specific fields
  if (pick.propType) {
    apiPick.propType = pick.propType;
  }
  if (pick.propPlayerName) {
    apiPick.propPlayerName = pick.propPlayerName;
  }

  return apiPick;
}

/**
 * Map array of DraftPicks to API payload format
 */
export function mapDraftPicksToPayload(
  picks: DraftPick[],
  options?: { name?: string; stake?: number }
): CreateSlipPayload {
  return {
    name: options?.name,
    picks: picks.map(mapDraftPickToApiPick),
    stake: options?.stake ?? 0,
  };
}

/**
 * Check if an event has already started
 * Uses a 5-minute buffer to account for clock skew between client and server
 * @param scheduledAt - ISO date string of event start time
 * @returns true if event is still in the future (valid for betting)
 */
export function validateEventStartTime(scheduledAt: string): boolean {
  const eventTime = new Date(scheduledAt);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer for clock skew
  return eventTime.getTime() > (now.getTime() - bufferMs);
}

/**
 * Validate picks before submission
 * Returns array of validation errors, empty if valid
 */
export function validatePicksForSubmission(picks: DraftPick[]): string[] {
  const errors: string[] = [];

  // Check minimum picks
  if (picks.length < SLIP_MIN_PICKS) {
    errors.push(`At least ${SLIP_MIN_PICKS} pick is required`);
  }

  // Check maximum picks
  if (picks.length > SLIP_MAX_PICKS) {
    errors.push(`Maximum ${SLIP_MAX_PICKS} picks per slip`);
  }

  // Check each pick has required fields and event hasn't started
  picks.forEach((pick, index) => {
    if (!pick.sportsEventId) {
      errors.push(`Pick ${index + 1}: Missing event ID`);
    }
    if (!pick.pickType) {
      errors.push(`Pick ${index + 1}: Missing pick type`);
    }
    if (!pick.selection) {
      errors.push(`Pick ${index + 1}: Missing selection`);
    }
    if (typeof pick.odds !== 'number') {
      errors.push(`Pick ${index + 1}: Missing odds`);
    }
    if (typeof pick.pointValue !== 'number' || pick.pointValue < 0) {
      errors.push(`Pick ${index + 1}: Invalid point value`);
    }
    // Validate event hasn't started yet
    if (pick.eventInfo?.scheduledAt && !validateEventStartTime(pick.eventInfo.scheduledAt)) {
      errors.push(`Pick ${index + 1}: Event has already started`);
    }
  });

  return errors;
}

/**
 * Validate a single pick's event start time
 * @returns Error message if invalid, null if valid
 */
export function getPickValidationError(pick: DraftPick): string | null {
  if (pick.eventInfo?.scheduledAt && !validateEventStartTime(pick.eventInfo.scheduledAt)) {
    return 'Event has already started';
  }
  return null;
}
