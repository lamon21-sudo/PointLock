// =====================================================
// Queue Store
// =====================================================
// Zustand store for matchmaking queue state management.
// Handles queue status, polling, and match found events.

import { create } from 'zustand';
import {
  MatchmakingService,
  QueueEntryInfo,
  QueueEntryStatus,
  MatchDetails,
} from '../services/matchmaking.service';
import { withRetry } from '../utils/retryWrapper';

// =====================================================
// Types
// =====================================================

interface QueueState {
  // Queue Status
  inQueue: boolean;
  queueEntry: QueueEntryInfo | null;
  position: number | null;
  estimatedWaitMs: number | null;
  gameMode: string | null;

  // Match Found
  matchId: string | null;
  matchDetails: MatchDetails | null;

  // Queue Expiration
  hasExpired: boolean;
  expiredReason: string | null;
  refundedAmount: number | null;

  // Loading States
  isJoiningQueue: boolean;
  isLeavingQueue: boolean;
  isFetchingStatus: boolean;

  // Error
  queueError: string | null;

  // Timestamps
  lastUpdated: number | null;

  // Polling (internal)
  _pollingInterval: ReturnType<typeof setInterval> | null;
  _pollIntervalMs: number;

  // Actions
  joinQuickMatch: (slipId: string, stakeAmount: number, region?: string) => Promise<boolean>;
  joinRandomMatch: (slipId: string, stakeAmount: number, lobbyExpiresIn?: number) => Promise<MatchDetails | null>;
  challengeFriend: (userId: string, slipId: string, stakeAmount: number, message?: string) => Promise<MatchDetails | null>;
  leaveQueue: () => Promise<boolean>;
  fetchQueueStatus: () => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
  resetQueue: () => void;
  clearError: () => void;
  clearExpiredState: () => void;

  // Internal
  _setMatchFound: (matchId: string, details?: MatchDetails) => void;
  _setQueueExpired: (reason: string, refundedAmount: number) => void;
}

// =====================================================
// Initial State
// =====================================================

const initialState = {
  inQueue: false,
  queueEntry: null,
  position: null,
  estimatedWaitMs: null,
  gameMode: null,
  matchId: null,
  matchDetails: null,
  // Queue Expiration
  hasExpired: false,
  expiredReason: null,
  refundedAmount: null,
  // Loading States
  isJoiningQueue: false,
  isLeavingQueue: false,
  isFetchingStatus: false,
  queueError: null,
  lastUpdated: null,
  _pollingInterval: null,
  _pollIntervalMs: 3000,
};

// =====================================================
// Store
// =====================================================

export const useQueueStore = create<QueueState>((set, get) => ({
  ...initialState,

  /**
   * Join the quick match queue.
   * Uses POST /matches/quick which delegates to matchmaking service.
   * Includes retry logic with exponential backoff for transient failures.
   * @returns true if successfully joined queue or matched immediately.
   */
  joinQuickMatch: async (
    slipId: string,
    stakeAmount: number,
    region?: string
  ): Promise<boolean> => {
    const { isJoiningQueue, inQueue } = get();

    // Prevent double-join
    if (isJoiningQueue || inQueue) {
      console.log('[QueueStore] Already joining or in queue, skipping');
      return false;
    }

    set({ isJoiningQueue: true, queueError: null });

    // Generate idempotency key using slipId as natural boundary
    // A slip can only be enqueued once (gets locked), so slipId is sufficient
    // This ensures idempotency even across app restarts
    const idempotencyKey = `quick_${slipId}`;

    try {
      // Wrap API call with retry logic (exponential backoff)
      const result = await withRetry(
        () =>
          MatchmakingService.quickMatch({
            slipId,
            stakeAmount,
            region,
            idempotencyKey,
          }),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 8000,
          onRetry: (attempt, error, delayMs) => {
            if (__DEV__) {
              console.log(
                `[QueueStore] joinQuickMatch retry ${attempt}, waiting ${delayMs}ms:`,
                error.message
              );
            }
          },
        }
      );

      // Check if all retries failed
      if (!result.success || !result.data) {
        const message = result.error?.message || 'Failed to join queue after retries';
        set({ queueError: message, isJoiningQueue: false });
        console.error('[QueueStore] joinQuickMatch failed after retries:', result.error);
        return false;
      }

      const response = result.data;

      // Check if immediately matched
      if (response.status === 'MATCHED' && response.match) {
        set({
          inQueue: false,
          matchId: response.match.id,
          matchDetails: response.match,
          gameMode: 'QUICK_MATCH',
          isJoiningQueue: false,
          lastUpdated: Date.now(),
        });
        return true;
      }

      // Added to queue
      if (response.queueEntry) {
        set({
          inQueue: true,
          queueEntry: response.queueEntry,
          gameMode: 'QUICK_MATCH',
          isJoiningQueue: false,
          lastUpdated: Date.now(),
        });

        // Auto-start polling
        get().startPolling();
        return true;
      }

      set({ isJoiningQueue: false });
      return false;
    } catch (error) {
      // This catch handles errors from withRetry itself (unlikely)
      const message = error instanceof Error ? error.message : 'Failed to join queue';
      set({ queueError: message, isJoiningQueue: false });
      console.error('[QueueStore] joinQuickMatch error:', error);
      return false;
    }
  },

  /**
   * Create a random match lobby.
   * @returns Match details on success, null on failure.
   */
  joinRandomMatch: async (
    slipId: string,
    stakeAmount: number,
    lobbyExpiresIn?: number
  ): Promise<MatchDetails | null> => {
    if (get().isJoiningQueue) {
      console.log('[QueueStore] Already joining, skipping');
      return null;
    }

    set({ isJoiningQueue: true, queueError: null });

    try {
      const response = await MatchmakingService.randomMatch({
        slipId,
        stakeAmount,
        lobbyExpiresIn,
      });

      set({
        matchId: response.match.id,
        matchDetails: response.match,
        gameMode: 'RANDOM',
        isJoiningQueue: false,
        lastUpdated: Date.now(),
      });

      return response.match;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create lobby';
      set({ queueError: message, isJoiningQueue: false });
      console.error('[QueueStore] joinRandomMatch error:', error);
      return null;
    }
  },

  /**
   * Challenge a friend directly.
   * @returns Match details on success, null on failure.
   */
  challengeFriend: async (
    userId: string,
    slipId: string,
    stakeAmount: number,
    message?: string
  ): Promise<MatchDetails | null> => {
    if (get().isJoiningQueue) {
      console.log('[QueueStore] Already joining, skipping');
      return null;
    }

    set({ isJoiningQueue: true, queueError: null });

    try {
      const response = await MatchmakingService.challengeFriend(userId, {
        slipId,
        stakeAmount,
        message,
      });

      set({
        matchId: response.match.id,
        matchDetails: response.match,
        gameMode: 'FRIEND_CHALLENGE',
        isJoiningQueue: false,
        lastUpdated: Date.now(),
      });

      return response.match;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send challenge';
      set({ queueError: message, isJoiningQueue: false });
      console.error('[QueueStore] challengeFriend error:', error);
      return null;
    }
  },

  /**
   * Leave the matchmaking queue.
   * @returns true if successfully left the queue.
   */
  leaveQueue: async (): Promise<boolean> => {
    const { inQueue, gameMode, isLeavingQueue } = get();

    // Can't leave if not in queue or already leaving
    if (!inQueue || isLeavingQueue) {
      console.log('[QueueStore] Not in queue or already leaving');
      return false;
    }

    set({ isLeavingQueue: true, queueError: null });

    // Stop polling immediately
    get().stopPolling();

    try {
      const response = await MatchmakingService.leaveQueue(gameMode || 'QUICK_MATCH');

      // Reset queue state regardless of refund status
      set({
        inQueue: false,
        queueEntry: null,
        position: null,
        estimatedWaitMs: null,
        isLeavingQueue: false,
        lastUpdated: Date.now(),
      });

      return response.success;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave queue';
      set({ queueError: message, isLeavingQueue: false });
      console.error('[QueueStore] leaveQueue error:', error);
      return false;
    }
  },

  /**
   * Fetch current queue status from server.
   */
  fetchQueueStatus: async (): Promise<void> => {
    // Skip if already fetching (prevent overlapping requests)
    if (get().isFetchingStatus) {
      return;
    }

    set({ isFetchingStatus: true });

    try {
      const status = await MatchmakingService.getQueueStatus();

      // Check for match found
      if (status.entry?.status === 'MATCHED' && status.entry.matchId) {
        get()._setMatchFound(status.entry.matchId);
        return;
      }

      // Check for queue expiration
      if (status.entry?.status === 'EXPIRED') {
        get()._setQueueExpired(
          'Queue search timed out. Your stake has been refunded.',
          status.entry.stakeAmount ?? 0
        );
        return;
      }

      // Check for queue cancellation
      if (status.entry?.status === 'CANCELLED') {
        set({
          inQueue: false,
          queueEntry: null,
          position: null,
          estimatedWaitMs: null,
          queueError: 'Queue entry was cancelled',
          isFetchingStatus: false,
          lastUpdated: Date.now(),
        });
        get().stopPolling();
        return;
      }

      // Update status
      set({
        inQueue: status.inQueue,
        queueEntry: status.entry,
        position: status.position ?? null,
        estimatedWaitMs: status.estimatedWaitMs ?? null,
        isFetchingStatus: false,
        lastUpdated: Date.now(),
      });

      // Stop polling if no longer in queue
      if (!status.inQueue) {
        get().stopPolling();
      }
    } catch (error) {
      // POLLING RESILIENCE: Don't set queueError on transient polling failures
      // The polling will automatically retry on the next interval
      // Setting an error here would disrupt the UI for temporary network hiccups
      set({ isFetchingStatus: false });

      if (__DEV__) {
        console.warn(
          '[QueueStore] fetchQueueStatus transient error (will retry):',
          error instanceof Error ? error.message : error
        );
      }

      // Note: We don't stop polling here - let it continue and retry
      // The next poll cycle may succeed
    }
  },

  /**
   * Start polling for queue status.
   * Prevents duplicate intervals.
   * @param intervalMs - Polling interval in milliseconds (default 3000).
   */
  startPolling: (intervalMs = 3000): void => {
    const { _pollingInterval } = get();

    // Already polling - don't start another
    if (_pollingInterval !== null) {
      console.log('[QueueStore] Polling already active');
      return;
    }

    if (__DEV__) {
      console.log(`[QueueStore] Starting polling every ${intervalMs}ms`);
    }

    set({ _pollIntervalMs: intervalMs });

    const interval = setInterval(() => {
      const state = get();

      // Auto-stop conditions
      if (state.matchId) {
        if (__DEV__) {
          console.log('[QueueStore] Match found - stopping polling');
        }
        get().stopPolling();
        return;
      }

      if (!state.inQueue) {
        if (__DEV__) {
          console.log('[QueueStore] No longer in queue - stopping polling');
        }
        get().stopPolling();
        return;
      }

      // Fetch status
      get().fetchQueueStatus();
    }, intervalMs);

    set({ _pollingInterval: interval });
  },

  /**
   * Stop polling for queue status.
   */
  stopPolling: (): void => {
    const { _pollingInterval } = get();

    if (_pollingInterval !== null) {
      if (__DEV__) {
        console.log('[QueueStore] Stopping polling');
      }
      clearInterval(_pollingInterval);
      set({ _pollingInterval: null });
    }
  },

  /**
   * Reset queue state to initial values.
   * Call on logout or when leaving queue screen.
   */
  resetQueue: (): void => {
    // Stop polling first
    get().stopPolling();

    set({
      ...initialState,
      // Ensure expiration state is also reset
      hasExpired: false,
      expiredReason: null,
      refundedAmount: null,
      _pollingInterval: null,
    });
  },

  /**
   * Clear error state.
   */
  clearError: (): void => {
    set({ queueError: null });
  },

  /**
   * Clear expired state (for retry flow).
   */
  clearExpiredState: (): void => {
    set({
      hasExpired: false,
      expiredReason: null,
      refundedAmount: null,
      queueError: null,
    });
  },

  /**
   * Internal: Handle match found event.
   */
  _setMatchFound: (matchId: string, details?: MatchDetails): void => {
    if (__DEV__) {
      console.log('[QueueStore] Match found!', matchId);
    }

    // Stop polling
    get().stopPolling();

    set({
      inQueue: false,
      matchId,
      matchDetails: details ?? null,
      queueEntry: null,
      position: null,
      estimatedWaitMs: null,
      isFetchingStatus: false,
      lastUpdated: Date.now(),
    });
  },

  /**
   * Internal: Handle queue expired event.
   * Called when queue entry times out without finding a match.
   */
  _setQueueExpired: (reason: string, refundedAmount: number): void => {
    if (__DEV__) {
      console.log('[QueueStore] Queue expired!', reason);
    }

    // Stop polling
    get().stopPolling();

    set({
      inQueue: false,
      hasExpired: true,
      expiredReason: reason,
      refundedAmount,
      queueEntry: null,
      position: null,
      estimatedWaitMs: null,
      isFetchingStatus: false,
      lastUpdated: Date.now(),
    });
  },
}));

// =====================================================
// Selectors
// =====================================================

export const selectIsInQueue = (state: QueueState): boolean => state.inQueue;
export const selectQueuePosition = (state: QueueState): number | null => state.position;
export const selectEstimatedWait = (state: QueueState): number | null => state.estimatedWaitMs;
export const selectMatchFound = (state: QueueState): boolean => state.matchId !== null;
export const selectIsQueueLoading = (state: QueueState): boolean =>
  state.isJoiningQueue || state.isLeavingQueue || state.isFetchingStatus;
export const selectQueueError = (state: QueueState): string | null => state.queueError;
export const selectHasExpired = (state: QueueState): boolean => state.hasExpired;
export const selectExpiredReason = (state: QueueState): string | null => state.expiredReason;
export const selectRefundedAmount = (state: QueueState): number | null => state.refundedAmount;

// =====================================================
// Convenience Hooks
// =====================================================

export function useIsInQueue(): boolean {
  return useQueueStore(selectIsInQueue);
}

export function useMatchFound(): boolean {
  return useQueueStore(selectMatchFound);
}

export function useQueuePosition(): number | null {
  return useQueueStore(selectQueuePosition);
}

export function useQueueError(): string | null {
  return useQueueStore(selectQueueError);
}

export default useQueueStore;
