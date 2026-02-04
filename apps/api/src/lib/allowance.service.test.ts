// =====================================================
// Allowance Service Test Suite
// =====================================================
// Comprehensive tests for weekly allowance eligibility and crediting.
// Tests cover eligibility calculations, atomic operations, retry logic,
// optimistic locking, idempotency, and all edge cases.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateEligibility,
  checkAllowanceEligibility,
  creditAllowance,
  formatTimeUntilNextAllowance,
} from './allowance.service';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';

// ===========================================
// Mock Setup
// ===========================================

// Create shared mock functions that will be accessible throughout the test file
const mockFunctions = {
  walletFindUnique: vi.fn(),
  walletUpdateMany: vi.fn(),
  transactionFindUnique: vi.fn(),
  transactionCreate: vi.fn(),
};

// Mock the prisma module BEFORE imports
vi.mock('./prisma', () => ({
  prisma: {
    wallet: {
      get findUnique() {
        return mockFunctions.walletFindUnique;
      },
    },
    $transaction: async (callback: any) => {
      // Create a mock transaction client for the callback
      const mockTx = {
        wallet: {
          get findUnique() {
            return mockFunctions.walletFindUnique;
          },
          get updateMany() {
            return mockFunctions.walletUpdateMany;
          },
        },
        transaction: {
          get findUnique() {
            return mockFunctions.transactionFindUnique;
          },
          get create() {
            return mockFunctions.transactionCreate;
          },
        },
      };
      // Actually call the callback and return its result
      return await callback(mockTx);
    },
  },
}));

// Mock logger to silence output
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('../config', () => ({
  config: {
    wallet: {
      weeklyAllowanceAmount: 1000,
      weeklyAllowanceDays: 7,
    },
  },
}));

// Import logger after mocking to verify calls
import { logger } from '../utils/logger';

// Extract individual mock functions for convenience
const mockWalletFindUnique = mockFunctions.walletFindUnique;
const mockWalletUpdateMany = mockFunctions.walletUpdateMany;
const mockTransactionFindUnique = mockFunctions.transactionFindUnique;
const mockTransactionCreate = mockFunctions.transactionCreate;

// ===========================================
// Test Helpers
// ===========================================

function createMockWallet(overrides = {}) {
  return {
    id: 'wallet-123',
    userId: 'user-123',
    paidBalance: BigInt(5000),
    bonusBalance: BigInt(2000),
    lastAllowanceAt: null,
    version: 1,
    ...overrides,
  };
}

function createMockTransaction(overrides = {}) {
  return {
    id: 'tx-123',
    walletId: 'wallet-123',
    userId: 'user-123',
    type: 'WEEKLY_ALLOWANCE',
    status: 'completed',
    amount: BigInt(1000),
    paidAmount: BigInt(0),
    bonusAmount: BigInt(1000),
    balanceBefore: BigInt(7000),
    balanceAfter: BigInt(8000),
    matchId: null,
    idempotencyKey: null,
    description: null,
    metadata: {},
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    completedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ===========================================
// Test Setup
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ===========================================
// Test: calculateEligibility() - Pure Function
// ===========================================

describe('calculateEligibility', () => {
  it('returns eligible for first-time user (null lastAllowanceAt)', () => {
    const result = calculateEligibility(null);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('First-time allowance available');
    expect(result.lastClaimedAt).toBeNull();
    expect(result.daysUntilAvailable).toBe(0);
    expect(result.hoursUntilAvailable).toBe(0);
    expect(result.nextAvailableAt).toBeInstanceOf(Date);
  });

  it('returns not eligible when cooldown active (3 days ago)', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(threeDaysAgo);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Next allowance available in');
    expect(result.reason).toContain('day');
    expect(result.lastClaimedAt).toEqual(threeDaysAgo);
    expect(result.daysUntilAvailable).toBe(4); // 7 - 3 = 4 days remaining
    expect(result.hoursUntilAvailable).toBeGreaterThan(90); // Roughly 4 days = 96 hours
    expect(result.hoursUntilAvailable).toBeLessThanOrEqual(96);
    expect(result.nextAvailableAt).toBeInstanceOf(Date);
  });

  it('returns eligible when cooldown expired exactly (7 days ago)', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(sevenDaysAgo);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('Weekly allowance available');
    expect(result.lastClaimedAt).toEqual(sevenDaysAgo);
    expect(result.daysUntilAvailable).toBe(0);
    expect(result.hoursUntilAvailable).toBe(0);
  });

  it('returns eligible when cooldown long expired (30 days ago)', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(thirtyDaysAgo);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('Weekly allowance available');
    expect(result.lastClaimedAt).toEqual(thirtyDaysAgo);
    expect(result.daysUntilAvailable).toBe(0);
    expect(result.hoursUntilAvailable).toBe(0);
  });

  it('returns not eligible when cooldown active (1 day ago)', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(oneDayAgo);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('6 days'); // 7 - 1 = 6 days remaining
    expect(result.daysUntilAvailable).toBe(6);
    expect(result.hoursUntilAvailable).toBeGreaterThan(140); // Roughly 6 days = 144 hours
    expect(result.hoursUntilAvailable).toBeLessThanOrEqual(144);
  });

  it('returns not eligible when cooldown active (6.5 days ago)', () => {
    const sixAndHalfDaysAgo = new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(sixAndHalfDaysAgo);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('1 day'); // Should show singular 'day'
    expect(result.daysUntilAvailable).toBe(1);
    expect(result.hoursUntilAvailable).toBeGreaterThan(10);
    expect(result.hoursUntilAvailable).toBeLessThanOrEqual(13);
  });

  it('handles recent claim (claimed just now)', () => {
    const now = new Date();
    const result = calculateEligibility(now);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('7 days');
    expect(result.daysUntilAvailable).toBe(7);
    expect(result.hoursUntilAvailable).toBe(168); // 7 * 24 = 168
  });

  it('calculates nextAvailableAt correctly for cooldown period', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = calculateEligibility(threeDaysAgo);

    const expectedNextAvailable = new Date(threeDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000);

    expect(result.nextAvailableAt).toBeInstanceOf(Date);
    expect(result.nextAvailableAt?.getTime()).toBeCloseTo(expectedNextAvailable.getTime(), -2);
  });
});

// ===========================================
// Test: checkAllowanceEligibility()
// ===========================================

describe('checkAllowanceEligibility', () => {
  it('returns eligible for first-time user with current balance', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(5000),
      bonusBalance: BigInt(2000),
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.eligible).toBe(true);
    expect(result.eligibility.eligible).toBe(true);
    expect(result.eligibility.reason).toBe('First-time allowance available');
    expect(result.currentBalance).toBe(7000); // 5000 + 2000
    expect(mockWalletFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: {
        paidBalance: true,
        bonusBalance: true,
        lastAllowanceAt: true,
      },
    });
  });

  it('returns not eligible when cooldown active (recent claim)', async () => {
    const justNow = new Date();
    const mockWallet = createMockWallet({
      lastAllowanceAt: justNow,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.eligible).toBe(false);
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.daysUntilAvailable).toBe(7);
    expect(result.eligibility.reason).toContain('7 days');
  });

  it('returns eligible when cooldown expired (8 days ago)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const mockWallet = createMockWallet({
      lastAllowanceAt: eightDaysAgo,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.eligible).toBe(true);
    expect(result.eligibility.eligible).toBe(true);
    expect(result.eligibility.reason).toBe('Weekly allowance available');
  });

  it('throws NotFoundError when wallet not found', async () => {
    mockWalletFindUnique.mockResolvedValue(null);

    await expect(
      checkAllowanceEligibility('nonexistent-user')
    ).rejects.toThrow(NotFoundError);

    await expect(
      checkAllowanceEligibility('nonexistent-user')
    ).rejects.toThrow('Wallet not found');
  });

  it('calculates balance correctly with only paidBalance', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      bonusBalance: BigInt(0),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.currentBalance).toBe(10000);
  });

  it('calculates balance correctly with only bonusBalance', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(0),
      bonusBalance: BigInt(3500),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.currentBalance).toBe(3500);
  });

  it('calculates balance correctly with both balances', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(12345),
      bonusBalance: BigInt(6789),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await checkAllowanceEligibility('user-123');

    expect(result.currentBalance).toBe(19134); // 12345 + 6789
  });
});

// ===========================================
// Test: creditAllowance() - Happy Paths
// ===========================================

describe('creditAllowance - happy paths', () => {
  it('successfully credits first-time user (null lastAllowanceAt)', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(5000),
      bonusBalance: BigInt(2000),
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null); // No existing transaction
    mockWalletUpdateMany.mockResolvedValue({ count: 1 }); // Successful update

    const mockTx = createMockTransaction({
      id: 'tx-allowance',
      amount: BigInt(1000),
      bonusAmount: BigInt(1000),
      balanceBefore: BigInt(7000),
      balanceAfter: BigInt(8000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(true);
    expect(result.amount).toBe(1000);
    expect(result.newBalance).toBe(8000);
    expect(result.transactionId).toBe('tx-allowance');
    expect(result.eligibility.eligible).toBe(false); // No longer eligible after claim
    expect(result.eligibility.reason).toBe('Allowance claimed successfully');
    expect(result.nextClaimAt).toBeInstanceOf(Date);

    // Verify wallet update
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'wallet-123',
          version: 1,
        },
        data: expect.objectContaining({
          bonusBalance: BigInt(3000), // 2000 + 1000
          lastAllowanceAt: expect.any(Date),
          version: { increment: 1 },
        }),
      })
    );

    // Verify transaction creation
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: 'wallet-123',
          userId: 'user-123',
          type: 'WEEKLY_ALLOWANCE',
          status: 'completed',
          amount: BigInt(1000),
          bonusAmount: BigInt(1000),
          paidAmount: BigInt(0),
        }),
      })
    );

    // Verify logging
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Allowance credited')
    );
  });

  it('successfully credits user after cooldown expired (8 days ago)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const mockWallet = createMockWallet({
      lastAllowanceAt: eightDaysAgo,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(true);
    expect(result.amount).toBe(1000);
    expect(result.transactionId).toBeDefined();
  });

  it('credits to bonusBalance, not paidBalance', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      bonusBalance: BigInt(5000),
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonusBalance: BigInt(6000), // 5000 + 1000
          // paidBalance not modified
        }),
      })
    );
  });

  it('creates transaction with correct metadata', async () => {
    const mockWallet = createMockWallet({
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      metadata: {
        weekNumber: 5,
        year: 2026,
        cooldownDays: 7,
      },
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            weekNumber: expect.any(Number),
            year: expect.any(Number),
            cooldownDays: 7,
          }),
        }),
      })
    );
  });

  it('sets completedAt timestamp', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: expect.any(Date),
        }),
      })
    );
  });
});

// ===========================================
// Test: creditAllowance() - Not Eligible
// ===========================================

describe('creditAllowance - not eligible', () => {
  it('returns not credited when cooldown active (claimed 3 days ago)', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const mockWallet = createMockWallet({
      lastAllowanceAt: threeDaysAgo,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(false);
    expect(result.amount).toBe(0);
    expect(result.transactionId).toBeNull();
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reason).toContain('4 days'); // 7 - 3 = 4
    expect(result.eligibility.daysUntilAvailable).toBe(4);

    // No wallet or transaction modifications
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it('returns current balance when not eligible', async () => {
    const justNow = new Date();
    const mockWallet = createMockWallet({
      paidBalance: BigInt(8000),
      bonusBalance: BigInt(3000),
      lastAllowanceAt: justNow,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(false);
    expect(result.newBalance).toBe(11000); // 8000 + 3000
  });

  it('includes nextClaimAt in response when not eligible', async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const mockWallet = createMockWallet({
      lastAllowanceAt: oneDayAgo,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', false);

    expect(result.nextClaimAt).toBeInstanceOf(Date);
    expect(result.nextClaimAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ===========================================
// Test: creditAllowance() - Dry Run Mode
// ===========================================

describe('creditAllowance - dry run mode', () => {
  it('returns amount without modifying database when dryRun=true', async () => {
    const mockWallet = createMockWallet({
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', true);

    expect(result.credited).toBe(false);
    expect(result.amount).toBe(1000);
    expect(result.newBalance).toBe(7000); // Current balance unchanged
    expect(result.transactionId).toBeNull();
    expect(result.eligibility.reason).toContain('DRY RUN');

    // Verify no modifications
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it('dry run checks eligibility before returning', async () => {
    const justNow = new Date();
    const mockWallet = createMockWallet({
      lastAllowanceAt: justNow,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', true);

    expect(result.credited).toBe(false);
    expect(result.amount).toBe(0); // Not eligible, so amount is 0
    expect(result.eligibility.eligible).toBe(false);
  });

  it('dry run for eligible user shows would-be credit amount', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const mockWallet = createMockWallet({
      paidBalance: BigInt(2000),
      bonusBalance: BigInt(1500),
      lastAllowanceAt: eightDaysAgo,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);

    const result = await creditAllowance('user-123', true);

    expect(result.credited).toBe(false);
    expect(result.amount).toBe(1000);
    expect(result.newBalance).toBe(3500); // Current balance, not modified
    expect(result.eligibility.reason).toContain('DRY RUN');
  });
});

// ===========================================
// Test: creditAllowance() - Idempotency
// ===========================================

describe('creditAllowance - idempotency', () => {
  it('returns existing transaction when already claimed this week', async () => {
    const mockWallet = createMockWallet({
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const existingTx = createMockTransaction({
      id: 'tx-existing',
      idempotencyKey: 'allowance-user-123-2026-W5',
    });
    mockTransactionFindUnique.mockResolvedValue(existingTx);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(false);
    expect(result.amount).toBe(0);
    expect(result.transactionId).toBe('tx-existing');
    expect(result.eligibility.eligible).toBe(false);
    expect(result.eligibility.reason).toBe('Allowance already claimed for this week');

    // No modifications
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();

    // Verify logging
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate allowance claim detected')
    );
  });

  it('generates idempotency key based on user and week', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^allowance-user-123-\d{4}-W\d+$/),
        }),
      })
    );
  });

  it('includes year and week number in idempotency key', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    const createCall = mockTransactionCreate.mock.calls[0][0];
    const idempotencyKey = createCall.data.idempotencyKey;

    expect(idempotencyKey).toMatch(/^allowance-user-123-2026-W\d+$/);
  });
});

// ===========================================
// Test: creditAllowance() - Retry Logic
// ===========================================

describe('creditAllowance - retry logic', () => {
  it('retries on optimistic lock conflict and succeeds on second attempt', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });

    // First attempt: conflict, second attempt: success
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // First attempt fails
      .mockResolvedValueOnce({ count: 1 }); // Second attempt succeeds

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(true);
    expect(mockWalletUpdateMany).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Allowance credit conflict')
    );
  });

  it('retries on conflict and succeeds on third attempt', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });

    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // First fails
      .mockResolvedValueOnce({ count: 0 }) // Second fails
      .mockResolvedValueOnce({ count: 1 }); // Third succeeds

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditAllowance('user-123', false);

    expect(result.credited).toBe(true);
    expect(mockWalletUpdateMany).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('throws ConflictError after max retry attempts exceeded', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });

    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 0 }); // Always fails

    // On the third attempt, it throws the original ConflictError from attemptCreditAllowance
    // because attempts < MAX_RETRY_ATTEMPTS is false
    let error: Error | undefined;
    try {
      await creditAllowance('user-123', false);
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toBe('Wallet was modified by another operation. Please retry.');
    expect(mockWalletUpdateMany).toHaveBeenCalledTimes(3); // MAX_RETRY_ATTEMPTS = 3
    expect(logger.warn).toHaveBeenCalledTimes(2); // Logs on attempts 1 and 2
  });

  it('does not retry on non-ConflictError exceptions', async () => {
    mockWalletFindUnique.mockRejectedValue(new Error('Database connection failed'));

    await expect(
      creditAllowance('user-123', false)
    ).rejects.toThrow('Database connection failed');

    // Should fail immediately, no retries
    expect(mockWalletFindUnique).toHaveBeenCalledTimes(1);
  });

  it('retry includes exponential backoff delay', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });

    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const startTime = Date.now();
    await creditAllowance('user-123', false);
    const endTime = Date.now();

    // Should have at least 50ms delay (50 * 1 attempt)
    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });
});

// ===========================================
// Test: creditAllowance() - Edge Cases
// ===========================================

describe('creditAllowance - edge cases', () => {
  it('throws NotFoundError when wallet not found', async () => {
    mockWalletFindUnique.mockResolvedValue(null);
    mockTransactionFindUnique.mockResolvedValue(null);

    await expect(
      creditAllowance('nonexistent-user', false)
    ).rejects.toThrow(NotFoundError);

    await expect(
      creditAllowance('nonexistent-user', false)
    ).rejects.toThrow('Wallet not found');
  });

  it('increments wallet version on successful credit', async () => {
    const mockWallet = createMockWallet({
      version: 5,
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'wallet-123',
          version: 5, // Uses current version for optimistic lock
        },
        data: expect.objectContaining({
          version: { increment: 1 }, // Increments version
        }),
      })
    );
  });

  it('calculates balanceBefore and balanceAfter correctly', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(12000),
      bonusBalance: BigInt(8000),
      lastAllowanceAt: null,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          balanceBefore: BigInt(20000), // 12000 + 8000
          balanceAfter: BigInt(21000),  // 12000 + 9000
        }),
      })
    );
  });

  it('updates lastAllowanceAt to current timestamp', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const beforeTime = Date.now();
    await creditAllowance('user-123', false);
    const afterTime = Date.now();

    const updateCall = mockWalletUpdateMany.mock.calls[0][0];
    const lastAllowanceAt = updateCall.data.lastAllowanceAt;

    expect(lastAllowanceAt).toBeInstanceOf(Date);
    expect(lastAllowanceAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
    expect(lastAllowanceAt.getTime()).toBeLessThanOrEqual(afterTime);
  });

  it('sets nextClaimAt to 7 days from now on successful credit', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditAllowance('user-123', false);

    const expectedNextClaim = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(result.nextClaimAt.getTime()).toBeCloseTo(expectedNextClaim, -2);
  });

  it('creates transaction with description containing week info', async () => {
    const mockWallet = createMockWallet({ lastAllowanceAt: null });
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction();
    mockTransactionCreate.mockResolvedValue(mockTx);

    await creditAllowance('user-123', false);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: expect.stringMatching(/^Weekly allowance - Week \d+ of \d{4}$/),
        }),
      })
    );
  });
});

// ===========================================
// Test: formatTimeUntilNextAllowance()
// ===========================================

describe('formatTimeUntilNextAllowance', () => {
  it('returns "Available now" when eligible', () => {
    const eligibility = calculateEligibility(null);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toBe('Available now');
  });

  it('returns days when more than 1 day remaining', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const eligibility = calculateEligibility(threeDaysAgo);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toBe('4 days');
  });

  it('returns hours when 1 day or less remaining', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const eligibility = calculateEligibility(sixDaysAgo);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toMatch(/^\d+ hours$/);
  });

  it('returns "Less than an hour" when very close to expiry', () => {
    const almostSevenDaysAgo = new Date(Date.now() - 6.99 * 24 * 60 * 60 * 1000);
    const eligibility = calculateEligibility(almostSevenDaysAgo);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toBe('Less than an hour');
  });

  it('returns singular "day" for exactly 2 days remaining', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const eligibility = calculateEligibility(fiveDaysAgo);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toBe('2 days');
  });

  it('handles edge case: exactly 7 days remaining (just claimed)', () => {
    const justNow = new Date();
    const eligibility = calculateEligibility(justNow);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toBe('7 days');
  });

  it('handles edge case: exactly 24 hours remaining', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const eligibility = calculateEligibility(sixDaysAgo);
    const result = formatTimeUntilNextAllowance(eligibility);

    expect(result).toMatch(/^24 hours$/);
  });
});
