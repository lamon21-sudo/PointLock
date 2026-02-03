// =====================================================
// API Helper for Tests
// =====================================================
// Provides utilities for testing Express endpoints.
// Handles auth, request building, and response validation.

import { Express } from 'express';
import request, { SuperTest, Test } from 'supertest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import app from '../../src/app';

let testApp: Express | null = null;

/**
 * Get or create Express app instance for testing.
 * Uses the actual app configuration from src/app.ts.
 */
export function getTestApp(): Express {
  if (!testApp) {
    testApp = app;
  }
  return testApp;
}

/**
 * Generate a JWT access token for testing authenticated endpoints.
 * Mimics the production token structure.
 *
 * @param userId - User ID to encode in token
 * @param options - Additional token options (exp, iat, etc.)
 * @returns JWT access token string
 */
export function generateTestToken(
  userId: string,
  options?: {
    expiresIn?: string;
    email?: string;
    username?: string;
  }
): string {
  const payload = {
    userId,
    email: options?.email || `user-${userId}@test.com`,
    username: options?.username || `user-${userId}`,
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: options?.expiresIn || '1h',
  });
}

/**
 * Generate a JWT refresh token for testing token refresh endpoints.
 *
 * @param userId - User ID to encode in token
 * @param options - Additional token options
 * @returns JWT refresh token string
 */
export function generateTestRefreshToken(
  userId: string,
  options?: { expiresIn?: string }
): string {
  return jwt.sign({ userId }, config.jwt.refreshSecret, {
    expiresIn: options?.expiresIn || '7d',
  });
}

/**
 * Create an authenticated supertest request.
 * Automatically adds Authorization header with valid JWT.
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param path - API path (e.g., '/api/v1/users/me')
 * @param token - JWT token (generate with generateTestToken)
 * @returns Supertest request with auth header
 */
export function authenticatedRequest(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  token: string
): Test {
  const testApp = getTestApp();
  return request(testApp)
    [method](path)
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json');
}

/**
 * Create an unauthenticated supertest request.
 * For testing public endpoints or auth failures.
 *
 * @param method - HTTP method
 * @param path - API path
 * @returns Supertest request without auth
 */
export function unauthenticatedRequest(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string
): Test {
  const testApp = getTestApp();
  return request(testApp)[method](path).set('Accept', 'application/json');
}

/**
 * Make authenticated GET request.
 * Convenience wrapper around authenticatedRequest.
 */
export function authenticatedGet(path: string, token: string): Test {
  return authenticatedRequest('get', path, token);
}

/**
 * Make authenticated POST request.
 * Convenience wrapper around authenticatedRequest.
 */
export function authenticatedPost(path: string, token: string, body?: unknown): Test {
  const req = authenticatedRequest('post', path, token);
  if (body) {
    return req.send(body);
  }
  return req;
}

/**
 * Make authenticated PUT request.
 * Convenience wrapper around authenticatedRequest.
 */
export function authenticatedPut(path: string, token: string, body?: unknown): Test {
  const req = authenticatedRequest('put', path, token);
  if (body) {
    return req.send(body);
  }
  return req;
}

/**
 * Make authenticated PATCH request.
 * Convenience wrapper around authenticatedRequest.
 */
export function authenticatedPatch(path: string, token: string, body?: unknown): Test {
  const req = authenticatedRequest('patch', path, token);
  if (body) {
    return req.send(body);
  }
  return req;
}

/**
 * Make authenticated DELETE request.
 * Convenience wrapper around authenticatedRequest.
 */
export function authenticatedDelete(path: string, token: string): Test {
  return authenticatedRequest('delete', path, token);
}

/**
 * Verify JWT token structure (for token generation tests).
 * @param token - Token to verify
 * @returns Decoded token payload
 */
export function verifyTestToken(token: string): any {
  return jwt.verify(token, config.jwt.accessSecret);
}

/**
 * Decode JWT token without verification (for inspection).
 * @param token - Token to decode
 * @returns Decoded token payload
 */
export function decodeTestToken(token: string): any {
  return jwt.decode(token);
}

/**
 * Create an expired test token (for testing token expiration).
 * @param userId - User ID
 * @returns Expired JWT token
 */
export function generateExpiredTestToken(userId: string): string {
  const payload = {
    userId,
    email: `user-${userId}@test.com`,
    username: `user-${userId}`,
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: '-1h', // Expired 1 hour ago
  });
}

/**
 * Create a malformed token (for testing invalid token handling).
 * @returns Invalid JWT token
 */
export function generateMalformedTestToken(): string {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.INVALID.SIGNATURE';
}
