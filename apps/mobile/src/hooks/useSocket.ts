// =====================================================
// useSocket Hook
// =====================================================
// General-purpose hook for WebSocket connection state and room management.
// Provides a React-friendly interface to the SocketService singleton.
//
// Usage:
// ```tsx
// const { isConnected, connectionState, joinMatch, leaveMatch } = useSocket();
// ```

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../stores/auth.store';
import SocketService from '../services/socket.service';
import type { ConnectionState } from '../types/socket.types';

/**
 * Return type for useSocket hook.
 */
export interface UseSocketReturn {
  /** Whether socket is currently connected */
  isConnected: boolean;
  /** Detailed connection state */
  connectionState: ConnectionState;
  /** Join a match room */
  joinMatch: (matchId: string) => Promise<void>;
  /** Leave a match room */
  leaveMatch: (matchId: string) => void;
  /** List of currently joined match IDs */
  joinedMatches: string[];
  /** Manual connect (usually automatic) */
  connect: () => Promise<void>;
  /** Manual disconnect */
  disconnect: () => void;
}

/**
 * Hook for WebSocket connection management.
 *
 * Provides connection state and room management methods.
 * Automatically connects when user is authenticated.
 *
 * @example
 * ```tsx
 * function MatchScreen() {
 *   const { isConnected, connectionState, joinMatch } = useSocket();
 *
 *   useEffect(() => {
 *     if (isConnected) {
 *       joinMatch('match-123');
 *     }
 *   }, [isConnected]);
 *
 *   return (
 *     <View>
 *       <ConnectionIndicator state={connectionState} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useSocket(): UseSocketReturn {
  const socketService = useMemo(() => SocketService.getInstance(), []);
  const { isAuthenticated } = useAuthStore();

  // Local state synced with socket service
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socketService.getConnectionState()
  );
  const [joinedMatches, setJoinedMatches] = useState<string[]>(
    socketService.getJoinedMatches()
  );

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = socketService.observeConnectionState((state) => {
      setConnectionState(state);
    });

    return unsubscribe;
  }, [socketService]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && socketService.getConnectionState() === 'disconnected') {
      socketService.connect().catch((error) => {
        console.error('[useSocket] Auto-connect failed:', error);
      });
    }
  }, [isAuthenticated, socketService]);

  // Update joined matches after operations
  const updateJoinedMatches = useCallback(() => {
    setJoinedMatches(socketService.getJoinedMatches());
  }, [socketService]);

  // Join a match room
  const joinMatch = useCallback(
    async (matchId: string): Promise<void> => {
      await socketService.joinMatch(matchId);
      updateJoinedMatches();
    },
    [socketService, updateJoinedMatches]
  );

  // Leave a match room
  const leaveMatch = useCallback(
    (matchId: string): void => {
      socketService.leaveMatch(matchId);
      updateJoinedMatches();
    },
    [socketService, updateJoinedMatches]
  );

  // Manual connect
  const connect = useCallback(async (): Promise<void> => {
    await socketService.connect();
  }, [socketService]);

  // Manual disconnect
  const disconnect = useCallback((): void => {
    socketService.disconnect();
  }, [socketService]);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    joinMatch,
    leaveMatch,
    joinedMatches,
    connect,
    disconnect,
  };
}

export default useSocket;
