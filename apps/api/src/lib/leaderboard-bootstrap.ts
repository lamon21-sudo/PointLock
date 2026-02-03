// =====================================================
// Leaderboard Bootstrap
// =====================================================
// Ensures required leaderboards exist on application startup.
// Called once during server initialization.

import { prisma } from './prisma';
import { logger } from '../utils/logger';
import {
  GLOBAL_LEADERBOARD_SLUG,
  getWeekStart,
  getWeekEnd,
  getISOWeekNumber,
  generateWeeklySlug,
} from '../modules/leaderboard/leaderboard.service';

/**
 * Initialize required leaderboards.
 * Creates GLOBAL and current WEEKLY leaderboards if they don't exist.
 * Called once during application startup.
 */
export async function bootstrapLeaderboards(): Promise<void> {
  logger.info('[Leaderboard] Bootstrapping leaderboards...');

  try {
    // 1. Ensure global leaderboard exists
    const globalExists = await prisma.leaderboard.findUnique({
      where: { slug: GLOBAL_LEADERBOARD_SLUG },
    });

    if (!globalExists) {
      await prisma.leaderboard.create({
        data: {
          name: 'Global All-Time Leaderboard',
          slug: GLOBAL_LEADERBOARD_SLUG,
          description: 'All-time rankings across all matches',
          timeframe: 'GLOBAL',
          status: 'active',
          periodStart: null,
          periodEnd: null,
          isFeatured: true,
          displayOrder: 0,
        },
      });
      logger.info('[Leaderboard] Created global leaderboard');
    } else {
      logger.debug('[Leaderboard] Global leaderboard already exists');
    }

    // 2. Ensure current weekly leaderboard exists
    const weekStart = getWeekStart();
    const weeklySlug = generateWeeklySlug(weekStart);

    const weeklyExists = await prisma.leaderboard.findUnique({
      where: { slug: weeklySlug },
    });

    if (!weeklyExists) {
      const weekEnd = getWeekEnd(weekStart);
      const weekNum = getISOWeekNumber(weekStart);

      await prisma.leaderboard.create({
        data: {
          name: `Weekly Leaderboard - Week ${weekNum}, ${weekStart.getUTCFullYear()}`,
          slug: weeklySlug,
          timeframe: 'WEEKLY',
          status: 'active',
          periodStart: weekStart,
          periodEnd: weekEnd,
          displayOrder: 1,
        },
      });
      logger.info(`[Leaderboard] Created weekly leaderboard: ${weeklySlug}`);
    } else {
      logger.debug(`[Leaderboard] Weekly leaderboard already exists: ${weeklySlug}`);
    }

    logger.info('[Leaderboard] Bootstrap complete');
  } catch (error) {
    logger.error('[Leaderboard] Bootstrap failed:', error);
    // Re-throw to let the caller decide how to handle
    throw error;
  }
}
