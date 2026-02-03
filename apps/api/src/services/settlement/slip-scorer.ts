// =====================================================
// Slip Scoring Calculator
// =====================================================
// Pure functions for calculating slip scores based on pick results.
//
// SCORING RULES:
// - HIT: Add the pick's pointValue to total points earned
// - MISS: No points earned (0)
// - PUSH: No points earned, but pick is excluded from "valid picks" count
// - VOID: Completely excluded from calculation (doesn't count toward anything)
//
// SLIP STATUS DETERMINATION:
// - WON: At least one HIT and no MISS picks (among valid picks)
// - LOST: At least one MISS pick
// - VOID: All picks are VOID

import { SlipStatus } from '@prisma/client';
import { PickResultOutput, SlipScoreResult } from './settlement.types';

// ===========================================
// Types
// ===========================================

export interface PickForScoring {
  pickId: string;
  pointValue: number;
  result: PickResultOutput;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Determines the slip status based on pick results.
 *
 * Rules:
 * - If ALL picks are VOID → VOID
 * - If ANY pick is MISS → LOST (even if some are HIT)
 * - If ALL valid picks are HIT or PUSH → WON
 * - If no valid picks but some PUSH → WON (pushed picks don't lose)
 */
function determineSlipStatus(pickResults: PickResultOutput[]): SlipStatus {
  const statuses = pickResults.map((r) => r.status);

  // Check if all picks are VOID
  const allVoid = statuses.every((s) => s === 'VOID');
  if (allVoid) {
    return 'VOID';
  }

  // Check if any pick is PENDING (shouldn't happen in settlement)
  const hasPending = statuses.some((s) => s === 'PENDING');
  if (hasPending) {
    // Return ACTIVE if still pending - settlement should not proceed
    return 'ACTIVE';
  }

  // Check if any valid pick is a MISS
  const hasMiss = statuses.some((s) => s === 'MISS');
  if (hasMiss) {
    return 'LOST';
  }

  // No misses - check if there are any HITs
  const hasHit = statuses.some((s) => s === 'HIT');
  if (hasHit) {
    return 'WON';
  }

  // All remaining picks are PUSH or VOID
  // If there were any PUSH picks, it's a "successful" slip (didn't lose)
  const hasPush = statuses.some((s) => s === 'PUSH');
  if (hasPush) {
    return 'WON'; // Pushed slips are considered won (no loss)
  }

  // Fallback (shouldn't reach here if logic is correct)
  return 'VOID';
}

// ===========================================
// Main Export Functions
// ===========================================

/**
 * Calculates the total score for a slip based on its pick results.
 *
 * This is a pure function with no side effects.
 *
 * @param slipId - The ID of the slip being scored
 * @param picks - Array of picks with their point values and results
 * @returns SlipScoreResult with points, counts, and status
 */
export function calculateSlipScore(
  slipId: string,
  picks: PickForScoring[]
): SlipScoreResult {
  let pointsEarned = 0;
  let correctPicks = 0;
  let totalValidPicks = 0;

  const pickResults: PickResultOutput[] = [];

  for (const pick of picks) {
    const { result, pointValue } = pick;
    pickResults.push(result);

    // SECURITY: Validate point value is positive
    // Negative point values could be used to manipulate scores
    if (pointValue < 0) {
      throw new Error(
        `Invalid negative point value (${pointValue}) for pick ${pick.pickId}. ` +
        `This indicates data corruption or attempted manipulation.`
      );
    }

    // Skip VOID picks entirely
    if (result.status === 'VOID') {
      continue;
    }

    // Skip PENDING picks (shouldn't be here in settlement)
    if (result.status === 'PENDING') {
      continue;
    }

    // PUSH picks: don't count toward valid picks or points
    if (result.status === 'PUSH') {
      continue;
    }

    // This pick is either HIT or MISS - counts as valid
    totalValidPicks++;

    if (result.status === 'HIT') {
      pointsEarned += pointValue;
      correctPicks++;
    }
    // MISS: no points added, but counted as valid pick
  }

  const status = determineSlipStatus(pickResults);

  return {
    slipId,
    pointsEarned,
    correctPicks,
    totalValidPicks,
    pickResults,
    status,
  };
}

/**
 * Calculates scores for multiple slips.
 *
 * @param slips - Array of slips with their picks
 * @returns Array of SlipScoreResult
 */
export function calculateSlipScores(
  slips: Array<{ slipId: string; picks: PickForScoring[] }>
): SlipScoreResult[] {
  return slips.map(({ slipId, picks }) => calculateSlipScore(slipId, picks));
}

/**
 * Summarizes scoring statistics across multiple picks.
 * Useful for debugging and audit logs.
 */
export function summarizePickResults(pickResults: PickResultOutput[]): {
  total: number;
  hits: number;
  misses: number;
  pushes: number;
  voids: number;
  pending: number;
} {
  return {
    total: pickResults.length,
    hits: pickResults.filter((r) => r.status === 'HIT').length,
    misses: pickResults.filter((r) => r.status === 'MISS').length,
    pushes: pickResults.filter((r) => r.status === 'PUSH').length,
    voids: pickResults.filter((r) => r.status === 'VOID').length,
    pending: pickResults.filter((r) => r.status === 'PENDING').length,
  };
}
