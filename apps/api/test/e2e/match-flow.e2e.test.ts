// =====================================================
// Match Flow E2E Test Suite
// =====================================================
// Tests the complete user journey from registration to match settlement.
// Simulates real API calls using Supertest against the Express app.
//
// FLOW COVERAGE:
// 1. User registration and authentication
// 2. Slip creation with picks
// 3. Matchmaking queue entry
// 4. Match creation via matchmaking
// 5. Event completion and result updates
// 6. Match settlement and winner determination
// 7. Wallet balance updates
//
// FAILURE SCENARIOS:
// - Insufficient balance for queue entry
// - Invalid slip (empty picks, non-existent events)
// - Duplicate queue entry attempts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { getTestApp, unauthenticatedRequest } from '../helpers/api.helper';
import { getTestPrisma, resetDatabase } from '../helpers/db.helper';
import { getTestEventIds } from '../helpers/e2e-setup';
import { PickType, EventStatus, MatchStatus, SlipStatus } from '@prisma/client';
import { ApiResponse, AuthResponse } from '@pick-rivals/shared-types';

// ===========================================
// Test Helpers
// ===========================================

interface TestUser {
  id: string;
  email: string;
  username: string;
  accessToken: string;
  walletId: string;
  initialBalance: number;
}

/**
 * Generate unique email for test isolation.
 */
function generateUniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@e2e.test`;
}

/**
 * Generate unique username for test isolation.
 */
function generateUniqueUsername(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Register a new test user via API.
 */
async function registerTestUser(username?: string, email?: string): Promise<TestUser> {
  const app = getTestApp();
  const testEmail = email || generateUniqueEmail();
  const testUsername = username || generateUniqueUsername();

  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email: testEmail,
      username: testUsername,
      password: 'TestPassword123!',
    })
    .expect(201);

  const body: ApiResponse<AuthResponse> = response.body;

  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.data?.user).toBeDefined();
  expect(body.data?.tokens).toBeDefined();
  expect(body.data?.wallet).toBeDefined();

  return {
    id: body.data!.user.id,
    email: body.data!.user.email,
    username: body.data!.user.username,
    accessToken: body.data!.tokens.accessToken,
    walletId: body.data!.wallet.id,
    initialBalance: body.data!.wallet.coinBalance,
  };
}

/**
 * Create a slip via API for the given user.
 */
async function createSlip(
  user: TestUser,
  eventIds: string[],
  slipName?: string
): Promise<string> {
  const app = getTestApp();

  const picks = eventIds.map((eventId, index) => ({
    eventId,
    pickType: 'moneyline' as PickType,
    prediction: index % 2 === 0 ? 'home' : 'away',
    odds: index % 2 === 0 ? -150 : 130,
    stake: 10,
  }));

  const response = await request(app)
    .post('/api/v1/slips')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({
      name: slipName || 'Test Slip',
      picks,
    })
    .expect(201);

  const body = response.body;
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.data.id).toBeDefined();

  return body.data.id;
}

/**
 * Lock a slip via API (make it active).
 */
async function lockSlip(user: TestUser, slipId: string): Promise<void> {
  const app = getTestApp();

  await request(app)
    .post(`/api/v1/slips/${slipId}/lock`)
    .set('Authorization', `Bearer ${user.accessToken}`)
    .expect(200);
}

/**
 * Join matchmaking queue via API.
 */
async function joinQueue(
  user: TestUser,
  slipId: string,
  stakeAmount: number
): Promise<string> {
  const app = getTestApp();

  const response = await request(app)
    .post('/api/v1/matchmaking/queue')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({
      slipId,
      stakeAmount,
      region: 'us-east',
    })
    .expect(201);

  const body = response.body;
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.data.id).toBeDefined();

  return body.data.id;
}

/**
 * Simulate matchmaking by directly creating a match in the database.
 * This simulates what the matchmaking worker would do.
 */
async function simulateMatchmaking(
  user1Id: string,
  user2Id: string,
  slip1Id: string,
  slip2Id: string,
  stakeAmount: number
): Promise<string> {
  const prisma = getTestPrisma();

  const match = await prisma.match.create({
    data: {
      creatorId: user1Id,
      opponentId: user2Id,
      creatorSlipId: slip1Id,
      opponentSlipId: slip2Id,
      stakeAmount: BigInt(stakeAmount),
      status: MatchStatus.locked,
      matchType: 'public',
      gameMode: 'QUICK_MATCH',
    },
  });

  // Update slips to PENDING status
  await prisma.slip.updateMany({
    where: { id: { in: [slip1Id, slip2Id] } },
    data: { status: SlipStatus.PENDING },
  });

  return match.id;
}

/**
 * Complete events with scores (simulates live score updates).
 */
async function completeEvents(
  eventIds: string[],
  scores: { home: number; away: number }[]
): Promise<void> {
  const prisma = getTestPrisma();

  await Promise.all(
    eventIds.map((eventId, index) =>
      prisma.sportsEvent.update({
        where: { id: eventId },
        data: {
          status: EventStatus.COMPLETED,
          homeScore: scores[index].home,
          awayScore: scores[index].away,
        },
      })
    )
  );
}

/**
 * Trigger match settlement via admin endpoint (simulates settlement worker).
 */
async function settleMatch(matchId: string): Promise<void> {
  // Settlement is typically triggered by a worker.
  // For E2E tests, we directly call the settlement service via Prisma.
  const prisma = getTestPrisma();

  // Import settlement service
  const { settleMatchById } = await import('../../src/services/settlement/settlement.service');

  await settleMatchById(matchId);
}

// ===========================================
// Test Suite
// ===========================================

describe('Match Flow E2E Tests', () => {
  let testEventIds: string[];

  beforeEach(async () => {
    // Get shared test events
    testEventIds = getTestEventIds();
    expect(testEventIds.length).toBeGreaterThan(0);
  });

  afterEach(async () => {
    // Clean up database after each test
    await resetDatabase();

    // Recreate test events for next test
    const prisma = getTestPrisma();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await Promise.all([
      prisma.sportsEvent.create({
        data: {
          externalId: 'test-nfl-001',
          sport: 'NFL',
          league: 'NFL',
          homeTeamId: 'team-chiefs',
          homeTeamName: 'Kansas City Chiefs',
          homeTeamAbbr: 'KC',
          awayTeamId: 'team-bills',
          awayTeamName: 'Buffalo Bills',
          awayTeamAbbr: 'BUF',
          scheduledAt: tomorrow,
          status: EventStatus.SCHEDULED,
          oddsData: {
            provider: 'test-provider',
            lastUpdated: now.toISOString(),
            markets: {
              moneyline: { home: -150, away: 130 },
              spread: { home: -3.5, away: 3.5, homeOdds: -110, awayOdds: -110 },
              totals: { value: 47.5, overOdds: -110, underOdds: -110 },
            },
          },
        },
      }),
      prisma.sportsEvent.create({
        data: {
          externalId: 'test-nba-001',
          sport: 'NBA',
          league: 'NBA',
          homeTeamId: 'team-lakers',
          homeTeamName: 'Los Angeles Lakers',
          homeTeamAbbr: 'LAL',
          awayTeamId: 'team-celtics',
          awayTeamName: 'Boston Celtics',
          awayTeamAbbr: 'BOS',
          scheduledAt: tomorrow,
          status: EventStatus.SCHEDULED,
          oddsData: {
            provider: 'test-provider',
            lastUpdated: now.toISOString(),
            markets: {
              moneyline: { home: -200, away: 170 },
              spread: { home: -5.5, away: 5.5, homeOdds: -110, awayOdds: -110 },
              totals: { value: 220.5, overOdds: -110, underOdds: -110 },
            },
          },
        },
      }),
      prisma.sportsEvent.create({
        data: {
          externalId: 'test-mlb-001',
          sport: 'MLB',
          league: 'MLB',
          homeTeamId: 'team-yankees',
          homeTeamName: 'New York Yankees',
          homeTeamAbbr: 'NYY',
          awayTeamId: 'team-dodgers',
          awayTeamName: 'Los Angeles Dodgers',
          awayTeamAbbr: 'LAD',
          scheduledAt: tomorrow,
          status: EventStatus.SCHEDULED,
          oddsData: {
            provider: 'test-provider',
            lastUpdated: now.toISOString(),
            markets: {
              moneyline: { home: 120, away: -140 },
              spread: { home: 1.5, away: -1.5, homeOdds: -115, awayOdds: -105 },
              totals: { value: 8.5, overOdds: -110, underOdds: -110 },
            },
          },
        },
      }),
    ]);

    // Refresh event IDs
    const events = await prisma.sportsEvent.findMany();
    testEventIds = events.map((e) => e.id);
  });

  // ===========================================
  // HAPPY PATH: Complete Match Flow
  // ===========================================

  it('should complete full match flow: registration -> match -> settlement', async () => {
    // STEP 1: Register two users
    const user1 = await registerTestUser();
    const user2 = await registerTestUser();

    expect(user1.initialBalance).toBeGreaterThan(0);
    expect(user2.initialBalance).toBeGreaterThan(0);

    // STEP 2: Create slips for both users
    const slip1Id = await createSlip(user1, [testEventIds[0], testEventIds[1]]);
    const slip2Id = await createSlip(user2, [testEventIds[0], testEventIds[1]]);

    // STEP 3: Lock both slips
    await lockSlip(user1, slip1Id);
    await lockSlip(user2, slip2Id);

    // STEP 4: Join matchmaking queue
    const stakeAmount = 100;

    // Verify users have enough balance
    expect(user1.initialBalance).toBeGreaterThanOrEqual(stakeAmount);
    expect(user2.initialBalance).toBeGreaterThanOrEqual(stakeAmount);

    await joinQueue(user1, slip1Id, stakeAmount);
    await joinQueue(user2, slip2Id, stakeAmount);

    // STEP 5: Simulate matchmaking (worker creates match)
    const matchId = await simulateMatchmaking(
      user1.id,
      user2.id,
      slip1Id,
      slip2Id,
      stakeAmount
    );

    // STEP 6: Verify match created
    const prisma = getTestPrisma();
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        creatorSlip: { include: { picks: true } },
        opponentSlip: { include: { picks: true } },
      },
    });

    expect(match).toBeDefined();
    expect(match!.status).toBe(MatchStatus.locked);
    expect(match!.creatorId).toBe(user1.id);
    expect(match!.opponentId).toBe(user2.id);
    expect(Number(match!.stakeAmount)).toBe(stakeAmount);

    // STEP 7: Complete events with scores
    // User1 picks: home (Chiefs), away (Celtics)
    // User2 picks: home (Chiefs), away (Celtics)
    // Make Chiefs win and Celtics lose
    await completeEvents(
      [testEventIds[0], testEventIds[1]],
      [
        { home: 28, away: 24 }, // Chiefs win (home)
        { home: 105, away: 110 }, // Celtics win (away)
      ]
    );

    // STEP 8: Trigger settlement
    await settleMatch(matchId);

    // STEP 9: Verify settlement results
    const settledMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        creator: { include: { wallet: true } },
        opponent: { include: { wallet: true } },
      },
    });

    expect(settledMatch).toBeDefined();
    expect(settledMatch!.status).toBe(MatchStatus.settled);
    expect(settledMatch!.winnerId).toBeDefined();

    // STEP 10: Verify winner received payout
    const winnerId = settledMatch!.winnerId;
    const loserId = winnerId === user1.id ? user2.id : user1.id;

    const winnerWallet = await prisma.wallet.findUnique({
      where: { userId: winnerId! },
    });

    const loserWallet = await prisma.wallet.findUnique({
      where: { userId: loserId },
    });

    // Winner should have more than initial balance (minus stake plus payout)
    expect(Number(winnerWallet!.coinBalance)).toBeGreaterThan(
      (winnerId === user1.id ? user1.initialBalance : user2.initialBalance) - stakeAmount
    );

    // Loser should have less than initial balance (stake deducted)
    const loserInitial = loserId === user1.id ? user1.initialBalance : user2.initialBalance;
    expect(Number(loserWallet!.coinBalance)).toBe(loserInitial - stakeAmount);

    // STEP 11: Verify transactions recorded
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ userId: user1.id }, { userId: user2.id }],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Should have: 2x MATCH_ENTRY, 1x MATCH_WIN
    expect(transactions.length).toBeGreaterThanOrEqual(3);

    const entryTransactions = transactions.filter((t) => t.type === 'MATCH_ENTRY');
    const winTransactions = transactions.filter((t) => t.type === 'MATCH_WIN');

    expect(entryTransactions.length).toBe(2);
    expect(winTransactions.length).toBe(1);
    expect(winTransactions[0].userId).toBe(winnerId);
  });

  // ===========================================
  // FAILURE SCENARIOS
  // ===========================================

  it('should reject queue entry with insufficient balance', async () => {
    const app = getTestApp();

    // STEP 1: Register user with default balance
    const user = await registerTestUser();

    // STEP 2: Create and lock a slip
    const slipId = await createSlip(user, [testEventIds[0]]);
    await lockSlip(user, slipId);

    // STEP 3: Try to join queue with stake exceeding balance
    const excessiveStake = user.initialBalance + 1000;

    const response = await request(app)
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        slipId,
        stakeAmount: excessiveStake,
        region: 'us-east',
      })
      .expect(400);

    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toMatch(/INSUFFICIENT_BALANCE|VALIDATION_ERROR/);
  });

  it('should reject queue entry with invalid slip (no picks)', async () => {
    const app = getTestApp();
    const prisma = getTestPrisma();

    // STEP 1: Register user
    const user = await registerTestUser();

    // STEP 2: Manually create a slip with no picks (bypassing API validation)
    const emptySlip = await prisma.slip.create({
      data: {
        userId: user.id,
        name: 'Empty Slip',
        status: SlipStatus.PENDING,
      },
    });

    // STEP 3: Try to join queue with empty slip
    const response = await request(app)
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        slipId: emptySlip.id,
        stakeAmount: 100,
        region: 'us-east',
      })
      .expect(400);

    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('should reject queue entry with non-existent slip', async () => {
    const app = getTestApp();

    // STEP 1: Register user
    const user = await registerTestUser();

    // STEP 2: Try to join queue with fake slip ID
    const fakeSlipId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        slipId: fakeSlipId,
        stakeAmount: 100,
        region: 'us-east',
      })
      .expect(404);

    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('should reject duplicate queue entry with same slip', async () => {
    const app = getTestApp();

    // STEP 1: Register user
    const user = await registerTestUser();

    // STEP 2: Create and lock a slip
    const slipId = await createSlip(user, [testEventIds[0], testEventIds[1]]);
    await lockSlip(user, slipId);

    // STEP 3: Join queue first time (should succeed)
    await joinQueue(user, slipId, 100);

    // STEP 4: Try to join queue again with same slip (should fail)
    const response = await request(app)
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        slipId,
        stakeAmount: 100,
        region: 'us-east',
      })
      .expect(409);

    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toMatch(/ALREADY_IN_QUEUE|CONFLICT/);
  });

  it('should handle draw scenario correctly', async () => {
    // STEP 1: Register two users
    const user1 = await registerTestUser();
    const user2 = await registerTestUser();

    // STEP 2: Create identical slips for both users (same picks)
    const slip1Id = await createSlip(user1, [testEventIds[0], testEventIds[1]]);
    const slip2Id = await createSlip(user2, [testEventIds[0], testEventIds[1]]);

    // STEP 3: Lock both slips
    await lockSlip(user1, slip1Id);
    await lockSlip(user2, slip2Id);

    // STEP 4: Join queue
    const stakeAmount = 100;
    await joinQueue(user1, slip1Id, stakeAmount);
    await joinQueue(user2, slip2Id, stakeAmount);

    // STEP 5: Create match
    const matchId = await simulateMatchmaking(
      user1.id,
      user2.id,
      slip1Id,
      slip2Id,
      stakeAmount
    );

    // STEP 6: Complete events (both users will score the same)
    await completeEvents(
      [testEventIds[0], testEventIds[1]],
      [
        { home: 28, away: 24 }, // Home wins
        { home: 105, away: 110 }, // Away wins
      ]
    );

    // STEP 7: Settle match
    await settleMatch(matchId);

    // STEP 8: Verify draw result
    const prisma = getTestPrisma();
    const settledMatch = await prisma.match.findUnique({
      where: { id: matchId },
    });

    expect(settledMatch).toBeDefined();
    expect(settledMatch!.status).toBe(MatchStatus.draw);
    expect(settledMatch!.winnerId).toBeNull();

    // STEP 9: Verify both users got refunded
    const wallet1 = await prisma.wallet.findUnique({ where: { userId: user1.id } });
    const wallet2 = await prisma.wallet.findUnique({ where: { userId: user2.id } });

    expect(Number(wallet1!.coinBalance)).toBe(user1.initialBalance);
    expect(Number(wallet2!.coinBalance)).toBe(user2.initialBalance);
  });

  it('should reject unauthenticated queue entry', async () => {
    const app = getTestApp();

    // Try to join queue without auth token
    const response = await request(app)
      .post('/api/v1/matchmaking/queue')
      .send({
        slipId: 'some-slip-id',
        stakeAmount: 100,
        region: 'us-east',
      })
      .expect(401);

    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toMatch(/UNAUTHORIZED|AUTH/);
  });
});
