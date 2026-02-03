// =====================================================
// Matchmaking Schemas
// =====================================================
// Zod schemas for request validation and response types.

import { z } from 'zod';
import { GameMode, PickTier, QueueStatus } from '@prisma/client';

// ===========================================
// Request Schemas
// ===========================================

/**
 * Schema for joining the matchmaking queue.
 */
export const joinQueueSchema = z.object({
  body: z.object({
    slipId: z.string().uuid('Invalid slip ID'),
    stakeAmount: z.coerce.number().positive('Stake must be positive'),
    region: z.string().optional(),
    idempotencyKey: z.string().optional(),
  }),
});

/**
 * Schema for leaving the matchmaking queue.
 */
export const leaveQueueSchema = z.object({
  params: z.object({
    gameMode: z.enum(['QUICK_MATCH']),
  }),
});

/**
 * Schema for getting queue status.
 */
export const queueStatusSchema = z.object({
  params: z.object({
    gameMode: z.enum(['QUICK_MATCH']),
  }),
});

// ===========================================
// Response Types
// ===========================================

export interface QueueEntryResponse {
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

export interface QueueStatusResponse {
  entry: QueueEntryResponse | null;
  position?: number;
  estimatedWaitMs?: number;
}

export interface QueueLeaveResponse {
  success: boolean;
  refunded: boolean;
  message: string;
}

// ===========================================
// Type Exports
// ===========================================

export type JoinQueueInput = z.infer<typeof joinQueueSchema>['body'];
