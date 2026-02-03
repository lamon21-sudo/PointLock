// =====================================================
// Matchmaking Integration Tests
// =====================================================
// Comprehensive integration tests for the matchmaking queue system.
// Tests real database transactions and Redis queue operations.
//
// CRITICAL: These tests run sequentially to avoid race conditions.
// Each test cleans up its own data in afterEach.

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GameMode, PickTier, QueueStatus, SlipStatus, MatchStatus } from '@prisma/client';
import { getTestPrisma, resetDatabase } from '../helpers/db.helper';
import { cleanTestQueues } from '../helpers/redis.helper';
import { createTestUser, createTestUserWithBalance } from '../fixtures/user.fixture';
import { createTestSlipWithMoneylinePicks } from '../fixtures/slip.fixture';
import { createTestQueueEntry, createWaitingQueueEntry } from '../fixtures/queue-entry.fixture';
import {
  enqueueForMatchmaking,
  leaveMatchmakingQueue,
  getQueueStatus,
  processMatchmakingQueue,
  calculateCompatibilityScore,
  findBestOpponent,
} from '../../src/services/matchmaking.service';
import { bigIntToNumber } from '../../src/lib/wallet.service';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// Test Suite Setup
// ===========================================

describe('Matchmaking Integration Tests', () => {
  let db: ReturnType<typeof getTestPrisma>;

  beforeAll(() => {
    db = getTestPrisma();
  });

  beforeEach(async () => {
    // Clean slate for each test
    await resetDatabase();
    await cleanTestQueues();
  });

  afterEach(async () => {
    // Paranoid cleanup after each test
    await cleanTestQueues();
  });

  // ===========================================
  // Test 1: Enqueue User
  // ===========================================

  describe('enqueueForMatchmaking', () => {
    it('should enqueue user with slip and debit wallet', async () => {
      // Arrange: Create user with balance
      const user = await createTestUserWithBalance(db, BigInt(10000), BigInt(5000));

      // Create a slip for matchmaking
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3, {
        status: SlipStatus.DRAFT,
      });

      const stakeAmount = BigInt(1000);

      // Act: Enqueue user
      const queueEntry = await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH' as GameMode,
        stakeAmount,
        slipId: slip.id,
        idempotencyKey: `test-enqueue-${uuidv4()}`,
      });

      // Assert: Queue entry created
      expect(queueEntry).toBeDefined();
      expect(queueEntry.userId).toBe(user.id);
      expect(queueEntry.gameMode).toBe('QUICK_MATCH');
      expect(queueEntry.stakeAmount).toBe(1000); // Converted to number in response
      expect(queueEntry.status).toBe(QueueStatus.WAITING);
      expect(queueEntry.slipSize).toBe(3);

      // Assert: Slip status changed to PENDING
      const updatedSlip = await db.slip.findUnique({
        where: { id: slip.id },
      });
      expect(updatedSlip?.status).toBe(SlipStatus.PENDING);
      expect(updatedSlip?.lockedAt).toBeDefined();

      // Assert: Wallet debited (prefer bonus first)
      const wallet = await db.wallet.findUnique({
        where: { userId: user.id },
      });
      expect(wallet).toBeDefined();

      // Bonus balance used first (5000 - 1000 = 4000)
      const expectedBonusBalance = BigInt(4000);
      expect(wallet?.bonusBalance).toBe(expectedBonusBalance);

      // Paid balance unchanged
      expect(wallet?.paidBalance).toBe(BigInt(10000));

      // Assert: Transaction created
      const transaction = await db.transaction.findFirst({
        where: {
          userId: user.id,
          type: 'MATCH_ENTRY',
        },
      });
      expect(transaction).toBeDefined();
      expect(transaction?.amount).toBe(stakeAmount);
    });

    it('should reject duplicate enqueue for same gameMode', async () => {
      // Arrange: User already in queue
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip1 = await createTestSlipWithMoneylinePicks(db, user.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      // Act & Assert: Second enqueue should fail
      await expect(
        enqueueForMatchmaking({
          userId: user.id,
          gameMode: 'QUICK_MATCH',
          stakeAmount: BigInt(1000),
          slipId: slip2.id,
        })
      ).rejects.toThrow(/already in queue/i);
    });

    it('should reject enqueue with non-DRAFT slip', async () => {
      // Arrange: Slip already locked
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3, {
        status: SlipStatus.PENDING,
        lockedAt: new Date(),
      });

      // Act & Assert
      await expect(
        enqueueForMatchmaking({
          userId: user.id,
          gameMode: 'QUICK_MATCH',
          stakeAmount: BigInt(1000),
          slipId: slip.id,
        })
      ).rejects.toThrow(/already locked/i);
    });

    it('should reject enqueue with insufficient balance', async () => {
      // Arrange: User with insufficient balance
      const user = await createTestUserWithBalance(db, BigInt(500)); // Only 500 coins
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      // Act & Assert
      await expect(
        enqueueForMatchmaking({
          userId: user.id,
          gameMode: 'QUICK_MATCH',
          stakeAmount: BigInt(1000), // Needs 1000
          slipId: slip.id,
        })
      ).rejects.toThrow(/insufficient/i);
    });
  });

  // ===========================================
  // Test 2: Leave Queue (Cancel)
  // ===========================================

  describe('leaveMatchmakingQueue', () => {
    it('should cancel queue entry and refund wallet', async () => {
      // Arrange: User in queue
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip.id,
      });

      // Act: Leave queue
      const cancelled = await leaveMatchmakingQueue(user.id, 'QUICK_MATCH');

      // Assert: Queue entry cancelled
      expect(cancelled).toBe(true);

      const queueEntry = await db.matchmakingQueue.findFirst({
        where: { userId: user.id, gameMode: 'QUICK_MATCH' },
      });
      expect(queueEntry?.status).toBe(QueueStatus.CANCELLED);

      // Assert: Wallet refunded
      const wallet = await db.wallet.findUnique({
        where: { userId: user.id },
      });
      expect(wallet?.paidBalance).toBe(BigInt(10000)); // Back to original

      // Assert: Slip unlocked
      const updatedSlip = await db.slip.findUnique({
        where: { id: slip.id },
      });
      expect(updatedSlip?.status).toBe(SlipStatus.DRAFT);
      expect(updatedSlip?.lockedAt).toBeNull();
    });

    it('should return false if no active queue entry', async () => {
      // Arrange: User not in queue
      const user = await createTestUser(db);

      // Act
      const cancelled = await leaveMatchmakingQueue(user.id, 'QUICK_MATCH');

      // Assert
      expect(cancelled).toBe(false);
    });

    it('should prevent cancellation after match created (optimistic lock)', async () => {
      // Arrange: User in queue, then matched
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      await enqueueForMatchmaking({
        userId: user.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip.id,
      });

      // Simulate match creation (update status to MATCHED)
      await db.matchmakingQueue.updateMany({
        where: { userId: user.id, gameMode: 'QUICK_MATCH' },
        data: { status: QueueStatus.MATCHED },
      });

      // Act: Try to cancel
      const cancelled = await leaveMatchmakingQueue(user.id, 'QUICK_MATCH');

      // Assert: Should fail (no WAITING entry)
      expect(cancelled).toBe(false);
    });
  });

  // ===========================================
  // Test 3: Queue Status
  // ===========================================

  describe('getQueueStatus', () => {
    it('should return queue entry and position', async () => {
      // Arrange: Multiple users in queue
      const user1 = await createTestUserWithBalance(db, BigInt(10000));
      const user2 = await createTestUserWithBalance(db, BigInt(10000));
      const user3 = await createTestUserWithBalance(db, BigInt(10000));

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);
      const slip3 = await createTestSlipWithMoneylinePicks(db, user3.id, 3);

      // Enqueue in order
      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      // Wait 10ms to ensure different enqueuedAt timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip2.id,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await enqueueForMatchmaking({
        userId: user3.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip3.id,
      });

      // Act: Get status for user2 (middle of queue)
      const status = await getQueueStatus(user2.id, 'QUICK_MATCH');

      // Assert
      expect(status.entry).toBeDefined();
      expect(status.entry?.userId).toBe(user2.id);
      expect(status.position).toBe(2); // Second in queue (1-indexed)
      expect(status.estimatedWaitMs).toBeDefined();
    });

    it('should return null for user not in queue', async () => {
      // Arrange
      const user = await createTestUser(db);

      // Act
      const status = await getQueueStatus(user.id, 'QUICK_MATCH');

      // Assert
      expect(status.entry).toBeNull();
      expect(status.position).toBeUndefined();
    });
  });

  // ===========================================
  // Test 4: Worker Processes Queue - Matching
  // ===========================================

  describe('processMatchmakingQueue - Matching', () => {
    it('should match two compatible users', async () => {
      // Arrange: Two users with compatible criteria
      const user1 = await createTestUserWithBalance(db, BigInt(10000), BigInt(0), {
        skillRating: 1000,
      });
      const user2 = await createTestUserWithBalance(db, BigInt(10000), BigInt(0), {
        skillRating: 1050, // Within MMR range
      });

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);

      // Enqueue both
      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip2.id,
      });

      // Act: Process queue
      const workerId = 'test-worker-1';
      const stats = await processMatchmakingQueue(workerId);

      // Assert: Both matched
      expect(stats.processed).toBe(2);
      expect(stats.matched).toBe(2);
      expect(stats.errors).toBe(0);

      // Assert: Queue entries updated
      const entry1 = await db.matchmakingQueue.findFirst({
        where: { userId: user1.id },
      });
      const entry2 = await db.matchmakingQueue.findFirst({
        where: { userId: user2.id },
      });

      expect(entry1?.status).toBe(QueueStatus.MATCHED);
      expect(entry2?.status).toBe(QueueStatus.MATCHED);
      expect(entry1?.matchId).toBeDefined();
      expect(entry1?.matchId).toBe(entry2?.matchId);

      // Assert: Match created
      const match = await db.match.findUnique({
        where: { id: entry1!.matchId! },
      });
      expect(match).toBeDefined();
      expect(match?.status).toBe(MatchStatus.matched);
      expect(match?.creatorId).toBe(user1.id);
      expect(match?.opponentId).toBe(user2.id);
      expect(match?.stakeAmount).toBe(BigInt(1000));

      // Assert: Slips updated to ACTIVE
      const updatedSlip1 = await db.slip.findUnique({ where: { id: slip1.id } });
      const updatedSlip2 = await db.slip.findUnique({ where: { id: slip2.id } });

      expect(updatedSlip1?.status).toBe(SlipStatus.ACTIVE);
      expect(updatedSlip2?.status).toBe(SlipStatus.ACTIVE);
      expect(updatedSlip1?.matchId).toBe(match?.id);
      expect(updatedSlip2?.matchId).toBe(match?.id);
    });

    it('should NOT match users with different slip sizes', async () => {
      // Arrange: Two users with different slip sizes
      const user1 = await createTestUserWithBalance(db, BigInt(10000));
      const user2 = await createTestUserWithBalance(db, BigInt(10000));

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3); // 3 picks
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 5); // 5 picks

      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip2.id,
      });

      // Act
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: No matches
      expect(stats.matched).toBe(0);

      // Assert: Both still WAITING
      const entry1 = await db.matchmakingQueue.findFirst({ where: { userId: user1.id } });
      const entry2 = await db.matchmakingQueue.findFirst({ where: { userId: user2.id } });

      expect(entry1?.status).toBe(QueueStatus.WAITING);
      expect(entry2?.status).toBe(QueueStatus.WAITING);
    });

    it('should NOT match users with different stakes', async () => {
      // Arrange: Two users with different stakes
      const user1 = await createTestUserWithBalance(db, BigInt(10000));
      const user2 = await createTestUserWithBalance(db, BigInt(10000));

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);

      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(2000), // Different stake
        slipId: slip2.id,
      });

      // Act
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: No matches
      expect(stats.matched).toBe(0);

      const entry1 = await db.matchmakingQueue.findFirst({ where: { userId: user1.id } });
      const entry2 = await db.matchmakingQueue.findFirst({ where: { userId: user2.id } });

      expect(entry1?.status).toBe(QueueStatus.WAITING);
      expect(entry2?.status).toBe(QueueStatus.WAITING);
    });

    it('should NOT match users with different tiers', async () => {
      // Arrange: Two users with different tiers
      const user1 = await createTestUserWithBalance(db, BigInt(10000));
      const user2 = await createTestUserWithBalance(db, BigInt(10000));

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);

      // Create queue entries with different tiers
      await createTestQueueEntry(db, {
        userId: user1.id,
        slipId: slip1.id,
        tier: PickTier.FREE,
        stakeAmount: BigInt(1000),
        slipSize: 3,
        status: QueueStatus.WAITING,
      });

      await createTestQueueEntry(db, {
        userId: user2.id,
        slipId: slip2.id,
        tier: PickTier.PREMIUM, // Different tier
        stakeAmount: BigInt(1000),
        slipSize: 3,
        status: QueueStatus.WAITING,
      });

      // Act
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: No matches (different pools)
      expect(stats.matched).toBe(0);
    });

    it('should NOT match users with MMR too far apart', async () => {
      // Arrange: Users with large MMR difference
      const user1 = await createTestUserWithBalance(db, BigInt(10000), BigInt(0), {
        skillRating: 1000,
      });
      const user2 = await createTestUserWithBalance(db, BigInt(10000), BigInt(0), {
        skillRating: 1500, // 500 point difference (exceeds max range of 400)
      });

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);

      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip2.id,
      });

      // Act: Process immediately (no time for MMR range expansion)
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: No matches (MMR too far)
      expect(stats.matched).toBe(0);
    });
  });

  // ===========================================
  // Test 5: Expiry and Refund
  // ===========================================

  describe('processMatchmakingQueue - Expiry', () => {
    it('should expire old queue entries and refund wallet', async () => {
      // Arrange: User with expired queue entry
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      // Create queue entry that already expired
      const expiredAt = new Date(Date.now() - 60000); // 1 minute ago
      await createTestQueueEntry(db, {
        userId: user.id,
        slipId: slip.id,
        stakeAmount: BigInt(1000),
        slipSize: 3,
        status: QueueStatus.WAITING,
        expiresAt: expiredAt,
        entryTxId: 'test-tx-expired',
      });

      // Manually debit wallet to simulate entry fee
      await db.wallet.update({
        where: { userId: user.id },
        data: { paidBalance: BigInt(9000) }, // 10000 - 1000
      });

      // Manually lock slip
      await db.slip.update({
        where: { id: slip.id },
        data: { status: SlipStatus.PENDING, lockedAt: new Date() },
      });

      // Create entry transaction
      const entryTx = await db.transaction.create({
        data: {
          id: 'test-tx-expired',
          walletId: (await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).id,
          userId: user.id,
          type: 'MATCH_ENTRY',
          status: 'completed',
          amount: BigInt(1000),
          paidAmount: BigInt(1000),
          bonusAmount: BigInt(0),
          balanceBefore: BigInt(10000),
          balanceAfter: BigInt(9000),
        },
      });

      // Act: Process queue (should expire entry)
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: Entry expired
      expect(stats.expired).toBe(1);

      const expiredEntry = await db.matchmakingQueue.findFirst({
        where: { userId: user.id },
      });
      expect(expiredEntry?.status).toBe(QueueStatus.EXPIRED);

      // Assert: Wallet refunded
      const wallet = await db.wallet.findUnique({
        where: { userId: user.id },
      });
      expect(wallet?.paidBalance).toBe(BigInt(10000)); // Refunded back to original

      // Assert: Slip unlocked
      const updatedSlip = await db.slip.findUnique({
        where: { id: slip.id },
      });
      expect(updatedSlip?.status).toBe(SlipStatus.DRAFT);
      expect(updatedSlip?.lockedAt).toBeNull();

      // Assert: Refund transaction created
      const refundTx = await db.transaction.findFirst({
        where: {
          userId: user.id,
          type: 'MATCH_REFUND',
        },
      });
      expect(refundTx).toBeDefined();
      expect(refundTx?.amount).toBe(BigInt(1000));
    });
  });

  // ===========================================
  // Test 6: Concurrency Safety (Optimistic Locking)
  // ===========================================

  describe('Concurrency Safety', () => {
    it('should prevent duplicate matches via version field', async () => {
      // Arrange: Two users in queue
      const user1 = await createTestUserWithBalance(db, BigInt(10000));
      const user2 = await createTestUserWithBalance(db, BigInt(10000));

      const slip1 = await createTestSlipWithMoneylinePicks(db, user1.id, 3);
      const slip2 = await createTestSlipWithMoneylinePicks(db, user2.id, 3);

      await enqueueForMatchmaking({
        userId: user1.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip1.id,
      });

      await enqueueForMatchmaking({
        userId: user2.id,
        gameMode: 'QUICK_MATCH',
        stakeAmount: BigInt(1000),
        slipId: slip2.id,
      });

      // Act: Process queue twice concurrently (simulate race condition)
      const [stats1, stats2] = await Promise.all([
        processMatchmakingQueue('worker-1'),
        processMatchmakingQueue('worker-2'),
      ]);

      // Assert: Only one worker should succeed in matching
      const totalMatched = stats1.matched + stats2.matched;
      expect(totalMatched).toBe(2); // Exactly one match created (2 users matched)

      // Assert: No duplicate matches created
      const matchCount = await db.match.count();
      expect(matchCount).toBe(1); // Only one match
    });

    it('should handle claim expiry correctly', async () => {
      // Arrange: User in queue with expired claim
      const user = await createTestUserWithBalance(db, BigInt(10000));
      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      // Create entry with expired claim
      const expiredClaimTime = new Date(Date.now() - 60000); // 1 minute ago
      await createTestQueueEntry(db, {
        userId: user.id,
        slipId: slip.id,
        stakeAmount: BigInt(1000),
        slipSize: 3,
        status: QueueStatus.WAITING,
        claimExpiresAt: expiredClaimTime,
        lockedBy: 'old-worker',
      });

      // Act: New worker should be able to claim expired entry
      const stats = await processMatchmakingQueue('new-worker');

      // Assert: Entry processed by new worker
      expect(stats.processed).toBeGreaterThan(0);

      const entry = await db.matchmakingQueue.findFirst({
        where: { userId: user.id },
      });

      // Entry should be re-claimable (claim expired, so it can be picked up)
      expect(entry).toBeDefined();
    });
  });

  // ===========================================
  // Test 7: Compatibility Scoring (Pure Functions)
  // ===========================================

  describe('Compatibility Scoring', () => {
    it('should score compatible entries highly', () => {
      // Arrange: Two compatible entries
      const entry1 = {
        id: 'entry1',
        userId: 'user1',
        gameMode: 'QUICK_MATCH' as GameMode,
        tier: PickTier.FREE,
        stakeAmount: BigInt(1000),
        skillRating: 1000,
        slipId: 'slip1',
        slipSize: 3,
        enqueuedAt: new Date(),
        version: 1,
        user: {
          id: 'user1',
          username: 'user1',
          skillRating: 1000,
        },
      };

      const entry2 = {
        ...entry1,
        id: 'entry2',
        userId: 'user2',
        skillRating: 1020,
        user: {
          id: 'user2',
          username: 'user2',
          skillRating: 1020,
        },
      };

      const recentMatchesMap = new Map<string, Set<string>>();

      // Act
      const score = calculateCompatibilityScore(entry1, entry2, recentMatchesMap);

      // Assert
      expect(score.isCompatible).toBe(true);
      expect(score.score).toBeGreaterThan(3000); // High score (slip + stake + tier + MMR + no rematch)
    });

    it('should reject incompatible slip sizes', () => {
      const entry1 = {
        id: 'entry1',
        userId: 'user1',
        gameMode: 'QUICK_MATCH' as GameMode,
        tier: PickTier.FREE,
        stakeAmount: BigInt(1000),
        skillRating: 1000,
        slipId: 'slip1',
        slipSize: 3,
        enqueuedAt: new Date(),
        version: 1,
        user: { id: 'user1', username: 'user1', skillRating: 1000 },
      };

      const entry2 = {
        ...entry1,
        id: 'entry2',
        userId: 'user2',
        slipSize: 5, // Different!
        user: { id: 'user2', username: 'user2', skillRating: 1000 },
      };

      const score = calculateCompatibilityScore(entry1, entry2, new Map());

      expect(score.isCompatible).toBe(false);
      expect(score.reasons).toContain('Slip size mismatch');
    });

    it('should reject rematch within 24h', () => {
      const entry1 = {
        id: 'entry1',
        userId: 'user1',
        gameMode: 'QUICK_MATCH' as GameMode,
        tier: PickTier.FREE,
        stakeAmount: BigInt(1000),
        skillRating: 1000,
        slipId: 'slip1',
        slipSize: 3,
        enqueuedAt: new Date(),
        version: 1,
        user: { id: 'user1', username: 'user1', skillRating: 1000 },
      };

      const entry2 = {
        ...entry1,
        id: 'entry2',
        userId: 'user2',
        user: { id: 'user2', username: 'user2', skillRating: 1000 },
      };

      // Recent match between these users
      const recentMatchesMap = new Map<string, Set<string>>();
      recentMatchesMap.set('user1', new Set(['user2']));
      recentMatchesMap.set('user2', new Set(['user1']));

      const score = calculateCompatibilityScore(entry1, entry2, recentMatchesMap);

      expect(score.isCompatible).toBe(false);
      expect(score.reasons[0]).toMatch(/rematch/i);
    });

    it('should find best opponent from candidates', () => {
      const entry = {
        id: 'entry1',
        userId: 'user1',
        gameMode: 'QUICK_MATCH' as GameMode,
        tier: PickTier.FREE,
        stakeAmount: BigInt(1000),
        skillRating: 1000,
        slipId: 'slip1',
        slipSize: 3,
        enqueuedAt: new Date(),
        version: 1,
        user: { id: 'user1', username: 'user1', skillRating: 1000 },
      };

      // Three candidates with varying compatibility
      const candidate1 = {
        ...entry,
        id: 'entry2',
        userId: 'user2',
        skillRating: 1100, // Further away
        user: { id: 'user2', username: 'user2', skillRating: 1100 },
      };

      const candidate2 = {
        ...entry,
        id: 'entry3',
        userId: 'user3',
        skillRating: 1010, // Closer match!
        user: { id: 'user3', username: 'user3', skillRating: 1010 },
      };

      const candidate3 = {
        ...entry,
        id: 'entry4',
        userId: 'user4',
        skillRating: 1050,
        user: { id: 'user4', username: 'user4', skillRating: 1050 },
      };

      const bestMatch = findBestOpponent(
        entry,
        [candidate1, candidate2, candidate3],
        new Map()
      );

      // Should pick candidate2 (closest MMR)
      expect(bestMatch).toBeDefined();
      expect(bestMatch?.entry.userId).toBe('user3');
      expect(bestMatch?.score).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // Test 8: Multiple Matches in One Processing Cycle
  // ===========================================

  describe('Batch Processing', () => {
    it('should create multiple matches in one cycle', async () => {
      // Arrange: 4 users (2 pairs)
      const users = await Promise.all([
        createTestUserWithBalance(db, BigInt(10000)),
        createTestUserWithBalance(db, BigInt(10000)),
        createTestUserWithBalance(db, BigInt(10000)),
        createTestUserWithBalance(db, BigInt(10000)),
      ]);

      const slips = await Promise.all(
        users.map((user) => createTestSlipWithMoneylinePicks(db, user.id, 3))
      );

      // Enqueue all
      for (let i = 0; i < users.length; i++) {
        await enqueueForMatchmaking({
          userId: users[i].id,
          gameMode: 'QUICK_MATCH',
          stakeAmount: BigInt(1000),
          slipId: slips[i].id,
        });
      }

      // Act: Process once
      const stats = await processMatchmakingQueue('test-worker');

      // Assert: All matched (4 users = 2 matches)
      expect(stats.processed).toBe(4);
      expect(stats.matched).toBe(4);

      const matchCount = await db.match.count();
      expect(matchCount).toBe(2); // Two matches created
    });
  });
});
