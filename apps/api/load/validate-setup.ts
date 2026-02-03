// =====================================================
// Load Test Setup Validator
// =====================================================
// Validates that the environment is ready for load testing.
// Checks test users, wallets, slips, and API connectivity.
//
// Usage:
//   tsx load/validate-setup.ts

import { PrismaClient, SlipStatus } from '@prisma/client';
import axios from 'axios';

// =====================================================
// Configuration
// =====================================================

const API_URL = process.env.API_URL || 'http://localhost:3000';
const EXPECTED_USER_COUNT = 200;
const MIN_WALLET_BALANCE = 1000; // Minimum coins needed for testing

// =====================================================
// Validation Functions
// =====================================================

const prisma = new PrismaClient();

interface ValidationResult {
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

/**
 * Add a validation result.
 */
function addResult(
  category: string,
  status: 'pass' | 'warn' | 'fail',
  message: string,
  details?: any
): void {
  results.push({ category, status, message, details });
}

/**
 * Check if API is running and healthy.
 */
async function validateApiConnectivity(): Promise<void> {
  try {
    const response = await axios.get(`${API_URL}/health`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      addResult('API', 'pass', `API is reachable at ${API_URL}`);
    } else {
      addResult('API', 'fail', `API returned unexpected status: ${response.status}`);
    }
  } catch (error: any) {
    addResult('API', 'fail', `Cannot connect to API at ${API_URL}`, {
      error: error.message,
      hint: 'Start the API with: pnpm dev',
    });
  }
}

/**
 * Check database connectivity.
 */
async function validateDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    addResult('Database', 'pass', 'Database connection successful');
  } catch (error: any) {
    addResult('Database', 'fail', 'Cannot connect to database', {
      error: error.message,
      hint: 'Check DATABASE_URL in .env and ensure PostgreSQL is running',
    });
  }
}

/**
 * Check test users exist.
 */
async function validateTestUsers(): Promise<void> {
  try {
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'loadtest-',
        },
      },
    });

    const count = testUsers.length;

    if (count === 0) {
      addResult('Test Users', 'fail', 'No test users found', {
        hint: 'Run: pnpm load:setup',
      });
    } else if (count < EXPECTED_USER_COUNT) {
      addResult(
        'Test Users',
        'warn',
        `Only ${count}/${EXPECTED_USER_COUNT} test users found`,
        {
          hint: 'Run: pnpm load:setup to create more users',
        }
      );
    } else {
      addResult('Test Users', 'pass', `${count} test users found`);
    }
  } catch (error: any) {
    addResult('Test Users', 'fail', 'Failed to query test users', {
      error: error.message,
    });
  }
}

/**
 * Check test user wallets.
 */
async function validateWallets(): Promise<void> {
  try {
    const usersWithWallets = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'loadtest-',
        },
      },
      include: {
        wallet: true,
      },
    });

    const totalUsers = usersWithWallets.length;
    const usersWithoutWallet = usersWithWallets.filter((u) => !u.wallet).length;
    const usersWithLowBalance = usersWithWallets.filter(
      (u) => u.wallet && Number(u.wallet.balance) < MIN_WALLET_BALANCE
    ).length;

    if (usersWithoutWallet > 0) {
      addResult('Wallets', 'fail', `${usersWithoutWallet} users missing wallets`, {
        hint: 'Run: pnpm load:setup:clean',
      });
    } else if (usersWithLowBalance > 0) {
      addResult(
        'Wallets',
        'warn',
        `${usersWithLowBalance} users have low balance (<${MIN_WALLET_BALANCE} coins)`,
        {
          hint: 'Users may fail to join queue. Run: pnpm load:setup:clean',
        }
      );
    } else {
      const avgBalance =
        usersWithWallets.reduce((sum, u) => sum + Number(u.wallet!.balance), 0) /
        totalUsers;
      addResult('Wallets', 'pass', `All ${totalUsers} users have wallets`, {
        avgBalance: Math.round(avgBalance),
      });
    }
  } catch (error: any) {
    addResult('Wallets', 'fail', 'Failed to validate wallets', {
      error: error.message,
    });
  }
}

/**
 * Check test user slips.
 */
async function validateSlips(): Promise<void> {
  try {
    const usersWithSlips = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'loadtest-',
        },
      },
      include: {
        slips: {
          where: {
            status: SlipStatus.DRAFT,
          },
          include: {
            picks: true,
          },
        },
      },
    });

    const totalUsers = usersWithSlips.length;
    const usersWithoutSlips = usersWithSlips.filter((u) => u.slips.length === 0).length;
    const usersWithEmptySlips = usersWithSlips.filter(
      (u) => u.slips.length > 0 && u.slips[0].picks.length === 0
    ).length;

    if (usersWithoutSlips > 0) {
      addResult('Slips', 'fail', `${usersWithoutSlips} users missing draft slips`, {
        hint: 'Run: pnpm load:setup:clean',
      });
    } else if (usersWithEmptySlips > 0) {
      addResult('Slips', 'warn', `${usersWithEmptySlips} users have empty slips`, {
        hint: 'Slips need picks. Run: pnpm load:setup:clean',
      });
    } else {
      const avgPicks =
        usersWithSlips.reduce((sum, u) => sum + (u.slips[0]?.picks.length || 0), 0) /
        totalUsers;
      addResult('Slips', 'pass', `All ${totalUsers} users have draft slips`, {
        avgPicksPerSlip: avgPicks.toFixed(1),
      });
    }
  } catch (error: any) {
    addResult('Slips', 'fail', 'Failed to validate slips', {
      error: error.message,
    });
  }
}

/**
 * Test authentication with a sample user.
 */
async function validateAuthentication(): Promise<void> {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/auth/login`,
      {
        email: 'loadtest-1@example.com',
        password: 'LoadTest123!',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    if (response.status === 200 && response.data?.data?.tokens?.accessToken) {
      addResult('Authentication', 'pass', 'Login test successful');
    } else {
      addResult('Authentication', 'fail', 'Login succeeded but no token returned');
    }
  } catch (error: any) {
    if (error.response?.status === 401) {
      addResult('Authentication', 'fail', 'Login failed - invalid credentials', {
        hint: 'Run: pnpm load:setup to create test users',
      });
    } else {
      addResult('Authentication', 'fail', 'Login test failed', {
        error: error.message,
      });
    }
  }
}

/**
 * Check for mock events needed by test slips.
 */
async function validateMockEvents(): Promise<void> {
  try {
    const mockEvents = await prisma.event.findMany({
      where: {
        externalId: {
          startsWith: 'event-mock-',
        },
      },
    });

    if (mockEvents.length === 0) {
      addResult('Mock Events', 'warn', 'No mock events found', {
        hint: 'Setup script will create them, but verify picks reference valid events',
      });
    } else {
      addResult('Mock Events', 'pass', `${mockEvents.length} mock events found`);
    }
  } catch (error: any) {
    addResult('Mock Events', 'fail', 'Failed to query mock events', {
      error: error.message,
    });
  }
}

// =====================================================
// Main Validation Runner
// =====================================================

async function runValidation(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Load Test Setup Validation');
  console.log('='.repeat(60));
  console.log('');

  // Run all validations
  await validateDatabaseConnection();
  await validateTestUsers();
  await validateWallets();
  await validateSlips();
  await validateMockEvents();
  await validateApiConnectivity();
  await validateAuthentication();

  // Print results
  console.log('');
  console.log('Validation Results:');
  console.log('-'.repeat(60));

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const result of results) {
    const icon =
      result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    const statusColor =
      result.status === 'pass'
        ? '\x1b[32m'
        : result.status === 'warn'
        ? '\x1b[33m'
        : '\x1b[31m';
    const resetColor = '\x1b[0m';

    console.log(
      `${icon} [${statusColor}${result.status.toUpperCase()}${resetColor}] ${result.category}: ${result.message}`
    );

    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }

    if (result.status === 'pass') passCount++;
    else if (result.status === 'warn') warnCount++;
    else failCount++;
  }

  console.log('-'.repeat(60));
  console.log(`Pass: ${passCount} | Warn: ${warnCount} | Fail: ${failCount}`);
  console.log('='.repeat(60));

  // Final recommendation
  if (failCount > 0) {
    console.log('\n❌ VALIDATION FAILED');
    console.log('Fix the issues above before running load tests.');
    console.log('Hint: Run `pnpm load:setup` to create test data.');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS');
    console.log('You can proceed with load tests, but some issues were detected.');
    process.exit(0);
  } else {
    console.log('\n✅ VALIDATION PASSED');
    console.log('Environment is ready for load testing!');
    console.log('\nRun: pnpm load:test');
    process.exit(0);
  }
}

// =====================================================
// Entry Point
// =====================================================

async function main() {
  try {
    await runValidation();
  } catch (error: any) {
    console.error('\n❌ Validation failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runValidation };
