// =====================================================
// useMomentum Hook
// =====================================================
// Memoized hook for computing momentum score in live matches.
// Wraps the computeMomentum utility with React memoization.

import { useMemo } from 'react';
import { computeMomentum, MomentumResult, ComputeMomentumOptions } from '../utils/momentum';
import type { ApiPickResponse } from '../services/slip.service';

// =====================================================
// Types
// =====================================================

interface UseMomentumOptions {
  /** Picks from the current user's slip */
  userPicks: ApiPickResponse[];
  /** Picks from the opponent's slip */
  opponentPicks: ApiPickResponse[];
  /** Current user's ID */
  currentUserId: string;
  /** Total points earned by user */
  userPoints: number;
  /** Total points earned by opponent */
  opponentPoints: number;
  /** Number of recent picks to consider (default: 6) */
  windowSize?: number;
}

// =====================================================
// Hook
// =====================================================

/**
 * Compute momentum score with memoization.
 *
 * Returns a MomentumResult with:
 * - score: -1 to 1 (negative = opponent momentum, positive = user momentum)
 * - label: 'you' | 'opponent' | 'even'
 * - recentPicks: number of resolved picks used in calculation
 * - method: 'recent' | 'fallback'
 */
export function useMomentum(options: UseMomentumOptions): MomentumResult {
  const {
    userPicks,
    opponentPicks,
    currentUserId,
    userPoints,
    opponentPoints,
    windowSize = 6,
  } = options;

  return useMemo(() => {
    const computeOptions: ComputeMomentumOptions = { windowSize };

    return computeMomentum(
      userPicks,
      opponentPicks,
      currentUserId,
      userPoints,
      opponentPoints,
      computeOptions
    );
  }, [userPicks, opponentPicks, currentUserId, userPoints, opponentPoints, windowSize]);
}

export default useMomentum;
