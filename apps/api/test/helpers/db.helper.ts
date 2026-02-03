// =====================================================
// Database Helper for Tests
// =====================================================
// Provides isolated test database management.
// Each test can reset state without affecting others.

import { PrismaClient } from '@prisma/client';
import { config } from '../../src/config';

let testPrisma: PrismaClient | null = null;

/**
 * Get or create Prisma client for test database.
 * Uses connection pooling for efficiency.
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: process.env.DEBUG_SQL === 'true' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return testPrisma;
}

/**
 * Reset database to clean state.
 * Deletes all data in reverse dependency order to respect foreign keys.
 *
 * CRITICAL: This uses raw SQL for speed. Prisma cascade deletes are too slow.
 * Order matters - child tables must be deleted before parent tables.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getTestPrisma();

  try {
    // Disable foreign key checks temporarily for faster deletion (PostgreSQL)
    await prisma.$executeRawUnsafe('SET session_replication_role = replica;');

    // Delete in reverse dependency order
    // Child tables first, parent tables last
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "placement_matches" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "season_reward_claims" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "season_rewards" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "season_entries" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "seasons" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "matchmaking_queue" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "friendships" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "player_tier_assignments" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "leaderboard_entries" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "leaderboards" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "match_audit_logs" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "match_disputes" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "slip_picks" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "slips" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "sports_events" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "matches" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "transactions" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "wallets" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "refresh_tokens" CASCADE;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE;');

    // Re-enable foreign key checks
    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
  } catch (error) {
    // Re-enable foreign key checks even on error
    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
    throw error;
  }
}

/**
 * Disconnect test Prisma client.
 * Call this in afterAll() hooks to prevent connection leaks.
 */
export async function disconnectTestPrisma(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

/**
 * Execute a raw SQL query (for advanced test setup).
 * Use with caution - prefer Prisma client methods when possible.
 */
export async function executeRawSql<T = unknown>(sql: string): Promise<T> {
  const prisma = getTestPrisma();
  return prisma.$queryRawUnsafe<T>(sql);
}

/**
 * Check if database is reachable.
 * Useful for health checks in test setup.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    const prisma = getTestPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
