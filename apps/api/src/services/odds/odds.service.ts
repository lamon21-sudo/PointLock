// =====================================================
// Odds Service with Redis Caching
// =====================================================
// High-level service that wraps the API client with
// caching to reduce API calls and improve latency.

import { Redis } from 'ioredis';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getRedisConnection } from '../../queues/connection';
import { OddsApiClient } from './odds-api.client';
import {
  Sport,
  MarketType,
  SportsDataProvider,
  EventsResponse,
  EventOddsResponse,
  FetchOddsOptions,
} from './types';

// ===========================================
// Cache Key Builders
// ===========================================

const CACHE_PREFIX = 'odds';

function buildEventsKey(sport: Sport): string {
  return `${CACHE_PREFIX}:events:${sport}`;
}

function buildEventOddsKey(sport: Sport, eventId: string): string {
  return `${CACHE_PREFIX}:${sport}:${eventId}`;
}

function buildOddsKey(options: FetchOddsOptions): string {
  const parts = [
    CACHE_PREFIX,
    'list',
    options.sport,
    (options.markets || ['h2h']).sort().join('-'),
    (options.regions || ['us']).sort().join('-'),
  ];
  if (options.bookmakers?.length) {
    parts.push(options.bookmakers.sort().join('-'));
  }
  return parts.join(':');
}

// ===========================================
// Odds Service
// ===========================================

export class OddsService {
  private readonly provider: SportsDataProvider;
  private readonly redis: Redis;
  private readonly cacheTtl: number;

  constructor(provider?: SportsDataProvider, redis?: Redis) {
    this.provider = provider || new OddsApiClient();
    this.redis = redis || getRedisConnection();
    this.cacheTtl = config.oddsApi.cacheTtlSeconds;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Get data from cache or fetch from provider
   */
  private async getOrFetch<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    ttl: number = this.cacheTtl
  ): Promise<{ data: T; fromCache: boolean }> {
    // Try cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug(`[OddsService] Cache HIT: ${cacheKey}`);
        return {
          data: JSON.parse(cached) as T,
          fromCache: true,
        };
      }
      logger.debug(`[OddsService] Cache MISS: ${cacheKey}`);
    } catch (cacheError) {
      // Redis errors should not break the service
      logger.warn(`[OddsService] Redis read error for ${cacheKey}:`, cacheError);
    }

    // Fetch from provider
    const data = await fetcher();

    // Cache the result (don't await - fire and forget)
    this.cacheResult(cacheKey, data, ttl).catch((err) => {
      logger.warn(`[OddsService] Redis write error for ${cacheKey}:`, err);
    });

    return { data, fromCache: false };
  }

  /**
   * Cache data in Redis
   */
  private async cacheResult<T>(key: string, data: T, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(data));
    logger.debug(`[OddsService] Cached ${key} for ${ttl}s`);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Get all upcoming events for a sport
   */
  async getUpcomingEvents(sport: Sport): Promise<EventsResponse & { fromCache: boolean }> {
    const cacheKey = buildEventsKey(sport);

    const { data, fromCache } = await this.getOrFetch(
      cacheKey,
      () => this.provider.getUpcomingEvents(sport)
    );

    return { ...data, fromCache };
  }

  /**
   * Get odds for a specific event
   */
  async getEventOdds(
    sport: Sport,
    eventId: string,
    markets: MarketType[] = ['h2h']
  ): Promise<EventOddsResponse & { fromCache: boolean }> {
    const cacheKey = buildEventOddsKey(sport, eventId);

    const { data, fromCache } = await this.getOrFetch(
      cacheKey,
      () => this.provider.getEventOdds(sport, eventId, markets)
    );

    return { ...data, fromCache };
  }

  /**
   * Get all events with odds for a sport
   */
  async getOdds(
    options: FetchOddsOptions
  ): Promise<EventsResponse & { fromCache: boolean }> {
    const cacheKey = buildOddsKey(options);

    const { data, fromCache } = await this.getOrFetch(
      cacheKey,
      () => this.provider.getOdds(options)
    );

    return { ...data, fromCache };
  }

  /**
   * Force refresh cache for a specific event
   */
  async refreshEventOdds(
    sport: Sport,
    eventId: string,
    markets: MarketType[] = ['h2h']
  ): Promise<EventOddsResponse> {
    const cacheKey = buildEventOddsKey(sport, eventId);

    // Fetch fresh data
    const data = await this.provider.getEventOdds(sport, eventId, markets);

    // Update cache
    await this.cacheResult(cacheKey, data, this.cacheTtl);

    logger.info(`[OddsService] Force refreshed odds for event ${eventId}`);

    return data;
  }

  /**
   * Invalidate cache for a sport (useful after settlement)
   */
  async invalidateCache(sport: Sport): Promise<number> {
    const pattern = `${CACHE_PREFIX}:*${sport}*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info(`[OddsService] Invalidated ${keys.length} cache entries for ${sport}`);
    }

    return keys.length;
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<{
    provider: { healthy: boolean; name: string };
    cache: { healthy: boolean };
  }> {
    // Check provider
    const providerHealthy = await this.provider.healthCheck();

    // Check Redis
    let cacheHealthy = false;
    try {
      await this.redis.ping();
      cacheHealthy = true;
    } catch (error) {
      logger.error('[OddsService] Redis health check failed:', error);
    }

    return {
      provider: {
        healthy: providerHealthy,
        name: this.provider.providerName,
      },
      cache: {
        healthy: cacheHealthy,
      },
    };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    keyCount: number;
    memoryUsed: string;
  }> {
    const pattern = `${CACHE_PREFIX}:*`;
    const keys = await this.redis.keys(pattern);

    const info = await this.redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

    return {
      keyCount: keys.length,
      memoryUsed,
    };
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let oddsServiceInstance: OddsService | null = null;

/**
 * Get the singleton OddsService instance.
 * Lazy initialization to avoid startup issues.
 */
export function getOddsService(): OddsService {
  if (!oddsServiceInstance) {
    oddsServiceInstance = new OddsService();
  }
  return oddsServiceInstance;
}
