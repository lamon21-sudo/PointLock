// =====================================================
// Settlement Helpers
// =====================================================
// Client-side pick settlement calculation utilities.
// Derives pick outcomes from completed event scores.
//
// These helpers enable the mobile app to show immediate
// settlement feedback before the backend processes it.

import type { EventScore } from '../hooks/useMatchSocket';

// =====================================================
// Types
// =====================================================

export type PickStatus = 'PENDING' | 'HIT' | 'MISS' | 'PUSH' | 'VOID';
export type PickType = 'moneyline' | 'spread' | 'total' | 'prop';

export interface PickForSettlement {
  id: string;
  sportsEventId: string;
  pickType: PickType;
  selection: string;
  line: number | null;
  pointValue: number;
  status: PickStatus;
  event?: {
    id: string;
    homeTeamName: string;
    awayTeamName: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}

export interface SettlementResult {
  pickId: string;
  eventId: string;
  status: PickStatus;
  previousStatus: PickStatus;
  pointValue: number;
  pickDetails: {
    teamName: string;
    pickType: string;
    selection: string;
  };
  timestamp: string;
}

// =====================================================
// Settlement Functions
// =====================================================

/**
 * Derive the settlement status of a moneyline pick.
 *
 * @param selection - 'home' or 'away'
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 */
export function deriveMoneylineResult(
  selection: string,
  homeScore: number,
  awayScore: number
): PickStatus {
  // Tie game is a push for moneyline (in most sports)
  if (homeScore === awayScore) {
    return 'PUSH';
  }

  const homeWon = homeScore > awayScore;

  if (selection === 'home') {
    return homeWon ? 'HIT' : 'MISS';
  } else if (selection === 'away') {
    return homeWon ? 'MISS' : 'HIT';
  }

  // Unknown selection
  return 'PENDING';
}

/**
 * Derive the settlement status of a spread pick.
 *
 * @param selection - 'home' or 'away'
 * @param line - The spread line (negative favors home, positive favors away)
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 */
export function deriveSpreadResult(
  selection: string,
  line: number | null,
  homeScore: number,
  awayScore: number
): PickStatus {
  if (line === null) {
    return 'PENDING';
  }

  // Apply spread to the selected team's score
  // If you pick home -3.5, home needs to win by more than 3.5
  // If you pick away +3.5, away can lose by up to 3.5 and still cover
  let adjustedDiff: number;

  if (selection === 'home') {
    // Home covers if (homeScore + line) > awayScore
    // e.g., home -3.5: homeScore - 3.5 > awayScore
    adjustedDiff = homeScore + line - awayScore;
  } else if (selection === 'away') {
    // Away covers if (awayScore + line) > homeScore
    // e.g., away +3.5: awayScore + 3.5 > homeScore
    adjustedDiff = awayScore + line - homeScore;
  } else {
    return 'PENDING';
  }

  if (adjustedDiff === 0) {
    return 'PUSH';
  }

  return adjustedDiff > 0 ? 'HIT' : 'MISS';
}

/**
 * Derive the settlement status of an over/under (total) pick.
 *
 * @param selection - 'over' or 'under'
 * @param line - The total line
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 */
export function deriveTotalResult(
  selection: string,
  line: number | null,
  homeScore: number,
  awayScore: number
): PickStatus {
  if (line === null) {
    return 'PENDING';
  }

  const total = homeScore + awayScore;

  // Exact match is a push
  if (total === line) {
    return 'PUSH';
  }

  const isOver = total > line;

  if (selection === 'over') {
    return isOver ? 'HIT' : 'MISS';
  } else if (selection === 'under') {
    return isOver ? 'MISS' : 'HIT';
  }

  // Unknown selection
  return 'PENDING';
}

/**
 * Derive the settlement status of a pick based on event score.
 * Returns 'PENDING' if the event is not completed or data is missing.
 *
 * @param pick - The pick to evaluate
 * @param eventScore - The event score data from socket
 */
export function derivePickStatus(
  pick: PickForSettlement,
  eventScore: EventScore | undefined
): PickStatus {
  // If no score data or event not completed, can't settle
  if (!eventScore || eventScore.status !== 'COMPLETED') {
    return 'PENDING';
  }

  const { homeScore, awayScore } = eventScore;
  const { pickType, selection, line } = pick;

  switch (pickType) {
    case 'moneyline':
      return deriveMoneylineResult(selection, homeScore, awayScore);

    case 'spread':
      return deriveSpreadResult(selection, line, homeScore, awayScore);

    case 'total':
      return deriveTotalResult(selection, line, homeScore, awayScore);

    case 'prop':
      // Props require special handling based on propType
      // For now, return PENDING as we can't derive locally
      return 'PENDING';

    default:
      return 'PENDING';
  }
}

/**
 * Get a display-friendly team name for the pick.
 */
export function getPickTeamName(pick: PickForSettlement): string {
  if (!pick.event) {
    return pick.selection;
  }

  if (pick.selection === 'home') {
    return pick.event.homeTeamName;
  } else if (pick.selection === 'away') {
    return pick.event.awayTeamName;
  } else if (pick.selection === 'over' || pick.selection === 'under') {
    return `${pick.selection.charAt(0).toUpperCase() + pick.selection.slice(1)} ${pick.line}`;
  }

  return pick.selection;
}

/**
 * Get a display-friendly pick type label.
 */
export function getPickTypeLabel(pickType: PickType): string {
  switch (pickType) {
    case 'moneyline':
      return 'Moneyline';
    case 'spread':
      return 'Spread';
    case 'total':
      return 'Total';
    case 'prop':
      return 'Prop';
    default:
      return pickType;
  }
}

/**
 * Calculate points earned from a list of settled picks.
 */
export function calculatePointsEarned(
  picks: PickForSettlement[],
  settlementResults: Map<string, SettlementResult>
): number {
  return picks.reduce((total, pick) => {
    const result = settlementResults.get(pick.id);
    if (result?.status === 'HIT') {
      return total + pick.pointValue;
    }
    return total;
  }, 0);
}

/**
 * Count picks by status.
 */
export function countPicksByStatus(
  picks: PickForSettlement[],
  settlementResults: Map<string, SettlementResult>
): { pending: number; hit: number; miss: number; push: number } {
  const counts = { pending: 0, hit: 0, miss: 0, push: 0 };

  for (const pick of picks) {
    const result = settlementResults.get(pick.id);
    const status = result?.status ?? 'PENDING';

    switch (status) {
      case 'PENDING':
        counts.pending++;
        break;
      case 'HIT':
        counts.hit++;
        break;
      case 'MISS':
        counts.miss++;
        break;
      case 'PUSH':
        counts.push++;
        break;
    }
  }

  return counts;
}
