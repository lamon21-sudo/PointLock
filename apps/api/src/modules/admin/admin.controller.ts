// =====================================================
// Admin Controller
// Task 8.5: Settlement Edge Cases
// =====================================================
// HTTP layer for admin operations.
// All endpoints require SETTLEMENT_ADMIN or higher role.
// CRITICAL: Full audit trail for all actions.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { requireAuth, getAuthenticatedUser } from '../../middleware';
import { validateRequest } from '../../middleware/validation.middleware';
import { prisma } from '../../lib/prisma';
import {
  manualSettleMatch,
  validateAdminPermission,
  handleCancelledEvent,
  checkSettlementEligibility,
} from '../../services/settlement/settlement-edge-cases.service';
import {
  manualSettlementSchema,
  cancelEventSchema,
  auditLogQuerySchema,
  pendingSettlementsQuerySchema,
} from './admin.schemas';
const router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `admin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Middleware to require admin role.
 * Must be used after requireAuth.
 */
async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'SETTLEMENT_ADMIN');
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require viewer role (read-only access).
 */
async function requireViewer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'VIEWER');
    next();
  } catch (error) {
    next(error);
  }
}

// ===========================================
// Manual Settlement Endpoints
// ===========================================

/**
 * POST /api/v1/admin/matches/:id/settle
 * Manually settle a match (force settle, void, or resolve dispute).
 *
 * Auth: Required (SETTLEMENT_ADMIN)
 * Body: { action, winnerId?, reason, metadata? }
 * Response: 200 with settlement result
 */
router.post(
  '/matches/:id/settle',
  requireAuth,
  requireAdmin,
  validateRequest(manualSettlementSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const matchId = req.params.id;
      const { action, winnerId, reason, metadata } = req.body;

      const result = await manualSettleMatch({
        matchId,
        adminId: user.id,
        action,
        winnerId,
        reason,
        metadata,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/matches/:id/audit-log
 * Get audit log for a specific match.
 *
 * Auth: Required (VIEWER)
 * Query: ?page=1&limit=50&action=SETTLED
 * Response: 200 with audit log entries
 */
router.get(
  '/matches/:id/audit-log',
  requireAuth,
  requireViewer,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const matchId = req.params.id;

      const queryResult = auditLogQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid query parameters',
            details: queryResult.error.errors,
          },
        };
        res.status(400).json(response);
        return;
      }

      const { page, limit, action } = queryResult.data;
      const skip = (page - 1) * limit;

      const [auditLogs, total] = await Promise.all([
        prisma.matchAuditLog.findMany({
          where: {
            matchId,
            ...(action && { action }),
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.matchAuditLog.count({
          where: {
            matchId,
            ...(action && { action }),
          },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const response: ApiResponse<typeof auditLogs> = {
        success: true,
        data: auditLogs,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/matches/:id/eligibility
 * Check settlement eligibility for a match.
 *
 * Auth: Required (VIEWER)
 * Response: 200 with eligibility result
 */
router.get(
  '/matches/:id/eligibility',
  requireAuth,
  requireViewer,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const matchId = req.params.id;

      const eligibility = await checkSettlementEligibility(matchId);

      const response: ApiResponse<typeof eligibility> = {
        success: true,
        data: eligibility,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Event Management Endpoints
// ===========================================

/**
 * POST /api/v1/admin/events/:id/cancel
 * Cancel a sports event and void affected picks.
 *
 * Auth: Required (SETTLEMENT_ADMIN)
 * Body: { reason }
 * Response: 200 with affected matches
 */
router.post(
  '/events/:id/cancel',
  requireAuth,
  requireAdmin,
  validateRequest(cancelEventSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = req.params.id;
      const { reason } = req.body;

      const results = await handleCancelledEvent(eventId, reason);

      const response: ApiResponse<typeof results> = {
        success: true,
        data: results,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Settlement Overview Endpoints
// ===========================================

/**
 * GET /api/v1/admin/settlements/pending
 * List matches pending settlement or with issues.
 *
 * Auth: Required (VIEWER)
 * Query: ?status=active&page=1&limit=20
 * Response: 200 with paginated matches
 */
router.get(
  '/settlements/pending',
  requireAuth,
  requireViewer,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queryResult = pendingSettlementsQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid query parameters',
            details: queryResult.error.errors,
          },
        };
        res.status(400).json(response);
        return;
      }

      const { status, page, limit } = queryResult.data;
      const skip = (page - 1) * limit;

      // Build where clause based on status filter
      const whereActive = { status: 'active' as const };
      const wherePostponed = { status: 'active' as const, hasPostponedEvents: true };
      const whereDisputed = { status: 'disputed' as const };

      const whereClause = status === 'postponed'
        ? wherePostponed
        : status === 'disputed'
          ? whereDisputed
          : whereActive;

      const [matches, total] = await Promise.all([
        prisma.match.findMany({
          where: whereClause,
          select: {
            id: true,
            status: true,
            stakeAmount: true,
            creatorId: true,
            opponentId: true,
            hasPostponedEvents: true,
            postponedCheckAt: true,
            createdAt: true,
            startedAt: true,
            creator: { select: { username: true } },
            opponent: { select: { username: true } },
            _count: {
              select: {
                auditLogs: true,
                disputes: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.match.count({ where: whereClause }),
      ]);

      // Convert BigInt to number for JSON serialization
      const serializedMatches = matches.map((m) => ({
        ...m,
        stakeAmount: Number(m.stakeAmount),
      }));

      const totalPagesPending = Math.ceil(total / limit);
      const response: ApiResponse<typeof serializedMatches> = {
        success: true,
        data: serializedMatches,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: {
            page,
            limit,
            total,
            totalPages: totalPagesPending,
            hasNext: page < totalPagesPending,
            hasPrev: page > 1,
          },
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/settlements/manual
 * List manually settled matches for audit review.
 *
 * Auth: Required (VIEWER)
 * Response: 200 with manually settled matches
 */
router.get(
  '/settlements/manual',
  requireAuth,
  requireViewer,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queryResult = auditLogQuerySchema.safeParse(req.query);
      const { page = 1, limit = 20 } = queryResult.success ? queryResult.data : {};
      const skip = (page - 1) * limit;

      const [matches, total] = await Promise.all([
        prisma.match.findMany({
          where: { isManuallySettled: true },
          select: {
            id: true,
            status: true,
            stakeAmount: true,
            manualSettleReason: true,
            manualSettledBy: true,
            manualSettledAt: true,
            winnerId: true,
            creatorId: true,
            opponentId: true,
            creator: { select: { username: true } },
            opponent: { select: { username: true } },
            winner: { select: { username: true } },
          },
          orderBy: { manualSettledAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.match.count({ where: { isManuallySettled: true } }),
      ]);

      const serializedMatches = matches.map((m) => ({
        ...m,
        stakeAmount: Number(m.stakeAmount),
      }));

      const totalPagesManual = Math.ceil(total / limit);
      const response: ApiResponse<typeof serializedMatches> = {
        success: true,
        data: serializedMatches,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: {
            page,
            limit,
            total,
            totalPages: totalPagesManual,
            hasNext: page < totalPagesManual,
            hasPrev: page > 1,
          },
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Leaderboard Cache Endpoints
// ===========================================

/**
 * POST /api/v1/admin/leaderboard/refresh-cache
 * Force rebuild of leaderboard cache.
 *
 * Auth: Required (SETTLEMENT_ADMIN)
 * Response: 200 with job info
 */
router.post(
  '/leaderboard/refresh-cache',
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { queueFullCacheRebuild } = await import('../../queues/leaderboard.queue');
      const job = await queueFullCacheRebuild('manual');

      const response: ApiResponse<{ jobId: string; message: string }> = {
        success: true,
        data: {
          jobId: job.id || 'unknown',
          message: 'Leaderboard cache rebuild queued',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/leaderboard/cache-status
 * Get the current status of the leaderboard cache.
 *
 * Auth: Required (VIEWER)
 * Response: 200 with cache status
 */
router.get(
  '/leaderboard/cache-status',
  requireAuth,
  requireViewer,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { getCacheStatus } = await import('../leaderboard/leaderboard-cache.service');
      const { getLeaderboardUpdateQueueStatus } = await import('../../queues/leaderboard.queue');

      const [cacheStatus, queueStatus] = await Promise.all([
        getCacheStatus(),
        getLeaderboardUpdateQueueStatus(),
      ]);

      const response: ApiResponse<{
        cache: typeof cacheStatus;
        queue: typeof queueStatus;
      }> = {
        success: true,
        data: {
          cache: cacheStatus,
          queue: queueStatus,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
