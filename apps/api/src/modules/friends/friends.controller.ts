// =====================================================
// Friends Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to friends.service.ts
// CRITICAL: All endpoints require authentication.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, PaginationMeta } from '@pick-rivals/shared-types';
import {
  userIdParamSchema,
  friendshipIdParamSchema,
  listFriendsQuerySchema,
} from './friends.schemas';
import {
  listFriendships,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
  blockUser,
  unblockUser,
  getFriendshipStatus,
  FriendshipWithUsers,
  PaginatedFriendships,
  FriendshipStatusResult,
} from './friends.service';
import { requireAuth, getAuthenticatedUser } from '../../middleware';
import { logger } from '../../utils/logger';

const router: Router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ===========================================
// GET /friends
// ===========================================
// List friendships for the authenticated user
// Query params: filter, page, limit
// Requires: Bearer token authentication

router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      // Parse and validate query parameters
      const parsed = listFriendsQuerySchema.safeParse(req.query);
      const { filter, page, limit } = parsed.success
        ? parsed.data
        : { filter: 'all' as const, page: 1, limit: 20 };

      if (!parsed.success) {
        logger.warn('Invalid list friends query parameters', {
          userId: user.id,
          errors: parsed.error.errors,
          query: req.query,
        });
      }

      logger.info('List friendships requested', { userId: user.id, filter, page, limit });

      const result: PaginatedFriendships = await listFriendships(user.id, {
        filter,
        page,
        limit,
      });

      const paginationMeta: PaginationMeta = {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      };

      const response: ApiResponse<{ friendships: FriendshipWithUsers[] }> = {
        success: true,
        data: {
          friendships: result.friendships,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: paginationMeta,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /friends/status/:userId
// ===========================================
// Get friendship status with another user
// Returns status and available actions for UI
// Requires: Bearer token authentication

router.get(
  '/status/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = userIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid userId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { userId: targetUserId } = paramsParsed.data;

      logger.info('Get friendship status requested', {
        userId: user.id,
        targetUserId,
      });

      const status: FriendshipStatusResult = await getFriendshipStatus(
        user.id,
        targetUserId
      );

      const response: ApiResponse<FriendshipStatusResult> = {
        success: true,
        data: status,
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
// POST /friends/request/:userId
// ===========================================
// Send a friend request to another user
// Handles duplicate detection and mutual auto-accept
// Requires: Bearer token authentication

router.post(
  '/request/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = userIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid userId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { userId: targetUserId } = paramsParsed.data;

      logger.info('Send friend request', {
        requesterId: user.id,
        addresseeId: targetUserId,
      });

      const friendship: FriendshipWithUsers = await sendFriendRequest(
        user.id,
        targetUserId
      );

      const response: ApiResponse<{ friendship: FriendshipWithUsers }> = {
        success: true,
        data: { friendship },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      // Use 201 for created, or 200 if auto-accepted
      const statusCode = friendship.status === 'ACCEPTED' ? 200 : 201;
      res.status(statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// POST /friends/accept/:friendshipId
// ===========================================
// Accept a pending friend request
// Only the addressee can accept
// Requires: Bearer token authentication

router.post(
  '/accept/:friendshipId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = friendshipIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid friendshipId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid friendship ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { friendshipId } = paramsParsed.data;

      logger.info('Accept friend request', {
        userId: user.id,
        friendshipId,
      });

      const friendship: FriendshipWithUsers = await acceptFriendRequest(
        user.id,
        friendshipId
      );

      const response: ApiResponse<{ friendship: FriendshipWithUsers }> = {
        success: true,
        data: { friendship },
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
// POST /friends/decline/:friendshipId
// ===========================================
// Decline a pending friend request
// Only the addressee can decline
// Requires: Bearer token authentication

router.post(
  '/decline/:friendshipId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = friendshipIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid friendshipId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid friendship ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { friendshipId } = paramsParsed.data;

      logger.info('Decline friend request', {
        userId: user.id,
        friendshipId,
      });

      await declineFriendRequest(user.id, friendshipId);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Friend request declined successfully' },
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
// DELETE /friends/:friendshipId
// ===========================================
// Remove or cancel a friendship
// Requester can cancel pending, either party can remove accepted
// Requires: Bearer token authentication

router.delete(
  '/:friendshipId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = friendshipIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid friendshipId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid friendship ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { friendshipId } = paramsParsed.data;

      logger.info('Remove friendship', {
        userId: user.id,
        friendshipId,
      });

      await removeFriendship(user.id, friendshipId);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Friendship removed successfully' },
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
// POST /friends/block/:userId
// ===========================================
// Block a user
// Creates/updates friendship to BLOCKED status
// Deletes inverse friendship if exists
// Requires: Bearer token authentication

router.post(
  '/block/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = userIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid userId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { userId: targetUserId } = paramsParsed.data;

      logger.info('Block user', {
        blockerId: user.id,
        targetUserId,
      });

      const friendship: FriendshipWithUsers = await blockUser(user.id, targetUserId);

      const response: ApiResponse<{ friendship: FriendshipWithUsers }> = {
        success: true,
        data: { friendship },
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
// DELETE /friends/block/:userId
// ===========================================
// Unblock a user
// Removes the block record completely
// Requires: Bearer token authentication

router.delete(
  '/block/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = userIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('Invalid userId parameter', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { userId: targetUserId } = paramsParsed.data;

      logger.info('Unblock user', {
        blockerId: user.id,
        targetUserId,
      });

      await unblockUser(user.id, targetUserId);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'User unblocked successfully' },
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
