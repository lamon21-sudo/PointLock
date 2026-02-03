// =====================================================
// Rate Limiting Middleware
// =====================================================
// Protects endpoints from abuse (brute force, API flooding).
// Uses sliding window algorithm with in-memory store.
// For production: Consider Redis-backed store for distributed systems.

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Types
// ===========================================

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// ===========================================
// Rate Limiters
// ===========================================

/**
 * Default rate limiter for general API endpoints.
 * 15 minutes window, 100 requests max.
 */
export const defaultRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please try again later.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Strict rate limiter for authentication endpoints.
 * Prevents brute force attacks on login/register.
 * 15 minutes window, 5 attempts max.
 */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful login/register towards limit
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Moderate rate limiter for resource creation endpoints.
 * Prevents spam but allows reasonable usage.
 * 1 minute window, 10 requests max.
 */
export const creationRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please slow down.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Username availability check rate limiter.
 * Prevents username enumeration attacks while allowing normal usage.
 * 1 minute window, 20 requests max.
 * This allows users to check multiple usernames during registration
 * but prevents automated enumeration attempts.
 */
export const usernameCheckRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many username checks. Please try again in a minute.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Allowance claim rate limiter.
 * Prevents spamming the claim endpoint even though service has idempotency.
 * 1 hour window, 10 attempts max per user.
 * This is defense-in-depth - the service layer also enforces cooldowns.
 */
export const allowanceClaimRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 claim attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many allowance claim attempts. Please try again later.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Configurable rate limiter factory.
 * Creates a rate limiter with custom settings.
 *
 * @param options - Rate limit configuration
 * @returns Express middleware rate limiter
 *
 * @example
 * ```typescript
 * const customLimiter = createRateLimiter({
 *   windowMs: 60 * 1000,
 *   max: 20,
 *   message: 'Custom rate limit message'
 * });
 *
 * router.post('/custom', customLimiter, handler);
 * ```
 */
export function createRateLimiter(options: RateLimitConfig): RateLimitRequestHandler {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    handler: (_req, res) => {
      const response: ApiResponse = {
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };
      res.status(429).json(response);
    },
  });
}

// ===========================================
// Helpers
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
