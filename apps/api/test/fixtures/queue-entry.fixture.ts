// =====================================================
// Queue Entry Fixture
// =====================================================
// Factory functions for creating test matchmaking queue entries.
// Critical for testing matchmaking, anti-exploit, and concurrency.

import {
  PrismaClient,
  MatchmakingQueue,
  GameMode,
  PickTier,
  Rank,
  QueueStatus,
} from '@prisma/client';

/**
 * Options for creating a test queue entry.
 */
export interface CreateTestQueueEntryOptions {
  userId: string;
  slipId?: string | null;
  gameMode?: GameMode;
  tier?: PickTier;
  rank?: Rank | null;
  stakeAmount?: bigint;
  skillRating?: number;
  slipSize?: number;
  region?: string | null;
  status?: QueueStatus;
  enqueuedAt?: Date;
  matchedAt?: Date | null;
  expiresAt?: Date;
  matchId?: string | null;
  entryTxId?: string | null;
  entryIdempotencyKey?: string | null;
  version?: number;
  claimExpiresAt?: Date | null;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  rejectionCount?: number;
  lastRejectedAt?: Date | null;
  cooldownUntil?: Date | null;
}

/**
 * Create a test matchmaking queue entry.
 *
 * @param db - Prisma client instance
 * @param options - Queue entry customization options
 * @returns Created queue entry
 */
export async function createTestQueueEntry(
  db: PrismaClient,
  options: CreateTestQueueEntryOptions
): Promise<MatchmakingQueue> {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);

  // Default expiration: 5 minutes from now
  const defaultExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

  return db.matchmakingQueue.create({
    data: {
      userId: options.userId,
      slipId: options.slipId,
      gameMode: options.gameMode || 'QUICK_MATCH',
      tier: options.tier || 'FREE',
      rank: options.rank,
      stakeAmount: options.stakeAmount || BigInt(1000),
      skillRating: options.skillRating || 1000,
      slipSize: options.slipSize || 3,
      region: options.region,
      status: options.status || 'WAITING',
      enqueuedAt: options.enqueuedAt || new Date(),
      matchedAt: options.matchedAt,
      expiresAt: options.expiresAt || defaultExpiresAt,
      matchId: options.matchId,
      entryTxId: options.entryTxId || `tx-${timestamp}-${random}`,
      entryIdempotencyKey:
        options.entryIdempotencyKey || `idem-${timestamp}-${random}`,
      version: options.version || 1,
      claimExpiresAt: options.claimExpiresAt,
      lockedAt: options.lockedAt,
      lockedBy: options.lockedBy,
      rejectionCount: options.rejectionCount || 0,
      lastRejectedAt: options.lastRejectedAt,
      cooldownUntil: options.cooldownUntil,
    },
  });
}

/**
 * Create a queue entry in WAITING status (default matchmaking state).
 */
export async function createWaitingQueueEntry(
  db: PrismaClient,
  userId: string,
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    status: 'WAITING',
  });
}

/**
 * Create a matched queue entry (already paired).
 */
export async function createMatchedQueueEntry(
  db: PrismaClient,
  userId: string,
  matchId: string,
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    matchId,
    status: 'MATCHED',
    matchedAt: new Date(),
  });
}

/**
 * Create an expired queue entry (for cleanup tests).
 */
export async function createExpiredQueueEntry(
  db: PrismaClient,
  userId: string,
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    status: 'EXPIRED',
    expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
  });
}

/**
 * Create a cancelled queue entry (user left queue).
 */
export async function createCancelledQueueEntry(
  db: PrismaClient,
  userId: string,
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    status: 'CANCELLED',
  });
}

/**
 * Create multiple queue entries for matchmaking tests.
 * Useful for testing compatibility pools and matching logic.
 */
export async function createTestQueueEntries(
  db: PrismaClient,
  count: number,
  baseOptions: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue[]> {
  const entries: MatchmakingQueue[] = [];

  for (let i = 0; i < count; i++) {
    // Create unique user for each entry
    const user = await db.user.create({
      data: {
        email: `queueuser-${Date.now()}-${i}@test.com`,
        username: `queueuser_${Date.now()}_${i}`,
        passwordHash: 'hashed',
        skillRating: baseOptions.skillRating || 1000,
        wallet: {
          create: {
            paidBalance: BigInt(10000),
          },
        },
      },
    });

    const entry = await createTestQueueEntry(db, {
      ...baseOptions,
      userId: user.id,
    });

    entries.push(entry);
  }

  return entries;
}

/**
 * Create queue entries with varied skill ratings (for matchmaking range tests).
 */
export async function createQueueEntriesWithSkillRange(
  db: PrismaClient,
  skillRatings: number[]
): Promise<MatchmakingQueue[]> {
  const entries: MatchmakingQueue[] = [];

  for (const skillRating of skillRatings) {
    const user = await db.user.create({
      data: {
        email: `skilluser-${Date.now()}-${skillRating}@test.com`,
        username: `skilluser_${Date.now()}_${skillRating}`,
        passwordHash: 'hashed',
        skillRating,
        wallet: {
          create: {
            paidBalance: BigInt(10000),
          },
        },
      },
    });

    const entry = await createTestQueueEntry(db, {
      userId: user.id,
      skillRating,
      stakeAmount: BigInt(1000),
      slipSize: 3,
      tier: 'FREE',
      gameMode: 'QUICK_MATCH',
    });

    entries.push(entry);
  }

  return entries;
}

/**
 * Create a locked queue entry (claimed by matchmaking worker).
 * Used for testing optimistic locking and concurrency.
 */
export async function createLockedQueueEntry(
  db: PrismaClient,
  userId: string,
  lockedBy: string = 'worker-1',
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    status: 'WAITING',
    lockedAt: new Date(),
    lockedBy,
    claimExpiresAt: new Date(Date.now() + 10000), // Lock expires in 10s
  });
}

/**
 * Create a queue entry in cooldown (anti-exploit).
 */
export async function createCooldownQueueEntry(
  db: PrismaClient,
  userId: string,
  rejectionCount: number = 3,
  options: Partial<CreateTestQueueEntryOptions> = {}
): Promise<MatchmakingQueue> {
  return createTestQueueEntry(db, {
    ...options,
    userId,
    status: 'WAITING',
    rejectionCount,
    lastRejectedAt: new Date(),
    cooldownUntil: new Date(Date.now() + 60000), // Cooldown for 1 minute
  });
}

/**
 * Create queue entries with exact compatibility (same stake, tier, slip size).
 * Ideal for testing exact match logic.
 */
export async function createCompatibleQueueEntries(
  db: PrismaClient,
  count: number,
  stakeAmount: bigint = BigInt(1000),
  tier: PickTier = 'FREE',
  slipSize: number = 3
): Promise<MatchmakingQueue[]> {
  return createTestQueueEntries(db, count, {
    stakeAmount,
    tier,
    slipSize,
    gameMode: 'QUICK_MATCH',
    status: 'WAITING',
  });
}
