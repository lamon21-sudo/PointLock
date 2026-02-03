// =====================================================
// Live Scores Broadcaster
// =====================================================
// Sends real-time score updates to connected clients
// via Socket.IO. Uses existing room infrastructure.

import { logger } from '../../utils/logger';
import {
  getMatchRoomId,
  getEventRoomId,
  getUserRoomId,
  EventScorePayload,
  EventStatusPayload,
  MatchSettledPayload,
  MatchCreatedPayload,
} from '../../socket/socket.types';
import { getRedisConnection } from '../../queues/connection';

// ===========================================
// Type Imports
// ===========================================

// We need to lazily get the socket server to avoid circular dependencies
let getSocketServerFn: (() => import('../../socket/socket.service').TypedServer) | null = null;

/**
 * Lazily initialize the socket server getter.
 * This avoids circular dependency issues during module loading.
 */
async function getIo(): Promise<import('../../socket/socket.service').TypedServer | null> {
  if (!getSocketServerFn) {
    try {
      const { getSocketServer } = await import('../../socket/socket.service');
      getSocketServerFn = getSocketServer;
    } catch (error) {
      logger.error('[LiveScoresBroadcaster] Failed to import socket service:', error);
      return null;
    }
  }

  try {
    return getSocketServerFn();
  } catch (error) {
    // Socket server not initialized yet
    logger.debug('[LiveScoresBroadcaster] Socket server not ready');
    return null;
  }
}

// ===========================================
// Score Update Broadcasting
// ===========================================

/**
 * Broadcast a score update to all affected match rooms and the event room.
 *
 * @param payload - The score update payload
 * @param affectedMatchIds - Array of match IDs that should receive the update
 */
export async function broadcastScoreUpdate(
  payload: EventScorePayload,
  affectedMatchIds: string[]
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast score update: Socket server not available');
    return;
  }

  // Broadcast to each affected match room
  for (const matchId of affectedMatchIds) {
    const roomId = getMatchRoomId(matchId);
    io.to(roomId).emit('event:score', payload);
    logger.debug(`[LiveScoresBroadcaster] Broadcast event:score to ${roomId}`);
  }

  // Also broadcast to the event-specific room (for spectators)
  const eventRoomId = getEventRoomId(payload.eventId);
  io.to(eventRoomId).emit('event:score', payload);

  logger.info(`[LiveScoresBroadcaster] Score update broadcast`, {
    eventId: payload.eventId,
    homeScore: payload.homeScore,
    awayScore: payload.awayScore,
    matchRooms: affectedMatchIds.length,
  });
}

/**
 * Synchronous version for use in processor (wraps async).
 * Fire-and-forget pattern.
 */
export function broadcastScoreUpdateSync(
  payload: EventScorePayload,
  affectedMatchIds: string[]
): void {
  broadcastScoreUpdate(payload, affectedMatchIds).catch((error) => {
    logger.error('[LiveScoresBroadcaster] Failed to broadcast score update:', error);
  });
}

// ===========================================
// Status Change Broadcasting
// ===========================================

/**
 * Broadcast a status change to all affected match rooms and the event room.
 *
 * @param payload - The status change payload
 * @param affectedMatchIds - Array of match IDs that should receive the update
 */
export async function broadcastStatusChange(
  payload: EventStatusPayload,
  affectedMatchIds: string[]
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast status change: Socket server not available');
    return;
  }

  // Broadcast to each affected match room
  for (const matchId of affectedMatchIds) {
    const roomId = getMatchRoomId(matchId);
    io.to(roomId).emit('event:status', payload);
    logger.debug(`[LiveScoresBroadcaster] Broadcast event:status to ${roomId}`);
  }

  // Also broadcast to the event-specific room (for spectators)
  const eventRoomId = getEventRoomId(payload.eventId);
  io.to(eventRoomId).emit('event:status', payload);

  logger.info(`[LiveScoresBroadcaster] Status change broadcast`, {
    eventId: payload.eventId,
    previousStatus: payload.previousStatus,
    newStatus: payload.status,
    matchRooms: affectedMatchIds.length,
  });
}

/**
 * Synchronous version for use in processor (wraps async).
 * Fire-and-forget pattern.
 */
export function broadcastStatusChangeSync(
  payload: EventStatusPayload,
  affectedMatchIds: string[]
): void {
  broadcastStatusChange(payload, affectedMatchIds).catch((error) => {
    logger.error('[LiveScoresBroadcaster] Failed to broadcast status change:', error);
  });
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Get the number of connected clients in an event room.
 */
export async function getEventRoomSize(eventId: string): Promise<number> {
  const io = await getIo();

  if (!io) {
    return 0;
  }

  const roomId = getEventRoomId(eventId);
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.length;
}

/**
 * Broadcast a custom message to an event room.
 * Useful for admin announcements or special events.
 */
export async function broadcastToEventRoom(
  eventId: string,
  event: 'event:score' | 'event:status',
  payload: EventScorePayload | EventStatusPayload
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast to event room: Socket server not available');
    return;
  }

  const roomId = getEventRoomId(eventId);

  if (event === 'event:score') {
    io.to(roomId).emit('event:score', payload as EventScorePayload);
  } else {
    io.to(roomId).emit('event:status', payload as EventStatusPayload);
  }

  logger.debug(`[LiveScoresBroadcaster] Broadcast ${event} to event room ${roomId}`);
}

/**
 * Broadcast to multiple match rooms at once.
 * More efficient than calling broadcastScoreUpdate for each match.
 */
export async function broadcastToMatchRooms(
  matchIds: string[],
  event: 'event:score' | 'event:status',
  payload: EventScorePayload | EventStatusPayload
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast to match rooms: Socket server not available');
    return;
  }

  // Build array of room IDs
  const roomIds = matchIds.map(getMatchRoomId);

  // Emit to all rooms at once
  if (event === 'event:score') {
    io.to(roomIds).emit('event:score', payload as EventScorePayload);
  } else {
    io.to(roomIds).emit('event:status', payload as EventStatusPayload);
  }

  logger.debug(`[LiveScoresBroadcaster] Broadcast ${event} to ${roomIds.length} match rooms`);
}

// ===========================================
// Match Settlement Broadcasting
// ===========================================

/**
 * Broadcast match settlement to the match room.
 * Called after a match is successfully settled.
 *
 * @param matchId - The match ID
 * @param result - The settlement result from settlement service
 */
export async function broadcastMatchSettled(
  matchId: string,
  result: {
    matchId: string;
    winnerId: string | null;
    isDraw: boolean;
    creatorPoints: number;
    opponentPoints: number;
    winnerPayout: bigint | null;
    settledAt: Date;
    reason: string;
  }
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast settlement: Socket server not available');
    return;
  }

  const payload: MatchSettledPayload = {
    matchId: result.matchId,
    status: result.isDraw ? 'draw' : 'settled',
    winnerId: result.winnerId,
    isDraw: result.isDraw,
    creatorPoints: result.creatorPoints,
    opponentPoints: result.opponentPoints,
    winnerPayout: result.winnerPayout?.toString() ?? null,
    settledAt: result.settledAt.toISOString(),
    reason: result.reason,
  };

  const roomId = getMatchRoomId(matchId);
  io.to(roomId).emit('match:settled', payload);

  logger.info(`[LiveScoresBroadcaster] Settlement broadcast to ${roomId}`, {
    matchId,
    winnerId: result.winnerId,
    isDraw: result.isDraw,
    creatorPoints: result.creatorPoints,
    opponentPoints: result.opponentPoints,
  });
}

/**
 * Synchronous version for use in processor (wraps async).
 * Fire-and-forget pattern.
 */
export function broadcastMatchSettledSync(
  matchId: string,
  result: {
    matchId: string;
    winnerId: string | null;
    isDraw: boolean;
    creatorPoints: number;
    opponentPoints: number;
    winnerPayout: bigint | null;
    settledAt: Date;
    reason: string;
  }
): void {
  broadcastMatchSettled(matchId, result).catch((error) => {
    logger.error('[LiveScoresBroadcaster] Failed to broadcast settlement:', error);
  });
}

// ===========================================
// Match Created Broadcasting (Matchmaking)
// ===========================================

/**
 * Input data for match created broadcast.
 * Contains all information needed to notify both players.
 */
export interface MatchCreatedBroadcastData {
  matchId: string;
  gameMode: string;
  stakeAmount: bigint;
  creatorId: string;
  creatorUsername: string;
  creatorSkillRating: number;
  opponentId: string;
  opponentUsername: string;
  opponentSkillRating: number;
  createdAt: Date;
}

/**
 * Broadcast match:created to both participants via their user rooms.
 * Each user receives a personalized payload with opponent info.
 *
 * CRITICAL: Uses Redis-based idempotency to prevent duplicate notifications.
 * Fire-and-forget pattern - match creation is NOT blocked by notification failures.
 *
 * @param matchData - Data about the newly created match
 */
export async function broadcastMatchCreated(
  matchData: MatchCreatedBroadcastData
): Promise<void> {
  const io = await getIo();

  if (!io) {
    logger.warn('[LiveScoresBroadcaster] Cannot broadcast match:created: Socket server not available');
    return;
  }

  const {
    matchId,
    gameMode,
    stakeAmount,
    creatorId,
    creatorUsername,
    creatorSkillRating,
    opponentId,
    opponentUsername,
    opponentSkillRating,
    createdAt,
  } = matchData;

  // Idempotency check: prevent duplicate notifications
  const notificationKey = `match-created:${matchId}`;
  try {
    const redis = getRedisConnection();
    const alreadySent = await redis.get(notificationKey);
    if (alreadySent) {
      logger.debug(`[LiveScoresBroadcaster] Skipping duplicate match:created for ${matchId}`);
      return;
    }
  } catch (error) {
    // Redis unavailable - continue without idempotency (better to send than not)
    logger.warn('[LiveScoresBroadcaster] Redis unavailable for idempotency check, proceeding anyway');
  }

  // Convert stakeAmount to number for payload (cents)
  const stakeAmountNumber = Number(stakeAmount);
  const createdAtISO = createdAt.toISOString();

  // Payload for creator: sees opponent info
  const creatorPayload: MatchCreatedPayload = {
    matchId,
    gameMode,
    stakeAmount: stakeAmountNumber,
    opponent: {
      userId: opponentId,
      username: opponentUsername,
      skillRating: opponentSkillRating,
    },
    role: 'creator',
    createdAt: createdAtISO,
  };

  // Payload for opponent: sees creator info
  const opponentPayload: MatchCreatedPayload = {
    matchId,
    gameMode,
    stakeAmount: stakeAmountNumber,
    opponent: {
      userId: creatorId,
      username: creatorUsername,
      skillRating: creatorSkillRating,
    },
    role: 'opponent',
    createdAt: createdAtISO,
  };

  // Emit to creator's user room
  const creatorRoomId = getUserRoomId(creatorId);
  io.to(creatorRoomId).emit('match:created', creatorPayload);
  logger.debug(`[LiveScoresBroadcaster] Sent match:created to creator room ${creatorRoomId}`);

  // Emit to opponent's user room
  const opponentRoomId = getUserRoomId(opponentId);
  io.to(opponentRoomId).emit('match:created', opponentPayload);
  logger.debug(`[LiveScoresBroadcaster] Sent match:created to opponent room ${opponentRoomId}`);

  // Mark as sent (TTL 1 hour) for idempotency
  try {
    const redis = getRedisConnection();
    await redis.setex(notificationKey, 3600, '1');
  } catch (error) {
    // Non-critical - just log
    logger.warn('[LiveScoresBroadcaster] Failed to set idempotency key:', error);
  }

  logger.info(`[LiveScoresBroadcaster] Match created broadcast complete`, {
    matchId,
    gameMode,
    creatorId,
    opponentId,
  });
}

/**
 * Synchronous fire-and-forget version for use in matchmaking service.
 * Match creation should NEVER fail due to notification errors.
 */
export function broadcastMatchCreatedSync(matchData: MatchCreatedBroadcastData): void {
  broadcastMatchCreated(matchData).catch((error) => {
    logger.error('[LiveScoresBroadcaster] Failed to broadcast match:created:', error);
  });
}

// Re-export payload types for convenience
export type { EventScorePayload, EventStatusPayload, MatchSettledPayload, MatchCreatedPayload };
