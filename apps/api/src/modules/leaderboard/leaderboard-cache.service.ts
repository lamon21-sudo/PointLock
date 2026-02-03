// =====================================================
// Leaderboard Cache Service
// =====================================================
// Redis ZSET-based caching for fast leaderboard access.
// Provides sub-10ms reads for top 100 leaderboard data.

import { logger } from '../../utils/logger';
import { prisma } from '../../lib/prisma';
import {
  GLOBAL_LEADERBOARD_SLUG,
  generateWeeklySlug,
  getWeekStart,
} from './leaderboard.service';
import { LeaderboardEntryResponse } from './leaderboard.schemas';

// ===========================================
// Types
// ===========================================

export interface CachedLeaderboardEntry extends LeaderboardEntryResponse {}

export interface CacheUpdateResult {
  success: boolean;
  globalEntriesUpdated: number;
  weeklyEntriesUpdated: number;
  duration: number;
}

// ===========================================
// Cache Keys
// ===========================================

const CACHE_KEYS = {
  globalTop100: 'leaderboard:global:top100',
  weeklyTop100: (slug: string) => `leaderboard:weekly:${slug}:top100`,
  userMetadata: (userId: string) => `leaderboard:user:${userId}`,
  lastUpdate: 'leaderboard:cache:lastUpdate',
} as const;

const CACHE_TTL = 3600; // 1 hour in seconds
const TOP_100_LIMIT = 100;

// ===========================================
// Redis Client Access
// ===========================================

/**
 * Get the Redis client for cache operations.
 * Uses the same connection as BullMQ queues.
 */
async function getRedis() {
  // Lazy import to avoid circular dependencies
  const { getRedisConnection } = await import('../../queues/connection');
  return getRedisConnection();
}

// ===========================================
// Cache Write Operations
// ===========================================

/**
 * Rebuild the global leaderboard cache from database.
 * Fetches top 100 entries and populates Redis ZSET.
 */
export async function updateGlobalLeaderboardCache(): Promise<number> {
  const startTime = Date.now();

  try {
    const redis = await getRedis();

    // Find global leaderboard
    const leaderboard = await prisma.leaderboard.findUnique({
      where: { slug: GLOBAL_LEADERBOARD_SLUG },
    });

    if (!leaderboard) {
      logger.warn('[LeaderboardCache] Global leaderboard not found');
      return 0;
    }

    // Fetch top 100 entries with user data
    const entries = await prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        username: string;
        avatar_url: string | null;
        score: number;
        wins: number;
        losses: number;
        draws: number;
        matches_played: number;
        win_rate: number;
        current_streak: number;
        previous_rank: number | null;
      }>
    >`
      SELECT
        le.id,
        le.user_id,
        u.username,
        u.avatar_url,
        CAST(le.score AS FLOAT) as score,
        le.wins,
        le.losses,
        le.draws,
        le.matches_played,
        CAST(le.win_rate AS FLOAT) as win_rate,
        le.current_streak,
        le.previous_rank
      FROM leaderboard_entries le
      JOIN users u ON le.user_id = u.id
      WHERE le.leaderboard_id = ${leaderboard.id}
      ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
      LIMIT ${TOP_100_LIMIT}
    `;

    if (entries.length === 0) {
      // Clear the cache if no entries
      await redis.del(CACHE_KEYS.globalTop100);
      return 0;
    }

    // Build ZSET and user metadata in a pipeline
    const pipeline = redis.pipeline();

    // Clear existing ZSET
    pipeline.del(CACHE_KEYS.globalTop100);

    // Add all users to ZSET with their scores
    // Use a composite score for tiebreaking: score * 1e6 + winRate * 1e3 + matchesPlayed
    for (const entry of entries) {
      // Primary sort by score, tiebreakers embedded in decimal places
      const compositeScore =
        entry.score * 1e6 +
        entry.win_rate * 1e3 +
        Math.min(entry.matches_played, 999);
      pipeline.zadd(CACHE_KEYS.globalTop100, compositeScore, entry.user_id);
    }

    // Set TTL on the ZSET
    pipeline.expire(CACHE_KEYS.globalTop100, CACHE_TTL);

    // Store user metadata in hashes
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const rankChange =
        entry.previous_rank !== null ? entry.previous_rank - rank : null;

      pipeline.hset(CACHE_KEYS.userMetadata(entry.user_id), {
        username: entry.username,
        avatarUrl: entry.avatar_url || '',
        score: String(entry.score),
        wins: String(entry.wins),
        losses: String(entry.losses),
        draws: String(entry.draws),
        matchesPlayed: String(entry.matches_played),
        winRate: String(entry.win_rate),
        currentStreak: String(entry.current_streak),
        previousRank: entry.previous_rank !== null ? String(entry.previous_rank) : '',
        rank: String(rank),
        rankChange: rankChange !== null ? String(rankChange) : '',
      });
      pipeline.expire(CACHE_KEYS.userMetadata(entry.user_id), CACHE_TTL);
    }

    // Execute pipeline
    await pipeline.exec();

    const duration = Date.now() - startTime;
    logger.info(
      `[LeaderboardCache] Global cache updated: ${entries.length} entries in ${duration}ms`
    );

    return entries.length;
  } catch (error) {
    logger.error('[LeaderboardCache] Failed to update global cache:', error);
    throw error;
  }
}

/**
 * Rebuild the weekly leaderboard cache from database.
 */
export async function updateWeeklyLeaderboardCache(): Promise<number> {
  const startTime = Date.now();

  try {
    const redis = await getRedis();
    const weeklySlug = generateWeeklySlug(getWeekStart());

    // Find weekly leaderboard
    const leaderboard = await prisma.leaderboard.findUnique({
      where: { slug: weeklySlug },
    });

    if (!leaderboard) {
      logger.warn(`[LeaderboardCache] Weekly leaderboard not found: ${weeklySlug}`);
      return 0;
    }

    // Fetch top 100 entries
    const entries = await prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        username: string;
        avatar_url: string | null;
        score: number;
        wins: number;
        losses: number;
        draws: number;
        matches_played: number;
        win_rate: number;
        current_streak: number;
        previous_rank: number | null;
      }>
    >`
      SELECT
        le.id,
        le.user_id,
        u.username,
        u.avatar_url,
        CAST(le.score AS FLOAT) as score,
        le.wins,
        le.losses,
        le.draws,
        le.matches_played,
        CAST(le.win_rate AS FLOAT) as win_rate,
        le.current_streak,
        le.previous_rank
      FROM leaderboard_entries le
      JOIN users u ON le.user_id = u.id
      WHERE le.leaderboard_id = ${leaderboard.id}
      ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
      LIMIT ${TOP_100_LIMIT}
    `;

    const cacheKey = CACHE_KEYS.weeklyTop100(weeklySlug);

    if (entries.length === 0) {
      await redis.del(cacheKey);
      return 0;
    }

    const pipeline = redis.pipeline();

    // Clear existing ZSET
    pipeline.del(cacheKey);

    // Add all users with composite scores
    for (const entry of entries) {
      const compositeScore =
        entry.score * 1e6 +
        entry.win_rate * 1e3 +
        Math.min(entry.matches_played, 999);
      pipeline.zadd(cacheKey, compositeScore, entry.user_id);
    }

    pipeline.expire(cacheKey, CACHE_TTL);

    // Store user metadata (weekly-specific)
    // Note: We reuse the same user metadata keys - weekly data overwrites global
    // This is intentional since we're showing one leaderboard at a time
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const rankChange =
        entry.previous_rank !== null ? entry.previous_rank - rank : null;

      const weeklyUserKey = `${CACHE_KEYS.userMetadata(entry.user_id)}:${weeklySlug}`;
      pipeline.hset(weeklyUserKey, {
        username: entry.username,
        avatarUrl: entry.avatar_url || '',
        score: String(entry.score),
        wins: String(entry.wins),
        losses: String(entry.losses),
        draws: String(entry.draws),
        matchesPlayed: String(entry.matches_played),
        winRate: String(entry.win_rate),
        currentStreak: String(entry.current_streak),
        previousRank: entry.previous_rank !== null ? String(entry.previous_rank) : '',
        rank: String(rank),
        rankChange: rankChange !== null ? String(rankChange) : '',
      });
      pipeline.expire(weeklyUserKey, CACHE_TTL);
    }

    await pipeline.exec();

    const duration = Date.now() - startTime;
    logger.info(
      `[LeaderboardCache] Weekly cache updated (${weeklySlug}): ${entries.length} entries in ${duration}ms`
    );

    return entries.length;
  } catch (error) {
    logger.error('[LeaderboardCache] Failed to update weekly cache:', error);
    throw error;
  }
}

/**
 * Update a single user's score in the cache after settlement.
 * More efficient than full rebuild for individual updates.
 */
export async function updateUserScoreInCache(
  userId: string,
  globalScore: number,
  weeklyScore: number,
  weeklySlug: string
): Promise<void> {
  try {
    const redis = await getRedis();
    const pipeline = redis.pipeline();

    // Update global ZSET (ZADD is upsert)
    const globalCompositeScore = globalScore * 1e6;
    pipeline.zadd(CACHE_KEYS.globalTop100, globalCompositeScore, userId);

    // Update weekly ZSET
    const weeklyCompositeScore = weeklyScore * 1e6;
    pipeline.zadd(CACHE_KEYS.weeklyTop100(weeklySlug), weeklyCompositeScore, userId);

    // Trim to top 100 + buffer (keep 110 to avoid thrashing)
    pipeline.zremrangebyrank(CACHE_KEYS.globalTop100, 0, -111);
    pipeline.zremrangebyrank(CACHE_KEYS.weeklyTop100(weeklySlug), 0, -111);

    await pipeline.exec();

    logger.debug(`[LeaderboardCache] Updated scores for user ${userId}`);
  } catch (error) {
    logger.error('[LeaderboardCache] Failed to update user score:', error);
    // Don't throw - cache failures shouldn't break the app
  }
}

// ===========================================
// Cache Read Operations
// ===========================================

/**
 * Get cached global leaderboard entries.
 * Returns null on cache miss (caller should fall back to DB).
 */
export async function getCachedGlobalLeaderboard(
  start: number,
  end: number
): Promise<CachedLeaderboardEntry[] | null> {
  try {
    const redis = await getRedis();

    // Get user IDs from ZSET in descending order
    const userIds = await redis.zrevrange(CACHE_KEYS.globalTop100, start, end);

    if (!userIds || userIds.length === 0) {
      return null; // Cache miss
    }

    // Fetch metadata for each user
    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      pipeline.hgetall(CACHE_KEYS.userMetadata(userId));
    }

    const results = await pipeline.exec();

    if (!results) {
      return null;
    }

    const entries: CachedLeaderboardEntry[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const result = results[i];
      if (!result || result[0] || !result[1]) {
        // Error or empty result - cache miss
        return null;
      }

      const data = result[1] as Record<string, string>;
      if (!data.username) {
        // Missing required data - cache miss
        return null;
      }

      entries.push({
        rank: start + i + 1,
        previousRank: data.previousRank ? parseInt(data.previousRank, 10) : null,
        rankChange: data.rankChange ? parseInt(data.rankChange, 10) : null,
        userId: userIds[i],
        username: data.username,
        avatarUrl: data.avatarUrl || null,
        score: parseFloat(data.score || '0'),
        wins: parseInt(data.wins || '0', 10),
        losses: parseInt(data.losses || '0', 10),
        draws: parseInt(data.draws || '0', 10),
        matchesPlayed: parseInt(data.matchesPlayed || '0', 10),
        winRate: parseFloat(data.winRate || '0'),
        currentStreak: parseInt(data.currentStreak || '0', 10),
      });
    }

    return entries;
  } catch (error) {
    logger.warn('[LeaderboardCache] Cache read error:', error);
    return null; // Graceful degradation
  }
}

/**
 * Get cached weekly leaderboard entries.
 * Returns null on cache miss.
 */
export async function getCachedWeeklyLeaderboard(
  slug: string,
  start: number,
  end: number
): Promise<CachedLeaderboardEntry[] | null> {
  try {
    const redis = await getRedis();
    const cacheKey = CACHE_KEYS.weeklyTop100(slug);

    const userIds = await redis.zrevrange(cacheKey, start, end);

    if (!userIds || userIds.length === 0) {
      return null;
    }

    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      const weeklyUserKey = `${CACHE_KEYS.userMetadata(userId)}:${slug}`;
      pipeline.hgetall(weeklyUserKey);
    }

    const results = await pipeline.exec();

    if (!results) {
      return null;
    }

    const entries: CachedLeaderboardEntry[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const result = results[i];
      if (!result || result[0] || !result[1]) {
        return null;
      }

      const data = result[1] as Record<string, string>;
      if (!data.username) {
        return null;
      }

      entries.push({
        rank: start + i + 1,
        previousRank: data.previousRank ? parseInt(data.previousRank, 10) : null,
        rankChange: data.rankChange ? parseInt(data.rankChange, 10) : null,
        userId: userIds[i],
        username: data.username,
        avatarUrl: data.avatarUrl || null,
        score: parseFloat(data.score || '0'),
        wins: parseInt(data.wins || '0', 10),
        losses: parseInt(data.losses || '0', 10),
        draws: parseInt(data.draws || '0', 10),
        matchesPlayed: parseInt(data.matchesPlayed || '0', 10),
        winRate: parseFloat(data.winRate || '0'),
        currentStreak: parseInt(data.currentStreak || '0', 10),
      });
    }

    return entries;
  } catch (error) {
    logger.warn('[LeaderboardCache] Weekly cache read error:', error);
    return null;
  }
}

// ===========================================
// Cache Management Operations
// ===========================================

/**
 * Full cache rebuild - updates both global and weekly caches.
 */
export async function rebuildLeaderboardCaches(): Promise<CacheUpdateResult> {
  const startTime = Date.now();

  try {
    const [globalCount, weeklyCount] = await Promise.all([
      updateGlobalLeaderboardCache(),
      updateWeeklyLeaderboardCache(),
    ]);

    // Update last update timestamp
    const redis = await getRedis();
    await redis.set(CACHE_KEYS.lastUpdate, new Date().toISOString());
    await redis.expire(CACHE_KEYS.lastUpdate, CACHE_TTL);

    const duration = Date.now() - startTime;

    logger.info(
      `[LeaderboardCache] Full rebuild complete: global=${globalCount}, weekly=${weeklyCount} in ${duration}ms`
    );

    return {
      success: true,
      globalEntriesUpdated: globalCount,
      weeklyEntriesUpdated: weeklyCount,
      duration,
    };
  } catch (error) {
    logger.error('[LeaderboardCache] Full rebuild failed:', error);
    return {
      success: false,
      globalEntriesUpdated: 0,
      weeklyEntriesUpdated: 0,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Invalidate all leaderboard caches.
 * Used on weekly reset or when data integrity is uncertain.
 */
export async function invalidateLeaderboardCaches(): Promise<void> {
  try {
    const redis = await getRedis();
    const weeklySlug = generateWeeklySlug(getWeekStart());

    const pipeline = redis.pipeline();
    pipeline.del(CACHE_KEYS.globalTop100);
    pipeline.del(CACHE_KEYS.weeklyTop100(weeklySlug));
    pipeline.del(CACHE_KEYS.lastUpdate);

    await pipeline.exec();

    logger.info('[LeaderboardCache] Caches invalidated');
  } catch (error) {
    logger.error('[LeaderboardCache] Failed to invalidate caches:', error);
  }
}

/**
 * Check if the cache is stale or missing.
 */
export async function isCacheStale(): Promise<boolean> {
  try {
    const redis = await getRedis();
    const lastUpdate = await redis.get(CACHE_KEYS.lastUpdate);

    if (!lastUpdate) {
      return true; // No cache
    }

    const lastUpdateTime = new Date(lastUpdate).getTime();
    const now = Date.now();
    const ageMs = now - lastUpdateTime;

    // Consider stale if older than TTL (with 10% buffer)
    return ageMs > CACHE_TTL * 1000 * 0.9;
  } catch {
    return true; // Error = assume stale
  }
}

/**
 * Get cache status for monitoring.
 */
export async function getCacheStatus(): Promise<{
  lastUpdate: string | null;
  globalEntries: number;
  weeklyEntries: number;
  isStale: boolean;
}> {
  try {
    const redis = await getRedis();
    const weeklySlug = generateWeeklySlug(getWeekStart());

    const [lastUpdate, globalCount, weeklyCount] = await Promise.all([
      redis.get(CACHE_KEYS.lastUpdate),
      redis.zcard(CACHE_KEYS.globalTop100),
      redis.zcard(CACHE_KEYS.weeklyTop100(weeklySlug)),
    ]);

    const isStale = await isCacheStale();

    return {
      lastUpdate,
      globalEntries: globalCount,
      weeklyEntries: weeklyCount,
      isStale,
    };
  } catch (error) {
    logger.error('[LeaderboardCache] Failed to get cache status:', error);
    return {
      lastUpdate: null,
      globalEntries: 0,
      weeklyEntries: 0,
      isStale: true,
    };
  }
}
