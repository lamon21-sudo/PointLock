// =====================================================
// Wallet Service
// =====================================================
// Handles all wallet operations with strict financial compliance.
// CRITICAL: All balance changes are ATOMIC using optimistic locking.
// Race conditions are prevented via version field checks.

import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  InsufficientBalanceError,
} from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Constants
// ===========================================

// Maximum safe integer value for PostgreSQL BIGINT (2^63 - 1)
const MAX_POSTGRES_BIGINT = BigInt('9223372036854775807');

// Maximum transaction amount ($100,000 in cents) - business limit
const MAX_TRANSACTION_AMOUNT = BigInt(10000000);

// Maximum balance per user ($10 million in cents) - business limit
const MAX_BALANCE = BigInt(1000000000);

// Transaction types that are valid for credit operations
// Hardcoded to avoid Prisma client regeneration issues
const CREDIT_TYPES = [
  'DEPOSIT',
  'MATCH_WIN',
  'MATCH_REFUND',
  'BONUS',
  'WEEKLY_ALLOWANCE',
  'ADMIN_ADJUSTMENT',
  'STARTER_CREDIT', // Task 0.4: One-time starter coins on registration
  'SEASON_REWARD', // Task 4.1: Seasonal ranked rewards
] as const;

// Transaction types that are valid for debit operations
const DEBIT_TYPES = [
  'MATCH_ENTRY',
  'WITHDRAWAL',
  'RAKE_FEE',
  'ADMIN_ADJUSTMENT',
] as const;

// Transaction types that require a matchId
const MATCH_REQUIRED_TYPES: TransactionType[] = [
  'MATCH_ENTRY',
  'MATCH_WIN',
  'MATCH_REFUND',
];

// Transaction types that require idempotency keys (financial operations)
const IDEMPOTENCY_REQUIRED_TYPES: TransactionType[] = [
  'DEPOSIT',
  'WITHDRAWAL',
  'MATCH_ENTRY',
  'MATCH_WIN',
  'MATCH_REFUND',
];

// ===========================================
// Types
// ===========================================

export interface WalletBalance {
  id: string;
  userId: string;
  paidBalance: number;
  bonusBalance: number;
  totalBalance: number;
  version: number;
}

export interface CreditParams {
  userId: string;
  amount: bigint;
  type: TransactionType;
  useBonus?: boolean;
  matchId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface DebitParams {
  userId: string;
  amount: bigint;
  type: TransactionType;
  preferBonus?: boolean;
  matchId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundParams {
  originalTransactionId: string;
  idempotencyKey: string; // Required for refunds
  description?: string;
}

export interface TransactionHistoryParams {
  userId: string;
  walletId?: string;
  type?: string; // Accepts any valid transaction type string
  limit?: number;
  offset?: number;
}

export interface TransactionResult {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  paidAmount: number;
  bonusAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  matchId: string | null;
  description: string | null;
  createdAt: Date;
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Safely convert BigInt to number for API responses.
 * IMPORTANT: All monetary values are stored as BigInt (cents/smallest unit)
 * to avoid floating-point errors. Convert only for display/API purposes.
 *
 * @throws BadRequestError if value exceeds safe integer range
 */
export function bigIntToNumber(value: bigint): number {
  // Check for overflow - Number.MAX_SAFE_INTEGER = 2^53 - 1
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestError(
      'Value exceeds safe integer range for conversion'
    );
  }
  if (value < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestError(
      'Value exceeds safe integer range for conversion'
    );
  }
  return Number(value);
}

/**
 * Convert number to BigInt for storage.
 * Validates input is a non-negative integer within business limits.
 */
export function numberToBigInt(value: number): bigint {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestError('Amount must be a non-negative integer');
  }
  const bigIntValue = BigInt(value);
  if (bigIntValue > MAX_TRANSACTION_AMOUNT) {
    throw new BadRequestError(
      `Amount exceeds maximum allowed: ${bigIntToNumber(MAX_TRANSACTION_AMOUNT)}`
    );
  }
  return bigIntValue;
}

/**
 * Validate idempotency key is provided and non-empty.
 */
function validateIdempotencyKey(
  key: string | undefined,
  type: TransactionType
): void {
  if (IDEMPOTENCY_REQUIRED_TYPES.includes(type)) {
    if (!key || key.trim() === '') {
      throw new BadRequestError(
        `Idempotency key is required for ${type} transactions`
      );
    }
  }
}

/**
 * Validate matchId is provided for match-related transactions.
 */
function validateMatchId(
  matchId: string | undefined,
  type: TransactionType
): void {
  if (MATCH_REQUIRED_TYPES.includes(type)) {
    if (!matchId || matchId.trim() === '') {
      throw new BadRequestError(
        `Match ID is required for ${type} transactions`
      );
    }
  }
}

/**
 * Validate transaction type is valid for the operation.
 */
function validateTransactionType(
  type: TransactionType,
  validTypes: readonly string[],
  operation: 'credit' | 'debit'
): void {
  if (!validTypes.includes(type)) {
    throw new BadRequestError(
      `Invalid transaction type '${type}' for ${operation} operation. ` +
        `Valid types: ${validTypes.join(', ')}`
    );
  }
}

/**
 * Validate amount is within business limits.
 */
function validateAmount(amount: bigint): void {
  if (amount <= BigInt(0)) {
    throw new BadRequestError('Amount must be positive');
  }
  if (amount > MAX_TRANSACTION_AMOUNT) {
    throw new BadRequestError(
      `Amount exceeds maximum transaction limit of ${bigIntToNumber(MAX_TRANSACTION_AMOUNT)}`
    );
  }
}

/**
 * Check for potential overflow before addition.
 */
function checkAdditionOverflow(a: bigint, b: bigint): void {
  if (a + b > MAX_POSTGRES_BIGINT) {
    throw new BadRequestError('Operation would cause balance overflow');
  }
  if (a + b > MAX_BALANCE) {
    throw new BadRequestError(
      `Resulting balance would exceed maximum allowed: ${bigIntToNumber(MAX_BALANCE)}`
    );
  }
}

// ===========================================
// Wallet Service Functions
// ===========================================

/**
 * Get wallet by user ID with balance information.
 */
export async function getWalletByUserId(userId: string): Promise<WalletBalance | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      paidBalance: true,
      bonusBalance: true,
      version: true,
    },
  });

  if (!wallet) {
    return null;
  }

  return {
    id: wallet.id,
    userId: wallet.userId,
    paidBalance: bigIntToNumber(wallet.paidBalance),
    bonusBalance: bigIntToNumber(wallet.bonusBalance),
    totalBalance: bigIntToNumber(wallet.paidBalance + wallet.bonusBalance),
    version: wallet.version,
  };
}

/**
 * Credit funds to a wallet (add balance).
 * Uses atomic transaction with optimistic locking.
 *
 * @param params - Credit operation parameters
 * @returns The created transaction record
 *
 * @example
 * // Add deposit to paid balance
 * await creditWallet({
 *   userId: 'user-123',
 *   amount: BigInt(5000), // $50.00 in cents
 *   type: 'DEPOSIT',
 *   idempotencyKey: 'iap-receipt-abc123',
 * });
 */
export async function creditWallet(params: CreditParams): Promise<TransactionResult> {
  const {
    userId,
    amount,
    type,
    useBonus = false,
    matchId,
    idempotencyKey,
    description,
    metadata = {},
  } = params;

  // Validate all inputs
  validateAmount(amount);
  validateTransactionType(type, CREDIT_TYPES, 'credit');
  validateIdempotencyKey(idempotencyKey, type);
  validateMatchId(matchId, type);

  const result = await prisma.$transaction(
    async (tx) => {
      // Check for duplicate transaction (idempotency)
      if (idempotencyKey) {
        const existing = await tx.transaction.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          logger.info(`Idempotent credit request detected: ${idempotencyKey}`);
          return formatTransactionResult(existing);
        }
      }

      // Get wallet with version for optimistic locking
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          paidBalance: true,
          bonusBalance: true,
          totalDeposited: true,
          totalWon: true,
          version: true,
        },
      });

      if (!wallet) {
        throw new NotFoundError('Wallet not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // Calculate new balances with overflow protection
      const balanceBefore = wallet.paidBalance + wallet.bonusBalance;
      let newPaidBalance = wallet.paidBalance;
      let newBonusBalance = wallet.bonusBalance;
      let paidAmount = BigInt(0);
      let bonusAmount = BigInt(0);

      // Track cumulative totals
      let newTotalDeposited = wallet.totalDeposited;
      let newTotalWon = wallet.totalWon;

      if (useBonus) {
        checkAdditionOverflow(newBonusBalance, amount);
        newBonusBalance += amount;
        bonusAmount = amount;
      } else {
        checkAdditionOverflow(newPaidBalance, amount);
        newPaidBalance += amount;
        paidAmount = amount;
      }

      // Update cumulative totals based on transaction type
      if (type === 'DEPOSIT') {
        newTotalDeposited += amount;
      } else if (type === 'MATCH_WIN') {
        newTotalWon += amount;
      }

      const balanceAfter = newPaidBalance + newBonusBalance;

      // Update wallet with version check (optimistic lock)
      const updated = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version, // CRITICAL: Version must match
        },
        data: {
          paidBalance: newPaidBalance,
          bonusBalance: newBonusBalance,
          totalDeposited: newTotalDeposited,
          totalWon: newTotalWon,
          version: { increment: 1 },
        },
      });

      // If no rows updated, version changed = concurrent modification
      if (updated.count === 0) {
        throw new ConflictError(
          'Wallet was modified by another transaction. Please retry.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Create transaction record for audit trail
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type,
          status: 'completed',
          amount, // Positive for credits
          paidAmount,
          bonusAmount,
          balanceBefore,
          balanceAfter,
          matchId,
          idempotencyKey,
          description,
          metadata: metadata as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      logger.info(
        `Credit completed: ${userId} +${bigIntToNumber(amount)} (${type}) | ` +
          `Balance: ${bigIntToNumber(balanceBefore)} -> ${bigIntToNumber(balanceAfter)}`
      );

      return formatTransactionResult(transaction);
    },
    { timeout: 10000 } // 10 second timeout for transaction
  );

  return result;
}

/**
 * Debit funds from a wallet (remove balance).
 * Uses atomic transaction with optimistic locking.
 * CRITICAL: Validates sufficient balance before debit.
 *
 * @param params - Debit operation parameters
 * @returns The created transaction record
 * @throws InsufficientBalanceError if balance is insufficient
 *
 * @example
 * // Deduct match entry stake (prefer bonus first)
 * await debitWallet({
 *   userId: 'user-123',
 *   amount: BigInt(1000), // $10.00 in cents
 *   type: 'MATCH_ENTRY',
 *   preferBonus: true,
 *   matchId: 'match-456',
 *   idempotencyKey: 'match-456-entry-user-123',
 * });
 */
export async function debitWallet(params: DebitParams): Promise<TransactionResult> {
  const {
    userId,
    amount,
    type,
    preferBonus = true, // Default: use bonus balance first
    matchId,
    idempotencyKey,
    description,
    metadata = {},
  } = params;

  // Validate all inputs
  validateAmount(amount);
  validateTransactionType(type, DEBIT_TYPES, 'debit');
  validateIdempotencyKey(idempotencyKey, type);
  validateMatchId(matchId, type);

  const result = await prisma.$transaction(
    async (tx) => {
      // Check for duplicate transaction (idempotency)
      if (idempotencyKey) {
        const existing = await tx.transaction.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          logger.info(`Idempotent debit request detected: ${idempotencyKey}`);
          return formatTransactionResult(existing);
        }
      }

      // Get wallet with version for optimistic locking
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          paidBalance: true,
          bonusBalance: true,
          totalLost: true,
          totalRakePaid: true,
          version: true,
        },
      });

      if (!wallet) {
        throw new NotFoundError('Wallet not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // Check sufficient balance
      const totalBalance = wallet.paidBalance + wallet.bonusBalance;
      if (totalBalance < amount) {
        throw new InsufficientBalanceError(
          `Insufficient balance: have ${bigIntToNumber(totalBalance)}, need ${bigIntToNumber(amount)}`
        );
      }

      // Calculate deduction from each balance type
      const balanceBefore = totalBalance;
      let remainingDebit = amount;
      let paidAmount = BigInt(0);
      let bonusAmount = BigInt(0);
      let newPaidBalance = wallet.paidBalance;
      let newBonusBalance = wallet.bonusBalance;

      if (preferBonus) {
        // Deduct from bonus first, then paid
        if (wallet.bonusBalance >= remainingDebit) {
          bonusAmount = remainingDebit;
          newBonusBalance -= remainingDebit;
          remainingDebit = BigInt(0);
        } else {
          bonusAmount = wallet.bonusBalance;
          newBonusBalance = BigInt(0);
          remainingDebit -= wallet.bonusBalance;
          paidAmount = remainingDebit;
          newPaidBalance -= remainingDebit;
          remainingDebit = BigInt(0);
        }
      } else {
        // Deduct from paid first, then bonus
        if (wallet.paidBalance >= remainingDebit) {
          paidAmount = remainingDebit;
          newPaidBalance -= remainingDebit;
          remainingDebit = BigInt(0);
        } else {
          paidAmount = wallet.paidBalance;
          newPaidBalance = BigInt(0);
          remainingDebit -= wallet.paidBalance;
          bonusAmount = remainingDebit;
          newBonusBalance -= remainingDebit;
          remainingDebit = BigInt(0);
        }
      }

      // Track cumulative totals
      let newTotalLost = wallet.totalLost;
      let newTotalRakePaid = wallet.totalRakePaid;

      if (type === 'MATCH_ENTRY') {
        newTotalLost += amount; // Track as potential loss (will be reversed on win)
      } else if (type === 'RAKE_FEE') {
        newTotalRakePaid += amount;
      }

      const balanceAfter = newPaidBalance + newBonusBalance;

      // Sanity check: balance should never go negative
      if (newPaidBalance < BigInt(0) || newBonusBalance < BigInt(0)) {
        throw new BadRequestError('Balance calculation error: negative balance detected');
      }

      // Update wallet with version check (optimistic lock)
      const updated = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version, // CRITICAL: Version must match
        },
        data: {
          paidBalance: newPaidBalance,
          bonusBalance: newBonusBalance,
          totalLost: newTotalLost,
          totalRakePaid: newTotalRakePaid,
          version: { increment: 1 },
        },
      });

      // If no rows updated, version changed = concurrent modification
      if (updated.count === 0) {
        throw new ConflictError(
          'Wallet was modified by another transaction. Please retry.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Create transaction record for audit trail
      // Note: amount is stored as negative for debits
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type,
          status: 'completed',
          amount: -amount, // Negative for debits
          paidAmount: -paidAmount,
          bonusAmount: -bonusAmount,
          balanceBefore,
          balanceAfter,
          matchId,
          idempotencyKey,
          description,
          metadata: metadata as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      logger.info(
        `Debit completed: ${userId} -${bigIntToNumber(amount)} (${type}) | ` +
          `Balance: ${bigIntToNumber(balanceBefore)} -> ${bigIntToNumber(balanceAfter)}`
      );

      return formatTransactionResult(transaction);
    },
    { timeout: 10000 } // 10 second timeout for transaction
  );

  return result;
}

/**
 * Get transaction history for a user.
 * Supports filtering by type and pagination.
 */
export async function getTransactionHistory(
  params: TransactionHistoryParams
): Promise<TransactionResult[]> {
  const { userId, walletId, type, limit = 50, offset = 0 } = params;

  // Validate userId is non-empty
  if (!userId || userId.trim() === '') {
    throw new BadRequestError('userId is required for transaction history');
  }

  // Build where clause with strict type checking
  const where: Prisma.TransactionWhereInput = {
    userId,
  };

  // Only add walletId if it's a non-empty string
  if (walletId && walletId.trim() !== '') {
    where.walletId = walletId;
  }

  // Only add type if it's defined and valid
  // This prevents passing undefined or invalid enum values to Prisma
  // Cast to any to bypass Prisma client type mismatch (schema updated but client not regenerated)
  if (type !== undefined && type !== null) {
    where.type = type as any;
  }

  try {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return transactions.map(formatTransactionResult);
  } catch (error) {
    logger.error('Failed to fetch transaction history', {
      userId,
      walletId,
      type,
      limit,
      offset,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new BadRequestError(
      `Failed to fetch transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process a refund transaction (credit back to wallet).
 * CRITICAL: Preserves the exact paid/bonus split from the original transaction.
 *
 * @param params - Refund parameters including original transaction ID
 * @returns The created refund transaction record
 * @throws NotFoundError if original transaction not found
 * @throws BadRequestError if transaction already refunded or invalid
 */
export async function processRefund(params: RefundParams): Promise<TransactionResult> {
  const { originalTransactionId, idempotencyKey, description } = params;

  // Idempotency key is required for refunds
  if (!idempotencyKey || idempotencyKey.trim() === '') {
    throw new BadRequestError('Idempotency key is required for refund operations');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Check for duplicate refund (idempotency)
      const existingRefund = await tx.transaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingRefund) {
        logger.info(`Idempotent refund request detected: ${idempotencyKey}`);
        return formatTransactionResult(existingRefund);
      }

      // Get original transaction
      const original = await tx.transaction.findUnique({
        where: { id: originalTransactionId },
      });

      if (!original) {
        throw new NotFoundError('Original transaction not found');
      }

      // Validate this is a debit transaction that can be refunded
      if (original.amount >= BigInt(0)) {
        throw new BadRequestError('Can only refund debit transactions (negative amounts)');
      }

      // Check if this transaction was already refunded
      const existingRefundForTx = await tx.transaction.findFirst({
        where: {
          type: 'MATCH_REFUND',
          metadata: {
            path: ['originalTransactionId'],
            equals: originalTransactionId,
          },
        },
      });

      if (existingRefundForTx) {
        throw new BadRequestError(
          `Transaction ${originalTransactionId} has already been refunded`
        );
      }

      // Get wallet for credit
      const wallet = await tx.wallet.findUnique({
        where: { userId: original.userId },
        select: {
          id: true,
          paidBalance: true,
          bonusBalance: true,
          totalLost: true,
          version: true,
        },
      });

      if (!wallet) {
        throw new NotFoundError('Wallet not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // Calculate refund amounts - PRESERVE the original paid/bonus split
      // Original transaction has NEGATIVE amounts (it was a debit)
      // We negate them to get POSITIVE amounts for the credit
      const refundPaidAmount = -original.paidAmount;
      const refundBonusAmount = -original.bonusAmount;
      const totalRefundAmount = refundPaidAmount + refundBonusAmount;

      if (totalRefundAmount <= BigInt(0)) {
        throw new BadRequestError('Invalid refund amount calculated');
      }

      const balanceBefore = wallet.paidBalance + wallet.bonusBalance;

      // Apply refund to each balance type separately (preserving split)
      checkAdditionOverflow(wallet.paidBalance, refundPaidAmount);
      checkAdditionOverflow(wallet.bonusBalance, refundBonusAmount);

      const newPaidBalance = wallet.paidBalance + refundPaidAmount;
      const newBonusBalance = wallet.bonusBalance + refundBonusAmount;
      const balanceAfter = newPaidBalance + newBonusBalance;

      // Reverse the totalLost if this was a MATCH_ENTRY
      let newTotalLost = wallet.totalLost;
      if (original.type === 'MATCH_ENTRY') {
        newTotalLost -= totalRefundAmount;
        if (newTotalLost < BigInt(0)) {
          newTotalLost = BigInt(0); // Prevent negative
        }
      }

      // Update wallet with version check (optimistic lock)
      const updated = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version,
        },
        data: {
          paidBalance: newPaidBalance,
          bonusBalance: newBonusBalance,
          totalLost: newTotalLost,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          'Wallet was modified by another transaction. Please retry.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // Create refund transaction record
      const refundTransaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId: original.userId,
          type: 'MATCH_REFUND',
          status: 'completed',
          amount: totalRefundAmount, // Positive for credits
          paidAmount: refundPaidAmount,
          bonusAmount: refundBonusAmount,
          balanceBefore,
          balanceAfter,
          matchId: original.matchId,
          idempotencyKey,
          description: description ?? `Refund for transaction ${originalTransactionId}`,
          metadata: { originalTransactionId } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      logger.info(
        `Refund completed: ${original.userId} +${bigIntToNumber(totalRefundAmount)} ` +
          `(paid: ${bigIntToNumber(refundPaidAmount)}, bonus: ${bigIntToNumber(refundBonusAmount)}) | ` +
          `Original: ${originalTransactionId}`
      );

      return formatTransactionResult(refundTransaction);
    },
    { timeout: 10000 }
  );

  return result;
}

// ===========================================
// Internal Helper Functions
// ===========================================

/**
 * Format a Prisma transaction record for API response.
 * Converts BigInt fields to numbers.
 */
function formatTransactionResult(
  tx: Prisma.TransactionGetPayload<object>
): TransactionResult {
  return {
    id: tx.id,
    walletId: tx.walletId,
    userId: tx.userId,
    type: tx.type,
    status: tx.status,
    amount: bigIntToNumber(tx.amount),
    paidAmount: bigIntToNumber(tx.paidAmount),
    bonusAmount: bigIntToNumber(tx.bonusAmount),
    balanceBefore: bigIntToNumber(tx.balanceBefore),
    balanceAfter: bigIntToNumber(tx.balanceAfter),
    matchId: tx.matchId,
    description: tx.description,
    createdAt: tx.createdAt,
  };
}
