// =====================================================
// Leaderboard Controller
// =====================================================
// HTTP layer for leaderboard endpoints.
// Handles request validation and response formatting.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { optionalAuth } from '../../middleware';
import {
  leaderboardQuerySchema,
  PaginatedLeaderboard,
} from './leaderboard.schemas';
import {
  getGlobalLeaderboard,
  getWeeklyLeaderboard,
  generateWeeklySlug,
  getWeekStart,
  GLOBAL_LEADERBOARD_SLUG,
} from './leaderboard.service';
import {
  getCachedGlobalLeaderboard,
  getCachedWeeklyLeaderboard,
} from './leaderboard-cache.service';
import { BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ===========================================
// GET /api/v1/leaderboard
// Global all-time leaderboard
// ===========================================

router.get(
  '/',
  optionalAuth, // Public endpoint, auth optional for potential "your rank" feature
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();

      // Validate query parameters
      const queryResult = leaderboardQuerySchema.safeParse(req.query);

      if (!queryResult.success) {
        throw new BadRequestError(
          'Invalid query parameters',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { page, limit } = queryResult.data;

      // Try cache first for first page requests within top 100
      if (page === 1 && limit <= 100) {
        try {
          const cachedEntries = await getCachedGlobalLeaderboard(0, limit - 1);

          if (cachedEntries && cachedEntries.length > 0) {
            const cachedResponse: ApiResponse<PaginatedLeaderboard> = {
              success: true,
              data: {
                leaderboard: {
                  id: GLOBAL_LEADERBOARD_SLUG,
                  name: 'Global All-Time',
                  timeframe: 'GLOBAL',
                  periodStart: null,
                  periodEnd: null,
                  entries: cachedEntries,
                },
                pagination: {
                  page: 1,
                  limit,
                  total: cachedEntries.length,
                  totalPages: 1,
                  hasNext: false,
                  hasPrev: false,
                },
              },
              meta: {
                timestamp: new Date().toISOString(),
                requestId,
              },
            };

            logger.debug(`[Leaderboard] Serving global leaderboard from cache (${cachedEntries.length} entries)`);
            res.status(200).json(cachedResponse);
            return;
          }
        } catch (cacheError) {
          // Cache miss or error - fall through to DB query
          logger.warn('[Leaderboard] Global cache miss, falling back to DB:', cacheError);
        }
      }

      // Fall back to database query
      const result = await getGlobalLeaderboard(queryResult.data);

      const response: ApiResponse<PaginatedLeaderboard> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          pagination: result.pagination,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /api/v1/leaderboard/weekly
// Current week leaderboard
// ===========================================

router.get(
  '/weekly',
  optionalAuth, // Public endpoint, auth optional
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();

      const queryResult = leaderboardQuerySchema.safeParse(req.query);

      if (!queryResult.success) {
        throw new BadRequestError(
          'Invalid query parameters',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { page, limit } = queryResult.data;
      const weeklySlug = generateWeeklySlug(getWeekStart());

      // Try cache first for first page requests within top 100
      if (page === 1 && limit <= 100) {
        try {
          const cachedEntries = await getCachedWeeklyLeaderboard(weeklySlug, 0, limit - 1);

          if (cachedEntries && cachedEntries.length > 0) {
            const weekStart = getWeekStart();
            const weekEnd = new Date(weekStart);
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
            weekEnd.setUTCHours(23, 59, 59, 999);

            const cachedResponse: ApiResponse<PaginatedLeaderboard> = {
              success: true,
              data: {
                leaderboard: {
                  id: weeklySlug,
                  name: `Weekly Leaderboard`,
                  timeframe: 'WEEKLY',
                  periodStart: weekStart.toISOString(),
                  periodEnd: weekEnd.toISOString(),
                  entries: cachedEntries,
                },
                pagination: {
                  page: 1,
                  limit,
                  total: cachedEntries.length,
                  totalPages: 1,
                  hasNext: false,
                  hasPrev: false,
                },
              },
              meta: {
                timestamp: new Date().toISOString(),
                requestId,
              },
            };

            logger.debug(`[Leaderboard] Serving weekly leaderboard from cache (${cachedEntries.length} entries)`);
            res.status(200).json(cachedResponse);
            return;
          }
        } catch (cacheError) {
          // Cache miss or error - fall through to DB query
          logger.warn('[Leaderboard] Weekly cache miss, falling back to DB:', cacheError);
        }
      }

      // Fall back to database query
      const result = await getWeeklyLeaderboard(queryResult.data);

      const response: ApiResponse<PaginatedLeaderboard> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          pagination: result.pagination,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
