// =====================================================
// Auth Service
// =====================================================
// Handles all authentication business logic.
// CRITICAL: User + Wallet creation is ATOMIC - both succeed or both fail.

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import type { RegisterInput, LoginInput } from './auth.schemas';

// ===========================================
// Types
// ===========================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: AuthenticatedUser;
  tokens: TokenPair;
  wallet: {
    totalBalance: number;
    paidBalance: number;
    bonusBalance: number;
  };
}

interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

// ===========================================
// Constants
// ===========================================

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// Task 0.4: Starter coins credited on registration
// This is the ONLY place this value should be defined - never hardcode elsewhere
const STARTER_COINS = 750;

// ===========================================
// Helper Functions
// ===========================================

function generateTokenPair(userId: string, email: string): TokenPair {
  const accessPayload: JwtPayload = {
    sub: userId,
    email,
    type: 'access',
  };

  const refreshPayload: JwtPayload = {
    sub: userId,
    email,
    type: 'refresh',
  };

  // Cast expiresIn to satisfy jsonwebtoken's strict typing
  const accessToken = jwt.sign(accessPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function bigIntToNumber(value: bigint): number {
  // Safe conversion for wallet balances (stored in cents/smallest unit)
  return Number(value);
}

// ===========================================
// Auth Service Functions
// ===========================================

/**
 * Register a new user with atomic User + Wallet creation.
 * CRITICAL: If wallet creation fails, user creation is rolled back.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const { email, username, password } = input;

  // Check for existing email
  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingEmail) {
    throw new ConflictError(
      'Email already registered',
      ERROR_CODES.EMAIL_ALREADY_EXISTS
    );
  }

  // Check for existing username
  const existingUsername = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existingUsername) {
    throw new ConflictError(
      'Username already taken',
      ERROR_CODES.USERNAME_ALREADY_EXISTS
    );
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // CRITICAL: Atomic transaction for User + Wallet creation
  // Both MUST succeed or both MUST fail. No orphaned records.
  const result = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        status: 'pending_verification',
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    // Create wallet with starter coins - MUST succeed or entire transaction fails
    // Task 0.4: New users receive STARTER_COINS as bonus balance
    const starterCoinsAmount = BigInt(STARTER_COINS);
    const wallet = await tx.wallet.create({
      data: {
        userId: user.id,
        paidBalance: BigInt(0),
        bonusBalance: starterCoinsAmount,
      },
    });

    // Task 0.4: Record starter credit transaction for audit trail
    // This uses idempotencyKey to prevent double-credit (though user creation
    // uniqueness already prevents this, belt-and-suspenders approach)
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: 'STARTER_CREDIT',
        status: 'completed',
        amount: starterCoinsAmount,
        paidAmount: BigInt(0),
        bonusAmount: starterCoinsAmount,
        balanceBefore: BigInt(0),
        balanceAfter: starterCoinsAmount,
        idempotencyKey: `STARTER_CREDIT-${user.id}`,
        description: 'Welcome bonus: starter coins on registration',
        completedAt: new Date(),
      },
    });

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email);

    // Store hashed refresh token
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(
      refreshTokenExpiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS
    );

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        token: hashToken(tokens.refreshToken),
        expiresAt: refreshTokenExpiry,
      },
    });

    logger.info(`User registered: ${user.id} (${user.email})`);

    return {
      user,
      tokens,
      wallet: {
        totalBalance: bigIntToNumber(wallet.paidBalance + wallet.bonusBalance),
        paidBalance: bigIntToNumber(wallet.paidBalance),
        bonusBalance: bigIntToNumber(wallet.bonusBalance),
      },
    };
  });

  return result;
}

/**
 * Authenticate user with email and password.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  // Find user with wallet
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      wallet: true,
    },
  });

  if (!user) {
    // Use generic message to prevent email enumeration
    throw new UnauthorizedError(
      'Invalid credentials',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new UnauthorizedError(
      'Invalid credentials',
      ERROR_CODES.INVALID_CREDENTIALS
    );
  }

  // Check user status
  if (user.status === 'banned') {
    throw new UnauthorizedError(
      'Account has been banned',
      ERROR_CODES.FORBIDDEN
    );
  }

  if (user.status === 'suspended') {
    throw new UnauthorizedError(
      'Account is suspended',
      ERROR_CODES.FORBIDDEN
    );
  }

  // Generate tokens
  const tokens = generateTokenPair(user.id, user.email);

  // Store hashed refresh token and update last login
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(
    refreshTokenExpiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS
  );

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashToken(tokens.refreshToken),
        expiresAt: refreshTokenExpiry,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  logger.info(`User logged in: ${user.id} (${user.email})`);

  // Handle case where wallet doesn't exist (shouldn't happen with proper registration)
  if (!user.wallet) {
    logger.error(`User ${user.id} has no wallet - data integrity issue!`);
    throw new BadRequestError('Account setup incomplete. Please contact support.');
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    tokens,
    wallet: {
      totalBalance: bigIntToNumber(
        user.wallet.paidBalance + user.wallet.bonusBalance
      ),
      paidBalance: bigIntToNumber(user.wallet.paidBalance),
      bonusBalance: bigIntToNumber(user.wallet.bonusBalance),
    },
  };
}

/**
 * Refresh access token using refresh token.
 * Implements token rotation: old token is invalidated, new pair is issued.
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  // Verify the refresh token
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new UnauthorizedError('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
  }

  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type', ERROR_CODES.TOKEN_INVALID);
  }

  const hashedToken = hashToken(refreshToken);

  // Find the stored refresh token
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: { user: true },
  });

  if (!storedToken) {
    // Token not found - possible token reuse attack
    logger.warn(`Refresh token not found for user ${payload.sub} - possible reuse attack`);

    // Revoke all refresh tokens for this user as a security measure
    await prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw new UnauthorizedError('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
  }

  // Check if token was already revoked
  if (storedToken.revokedAt) {
    logger.warn(`Attempted use of revoked token for user ${payload.sub}`);
    throw new UnauthorizedError('Token has been revoked', ERROR_CODES.TOKEN_INVALID);
  }

  // Check if token is expired (redundant with JWT check, but good defense in depth)
  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired', ERROR_CODES.TOKEN_EXPIRED);
  }

  // TOKEN ROTATION: Revoke old token and issue new pair
  const newTokens = generateTokenPair(storedToken.userId, storedToken.user.email);
  const newRefreshTokenExpiry = new Date();
  newRefreshTokenExpiry.setDate(
    newRefreshTokenExpiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS
  );

  await prisma.$transaction([
    // Revoke old token
    prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    }),
    // Create new token
    prisma.refreshToken.create({
      data: {
        userId: storedToken.userId,
        token: hashToken(newTokens.refreshToken),
        expiresAt: newRefreshTokenExpiry,
      },
    }),
  ]);

  logger.info(`Token refreshed for user: ${storedToken.userId}`);

  return newTokens;
}

/**
 * Logout user by revoking their refresh token.
 */
export async function logout(refreshToken: string): Promise<void> {
  const hashedToken = hashToken(refreshToken);

  const result = await prisma.refreshToken.updateMany({
    where: { token: hashedToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    logger.warn('Logout attempted with invalid or already revoked token');
  }
}

/**
 * Logout user from all devices by revoking all refresh tokens.
 */
export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  logger.info(`All sessions revoked for user: ${userId}`);
}

/**
 * Verify access token and return user data.
 */
export async function verifyAccessToken(
  token: string
): Promise<AuthenticatedUser> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new UnauthorizedError('Invalid access token', ERROR_CODES.TOKEN_INVALID);
  }

  if (payload.type !== 'access') {
    throw new UnauthorizedError('Invalid token type', ERROR_CODES.TOKEN_INVALID);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  if (user.status === 'banned' || user.status === 'suspended') {
    throw new UnauthorizedError('Account is not active', ERROR_CODES.FORBIDDEN);
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Check if username is available.
 * CRITICAL: This is a public endpoint - must not leak information.
 * Returns only a boolean flag, always with 200 OK status.
 *
 * @param username - Username to check (already sanitized by Zod: trimmed, lowercased)
 * @returns Promise<boolean> - true if available, false if taken
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  // Query only the ID field for performance - we don't need full user data
  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  // Return true if username is available (no user found)
  return existingUser === null;
}
