// =====================================================
// Socket Module
// =====================================================
// WebSocket infrastructure using Socket.io.
// Provides real-time communication for match rooms.

import type { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';
import { socketAuthMiddleware } from './socket.middleware';
import {
  initializeSocketServer,
  setupRedisAdapter,
} from './socket.service';
import type { TypedServer } from './socket.service';
import { registerSocketHandlers } from './socket.handlers';

// Re-export types and utilities
export * from './socket.types';
export {
  getSocketServer,
  shutdownSocketServer,
  broadcastToMatch,
  getMatchRoomSize,
} from './socket.service';

/**
 * Initializes the complete Socket.io infrastructure.
 * Should be called after HTTP server is created but before listening.
 *
 * @param httpServer - The HTTP server instance
 * @returns The initialized Socket.io server
 */
export async function initializeSocket(
  httpServer: HttpServer
): Promise<TypedServer> {
  // Initialize Socket.io server
  const io = initializeSocketServer(httpServer);

  // Set up Redis adapter for horizontal scaling (optional)
  await setupRedisAdapter();

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Handle new connections
  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    const username = socket.data.user.username;

    logger.info(
      `[Socket] New connection: ${username} (${userId}) - socket: ${socket.id}`
    );

    // Register event handlers
    registerSocketHandlers(socket);
  });

  // Log connection stats periodically (development only)
  if (process.env.NODE_ENV !== 'production') {
    setInterval(async () => {
      const sockets = await io.fetchSockets();
      logger.debug(`[Socket] Active connections: ${sockets.length}`);
    }, 60000);
  }

  logger.info('[Socket] Socket.io infrastructure initialized');

  return io;
}
