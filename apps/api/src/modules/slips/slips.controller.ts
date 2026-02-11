// =====================================================
// Slips Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to slips.service.ts

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { requireAuth, getAuthenticatedUser } from '../../middleware/auth.middleware';
import { creationRateLimiter } from '../../middleware/rate-limit.middleware';
import {
  validateCreateSlip,
  validateUpdateSlip,
  validateListSlipsQuery,
  validateSlipId,
  SlipListItem,
  SlipDetails,
} from './slips.schemas';
import * as slipsService from './slips.service';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { trackEvent } from '../../utils/analytics';

const router: Router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatValidationErrors(
  errors: { path: (string | number)[]; message: string }[]
): string {
  return errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// ===========================================
// POST /slips
// Create a new slip with picks
// ===========================================

router.post(
  '/',
  requireAuth,
  creationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate request body
      const validation = validateCreateSlip(req.body);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      logger.debug(`[SlipsController] Create slip request`, {
        requestId,
        userId: user.id,
        pickCount: validation.data.picks.length,
      });

      // Create slip
      const slip = await slipsService.createSlip(user.id, validation.data);

      trackEvent({ name: 'slip.created', userId: user.id, properties: { pickCount: validation.data.picks.length } });

      // Build response
      const response: ApiResponse<SlipDetails> = {
        success: true,
        data: slip,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /slips
// List user's slips with pagination
// ===========================================

router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate query parameters
      const validation = validateListSlipsQuery(req.query);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const query = validation.data;

      logger.debug(`[SlipsController] List slips request`, {
        requestId,
        userId: user.id,
        status: query.status,
        page: query.page,
        limit: query.limit,
        sort: query.sort,
      });

      // Fetch slips from service
      const result = await slipsService.getUserSlips(user.id, query);

      // Build response
      const response: ApiResponse<SlipListItem[]> = {
        success: true,
        data: result.slips,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
            hasNext: result.page < result.totalPages,
            hasPrev: result.page > 1,
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
// GET /slips/:id
// Get single slip by ID with full details
// ===========================================

router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate ID parameter
      const validation = validateSlipId({ id: req.params.id });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = validation.data;

      logger.debug(`[SlipsController] Get slip request`, {
        requestId,
        userId: user.id,
        slipId: id,
      });

      // Fetch slip from service (ensures user ownership)
      const slip = await slipsService.getSlipById(id, user.id);

      if (!slip) {
        throw new NotFoundError(
          `Slip with ID ${id} not found`,
          ERROR_CODES.SLIP_NOT_FOUND
        );
      }

      // Build response
      const response: ApiResponse<SlipDetails> = {
        success: true,
        data: slip,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// PATCH /slips/:id
// Update a slip (add/remove picks, update name)
// ===========================================

router.patch(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate ID parameter
      const idValidation = validateSlipId({ id: req.params.id });

      if (!idValidation.success || !idValidation.data) {
        throw new BadRequestError(
          formatValidationErrors(idValidation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Validate request body
      const bodyValidation = validateUpdateSlip(req.body);

      if (!bodyValidation.success || !bodyValidation.data) {
        throw new BadRequestError(
          formatValidationErrors(bodyValidation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = idValidation.data;
      const updateData = bodyValidation.data;

      logger.debug(`[SlipsController] Update slip request`, {
        requestId,
        userId: user.id,
        slipId: id,
        addPickCount: updateData.addPicks?.length ?? 0,
        removePickCount: updateData.removePickIds?.length ?? 0,
      });

      // Update slip
      const slip = await slipsService.updateSlip(id, user.id, updateData);

      // Build response
      const response: ApiResponse<SlipDetails> = {
        success: true,
        data: slip,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// DELETE /slips/:id
// Delete a slip (draft only)
// ===========================================

router.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate ID parameter
      const validation = validateSlipId({ id: req.params.id });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = validation.data;

      logger.debug(`[SlipsController] Delete slip request`, {
        requestId,
        userId: user.id,
        slipId: id,
      });

      // Delete slip
      await slipsService.deleteSlip(id, user.id);

      // Build response
      const response: ApiResponse<{ deleted: boolean }> = {
        success: true,
        data: { deleted: true },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// POST /slips/:id/lock
// Lock a slip (submit/place the slip)
// ===========================================

router.post(
  '/:id/lock',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);

      // Validate ID parameter
      const validation = validateSlipId({ id: req.params.id });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = validation.data;

      logger.debug(`[SlipsController] Lock slip request`, {
        requestId,
        userId: user.id,
        slipId: id,
      });

      // Lock slip
      const slip = await slipsService.lockSlip(id, user.id);

      trackEvent({ name: 'slip.locked', userId: user.id, properties: { slipId: id } });

      // Build response
      const response: ApiResponse<SlipDetails> = {
        success: true,
        data: slip,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// POST /slips/validate-draft
// Validate draft picks and return current odds
// Used for offline slip revalidation
// ===========================================

router.post(
  '/validate-draft',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();
      const user = getAuthenticatedUser(req);
      const { picks } = req.body;

      if (!picks || !Array.isArray(picks)) {
        throw new BadRequestError(
          'picks array is required',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      if (picks.length === 0) {
        throw new BadRequestError(
          'picks array cannot be empty',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      if (picks.length > 8) {
        throw new BadRequestError(
          'Maximum 8 picks allowed for validation',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      logger.debug(`[SlipsController] Validate draft request`, {
        requestId,
        userId: user.id,
        pickCount: picks.length,
      });

      // Validate picks
      const validatedPicks = await slipsService.validateDraftPicks(picks);

      // Build response
      const response: ApiResponse<{ picks: typeof validatedPicks }> = {
        success: true,
        data: { picks: validatedPicks },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
