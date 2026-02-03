// =====================================================
// useRanked Hook
// =====================================================
// Custom hook for fetching and managing ranked/season data.
// Supports pull-to-refresh, loading/error states, and reward claiming.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { RankedService, RewardItem, RankedData } from '../services/ranked.service';
import type { Season, PlacementStatus, RankedProgress } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

interface UseRankedOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseRankedReturn {
  /** Current active season */
  season: Season | null;
  /** Placement status (during placement phase) */
  placement: PlacementStatus | null;
  /** Ranked progress (after placement) */
  progress: RankedProgress | null;
  /** Season rewards with claim status */
  rewards: RewardItem[];
  /** Initial loading state */
  isLoading: boolean;
  /** Pull-to-refresh state */
  isRefreshing: boolean;
  /** Claiming reward state */
  isClaiming: boolean;
  /** Error message if any */
  error: string | null;
  /** Pull-to-refresh handler */
  refresh: () => Promise<void>;
  /** Claim a reward */
  claimReward: (rewardId: string) => Promise<boolean>;
  /** Whether user is in placement phase */
  isInPlacement: boolean;
  /** Whether user has completed placements */
  isPlaced: boolean;
  /** Whether there's an active season */
  hasActiveSeason: boolean;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * useRanked - Fetch and manage ranked/season data
 *
 * Features:
 * - Fetches current season, placement status, and ranked progress
 * - Supports pull-to-refresh
 * - Loading/error states
 * - Reward claiming
 * - Automatic data refresh after claiming
 *
 * @example
 * ```tsx
 * const {
 *   season,
 *   placement,
 *   progress,
 *   rewards,
 *   isLoading,
 *   error,
 *   refresh,
 *   claimReward,
 *   isInPlacement,
 *   isPlaced,
 * } = useRanked();
 * ```
 */
export function useRanked(options: UseRankedOptions = {}): UseRankedReturn {
  const { autoFetch = true } = options;

  // Auth state
  const { isAuthenticated, isInitialized } = useAuthStore();

  // Data state
  const [season, setSeason] = useState<Season | null>(null);
  const [placement, setPlacement] = useState<PlacementStatus | null>(null);
  const [progress, setProgress] = useState<RankedProgress | null>(null);
  const [rewards, setRewards] = useState<RewardItem[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Refs to prevent stale closures and concurrent fetches
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  // =====================================================
  // Derived State
  // =====================================================

  const hasActiveSeason = season !== null && season.status === 'ACTIVE';
  const isPlaced = placement?.isPlaced ?? false;
  const isInPlacement = hasActiveSeason && placement !== null && !isPlaced;

  // =====================================================
  // Fetch Logic
  // =====================================================

  /**
   * Fetch all ranked data from service
   */
  const fetchRankedData = useCallback(async (isRefresh = false) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current && !isRefresh) {
      return;
    }

    isFetchingRef.current = true;

    try {
      const data: RankedData = await RankedService.getRankedData();

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setSeason(data.season);
        setPlacement(data.placement);
        setProgress(data.progress);
        setRewards(data.rewards);
        setError(null);
      }
    } catch (err: any) {
      console.error('[useRanked] Fetch error:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load ranked data');
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // =====================================================
  // Auto-fetch on mount
  // =====================================================

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoFetch && isInitialized && isAuthenticated) {
      setIsLoading(true);
      fetchRankedData().finally(() => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      });
    } else if (autoFetch && isInitialized && !isAuthenticated) {
      // Not authenticated - show empty state
      setIsLoading(false);
      setError(null);
    }
  }, [autoFetch, isInitialized, isAuthenticated, fetchRankedData]);

  // =====================================================
  // Refresh Handler
  // =====================================================

  /**
   * Pull-to-refresh handler
   */
  const refresh = useCallback(async () => {
    if (isRefreshing || !isAuthenticated) return;

    setIsRefreshing(true);
    setError(null);
    await fetchRankedData(true);
    if (isMountedRef.current) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isAuthenticated, fetchRankedData]);

  // =====================================================
  // Claim Reward Handler
  // =====================================================

  /**
   * Claim a season reward
   * @returns true if successful, false otherwise
   */
  const claimReward = useCallback(
    async (rewardId: string): Promise<boolean> => {
      if (isClaiming || !season) return false;

      setIsClaiming(true);

      try {
        await RankedService.claimReward(season.id, rewardId);

        // Refresh data to get updated reward status
        await fetchRankedData(true);

        return true;
      } catch (err: any) {
        console.error('[useRanked] Claim error:', err);
        setError(err.message || 'Failed to claim reward');
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsClaiming(false);
        }
      }
    },
    [isClaiming, season, fetchRankedData]
  );

  // =====================================================
  // Return
  // =====================================================

  return {
    season,
    placement,
    progress,
    rewards,
    isLoading,
    isRefreshing,
    isClaiming,
    error,
    refresh,
    claimReward,
    isInPlacement,
    isPlaced,
    hasActiveSeason,
  };
}

export default useRanked;
