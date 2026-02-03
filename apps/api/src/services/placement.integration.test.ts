// =====================================================
// Placement Matches Integration Tests
// =====================================================
// Run with: npx tsx src/services/placement.integration.test.ts
//
// Tests for Task 4.2: Placement Matches
// - Placement flow (1-10 matches)
// - Idempotency (same match processed twice)
// - Optimistic locking (concurrent updates)
// - 10th match completion with rank assignment
// - Edge cases (draws, 0-10 wins, 10-0 wins)

import { PrismaClient, Rank, SeasonStatus } from '@prisma/client';
import { updateRankPoints } from './ranked.service';
import { MatchResultForRP, PLACEMENT_MATCHES_REQUIRED } from '@pick-rivals/shared-types';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

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
    console.error(`      Expected: ${JSON.stringify(expected)}`);
    console.error(`      Actual:   ${JSON.stringify(actual)}`);
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

async function assertThrows(fn: () => Promise<any>, expectedError: string, message: string): Promise<void> {
  try {
    await fn();
    testsFailed++;
    console.error(`  ✗ ${message} - Expected to throw but did not`);
  } catch (error: any) {
    if (error.message.includes(expectedError)) {
      testsPassed++;
      console.log(`  ✓ ${message}`);
    } else {
      testsFailed++;
      console.error(`  ✗ ${message}`);
      console.error(`      Expected error containing: ${expectedError}`);
      console.error(`      Actual error: ${error.message}`);
    }
  }
}

function describe(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  return fn();
}

// ===========================================
// Test Data Helpers
// ===========================================

async function createTestSeason(): Promise<string> {
  const season = await prisma.season.create({
    data: {
      id: uuidv4(),
      name: `Test Season ${Date.now()}`,
      slug: `test-season-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: SeasonStatus.ACTIVE,
      isCurrent: false,
    },
  });
  return season.id;
}

async function createTestUser(): Promise<string> {
  const userId = uuidv4();
  await prisma.user.create({
    data: {
      id: userId,
      email: `test-${Date.now()}-${Math.random()}@example.com`,
      username: `testuser${Date.now()}${Math.floor(Math.random() * 1000)}`,
      passwordHash: 'test-hash',
      emailVerified: true,
      wallet: {
        create: {
          id: uuidv4(),
          paidBalance: BigInt(10000), // 100.00 in cents
          bonusBalance: BigInt(0),
        },
      },
    },
  });
  return userId;
}

async function cleanupTestData(seasonId: string, userIds: string[]): Promise<void> {
  // Delete in order to respect foreign key constraints
  await prisma.placementMatch.deleteMany({
    where: { seasonEntry: { seasonId } },
  });
  await prisma.seasonEntry.deleteMany({
    where: { seasonId },
  });
  await prisma.transaction.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.match.deleteMany({
    where: { seasonId },
  });
  await prisma.wallet.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
  for (const userId of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

async function createTestMatch(
  creatorId: string,
  opponentId: string,
  seasonId: string
): Promise<string> {
  const match = await prisma.match.create({
    data: {
      id: uuidv4(),
      type: 'public',
      stakeAmount: BigInt(100),
      creatorId,
      opponentId,
      status: 'settled',
      seasonId,
    },
  });
  return match.id;
}

async function createMatchResult(
  userId: string,
  opponentId: string,
  seasonId: string,
  winnerId: string | null,
  isDraw: boolean = false
): Promise<MatchResultForRP> {
  const matchId = await createTestMatch(userId, opponentId, seasonId);
  return {
    matchId,
    seasonId,
    winnerId,
    loserId: isDraw ? null : (winnerId === userId ? opponentId : userId),
    isDraw,
    settledAt: new Date().toISOString(),
  };
}

// ===========================================
// Test: Placement Flow (1-9 matches)
// ===========================================

async function testPlacementProgress(): Promise<void> {
  console.log('\n=== Test: Placement Progress (1-9 matches) ===');

  const seasonId = await createTestSeason();
  const userId = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Play 5 wins
    for (let i = 0; i < 5; i++) {
      const matchResult = await createMatchResult(userId, opponentId, seasonId, userId);
      const result = await updateRankPoints(userId, matchResult);

      assertEqual(result.isPlacement, true, `Match ${i + 1}: isPlacement = true`);
      assertEqual(result.rpChange, 0, `Match ${i + 1}: rpChange = 0 during placement`);
      assertEqual(result.placementMatchesPlayed, i + 1, `Match ${i + 1}: placementMatchesPlayed = ${i + 1}`);
    }

    // Play 3 losses
    for (let i = 0; i < 3; i++) {
      const matchResult = await createMatchResult(userId, opponentId, seasonId, opponentId);
      const result = await updateRankPoints(userId, matchResult);

      assertEqual(result.isPlacement, true, `Loss ${i + 1}: isPlacement = true`);
      assertEqual(result.outcome, 'LOSS', `Loss ${i + 1}: outcome = LOSS`);
    }

    // Play 1 draw
    const drawResult = await createMatchResult(userId, opponentId, seasonId, null, true);
    const drawUpdateResult = await updateRankPoints(userId, drawResult);
    assertEqual(drawUpdateResult.outcome, 'DRAW', 'Draw: outcome = DRAW');
    assertEqual(drawUpdateResult.placementMatchesPlayed, 9, 'After draw: 9 matches played');

    // Check season entry state
    const entry = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    assertEqual(entry?.placementMatchesPlayed, 9, 'Entry: 9 placement matches played');
    assertEqual(entry?.placementMatchesWon, 5, 'Entry: 5 wins');
    assertEqual(entry?.currentRank, null, 'Entry: currentRank still null (not placed)');
    assertEqual(entry?.isPlaced, false, 'Entry: isPlaced = false');

    console.log('  ✓ Placement progress test passed');
  } finally {
    await cleanupTestData(seasonId, [userId, opponentId]);
  }
}

// ===========================================
// Test: 10th Match Completion
// ===========================================

async function test10thMatchCompletion(): Promise<void> {
  console.log('\n=== Test: 10th Match Completion ===');

  const seasonId = await createTestSeason();
  const userId = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Play 9 matches (7 wins, 2 losses)
    for (let i = 0; i < 7; i++) {
      const matchResult = await createMatchResult(userId, opponentId, seasonId, userId);
      await updateRankPoints(userId, matchResult);
    }
    for (let i = 0; i < 2; i++) {
      const matchResult = await createMatchResult(userId, opponentId, seasonId, opponentId);
      await updateRankPoints(userId, matchResult);
    }

    // 10th match - win
    const finalMatch = await createMatchResult(userId, opponentId, seasonId, userId);
    const result = await updateRankPoints(userId, finalMatch);

    assertEqual(result.isPlacement, true, '10th match: isPlacement = true');
    assertEqual(result.placementMatchesPlayed, 10, '10th match: placementMatchesPlayed = 10');
    assertEqual(result.rankAfter, Rank.GOLD_3, '8 wins = GOLD_3 (based on PLACEMENT_RESULTS)');
    assert(result.rpAfter > 0, '10th match: rpAfter > 0 (set to rank threshold)');

    // Check season entry state
    const entry = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    assertEqual(entry?.placementMatchesPlayed, 10, 'Entry: 10 placement matches');
    assertEqual(entry?.placementMatchesWon, 8, 'Entry: 8 wins');
    assertEqual(entry?.currentRank, Rank.GOLD_3, 'Entry: currentRank = GOLD_3');
    assertEqual(entry?.isPlaced, true, 'Entry: isPlaced = true');
    assert(entry?.placedAt !== null, 'Entry: placedAt is set');
    assertEqual(entry?.initialRank, Rank.GOLD_3, 'Entry: initialRank = GOLD_3');

    // Check placement audit records
    const placementMatches = await prisma.placementMatch.findMany({
      where: { seasonEntry: { userId, seasonId } },
      orderBy: { matchNumber: 'asc' },
    });

    assertEqual(placementMatches.length, 10, '10 PlacementMatch records created');
    assertEqual(placementMatches[9].matchNumber, 10, 'Last record has matchNumber = 10');
    assertEqual(placementMatches[9].rankAssigned, Rank.GOLD_3, 'Last record has rankAssigned');

    console.log('  ✓ 10th match completion test passed');
  } finally {
    await cleanupTestData(seasonId, [userId, opponentId]);
  }
}

// ===========================================
// Test: Idempotency (Same Match Twice)
// ===========================================

async function testIdempotency(): Promise<void> {
  console.log('\n=== Test: Idempotency ===');

  const seasonId = await createTestSeason();
  const userId = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Process same match twice
    const matchResult = await createMatchResult(userId, opponentId, seasonId, userId);

    const result1 = await updateRankPoints(userId, matchResult);
    const result2 = await updateRankPoints(userId, matchResult);

    assertEqual(result1.isIdempotent, false, 'First call: isIdempotent = false');
    assertEqual(result2.isIdempotent, true, 'Second call: isIdempotent = true');
    assertEqual(result1.rpAfter, result2.rpAfter, 'Same rpAfter');
    assertEqual(result1.placementMatchesPlayed, result2.placementMatchesPlayed, 'Same placementMatchesPlayed');

    // Check season entry - should only count once
    const entry = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    assertEqual(entry?.placementMatchesPlayed, 1, 'Only 1 match counted');
    assertEqual(entry?.placementMatchesWon, 1, 'Only 1 win counted');

    // Check placement match records - only 1 should exist
    const placementMatches = await prisma.placementMatch.findMany({
      where: { seasonEntry: { userId, seasonId } },
    });

    assertEqual(placementMatches.length, 1, 'Only 1 PlacementMatch record');

    console.log('  ✓ Idempotency test passed');
  } finally {
    await cleanupTestData(seasonId, [userId, opponentId]);
  }
}

// ===========================================
// Test: Post-Placement RP Changes
// ===========================================

async function testPostPlacementRP(): Promise<void> {
  console.log('\n=== Test: Post-Placement RP Changes ===');

  const seasonId = await createTestSeason();
  const userId = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Complete placement (5 wins, 5 losses)
    for (let i = 0; i < 5; i++) {
      const winMatch = await createMatchResult(userId, opponentId, seasonId, userId);
      await updateRankPoints(userId, winMatch);
    }
    for (let i = 0; i < 5; i++) {
      const lossMatch = await createMatchResult(userId, opponentId, seasonId, opponentId);
      await updateRankPoints(userId, lossMatch);
    }

    // Get state after placement
    const entryAfterPlacement = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    const rpAfterPlacement = entryAfterPlacement!.rankPoints;

    assertEqual(entryAfterPlacement?.isPlaced, true, 'User is placed');
    assertEqual(entryAfterPlacement?.currentRank, Rank.SILVER_3, '5 wins = SILVER_3');

    // 11th match (first post-placement) - win
    const postPlacementWin = await createMatchResult(userId, opponentId, seasonId, userId);
    const winResult = await updateRankPoints(userId, postPlacementWin);

    assertEqual(winResult.isPlacement, false, '11th match: isPlacement = false');
    assertEqual(winResult.rpChange, 25, '11th match win: rpChange = +25');
    assertEqual(winResult.rpAfter, rpAfterPlacement + 25, 'RP increased by 25');

    // 12th match - loss
    const postPlacementLoss = await createMatchResult(userId, opponentId, seasonId, opponentId);
    const lossResult = await updateRankPoints(userId, postPlacementLoss);

    assertEqual(lossResult.isPlacement, false, '12th match: isPlacement = false');
    assertEqual(lossResult.rpChange, -20, '12th match loss: rpChange = -20');

    // No more placement audit records should be created
    const placementMatches = await prisma.placementMatch.findMany({
      where: { seasonEntry: { userId, seasonId } },
    });

    assertEqual(placementMatches.length, 10, 'Still only 10 PlacementMatch records (none for post-placement)');

    console.log('  ✓ Post-placement RP changes test passed');
  } finally {
    await cleanupTestData(seasonId, [userId, opponentId]);
  }
}

// ===========================================
// Test: Extreme Cases (0-10 and 10-0)
// ===========================================

async function testExtremeCases(): Promise<void> {
  console.log('\n=== Test: Extreme Cases (0-10 and 10-0) ===');

  const seasonId = await createTestSeason();
  const allWinsUser = await createTestUser();
  const allLossesUser = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Test 10-0 (all wins)
    for (let i = 0; i < 10; i++) {
      const matchResult = await createMatchResult(allWinsUser, opponentId, seasonId, allWinsUser);
      await updateRankPoints(allWinsUser, matchResult);
    }

    const allWinsEntry = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId: allWinsUser, seasonId } },
    });

    assertEqual(allWinsEntry?.currentRank, Rank.GOLD_1, '10 wins = GOLD_1 (highest placement)');
    assertEqual(allWinsEntry?.initialRank, Rank.GOLD_1, 'initialRank = GOLD_1');
    assertEqual(allWinsEntry?.rankPoints, 600, 'RP = 600 (GOLD_1 threshold)');

    // Test 0-10 (all losses)
    for (let i = 0; i < 10; i++) {
      const matchResult = await createMatchResult(allLossesUser, opponentId, seasonId, opponentId);
      await updateRankPoints(allLossesUser, matchResult);
    }

    const allLossesEntry = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId: allLossesUser, seasonId } },
    });

    assertEqual(allLossesEntry?.currentRank, Rank.BRONZE_3, '0 wins = BRONZE_3 (lowest placement)');
    assertEqual(allLossesEntry?.initialRank, Rank.BRONZE_3, 'initialRank = BRONZE_3');
    assertEqual(allLossesEntry?.rankPoints, 200, 'RP = 200 (BRONZE_3 threshold)');

    console.log('  ✓ Extreme cases test passed');
  } finally {
    await cleanupTestData(seasonId, [allWinsUser, allLossesUser, opponentId]);
  }
}

// ===========================================
// Test: Optimistic Locking (Version Check)
// ===========================================

async function testOptimisticLocking(): Promise<void> {
  console.log('\n=== Test: Optimistic Locking ===');

  const seasonId = await createTestSeason();
  const userId = await createTestUser();
  const opponentId = await createTestUser();

  try {
    // Play first match to create entry
    const match1 = await createMatchResult(userId, opponentId, seasonId, userId);
    await updateRankPoints(userId, match1);

    // Get initial version
    const entry1 = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    const initialVersion = entry1!.version;

    // Play second match
    const match2 = await createMatchResult(userId, opponentId, seasonId, userId);
    await updateRankPoints(userId, match2);

    // Check version incremented
    const entry2 = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    assertEqual(entry2!.version, initialVersion + 1, 'Version incremented after update');

    // Play more matches and verify version keeps incrementing
    const match3 = await createMatchResult(userId, opponentId, seasonId, opponentId);
    await updateRankPoints(userId, match3);

    const entry3 = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    assertEqual(entry3!.version, initialVersion + 2, 'Version incremented again');

    console.log('  ✓ Optimistic locking test passed');
  } finally {
    await cleanupTestData(seasonId, [userId, opponentId]);
  }
}

// ===========================================
// Test: Both Players Updated
// ===========================================

async function testBothPlayersUpdated(): Promise<void> {
  console.log('\n=== Test: Both Players Updated ===');

  const seasonId = await createTestSeason();
  const player1 = await createTestUser();
  const player2 = await createTestUser();

  try {
    // Player 1 wins - create a real match record
    const matchId = await createTestMatch(player1, player2, seasonId);
    const matchResult: MatchResultForRP = {
      matchId,
      seasonId,
      winnerId: player1,
      loserId: player2,
      isDraw: false,
      settledAt: new Date().toISOString(),
    };

    // Update both players
    const result1 = await updateRankPoints(player1, matchResult);
    const result2 = await updateRankPoints(player2, matchResult);

    assertEqual(result1.outcome, 'WIN', 'Player 1: outcome = WIN');
    assertEqual(result2.outcome, 'LOSS', 'Player 2: outcome = LOSS');
    assertEqual(result1.placementMatchesPlayed, 1, 'Player 1: 1 match played');
    assertEqual(result2.placementMatchesPlayed, 1, 'Player 2: 1 match played');

    // Check both entries
    const entry1 = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId: player1, seasonId } },
    });
    const entry2 = await prisma.seasonEntry.findUnique({
      where: { userId_seasonId: { userId: player2, seasonId } },
    });

    assertEqual(entry1?.placementMatchesWon, 1, 'Player 1: 1 win');
    assertEqual(entry1?.wins, 1, 'Player 1: wins = 1');
    assertEqual(entry2?.placementMatchesWon, 0, 'Player 2: 0 wins');
    assertEqual(entry2?.losses, 1, 'Player 2: losses = 1');

    console.log('  ✓ Both players updated test passed');
  } finally {
    await cleanupTestData(seasonId, [player1, player2]);
  }
}

// ===========================================
// Run All Tests
// ===========================================

async function runTests(): Promise<void> {
  console.log('================================================');
  console.log('PLACEMENT MATCHES INTEGRATION TESTS');
  console.log('================================================');

  try {
    await testPlacementProgress();
    await test10thMatchCompletion();
    await testIdempotency();
    await testPostPlacementRP();
    await testExtremeCases();
    await testOptimisticLocking();
    await testBothPlayersUpdated();
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    testsFailed++;
  }

  console.log('\n========================================');
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('========================================\n');

  await prisma.$disconnect();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
