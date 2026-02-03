// =====================================================
// useFriends Hook
// =====================================================
// Custom hook for fetching and managing friends data.
// Supports tab switching, pagination, and pull-to-refresh.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { FriendsService } from '../services/friends.service';
import type {
  Friendship,
  FriendsTab,
  FriendsPagination,
} from '../types/friends.types';

// =====================================================
// Types
// =====================================================

interface UseFriendsOptions {
  /** Initial tab selection */
  initialTab?: FriendsTab;
  /** Items per page */
  limit?: number;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseFriendsReturn {
  /** List of accepted friends */
  friends: Friendship[];
  /** List of incoming friend requests */
  requests: Friendship[];
  /** Friends pagination metadata */
  pagination: FriendsPagination | null;
  /** Requests pagination metadata */
  requestsPagination: FriendsPagination | null;
  /** Current active tab */
  activeTab: FriendsTab;
  /** Set active tab */
  setActiveTab: (tab: FriendsTab) => void;
  /** Initial loading state */
  isLoading: boolean;
  /** Loading more items state */
  isLoadingMore: boolean;
  /** Pull-to-refresh state */
  isRefreshing: boolean;
  /** Error message if any */
  error: string | null;
  /** Pull-to-refresh handler */
  refresh: () => Promise<void>;
  /** Load more items handler */
  loadMore: () => Promise<void>;
  /** Accept friend request */
  acceptRequest: (friendshipId: string) => Promise<void>;
  /** Decline friend request */
  declineRequest: (friendshipId: string) => Promise<void>;
  /** Remove friend */
  removeFriend: (friendshipId: string) => Promise<void>;
  /** Friend count */
  friendCount: number;
  /** Request count */
  requestCount: number;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * useFriends - Fetch and manage friends data with tab switching
 *
 * Features:
 * - Switch between friends and requests tabs
 * - Infinite scroll pagination
 * - Pull-to-refresh
 * - Loading/error states
 * - Automatic refetch on tab change
 * - Friend actions (accept, decline, remove)
 *
 * @example
 * ```tsx
 * const {
 *   friends,
 *   requests,
 *   isLoading,
 *   activeTab,
 *   setActiveTab,
 *   refresh,
 *   acceptRequest,
 * } = useFriends({ initialTab: 'friends' });
 * ```
 */
export function useFriends(options: UseFriendsOptions = {}): UseFriendsReturn {
  const { initialTab = 'friends', limit = 20, autoFetch = true } = options;

  // Auth state
  const { user, isInitialized } = useAuthStore();

  // State
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<Friendship[]>([]);
  const [pagination, setPagination] = useState<FriendsPagination | null>(null);
  const [requestsPagination, setRequestsPagination] =
    useState<FriendsPagination | null>(null);
  const [activeTab, setActiveTab] = useState<FriendsTab>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to prevent stale closures and concurrent fetches
  const currentTabRef = useRef(activeTab);
  const isFetchingFriendsRef = useRef(false);
  const isFetchingRequestsRef = useRef(false);

  // Update ref when tab changes
  useEffect(() => {
    currentTabRef.current = activeTab;
  }, [activeTab]);

  // =====================================================
  // Fetch Logic
  // =====================================================

  /**
   * Fetch accepted friends from API
   */
  const fetchFriends = useCallback(
    async (page: number, isRefresh = false) => {
      // Prevent concurrent fetches
      if (isFetchingFriendsRef.current && !isRefresh) {
        return;
      }

      isFetchingFriendsRef.current = true;

      try {
        const result = await FriendsService.getFriends({
          filter: 'accepted',
          page,
          limit,
        });

        if (page === 1) {
          setFriends(result.friendships);
        } else {
          setFriends((prev) => [...prev, ...result.friendships]);
        }

        setPagination(result.pagination);
        setError(null);
      } catch (err: any) {
        console.error('[useFriends] Fetch friends error:', err);
        setError(err.message || 'Failed to load friends');
      } finally {
        isFetchingFriendsRef.current = false;
      }
    },
    [limit]
  );

  /**
   * Fetch incoming friend requests from API
   */
  const fetchRequests = useCallback(
    async (page: number, isRefresh = false) => {
      // Prevent concurrent fetches
      if (isFetchingRequestsRef.current && !isRefresh) {
        return;
      }

      isFetchingRequestsRef.current = true;

      try {
        const result = await FriendsService.getIncomingRequests(page, limit);

        if (page === 1) {
          setRequests(result.friendships);
        } else {
          setRequests((prev) => [...prev, ...result.friendships]);
        }

        setRequestsPagination(result.pagination);
        setError(null);
      } catch (err: any) {
        console.error('[useFriends] Fetch requests error:', err);
        setError(err.message || 'Failed to load requests');
      } finally {
        isFetchingRequestsRef.current = false;
      }
    },
    [limit]
  );

  // =====================================================
  // Initial Fetch (both friends and requests)
  // =====================================================

  // Fetch both lists on mount
  useEffect(() => {
    if (autoFetch && isInitialized && user) {
      setIsLoading(true);
      setError(null);

      Promise.all([fetchFriends(1), fetchRequests(1)]).finally(() =>
        setIsLoading(false)
      );
    }
  }, [autoFetch, isInitialized, user, fetchFriends, fetchRequests]);

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

    // Refresh both lists regardless of active tab
    await Promise.all([fetchFriends(1, true), fetchRequests(1, true)]);

    setIsRefreshing(false);
  }, [isRefreshing, fetchFriends, fetchRequests]);

  // =====================================================
  // Load More Handler
  // =====================================================

  /**
   * Load next page of results for active tab
   */
  const loadMore = useCallback(async () => {
    // Guards
    if (isLoadingMore || isLoading || isRefreshing) return;

    const currentPagination =
      activeTab === 'friends' ? pagination : requestsPagination;

    if (!currentPagination?.hasNext) return;

    setIsLoadingMore(true);

    if (activeTab === 'friends') {
      await fetchFriends(currentPagination.page + 1);
    } else {
      await fetchRequests(currentPagination.page + 1);
    }

    setIsLoadingMore(false);
  }, [
    isLoadingMore,
    isLoading,
    isRefreshing,
    activeTab,
    pagination,
    requestsPagination,
    fetchFriends,
    fetchRequests,
  ]);

  // =====================================================
  // Friend Actions
  // =====================================================

  /**
   * Accept a friend request
   */
  const acceptRequest = useCallback(
    async (friendshipId: string) => {
      try {
        await FriendsService.acceptRequest(friendshipId);

        // Remove from requests list
        setRequests((prev) => prev.filter((r) => r.id !== friendshipId));

        // Refetch friends to include newly accepted friend
        await fetchFriends(1, true);

        // Update request count
        if (requestsPagination) {
          setRequestsPagination({
            ...requestsPagination,
            total: requestsPagination.total - 1,
          });
        }
      } catch (err: any) {
        console.error('[useFriends] Accept request error:', err);
        throw err;
      }
    },
    [fetchFriends, requestsPagination]
  );

  /**
   * Decline a friend request
   */
  const declineRequest = useCallback(
    async (friendshipId: string) => {
      try {
        await FriendsService.declineRequest(friendshipId);

        // Remove from requests list
        setRequests((prev) => prev.filter((r) => r.id !== friendshipId));

        // Update request count
        if (requestsPagination) {
          setRequestsPagination({
            ...requestsPagination,
            total: requestsPagination.total - 1,
          });
        }
      } catch (err: any) {
        console.error('[useFriends] Decline request error:', err);
        throw err;
      }
    },
    [requestsPagination]
  );

  /**
   * Remove a friend
   */
  const removeFriend = useCallback(async (friendshipId: string) => {
    try {
      await FriendsService.removeFriend(friendshipId);

      // Remove from friends list
      setFriends((prev) => prev.filter((f) => f.id !== friendshipId));

      // Update friend count
      setPagination((prev) =>
        prev ? { ...prev, total: prev.total - 1 } : null
      );
    } catch (err: any) {
      console.error('[useFriends] Remove friend error:', err);
      throw err;
    }
  }, []);

  // =====================================================
  // Return
  // =====================================================

  return {
    friends,
    requests,
    pagination,
    requestsPagination,
    activeTab,
    setActiveTab,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
    acceptRequest,
    declineRequest,
    removeFriend,
    friendCount: pagination?.total || 0,
    requestCount: requestsPagination?.total || 0,
  };
}

export default useFriends;
