// =====================================================
// Match Controller
// =====================================================
// HTTP layer for match operations.
// Handles request validation, authentication, and response formatting.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { requireAuth, optionalAuth, getAuthenticatedUser, creationRateLimiter } from '../../middleware';
import { validateRequest } from '../../middleware/validation.middleware';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { trackEvent } from '../../utils/analytics';
import {
  createMatch,
  joinMatch,
  getMatchById,
  getUserMatches,
  getMatchByInviteCode,
  createRandomMatchLobby,
  createFriendChallenge,
} from './matches.service';
import {
  enqueueForMatchmaking,
  getQueueStatus,
} from '../../services/matchmaking.service';
import {
  createMatchSchema,
  joinMatchSchema,
  listMatchesQuerySchema,
  quickMatchSchema,
  randomMatchSchema,
  challengeFriendSchema,
  MatchDetails,
  PaginatedMatches,
  QuickMatchResponse,
  RandomMatchResponse,
  FriendChallengeResponse,
  QueueStatusResponse,
  QueueEntryInfo,
} from './matches.schemas';

const router = Router();

// ===========================================
// Helper Functions
// ===========================================

/**
 * Generates a unique request ID for tracing.
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ===========================================
// Routes
// ===========================================

/**
 * POST /api/v1/matches
 * Create a new match with invite code.
 *
 * Auth: Required
 * Body: { slipId, stakeAmount, inviteExpiresIn? }
 * Response: 201 with MatchDetails + inviteCode
 */
router.post(
  '/',
  requireAuth,
  creationRateLimiter,
  validateRequest(createMatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const matchData = req.body;

      const match = await createMatch(user.id, matchData);

      trackEvent({ name: 'match.created', userId: user.id });

      const response: ApiResponse<MatchDetails> = {
        success: true,
        data: match,
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
 * GET /api/v1/matches
 * List user's matches with filters.
 *
 * Auth: Required
 * Query: ?status=pending,matched&role=any&page=1&limit=20
 * Response: 200 with paginated matches
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      // Validate query parameters
      const queryResult = listMatchesQuerySchema.safeParse(req.query);

      if (!queryResult.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid query parameters',
            details: queryResult.error.errors,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        };
        res.status(400).json(response);
        return;
      }

      const filters = queryResult.data;
      const matches = await getUserMatches(user.id, filters);

      const response: ApiResponse<PaginatedMatches> = {
        success: true,
        data: matches,
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
 * GET /api/v1/matches/invite/:code
 * Get match by invite code (for opponents looking up matches).
 *
 * Auth: Optional (allows unauthenticated lookups)
 * Response: 200 with MatchDetails (creator picks excluded for privacy)
 */
router.get(
  '/invite/:code',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.params;

      if (!code || code.trim() === '') {
        throw new NotFoundError('Invite code is required', ERROR_CODES.VALIDATION_ERROR);
      }

      const match = await getMatchByInviteCode(code.toUpperCase());

      if (!match) {
        throw new NotFoundError(
          'Match not found with this invite code',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      const response: ApiResponse<MatchDetails> = {
        success: true,
        data: match,
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
 * GET /api/v1/matches/:id
 * Get match by ID (only if user is participant).
 *
 * Auth: Required
 * Response: 200 with MatchDetails
 */
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { id } = req.params;

      if (!id || id.trim() === '') {
        throw new NotFoundError('Match ID is required', ERROR_CODES.VALIDATION_ERROR);
      }

      const match = await getMatchById(id, user.id);

      if (!match) {
        throw new NotFoundError(
          'Match not found or you are not a participant',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      const response: ApiResponse<MatchDetails> = {
        success: true,
        data: match,
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
 * POST /api/v1/matches/:id/join
 * Join a match as opponent.
 *
 * Auth: Required
 * Body: { slipId }
 * Response: 200 with updated MatchDetails
 */
router.post(
  '/:id/join',
  requireAuth,
  creationRateLimiter,
  validateRequest(joinMatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { id } = req.params;
      const { slipId } = req.body;

      if (!id || id.trim() === '') {
        throw new NotFoundError('Match ID is required', ERROR_CODES.VALIDATION_ERROR);
      }

      const match = await joinMatch(id, user.id, slipId);

      trackEvent({ name: 'match.joined', userId: user.id, properties: { matchId: id } });

      const response: ApiResponse<MatchDetails> = {
        success: true,
        data: match,
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
// Task 2.2: New Match Mode Routes
// ===========================================

/**
 * POST /api/v1/matches/quick
 * Enter quick match queue (auto-matchmaking).
 *
 * Auth: Required
 * Body: { slipId, stakeAmount, region?, idempotencyKey? }
 * Response: 201 with queue entry status
 */
router.post(
  '/quick',
  requireAuth,
  creationRateLimiter,
  validateRequest(quickMatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { slipId, stakeAmount, region, idempotencyKey } = req.body;

      // Delegate to matchmaking service
      const entry = await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(stakeAmount),
        slipId,
        region,
        idempotencyKey,
      });

      // Transform entry for response
      const queueEntry: QueueEntryInfo = {
        id: entry.id,
        userId: entry.userId,
        gameMode: entry.gameMode,
        tier: entry.tier,
        stakeAmount: Number(entry.stakeAmount),
        skillRating: entry.skillRating,
        slipSize: entry.slipSize,
        status: entry.status,
        enqueuedAt: entry.enqueuedAt.toISOString(),
        expiresAt: entry.expiresAt.toISOString(),
        matchId: entry.matchId,
      };

      const responseData: QuickMatchResponse = {
        status: entry.matchId ? 'MATCHED' : 'QUEUED',
        queueEntry,
      };

      const response: ApiResponse<QuickMatchResponse> = {
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
 * POST /api/v1/matches/random
 * Create a random match lobby (browsable by others).
 *
 * Auth: Required
 * Body: { slipId, stakeAmount, lobbyExpiresIn? }
 * Response: 201 with lobby details
 */
router.post(
  '/random',
  requireAuth,
  creationRateLimiter,
  validateRequest(randomMatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const data = req.body;

      const match = await createRandomMatchLobby(user.id, data);

      const responseData: RandomMatchResponse = {
        status: 'LOBBY_CREATED',
        match,
        lobbyCode: match.inviteCode || '',
      };

      const response: ApiResponse<RandomMatchResponse> = {
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
 * POST /api/v1/matches/friend/:userId
 * Send a direct challenge to a friend.
 *
 * Auth: Required
 * Params: userId - target friend's UUID
 * Body: { slipId, stakeAmount, message? }
 * Response: 201 with challenge details
 */
router.post(
  '/friend/:userId',
  requireAuth,
  creationRateLimiter,
  validateRequest(challengeFriendSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { userId: targetUserId } = req.params;
      const data = req.body;

      // Self-challenge check (also validated in service, but fail fast)
      if (user.id === targetUserId) {
        throw new BadRequestError(
          'Cannot challenge yourself',
          ERROR_CODES.CANNOT_CHALLENGE_SELF
        );
      }

      const match = await createFriendChallenge(user.id, targetUserId, data);

      const responseData: FriendChallengeResponse = {
        status: 'CHALLENGE_SENT',
        match,
        targetUserId,
      };

      const response: ApiResponse<FriendChallengeResponse> = {
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
 * GET /api/v1/matches/queue/status
 * Get current user's queue status.
 *
 * Auth: Required
 * Response: 200 with queue status (inQueue, position, etc.)
 */
router.get(
  '/queue/status',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      // Check QUICK_MATCH queue (primary matchmaking mode)
      const status = await getQueueStatus(user.id, 'QUICK_MATCH');

      const responseData: QueueStatusResponse = {
        inQueue: !!status.entry,
        entry: status.entry
          ? {
              id: status.entry.id,
              userId: status.entry.userId,
              gameMode: status.entry.gameMode,
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

// ===========================================
// Export Router
// ===========================================

export default router;
