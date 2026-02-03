import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Integration Test Configuration
 *
 * Extends base Vitest config with settings optimized for integration tests:
 * - Longer timeouts for database/Redis operations
 * - Sequential execution to prevent race conditions
 * - Separate test database and Redis instance
 * - Only runs *.integration.test.ts files
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Only include integration test files
      include: ['**/*.integration.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],

      // Longer timeouts for database/Redis operations
      testTimeout: 30000, // 30 seconds per test
      hookTimeout: 30000, // 30 seconds for setup/teardown hooks

      // Sequential execution to prevent race conditions in DB/Redis
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true, // CRITICAL: Single fork prevents concurrent DB writes
        },
      },

      // Setup file for integration environment
      setupFiles: ['./test/helpers/integration-setup.ts'],

      // Environment variables for test isolation
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        REDIS_HOST: process.env.TEST_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.TEST_REDIS_PORT || process.env.REDIS_PORT || '6379',
        REDIS_DB: '15', // Always use DB 15 for tests to avoid collision
      },

      // Reporters
      reporters: process.env.CI ? ['default', 'junit'] : ['default', 'verbose'],
      outputFile: {
        junit: './test-results/integration-junit.xml',
      },

      // Coverage (optional for integration tests)
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/test/**',
          '**/*.test.ts',
          '**/*.integration.test.ts',
          '**/prisma/**',
        ],
      },

      // Globals for convenient test writing
      globals: true,
    },
  })
);
