// =====================================================
// Load Test User Setup Script
// =====================================================
// Creates test users, wallets, and draft slips for k6 load testing.
//
// Usage:
//   tsx load/setup-load-test-users.ts
//   tsx load/setup-load-test-users.ts --count 200
//   tsx load/setup-load-test-users.ts --clean

import { PrismaClient, SlipStatus, PickStatus, PickType, SportType } from '@prisma/client';
import bcrypt from 'bcryptjs';

// =====================================================
// Configuration
// =====================================================

const DEFAULT_USER_COUNT = 200;
const DEFAULT_PASSWORD = 'LoadTest123!';
const WALLET_STARTING_BALANCE = 10000; // 10,000 coins per user
const PICKS_PER_SLIP = 3;

// Mock event IDs - these should exist in your database
// You may need to adjust these based on your test environment
const MOCK_EVENT_IDS = [
  'event-mock-1',
  'event-mock-2',
  'event-mock-3',
  'event-mock-4',
  'event-mock-5',
  'event-mock-6',
];

// =====================================================
// Main Functions
// =====================================================

const prisma = new PrismaClient();

interface SetupStats {
  usersCreated: number;
  usersSkipped: number;
  walletsCreated: number;
  slipsCreated: number;
  picksCreated: number;
  errors: number;
}

/**
 * Hash password using bcryptjs (same as auth service).
 */
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Clean up existing load test users.
 */
async function cleanupLoadTestUsers(): Promise<void> {
  console.log('🧹 Cleaning up existing load test users...');

  const result = await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: 'loadtest-',
      },
    },
  });

  console.log(`   Deleted ${result.count} load test users`);
}

/**
 * Create a single load test user with wallet and draft slip.
 */
async function createLoadTestUser(
  userNumber: number,
  passwordHash: string
): Promise<{
  success: boolean;
  created: boolean;
  slipCreated: boolean;
  pickCount: number;
  error?: string;
}> {
  const email = `loadtest-${userNumber}@example.com`;
  const username = `loadtest${userNumber}`;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return {
        success: true,
        created: false,
        slipCreated: false,
        pickCount: 0,
      };
    }

    // Create user with wallet in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          status: 'active',
        },
      });

      // Create wallet
      const wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          balance: BigInt(WALLET_STARTING_BALANCE),
        },
      });

      // Create starter credit transaction
      await tx.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          type: 'STARTER_CREDIT',
          amount: BigInt(WALLET_STARTING_BALANCE),
          status: 'completed',
          description: 'Load test user starting balance',
        },
      });

      // Create draft slip with picks
      const slip = await tx.slip.create({
        data: {
          userId: user.id,
          status: SlipStatus.DRAFT,
        },
      });

      // Create picks for the slip
      const pickPromises = [];
      for (let i = 0; i < PICKS_PER_SLIP; i++) {
        const eventId = MOCK_EVENT_IDS[i % MOCK_EVENT_IDS.length];

        pickPromises.push(
          tx.pick.create({
            data: {
              slipId: slip.id,
              eventId: eventId,
              pickType: PickType.moneyline,
              selection: i % 2 === 0 ? 'home' : 'away',
              odds: -110,
              status: PickStatus.PENDING,
            },
          })
        );
      }

      const picks = await Promise.all(pickPromises);

      return { user, wallet, slip, picks };
    });

    return {
      success: true,
      created: true,
      slipCreated: true,
      pickCount: result.picks.length,
    };
  } catch (error: any) {
    return {
      success: false,
      created: false,
      slipCreated: false,
      pickCount: 0,
      error: error.message,
    };
  }
}

/**
 * Create mock events if they don't exist.
 * This ensures picks can reference valid events.
 */
async function ensureMockEvents(): Promise<void> {
  console.log('🎯 Ensuring mock events exist...');

  for (const eventId of MOCK_EVENT_IDS) {
    const existing = await prisma.event.findUnique({
      where: { externalId: eventId },
    });

    if (!existing) {
      await prisma.event.create({
        data: {
          externalId: eventId,
          sport: SportType.NFL,
          league: 'NFL',
          homeTeam: 'Load Test Home',
          awayTeam: 'Load Test Away',
          scheduledDate: new Date(Date.now() + 86400000), // Tomorrow
          status: 'SCHEDULED',
        },
      });
      console.log(`   Created mock event: ${eventId}`);
    }
  }

  console.log('   Mock events ready');
}

/**
 * Main setup function.
 */
async function setupLoadTestUsers(count: number): Promise<SetupStats> {
  const stats: SetupStats = {
    usersCreated: 0,
    usersSkipped: 0,
    walletsCreated: 0,
    slipsCreated: 0,
    picksCreated: 0,
    errors: 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Creating ${count} load test users...`);
  console.log(`${'='.repeat(60)}\n`);

  // Ensure mock events exist
  await ensureMockEvents();

  // Pre-hash password once (same for all users)
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  // Create users in batches
  const batchSize = 10;
  for (let i = 1; i <= count; i += batchSize) {
    const batchEnd = Math.min(i + batchSize - 1, count);
    console.log(`Creating users ${i} to ${batchEnd}...`);

    const promises = [];
    for (let j = i; j <= batchEnd; j++) {
      promises.push(createLoadTestUser(j, passwordHash));
    }

    const results = await Promise.all(promises);

    for (const result of results) {
      if (!result.success) {
        stats.errors++;
        console.error(`   ERROR: ${result.error}`);
      } else if (result.created) {
        stats.usersCreated++;
        stats.walletsCreated++;
        if (result.slipCreated) {
          stats.slipsCreated++;
          stats.picksCreated += result.pickCount;
        }
      } else {
        stats.usersSkipped++;
      }
    }

    // Small delay between batches to avoid overwhelming DB
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return stats;
}

/**
 * Verify setup by checking a sample user.
 */
async function verifySetup(): Promise<void> {
  console.log('\n🔍 Verifying setup...');

  const sampleUser = await prisma.user.findUnique({
    where: { email: 'loadtest-1@example.com' },
    include: {
      wallet: true,
      slips: {
        where: { status: SlipStatus.DRAFT },
        include: {
          picks: true,
        },
      },
    },
  });

  if (!sampleUser) {
    console.error('   ❌ Sample user not found!');
    return;
  }

  console.log(`   ✅ Sample user exists: ${sampleUser.email}`);
  console.log(`   ✅ Wallet balance: ${sampleUser.wallet?.balance.toString()} coins`);
  console.log(`   ✅ Draft slips: ${sampleUser.slips.length}`);
  console.log(
    `   ✅ Picks in first slip: ${sampleUser.slips[0]?.picks.length || 0}`
  );
}

/**
 * Print summary stats.
 */
function printStats(stats: SetupStats, durationMs: number): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Setup Complete');
  console.log(`${'='.repeat(60)}`);
  console.log(`Users Created:   ${stats.usersCreated}`);
  console.log(`Users Skipped:   ${stats.usersSkipped} (already existed)`);
  console.log(`Wallets Created: ${stats.walletsCreated}`);
  console.log(`Slips Created:   ${stats.slipsCreated}`);
  console.log(`Picks Created:   ${stats.picksCreated}`);
  console.log(`Errors:          ${stats.errors}`);
  console.log(`Duration:        ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`${'='.repeat(60)}\n`);
}

// =====================================================
// CLI Entry Point
// =====================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let count = DEFAULT_USER_COUNT;
  let clean = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--clean') {
      clean = true;
    }
  }

  try {
    // Clean up if requested
    if (clean) {
      await cleanupLoadTestUsers();
    }

    // Run setup
    const startTime = Date.now();
    const stats = await setupLoadTestUsers(count);
    const duration = Date.now() - startTime;

    // Verify
    await verifySetup();

    // Print stats
    printStats(stats, duration);

    if (stats.errors > 0) {
      console.error(`\n⚠️  Setup completed with ${stats.errors} errors`);
      process.exit(1);
    } else {
      console.log('✅ Setup successful! Ready for load testing.\n');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
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

export { setupLoadTestUsers, cleanupLoadTestUsers };
