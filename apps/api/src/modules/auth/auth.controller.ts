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
  validateInput,
} from './auth.schemas';
import * as authService from './auth.service';
import { BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';

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
      // Validate input
      const validation = validateInput(registerSchema, req.body);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

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

export default router;
