// =====================================================
// Momentum Calculation Utility
// =====================================================
// Computes momentum score based on recent pick outcomes.
// Used to show which player has "momentum" in a PvP match.

import type { ApiPickResponse } from '../services/slip.service';

// =====================================================
// Types
// =====================================================

export interface MomentumPick {
  id: string;
  ownerId: string;
  status: string;
  pointValue: number;
  settledAt: string | null;
}

export interface MomentumResult {
  /** Momentum score from -1 (opponent) to +1 (user) */
  score: number;
  /** Label for display */
  label: 'you' | 'opponent' | 'even';
  /** How many resolved picks were used in calculation */
  recentPicks: number;
  /** Which calculation method was used */
  method: 'recent' | 'fallback';
}

export interface ComputeMomentumOptions {
  /** Number of recent picks to consider (default: 6) */
  windowSize?: number;
  /** Threshold for "you" label (default: 0.15) */
  userThreshold?: number;
  /** Threshold for "opponent" label (default: -0.15) */
  opponentThreshold?: number;
}

// =====================================================
// Constants
// =====================================================

const RESOLVED_STATUSES = new Set(['HIT', 'MISS', 'PUSH', 'VOID']);
const DEFAULT_WINDOW_SIZE = 6;
const DEFAULT_USER_THRESHOLD = 0.15;
const DEFAULT_OPPONENT_THRESHOLD = -0.15;

// =====================================================
// Helper Functions
// =====================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLabel(
  score: number,
  userThreshold: number,
  opponentThreshold: number
): 'you' | 'opponent' | 'even' {
  if (score > userThreshold) return 'you';
  if (score < opponentThreshold) return 'opponent';
  return 'even';
}

// =====================================================
// Main Function
// =====================================================

/**
 * Compute momentum score based on recent pick outcomes.
 *
 * Algorithm:
 * 1. Combine picks from both slips
 * 2. Filter to resolved: status in ['HIT', 'MISS', 'PUSH', 'VOID']
 * 3. Sort by settledAt ascending, take last N
 * 4. For each pick:
 *    - User HIT: +pointValue
 *    - Opponent HIT: -pointValue
 *    - MISS/PUSH/VOID: 0
 * 5. Score = clamp(sumDelta / sumAbs, -1, 1)
 *
 * Fallback (< 2 resolved picks): Use points differential
 *
 * @param userPicks - Picks from the current user's slip
 * @param opponentPicks - Picks from the opponent's slip
 * @param currentUserId - ID of the current user
 * @param userPoints - Total points earned by user
 * @param opponentPoints - Total points earned by opponent
 * @param options - Configuration options
 */
export function computeMomentum(
  userPicks: ApiPickResponse[],
  opponentPicks: ApiPickResponse[],
  currentUserId: string,
  userPoints: number,
  opponentPoints: number,
  options: ComputeMomentumOptions = {}
): MomentumResult {
  const {
    windowSize = DEFAULT_WINDOW_SIZE,
    userThreshold = DEFAULT_USER_THRESHOLD,
    opponentThreshold = DEFAULT_OPPONENT_THRESHOLD,
  } = options;

  // Step 1: Combine and annotate picks with owner
  const allPicks: MomentumPick[] = [
    ...userPicks.map((p) => ({
      id: p.id,
      ownerId: currentUserId,
      status: p.status,
      pointValue: p.pointValue,
      settledAt: p.settledAt,
    })),
    ...opponentPicks.map((p) => ({
      id: p.id,
      ownerId: 'opponent',
      status: p.status,
      pointValue: p.pointValue,
      settledAt: p.settledAt,
    })),
  ];

  // Step 2: Filter to resolved picks with settledAt
  const resolvedPicks = allPicks.filter(
    (p) => RESOLVED_STATUSES.has(p.status) && p.settledAt !== null
  );

  // Step 3: Check if we have enough resolved picks for primary algorithm
  if (resolvedPicks.length < 2) {
    // Fallback: Use points differential
    const diff = userPoints - opponentPoints;
    const den = Math.max(1, userPoints + opponentPoints);
    const score = clamp(diff / den, -1, 1);

    return {
      score,
      label: getLabel(score, userThreshold, opponentThreshold),
      recentPicks: resolvedPicks.length,
      method: 'fallback',
    };
  }

  // Step 4: Sort by settledAt ascending, take last N
  const sortedPicks = resolvedPicks.sort((a, b) => {
    const aTime = new Date(a.settledAt!).getTime();
    const bTime = new Date(b.settledAt!).getTime();
    return aTime - bTime;
  });

  const recentPicks = sortedPicks.slice(-windowSize);

  // Step 5: Calculate delta and absolute sum
  let sumDelta = 0;
  let sumAbs = 0;

  for (const pick of recentPicks) {
    const isUserPick = pick.ownerId === currentUserId;

    if (pick.status === 'HIT') {
      // HIT: user gains points (positive delta) or opponent gains (negative delta)
      const delta = isUserPick ? pick.pointValue : -pick.pointValue;
      sumDelta += delta;
    }
    // All picks contribute to sumAbs (normalized denominator)
    sumAbs += pick.pointValue;
  }

  // Prevent division by zero
  const denominator = sumAbs > 0 ? sumAbs : 1;
  const score = clamp(sumDelta / denominator, -1, 1);

  return {
    score,
    label: getLabel(score, userThreshold, opponentThreshold),
    recentPicks: recentPicks.length,
    method: 'recent',
  };
}
