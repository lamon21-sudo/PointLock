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

// Parse REDIS_URL if available, otherwise fall back to host/port
const getRedisOptions = (): RedisOptions => {
  const baseOptions: RedisOptions = {
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

  // If REDIS_URL is set, use it directly
  if (config.redis.url && config.redis.url !== 'redis://localhost:6379') {
    logger.info(`Using REDIS_URL: ${config.redis.url.replace(/:[^:@]+@/, ':***@')}`);
    return baseOptions;
  }

  // Fall back to host/port configuration
  return {
    ...baseOptions,
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  };
};

const redisOptions = getRedisOptions();

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
    // Use REDIS_URL if available, otherwise use options object
    if (config.redis.url && config.redis.url !== 'redis://localhost:6379') {
      connection = new Redis(config.redis.url, redisOptions);
    } else {
      connection = new Redis(redisOptions);
    }

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
    // Use REDIS_URL if available, otherwise use options object
    if (config.redis.url && config.redis.url !== 'redis://localhost:6379') {
      subscriberConnection = new Redis(config.redis.url, redisOptions);
    } else {
      subscriberConnection = new Redis(redisOptions);
    }

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
