import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Environment
    environment: 'node',
    globals: true,

    // Test files
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.integration.test.ts',
      '**/*.e2e.test.ts',
    ],

    // Timeout
    testTimeout: 10000, // 10 seconds for unit tests

    // Setup
    setupFiles: ['./test/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/types/**',
        '**/*.d.ts',
        '**/prisma/**',
        '**/scripts/**',
      ],
      // Coverage thresholds for calculator modules
      thresholds: {
        // Global thresholds (optional, can be set lower)
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },

    // Reporters for CI/CD
    reporters: process.env.CI
      ? ['default', 'junit']
      : ['default', 'verbose'],
    outputFile: {
      junit: './test-results/junit.xml',
    },

    // Run tests in sequence for database operations
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },

  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pick-rivals/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
});
