import { defineConfig, mergeConfig } from 'vitest/config';
import integrationConfig from './vitest.config.integration';

/**
 * E2E Test Configuration
 *
 * Extends integration config with settings optimized for end-to-end tests:
 * - Much longer timeouts for multi-step flows (60s tests, 60s hooks)
 * - Sequential execution to prevent race conditions across full flows
 * - Dedicated E2E setup with test data fixtures
 * - Only runs *.e2e.test.ts files
 *
 * E2E tests simulate real user journeys across multiple endpoints,
 * validating the entire system from registration to match settlement.
 */
export default mergeConfig(
  integrationConfig,
  defineConfig({
    test: {
      // Only include E2E test files
      include: ['**/*.e2e.test.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.integration.test.ts',
      ],

      // Extended timeouts for multi-step flows
      testTimeout: 60000, // 60 seconds per test (covers multiple API calls)
      hookTimeout: 60000, // 60 seconds for setup/teardown

      // Sequential execution - E2E tests may share data fixtures
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true, // CRITICAL: Prevents concurrent execution
        },
      },

      // E2E-specific setup file
      setupFiles: ['./test/helpers/e2e-setup.ts'],

      // Environment variables for E2E isolation
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        REDIS_HOST: process.env.TEST_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.TEST_REDIS_PORT || process.env.REDIS_PORT || '6379',
        REDIS_DB: '15', // Use DB 15 for tests
      },

      // Reporters
      reporters: process.env.CI ? ['default', 'junit'] : ['default', 'verbose'],
      outputFile: {
        junit: './test-results/e2e-junit.xml',
      },

      // Coverage (optional for E2E)
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/test/**',
          '**/*.test.ts',
          '**/*.integration.test.ts',
          '**/*.e2e.test.ts',
          '**/prisma/**',
        ],
      },

      // Globals
      globals: true,
    },
  })
);
