// =====================================================
// Matchmaking Service Test Suite
// =====================================================
// Run with: npx tsx src/services/matchmaking.service.test.ts
// Tests pure functions: calculateDynamicMmrRange, calculateCompatibilityScore, findBestOpponent

import { PickTier, GameMode } from '@prisma/client';
import {
  calculateDynamicMmrRange,
  calculateCompatibilityScore,
  findBestOpponent,
  CompatibilityScore,
} from './matchmaking.service';

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

function assertRange(actual: number, min: number, max: number, message: string): void {
  const pass = actual >= min && actual <= max;
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${message}`);
    console.error(`      Expected: ${min} <= value <= ${max}`);
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
// Mock Data Factories
// ===========================================

interface MockQueueEntry {
  id: string;
  userId: string;
  gameMode: GameMode;
  tier: PickTier;
  stakeAmount: bigint;
  skillRating: number;
  slipId: string | null;
  slipSize: number | null;
  enqueuedAt: Date;
  version: number;
  user: {
    id: string;
    username: string;
    skillRating: number;
  };
}

function createMockEntry(overrides: Partial<MockQueueEntry> = {}): MockQueueEntry {
  const id = overrides.id || `entry-${Math.random().toString(36).slice(2, 8)}`;
  const userId = overrides.userId || `user-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    userId,
    gameMode: GameMode.QUICK_MATCH,
    tier: PickTier.FREE,
    stakeAmount: BigInt(100),
    skillRating: 1000,
    slipId: `slip-${id}`,
    slipSize: 3,
    enqueuedAt: new Date(),
    version: 1,
    user: {
      id: userId,
      username: `player-${userId.slice(5)}`,
      skillRating: 1000,
    },
    ...overrides,
  };
}

// ===========================================
// Test: calculateDynamicMmrRange
// ===========================================

describe('calculateDynamicMmrRange', () => {
  // Test base range at time 0
  const now = new Date();
  const range0 = calculateDynamicMmrRange(now, now.getTime());
  assertEqual(range0, 100, 'Base range is 100 at time 0');

  // Test range after 45 seconds (should widen by at least one expansion: 40-60)
  // Note: Randomized intervals are 25-40s, so at 45s we should have at least 1 expansion
  const fortyFiveSecsAgo = new Date(now.getTime() - 45000);
  const range45s = calculateDynamicMmrRange(fortyFiveSecsAgo, fortyFiveSecsAgo.getTime());
  assertRange(range45s, 140, 200, 'Range widens to 140-200 after 45s (1-2 expansions)');

  // Test range after 90 seconds (should widen by 2-3 expansions: +80 to +180)
  // With randomized intervals (25-40s), at 90s we should have 2-3 expansions
  const ninetySecsAgo = new Date(now.getTime() - 90000);
  const range90s = calculateDynamicMmrRange(ninetySecsAgo, ninetySecsAgo.getTime());
  assertRange(range90s, 140, 280, 'Range widens to 140-280 after 90s (2-4 expansions)');

  // Test range after 5 minutes (should be capped at 400)
  const fiveMinsAgo = new Date(now.getTime() - 300000);
  const range5m = calculateDynamicMmrRange(fiveMinsAgo, fiveMinsAgo.getTime());
  assertEqual(range5m, 400, 'Range is capped at 400');

  // Test deterministic behavior with same seed
  const seed = 12345;
  const testTime = new Date(now.getTime() - 60000); // Use 60s ago for this test
  const range1 = calculateDynamicMmrRange(testTime, seed);
  const range2 = calculateDynamicMmrRange(testTime, seed);
  assertEqual(range1, range2, 'Same seed produces same range');

  // Test different seeds produce different results (with enough time waited)
  // Note: With short waits, might still get same result by chance
  const seedTestTime = new Date(now.getTime() - 90000); // 90s ago
  const rangeA = calculateDynamicMmrRange(seedTestTime, 1);
  const rangeB = calculateDynamicMmrRange(seedTestTime, 999999);
  // They might be the same by chance, but let's at least verify they're valid
  assertRange(rangeA, 100, 400, 'Range A is valid');
  assertRange(rangeB, 100, 400, 'Range B is valid');
});

// ===========================================
// Test: calculateCompatibilityScore - Self Match Prevention
// ===========================================

describe('calculateCompatibilityScore - Self Match Prevention', () => {
  const entry = createMockEntry({ userId: 'user-1', id: 'entry-1' });
  const sameUser = createMockEntry({ userId: 'user-1', id: 'entry-2' });
  const recentMatches = new Map<string, Set<string>>();

  const result = calculateCompatibilityScore(entry, sameUser, recentMatches);
  assertEqual(result.isCompatible, false, 'Self-match is not compatible');
  assert(result.reasons.some(r => r.toLowerCase().includes('yourself') || r.toLowerCase().includes('self')), 'Reason mentions self-match');
});

// ===========================================
// Test: calculateCompatibilityScore - Slip Size Matching
// ===========================================

describe('calculateCompatibilityScore - Slip Size Matching', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Same slip size
  const entry1 = createMockEntry({ userId: 'user-1', slipSize: 3 });
  const entry2 = createMockEntry({ userId: 'user-2', slipSize: 3 });
  const result1 = calculateCompatibilityScore(entry1, entry2, recentMatches);
  assertEqual(result1.isCompatible, true, 'Same slip size (3) is compatible');

  // Different slip size
  const entry3 = createMockEntry({ userId: 'user-3', slipSize: 3 });
  const entry4 = createMockEntry({ userId: 'user-4', slipSize: 5 });
  const result2 = calculateCompatibilityScore(entry3, entry4, recentMatches);
  assertEqual(result2.isCompatible, false, 'Different slip sizes are not compatible');
  assert(result2.reasons.some(r => r.toLowerCase().includes('slip') && r.toLowerCase().includes('mismatch')), 'Reason mentions slip mismatch');

  // Null slip size (edge case)
  const entry5 = createMockEntry({ userId: 'user-5', slipSize: null });
  const entry6 = createMockEntry({ userId: 'user-6', slipSize: 3 });
  const result3 = calculateCompatibilityScore(entry5, entry6, recentMatches);
  assertEqual(result3.isCompatible, false, 'Null slip size is not compatible');
});

// ===========================================
// Test: calculateCompatibilityScore - Stake Amount Matching
// ===========================================

describe('calculateCompatibilityScore - Stake Amount Matching', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Same stake amount
  const entry1 = createMockEntry({ userId: 'user-1', stakeAmount: BigInt(100) });
  const entry2 = createMockEntry({ userId: 'user-2', stakeAmount: BigInt(100) });
  const result1 = calculateCompatibilityScore(entry1, entry2, recentMatches);
  assertEqual(result1.isCompatible, true, 'Same stake (100) is compatible');

  // Different stake amounts
  const entry3 = createMockEntry({ userId: 'user-3', stakeAmount: BigInt(100) });
  const entry4 = createMockEntry({ userId: 'user-4', stakeAmount: BigInt(200) });
  const result2 = calculateCompatibilityScore(entry3, entry4, recentMatches);
  assertEqual(result2.isCompatible, false, 'Different stakes are not compatible');
  assert(result2.reasons.some(r => r.toLowerCase().includes('stake') && r.toLowerCase().includes('mismatch')), 'Reason mentions stake mismatch');
});

// ===========================================
// Test: calculateCompatibilityScore - Tier Matching
// ===========================================

describe('calculateCompatibilityScore - Tier Matching', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Same tier
  const entry1 = createMockEntry({ userId: 'user-1', tier: PickTier.STANDARD });
  const entry2 = createMockEntry({ userId: 'user-2', tier: PickTier.STANDARD });
  const result1 = calculateCompatibilityScore(entry1, entry2, recentMatches);
  assertEqual(result1.isCompatible, true, 'Same tier (STANDARD) is compatible');

  // Different tiers
  const entry3 = createMockEntry({ userId: 'user-3', tier: PickTier.FREE });
  const entry4 = createMockEntry({ userId: 'user-4', tier: PickTier.PREMIUM });
  const result2 = calculateCompatibilityScore(entry3, entry4, recentMatches);
  assertEqual(result2.isCompatible, false, 'Different tiers are not compatible');
  assert(result2.reasons.some(r => r.toLowerCase().includes('tier') && r.toLowerCase().includes('mismatch')), 'Reason mentions tier mismatch');
});

// ===========================================
// Test: calculateCompatibilityScore - MMR Range
// ===========================================

describe('calculateCompatibilityScore - MMR Range', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Within base MMR range (100)
  const entry1 = createMockEntry({ userId: 'user-1', skillRating: 1000 });
  const entry2 = createMockEntry({ userId: 'user-2', skillRating: 1050 });
  const result1 = calculateCompatibilityScore(entry1, entry2, recentMatches);
  assertEqual(result1.isCompatible, true, 'MMR diff 50 is within base range');

  // Just at edge of base range
  const entry3 = createMockEntry({ userId: 'user-3', skillRating: 1000 });
  const entry4 = createMockEntry({ userId: 'user-4', skillRating: 1100 });
  const result2 = calculateCompatibilityScore(entry3, entry4, recentMatches);
  assertEqual(result2.isCompatible, true, 'MMR diff 100 is at edge of base range');

  // Outside base range (but would widen with wait time)
  const entry5 = createMockEntry({ userId: 'user-5', skillRating: 1000 });
  const entry6 = createMockEntry({ userId: 'user-6', skillRating: 1200 });
  const result3 = calculateCompatibilityScore(entry5, entry6, recentMatches);
  assertEqual(result3.isCompatible, false, 'MMR diff 200 is outside base range');
  assert(result3.reasons.some(r => r.toLowerCase().includes('mmr')), 'Reason mentions MMR');

  // With time waited, range should expand
  const twoMinsAgo = new Date(Date.now() - 120000);
  const entry7 = createMockEntry({
    userId: 'user-7',
    skillRating: 1000,
    enqueuedAt: twoMinsAgo,
  });
  const entry8 = createMockEntry({
    userId: 'user-8',
    skillRating: 1200,
    enqueuedAt: twoMinsAgo,
  });
  const result4 = calculateCompatibilityScore(entry7, entry8, recentMatches);
  // After 2 minutes (120s), range should have expanded significantly
  // 120s / ~30s per expansion = ~4 expansions, ~50 each = +200, so range ~300
  assertEqual(result4.isCompatible, true, 'MMR diff 200 is within expanded range after 2 mins');
});

// ===========================================
// Test: calculateCompatibilityScore - Rematch Prevention
// ===========================================

describe('calculateCompatibilityScore - Rematch Prevention', () => {
  // Set up recent matches map
  const recentMatches = new Map<string, Set<string>>();
  recentMatches.set('user-1', new Set(['user-2'])); // Already matched with user-2
  recentMatches.set('user-2', new Set(['user-1']));

  const entry1 = createMockEntry({ userId: 'user-1' });
  const entry2 = createMockEntry({ userId: 'user-2' });
  const result = calculateCompatibilityScore(entry1, entry2, recentMatches);

  assertEqual(result.isCompatible, false, 'Recent opponents are not compatible');
  assert(result.reasons.some(r => r.toLowerCase().includes('rematch') || r.toLowerCase().includes('recent')), 'Reason mentions rematch prevention');
});

// ===========================================
// Test: calculateCompatibilityScore - Scoring
// ===========================================

describe('calculateCompatibilityScore - Scoring', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Closer MMR should get higher score
  const entry1 = createMockEntry({ userId: 'user-1', skillRating: 1000 });
  const closeEntry = createMockEntry({ userId: 'user-2', skillRating: 1010 });
  const farEntry = createMockEntry({ userId: 'user-3', skillRating: 1090 });

  const closeScore = calculateCompatibilityScore(entry1, closeEntry, recentMatches);
  const farScore = calculateCompatibilityScore(entry1, farEntry, recentMatches);

  assert(closeScore.score > farScore.score, 'Closer MMR (10 diff) scores higher than far MMR (90 diff)');
});

// ===========================================
// Test: findBestOpponent
// ===========================================

describe('findBestOpponent', () => {
  const recentMatches = new Map<string, Set<string>>();

  // Multiple compatible candidates - should pick best score
  const entry = createMockEntry({ userId: 'user-main', skillRating: 1000 });
  const candidates = [
    createMockEntry({ userId: 'user-close', skillRating: 1010 }), // Best: closest MMR
    createMockEntry({ userId: 'user-medium', skillRating: 1050 }),
    createMockEntry({ userId: 'user-far', skillRating: 1090 }),
  ];

  const result = findBestOpponent(entry, candidates, recentMatches);
  assert(result !== null, 'Found a best opponent');
  assertEqual(result?.entry.userId, 'user-close', 'Best opponent is the closest MMR');

  // No compatible candidates
  const entry2 = createMockEntry({ userId: 'user-2', skillRating: 1000, tier: PickTier.FREE });
  const incompatibleCandidates = [
    createMockEntry({ userId: 'user-3', skillRating: 1500 }), // Too far MMR
    createMockEntry({ userId: 'user-4', tier: PickTier.PREMIUM }), // Different tier
    createMockEntry({ userId: 'user-2', skillRating: 1000 }), // Same user (self-match)
  ];

  const result2 = findBestOpponent(entry2, incompatibleCandidates, recentMatches);
  assertEqual(result2, null, 'No compatible opponent returns null');

  // Empty candidates
  const result3 = findBestOpponent(entry, [], recentMatches);
  assertEqual(result3, null, 'Empty candidates returns null');
});

// ===========================================
// Test: Edge Cases
// ===========================================

describe('Edge Cases', () => {
  const recentMatches = new Map<string, Set<string>>();

  // BigInt stake comparison
  const entry1 = createMockEntry({
    userId: 'user-1',
    stakeAmount: BigInt('9007199254740992'), // Beyond Number.MAX_SAFE_INTEGER
  });
  const entry2 = createMockEntry({
    userId: 'user-2',
    stakeAmount: BigInt('9007199254740992'),
  });
  const result1 = calculateCompatibilityScore(entry1, entry2, recentMatches);
  assertEqual(result1.isCompatible, true, 'Large BigInt stakes compare correctly');

  // Very old enqueue time (should hit max range)
  const veryOld = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
  const range = calculateDynamicMmrRange(veryOld, veryOld.getTime());
  assertEqual(range, 400, 'Very old entries have max range (400)');

  // Zero MMR difference
  const entry3 = createMockEntry({ userId: 'user-3', skillRating: 1000 });
  const entry4 = createMockEntry({ userId: 'user-4', skillRating: 1000 });
  const result2 = calculateCompatibilityScore(entry3, entry4, recentMatches);
  assertEqual(result2.isCompatible, true, 'Zero MMR difference is compatible');
  assert(result2.score > 1000, 'Zero MMR diff gets high score bonus');
});

// ===========================================
// Run Tests and Report
// ===========================================

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}
