// =====================================================
// Wallet Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to wallet.service.ts
// CRITICAL: All endpoints require authentication.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, PaginationMeta, ERROR_CODES } from '@pick-rivals/shared-types';
import {
  transactionHistoryQuerySchema,
  AllowanceCheckResponse,
  AllowanceClaimResponse,
  ValidTransactionType,
} from './wallet.schemas';
import {
  getWalletByUserId,
  getTransactionHistory,
  TransactionResult,
} from '../../lib/wallet.service';
import {
  checkAllowanceEligibility,
  creditAllowance,
  formatTimeUntilNextAllowance,
} from '../../lib/allowance.service';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { requireAuth, getAuthenticatedUser, allowanceClaimRateLimiter } from '../../middleware';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router: Router = Router();

// ===========================================
// Types
// ===========================================

interface WalletResponse {
  id: string;
  userId: string;
  paidBalance: number;
  bonusBalance: number;
  totalBalance: number;
  stats: {
    totalDeposited: number;
    totalWon: number;
    totalLost: number;
    totalRakePaid: number;
  };
}

interface TransactionHistoryResponse {
  transactions: TransactionResult[];
  pagination: PaginationMeta;
}

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ===========================================
// GET /wallet
// ===========================================
// Returns the authenticated user's wallet with current balance.
// Requires: Bearer token authentication

router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Wallet fetch requested for user: ${user.id}`);

      // Get wallet balance from service
      const wallet = await getWalletByUserId(user.id);

      if (!wallet) {
        throw new NotFoundError(
          'Wallet not found for user',
          ERROR_CODES.USER_NOT_FOUND
        );
      }

      // Fetch additional stats from database
      const walletRecord = await prisma.wallet.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          totalDeposited: true,
          totalWon: true,
          totalLost: true,
          totalRakePaid: true,
        },
      });

      const walletResponse: WalletResponse = {
        id: wallet.id,
        userId: wallet.userId,
        paidBalance: wallet.paidBalance,
        bonusBalance: wallet.bonusBalance,
        totalBalance: wallet.totalBalance,
        stats: {
          totalDeposited: walletRecord ? Number(walletRecord.totalDeposited) : 0,
          totalWon: walletRecord ? Number(walletRecord.totalWon) : 0,
          totalLost: walletRecord ? Number(walletRecord.totalLost) : 0,
          totalRakePaid: walletRecord ? Number(walletRecord.totalRakePaid) : 0,
        },
      };

      const response: ApiResponse<WalletResponse> = {
        success: true,
        data: walletResponse,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /wallet/transactions
// ===========================================
// Returns paginated transaction history for the authenticated user.
// Supports filtering by transaction type.
// Query params: page, limit, type
// Requires: Bearer token authentication

router.get(
  '/transactions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      // Parse and validate query parameters (schema provides defaults via transforms)
      const parsed = transactionHistoryQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        logger.warn(`Invalid transaction history query parameters`, {
          userId: user.id,
          errors: parsed.error.errors,
          query: req.query,
        });
        // Use defaults on validation failure
      }

      const { page, limit, type } = parsed.success
        ? parsed.data
        : { page: 1, limit: 20, type: undefined };

      logger.info(`Transaction history requested for user: ${user.id}`, {
        page,
        limit,
        type,
      });

      // Calculate offset from page
      const offset = (page - 1) * limit;

      // Get transactions from service
      // Type is already validated by the schema transform
      const transactions = await getTransactionHistory({
        userId: user.id,
        type: type as ValidTransactionType | undefined,
        limit: limit + 1, // Fetch one extra to determine hasNext
        offset,
      });

      // Determine if there are more results
      const hasNext = transactions.length > limit;
      const results = hasNext ? transactions.slice(0, limit) : transactions;

      // Get total count for pagination
      const totalCount = await prisma.transaction.count({
        where: {
          userId: user.id,
          // Cast to any to bypass Prisma's strict typing - schema validates this
          ...(type && { type: type as any }),
        },
      });

      const totalPages = Math.ceil(totalCount / limit);

      const paginationMeta: PaginationMeta = {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev: page > 1,
      };

      const responseData: TransactionHistoryResponse = {
        transactions: results,
        pagination: paginationMeta,
      };

      const response: ApiResponse<TransactionHistoryResponse> = {
        success: true,
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: paginationMeta,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /wallet/allowance
// ===========================================
// Check if user is eligible for weekly allowance.
// Returns eligibility status and next available claim time.
// Requires: Bearer token authentication

router.get(
  '/allowance',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Allowance eligibility check for user: ${user.id}`);

      const checkResult = await checkAllowanceEligibility(user.id);

      const responseData: AllowanceCheckResponse = {
        eligible: checkResult.eligible,
        eligibility: {
          eligible: checkResult.eligibility.eligible,
          reason: checkResult.eligibility.reason,
          lastClaimedAt: checkResult.eligibility.lastClaimedAt?.toISOString() ?? null,
          nextAvailableAt: checkResult.eligibility.nextAvailableAt?.toISOString() ?? null,
          daysUntilAvailable: checkResult.eligibility.daysUntilAvailable,
          hoursUntilAvailable: checkResult.eligibility.hoursUntilAvailable,
        },
        currentBalance: checkResult.currentBalance,
        allowanceAmount: config.wallet.weeklyAllowanceAmount,
      };

      const response: ApiResponse<AllowanceCheckResponse> = {
        success: true,
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// POST /wallet/claim-allowance
// ===========================================
// Claim weekly allowance credits.
// CRITICAL: This endpoint is protected by:
// 1. Authentication (requireAuth)
// 2. Rate limiting (allowanceClaimRateLimiter)
// 3. Service-layer idempotency (week-based idempotency key)
// 4. Optimistic locking (wallet.version check)
//
// Input: None (user inferred from auth token)
// Response: Claim result with new balance and next claim time
// Error: 400 if not eligible, with time until next claim

router.post(
  '/claim-allowance',
  requireAuth,
  allowanceClaimRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      logger.info(`Allowance claim attempt for user: ${user.id}`);

      const claimResult = await creditAllowance(user.id);

      if (!claimResult.credited) {
        // Not eligible - return 400 with details
        const timeUntil = formatTimeUntilNextAllowance(claimResult.eligibility);

        throw new BadRequestError(
          `Not eligible for allowance. ${claimResult.eligibility.reason}. ` +
            `Next allowance available in ${timeUntil}.`
        );
      }

      const responseData: AllowanceClaimResponse = {
        claimed: true,
        amount: claimResult.amount,
        newBalance: claimResult.newBalance,
        transactionId: claimResult.transactionId,
        nextClaimAt: claimResult.nextClaimAt.toISOString(),
        message: `Successfully claimed ${claimResult.amount} bonus credits!`,
      };

      const response: ApiResponse<AllowanceClaimResponse> = {
        success: true,
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      logger.info(
        `Allowance claimed successfully for user ${user.id}: ` +
          `+${claimResult.amount} credits, new balance: ${claimResult.newBalance}`
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
