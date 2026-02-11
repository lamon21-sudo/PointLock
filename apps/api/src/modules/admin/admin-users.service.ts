// =====================================================
// Admin User Management Service
// =====================================================
// Business logic for admin user management operations.
// CRITICAL: All operations create AdminAuditLog entries.

import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { creditWallet, debitWallet } from '../../lib/wallet.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import {
  ListUsersQuery,
  UpdateUserStatusInput,
  RevokeTokensInput,
  AdminWalletAdjustInput,
  ListAuditLogQuery,
} from './admin-users.schemas';

// ===========================================
// Types
// ===========================================

interface UserListResult {
  users: Array<{
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    status: UserStatus;
    adminRole: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UserDetailResult {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    status: UserStatus;
    adminRole: string | null;
    emailVerified: boolean;
    kycVerified: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    skillRating: number;
    matchesPlayed: number;
    matchesWon: number;
  };
  wallet: {
    paidBalance: number;
    bonusBalance: number;
  };
  activeTokensCount: number;
  recentMatches: Array<{
    id: string;
    status: string;
    stakeAmount: number;
    createdAt: Date;
    opponentUsername: string | null;
  }>;
}

interface UpdateUserStatusParams {
  adminId: string;
  targetUserId: string;
  status: UserStatus;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

interface RevokeUserTokensParams {
  adminId: string;
  targetUserId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

interface AdjustUserWalletParams {
  adminId: string;
  targetUserId: string;
  amount: number;
  type: 'BONUS' | 'ADMIN_ADJUSTMENT';
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

interface AuditLogResult {
  logs: Array<{
    id: string;
    action: string;
    performedBy: string;
    targetUserId: string | null;
    previousState: Prisma.JsonValue;
    newState: Prisma.JsonValue;
    reason: string | null;
    metadata: Prisma.JsonValue;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ===========================================
// User List & Search
// ===========================================

/**
 * List users with search and filtering.
 * NEVER includes passwordHash.
 */
export async function listUsers(query: ListUsersQuery): Promise<UserListResult> {
  const { search, status, page, limit } = query;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.UserWhereInput = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        status: true,
        adminRole: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    total,
    page,
    limit,
    totalPages,
  };
}

// ===========================================
// User Detail View
// ===========================================

/**
 * Get detailed admin view of a user.
 * NEVER includes passwordHash.
 */
export async function getUserDetail(userId: string): Promise<UserDetailResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      status: true,
      adminRole: true,
      emailVerified: true,
      kycVerified: true,
      createdAt: true,
      lastLoginAt: true,
      skillRating: true,
      matchesPlayed: true,
      matchesWon: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  const [wallet, activeTokensCount, recentMatches] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId },
      select: {
        paidBalance: true,
        bonusBalance: true,
      },
    }),
    prisma.refreshToken.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.match.findMany({
      where: {
        OR: [{ creatorId: userId }, { opponentId: userId }],
      },
      select: {
        id: true,
        status: true,
        stakeAmount: true,
        createdAt: true,
        opponent: {
          select: { username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  if (!wallet) {
    throw new NotFoundError('Wallet not found', ERROR_CODES.INTERNAL_ERROR);
  }

  return {
    user,
    wallet: {
      paidBalance: Number(wallet.paidBalance),
      bonusBalance: Number(wallet.bonusBalance),
    },
    activeTokensCount,
    recentMatches: recentMatches.map((m) => ({
      id: m.id,
      status: m.status,
      stakeAmount: Number(m.stakeAmount),
      createdAt: m.createdAt,
      opponentUsername: m.opponent?.username || null,
    })),
  };
}

// ===========================================
// User Status Management
// ===========================================

/**
 * Update user status (suspend or activate).
 * Creates audit log entry.
 */
export async function updateUserStatus(
  params: UpdateUserStatusParams
): Promise<{ success: boolean; user: { id: string; status: UserStatus } }> {
  const { adminId, targetUserId, status, reason, ipAddress, userAgent } = params;

  // Prevent self-suspension
  if (adminId === targetUserId) {
    throw new BadRequestError('Cannot modify your own status', ERROR_CODES.VALIDATION_ERROR);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Get current user state
    const currentUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, status: true, email: true, username: true },
    });

    if (!currentUser) {
      throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
    }

    // Update user status
    const updatedUser = await tx.user.update({
      where: { id: targetUserId },
      data: { status },
      select: { id: true, status: true },
    });

    // If suspending, revoke all active tokens
    if (status === 'suspended') {
      await tx.refreshToken.updateMany({
        where: {
          userId: targetUserId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    // Create audit log
    await tx.adminAuditLog.create({
      data: {
        action: status === 'suspended' ? 'user_suspended' : 'user_activated',
        performedBy: adminId,
        targetUserId,
        previousState: { status: currentUser.status },
        newState: { status },
        reason,
        metadata: {
          email: currentUser.email,
          username: currentUser.username,
        },
        ipAddress,
        userAgent,
      },
    });

    return updatedUser;
  });

  logger.info(`Admin ${adminId} updated user ${targetUserId} status to ${status}`);

  return { success: true, user: result };
}

// ===========================================
// Token Revocation
// ===========================================

/**
 * Revoke all active refresh tokens for a user.
 * Forces user to re-login.
 */
export async function revokeUserTokens(
  params: RevokeUserTokensParams
): Promise<{ revokedCount: number }> {
  const { adminId, targetUserId, reason, ipAddress, userAgent } = params;

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, username: true },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Count active tokens
    const activeCount = await tx.refreshToken.count({
      where: {
        userId: targetUserId,
        revokedAt: null,
      },
    });

    // Revoke all active tokens
    await tx.refreshToken.updateMany({
      where: {
        userId: targetUserId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Create audit log
    await tx.adminAuditLog.create({
      data: {
        action: 'tokens_revoked',
        performedBy: adminId,
        targetUserId,
        previousState: { activeTokens: activeCount },
        newState: { activeTokens: 0 },
        reason,
        metadata: {
          email: user.email,
          username: user.username,
          revokedCount: activeCount,
        },
        ipAddress,
        userAgent,
      },
    });

    return { revokedCount: activeCount };
  });

  logger.info(`Admin ${adminId} revoked ${result.revokedCount} tokens for user ${targetUserId}`);

  return result;
}

// ===========================================
// Wallet Adjustments
// ===========================================

/**
 * Adjust user wallet balance (credit or debit).
 * Uses wallet service for financial operations.
 */
export async function adjustUserWallet(
  params: AdjustUserWalletParams
): Promise<{ newBalance: number }> {
  const { adminId, targetUserId, amount, type, reason, ipAddress, userAgent } = params;

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, username: true },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  // Get current wallet state for audit
  const walletBefore = await prisma.wallet.findUnique({
    where: { userId: targetUserId },
    select: { paidBalance: true, bonusBalance: true },
  });

  if (!walletBefore) {
    throw new NotFoundError('Wallet not found', ERROR_CODES.INTERNAL_ERROR);
  }

  const idempotencyKey = `admin_adjust_${adminId}_${targetUserId}_${Date.now()}`;
  const amountBigInt = BigInt(amount);

  // Perform wallet operation
  let transaction;
  if (amount > 0) {
    // Credit operation
    transaction = await creditWallet({
      userId: targetUserId,
      amount: amountBigInt,
      type,
      useBonus: type === 'BONUS',
      idempotencyKey,
      description: `Admin adjustment: ${reason}`,
      metadata: { adminId, reason },
    });
  } else {
    // Debit operation (amount is negative)
    transaction = await debitWallet({
      userId: targetUserId,
      amount: amountBigInt * BigInt(-1), // debitWallet expects positive amount
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey,
      description: `Admin adjustment: ${reason}`,
      metadata: { adminId, reason },
    });
  }

  // Get new wallet state
  const walletAfter = await prisma.wallet.findUnique({
    where: { userId: targetUserId },
    select: { paidBalance: true, bonusBalance: true },
  });

  // Create audit log
  await prisma.adminAuditLog.create({
    data: {
      action: 'wallet_adjusted',
      performedBy: adminId,
      targetUserId,
      previousState: {
        paidBalance: Number(walletBefore.paidBalance),
        bonusBalance: Number(walletBefore.bonusBalance),
      },
      newState: {
        paidBalance: Number(walletAfter!.paidBalance),
        bonusBalance: Number(walletAfter!.bonusBalance),
      },
      reason,
      metadata: {
        email: user.email,
        username: user.username,
        amount,
        type,
        transactionId: transaction.id,
      },
      ipAddress,
      userAgent,
    },
  });

  logger.info(`Admin ${adminId} adjusted wallet for user ${targetUserId} by ${amount} cents`);

  return {
    newBalance: Number(walletAfter!.paidBalance) + Number(walletAfter!.bonusBalance),
  };
}

// ===========================================
// Audit Log
// ===========================================

/**
 * List admin audit log with filtering.
 */
export async function listAuditLog(query: ListAuditLogQuery): Promise<AuditLogResult> {
  const { action, performedBy, targetUserId, page, limit } = query;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(action && { action }),
    ...(performedBy && { performedBy }),
    ...(targetUserId && { targetUserId }),
  };

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    logs,
    total,
    page,
    limit,
    totalPages,
  };
}
