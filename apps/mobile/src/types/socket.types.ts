// =====================================================
// Socket Types
// =====================================================
// Type definitions for WebSocket communication.
// These types match the backend socket contract exactly.

// =====================================================
// Connection State
// =====================================================

/**
 * WebSocket connection state for UI display.
 */
export type ConnectionState =
  | 'disconnected'  // Not connected, not attempting
  | 'connecting'    // Initial connection attempt
  | 'connected'     // Successfully connected
  | 'reconnecting'  // Attempting to reconnect after disconnect
  | 'error';        // Connection error state

// =====================================================
// Client-to-Server Event Payloads
// =====================================================

/**
 * Payload for join:match event.
 */
export interface JoinMatchPayload {
  matchId: string;
}

/**
 * Payload for leave:match event.
 */
export interface LeaveMatchPayload {
  matchId: string;
}

/**
 * Response callback for join:match event.
 */
export interface JoinMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
  code?: string;
}

/**
 * Response callback for leave:match event.
 */
export interface LeaveMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
}

// =====================================================
// Server-to-Client Event Payloads
// =====================================================

/**
 * Payload for joined:match event.
 * Broadcast when another user joins a match room.
 */
export interface JoinedMatchPayload {
  matchId: string;
  userId: string;
  username: string;
  timestamp: string;
}

/**
 * Payload for left:match event.
 * Broadcast when a user leaves a match room.
 */
export interface LeftMatchPayload {
  matchId: string;
  userId: string;
  username: string;
  timestamp: string;
}

/**
 * Period type for game time tracking.
 */
export type PeriodType =
  | 'quarter'
  | 'half'
  | 'inning'
  | 'period'
  | 'overtime'
  | 'extra_time';

/**
 * Game time information for live events.
 */
export interface GameTime {
  /** Current period number (1-4 for quarters, etc.) */
  period: number;
  /** Type of period */
  periodType: PeriodType;
  /** Remaining time in format "MM:SS" */
  clock?: string;
  /** Whether game is at halftime */
  isHalftime?: boolean;
  /** Whether game is in overtime */
  isOvertime?: boolean;
}

/**
 * Payload for event:score event.
 * Real-time score update for a sports event.
 */
export interface EventScorePayload {
  /** Internal event UUID */
  eventId: string;
  /** External provider event ID */
  externalId: string;
  /** Current home team score */
  homeScore: number;
  /** Current away team score */
  awayScore: number;
  /** Previous home score (null on first update) */
  previousHomeScore: number | null;
  /** Previous away score (null on first update) */
  previousAwayScore: number | null;
  /** Game time information */
  gameTime?: GameTime;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Event status values matching backend enum.
 */
export type EventStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELED'
  | 'POSTPONED';

/**
 * Final score for completed events.
 */
export interface FinalScore {
  homeScore: number;
  awayScore: number;
}

/**
 * Payload for event:status event.
 * Broadcast when game status changes.
 */
export interface EventStatusPayload {
  /** Internal event UUID */
  eventId: string;
  /** External provider event ID */
  externalId: string;
  /** New status */
  status: EventStatus;
  /** Previous status */
  previousStatus: EventStatus;
  /** ISO timestamp when event started (if transitioning to LIVE) */
  startedAt?: string;
  /** ISO timestamp when event ended (if transitioning to COMPLETED) */
  endedAt?: string;
  /** Final score (if transitioning to COMPLETED) */
  finalScore?: FinalScore;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Payload for error event.
 */
export interface SocketErrorPayload {
  message: string;
  code: string;
}

/**
 * Payload for match:settled event.
 * Broadcast to both participants when a PvP match settlement completes.
 */
export interface MatchSettledPayload {
  /** The settled match ID */
  matchId: string;
  /** Settlement status */
  status: 'settled' | 'draw';
  /** Winner user ID (null if draw) */
  winnerId: string | null;
  /** Whether the match ended in a draw */
  isDraw: boolean;
  /** Creator's final point total */
  creatorPoints: number;
  /** Opponent's final point total */
  opponentPoints: number;
  /** Winner's payout amount as string (null if draw) */
  winnerPayout: string | null;
  /** ISO timestamp of settlement */
  settledAt: string;
  /** Human-readable settlement reason */
  reason: string;
}

/**
 * Payload for queue:expired event.
 * Sent when a user's queue entry expires without finding a match.
 */
export interface QueueExpiredPayload {
  /** Queue entry ID that expired */
  queueEntryId: string;
  /** Game mode the user was queued for */
  gameMode: string;
  /** Stake amount that was refunded */
  stakeAmount: number;
  /** Whether the stake was successfully refunded */
  refunded: boolean;
  /** ISO timestamp when the entry expired */
  expiredAt: string;
  /** Reason for expiration (e.g., "MAX_WAIT_TIME_EXCEEDED", "NO_SUITABLE_OPPONENT") */
  reason: string;
}

// =====================================================
// Socket Event Types
// =====================================================

/**
 * All server-to-client event types.
 */
export type ServerToClientEvent =
  | 'joined:match'
  | 'left:match'
  | 'event:score'
  | 'event:status'
  | 'match:settled'
  | 'queue:expired'
  | 'error';

/**
 * All client-to-server event types.
 */
export type ClientToServerEvent =
  | 'join:match'
  | 'leave:match';

// =====================================================
// Event Listener Types
// =====================================================

/**
 * Generic event callback type.
 */
export type EventCallback<T = unknown> = (payload: T) => void;

/**
 * Registered event listener with unique ID.
 */
export interface EventListener {
  id: string;
  event: ServerToClientEvent;
  callback: EventCallback;
}

// =====================================================
// Match Socket State Types
// =====================================================

/**
 * Score state for a single event in a match.
 */
export interface EventScoreState {
  eventId: string;
  externalId: string;
  homeScore: number;
  awayScore: number;
  gameTime?: GameTime;
  status: EventStatus;
  lastUpdated: string;
}

/**
 * Opponent presence state.
 */
export interface OpponentPresence {
  isPresent: boolean;
  userId?: string;
  username?: string;
  lastSeen?: string;
}

// =====================================================
// Room Utilities
// =====================================================

/**
 * Get the room ID for a match.
 */
export function getMatchRoomId(matchId: string): string {
  return `match-${matchId}`;
}

/**
 * Extract match ID from room ID.
 */
export function getMatchIdFromRoom(roomId: string): string | null {
  if (roomId.startsWith('match-')) {
    return roomId.substring(6);
  }
  return null;
}

// =====================================================
// Error Codes
// =====================================================

/**
 * Socket-specific error codes from backend.
 */
export const SOCKET_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_001',
  MATCH_NOT_FOUND: 'INTERNAL_001',
  FORBIDDEN: 'FORBIDDEN_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
} as const;

export type SocketErrorCode = typeof SOCKET_ERROR_CODES[keyof typeof SOCKET_ERROR_CODES];
