// =====================================================
// User Fixture
// =====================================================
// Factory functions for creating test users with wallets.
// Provides consistent, realistic test data.

import { PrismaClient, User, Wallet, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

/**
 * Options for creating a test user.
 */
export interface CreateTestUserOptions {
  email?: string;
  username?: string;
  displayName?: string;
  passwordHash?: string;
  status?: UserStatus;
  emailVerified?: boolean;
  skillRating?: number;
  matchesPlayed?: number;
  matchesWon?: number;
  currentStreak?: number;
  bestStreak?: number;
  kycVerified?: boolean;
  referralCode?: string;
  referredById?: string;
  paidBalance?: bigint;
  bonusBalance?: bigint;
  totalDeposited?: bigint;
}

/**
 * Create a single test user with wallet.
 * Password is hashed to mimic production behavior.
 *
 * @param db - Prisma client instance
 * @param options - User customization options
 * @returns Created user with wallet relation
 */
export async function createTestUser(
  db: PrismaClient,
  options: CreateTestUserOptions = {}
): Promise<User & { wallet: Wallet }> {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);

  // Generate unique identifiers
  const email = options.email || `testuser-${timestamp}-${random}@test.com`;
  const username = options.username || `testuser_${timestamp}_${random}`;
  const displayName = options.displayName || `Test User ${random}`;

  // Hash password (default: 'password123')
  const passwordHash =
    options.passwordHash || (await bcrypt.hash('password123', 10));

  // Create user with wallet
  const user = await db.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash,
      status: options.status || 'active',
      emailVerified: options.emailVerified ?? true,
      emailVerifiedAt: options.emailVerified !== false ? new Date() : null,
      skillRating: options.skillRating || 1000,
      matchesPlayed: options.matchesPlayed || 0,
      matchesWon: options.matchesWon || 0,
      currentStreak: options.currentStreak || 0,
      bestStreak: options.bestStreak || 0,
      kycVerified: options.kycVerified || false,
      referralCode: options.referralCode,
      referredById: options.referredById,
      wallet: {
        create: {
          paidBalance: options.paidBalance || BigInt(0),
          bonusBalance: options.bonusBalance || BigInt(0),
          totalDeposited: options.totalDeposited || BigInt(0),
          totalWon: BigInt(0),
          totalLost: BigInt(0),
          totalRakePaid: BigInt(0),
        },
      },
    },
    include: {
      wallet: true,
    },
  });

  return user;
}

/**
 * Create multiple test users with wallets.
 * Useful for testing leaderboards, matchmaking, etc.
 *
 * @param db - Prisma client instance
 * @param count - Number of users to create
 * @param options - Base options (will be varied per user)
 * @returns Array of created users with wallets
 */
export async function createTestUsers(
  db: PrismaClient,
  count: number,
  options: CreateTestUserOptions = {}
): Promise<Array<User & { wallet: Wallet }>> {
  const users: Array<User & { wallet: Wallet }> = [];

  for (let i = 0; i < count; i++) {
    const user = await createTestUser(db, {
      ...options,
      // Ensure unique usernames/emails by appending index
      email: options.email
        ? `${options.email.split('@')[0]}-${i}@test.com`
        : undefined,
      username: options.username ? `${options.username}_${i}` : undefined,
      displayName: options.displayName
        ? `${options.displayName} ${i}`
        : undefined,
    });
    users.push(user);
  }

  return users;
}

/**
 * Create a test user with specific skill rating (for matchmaking tests).
 */
export async function createTestUserWithSkillRating(
  db: PrismaClient,
  skillRating: number,
  options: Omit<CreateTestUserOptions, 'skillRating'> = {}
): Promise<User & { wallet: Wallet }> {
  return createTestUser(db, { ...options, skillRating });
}

/**
 * Create a test user with balance (for wallet tests).
 */
export async function createTestUserWithBalance(
  db: PrismaClient,
  paidBalance: bigint,
  bonusBalance: bigint = BigInt(0),
  options: Omit<CreateTestUserOptions, 'paidBalance' | 'bonusBalance'> = {}
): Promise<User & { wallet: Wallet }> {
  return createTestUser(db, { ...options, paidBalance, bonusBalance });
}

/**
 * Create a test user with match statistics.
 */
export async function createTestUserWithStats(
  db: PrismaClient,
  stats: {
    matchesPlayed: number;
    matchesWon: number;
    currentStreak?: number;
    bestStreak?: number;
  },
  options: Omit<
    CreateTestUserOptions,
    'matchesPlayed' | 'matchesWon' | 'currentStreak' | 'bestStreak'
  > = {}
): Promise<User & { wallet: Wallet }> {
  return createTestUser(db, {
    ...options,
    matchesPlayed: stats.matchesPlayed,
    matchesWon: stats.matchesWon,
    currentStreak: stats.currentStreak || 0,
    bestStreak: stats.bestStreak || 0,
  });
}

/**
 * Create a test user who referred another user.
 */
export async function createTestUserWithReferral(
  db: PrismaClient,
  options: CreateTestUserOptions = {}
): Promise<{
  referrer: User & { wallet: Wallet };
  referred: User & { wallet: Wallet };
}> {
  // Create referrer
  const referrer = await createTestUser(db, {
    ...options,
    referralCode: options.referralCode || `REF-${Date.now()}`,
  });

  // Create referred user
  const referred = await createTestUser(db, {
    referredById: referrer.id,
  });

  return { referrer, referred };
}

/**
 * Create a suspended/banned test user (for auth tests).
 */
export async function createSuspendedTestUser(
  db: PrismaClient,
  status: 'suspended' | 'banned' = 'suspended',
  options: Omit<CreateTestUserOptions, 'status'> = {}
): Promise<User & { wallet: Wallet }> {
  return createTestUser(db, { ...options, status });
}

/**
 * Create an unverified test user (for email verification tests).
 */
export async function createUnverifiedTestUser(
  db: PrismaClient,
  options: Omit<CreateTestUserOptions, 'emailVerified'> = {}
): Promise<User & { wallet: Wallet }> {
  return createTestUser(db, {
    ...options,
    emailVerified: false,
    status: 'pending_verification',
  });
}
