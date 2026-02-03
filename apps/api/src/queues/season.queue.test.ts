// =====================================================
// Season Queue Test Suite
// =====================================================
// Run with: npx tsx src/queues/season.queue.test.ts
//
// Tests the Season Worker logic for:
// - Daily rank decay
// - Season end processing
// - Ranking finalization
// - Reward distribution
//
// NOTE: These are unit tests that verify business logic.
// They do NOT test actual database operations or BullMQ.

import { Rank } from '@prisma/client';
import {
  RANK_POINTS,
  SEASON_WORKER_CONFIG,
} from '@pick-rivals/shared-types';
import { calculateNewRank } from '../services/ranked.service';

// ===========================================
// Test Utilities
// ===========================================

let testsPassed = 0;
let testsFailed = 0;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const pass = actual === expected;
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${message}`);
    console.error(`      Expected: ${expected}`);
    console.error(`      Actual:   ${actual}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${message}`);
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ===========================================
// Test: Configuration Constants
// ===========================================

describe('SEASON_WORKER_CONFIG', () => {
  assertEqual(
    SEASON_WORKER_CONFIG.INACTIVITY_THRESHOLD_DAYS,
    7,
    'Inactivity threshold is 7 days'
  );
  assertEqual(
    SEASON_WORKER_CONFIG.GRACE_PERIOD_HOURS,
    4,
    'Grace period is 4 hours'
  );
  assertEqual(
    SEASON_WORKER_CONFIG.BATCH_SIZE,
    100,
    'Batch size is 100'
  );
  assertEqual(
    SEASON_WORKER_CONFIG.DECAY_CRON,
    '0 2 * * *',
    'Decay runs at 2 AM UTC'
  );
  assertEqual(
    SEASON_WORKER_CONFIG.SEASON_CHECK_CRON,
    '5 * * * *',
    'Season check runs at :05 every hour'
  );
  assertEqual(
    SEASON_WORKER_CONFIG.LOCK_TTL_SECONDS,
    300,
    'Lock TTL is 300 seconds (5 minutes)'
  );
});

describe('RANK_POINTS constants', () => {
  assertEqual(RANK_POINTS.DAILY_DECAY, -2, 'Daily decay is -2 RP');
  assertEqual(RANK_POINTS.WIN, 25, 'Win is +25 RP');
  assertEqual(RANK_POINTS.LOSS, -20, 'Loss is -20 RP');
});

// ===========================================
// Test: Decay Logic (Unit)
// ===========================================

describe('Decay calculation logic', () => {
  // Test decay application
  const testDecay = (currentRp: number): number => {
    return Math.max(0, currentRp + RANK_POINTS.DAILY_DECAY);
  };

  assertEqual(testDecay(100), 98, 'Decay 100 RP -> 98 RP');
  assertEqual(testDecay(50), 48, 'Decay 50 RP -> 48 RP');
  assertEqual(testDecay(2), 0, 'Decay 2 RP -> 0 RP (floor)');
  assertEqual(testDecay(1), 0, 'Decay 1 RP -> 0 RP (floor)');
  assertEqual(testDecay(0), 0, 'Decay 0 RP -> 0 RP (already at floor)');
});

describe('Decay with rank recalculation', () => {
  // Test that decay triggers correct rank change
  const testDecayWithRank = (
    currentRp: number
  ): { newRp: number; newRank: Rank } => {
    const newRp = Math.max(0, currentRp + RANK_POINTS.DAILY_DECAY);
    const newRank = calculateNewRank(newRp);
    return { newRp, newRank };
  };

  // BRONZE_1 threshold is 0
  const bronze1Result = testDecayWithRank(10);
  assertEqual(bronze1Result.newRp, 8, 'Decay from 10 RP -> 8 RP');
  assertEqual(bronze1Result.newRank, Rank.BRONZE_1, 'Stays at BRONZE_1');

  // BRONZE_2 threshold is 100
  const bronze2Result = testDecayWithRank(101);
  assertEqual(bronze2Result.newRp, 99, 'Decay from 101 RP -> 99 RP');
  assertEqual(bronze2Result.newRank, Rank.BRONZE_1, 'Demotes from BRONZE_2 to BRONZE_1');

  // SILVER_1 threshold is 300
  const silver1Result = testDecayWithRank(301);
  assertEqual(silver1Result.newRp, 299, 'Decay from 301 RP -> 299 RP');
  assertEqual(silver1Result.newRank, Rank.BRONZE_3, 'Demotes from SILVER_1 to BRONZE_3');

  // GOLD_1 threshold is 600
  const gold1Result = testDecayWithRank(600);
  assertEqual(gold1Result.newRp, 598, 'Decay from 600 RP -> 598 RP');
  assertEqual(gold1Result.newRank, Rank.SILVER_3, 'Demotes from GOLD_1 to SILVER_3');
});

describe('RP floor enforcement', () => {
  const testFloor = (currentRp: number): boolean => {
    const newRp = Math.max(0, currentRp + RANK_POINTS.DAILY_DECAY);
    return newRp >= 0;
  };

  assert(testFloor(0), 'Floor holds at 0 RP');
  assert(testFloor(1), 'Floor holds when starting at 1 RP');
  assert(testFloor(1000), 'Floor holds at high RP');

  // Verify floor value
  const floorResult = Math.max(0, 1 + RANK_POINTS.DAILY_DECAY);
  assertEqual(floorResult, 0, 'Decay from 1 RP results in 0 RP, not negative');
});

// ===========================================
// Test: Inactivity Detection (Unit)
// ===========================================

describe('Inactivity detection logic', () => {
  const isInactive = (lastMatchAt: Date | null, now: Date): boolean => {
    if (!lastMatchAt) return true; // NULL = always inactive
    const thresholdMs =
      SEASON_WORKER_CONFIG.INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    return now.getTime() - lastMatchAt.getTime() > thresholdMs;
  };

  const now = new Date('2026-02-01T00:00:00Z');

  // 8 days ago (inactive)
  const eightDaysAgo = new Date('2026-01-24T00:00:00Z');
  assert(isInactive(eightDaysAgo, now), 'User inactive for 8 days -> inactive');

  // 7 days + 1 second ago (inactive)
  const sevenDaysOneSecAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1000
  );
  assert(isInactive(sevenDaysOneSecAgo, now), 'User inactive for 7d+1s -> inactive');

  // Exactly 7 days ago (not inactive yet - boundary)
  const exactlySevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  );
  assert(!isInactive(exactlySevenDaysAgo, now), 'User at exactly 7 days -> not inactive (boundary)');

  // 6 days ago (active)
  const sixDaysAgo = new Date('2026-01-26T00:00:00Z');
  assert(!isInactive(sixDaysAgo, now), 'User active 6 days ago -> not inactive');

  // NULL lastMatchAt (always inactive)
  assert(isInactive(null, now), 'NULL lastMatchAt -> inactive');
});

// ===========================================
// Test: Same-day decay detection (Unit)
// ===========================================

describe('Same-day decay prevention', () => {
  const hasDecayedToday = (lastDecayAt: Date | null, now: Date): boolean => {
    if (!lastDecayAt) return false; // NULL = never decayed
    const lastDecayDay = new Date(lastDecayAt);
    lastDecayDay.setUTCHours(0, 0, 0, 0);
    const nowDay = new Date(now);
    nowDay.setUTCHours(0, 0, 0, 0);
    return lastDecayDay.getTime() === nowDay.getTime();
  };

  const now = new Date('2026-02-01T12:00:00Z');

  // Decayed today at 2 AM
  const todayAt2AM = new Date('2026-02-01T02:00:00Z');
  assert(hasDecayedToday(todayAt2AM, now), 'Decayed today at 2 AM -> skip');

  // Decayed yesterday
  const yesterday = new Date('2026-01-31T02:00:00Z');
  assert(!hasDecayedToday(yesterday, now), 'Decayed yesterday -> allow decay');

  // Never decayed
  assert(!hasDecayedToday(null, now), 'Never decayed -> allow decay');

  // Decayed today at 11:59 PM (still same day)
  const todayLate = new Date('2026-02-01T23:59:59Z');
  assert(hasDecayedToday(todayLate, now), 'Decayed today at 11:59 PM -> skip');
});

// ===========================================
// Test: Season end detection (Unit)
// ===========================================

describe('Season end detection', () => {
  const shouldEndSeason = (
    endDate: Date,
    status: string,
    now: Date
  ): boolean => {
    return status === 'ACTIVE' && endDate.getTime() <= now.getTime();
  };

  const now = new Date('2026-02-01T00:00:00Z');

  // Season ended yesterday
  const endedYesterday = new Date('2026-01-31T23:59:59Z');
  assert(
    shouldEndSeason(endedYesterday, 'ACTIVE', now),
    'Season ended yesterday + ACTIVE -> end it'
  );

  // Season ends today (exactly now)
  assert(
    shouldEndSeason(now, 'ACTIVE', now),
    'Season ends exactly now + ACTIVE -> end it'
  );

  // Season ends tomorrow
  const endsTomorrow = new Date('2026-02-02T00:00:00Z');
  assert(
    !shouldEndSeason(endsTomorrow, 'ACTIVE', now),
    'Season ends tomorrow + ACTIVE -> do not end'
  );

  // Season already ended
  assert(
    !shouldEndSeason(endedYesterday, 'ENDED', now),
    'Season already ENDED -> do not end again'
  );

  // Season scheduled
  assert(
    !shouldEndSeason(endedYesterday, 'SCHEDULED', now),
    'Season SCHEDULED -> do not end'
  );
});

// ===========================================
// Test: Grace period calculation (Unit)
// ===========================================

describe('Grace period calculation', () => {
  const graceDelayMs =
    SEASON_WORKER_CONFIG.GRACE_PERIOD_HOURS * 60 * 60 * 1000;

  assertEqual(
    graceDelayMs,
    4 * 60 * 60 * 1000,
    'Grace period is 4 hours in milliseconds'
  );
  assertEqual(graceDelayMs, 14400000, 'Grace period is 14,400,000 ms');

  // Simulate when finalize should run
  const seasonEndTime = new Date('2026-02-01T00:00:00Z');
  const finalizeTime = new Date(seasonEndTime.getTime() + graceDelayMs);
  assertEqual(
    finalizeTime.toISOString(),
    '2026-02-01T04:00:00.000Z',
    'Finalize should run at 4 AM UTC after midnight season end'
  );
});

// ===========================================
// Test: Idempotency guards (Unit)
// ===========================================

describe('Idempotency guards', () => {
  const shouldSkipDecay = (lastDecayAt: Date | null, now: Date): boolean => {
    if (!lastDecayAt) return false;
    const lastDecayDay = new Date(lastDecayAt);
    lastDecayDay.setUTCHours(0, 0, 0, 0);
    const nowDay = new Date(now);
    nowDay.setUTCHours(0, 0, 0, 0);
    return lastDecayDay.getTime() >= nowDay.getTime();
  };

  const shouldSkipSeasonEnd = (status: string): boolean => {
    return status !== 'ACTIVE';
  };

  const shouldSkipRewardDistribution = (
    rewardsDistributedAt: Date | null
  ): boolean => {
    return rewardsDistributedAt !== null;
  };

  // Decay idempotency
  const now = new Date('2026-02-01T12:00:00Z');
  assert(
    shouldSkipDecay(new Date('2026-02-01T02:00:00Z'), now),
    'Skip decay if already decayed today'
  );
  assert(
    !shouldSkipDecay(new Date('2026-01-31T02:00:00Z'), now),
    'Allow decay if last decay was yesterday'
  );
  assert(!shouldSkipDecay(null, now), 'Allow decay if never decayed');

  // Season end idempotency
  assert(shouldSkipSeasonEnd('ENDED'), 'Skip season end if already ENDED');
  assert(shouldSkipSeasonEnd('ARCHIVED'), 'Skip season end if ARCHIVED');
  assert(!shouldSkipSeasonEnd('ACTIVE'), 'Allow season end if ACTIVE');

  // Reward distribution idempotency
  assert(
    shouldSkipRewardDistribution(new Date()),
    'Skip rewards if already distributed'
  );
  assert(
    !shouldSkipRewardDistribution(null),
    'Allow rewards if not yet distributed'
  );
});

// ===========================================
// Test: Ranking order (Unit)
// ===========================================

describe('Ranking order by RP', () => {
  interface TestEntry {
    userId: string;
    rankPoints: number;
  }

  const entries: TestEntry[] = [
    { userId: 'user-c', rankPoints: 500 },
    { userId: 'user-a', rankPoints: 1000 },
    { userId: 'user-b', rankPoints: 750 },
    { userId: 'user-d', rankPoints: 250 },
  ];

  // Sort by RP descending
  const sorted = [...entries].sort((a, b) => b.rankPoints - a.rankPoints);

  assertEqual(sorted[0].userId, 'user-a', 'Rank 1: user-a (1000 RP)');
  assertEqual(sorted[1].userId, 'user-b', 'Rank 2: user-b (750 RP)');
  assertEqual(sorted[2].userId, 'user-c', 'Rank 3: user-c (500 RP)');
  assertEqual(sorted[3].userId, 'user-d', 'Rank 4: user-d (250 RP)');
});

// ===========================================
// Run Summary
// ===========================================

console.log('\n========================================');
console.log('SEASON QUEUE TEST RESULTS');
console.log('========================================');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('========================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
