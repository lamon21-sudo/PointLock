// =====================================================
// Socket Authentication Middleware
// =====================================================
// Validates JWT tokens on socket connection.
// Reuses existing auth infrastructure from auth.service.

import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { verifyAccessToken } from '../modules/auth/auth.service';
import { logger } from '../utils/logger';
import type {
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
} from './socket.types';

// ===========================================
// Type Definitions
// ===========================================

/**
 * Type alias for our fully-typed socket.
 */
export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ===========================================
// Authentication Middleware
// ===========================================

/**
 * Socket.io authentication middleware.
 * Extracts token from socket.handshake.auth.token
 * Verifies using existing verifyAccessToken function.
 * Attaches user data to socket.data.
 */
export async function socketAuthMiddleware(
  socket: TypedSocket,
  next: (err?: ExtendedError) => void
): Promise<void> {
  try {
    // Extract token from handshake auth object
    const token = socket.handshake.auth?.token;

    if (!token) {
      logger.warn(
        `[Socket] Connection rejected: No token provided (socket: ${socket.id})`
      );
      return next(new Error('Authentication required: No token provided'));
    }

    if (typeof token !== 'string') {
      logger.warn(
        `[Socket] Connection rejected: Invalid token type (socket: ${socket.id})`
      );
      return next(new Error('Authentication required: Invalid token format'));
    }

    // Verify token using existing auth service
    const user = await verifyAccessToken(token);

    // Attach user data to socket
    socket.data.user = user;
    socket.data.joinedRooms = new Set();

    logger.info(
      `[Socket] User authenticated: ${user.id} (${user.username}) - socket: ${socket.id}`
    );

    next();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Authentication failed';
    logger.warn(
      `[Socket] Authentication failed: ${errorMessage} (socket: ${socket.id})`
    );

    // Return specific error messages for client handling
    if (errorMessage.includes('expired')) {
      return next(new Error('TOKEN_EXPIRED'));
    }

    next(new Error('Authentication failed: Invalid token'));
  }
}
