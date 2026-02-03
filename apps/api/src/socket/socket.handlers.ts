// =====================================================
// Socket Event Handlers
// =====================================================
// Implements client-to-server event handlers.

import { logger } from '../utils/logger';
import type { TypedSocket } from './socket.service';
import { joinMatchRoom, leaveMatchRoom, leaveAllRooms } from './socket.service';
import {
  JoinMatchPayload,
  LeaveMatchPayload,
  JoinMatchResponse,
  LeaveMatchResponse,
  getMatchRoomId,
  getUserRoomId,
} from './socket.types';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Handler Registration
// ===========================================

/**
 * Registers all event handlers for a socket connection.
 * Called after successful authentication.
 */
export function registerSocketHandlers(socket: TypedSocket): void {
  const userId = socket.data.user.id;

  logger.info(
    `[Socket] Registering handlers for user ${userId} (socket: ${socket.id})`
  );

  // ===========================================
  // Auto-join User Room
  // ===========================================
  // Join user-specific room for direct notifications (e.g., match:created)
  // This enables notifications to reach users even when not in a match room
  const userRoomId = getUserRoomId(userId);
  socket.join(userRoomId);
  socket.data.joinedRooms.add(userRoomId);
  logger.debug(`[Socket] User ${userId} auto-joined personal room ${userRoomId}`);

  // Join match room handler
  socket.on('join:match', async (payload, callback) => {
    await handleJoinMatch(socket, payload, callback);
  });

  // Leave match room handler
  socket.on('leave:match', (payload, callback) => {
    handleLeaveMatch(socket, payload, callback);
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    handleDisconnect(socket, reason);
  });

  // Error handler
  socket.on('error', (error) => {
    logger.error(`[Socket] Error for user ${userId}: ${error.message}`);
  });
}

// ===========================================
// Event Handlers
// ===========================================

/**
 * Handles join:match event.
 * Verifies user is a match participant and joins the room.
 */
async function handleJoinMatch(
  socket: TypedSocket,
  payload: JoinMatchPayload,
  callback: (response: JoinMatchResponse) => void
): Promise<void> {
  const userId = socket.data.user.id;
  const username = socket.data.user.username;

  try {
    // Validate payload
    if (!payload?.matchId || typeof payload.matchId !== 'string') {
      return callback({
        success: false,
        error: 'Invalid payload: matchId is required',
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    const { matchId } = payload;

    logger.info(`[Socket] User ${userId} requesting to join match ${matchId}`);

    // Join the room (includes participant verification)
    const roomId = await joinMatchRoom(socket, matchId);

    // Send acknowledgment to the joining client
    callback({
      success: true,
      matchId,
    });

    // Broadcast to other users in the room
    socket.to(roomId).emit('joined:match', {
      matchId,
      userId,
      username,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Socket] User ${userId} successfully joined match ${matchId}`);
  } catch (error) {
    logger.error(`[Socket] Join match failed for user ${userId}:`, error);

    if (error instanceof NotFoundError) {
      return callback({
        success: false,
        error: 'Match not found',
        code: ERROR_CODES.INTERNAL_ERROR,
      });
    }

    if (error instanceof ForbiddenError) {
      return callback({
        success: false,
        error: 'You are not a participant in this match',
        code: ERROR_CODES.FORBIDDEN,
      });
    }

    callback({
      success: false,
      error: 'Failed to join match',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
}

/**
 * Handles leave:match event.
 * Removes user from match room.
 */
function handleLeaveMatch(
  socket: TypedSocket,
  payload: LeaveMatchPayload,
  callback: (response: LeaveMatchResponse) => void
): void {
  const userId = socket.data.user.id;
  const username = socket.data.user.username;

  try {
    // Validate payload
    if (!payload?.matchId || typeof payload.matchId !== 'string') {
      return callback({
        success: false,
        error: 'Invalid payload: matchId is required',
      });
    }

    const { matchId } = payload;
    const roomId = getMatchRoomId(matchId);

    logger.info(`[Socket] User ${userId} requesting to leave match ${matchId}`);

    // Leave the room
    const leftRoomId = leaveMatchRoom(socket, matchId);

    if (!leftRoomId) {
      return callback({
        success: false,
        error: 'You are not in this match room',
      });
    }

    // Send acknowledgment
    callback({
      success: true,
      matchId,
    });

    // Broadcast to remaining users in the room
    socket.to(roomId).emit('left:match', {
      matchId,
      userId,
      username,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Socket] User ${userId} successfully left match ${matchId}`);
  } catch (error) {
    logger.error(`[Socket] Leave match failed for user ${userId}:`, error);

    callback({
      success: false,
      error: 'Failed to leave match',
    });
  }
}

/**
 * Handles socket disconnection.
 * Cleans up rooms and logs the event.
 */
function handleDisconnect(socket: TypedSocket, reason: string): void {
  const userId = socket.data.user?.id || 'unknown';
  const username = socket.data.user?.username || 'unknown';
  const joinedRooms = socket.data.joinedRooms
    ? Array.from(socket.data.joinedRooms)
    : [];

  logger.info(
    `[Socket] User ${userId} disconnected. Reason: ${reason}. Rooms: ${joinedRooms.join(', ') || 'none'}`
  );

  // Broadcast left:match only to match rooms (not user rooms or event rooms)
  for (const roomId of joinedRooms) {
    // Skip non-match rooms (user-*, event-*)
    if (!roomId.startsWith('match-')) {
      continue;
    }

    const matchId = roomId.replace('match-', '');

    socket.to(roomId).emit('left:match', {
      matchId,
      userId,
      username,
      timestamp: new Date().toISOString(),
    });
  }

  // Clean up (socket.io automatically removes from rooms on disconnect)
  leaveAllRooms(socket);
}
