// =====================================================
// Redis Connection for BullMQ
// =====================================================
// Centralized Redis connection configuration.
// CRITICAL: Use connection pooling for production.

import { Redis, RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// ===========================================
// Connection Configuration
// ===========================================

const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false, // Faster startup
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000);
    logger.warn(`Redis connection retry #${times} in ${delay}ms`);
    return delay;
  },
};

// ===========================================
// Singleton Connections
// ===========================================

let connection: Redis | null = null;
let subscriberConnection: Redis | null = null;

/**
 * Get the main Redis connection for BullMQ queues.
 * Creates connection on first call (lazy initialization).
 */
export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(redisOptions);

    connection.on('connect', () => {
      logger.info('Redis connection established');
    });

    connection.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    connection.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return connection;
}

/**
 * Get a separate subscriber connection for BullMQ.
 * BullMQ requires separate connections for pub/sub operations.
 */
export function getSubscriberConnection(): Redis {
  if (!subscriberConnection) {
    subscriberConnection = new Redis(redisOptions);

    subscriberConnection.on('error', (err) => {
      logger.error('Redis subscriber connection error:', err);
    });
  }

  return subscriberConnection;
}

/**
 * Gracefully close all Redis connections.
 * Call this on application shutdown.
 */
export async function closeRedisConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (connection) {
    closePromises.push(
      connection.quit().then(() => {
        logger.info('Redis main connection closed');
        connection = null;
      })
    );
  }

  if (subscriberConnection) {
    closePromises.push(
      subscriberConnection.quit().then(() => {
        logger.info('Redis subscriber connection closed');
        subscriberConnection = null;
      })
    );
  }

  await Promise.all(closePromises);
}
