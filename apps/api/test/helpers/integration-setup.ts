// =====================================================
// Integration Test Setup
// =====================================================
// Global setup/teardown for integration tests.
// Ensures clean database and Redis state before/after tests.
//
// CRITICAL: This file runs ONCE per test suite execution.
// Individual test files should handle their own per-test cleanup.

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { getTestPrisma, resetDatabase, disconnectTestPrisma, isDatabaseReachable } from './db.helper';
import { getTestRedis, cleanTestQueues, disconnectTestRedis, isRedisReachable } from './redis.helper';
import { logger } from '../../src/utils/logger';

// ===========================================
// Environment Setup
// ===========================================

/**
 * Load test environment variables.
 * Looks for .env.test first, falls back to .env
 */
function loadTestEnvironment(): void {
  const envTestPath = resolve(__dirname, '../../.env.test');
  const envPath = resolve(__dirname, '../../.env');

  // Try .env.test first
  const result = loadEnv({ path: envTestPath });

  if (result.error) {
    // Fall back to .env
    loadEnv({ path: envPath });
    logger.warn('Using .env instead of .env.test for integration tests');
  } else {
    logger.info('Loaded .env.test for integration tests');
  }

  // Validate critical environment variables
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Cannot run integration tests.');
  }

  // Force NODE_ENV to test
  process.env.NODE_ENV = 'test';
}

// ===========================================
// Global Setup (Before All Tests)
// ===========================================

/**
 * Run before all test suites.
 * Ensures test environment is ready and clean.
 */
export async function setup(): Promise<void> {
  logger.info('[Integration Setup] Starting global setup...');

  // 1. Load environment
  loadTestEnvironment();

  // 2. Check database connectivity
  logger.info('[Integration Setup] Checking database connectivity...');
  const dbReachable = await isDatabaseReachable();
  if (!dbReachable) {
    throw new Error('Test database is not reachable. Check DATABASE_URL.');
  }
  logger.info('[Integration Setup] Database connection OK');

  // 3. Check Redis connectivity
  logger.info('[Integration Setup] Checking Redis connectivity...');
  const redisReachable = await isRedisReachable();
  if (!redisReachable) {
    throw new Error('Test Redis is not reachable. Check REDIS_HOST/REDIS_PORT.');
  }
  logger.info('[Integration Setup] Redis connection OK');

  // 4. Reset database to clean state
  logger.info('[Integration Setup] Resetting test database...');
  await resetDatabase();
  logger.info('[Integration Setup] Database reset complete');

  // 5. Clean test queues
  logger.info('[Integration Setup] Cleaning test Redis queues...');
  await cleanTestQueues();
  logger.info('[Integration Setup] Redis queues cleaned');

  logger.info('[Integration Setup] Global setup complete');
}

// ===========================================
// Global Teardown (After All Tests)
// ===========================================

/**
 * Run after all test suites.
 * Cleans up connections and resources.
 */
export async function teardown(): Promise<void> {
  logger.info('[Integration Teardown] Starting global teardown...');

  // 1. Disconnect Prisma
  logger.info('[Integration Teardown] Disconnecting Prisma...');
  await disconnectTestPrisma();
  logger.info('[Integration Teardown] Prisma disconnected');

  // 2. Disconnect Redis
  logger.info('[Integration Teardown] Disconnecting Redis...');
  await disconnectTestRedis();
  logger.info('[Integration Teardown] Redis disconnected');

  logger.info('[Integration Teardown] Global teardown complete');
}

// ===========================================
// Vitest Global Setup/Teardown Hooks
// ===========================================

// These hooks run once per test run (not per file)
// They're registered by vitest.config.integration.ts

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

// ===========================================
// Utility Exports
// ===========================================

/**
 * Get initialized test Prisma client.
 * Safe to call after setup() has run.
 */
export function getIntegrationTestPrisma() {
  return getTestPrisma();
}

/**
 * Get initialized test Redis client.
 * Safe to call after setup() has run.
 */
export function getIntegrationTestRedis() {
  return getTestRedis();
}
