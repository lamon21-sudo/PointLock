// =====================================================
// Allowance Service
// =====================================================
// Handles weekly allowance eligibility checks and distribution.
// CRITICAL: All operations are atomic and idempotent.
// Race conditions are prevented via optimistic locking on wallet.version.

import { TransactionType, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { bigIntToNumber } from './wallet.service';

// ===========================================
// Constants
// ===========================================

const ALLOWANCE_COOLDOWN_DAYS = config.wallet.weeklyAllowanceDays;
const ALLOWANCE_AMOUNT = BigInt(config.wallet.weeklyAllowanceAmount);

// Maximum retry attempts for optimistic lock conflicts
const MAX_RETRY_ATTEMPTS = 3;

// ===========================================
// Types
// ===========================================

export interface AllowanceEligibility {
  eligible: boolean;
  reason: string;
  lastClaimedAt: Date | null;
  nextAvailableAt: Date | null;
  daysUntilAvailable: number;
  hoursUntilAvailable: number;
}

export interface AllowanceClaimResult {
  credited: boolean;
  amount: number;
  newBalance: number;
  transactionId: string | null;
  eligibility: AllowanceEligibility;
  nextClaimAt: Date;
}

export interface AllowanceCheckResult {
  eligible: boolean;
  eligibility: AllowanceEligibility;
  currentBalance: number;
}

// ===========================================
// Eligibility Functions
// ===========================================

/**
 * Calculate allowance eligibility for a user.
 * Does NOT modify any data - safe for repeated calls.
 *
 * @param lastAllowanceAt - The timestamp of the last allowance claim
 * @returns Eligibility details including when next claim is available
 */
export function calculateEligibility(lastAllowanceAt: Date | null): AllowanceEligibility {
  const now = new Date();

  // First-time user - always eligible
  if (!lastAllowanceAt) {
    return {
      eligible: true,
      reason: 'First-time allowance available',
      lastClaimedAt: null,
      nextAvailableAt: now,
      daysUntilAvailable: 0,
      hoursUntilAvailable: 0,
    };
  }

  // Calculate cooldown expiry
  const cooldownMs = ALLOWANCE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const nextAvailableAt = new Date(lastAllowanceAt.getTime() + cooldownMs);
  const msUntilAvailable = nextAvailableAt.getTime() - now.getTime();

  if (msUntilAvailable <= 0) {
    // Cooldown expired - eligible
    return {
      eligible: true,
      reason: 'Weekly allowance available',
      lastClaimedAt: lastAllowanceAt,
      nextAvailableAt: now,
      daysUntilAvailable: 0,
      hoursUntilAvailable: 0,
    };
  }

  // Still in cooldown
  const hoursUntilAvailable = Math.ceil(msUntilAvailable / (60 * 60 * 1000));
  const daysUntilAvailable = Math.ceil(msUntilAvailable / (24 * 60 * 60 * 1000));

  return {
    eligible: false,
    reason: `Next allowance available in ${daysUntilAvailable} day${daysUntilAvailable !== 1 ? 's' : ''}`,
    lastClaimedAt: lastAllowanceAt,
    nextAvailableAt,
    daysUntilAvailable,
    hoursUntilAvailable,
  };
}

/**
 * Check if a user is eligible for their weekly allowance.
 * READ-ONLY operation - safe for UI display.
 *
 * @param userId - The user's ID
 * @returns Eligibility check result with current balance
 */
export async function checkAllowanceEligibility(
  userId: string
): Promise<AllowanceCheckResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      paidBalance: true,
      bonusBalance: true,
      lastAllowanceAt: true,
    },
  });

  if (!wallet) {
    throw new NotFoundError('Wallet not found', ERROR_CODES.USER_NOT_FOUND);
  }

  const eligibility = calculateEligibility(wallet.lastAllowanceAt);
  const currentBalance = bigIntToNumber(wallet.paidBalance + wallet.bonusBalance);

  return {
    eligible: eligibility.eligible,
    eligibility,
    currentBalance,
  };
}

// ===========================================
// Credit Functions
// ===========================================

/**
 * Credit weekly allowance to a user's wallet.
 *
 * CRITICAL SAFETY FEATURES:
 * 1. Atomic transaction - balance + timestamp update together
 * 2. Optimistic locking - prevents race conditions via version check
 * 3. Idempotent - duplicate calls within cooldown are safely rejected
 * 4. Retry logic - handles transient conflicts gracefully
 *
 * @param userId - The user's ID
 * @param dryRun - If true, checks eligibility without crediting
 * @returns The claim result with new balance and next claim date
 */
export async function creditAllowance(
  userId: string,
  dryRun: boolean = false
): Promise<AllowanceClaimResult> {
  let attempts = 0;

  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++;

    try {
      return await attemptCreditAllowance(userId, dryRun);
    } catch (error) {
      if (error instanceof ConflictError && attempts < MAX_RETRY_ATTEMPTS) {
        // Optimistic lock conflict - retry with backoff
        logger.warn(
          `Allowance credit conflict for user ${userId}, attempt ${attempts}/${MAX_RETRY_ATTEMPTS}`
        );
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
        continue;
      }
      throw error;
    }
  }

  throw new ConflictError(
    'Unable to process allowance claim after multiple attempts. Please try again.',
    ERROR_CODES.INTERNAL_ERROR
  );
}

/**
 * Internal: Single attempt to credit allowance.
 * Separated for retry logic clarity.
 */
async function attemptCreditAllowance(
  userId: string,
  dryRun: boolean
): Promise<AllowanceClaimResult> {
  const now = new Date();

  // Generate idempotency key based on user and week
  // This ensures the same week can only be claimed once
  const weekNumber = getISOWeekNumber(now);
  const year = now.getFullYear();
  const idempotencyKey = `allowance-${userId}-${year}-W${weekNumber}`;

  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Get wallet with current version
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          paidBalance: true,
          bonusBalance: true,
          lastAllowanceAt: true,
          version: true,
        },
      });

      if (!wallet) {
        throw new NotFoundError('Wallet not found', ERROR_CODES.USER_NOT_FOUND);
      }

      // 2. Check eligibility
      const eligibility = calculateEligibility(wallet.lastAllowanceAt);

      if (!eligibility.eligible) {
        // Not eligible - return without modification
        const currentBalance = bigIntToNumber(wallet.paidBalance + wallet.bonusBalance);
        return {
          credited: false,
          amount: 0,
          newBalance: currentBalance,
          transactionId: null,
          eligibility,
          nextClaimAt: eligibility.nextAvailableAt!,
        };
      }

      // 3. Check for existing transaction (idempotency)
      const existingTx = await tx.transaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingTx) {
        logger.info(`Duplicate allowance claim detected: ${idempotencyKey}`);
        const currentBalance = bigIntToNumber(wallet.paidBalance + wallet.bonusBalance);
        return {
          credited: false,
          amount: 0,
          newBalance: currentBalance,
          transactionId: existingTx.id,
          eligibility: {
            ...eligibility,
            eligible: false,
            reason: 'Allowance already claimed for this week',
          },
          nextClaimAt: new Date(now.getTime() + ALLOWANCE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000),
        };
      }

      // 4. Dry run check - return without modification
      if (dryRun) {
        const currentBalance = bigIntToNumber(wallet.paidBalance + wallet.bonusBalance);
        return {
          credited: false,
          amount: bigIntToNumber(ALLOWANCE_AMOUNT),
          newBalance: currentBalance,
          transactionId: null,
          eligibility: { ...eligibility, reason: 'DRY RUN - Would be credited' },
          nextClaimAt: new Date(now.getTime() + ALLOWANCE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000),
        };
      }

      // 5. Calculate new balance
      const balanceBefore = wallet.paidBalance + wallet.bonusBalance;
      const newBonusBalance = wallet.bonusBalance + ALLOWANCE_AMOUNT;
      const balanceAfter = wallet.paidBalance + newBonusBalance;

      // 6. ATOMIC: Update wallet balance AND lastAllowanceAt
      // Using version check for optimistic locking
      const updateResult = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          version: wallet.version, // CRITICAL: Prevents race conditions
        },
        data: {
          bonusBalance: newBonusBalance,
          lastAllowanceAt: now,
          version: { increment: 1 },
        },
      });

      // 7. Check if update succeeded (optimistic lock)
      if (updateResult.count === 0) {
        throw new ConflictError(
          'Wallet was modified by another operation. Please retry.',
          ERROR_CODES.INTERNAL_ERROR
        );
      }

      // 8. Create transaction record for audit trail
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'WEEKLY_ALLOWANCE' as TransactionType,
          status: 'completed',
          amount: ALLOWANCE_AMOUNT,
          paidAmount: BigInt(0),
          bonusAmount: ALLOWANCE_AMOUNT,
          balanceBefore,
          balanceAfter,
          idempotencyKey,
          description: `Weekly allowance - Week ${weekNumber} of ${year}`,
          metadata: {
            weekNumber,
            year,
            cooldownDays: ALLOWANCE_COOLDOWN_DAYS,
          } as Prisma.InputJsonValue,
          completedAt: now,
        },
      });

      logger.info(
        `Allowance credited: ${userId} +${bigIntToNumber(ALLOWANCE_AMOUNT)} | ` +
          `Balance: ${bigIntToNumber(balanceBefore)} -> ${bigIntToNumber(balanceAfter)} | ` +
          `Week: ${year}-W${weekNumber}`
      );

      const nextClaimAt = new Date(now.getTime() + ALLOWANCE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

      return {
        credited: true,
        amount: bigIntToNumber(ALLOWANCE_AMOUNT),
        newBalance: bigIntToNumber(balanceAfter),
        transactionId: transaction.id,
        eligibility: {
          eligible: false, // Now not eligible until next week
          reason: 'Allowance claimed successfully',
          lastClaimedAt: now,
          nextAvailableAt: nextClaimAt,
          daysUntilAvailable: ALLOWANCE_COOLDOWN_DAYS,
          hoursUntilAvailable: ALLOWANCE_COOLDOWN_DAYS * 24,
        },
        nextClaimAt,
      };
    },
    { timeout: 10000 } // 10 second timeout
  );

  return result;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Get ISO week number for a date.
 * Week 1 is the week containing the first Thursday of the year.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNum;
}

/**
 * Format duration until next allowance for display.
 */
export function formatTimeUntilNextAllowance(eligibility: AllowanceEligibility): string {
  if (eligibility.eligible) {
    return 'Available now';
  }

  const { daysUntilAvailable, hoursUntilAvailable } = eligibility;

  if (daysUntilAvailable > 1) {
    return `${daysUntilAvailable} days`;
  } else if (hoursUntilAvailable > 1) {
    return `${hoursUntilAvailable} hours`;
  } else {
    return 'Less than an hour';
  }
}
