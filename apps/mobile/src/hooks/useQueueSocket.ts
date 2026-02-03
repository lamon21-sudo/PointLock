// =====================================================
// Queue Socket Hook
// =====================================================
// Subscribes to queue-related socket events (queue:expired, match:created).
// Use this hook in the queue waiting screen to receive real-time updates.

import { useEffect } from 'react';
import SocketService from '../services/socket.service';
import { useQueueStore } from '../stores/queue.store';
import type { QueueExpiredPayload } from '../types/socket.types';

/**
 * Hook to subscribe to queue-related socket events.
 * Should be used in the queue waiting screen.
 *
 * Subscribes to:
 * - queue:expired: When queue entry times out
 * - match:created: When a match is found (backup for polling)
 */
export function useQueueSocket(): void {
  const _setQueueExpired = useQueueStore((state) => state._setQueueExpired);
  const _setMatchFound = useQueueStore((state) => state._setMatchFound);

  useEffect(() => {
    const socket = SocketService.getInstance();

    // Subscribe to queue:expired event
    const expiredListenerId = socket.subscribe<QueueExpiredPayload>(
      'queue:expired',
      (payload) => {
        if (__DEV__) {
          console.log('[useQueueSocket] Received queue:expired', payload);
        }
        _setQueueExpired(payload.reason, payload.stakeAmount);
      }
    );

    // Subscribe to match:created event as backup
    // (polling should catch this, but socket is faster)
    const matchCreatedListenerId = socket.subscribe<{
      matchId: string;
      gameMode: string;
      stakeAmount: number;
      opponent: { userId: string; username: string; skillRating: number };
      role: 'creator' | 'opponent';
      createdAt: string;
    }>('match:created' as any, (payload) => {
      if (__DEV__) {
        console.log('[useQueueSocket] Received match:created', payload);
      }
      _setMatchFound(payload.matchId, {
        id: payload.matchId,
        type: 'public',
        stakeAmount: payload.stakeAmount,
        status: 'matched',
        inviteCode: null,
        createdAt: payload.createdAt,
      });
    });

    // Cleanup on unmount
    return () => {
      socket.unsubscribe(expiredListenerId);
      socket.unsubscribe(matchCreatedListenerId);
    };
  }, [_setQueueExpired, _setMatchFound]);
}

export default useQueueSocket;
