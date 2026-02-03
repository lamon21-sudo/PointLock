// =====================================================
// Socket.io Type Definitions
// =====================================================
// Type-safe event definitions for WebSocket communication.

import type { AuthenticatedUser } from '../modules/auth/auth.service';
import type { EventStatus } from '@prisma/client';
import type { GameTime } from '../services/live-scores/types';

// ===========================================
// Socket Session Data
// ===========================================

/**
 * Extended socket data attached after authentication.
 * Stored in socket.data for access in handlers.
 */
export interface SocketData {
  user: AuthenticatedUser;
  joinedRooms: Set<string>;
}

// ===========================================
// Client -> Server Events
// ===========================================

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
 * Client-to-server event map.
 */
export interface ClientToServerEvents {
  'join:match': (
    payload: JoinMatchPayload,
    callback: (response: JoinMatchResponse) => void
  ) => void;
  'leave:match': (
    payload: LeaveMatchPayload,
    callback: (response: LeaveMatchResponse) => void
  ) => void;
}

// ===========================================
// Server -> Client Events
// ===========================================

/**
 * Response for join:match acknowledgment.
 */
export interface JoinMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
  code?: string;
}

/**
 * Response for leave:match acknowledgment.
 */
export interface LeaveMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
}

/**
 * Payload for joined:match broadcast.
 */
export interface JoinedMatchPayload {
  matchId: string;
  userId: string;
  username: string;
  timestamp: string;
}

/**
 * Payload for left:match broadcast.
 */
export interface LeftMatchPayload {
  matchId: string;
  userId: string;
  username: string;
  timestamp: string;
}

// ===========================================
// Live Score Events
// ===========================================

/**
 * Payload for event:score broadcast.
 * Sent when game scores change.
 */
export interface EventScorePayload {
  /** Internal event UUID */
  eventId: string;
  /** External event identifier */
  externalId: string;
  /** Current home team score */
  homeScore: number;
  /** Current away team score */
  awayScore: number;
  /** Previous home score (null if first update) */
  previousHomeScore: number | null;
  /** Previous away score (null if first update) */
  previousAwayScore: number | null;
  /** Current game time information */
  gameTime?: GameTime;
  /** ISO timestamp of the update */
  timestamp: string;
}

/**
 * Payload for event:status broadcast.
 * Sent when game status changes (SCHEDULED -> LIVE -> COMPLETED).
 */
export interface EventStatusPayload {
  /** Internal event UUID */
  eventId: string;
  /** External event identifier */
  externalId: string;
  /** New status */
  status: EventStatus;
  /** Previous status */
  previousStatus: EventStatus;
  /** ISO timestamp when game started (if transitioning to LIVE) */
  startedAt?: string;
  /** ISO timestamp when game ended (if transitioning to COMPLETED) */
  endedAt?: string;
  /** Final score (if transitioning to COMPLETED) */
  finalScore?: {
    homeScore: number;
    awayScore: number;
  };
  /** ISO timestamp of the update */
  timestamp: string;
}

// ===========================================
// Match Settlement Events
// ===========================================

/**
 * Payload for match:settled broadcast.
 * Sent when a PvP match is settled after all events complete.
 */
export interface MatchSettledPayload {
  /** The match ID */
  matchId: string;
  /** Settlement status */
  status: 'settled' | 'draw';
  /** Winner user ID (null if draw) */
  winnerId: string | null;
  /** Whether the match ended in a draw */
  isDraw: boolean;
  /** Creator's total points earned */
  creatorPoints: number;
  /** Opponent's total points earned */
  opponentPoints: number;
  /** Winner payout in cents (stringified bigint, null if draw) */
  winnerPayout: string | null;
  /** ISO timestamp when settlement occurred */
  settledAt: string;
  /** Human-readable reason for settlement outcome */
  reason: string;
}

// ===========================================
// Match Created Events (Matchmaking)
// ===========================================

/**
 * Opponent information in match:created payload.
 * Provides minimal data needed for UI display.
 */
export interface MatchOpponentInfo {
  /** Opponent's user ID */
  userId: string;
  /** Opponent's username */
  username: string;
  /** Opponent's skill rating (MMR) */
  skillRating: number;
}

/**
 * Payload for match:created event.
 * Sent to both participants when matchmaking creates a match.
 * Each user receives personalized payload with opponent info.
 */
export interface MatchCreatedPayload {
  /** The newly created match ID */
  matchId: string;
  /** Game mode (e.g., QUICK_MATCH) */
  gameMode: string;
  /** Stake amount in cents */
  stakeAmount: number;
  /** Information about the opponent */
  opponent: MatchOpponentInfo;
  /** Your role in the match record ('creator' or 'opponent') */
  role: 'creator' | 'opponent';
  /** ISO timestamp when match was created */
  createdAt: string;
}

/**
 * Server-to-client event map.
 */
export interface ServerToClientEvents {
  'joined:match': (payload: JoinedMatchPayload) => void;
  'left:match': (payload: LeftMatchPayload) => void;
  'event:score': (payload: EventScorePayload) => void;
  'event:status': (payload: EventStatusPayload) => void;
  'match:settled': (payload: MatchSettledPayload) => void;
  'match:created': (payload: MatchCreatedPayload) => void;
  error: (payload: { message: string; code: string }) => void;
}

// ===========================================
// Inter-Server Events (for Redis adapter)
// ===========================================

export interface InterServerEvents {
  ping: () => void;
}

// ===========================================
// Room Naming Conventions
// ===========================================

/**
 * Generates a room ID from a match ID.
 * Format: match-{matchId}
 */
export function getMatchRoomId(matchId: string): string {
  return `match-${matchId}`;
}

/**
 * Extracts match ID from a room ID.
 * Returns null if not a valid match room.
 */
export function getMatchIdFromRoom(roomId: string): string | null {
  if (roomId.startsWith('match-')) {
    return roomId.substring(6);
  }
  return null;
}

/**
 * Generates a room ID from an event ID.
 * Format: event-{eventId}
 * Used for spectators watching a specific game.
 */
export function getEventRoomId(eventId: string): string {
  return `event-${eventId}`;
}

/**
 * Extracts event ID from a room ID.
 * Returns null if not a valid event room.
 */
export function getEventIdFromRoom(roomId: string): string | null {
  if (roomId.startsWith('event-')) {
    return roomId.substring(6);
  }
  return null;
}

/**
 * Generates a room ID for a specific user.
 * Format: user-{userId}
 * Used for direct notifications to a user (e.g., match:created).
 */
export function getUserRoomId(userId: string): string {
  return `user-${userId}`;
}

/**
 * Extracts user ID from a room ID.
 * Returns null if not a valid user room.
 */
export function getUserIdFromRoom(roomId: string): string | null {
  if (roomId.startsWith('user-')) {
    return roomId.substring(5);
  }
  return null;
}
