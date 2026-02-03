// =====================================================
// Pick Result Determination (Referee Logic)
// =====================================================
// Pure functions for evaluating pick outcomes.
// These functions determine if a pick is HIT, MISS, PUSH, or VOID.
//
// RULES:
// - Moneyline: Home wins if homeScore > awayScore, Away wins if awayScore > homeScore
// - Spread: Home covers if (homeScore + spread) > awayScore; PUSH on exact tie
// - Total: Over if (homeScore + awayScore) > line; Under if below; PUSH on exact
// - VOID: Event cancelled, postponed, or scores unavailable

import { PickStatus } from '@prisma/client';
import {
  PickResultInput,
  EventScores,
  PickResultOutput,
  FINAL_EVENT_STATUSES,
  VOID_EVENT_STATUSES,
  HOME_SELECTIONS,
  AWAY_SELECTIONS,
  OVER_SELECTIONS,
  UNDER_SELECTIONS,
} from './settlement.types';

// ===========================================
// Constants
// ===========================================

/**
 * Epsilon for floating-point comparisons.
 * Values within this tolerance are considered equal.
 * 0.0001 allows for IEEE 754 floating-point precision errors.
 */
const EPSILON = 0.0001;

// ===========================================
// Helper Functions
// ===========================================

/**
 * Checks if two numbers are approximately equal within epsilon tolerance.
 * This handles floating-point precision issues.
 */
function isApproximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * Checks if a selection represents the home team.
 * Trims whitespace and normalizes to lowercase.
 */
function isHomeSelection(selection: string): boolean {
  const normalized = selection.trim().toLowerCase();
  return HOME_SELECTIONS.includes(normalized as any);
}

/**
 * Checks if a selection represents the away team.
 * Trims whitespace and normalizes to lowercase.
 */
function isAwaySelection(selection: string): boolean {
  const normalized = selection.trim().toLowerCase();
  return AWAY_SELECTIONS.includes(normalized as any);
}

/**
 * Checks if a selection represents over.
 * Trims whitespace and normalizes to lowercase.
 */
function isOverSelection(selection: string): boolean {
  const normalized = selection.trim().toLowerCase();
  return OVER_SELECTIONS.includes(normalized as any);
}

/**
 * Checks if a selection represents under.
 * Trims whitespace and normalizes to lowercase.
 */
function isUnderSelection(selection: string): boolean {
  const normalized = selection.trim().toLowerCase();
  return UNDER_SELECTIONS.includes(normalized as any);
}

/**
 * Checks if event status indicates the game is final.
 */
function isEventFinal(status: string): boolean {
  return FINAL_EVENT_STATUSES.includes(status.toLowerCase() as any);
}

/**
 * Checks if event status indicates the pick should be voided.
 */
function shouldVoidEvent(status: string): boolean {
  return VOID_EVENT_STATUSES.includes(status.toLowerCase() as any);
}

// ===========================================
// Pick Result Evaluation Functions
// ===========================================

/**
 * Evaluates a moneyline pick.
 *
 * @param selection - 'home' or 'away'
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 * @returns PickStatus and reason
 */
function evaluateMoneyline(
  selection: string,
  homeScore: number,
  awayScore: number
): { status: PickStatus; reason: string } {
  const isHome = isHomeSelection(selection);
  const isAway = isAwaySelection(selection);

  if (!isHome && !isAway) {
    return {
      status: 'VOID',
      reason: `Invalid moneyline selection: ${selection}`,
    };
  }

  // Handle tie game (rare in most sports, but possible)
  // Use epsilon comparison for floating-point safety
  if (isApproximatelyEqual(homeScore, awayScore)) {
    return {
      status: 'PUSH',
      reason: `Game ended in tie: ${homeScore}-${awayScore}`,
    };
  }

  const homeWins = homeScore > awayScore + EPSILON;

  if (isHome) {
    return homeWins
      ? { status: 'HIT', reason: `Home won ${homeScore}-${awayScore}` }
      : { status: 'MISS', reason: `Home lost ${homeScore}-${awayScore}` };
  } else {
    return homeWins
      ? { status: 'MISS', reason: `Away lost ${awayScore}-${homeScore}` }
      : { status: 'HIT', reason: `Away won ${awayScore}-${homeScore}` };
  }
}

/**
 * Evaluates a spread pick.
 *
 * Spread is from the perspective of the selected team:
 * - If you pick "home -7.5", home must win by MORE than 7.5 points
 * - If you pick "away +7.5", away must lose by LESS than 7.5 points (or win)
 *
 * The line stored is always from the HOME team's perspective:
 * - Negative line means home is favored (e.g., -7.5)
 * - Positive line means home is underdog (e.g., +7.5)
 *
 * @param selection - 'home' or 'away'
 * @param line - The spread line (from home perspective)
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 * @returns PickStatus and reason
 */
function evaluateSpread(
  selection: string,
  line: number,
  homeScore: number,
  awayScore: number
): { status: PickStatus; reason: string } {
  const isHome = isHomeSelection(selection);
  const isAway = isAwaySelection(selection);

  if (!isHome && !isAway) {
    return {
      status: 'VOID',
      reason: `Invalid spread selection: ${selection}`,
    };
  }

  // Calculate the adjusted score (home score + spread)
  // Example: Home 100, Away 95, Line -7.5
  // Adjusted: 100 + (-7.5) = 92.5, which is < 95, so home doesn't cover
  const homeAdjustedScore = homeScore + line;
  const margin = homeAdjustedScore - awayScore;

  // Check for push using epsilon comparison for floating-point safety
  // This handles cases like 100 + (-7) - 93 = 0.00000000000001
  if (isApproximatelyEqual(margin, 0)) {
    return {
      status: 'PUSH',
      reason: `Spread push: ${homeScore} + (${line}) = ${homeAdjustedScore} vs ${awayScore}`,
    };
  }

  const homeCovers = margin > EPSILON;

  if (isHome) {
    return homeCovers
      ? { status: 'HIT', reason: `Home covered: ${homeScore} + (${line}) = ${homeAdjustedScore} > ${awayScore}` }
      : { status: 'MISS', reason: `Home didn't cover: ${homeScore} + (${line}) = ${homeAdjustedScore} < ${awayScore}` };
  } else {
    // Away covers when home doesn't
    return homeCovers
      ? { status: 'MISS', reason: `Away didn't cover: ${homeScore} + (${line}) = ${homeAdjustedScore} > ${awayScore}` }
      : { status: 'HIT', reason: `Away covered: ${homeScore} + (${line}) = ${homeAdjustedScore} < ${awayScore}` };
  }
}

/**
 * Evaluates a total (over/under) pick.
 *
 * @param selection - 'over' or 'under'
 * @param line - The total line (e.g., 215.5)
 * @param homeScore - Final home team score
 * @param awayScore - Final away team score
 * @returns PickStatus and reason
 */
function evaluateTotal(
  selection: string,
  line: number,
  homeScore: number,
  awayScore: number
): { status: PickStatus; reason: string } {
  const isOver = isOverSelection(selection);
  const isUnder = isUnderSelection(selection);

  if (!isOver && !isUnder) {
    return {
      status: 'VOID',
      reason: `Invalid total selection: ${selection}`,
    };
  }

  const combinedScore = homeScore + awayScore;

  // Check for push using epsilon comparison for floating-point safety
  if (isApproximatelyEqual(combinedScore, line)) {
    return {
      status: 'PUSH',
      reason: `Total push: ${homeScore} + ${awayScore} = ${combinedScore} = ${line}`,
    };
  }

  // Use epsilon comparison for floating-point safety
  const wentOver = combinedScore > line + EPSILON;

  if (isOver) {
    return wentOver
      ? { status: 'HIT', reason: `Over hit: ${homeScore} + ${awayScore} = ${combinedScore} > ${line}` }
      : { status: 'MISS', reason: `Over missed: ${homeScore} + ${awayScore} = ${combinedScore} < ${line}` };
  } else {
    return wentOver
      ? { status: 'MISS', reason: `Under missed: ${homeScore} + ${awayScore} = ${combinedScore} > ${line}` }
      : { status: 'HIT', reason: `Under hit: ${homeScore} + ${awayScore} = ${combinedScore} < ${line}` };
  }
}

// ===========================================
// Main Export Function
// ===========================================

/**
 * Determines the result of a pick based on the event outcome.
 *
 * This is a pure function with no side effects - it only evaluates
 * the pick against the event scores and returns a result.
 *
 * @param pick - The pick to evaluate
 * @param event - The event scores and status
 * @returns PickResultOutput with status, resultValue, and reason
 */
export function determinePickResult(
  pick: PickResultInput,
  event: EventScores
): PickResultOutput {
  const baseResult = {
    pickId: pick.id,
    resultValue: null as number | null,
  };

  // Check for void conditions first
  if (shouldVoidEvent(event.status)) {
    return {
      ...baseResult,
      status: 'VOID',
      reason: `Event ${event.status}: pick voided`,
    };
  }

  // Check if event is final
  if (!isEventFinal(event.status)) {
    return {
      ...baseResult,
      status: 'PENDING',
      reason: `Event not final: status is ${event.status}`,
    };
  }

  // Check for null scores
  if (event.homeScore === null || event.awayScore === null) {
    return {
      ...baseResult,
      status: 'VOID',
      reason: 'Event scores not available',
    };
  }

  const homeScore = event.homeScore;
  const awayScore = event.awayScore;

  // Evaluate based on pick type
  switch (pick.pickType) {
    case 'moneyline': {
      const result = evaluateMoneyline(pick.selection, homeScore, awayScore);
      return {
        ...baseResult,
        ...result,
        resultValue: homeScore - awayScore, // Point differential
      };
    }

    case 'spread': {
      if (pick.line === null) {
        return {
          ...baseResult,
          status: 'VOID',
          reason: 'Spread pick missing line value',
        };
      }
      const result = evaluateSpread(pick.selection, pick.line, homeScore, awayScore);
      return {
        ...baseResult,
        ...result,
        resultValue: homeScore + pick.line - awayScore, // Adjusted margin
      };
    }

    case 'total': {
      if (pick.line === null) {
        return {
          ...baseResult,
          status: 'VOID',
          reason: 'Total pick missing line value',
        };
      }
      const result = evaluateTotal(pick.selection, pick.line, homeScore, awayScore);
      return {
        ...baseResult,
        ...result,
        resultValue: homeScore + awayScore, // Combined score
      };
    }

    case 'prop': {
      // Prop bets require special handling based on propType
      // For now, mark as VOID until prop settlement is implemented
      return {
        ...baseResult,
        status: 'VOID',
        reason: 'Prop bet settlement not yet implemented',
      };
    }

    default: {
      return {
        ...baseResult,
        status: 'VOID',
        reason: `Unknown pick type: ${pick.pickType}`,
      };
    }
  }
}

/**
 * Batch evaluates multiple picks against their events.
 *
 * @param picksWithEvents - Array of pick/event pairs
 * @returns Array of PickResultOutput
 */
export function determinePickResults(
  picksWithEvents: Array<{ pick: PickResultInput; event: EventScores }>
): PickResultOutput[] {
  return picksWithEvents.map(({ pick, event }) => determinePickResult(pick, event));
}
