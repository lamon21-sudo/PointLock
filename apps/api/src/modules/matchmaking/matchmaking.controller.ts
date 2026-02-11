// =====================================================
// Matchmaking Controller
// =====================================================
// HTTP layer for matchmaking queue operations.
// Handles request validation, authentication, and response formatting.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@pick-rivals/shared-types';
import { GameMode } from '@prisma/client';
import { requireAuth, getAuthenticatedUser, creationRateLimiter } from '../../middleware';
import { validateRequest } from '../../middleware/validation.middleware';
import {
  enqueueForMatchmaking,
  leaveMatchmakingQueue,
  getQueueStatus,
} from '../../services/matchmaking.service';
import {
  joinQueueSchema,
  leaveQueueSchema,
  queueStatusSchema,
  QueueEntryResponse,
  QueueStatusResponse,
  QueueLeaveResponse,
} from './matchmaking.schemas';

const router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function bigIntToNumber(value: bigint): number {
  return Number(value);
}

// ===========================================
// Routes
// ===========================================

/**
 * POST /api/v1/matchmaking/queue
 * Join the matchmaking queue.
 *
 * Auth: Required
 * Body: { slipId, stakeAmount, region?, idempotencyKey? }
 * Response: 201 with QueueEntryResponse
 *
 * CRITICAL: This uses debit-first pattern - entry fee is charged
 * BEFORE the user is added to the queue.
 */
router.post(
  '/queue',
  requireAuth,
  creationRateLimiter,
  validateRequest(joinQueueSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { slipId, stakeAmount, region, idempotencyKey } = req.body;

      const entry = await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(stakeAmount),
        slipId,
        region,
        idempotencyKey,
      });

      const responseData: QueueEntryResponse = {
        id: entry.id,
        userId: entry.userId,
        gameMode: entry.gameMode as GameMode,
        tier: entry.tier,
        stakeAmount: bigIntToNumber(BigInt(entry.stakeAmount)),
        skillRating: entry.skillRating,
        slipSize: entry.slipSize,
        status: entry.status,
        enqueuedAt: entry.enqueuedAt.toISOString(),
        expiresAt: entry.expiresAt.toISOString(),
        matchId: entry.matchId,
      };

      const response: ApiResponse<QueueEntryResponse> = {
        success: true,
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/matchmaking/queue/:gameMode
 * Leave the matchmaking queue.
 *
 * Auth: Required
 * Params: gameMode (QUICK_MATCH)
 * Response: 200 with QueueLeaveResponse
 *
 * CRITICAL: This will refund the entry fee if the user was in the queue.
 */
router.delete(
  '/queue/:gameMode',
  requireAuth,
  validateRequest(leaveQueueSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { gameMode } = req.params;

      const success = await leaveMatchmakingQueue(user.id, gameMode as GameMode);

      const responseData: QueueLeaveResponse = {
        success,
        refunded: success, // Refund is processed if leave was successful
        message: success
          ? 'Successfully left the queue. Entry fee has been refunded.'
          : 'You are not currently in the queue.',
      };

      const response: ApiResponse<QueueLeaveResponse> = {
        success: true,
        data: responseData,
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
 * GET /api/v1/matchmaking/queue/:gameMode/status
 * Get current queue status for the user.
 *
 * Auth: Required
 * Params: gameMode (QUICK_MATCH)
 * Response: 200 with QueueStatusResponse
 */
router.get(
  '/queue/:gameMode/status',
  requireAuth,
  validateRequest(queueStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { gameMode } = req.params;

      const status = await getQueueStatus(user.id, gameMode as GameMode);

      const responseData: QueueStatusResponse = {
        entry: status.entry
          ? {
              id: status.entry.id,
              userId: status.entry.userId,
              gameMode: status.entry.gameMode as GameMode,
              tier: status.entry.tier,
              stakeAmount: status.entry.stakeAmount,
              skillRating: status.entry.skillRating,
              slipSize: status.entry.slipSize,
              status: status.entry.status,
              enqueuedAt: status.entry.enqueuedAt.toISOString(),
              expiresAt: status.entry.expiresAt.toISOString(),
              matchId: status.entry.matchId,
            }
          : null,
        position: status.position,
        estimatedWaitMs: status.estimatedWaitMs,
      };

      const response: ApiResponse<QueueStatusResponse> = {
        success: true,
        data: responseData,
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
