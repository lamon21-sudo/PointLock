// =====================================================
// Socket Service
// =====================================================
// Singleton Socket.io instance and room management helpers.

import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getMatchById } from '../modules/matches/matches.service';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import {
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  JoinedMatchPayload,
  LeftMatchPayload,
  getMatchRoomId,
} from './socket.types';

// ===========================================
// Type Definitions
// ===========================================

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ===========================================
// Singleton Instance
// ===========================================

let io: TypedServer | null = null;

// ===========================================
// Initialization
// ===========================================

/**
 * Initializes Socket.io server attached to existing HTTP server.
 * Sets up Redis adapter for horizontal scaling support.
 *
 * @param httpServer - The HTTP server instance from Express
 * @returns The initialized Socket.io server
 */
export function initializeSocketServer(httpServer: HttpServer): TypedServer {
  if (io) {
    logger.warn('[Socket] Socket.io server already initialized');
    return io;
  }

  io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin:
        config.nodeEnv === 'production' ? ['https://pickrivals.com'] : '*',
      credentials: true,
    },
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
    // Transport settings
    transports: ['websocket', 'polling'],
    // Path for socket connections
    path: '/socket.io',
  });

  logger.info('[Socket] Socket.io server initialized');

  return io;
}

/**
 * Sets up Redis adapter for Socket.io.
 * Enables horizontal scaling across multiple server instances.
 * Optional - only set up if Redis is available.
 */
export async function setupRedisAdapter(): Promise<void> {
  if (!io) {
    throw new Error('Socket.io server not initialized');
  }

  try {
    const pubClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        pubClient.on('ready', resolve);
        pubClient.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        subClient.on('ready', resolve);
        subClient.on('error', reject);
      }),
    ]);

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[Socket] Redis adapter configured successfully');
  } catch (error) {
    logger.warn(
      '[Socket] Redis adapter setup failed, running without horizontal scaling:',
      error
    );
    // Continue without Redis adapter - single server mode
  }
}

/**
 * Gets the Socket.io server instance.
 * Throws if not initialized.
 */
export function getSocketServer(): TypedServer {
  if (!io) {
    throw new Error(
      'Socket.io server not initialized. Call initializeSocketServer first.'
    );
  }
  return io;
}

/**
 * Gracefully shuts down the Socket.io server.
 * Disconnects all clients and closes the server.
 */
export async function shutdownSocketServer(): Promise<void> {
  if (!io) {
    return;
  }

  return new Promise((resolve) => {
    logger.info('[Socket] Shutting down Socket.io server...');

    // Disconnect all sockets
    io!.disconnectSockets(true);

    // Close the server
    io!.close(() => {
      logger.info('[Socket] Socket.io server closed');
      io = null;
      resolve();
    });
  });
}

// ===========================================
// Room Management Helpers
// ===========================================

/**
 * Verifies if a user is a participant in a match.
 * @throws {NotFoundError} if match doesn't exist
 * @throws {ForbiddenError} if user is not a participant
 */
export async function verifyMatchParticipant(
  matchId: string,
  userId: string
): Promise<void> {
  const match = await getMatchById(matchId, userId);

  if (!match) {
    // Either match doesn't exist or user is not a participant
    // Use getMatchById without userId to check if match exists
    const matchExists = await getMatchById(matchId);

    if (!matchExists) {
      throw new NotFoundError(`Match not found: ${matchId}`);
    }

    throw new ForbiddenError('You are not a participant in this match');
  }
}

/**
 * Joins a socket to a match room after verification.
 * @returns The room ID that was joined
 */
export async function joinMatchRoom(
  socket: TypedSocket,
  matchId: string
): Promise<string> {
  const userId = socket.data.user.id;
  const roomId = getMatchRoomId(matchId);

  // Verify user is a participant
  await verifyMatchParticipant(matchId, userId);

  // Join the room
  await socket.join(roomId);

  // Track in socket data
  socket.data.joinedRooms.add(roomId);

  logger.info(
    `[Socket] User ${userId} joined room ${roomId} (socket: ${socket.id})`
  );

  return roomId;
}

/**
 * Leaves a match room.
 * @returns The room ID that was left, or null if not in room
 */
export function leaveMatchRoom(
  socket: TypedSocket,
  matchId: string
): string | null {
  const userId = socket.data.user.id;
  const roomId = getMatchRoomId(matchId);

  if (!socket.data.joinedRooms.has(roomId)) {
    logger.warn(
      `[Socket] User ${userId} tried to leave room ${roomId} but wasn't in it`
    );
    return null;
  }

  // Leave the room
  socket.leave(roomId);

  // Remove from tracking
  socket.data.joinedRooms.delete(roomId);

  logger.info(
    `[Socket] User ${userId} left room ${roomId} (socket: ${socket.id})`
  );

  return roomId;
}

/**
 * Leaves all match rooms for a socket (used on disconnect).
 */
export function leaveAllRooms(socket: TypedSocket): void {
  const userId = socket.data.user?.id || 'unknown';

  for (const roomId of socket.data.joinedRooms || []) {
    socket.leave(roomId);
    logger.debug(`[Socket] User ${userId} left room ${roomId} on disconnect`);
  }

  if (socket.data.joinedRooms) {
    socket.data.joinedRooms.clear();
  }
}

/**
 * Broadcasts an event to all sockets in a match room.
 * Overloaded for type-safe event emission.
 */
export function broadcastToMatch(
  matchId: string,
  event: 'joined:match',
  payload: JoinedMatchPayload
): void;
export function broadcastToMatch(
  matchId: string,
  event: 'left:match',
  payload: LeftMatchPayload
): void;
export function broadcastToMatch(
  matchId: string,
  event: 'error',
  payload: { message: string; code: string }
): void;
export function broadcastToMatch(
  matchId: string,
  event: keyof ServerToClientEvents,
  payload: JoinedMatchPayload | LeftMatchPayload | { message: string; code: string }
): void {
  if (!io) {
    logger.error('[Socket] Cannot broadcast: Socket.io server not initialized');
    return;
  }

  const roomId = getMatchRoomId(matchId);

  switch (event) {
    case 'joined:match':
      io.to(roomId).emit('joined:match', payload as JoinedMatchPayload);
      break;
    case 'left:match':
      io.to(roomId).emit('left:match', payload as LeftMatchPayload);
      break;
    case 'error':
      io.to(roomId).emit('error', payload as { message: string; code: string });
      break;
  }

  logger.debug(`[Socket] Broadcast ${event} to room ${roomId}`);
}

/**
 * Gets the number of sockets in a match room.
 */
export async function getMatchRoomSize(matchId: string): Promise<number> {
  if (!io) {
    return 0;
  }

  const roomId = getMatchRoomId(matchId);
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.length;
}
