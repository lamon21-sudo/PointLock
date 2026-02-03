// =====================================================
// Match Validation Schemas & Types
// =====================================================
// Zod schemas for request validation and TypeScript types for type safety.

import { z } from 'zod';
import { MatchStatus, GameMode, PickTier, QueueStatus } from '@prisma/client';

// ===========================================
// Request Validation Schemas
// ===========================================

/**
 * Schema for creating a new match.
 * - slipId: UUID of creator's slip (must be DRAFT with picks)
 * - stakeAmount: Entry fee in cents (100 = $1, max 100000 = $1000)
 * - inviteExpiresIn: Hours until invite expires (1-168h, default 24h)
 */
export const createMatchSchema = z.object({
  slipId: z.string().uuid('Invalid slip ID format'),
  stakeAmount: z
    .number()
    .int('Stake must be an integer')
    .min(100, 'Minimum stake is $1 (100 cents)')
    .max(100000, 'Maximum stake is $1000 (100,000 cents)'),
  inviteExpiresIn: z
    .number()
    .int('Expiry time must be an integer')
    .min(1, 'Minimum expiry is 1 hour')
    .max(168, 'Maximum expiry is 168 hours (7 days)')
    .optional()
    .default(24),
});

/**
 * Schema for joining a match.
 * - slipId: UUID of opponent's slip (must be DRAFT with picks)
 */
export const joinMatchSchema = z.object({
  slipId: z.string().uuid('Invalid slip ID format'),
});

/**
 * Schema for listing matches with filters.
 * - status: Comma-separated list of statuses to filter by
 * - role: Filter by user role (creator, opponent, or any)
 * - page: Page number for pagination (min 1)
 * - limit: Items per page (max 100)
 */
export const listMatchesQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val.split(',').map((s) => s.trim());
    }),
  role: z
    .enum(['creator', 'opponent', 'any'])
    .optional()
    .default('any'),
  page: z
    .string()
    .optional()
    .transform((val) => parseInt(val || '1', 10))
    .pipe(z.number().int().min(1, 'Page must be at least 1')),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(parseInt(val || '20', 10), 100))
    .pipe(z.number().int().min(1).max(100)),
});

/**
 * Schema for quick match (auto-queue matchmaking).
 * Delegates to matchmaking service with QUICK_MATCH mode.
 */
export const quickMatchSchema = z.object({
  body: z.object({
    slipId: z.string().uuid('Invalid slip ID format'),
    stakeAmount: z
      .number()
      .int('Stake must be an integer')
      .min(100, 'Minimum stake is $1 (100 cents)')
      .max(100000, 'Maximum stake is $1000 (100,000 cents)'),
    region: z.string().optional(),
    idempotencyKey: z.string().optional(),
  }),
});

/**
 * Schema for random match (create browsable public lobby).
 */
export const randomMatchSchema = z.object({
  body: z.object({
    slipId: z.string().uuid('Invalid slip ID format'),
    stakeAmount: z
      .number()
      .int('Stake must be an integer')
      .min(100, 'Minimum stake is $1 (100 cents)')
      .max(100000, 'Maximum stake is $1000 (100,000 cents)'),
    lobbyExpiresIn: z
      .number()
      .int('Expiry time must be an integer')
      .min(1, 'Minimum expiry is 1 hour')
      .max(24, 'Maximum expiry is 24 hours')
      .optional()
      .default(1),
  }),
});

/**
 * Schema for direct friend challenge.
 * Target userId comes from URL params.
 */
export const challengeFriendSchema = z.object({
  body: z.object({
    slipId: z.string().uuid('Invalid slip ID format'),
    stakeAmount: z
      .number()
      .int('Stake must be an integer')
      .min(100, 'Minimum stake is $1 (100 cents)')
      .max(100000, 'Maximum stake is $1000 (100,000 cents)'),
    message: z.string().max(200, 'Message too long').optional(),
  }),
  params: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
});

// ===========================================
// TypeScript Types
// ===========================================

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type JoinMatchInput = z.infer<typeof joinMatchSchema>;
export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;

/**
 * Match details returned by the API.
 * BigInt fields are converted to numbers for JSON serialization.
 */
export interface MatchDetails {
  id: string;
  type: string;
  stakeAmount: number;
  rakePercentage: number;
  creatorId: string;
  opponentId: string | null;
  winnerId: string | null;
  creatorSlipId: string | null;
  opponentSlipId: string | null;
  creatorPoints: number;
  opponentPoints: number;
  status: MatchStatus;
  settledAt: Date | null;
  settlementReason: string | null;
  totalPot: number | null;
  rakeAmount: number | null;
  winnerPayout: number | null;
  inviteCode: string | null;
  inviteExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  version: number;
  matchedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;

  // Relations (optional for list view)
  creator?: UserBasic;
  opponent?: UserBasic | null;
  winner?: UserBasic | null;
  creatorSlip?: SlipBasic | null;
  opponentSlip?: SlipBasic | null;
}

/**
 * Simplified match item for list views.
 */
export interface MatchListItem {
  id: string;
  type: string;
  stakeAmount: number;
  status: MatchStatus;
  creatorId: string;
  opponentId: string | null;
  winnerId: string | null;
  inviteCode: string | null;
  inviteExpiresAt: Date | null;
  createdAt: Date;
  matchedAt: Date | null;
  settledAt: Date | null;

  // Cached denormalized fields for performance
  creatorUsername: string | null;
  opponentUsername: string | null;
}

/**
 * Paginated match list response.
 */
export interface PaginatedMatches {
  matches: MatchListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Basic user info for relations.
 */
export interface UserBasic {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

/**
 * Basic slip info for relations.
 */
export interface SlipBasic {
  id: string;
  status: string;
  totalPicks: number;
  totalOdds: number;
  createdAt: Date;
  picks?: PickBasic[];
}

/**
 * Basic pick info for slip relations.
 */
export interface PickBasic {
  id: string;
  eventId: string;
  team: string;
  odds: number;
  result: string | null;
}

// ===========================================
// Queue & Match Response Types (Task 2.2)
// ===========================================

/**
 * Queue entry info for status responses.
 */
export interface QueueEntryInfo {
  id: string;
  userId: string;
  gameMode: GameMode;
  tier: PickTier;
  stakeAmount: number;
  skillRating: number;
  slipSize: number | null;
  status: QueueStatus;
  enqueuedAt: string;
  expiresAt: string;
  matchId: string | null;
}

/**
 * Response for POST /matches/quick endpoint.
 */
export interface QuickMatchResponse {
  status: 'QUEUED' | 'MATCHED';
  queueEntry?: QueueEntryInfo;
  match?: MatchDetails;
}

/**
 * Response for POST /matches/random endpoint.
 */
export interface RandomMatchResponse {
  status: 'LOBBY_CREATED';
  match: MatchDetails;
  lobbyCode: string;
}

/**
 * Response for POST /matches/friend/:userId endpoint.
 */
export interface FriendChallengeResponse {
  status: 'CHALLENGE_SENT';
  match: MatchDetails;
  targetUserId: string;
}

/**
 * Response for GET /matches/queue/status endpoint.
 */
export interface QueueStatusResponse {
  inQueue: boolean;
  entry: QueueEntryInfo | null;
  position?: number;
  estimatedWaitMs?: number;
}

// ===========================================
// Input Types (Task 2.2)
// ===========================================

export type QuickMatchInput = z.infer<typeof quickMatchSchema>['body'];
export type RandomMatchInput = z.infer<typeof randomMatchSchema>['body'];
export type ChallengeFriendInput = z.infer<typeof challengeFriendSchema>['body'];

// ===========================================
// Prisma Select Objects
// ===========================================

/**
 * Prisma select for user basic info.
 */
export const USER_BASIC_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
} as const;

/**
 * Prisma select for slip basic info (without picks).
 */
export const SLIP_BASIC_SELECT = {
  id: true,
  status: true,
  totalPicks: true,
  totalOdds: true,
  createdAt: true,
} as const;

/**
 * Prisma select for pick basic info.
 */
export const PICK_BASIC_SELECT = {
  id: true,
  eventId: true,
  team: true,
  odds: true,
  result: true,
} as const;

/**
 * Prisma select for full slip with picks.
 */
export const SLIP_WITH_PICKS_SELECT = {
  ...SLIP_BASIC_SELECT,
  picks: {
    select: PICK_BASIC_SELECT,
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Prisma select for full match details with relations.
 */
export const MATCH_DETAILS_SELECT = {
  id: true,
  type: true,
  stakeAmount: true,
  rakePercentage: true,
  creatorId: true,
  opponentId: true,
  winnerId: true,
  creatorSlipId: true,
  opponentSlipId: true,
  creatorPoints: true,
  opponentPoints: true,
  status: true,
  settledAt: true,
  settlementReason: true,
  totalPot: true,
  rakeAmount: true,
  winnerPayout: true,
  inviteCode: true,
  inviteExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  version: true,
  matchedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  creator: {
    select: USER_BASIC_SELECT,
  },
  opponent: {
    select: USER_BASIC_SELECT,
  },
  winner: {
    select: USER_BASIC_SELECT,
  },
  creatorSlip: {
    select: SLIP_WITH_PICKS_SELECT,
  },
  opponentSlip: {
    select: SLIP_WITH_PICKS_SELECT,
  },
} as const;

/**
 * Prisma select for match list items.
 */
export const MATCH_LIST_SELECT = {
  id: true,
  type: true,
  stakeAmount: true,
  status: true,
  creatorId: true,
  opponentId: true,
  winnerId: true,
  inviteCode: true,
  inviteExpiresAt: true,
  createdAt: true,
  matchedAt: true,
  settledAt: true,
  creatorUsername: true,
  opponentUsername: true,
} as const;
