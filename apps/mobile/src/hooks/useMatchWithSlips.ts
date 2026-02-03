// =====================================================
// useMatchWithSlips Hook
// =====================================================
// Combined hook for fetching match details with full slip data.
// Fetches match then parallel fetches both slips for picks.

import { useState, useEffect, useCallback } from 'react';
import { MatchService } from '../services/match.service';
import { getSlipById, ApiSlipResponse } from '../services/slip.service';
import type { MatchWithDetails } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

export interface UseMatchWithSlipsReturn {
  /** Match data with user/slip summaries */
  match: MatchWithDetails | null;
  /** Creator's full slip with picks */
  creatorSlip: ApiSlipResponse | null;
  /** Opponent's full slip with picks */
  opponentSlip: ApiSlipResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refetch all data */
  refetch: () => Promise<void>;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * Hook for fetching match with full slip details.
 *
 * @example
 * ```tsx
 * const { match, creatorSlip, opponentSlip, isLoading, error, refetch } =
 *   useMatchWithSlips(matchId);
 *
 * if (isLoading) return <LoadingState />;
 * if (error) return <ErrorState error={error} onRetry={refetch} />;
 *
 * return (
 *   <VersusView
 *     match={match}
 *     creatorSlip={creatorSlip}
 *     opponentSlip={opponentSlip}
 *   />
 * );
 * ```
 */
export function useMatchWithSlips(matchId: string | undefined): UseMatchWithSlipsReturn {
  const [match, setMatch] = useState<MatchWithDetails | null>(null);
  const [creatorSlip, setCreatorSlip] = useState<ApiSlipResponse | null>(null);
  const [opponentSlip, setOpponentSlip] = useState<ApiSlipResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!matchId) {
      setIsLoading(false);
      setError('No match ID provided');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Fetch match details
      const matchData = await MatchService.getMatchById(matchId);
      setMatch(matchData);

      // Step 2: Fetch slips in parallel (if IDs exist)
      const slipPromises: Promise<ApiSlipResponse | null>[] = [];

      if (matchData.creatorSlip?.id) {
        slipPromises.push(
          getSlipById(matchData.creatorSlip.id).catch((err) => {
            console.warn('[useMatchWithSlips] Failed to fetch creator slip:', err);
            return null;
          })
        );
      } else {
        slipPromises.push(Promise.resolve(null));
      }

      if (matchData.opponentSlip?.id) {
        slipPromises.push(
          getSlipById(matchData.opponentSlip.id).catch((err) => {
            console.warn('[useMatchWithSlips] Failed to fetch opponent slip:', err);
            return null;
          })
        );
      } else {
        slipPromises.push(Promise.resolve(null));
      }

      const [creatorSlipData, opponentSlipData] = await Promise.all(slipPromises);

      setCreatorSlip(creatorSlipData);
      setOpponentSlip(opponentSlipData);
      setError(null);
    } catch (err) {
      console.error('[useMatchWithSlips] Error fetching match data:', err);
      const message = err instanceof Error ? err.message : 'Failed to load match';
      setError(message);
      setMatch(null);
      setCreatorSlip(null);
      setOpponentSlip(null);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset state when matchId changes
  useEffect(() => {
    setMatch(null);
    setCreatorSlip(null);
    setOpponentSlip(null);
    setError(null);
  }, [matchId]);

  return {
    match,
    creatorSlip,
    opponentSlip,
    isLoading,
    error,
    refetch: fetchData,
  };
}

export default useMatchWithSlips;
