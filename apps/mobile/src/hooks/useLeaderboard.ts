// =====================================================
// useLeaderboard Hook
// =====================================================
// Custom hook for fetching and managing leaderboard data.
// Supports period switching, pagination, and pull-to-refresh.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { LeaderboardService } from '../services/leaderboard.service';
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardPagination,
  LeaderboardData,
} from '../types/leaderboard.types';

// =====================================================
// Types
// =====================================================

interface UseLeaderboardOptions {
  /** Initial period selection */
  initialPeriod?: LeaderboardPeriod;
  /** Items per page */
  limit?: number;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseLeaderboardReturn {
  /** List of leaderboard entries */
  entries: LeaderboardEntry[];
  /** Leaderboard metadata */
  leaderboard: LeaderboardData | null;
  /** Pagination metadata */
  pagination: LeaderboardPagination | null;
  /** Initial loading state */
  isLoading: boolean;
  /** Loading more items state */
  isLoadingMore: boolean;
  /** Pull-to-refresh state */
  isRefreshing: boolean;
  /** Error message if any */
  error: string | null;
  /** Current period */
  period: LeaderboardPeriod;
  /** Set period (triggers refetch) */
  setPeriod: (period: LeaderboardPeriod) => void;
  /** Pull-to-refresh handler */
  refresh: () => Promise<void>;
  /** Load more items handler */
  loadMore: () => Promise<void>;
  /** Find current user in leaderboard */
  currentUserEntry: LeaderboardEntry | null;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * useLeaderboard - Fetch and manage leaderboard data with period switching
 *
 * Features:
 * - Switch between all-time and weekly periods
 * - Infinite scroll pagination
 * - Pull-to-refresh
 * - Loading/error states
 * - Automatic refetch on period change
 * - Current user entry detection
 *
 * @example
 * ```tsx
 * const {
 *   entries,
 *   isLoading,
 *   period,
 *   setPeriod,
 *   refresh,
 *   loadMore,
 *   currentUserEntry,
 * } = useLeaderboard({ initialPeriod: 'all-time' });
 * ```
 */
export function useLeaderboard(
  options: UseLeaderboardOptions = {}
): UseLeaderboardReturn {
  const { initialPeriod = 'all-time', limit = 20, autoFetch = true } = options;

  // Auth state
  const { user, isInitialized } = useAuthStore();

  // State
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [pagination, setPagination] = useState<LeaderboardPagination | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriodState] = useState<LeaderboardPeriod>(initialPeriod);

  // Refs to prevent stale closures
  const currentPeriodRef = useRef(period);
  const isFetchingRef = useRef(false);

  // Update ref when period changes
  useEffect(() => {
    currentPeriodRef.current = period;
  }, [period]);

  // =====================================================
  // Fetch Logic
  // =====================================================

  /**
   * Fetch leaderboard from API
   */
  const fetchLeaderboardInternal = useCallback(
    async (page: number, isRefresh = false) => {
      // Prevent concurrent fetches
      if (isFetchingRef.current && !isRefresh) {
        return;
      }

      isFetchingRef.current = true;

      try {
        const result = await LeaderboardService.getLeaderboard(
          currentPeriodRef.current,
          { page, limit }
        );

        // Check if period changed during fetch
        if (currentPeriodRef.current !== period && !isRefresh) {
          isFetchingRef.current = false;
          return;
        }

        if (page === 1) {
          setEntries(result.leaderboard.entries);
        } else {
          setEntries((prev) => [...prev, ...result.leaderboard.entries]);
        }

        setLeaderboard(result.leaderboard);
        setPagination(result.pagination);
        setError(null);
      } catch (err: any) {
        console.error('[useLeaderboard] Fetch error:', err);
        setError(err.message || 'Failed to load leaderboard');
      } finally {
        isFetchingRef.current = false;
      }
    },
    [period, limit]
  );

  // =====================================================
  // Period Change Handler
  // =====================================================

  /**
   * Change period and refetch
   */
  const setPeriod = useCallback((newPeriod: LeaderboardPeriod) => {
    if (newPeriod === currentPeriodRef.current) {
      return;
    }
    setPeriodState(newPeriod);
  }, []);

  // Auto-fetch on mount and period change
  // Leaderboard endpoints are public so no auth needed, but we wait for init anyway
  useEffect(() => {
    if (autoFetch && isInitialized) {
      setIsLoading(true);
      setEntries([]);
      setPagination(null);
      setError(null);
      fetchLeaderboardInternal(1).finally(() => setIsLoading(false));
    }
  }, [period, autoFetch, fetchLeaderboardInternal, isInitialized]);

  // =====================================================
  // Refresh Handler
  // =====================================================

  /**
   * Pull-to-refresh handler
   */
  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setError(null);
    await fetchLeaderboardInternal(1, true);
    setIsRefreshing(false);
  }, [isRefreshing, fetchLeaderboardInternal]);

  // =====================================================
  // Load More Handler
  // =====================================================

  /**
   * Load next page of results
   */
  const loadMore = useCallback(async () => {
    // Guards
    if (isLoadingMore || isLoading || isRefreshing) return;
    if (!pagination?.hasNext) return;

    setIsLoadingMore(true);
    await fetchLeaderboardInternal(pagination.page + 1);
    setIsLoadingMore(false);
  }, [isLoadingMore, isLoading, isRefreshing, pagination, fetchLeaderboardInternal]);

  // =====================================================
  // Current User Entry
  // =====================================================

  const currentUserEntry = entries.find((e) => e.userId === user?.id) || null;

  // =====================================================
  // Return
  // =====================================================

  return {
    entries,
    leaderboard,
    pagination,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    period,
    setPeriod,
    refresh,
    loadMore,
    currentUserEntry,
  };
}

export default useLeaderboard;
