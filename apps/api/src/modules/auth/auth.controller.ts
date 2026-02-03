// =====================================================
// Auth Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to auth.service.ts

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES, AuthResponse, AuthTokens } from '@pick-rivals/shared-types';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  checkUsernameSchema,
  pushTokenSchema,
  validateInput,
} from './auth.schemas';
import * as authService from './auth.service';
import { BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { usernameCheckRateLimiter, requireAuth } from '../../middleware';
import { prisma } from '../../lib/prisma';

const router: Router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatValidationErrors(errors: { path: (string | number)[]; message: string }[]): string {
  return errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// ===========================================
// POST /auth/register
// ===========================================

router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Debug: Log incoming registration request
      logger.info('📝 Registration attempt:', {
        email: req.body.email,
        username: req.body.username,
        hasPassword: !!req.body.password,
        bodyKeys: Object.keys(req.body),
      });

      // Validate input
      const validation = validateInput(registerSchema, req.body);

      if (!validation.success || !validation.data) {
        // Debug: Log validation errors
        logger.warn('❌ Registration validation failed:', {
          errors: validation.errors,
        });
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      logger.info('✅ Validation passed, creating user...');

      // Call service
      const result = await authService.register(validation.data);

      // Format response
      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresIn: result.tokens.accessExpiresIn,
          },
          wallet: result.wallet,
        },
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

// ===========================================
// POST /auth/login
// ===========================================

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const validation = validateInput(loginSchema, req.body);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Call service
      const result = await authService.login(validation.data);

      // Format response
      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresIn: result.tokens.accessExpiresIn,
          },
          wallet: result.wallet,
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

// ===========================================
// POST /auth/refresh
// ===========================================

router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const validation = validateInput(refreshTokenSchema, req.body);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Call service - implements token rotation
      const tokens = await authService.refreshTokens(validation.data.refreshToken);

      // Format response
      const response: ApiResponse<AuthTokens> = {
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.accessExpiresIn,
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

// ===========================================
// POST /auth/logout
// ===========================================

router.post(
  '/logout',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const validation = validateInput(refreshTokenSchema, req.body);

      if (!validation.success || !validation.data) {
        // Even if validation fails, return success to prevent token enumeration
        logger.warn('Logout called without valid refresh token');
      } else {
        await authService.logout(validation.data.refreshToken);
      }

      // Always return success to prevent information leakage
      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Logged out successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      // Log error but return success anyway
      logger.error('Error during logout:', error);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Logged out successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    }
  }
);

// ===========================================
// GET /auth/check-username
// ===========================================
// Public endpoint - no authentication required.
// Always returns 200 OK with availability flag to prevent username enumeration.

router.get(
  '/check-username',
  usernameCheckRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input from query parameters
      const validation = validateInput(checkUsernameSchema, { username: req.query.username });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Check username availability
      const isAvailable = await authService.checkUsernameAvailability(validation.data.username);

      // Always return 200 OK - never use 409 Conflict for "taken" status
      // This prevents timing-based username enumeration attacks
      const response: ApiResponse<{ available: boolean }> = {
        success: true,
        data: { available: isAvailable },
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
// POST /auth/push-token
// ===========================================
// Protected endpoint - requires authentication.
// Registers the user's Expo push notification token.

router.post(
  '/push-token',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const validation = validateInput(pushTokenSchema, req.body);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Get user ID from auth middleware
      const userId = req.user?.id;
      if (!userId) {
        throw new BadRequestError('User not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // Update user's push token
      await prisma.user.update({
        where: { id: userId },
        data: { fcmToken: validation.data.token },
      });

      logger.info('[Auth] Push token registered', { userId });

      // Format response
      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Push token registered successfully' },
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
