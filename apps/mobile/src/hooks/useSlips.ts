// =====================================================
// useSlips Hook
// =====================================================
// Custom hook for fetching and managing user slips.
// Supports filtering, pagination, and pull-to-refresh.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import {
  getUserSlips,
  getSlipById,
  ApiSlipResponse,
} from '../services/slip.service';
import {
  SlipFilterType,
  SlipPaginationMeta,
  SLIP_FILTER_CONFIG,
} from '../types/api-slip.types';

// =====================================================
// Types
// =====================================================

interface UseSlipsOptions {
  /** Initial filter type */
  initialFilter?: SlipFilterType;
  /** Items per page */
  limit?: number;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseSlipsReturn {
  /** List of slips */
  slips: ApiSlipResponse[];
  /** Pagination metadata */
  pagination: SlipPaginationMeta | null;
  /** Initial loading state */
  isLoading: boolean;
  /** Loading more items state */
  isLoadingMore: boolean;
  /** Pull-to-refresh state */
  isRefreshing: boolean;
  /** Error message if any */
  error: string | null;
  /** Current filter */
  filter: SlipFilterType;
  /** Set filter (triggers refetch) */
  setFilter: (filter: SlipFilterType) => void;
  /** Pull-to-refresh handler */
  refresh: () => Promise<void>;
  /** Load more items handler */
  loadMore: () => Promise<void>;
  /** Manual fetch trigger */
  fetchSlips: () => Promise<void>;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * useSlips - Fetch and manage user slips with filtering and pagination
 *
 * Features:
 * - Filter by status group (draft, active, completed)
 * - Infinite scroll pagination
 * - Pull-to-refresh
 * - Loading/error states
 * - Automatic refetch on filter change
 *
 * @example
 * ```tsx
 * const {
 *   slips,
 *   isLoading,
 *   filter,
 *   setFilter,
 *   refresh,
 *   loadMore,
 * } = useSlips({ initialFilter: 'active' });
 * ```
 */
export function useSlips(options: UseSlipsOptions = {}): UseSlipsReturn {
  const {
    initialFilter = 'active',
    limit = 20,
    autoFetch = true,
  } = options;

  // State
  const [slips, setSlips] = useState<ApiSlipResponse[]>([]);
  const [pagination, setPagination] = useState<SlipPaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<SlipFilterType>(initialFilter);

  // Refs to prevent stale closures
  const currentFilterRef = useRef(filter);
  const isFetchingRef = useRef(false);

  // Update ref when filter changes
  useEffect(() => {
    currentFilterRef.current = filter;
  }, [filter]);

  // =====================================================
  // Fetch Logic
  // =====================================================

  /**
   * Fetch slips from API
   */
  const fetchSlipsInternal = useCallback(
    async (page: number, isRefresh = false) => {
      // Prevent concurrent fetches
      if (isFetchingRef.current && !isRefresh) {
        return;
      }

      isFetchingRef.current = true;
      const filterConfig = SLIP_FILTER_CONFIG[currentFilterRef.current];
      const statusParam = filterConfig.apiStatuses.join(',');

      try {
        const result = await getUserSlips({
          status: statusParam,
          page,
          limit,
        });

        // Check if filter changed during fetch
        if (currentFilterRef.current !== filter && !isRefresh) {
          isFetchingRef.current = false;
          return;
        }

        if (page === 1) {
          setSlips(result.slips);
        } else {
          setSlips((prev) => [...prev, ...result.slips]);
        }

        setPagination({
          ...result.pagination,
          hasNext: result.pagination.page < result.pagination.totalPages,
          hasPrev: result.pagination.page > 1,
        });
        setError(null);
      } catch (err: any) {
        console.error('[useSlips] Fetch error:', err);
        setError(err.message || 'Failed to load slips');
      } finally {
        isFetchingRef.current = false;
      }
    },
    [filter, limit]
  );

  /**
   * Public fetch function
   */
  const fetchSlips = useCallback(async () => {
    setIsLoading(true);
    setSlips([]);
    setPagination(null);
    await fetchSlipsInternal(1);
    setIsLoading(false);
  }, [fetchSlipsInternal]);

  // =====================================================
  // Filter Change Handler
  // =====================================================

  /**
   * Change filter and refetch
   */
  const setFilter = useCallback((newFilter: SlipFilterType) => {
    if (newFilter === currentFilterRef.current) {
      return;
    }
    setFilterState(newFilter);
  }, []);

  // Auto-fetch on mount - but ONLY if auth is initialized
  // This prevents race condition where requests fire before tokens are loaded
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (autoFetch && isInitialized) {
      setIsLoading(true);
      setSlips([]);
      setPagination(null);
      setError(null);
      fetchSlipsInternal(1).finally(() => setIsLoading(false));
    }
  }, [filter, autoFetch, fetchSlipsInternal, isInitialized]);

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
    await fetchSlipsInternal(1, true);
    setIsRefreshing(false);
  }, [isRefreshing, fetchSlipsInternal]);

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
    await fetchSlipsInternal(pagination.page + 1);
    setIsLoadingMore(false);
  }, [isLoadingMore, isLoading, isRefreshing, pagination, fetchSlipsInternal]);

  // =====================================================
  // Return
  // =====================================================

  return {
    slips,
    pagination,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    filter,
    setFilter,
    refresh,
    loadMore,
    fetchSlips,
  };
}

// =====================================================
// useSlipDetail Hook
// =====================================================

interface UseSlipDetailOptions {
  /** Slip ID to fetch */
  slipId: string;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseSlipDetailReturn {
  /** Slip data */
  slip: ApiSlipResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refresh the slip data */
  refresh: () => Promise<void>;
}

/**
 * useSlipDetail - Fetch a single slip by ID
 *
 * @example
 * ```tsx
 * const { slip, isLoading, error } = useSlipDetail({ slipId: 'abc123' });
 * ```
 */
export function useSlipDetail(options: UseSlipDetailOptions): UseSlipDetailReturn {
  const { slipId, autoFetch = true } = options;

  const [slip, setSlip] = useState<ApiSlipResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wait for auth initialization before fetching
  // This prevents 401 errors when navigating directly to a slip detail page
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const fetchSlip = useCallback(async () => {
    if (!slipId) {
      setError('No slip ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getSlipById(slipId);
      setSlip(result);
    } catch (err: any) {
      console.error('[useSlipDetail] Fetch error:', err);
      setError(err.message || 'Failed to load slip');
      setSlip(null);
    } finally {
      setIsLoading(false);
    }
  }, [slipId]);

  // Auto-fetch on mount - but ONLY if auth is initialized
  // This prevents race condition where requests fire before tokens are loaded
  useEffect(() => {
    if (autoFetch && isInitialized) {
      fetchSlip();
    }
  }, [autoFetch, fetchSlip, isInitialized]);

  return {
    slip,
    isLoading,
    error,
    refresh: fetchSlip,
  };
}

export default useSlips;
