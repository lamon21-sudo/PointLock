// =====================================================
// Example Test File
// =====================================================
// Demonstrates usage of test infrastructure.
// This file serves as documentation and can be deleted.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
  generateTestToken,
  authenticatedGet,
  disconnectTestRedis,
} from './helpers';
import {
  createTestUser,
  createTestUserWithBalance,
  createTestSlipWithMoneylinePicks,
} from './fixtures';

describe('Example Test Suite', () => {
  const db = getTestPrisma();

  beforeEach(async () => {
    // Clean database before each test for isolation
    await resetDatabase();
  });

  afterAll(async () => {
    // Cleanup connections to prevent leaks
    await disconnectTestPrisma();
    await disconnectTestRedis();
  });

  describe('User Fixture Examples', () => {
    it('should create test user with wallet', async () => {
      const user = await createTestUser(db, {
        email: 'test@example.com',
        username: 'testuser',
        skillRating: 1200,
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.username).toBe('testuser');
      expect(user.skillRating).toBe(1200);
      expect(user.wallet).toBeDefined();
      expect(user.wallet.paidBalance).toBe(BigInt(0));
    });

    it('should create user with balance', async () => {
      const user = await createTestUserWithBalance(
        db,
        BigInt(10000), // $100 paid balance
        BigInt(5000) // $50 bonus balance
      );

      expect(user.wallet.paidBalance).toBe(BigInt(10000));
      expect(user.wallet.bonusBalance).toBe(BigInt(5000));
    });
  });

  describe('Slip Fixture Examples', () => {
    it('should create slip with picks', async () => {
      const user = await createTestUser(db);

      const slip = await createTestSlipWithMoneylinePicks(db, user.id, 3);

      expect(slip.id).toBeDefined();
      expect(slip.picks).toHaveLength(3);
      expect(slip.picks[0].pickType).toBe('moneyline');
      expect(slip.picks[0].status).toBe('PENDING');
    });
  });

  describe('API Helper Examples', () => {
    it('should generate valid JWT token', () => {
      const token = generateTestToken('user-123', {
        email: 'test@example.com',
        username: 'testuser',
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should make authenticated request', async () => {
      // This is a demonstration - actual API tests would go in controller test files
      const user = await createTestUser(db);
      const token = generateTestToken(user.id);

      // Example: GET /api/v1/users/me
      // const response = await authenticatedGet('/api/v1/users/me', token);
      // expect(response.status).toBe(200);
    });
  });

  describe('Database Reset Examples', () => {
    it('should have clean database on first test', async () => {
      const users = await db.user.findMany();
      expect(users).toHaveLength(0);

      await createTestUser(db);
      const usersAfter = await db.user.findMany();
      expect(usersAfter).toHaveLength(1);
    });

    it('should have clean database on second test (reset worked)', async () => {
      // Database was reset by beforeEach
      const users = await db.user.findMany();
      expect(users).toHaveLength(0);
    });
  });

  describe('Type Safety Examples', () => {
    it('should have proper TypeScript types', async () => {
      const user = await createTestUser(db);

      // TypeScript knows user has these fields
      const email: string = user.email;
      const skillRating: number = user.skillRating;
      const wallet = user.wallet;
      const paidBalance: bigint = wallet.paidBalance;

      expect(email).toBeDefined();
      expect(skillRating).toBeDefined();
      expect(paidBalance).toBeDefined();
    });
  });
});
