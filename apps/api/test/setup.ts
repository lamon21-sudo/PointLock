// =====================================================
// Global Test Setup
// =====================================================
// Runs before all tests to configure the test environment.
// Sets environment variables and validates test infrastructure.

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

/**
 * Setup function called before test suite starts.
 * Loads .env.test and validates test environment.
 */
export async function setup(): Promise<void> {
  // Load .env.test file
  const envPath = resolve(__dirname, '../.env.test');
  dotenvConfig({ path: envPath });

  // Force NODE_ENV to test (critical for safety)
  process.env.NODE_ENV = 'test';

  // Validate critical test environment variables
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required test environment variables: ${missing.join(', ')}\n` +
        `Make sure .env.test exists at: ${envPath}`
    );
  }

  // Validate test database URL to prevent accidental production usage
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('pickrivals_test')) {
    throw new Error(
      'DATABASE_URL must include "pickrivals_test" to prevent accidental production database usage.\n' +
        `Current DATABASE_URL: ${dbUrl}`
    );
  }

  // Validate test Redis port to prevent collision with dev
  const redisPort = process.env.REDIS_PORT;
  if (redisPort !== '6380') {
    console.warn(
      `Warning: REDIS_PORT is ${redisPort}, expected 6380 for test isolation.`
    );
  }

  // Suppress verbose logs during tests (unless DEBUG is set)
  if (!process.env.DEBUG) {
    process.env.LOG_LEVEL = 'error';
  }

  console.log('Test environment initialized:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  DATABASE: ${dbUrl.split('@')[1] || 'hidden'}`);
  console.log(`  REDIS: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
}

/**
 * Teardown function called after all tests complete.
 * Cleanup connections and temporary resources.
 */
export async function teardown(): Promise<void> {
  // Import dynamically to avoid circular dependencies
  const { disconnectTestPrisma } = await import('./helpers/db.helper');
  const { disconnectTestRedis } = await import('./helpers/redis.helper');

  // Disconnect database
  try {
    await disconnectTestPrisma();
  } catch (error) {
    console.error('Error disconnecting test database:', error);
  }

  // Disconnect Redis
  try {
    await disconnectTestRedis();
  } catch (error) {
    console.error('Error disconnecting test Redis:', error);
  }

  console.log('Test environment cleaned up');
}

// Auto-run setup if this file is executed directly
if (require.main === module) {
  setup()
    .then(() => console.log('Setup complete'))
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}
