import { describe, it, expect } from 'vitest';
import {
  defaultRateLimiter,
  authRateLimiter,
  creationRateLimiter,
  usernameCheckRateLimiter,
  allowanceClaimRateLimiter,
  createRateLimiter,
} from '../rate-limit.middleware';

describe('Rate Limit Middleware', () => {
  it('should export all rate limiters as functions', () => {
    expect(typeof defaultRateLimiter).toBe('function');
    expect(typeof authRateLimiter).toBe('function');
    expect(typeof creationRateLimiter).toBe('function');
    expect(typeof usernameCheckRateLimiter).toBe('function');
    expect(typeof allowanceClaimRateLimiter).toBe('function');
  });

  it('should create custom rate limiter with factory', () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 5,
      message: 'Test limit reached',
    });
    expect(typeof limiter).toBe('function');
  });

  it('should create custom rate limiter with prefix', () => {
    const limiter = createRateLimiter({
      windowMs: 30000,
      max: 3,
      prefix: 'test-prefix',
    });
    expect(typeof limiter).toBe('function');
  });
});
