// =====================================================
// useMatchSocket Hook
// =====================================================
// Match-specific WebSocket hook with auto-join/leave on mount/unmount.
// Handles real-time score and status updates for a specific match.
//
// Features:
// - Auto-join room on mount
// - Auto-leave room on unmount
// - Score update handling with timestamp validation
// - Status update handling with finalScore authority
// - Opponent presence tracking
// - Connection state awareness
//
// Audit Mitigations:
// - Timestamp comparison prevents stale score updates
// - isMounted flag prevents updates after unmount
// - AbortController for cancellable join operations
// - Deduplication via seenUpdates set

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import SocketService from '../services/socket.service';
import { useSocket } from './useSocket';
import type {
  EventScorePayload,
  EventStatusPayload,
  EventStatus,
  GameTime,
  OpponentPresence,
  JoinedMatchPayload,
  LeftMatchPayload,
  MatchSettledPayload,
} from '../types/socket.types';

// =====================================================
// Types
// =====================================================

/**
 * Score state for a single event.
 */
export interface EventScore {
  eventId: string;
  externalId: string;
  homeScore: number;
  awayScore: number;
  gameTime?: GameTime;
  status: EventStatus;
  lastUpdated: string;
}

/**
 * Options for useMatchSocket hook.
 */
export interface UseMatchSocketOptions {
  /** The match ID to subscribe to */
  matchId: string;
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * Return type for useMatchSocket hook.
 */
export interface UseMatchSocketReturn {
  /** Whether socket is connected */
  isConnected: boolean;
  /** Whether successfully joined the match room */
  isInRoom: boolean;
  /** Whether currently joining the room */
  isJoining: boolean;
  /** Join error message if any */
  joinError: string | null;
  /** Map of event scores by eventId */
  scores: Map<string, EventScore>;
  /** Opponent presence information */
  opponentPresence: OpponentPresence;
  /** Settlement data when match settles (null until settlement) */
  settlementData: MatchSettledPayload | null;
  /** Manually refresh/rejoin the room */
  refresh: () => Promise<void>;
}

// =====================================================
// Hook Implementation
// =====================================================

/**
 * Hook for real-time match updates.
 *
 * Automatically joins the match room on mount and leaves on unmount.
 * Subscribes to score and status updates for events in the match.
 *
 * @example
 * ```tsx
 * function MatchDetailScreen() {
 *   const { id } = useLocalSearchParams<{ id: string }>();
 *
 *   const {
 *     isConnected,
 *     isInRoom,
 *     scores,
 *     opponentPresence,
 *   } = useMatchSocket({ matchId: id });
 *
 *   return (
 *     <View>
 *       <ConnectionBadge connected={isConnected} inRoom={isInRoom} />
 *       {Array.from(scores.values()).map(score => (
 *         <ScoreCard key={score.eventId} score={score} />
 *       ))}
 *     </View>
 *   );
 * }
 * ```
 */
export function useMatchSocket(options: UseMatchSocketOptions): UseMatchSocketReturn {
  const { matchId, autoConnect = true } = options;
  const socketService = useMemo(() => SocketService.getInstance(), []);
  const { isConnected } = useSocket();
  const { user } = useAuthStore();
  const currentUserId = user?.id;

  // =====================================================
  // State
  // =====================================================

  const [isInRoom, setIsInRoom] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scores, setScores] = useState<Map<string, EventScore>>(new Map());
  const [opponentPresence, setOpponentPresence] = useState<OpponentPresence>({
    isPresent: false,
  });
  const [settlementData, setSettlementData] = useState<MatchSettledPayload | null>(null);

  // =====================================================
  // Refs for Audit Mitigations
  // =====================================================

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Track seen updates for deduplication
  const seenUpdatesRef = useRef(new Set<string>());

  // Track last update timestamp per event for ordering validation
  const lastUpdateTimesRef = useRef(new Map<string, string>());

  // AbortController for cancelling in-flight join
  const abortControllerRef = useRef<AbortController | null>(null);

  // =====================================================
  // Join Room
  // =====================================================

  const joinRoom = useCallback(async () => {
    if (!matchId || !isConnected) return;
    if (isJoining) return;

    // Cancel any previous in-flight join
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setIsJoining(true);
    setJoinError(null);

    try {
      await socketService.joinMatch(matchId, abortControllerRef.current.signal);

      if (isMountedRef.current) {
        setIsInRoom(true);
      }
    } catch (error: unknown) {
      if (isMountedRef.current) {
        const message = error instanceof Error ? error.message : 'Failed to join match';
        // Don't set error for abort
        if (message !== 'Join aborted') {
          setJoinError(message);
        }
        setIsInRoom(false);
      }
    } finally {
      if (isMountedRef.current) {
        setIsJoining(false);
      }
      abortControllerRef.current = null;
    }
  }, [matchId, isConnected, isJoining, socketService]);

  // =====================================================
  // Leave Room
  // =====================================================

  const leaveRoom = useCallback(() => {
    if (!matchId) return;

    // Cancel any in-flight join
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    socketService.leaveMatch(matchId);
    setIsInRoom(false);
  }, [matchId, socketService]);

  // =====================================================
  // Score Update Handler
  // =====================================================

  const handleScoreUpdate = useCallback(
    (payload: EventScorePayload) => {
      if (!isMountedRef.current) return;

      const { eventId, timestamp } = payload;

      // Deduplication: Check if we've seen this exact update
      const updateKey = `${eventId}-${timestamp}`;
      if (seenUpdatesRef.current.has(updateKey)) {
        return;
      }
      seenUpdatesRef.current.add(updateKey);

      // Limit seen updates set size to prevent memory bloat
      if (seenUpdatesRef.current.size > 100) {
        const arr = Array.from(seenUpdatesRef.current);
        seenUpdatesRef.current = new Set(arr.slice(-100));
      }

      // Timestamp validation: Reject stale updates
      const lastUpdateTime = lastUpdateTimesRef.current.get(eventId);
      if (lastUpdateTime && timestamp <= lastUpdateTime) {
        if (__DEV__) {
          console.warn(
            '[useMatchSocket] Rejecting stale score update:',
            timestamp,
            '<=',
            lastUpdateTime
          );
        }
        return;
      }

      // Update last timestamp
      lastUpdateTimesRef.current.set(eventId, timestamp);

      // Update scores state
      setScores((prev) => {
        const updated = new Map(prev);
        const existingScore = updated.get(eventId);

        updated.set(eventId, {
          eventId: payload.eventId,
          externalId: payload.externalId,
          homeScore: payload.homeScore,
          awayScore: payload.awayScore,
          gameTime: payload.gameTime,
          status: existingScore?.status ?? 'LIVE',
          lastUpdated: timestamp,
        });

        return updated;
      });
    },
    []
  );

  // =====================================================
  // Status Update Handler
  // =====================================================

  const handleStatusUpdate = useCallback(
    (payload: EventStatusPayload) => {
      if (!isMountedRef.current) return;

      const { eventId, status, timestamp, finalScore } = payload;

      // Update last timestamp
      lastUpdateTimesRef.current.set(eventId, timestamp);

      setScores((prev) => {
        const updated = new Map(prev);
        const existingScore = updated.get(eventId);

        // Use finalScore as authoritative source when COMPLETED
        // This handles the race condition where status arrives before final score
        if (status === 'COMPLETED' && finalScore) {
          updated.set(eventId, {
            eventId: payload.eventId,
            externalId: payload.externalId,
            homeScore: finalScore.homeScore,
            awayScore: finalScore.awayScore,
            gameTime: existingScore?.gameTime,
            status: 'COMPLETED',
            lastUpdated: timestamp,
          });
        } else if (existingScore) {
          // Update status only
          updated.set(eventId, {
            ...existingScore,
            status,
            lastUpdated: timestamp,
          });
        } else {
          // No existing score - create placeholder
          updated.set(eventId, {
            eventId: payload.eventId,
            externalId: payload.externalId,
            homeScore: 0,
            awayScore: 0,
            status,
            lastUpdated: timestamp,
          });
        }

        return updated;
      });
    },
    []
  );

  // =====================================================
  // Opponent Presence Handlers
  // =====================================================

  const handleUserJoined = useCallback(
    (payload: JoinedMatchPayload) => {
      if (!isMountedRef.current) return;

      // Ignore our own join event
      if (payload.userId === currentUserId) return;

      setOpponentPresence({
        isPresent: true,
        userId: payload.userId,
        username: payload.username,
        lastSeen: payload.timestamp,
      });
    },
    [currentUserId]
  );

  const handleUserLeft = useCallback(
    (payload: LeftMatchPayload) => {
      if (!isMountedRef.current) return;

      // Ignore our own leave event
      if (payload.userId === currentUserId) return;

      setOpponentPresence((prev) => {
        // Only update if this is the opponent who left
        if (prev.userId === payload.userId) {
          return {
            isPresent: false,
            userId: payload.userId,
            username: payload.username,
            lastSeen: payload.timestamp,
          };
        }
        return prev;
      });
    },
    [currentUserId]
  );

  // =====================================================
  // Match Settlement Handler
  // =====================================================

  const handleMatchSettled = useCallback(
    (payload: MatchSettledPayload) => {
      if (!isMountedRef.current) return;

      // Only process if this is for our match
      if (payload.matchId !== matchId) return;

      if (__DEV__) {
        console.log('[useMatchSocket] Match settled:', payload);
      }

      setSettlementData(payload);
    },
    [matchId]
  );

  // =====================================================
  // Effects
  // =====================================================

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Subscribe to events
  useEffect(() => {
    const listenerIds: string[] = [];

    // Subscribe to score updates
    const scoreListenerId = socketService.subscribe<EventScorePayload>(
      'event:score',
      handleScoreUpdate
    );
    listenerIds.push(scoreListenerId);

    // Subscribe to status updates
    const statusListenerId = socketService.subscribe<EventStatusPayload>(
      'event:status',
      handleStatusUpdate
    );
    listenerIds.push(statusListenerId);

    // Subscribe to user joined
    const joinedListenerId = socketService.subscribe<JoinedMatchPayload>(
      'joined:match',
      handleUserJoined
    );
    listenerIds.push(joinedListenerId);

    // Subscribe to user left
    const leftListenerId = socketService.subscribe<LeftMatchPayload>(
      'left:match',
      handleUserLeft
    );
    listenerIds.push(leftListenerId);

    // Subscribe to match settlement
    const settledListenerId = socketService.subscribe<MatchSettledPayload>(
      'match:settled',
      handleMatchSettled
    );
    listenerIds.push(settledListenerId);

    return () => {
      // Unsubscribe from all events
      for (const listenerId of listenerIds) {
        socketService.unsubscribe(listenerId);
      }
    };
  }, [socketService, handleScoreUpdate, handleStatusUpdate, handleUserJoined, handleUserLeft, handleMatchSettled]);

  // Auto-join on mount and reconnection
  useEffect(() => {
    if (autoConnect && isConnected && !isInRoom && !isJoining) {
      joinRoom();
    }
  }, [autoConnect, isConnected, isInRoom, isJoining, joinRoom]);

  // Leave on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  // Reset state when matchId changes
  useEffect(() => {
    setScores(new Map());
    setOpponentPresence({ isPresent: false });
    setSettlementData(null);
    seenUpdatesRef.current.clear();
    lastUpdateTimesRef.current.clear();
  }, [matchId]);

  // =====================================================
  // Return
  // =====================================================

  return {
    isConnected,
    isInRoom,
    isJoining,
    joinError,
    scores,
    opponentPresence,
    settlementData,
    refresh: joinRoom,
  };
}

export default useMatchSocket;
