// =====================================================
// Cache Service
// =====================================================
// Generic Redis caching layer with graceful degradation.
// If Redis is unavailable, operations fail silently and
// fall back to direct database queries.

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
}

// ===========================================
// Metrics (in-memory counters)
// ===========================================

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  errors: 0,
};

// ===========================================
// Redis Client Access
// ===========================================

/**
 * Get the Redis client for cache operations.
 * Uses lazy import to avoid circular dependencies.
 */
async function getRedis() {
  try {
    const { getRedisConnection } = await import('../queues/connection');
    return getRedisConnection();
  } catch (error) {
    logger.error('[Cache] Failed to get Redis connection:', error);
    return null;
  }
}

// ===========================================
// JSON Serialization Helpers
// ===========================================

/**
 * Custom JSON replacer to handle BigInt values.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'BigInt', value: value.toString() };
  }
  return value;
}

/**
 * Custom JSON reviver to restore BigInt values.
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__type === 'BigInt'
  ) {
    return BigInt((value as Record<string, string>).value);
  }
  return value;
}

// ===========================================
// Cache Operations
// ===========================================

/**
 * Get a cached value by key.
 * Returns null on cache miss or error.
 */
export async function get<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedis();
    if (!redis) {
      metrics.errors++;
      return null;
    }

    const cached = await redis.get(key);

    if (cached === null) {
      metrics.misses++;
      logger.debug(`[Cache] cache_miss key=${key}`);
      return null;
    }

    metrics.hits++;
    logger.debug(`[Cache] cache_hit key=${key}`);
    return JSON.parse(cached, jsonReviver) as T;
  } catch (error) {
    metrics.errors++;
    logger.warn(`[Cache] cache_error key=${key} error=${error}`);
    return null;
  }
}

/**
 * Set a cached value with TTL.
 * Fails silently on error.
 */
export async function set<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) {
      metrics.errors++;
      return;
    }

    const serialized = JSON.stringify(value, jsonReplacer);
    await redis.setex(key, ttlSeconds, serialized);
    logger.debug(`[Cache] cache_set key=${key} ttl=${ttlSeconds}s`);
  } catch (error) {
    metrics.errors++;
    logger.warn(`[Cache] cache_set_error key=${key} error=${error}`);
  }
}

/**
 * Delete a cached key.
 * Fails silently on error.
 */
export async function del(key: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) {
      return;
    }

    await redis.del(key);
    logger.debug(`[Cache] cache_del key=${key}`);
  } catch (error) {
    logger.warn(`[Cache] cache_del_error key=${key} error=${error}`);
  }
}

/**
 * Delete all keys matching a pattern.
 * Uses SCAN for safety (no KEYS command).
 * Fails silently on error.
 */
export async function delPattern(pattern: string): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) {
      return;
    }

    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    logger.debug(`[Cache] cache_del_pattern pattern=${pattern} deleted=${deletedCount}`);
  } catch (error) {
    logger.warn(`[Cache] cache_del_pattern_error pattern=${pattern} error=${error}`);
  }
}

/**
 * Cache-aside pattern: get from cache or fetch from source.
 * On cache miss, calls fetcher and caches the result.
 * On Redis error, falls back to fetcher (graceful degradation).
 */
export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // Try cache first
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss or error - fetch from source
  const value = await fetcher();

  // Cache the result (fire-and-forget)
  set(key, value, ttlSeconds).catch(() => {
    // Error already logged in set()
  });

  return value;
}

/**
 * Get current cache metrics for monitoring.
 */
export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}

/**
 * Reset cache metrics (for testing).
 */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.errors = 0;
}
