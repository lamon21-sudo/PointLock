// =====================================================
// Wallet Service Test Suite
// =====================================================
// Comprehensive tests for wallet operations with strict financial compliance.
// Tests cover credit/debit operations, refunds, idempotency, optimistic locking,
// and all edge cases for financial transactions.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bigIntToNumber,
  numberToBigInt,
  getWalletByUserId,
  creditWallet,
  debitWallet,
  processRefund,
  getTransactionHistory,
  hasSufficientBalance,
} from './wallet.service';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  InsufficientBalanceError,
} from '../utils/errors';

// ===========================================
// Mock Setup
// ===========================================

// Create shared mock functions that will be accessible throughout the test file
const mockFunctions = {
  walletFindUnique: vi.fn(),
  walletUpdateMany: vi.fn(),
  transactionFindUnique: vi.fn(),
  transactionFindFirst: vi.fn(),
  transactionCreate: vi.fn(),
  transactionFindMany: vi.fn(),
};

// Mock the prisma module BEFORE imports
vi.mock('./prisma', () => ({
  prisma: {
    wallet: {
      get findUnique() {
        return mockFunctions.walletFindUnique;
      },
    },
    transaction: {
      get findUnique() {
        return mockFunctions.transactionFindUnique;
      },
      get findMany() {
        return mockFunctions.transactionFindMany;
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
          get findFirst() {
            return mockFunctions.transactionFindFirst;
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

// Import logger after mocking to verify calls
import { logger } from '../utils/logger';

// Extract individual mock functions for convenience
const mockWalletFindUnique = mockFunctions.walletFindUnique;
const mockWalletUpdateMany = mockFunctions.walletUpdateMany;
const mockTransactionFindUnique = mockFunctions.transactionFindUnique;
const mockTransactionFindFirst = mockFunctions.transactionFindFirst;
const mockTransactionCreate = mockFunctions.transactionCreate;
const mockTransactionFindMany = mockFunctions.transactionFindMany;

// ===========================================
// Test Helpers
// ===========================================

function createMockWallet(overrides = {}) {
  return {
    id: 'wallet-123',
    userId: 'user-123',
    paidBalance: BigInt(10000),
    bonusBalance: BigInt(5000),
    totalDeposited: BigInt(0),
    totalWon: BigInt(0),
    totalLost: BigInt(0),
    totalRakePaid: BigInt(0),
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
    type: 'DEPOSIT',
    status: 'completed',
    amount: BigInt(1000),
    paidAmount: BigInt(1000),
    bonusAmount: BigInt(0),
    balanceBefore: BigInt(0),
    balanceAfter: BigInt(1000),
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
// Test: bigIntToNumber() - Pure Function
// ===========================================

describe('bigIntToNumber', () => {
  it('converts normal positive BigInt to number', () => {
    const result = bigIntToNumber(BigInt(12345));
    expect(result).toBe(12345);
    expect(typeof result).toBe('number');
  });

  it('converts zero value', () => {
    const result = bigIntToNumber(BigInt(0));
    expect(result).toBe(0);
  });

  it('converts max safe integer', () => {
    const result = bigIntToNumber(BigInt(Number.MAX_SAFE_INTEGER));
    expect(result).toBe(9007199254740991);
  });

  it('throws BadRequestError on positive overflow', () => {
    const oversized = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    expect(() => bigIntToNumber(oversized)).toThrow(BadRequestError);
    expect(() => bigIntToNumber(oversized)).toThrow(
      'Value exceeds safe integer range for conversion'
    );
  });

  it('converts negative value within range', () => {
    const result = bigIntToNumber(BigInt(-1000));
    expect(result).toBe(-1000);
  });

  it('throws BadRequestError on negative overflow', () => {
    const oversized = BigInt(-Number.MAX_SAFE_INTEGER) - BigInt(1);
    expect(() => bigIntToNumber(oversized)).toThrow(BadRequestError);
    expect(() => bigIntToNumber(oversized)).toThrow(
      'Value exceeds safe integer range for conversion'
    );
  });
});

// ===========================================
// Test: numberToBigInt() - Pure Function
// ===========================================

describe('numberToBigInt', () => {
  it('converts normal positive integer to BigInt', () => {
    const result = numberToBigInt(5000);
    expect(result).toBe(BigInt(5000));
  });

  it('converts zero', () => {
    const result = numberToBigInt(0);
    expect(result).toBe(BigInt(0));
  });

  it('throws BadRequestError for negative number', () => {
    expect(() => numberToBigInt(-1000)).toThrow(BadRequestError);
    expect(() => numberToBigInt(-1000)).toThrow('Amount must be a non-negative integer');
  });

  it('throws BadRequestError for non-integer float', () => {
    expect(() => numberToBigInt(99.99)).toThrow(BadRequestError);
    expect(() => numberToBigInt(99.99)).toThrow('Amount must be a non-negative integer');
  });

  it('throws BadRequestError when exceeds MAX_TRANSACTION_AMOUNT', () => {
    const maxAmount = 10000000; // $100,000 in cents
    expect(() => numberToBigInt(maxAmount + 1)).toThrow(BadRequestError);
    expect(() => numberToBigInt(maxAmount + 1)).toThrow(
      `Amount exceeds maximum allowed: ${maxAmount}`
    );
  });

  it('allows MAX_TRANSACTION_AMOUNT exactly', () => {
    const maxAmount = 10000000;
    const result = numberToBigInt(maxAmount);
    expect(result).toBe(BigInt(maxAmount));
  });
});

// ===========================================
// Test: getWalletByUserId()
// ===========================================

describe('getWalletByUserId', () => {
  it('returns WalletBalance with converted numbers when wallet exists', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(15000),
      bonusBalance: BigInt(3000),
      version: 5,
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await getWalletByUserId('user-123');

    expect(result).toEqual({
      id: 'wallet-123',
      userId: 'user-123',
      paidBalance: 15000,
      bonusBalance: 3000,
      totalBalance: 18000,
      version: 5,
    });
    expect(mockWalletFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: {
        id: true,
        userId: true,
        paidBalance: true,
        bonusBalance: true,
        version: true,
      },
    });
  });

  it('returns null when wallet not found', async () => {
    mockWalletFindUnique.mockResolvedValue(null);

    const result = await getWalletByUserId('nonexistent-user');

    expect(result).toBeNull();
  });

  it('calculates totalBalance correctly', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(7500),
      bonusBalance: BigInt(2500),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await getWalletByUserId('user-123');

    expect(result?.totalBalance).toBe(10000);
  });

  it('includes version field in response', async () => {
    const mockWallet = createMockWallet({ version: 42 });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await getWalletByUserId('user-123');

    expect(result?.version).toBe(42);
  });
});

// ===========================================
// Test: creditWallet() - Happy Paths
// ===========================================

describe('creditWallet - happy paths', () => {
  it('DEPOSIT to paidBalance (useBonus=false), updates totalDeposited', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      totalDeposited: BigInt(50000),
    });
    mockTransactionFindUnique.mockResolvedValue(null); // No duplicate
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'DEPOSIT',
      amount: BigInt(2000),
      paidAmount: BigInt(2000),
      bonusAmount: BigInt(0),
      balanceBefore: BigInt(15000),
      balanceAfter: BigInt(17000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditWallet({
      userId: 'user-123',
      amount: BigInt(2000),
      type: 'DEPOSIT',
      useBonus: false,
      idempotencyKey: 'deposit-key-1',
    });

    expect(result.type).toBe('DEPOSIT');
    expect(result.amount).toBe(2000);
    expect(result.paidAmount).toBe(2000);
    expect(result.bonusAmount).toBe(0);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wallet-123', version: 1 },
        data: expect.objectContaining({
          paidBalance: BigInt(12000), // 10000 + 2000
          totalDeposited: BigInt(52000), // 50000 + 2000
        }),
      })
    );
  });

  it('BONUS to bonusBalance (useBonus=true)', async () => {
    const mockWallet = createMockWallet({
      bonusBalance: BigInt(3000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'BONUS',
      amount: BigInt(1000),
      paidAmount: BigInt(0),
      bonusAmount: BigInt(1000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditWallet({
      userId: 'user-123',
      amount: BigInt(1000),
      type: 'BONUS',
      useBonus: true,
    });

    expect(result.bonusAmount).toBe(1000);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonusBalance: BigInt(4000), // 3000 + 1000
        }),
      })
    );
  });

  it('MATCH_WIN with matchId, updates totalWon', async () => {
    const mockWallet = createMockWallet({
      totalWon: BigInt(25000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_WIN',
      amount: BigInt(5000),
      matchId: 'match-456',
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await creditWallet({
      userId: 'user-123',
      amount: BigInt(5000),
      type: 'MATCH_WIN',
      matchId: 'match-456',
      idempotencyKey: 'match-456-win',
    });

    expect(result.matchId).toBe('match-456');
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalWon: BigInt(30000), // 25000 + 5000
        }),
      })
    );
  });

  it('idempotent: duplicate idempotencyKey returns existing transaction without balance change', async () => {
    const existingTx = createMockTransaction({
      id: 'tx-existing',
      idempotencyKey: 'deposit-duplicate',
    });
    mockTransactionFindUnique.mockResolvedValue(existingTx);

    const result = await creditWallet({
      userId: 'user-123',
      amount: BigInt(1000),
      type: 'DEPOSIT',
      idempotencyKey: 'deposit-duplicate',
    });

    expect(result.id).toBe('tx-existing');
    expect(mockWalletFindUnique).not.toHaveBeenCalled();
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });
});

// ===========================================
// Test: creditWallet() - Validation Errors
// ===========================================

describe('creditWallet - validation errors', () => {
  it('throws BadRequestError for zero amount', async () => {
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(0),
        type: 'DEPOSIT',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(0),
        type: 'DEPOSIT',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow('Amount must be positive');
  });

  it('throws BadRequestError for negative amount', async () => {
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(-1000),
        type: 'DEPOSIT',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when exceeds MAX_TRANSACTION_AMOUNT', async () => {
    const maxAmount = BigInt(10000000);
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: maxAmount + BigInt(1),
        type: 'DEPOSIT',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: maxAmount + BigInt(1),
        type: 'DEPOSIT',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow('Amount exceeds maximum transaction limit');
  });

  it('throws BadRequestError for invalid type for credit (MATCH_ENTRY)', async () => {
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_ENTRY' as any,
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_ENTRY' as any,
      })
    ).rejects.toThrow("Invalid transaction type 'MATCH_ENTRY' for credit operation");
  });

  it('throws BadRequestError for missing idempotencyKey for DEPOSIT', async () => {
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'DEPOSIT',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'DEPOSIT',
      })
    ).rejects.toThrow('Idempotency key is required for DEPOSIT transactions');
  });

  it('throws BadRequestError for missing matchId for MATCH_WIN', async () => {
    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_WIN',
        idempotencyKey: 'win-key',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_WIN',
        idempotencyKey: 'win-key',
      })
    ).rejects.toThrow('Match ID is required for MATCH_WIN transactions');
  });

  it('throws BadRequestError when balance would exceed MAX_BALANCE', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(999999999), // Just under 1B
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(2), // Would exceed 1B
        type: 'BONUS',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(2),
        type: 'BONUS',
      })
    ).rejects.toThrow('Resulting balance would exceed maximum allowed');
  });
});

// ===========================================
// Test: creditWallet() - Edge Cases
// ===========================================

describe('creditWallet - edge cases', () => {
  it('throws NotFoundError when wallet not found', async () => {
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(null);

    await expect(
      creditWallet({
        userId: 'nonexistent-user',
        amount: BigInt(1000),
        type: 'BONUS',
      })
    ).rejects.toThrow(NotFoundError);

    await expect(
      creditWallet({
        userId: 'nonexistent-user',
        amount: BigInt(1000),
        type: 'BONUS',
      })
    ).rejects.toThrow('Wallet not found');
  });

  it('throws ConflictError on version mismatch (optimistic lock)', async () => {
    const mockWallet = createMockWallet({ version: 5 });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 0 }); // Version mismatch

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'BONUS',
      })
    ).rejects.toThrow(ConflictError);

    await expect(
      creditWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'BONUS',
      })
    ).rejects.toThrow('Wallet was modified by another transaction');
  });
});

// ===========================================
// Test: debitWallet() - Happy Paths
// ===========================================

describe('debitWallet - happy paths', () => {
  it('MATCH_ENTRY with preferBonus=true deducts from bonus first', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      bonusBalance: BigInt(5000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_ENTRY',
      amount: BigInt(-3000),
      paidAmount: BigInt(0),
      bonusAmount: BigInt(-3000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await debitWallet({
      userId: 'user-123',
      amount: BigInt(3000),
      type: 'MATCH_ENTRY',
      preferBonus: true,
      matchId: 'match-789',
      idempotencyKey: 'match-789-entry',
    });

    expect(result.bonusAmount).toBe(-3000);
    expect(result.paidAmount).toBe(0);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonusBalance: BigInt(2000), // 5000 - 3000
          paidBalance: BigInt(10000), // Unchanged
        }),
      })
    );
  });

  it('MATCH_ENTRY with preferBonus=false deducts from paid first', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      bonusBalance: BigInt(5000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_ENTRY',
      amount: BigInt(-3000),
      paidAmount: BigInt(-3000),
      bonusAmount: BigInt(0),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await debitWallet({
      userId: 'user-123',
      amount: BigInt(3000),
      type: 'MATCH_ENTRY',
      preferBonus: false,
      matchId: 'match-789',
      idempotencyKey: 'match-789-entry',
    });

    expect(result.paidAmount).toBe(-3000);
    expect(result.bonusAmount).toBe(0);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidBalance: BigInt(7000), // 10000 - 3000
          bonusBalance: BigInt(5000), // Unchanged
        }),
      })
    );
  });

  it('mixed deduction: when bonus insufficient, splits across both balances', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(10000),
      bonusBalance: BigInt(2000), // Not enough for full 5000 debit
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_ENTRY',
      amount: BigInt(-5000),
      paidAmount: BigInt(-3000),
      bonusAmount: BigInt(-2000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await debitWallet({
      userId: 'user-123',
      amount: BigInt(5000),
      type: 'MATCH_ENTRY',
      preferBonus: true,
      matchId: 'match-789',
      idempotencyKey: 'match-789-entry',
    });

    expect(result.bonusAmount).toBe(-2000); // All bonus used
    expect(result.paidAmount).toBe(-3000); // Remainder from paid
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonusBalance: BigInt(0), // 2000 - 2000
          paidBalance: BigInt(7000), // 10000 - 3000
        }),
      })
    );
  });

  it('RAKE_FEE updates totalRakePaid', async () => {
    const mockWallet = createMockWallet({
      totalRakePaid: BigInt(1000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'RAKE_FEE',
      amount: BigInt(-500),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    await debitWallet({
      userId: 'user-123',
      amount: BigInt(500),
      type: 'RAKE_FEE',
    });

    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalRakePaid: BigInt(1500), // 1000 + 500
        }),
      })
    );
  });

  it('MATCH_ENTRY updates totalLost', async () => {
    const mockWallet = createMockWallet({
      totalLost: BigInt(5000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_ENTRY',
      amount: BigInt(-1000),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    await debitWallet({
      userId: 'user-123',
      amount: BigInt(1000),
      type: 'MATCH_ENTRY',
      matchId: 'match-789',
      idempotencyKey: 'match-789-entry',
    });

    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalLost: BigInt(6000), // 5000 + 1000
        }),
      })
    );
  });

  it('idempotent: duplicate key returns existing transaction', async () => {
    const existingTx = createMockTransaction({
      id: 'tx-existing-debit',
      idempotencyKey: 'debit-duplicate',
    });
    mockTransactionFindUnique.mockResolvedValue(existingTx);

    const result = await debitWallet({
      userId: 'user-123',
      amount: BigInt(1000),
      type: 'MATCH_ENTRY',
      matchId: 'match-789',
      idempotencyKey: 'debit-duplicate',
    });

    expect(result.id).toBe('tx-existing-debit');
    expect(mockWalletFindUnique).not.toHaveBeenCalled();
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });
});

// ===========================================
// Test: debitWallet() - Validation Errors
// ===========================================

describe('debitWallet - validation errors', () => {
  it('throws InsufficientBalanceError when balance too low', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(500),
      bonusBalance: BigInt(300),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000), // Need 1000, have only 800
        type: 'MATCH_ENTRY',
        matchId: 'match-789',
        idempotencyKey: 'match-789-entry',
      })
    ).rejects.toThrow(InsufficientBalanceError);

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_ENTRY',
        matchId: 'match-789',
        idempotencyKey: 'match-789-entry',
      })
    ).rejects.toThrow('Insufficient balance: have 800, need 1000');
  });

  it('throws BadRequestError for zero amount', async () => {
    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(0),
        type: 'MATCH_ENTRY',
        matchId: 'match-789',
        idempotencyKey: 'match-789-entry',
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError for invalid type (DEPOSIT)', async () => {
    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'DEPOSIT' as any,
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'DEPOSIT' as any,
      })
    ).rejects.toThrow("Invalid transaction type 'DEPOSIT' for debit operation");
  });

  it('throws BadRequestError for missing matchId for MATCH_ENTRY', async () => {
    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_ENTRY',
        idempotencyKey: 'match-789-entry',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'MATCH_ENTRY',
        idempotencyKey: 'match-789-entry',
      })
    ).rejects.toThrow('Match ID is required for MATCH_ENTRY transactions');
  });
});

// ===========================================
// Test: debitWallet() - Edge Cases
// ===========================================

describe('debitWallet - edge cases', () => {
  it('exact balance debit (amount === totalBalance) succeeds with balance = 0', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(7000),
      bonusBalance: BigInt(3000),
    });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const mockTx = createMockTransaction({
      type: 'MATCH_ENTRY',
      amount: BigInt(-10000),
      balanceAfter: BigInt(0),
    });
    mockTransactionCreate.mockResolvedValue(mockTx);

    const result = await debitWallet({
      userId: 'user-123',
      amount: BigInt(10000), // Exact total balance
      type: 'MATCH_ENTRY',
      matchId: 'match-789',
      idempotencyKey: 'match-789-entry',
    });

    expect(result.balanceAfter).toBe(0);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidBalance: BigInt(0),
          bonusBalance: BigInt(0),
        }),
      })
    );
  });

  it('throws NotFoundError when wallet not found', async () => {
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(null);

    await expect(
      debitWallet({
        userId: 'nonexistent-user',
        amount: BigInt(1000),
        type: 'RAKE_FEE',
      })
    ).rejects.toThrow(NotFoundError);

    await expect(
      debitWallet({
        userId: 'nonexistent-user',
        amount: BigInt(1000),
        type: 'RAKE_FEE',
      })
    ).rejects.toThrow('Wallet not found');
  });

  it('throws ConflictError on version mismatch', async () => {
    const mockWallet = createMockWallet({ version: 10 });
    mockTransactionFindUnique.mockResolvedValue(null);
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 0 }); // Version conflict

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'RAKE_FEE',
      })
    ).rejects.toThrow(ConflictError);

    await expect(
      debitWallet({
        userId: 'user-123',
        amount: BigInt(1000),
        type: 'RAKE_FEE',
      })
    ).rejects.toThrow('Wallet was modified by another transaction');
  });
});

// ===========================================
// Test: processRefund() - Happy Paths
// ===========================================

describe('processRefund - happy paths', () => {
  it('successful refund restores exact paid/bonus split', async () => {
    const originalTx = createMockTransaction({
      id: 'tx-original',
      type: 'MATCH_ENTRY',
      amount: BigInt(-5000), // Negative (debit)
      paidAmount: BigInt(-3000),
      bonusAmount: BigInt(-2000),
      matchId: 'match-789',
    });

    const mockWallet = createMockWallet({
      paidBalance: BigInt(5000),
      bonusBalance: BigInt(3000),
      totalLost: BigInt(5000),
    });

    mockTransactionFindUnique
      .mockResolvedValueOnce(null) // Check duplicate refund
      .mockResolvedValueOnce(originalTx); // Get original transaction

    mockTransactionFindFirst.mockResolvedValue(null); // No existing refund
    mockWalletFindUnique.mockResolvedValue(mockWallet);
    mockWalletUpdateMany.mockResolvedValue({ count: 1 });

    const refundTx = createMockTransaction({
      id: 'tx-refund',
      type: 'MATCH_REFUND',
      amount: BigInt(5000), // Positive (credit)
      paidAmount: BigInt(3000),
      bonusAmount: BigInt(2000),
    });
    mockTransactionCreate.mockResolvedValue(refundTx);

    const result = await processRefund({
      originalTransactionId: 'tx-original',
      idempotencyKey: 'refund-key-1',
    });

    expect(result.type).toBe('MATCH_REFUND');
    expect(result.amount).toBe(5000);
    expect(result.paidAmount).toBe(3000); // Exact split preserved
    expect(result.bonusAmount).toBe(2000);
    expect(mockWalletUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidBalance: BigInt(8000), // 5000 + 3000
          bonusBalance: BigInt(5000), // 3000 + 2000
          totalLost: BigInt(0), // 5000 - 5000
        }),
      })
    );
  });

  it('idempotent: duplicate idempotencyKey returns existing refund', async () => {
    const existingRefund = createMockTransaction({
      id: 'tx-refund-existing',
      type: 'MATCH_REFUND',
      idempotencyKey: 'refund-duplicate',
    });
    mockTransactionFindUnique.mockResolvedValue(existingRefund);

    const result = await processRefund({
      originalTransactionId: 'tx-original',
      idempotencyKey: 'refund-duplicate',
    });

    expect(result.id).toBe('tx-refund-existing');
    expect(mockWalletFindUnique).not.toHaveBeenCalled();
    expect(mockWalletUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });
});

// ===========================================
// Test: processRefund() - Validation Errors
// ===========================================

describe('processRefund - validation errors', () => {
  it('throws NotFoundError when original transaction not found', async () => {
    mockTransactionFindUnique
      .mockResolvedValueOnce(null) // Check duplicate refund
      .mockResolvedValueOnce(null); // Original transaction not found

    await expect(
      processRefund({
        originalTransactionId: 'nonexistent-tx',
        idempotencyKey: 'refund-key',
      })
    ).rejects.toThrow(NotFoundError);

    await expect(
      processRefund({
        originalTransactionId: 'nonexistent-tx',
        idempotencyKey: 'refund-key',
      })
    ).rejects.toThrow('Original transaction not found');
  });

  it('throws BadRequestError when original was credit (positive amount)', async () => {
    const originalTx = createMockTransaction({
      id: 'tx-credit',
      type: 'DEPOSIT',
      amount: BigInt(5000), // Positive (credit)
    });

    mockTransactionFindUnique
      .mockResolvedValueOnce(null) // Check duplicate refund
      .mockResolvedValueOnce(originalTx); // Get original transaction

    await expect(
      processRefund({
        originalTransactionId: 'tx-credit',
        idempotencyKey: 'refund-key',
      })
    ).rejects.toThrow(BadRequestError);

    expect(mockTransactionFindUnique).toHaveBeenCalledTimes(2);
  });

  it('throws BadRequestError when already refunded', async () => {
    const originalTx = createMockTransaction({
      id: 'tx-original',
      type: 'MATCH_ENTRY',
      amount: BigInt(-1000),
    });

    const existingRefund = createMockTransaction({
      type: 'MATCH_REFUND',
      metadata: { originalTransactionId: 'tx-original' },
    });

    mockTransactionFindUnique
      .mockResolvedValueOnce(null) // Check duplicate refund
      .mockResolvedValueOnce(originalTx); // Get original transaction

    mockTransactionFindFirst.mockResolvedValue(existingRefund);

    await expect(
      processRefund({
        originalTransactionId: 'tx-original',
        idempotencyKey: 'refund-key',
      })
    ).rejects.toThrow(BadRequestError);

    expect(mockTransactionFindFirst).toHaveBeenCalled();
  });

  it('throws BadRequestError for missing idempotencyKey', async () => {
    await expect(
      processRefund({
        originalTransactionId: 'tx-123',
        idempotencyKey: '',
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      processRefund({
        originalTransactionId: 'tx-123',
        idempotencyKey: '',
      })
    ).rejects.toThrow('Idempotency key is required for refund operations');
  });
});

// ===========================================
// Test: getTransactionHistory()
// ===========================================

describe('getTransactionHistory', () => {
  it('returns paginated results with default limit of 50', async () => {
    const transactions = Array.from({ length: 3 }, (_, i) =>
      createMockTransaction({
        id: `tx-${i}`,
        amount: BigInt(1000 * (i + 1)),
      })
    );
    mockTransactionFindMany.mockResolvedValue(transactions);

    const result = await getTransactionHistory({ userId: 'user-123' });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('tx-0');
    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-123' },
        take: 50,
        skip: 0,
      })
    );
  });

  it('filters by type when provided', async () => {
    mockTransactionFindMany.mockResolvedValue([]);

    await getTransactionHistory({ userId: 'user-123', type: 'DEPOSIT' });

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-123',
          type: 'DEPOSIT',
        }),
      })
    );
  });

  it('returns empty array when no transactions', async () => {
    mockTransactionFindMany.mockResolvedValue([]);

    const result = await getTransactionHistory({ userId: 'user-123' });

    expect(result).toEqual([]);
  });

  it('throws BadRequestError for empty userId', async () => {
    await expect(
      getTransactionHistory({ userId: '' })
    ).rejects.toThrow(BadRequestError);

    await expect(
      getTransactionHistory({ userId: '' })
    ).rejects.toThrow('userId is required for transaction history');
  });

  it('respects custom limit and offset', async () => {
    mockTransactionFindMany.mockResolvedValue([]);

    await getTransactionHistory({
      userId: 'user-123',
      limit: 10,
      offset: 20,
    });

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 20,
      })
    );
  });
});

// ===========================================
// Test: hasSufficientBalance() - DEPRECATED
// ===========================================

describe('hasSufficientBalance - DEPRECATED', () => {
  it('returns true when balance >= amount', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(8000),
      bonusBalance: BigInt(2000),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await hasSufficientBalance('user-123', BigInt(5000));

    expect(result).toBe(true);
  });

  it('returns false when balance < amount', async () => {
    const mockWallet = createMockWallet({
      paidBalance: BigInt(3000),
      bonusBalance: BigInt(1000),
    });
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    const result = await hasSufficientBalance('user-123', BigInt(5000));

    expect(result).toBe(false);
  });

  it('returns false when wallet not found', async () => {
    mockWalletFindUnique.mockResolvedValue(null);

    const result = await hasSufficientBalance('nonexistent-user', BigInt(1000));

    expect(result).toBe(false);
  });

  it('logs deprecation warning', async () => {
    const mockWallet = createMockWallet();
    mockWalletFindUnique.mockResolvedValue(mockWallet);

    await hasSufficientBalance('user-123', BigInt(1000));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('hasSufficientBalance called - this has TOCTOU vulnerability')
    );
  });
});
