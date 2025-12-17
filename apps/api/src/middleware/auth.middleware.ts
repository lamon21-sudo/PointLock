// =====================================================
// Authentication Middleware
// =====================================================
// Protects routes by validating JWT access tokens.
// Attaches authenticated user to request object.

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { verifyAccessToken, AuthenticatedUser } from '../modules/auth/auth.service';
import { ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Type Extensions
// ===========================================

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ===========================================
// Middleware Functions
// ===========================================

/**
 * Extracts Bearer token from Authorization header.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Required authentication middleware.
 * Returns 401 if no valid token is provided.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new UnauthorizedError(
        'Authentication required',
        ERROR_CODES.TOKEN_INVALID
      );
    }

    const user = await verifyAccessToken(token);
    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware.
 * Attaches user to request if valid token is provided, but doesn't require it.
 * Use for routes that behave differently for authenticated vs anonymous users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (token) {
      try {
        const user = await verifyAccessToken(token);
        req.user = user;
      } catch {
        // Token invalid, but that's okay for optional auth
        // User will just be undefined
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Gets the authenticated user from request.
 * Throws if user is not authenticated.
 * Use after requireAuth middleware.
 */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new UnauthorizedError(
      'User not authenticated',
      ERROR_CODES.TOKEN_INVALID
    );
  }

  return req.user;
}
