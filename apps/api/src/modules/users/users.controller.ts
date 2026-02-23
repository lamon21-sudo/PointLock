// =====================================================
// Users Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to users.service.ts

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import {
  updateProfileSchema,
  userIdParamSchema,
  updateOnboardingSchema,
  UpdateProfileInput,
} from './users.schemas';
import {
  getMyProfile,
  getPublicProfile,
  updateProfile,
  updateOnboardingStatus,
  UserProfile,
} from './users.service';
import { requireAuth, optionalAuth, getAuthenticatedUser } from '../../middleware';
import { BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router: Router = Router();

// ===========================================
// Types
// ===========================================

interface UserProfileResponse {
  user: UserProfile;
}

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ===========================================
// GET /me
// ===========================================
// Returns the authenticated user's own profile.
// Requires: Bearer token authentication
// Response: User profile with calculated stats

router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Profile fetch requested for user: ${user.id}`);

      const profile = await getMyProfile(user.id);

      const responseData: UserProfileResponse = {
        user: profile,
      };

      const response: ApiResponse<UserProfileResponse> = {
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
// GET /:id
// ===========================================
// Returns a public user profile by ID.
// Optional authentication - can be accessed by anyone.
// Response: Public user profile with stats
// Error: 404 if user not found

router.get(
  '/:id',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate user ID parameter
      const parsed = userIdParamSchema.safeParse(req.params);

      if (!parsed.success) {
        logger.warn('Invalid user ID parameter', {
          errors: parsed.error.errors,
          params: req.params,
        });
        throw new BadRequestError(
          'Invalid user ID format',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id: userId } = parsed.data;

      logger.info(`Public profile fetch requested for user: ${userId}`);

      const profile = await getPublicProfile(userId);

      const responseData: UserProfileResponse = {
        user: profile,
      };

      const response: ApiResponse<UserProfileResponse> = {
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
// PATCH /me
// ===========================================
// Update the authenticated user's profile.
// Requires: Bearer token authentication
// Input: { displayName?, avatarUrl? }
// Response: Updated user profile
// CRITICAL: Input validation via updateProfileSchema

router.patch(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Profile update requested for user: ${user.id}`);

      // Validate request body
      const parsed = updateProfileSchema.safeParse(req.body);

      if (!parsed.success) {
        logger.warn('Invalid profile update data', {
          userId: user.id,
          errors: parsed.error.errors,
          body: req.body,
        });
        throw new BadRequestError(
          'Invalid profile data: ' + parsed.error.errors.map(e => e.message).join(', '),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const updateData: UpdateProfileInput = parsed.data;

      // Check if there's actually anything to update
      if (Object.keys(updateData).length === 0) {
        logger.warn('Profile update called with no data', { userId: user.id });
        throw new BadRequestError(
          'No update data provided',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const profile = await updateProfile(user.id, updateData);

      const responseData: UserProfileResponse = {
        user: profile,
      };

      const response: ApiResponse<UserProfileResponse> = {
        success: true,
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      logger.info(`Profile updated successfully for user: ${user.id}`);

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// PATCH /me/onboarding
// ===========================================
// Update the authenticated user's onboarding status.
// Requires: Bearer token authentication
// Input: { hasCompletedOnboarding?: true, hasCompletedDemoSlip?: true }
// Response: Success confirmation
// CRITICAL: Flags can only be set to true (one-way)

router.patch(
  '/me/onboarding',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Onboarding status update requested for user: ${user.id}`);

      // Validate request body
      const parsed = updateOnboardingSchema.safeParse(req.body);

      if (!parsed.success) {
        logger.warn('Invalid onboarding update data', {
          userId: user.id,
          errors: parsed.error.errors,
        });
        throw new BadRequestError(
          'Invalid onboarding data: ' + parsed.error.errors.map(e => e.message).join(', '),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const updateData = parsed.data;

      // Check if there's actually anything to update
      if (Object.keys(updateData).length === 0) {
        throw new BadRequestError(
          'No update data provided',
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      await updateOnboardingStatus(user.id, updateData);

      const response: ApiResponse<{ updated: true }> = {
        success: true,
        data: { updated: true },
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
