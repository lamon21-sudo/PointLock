// =====================================================
// Match Winner Determination
// =====================================================
// Pure functions for determining the winner of a PvP match.
//
// WINNER RULES (in order):
// 1. The user with more points wins
// 2. If points are equal: fewer valid picks wins (rewards efficiency)
// 3. If points AND picks are equal: DRAW (push) - both users get stakes refunded
// 4. If both slips are VOID: also a DRAW (full refund)
//
// TIE-BREAKING:
// - Uses "valid picks" count (HIT + MISS, excludes VOID/PUSH)
// - Fewer picks with same points = more efficient strategy = winner
// - Complete tie only occurs when points AND valid pick counts match exactly

import { SlipScoreResult, MatchWinnerResult } from './settlement.types';

// ===========================================
// Types
// ===========================================

export interface MatchParticipant {
  userId: string;
  slipScore: SlipScoreResult;
}

// ===========================================
// Main Export Function
// ===========================================

/**
 * Determines the winner of a PvP match based on slip scores.
 *
 * This is a pure function with no side effects.
 *
 * @param creatorId - The match creator's user ID
 * @param opponentId - The opponent's user ID
 * @param creatorScore - The creator's slip score result
 * @param opponentScore - The opponent's slip score result
 * @returns MatchWinnerResult with winnerId, isDraw, and reason
 */
export function determineMatchWinner(
  creatorId: string,
  opponentId: string,
  creatorScore: SlipScoreResult,
  opponentScore: SlipScoreResult
): MatchWinnerResult {
  const creatorPoints = creatorScore.pointsEarned;
  const opponentPoints = opponentScore.pointsEarned;

  // Check for special VOID case - both slips completely void
  const bothVoid = creatorScore.status === 'VOID' && opponentScore.status === 'VOID';
  if (bothVoid) {
    return {
      winnerId: null,
      isDraw: true,
      creatorPoints: 0,
      opponentPoints: 0,
      reason: 'All picks voided for both players - match void, stakes refunded',
    };
  }

  // Check for one slip void (the other wins by default if they have any valid picks)
  if (creatorScore.status === 'VOID' && opponentScore.totalValidPicks > 0) {
    return {
      winnerId: opponentId,
      isDraw: false,
      creatorPoints: 0,
      opponentPoints,
      reason: `Creator's slip voided - opponent wins with ${opponentPoints} points`,
    };
  }

  if (opponentScore.status === 'VOID' && creatorScore.totalValidPicks > 0) {
    return {
      winnerId: creatorId,
      isDraw: false,
      creatorPoints,
      opponentPoints: 0,
      reason: `Opponent's slip voided - creator wins with ${creatorPoints} points`,
    };
  }

  // Rule 1: Standard comparison - higher points wins
  if (creatorPoints > opponentPoints) {
    return {
      winnerId: creatorId,
      isDraw: false,
      creatorPoints,
      opponentPoints,
      reason: `Creator wins: ${creatorPoints} points vs ${opponentPoints} points`,
    };
  }

  if (opponentPoints > creatorPoints) {
    return {
      winnerId: opponentId,
      isDraw: false,
      creatorPoints,
      opponentPoints,
      reason: `Opponent wins: ${opponentPoints} points vs ${creatorPoints} points`,
    };
  }

  // Points are equal - apply tiebreaker
  const creatorPicks = creatorScore.totalValidPicks;
  const opponentPicks = opponentScore.totalValidPicks;

  // Rule 2 (Tiebreaker): Fewer valid picks wins (rewards efficiency)
  // Only picks that counted (HIT/MISS) are compared, excludes VOID/PUSH
  if (creatorPicks < opponentPicks) {
    return {
      winnerId: creatorId,
      isDraw: false,
      creatorPoints,
      opponentPoints,
      reason: `Creator wins tiebreaker: ${creatorPoints} pts with ${creatorPicks} picks vs ${opponentPicks} picks`,
    };
  }

  if (opponentPicks < creatorPicks) {
    return {
      winnerId: opponentId,
      isDraw: false,
      creatorPoints,
      opponentPoints,
      reason: `Opponent wins tiebreaker: ${opponentPoints} pts with ${opponentPicks} picks vs ${creatorPicks} picks`,
    };
  }

  // Rule 3: Complete draw - same points AND same valid picks
  return {
    winnerId: null,
    isDraw: true,
    creatorPoints,
    opponentPoints,
    reason: `Draw: both scored ${creatorPoints} points with ${creatorPicks} valid picks - stakes refunded`,
  };
}

/**
 * Validates that a match can be settled.
 *
 * @param creatorScore - Creator's slip score
 * @param opponentScore - Opponent's slip score
 * @returns Object with isValid flag and reason if invalid
 */
export function validateMatchForSettlement(
  creatorScore: SlipScoreResult,
  opponentScore: SlipScoreResult
): { isValid: boolean; reason?: string } {
  // Check if any picks are still pending
  const creatorPending = creatorScore.pickResults.some((r) => r.status === 'PENDING');
  const opponentPending = opponentScore.pickResults.some((r) => r.status === 'PENDING');

  if (creatorPending || opponentPending) {
    const pendingUser = creatorPending ? 'creator' : 'opponent';
    return {
      isValid: false,
      reason: `Cannot settle: ${pendingUser}'s slip has pending picks`,
    };
  }

  return { isValid: true };
}

/**
 * Calculates the financial settlement amounts for a match.
 *
 * @param stakeAmount - The stake amount per player (in cents as bigint)
 * @param rakePercentage - The rake percentage (e.g., 5.00 for 5%)
 * @param winnerId - The winner's user ID (null if draw)
 * @param isDraw - Whether the match is a draw
 */
export function calculateSettlementAmounts(
  stakeAmount: bigint,
  rakePercentage: number,
  _winnerId: string | null, // Kept for API consistency; not used in calculation
  isDraw: boolean
): {
  totalPot: bigint;
  rakeAmount: bigint;
  winnerPayout: bigint | null;
  creatorRefund: bigint | null;
  opponentRefund: bigint | null;
} {
  // Total pot is both stakes combined
  const totalPot = stakeAmount * BigInt(2);

  if (isDraw) {
    // Draw: full refund to both, no rake
    return {
      totalPot,
      rakeAmount: BigInt(0),
      winnerPayout: null,
      creatorRefund: stakeAmount,
      opponentRefund: stakeAmount,
    };
  }

  // Winner takes pot minus rake
  // Rake calculation: totalPot * (rakePercentage / 100)
  // Use integer math to avoid floating point issues
  //
  // IMPORTANT: We use ceiling for rake to ensure the house never loses
  // fractional cents due to truncation. This is standard practice in
  // financial systems where the operator takes the rounding benefit.
  //
  // Formula: ceiling(totalPot * rakePercentage / 100)
  // Implemented as: (totalPot * rakeBasisPoints + 9999) / 10000
  // The +9999 ensures any remainder rounds up (ceiling division)
  const rakeMultiplier = BigInt(Math.round(rakePercentage * 100)); // e.g., 5.00 -> 500
  const rakeAmountUnrounded = totalPot * rakeMultiplier;
  // Ceiling division: add (divisor - 1) before dividing
  const rakeAmount = (rakeAmountUnrounded + BigInt(9999)) / BigInt(10000);
  const winnerPayout = totalPot - rakeAmount;

  return {
    totalPot,
    rakeAmount,
    winnerPayout,
    creatorRefund: null,
    opponentRefund: null,
  };
}
