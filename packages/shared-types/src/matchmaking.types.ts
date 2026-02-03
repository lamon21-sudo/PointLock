/**
 * Task 0.3: Matchmaking Queue Types
 * Defines types for the auto-matchmaking system
 */

import { PickTier } from './tier.types';
import { Rank } from './ranked.types';
import { GameMode } from './gamemode.types';

export enum QueueStatus {
  WAITING = 'WAITING',     // Actively waiting in queue
  MATCHED = 'MATCHED',     // Match found, transitioning
  EXPIRED = 'EXPIRED',     // Queue entry timed out
  CANCELLED = 'CANCELLED', // User manually cancelled
}

export interface MatchmakingQueueEntry {
  id: string;
  userId: string;
  gameMode: GameMode;
  tier: PickTier;
  rank?: Rank | null;
  stakeAmount: bigint | number;
  skillRating: number;
  region?: string | null;
  status: QueueStatus;
  enqueuedAt: Date;
  matchedAt?: Date | null;
  expiresAt: Date;
  matchId?: string | null;
}

export interface EnqueuePayload {
  gameMode: GameMode;
  stakeAmount: number;
  region?: string;
}

export interface QueueStatusResponse {
  entry: MatchmakingQueueEntry | null;
  estimatedWaitTimeMs?: number;
  position?: number;
}

export interface MatchFoundEvent {
  queueEntryId: string;
  matchId: string;
  opponentId: string;
  opponentUsername: string;
  stakeAmount: number;
}
