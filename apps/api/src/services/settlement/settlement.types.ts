// =====================================================
// Settlement Service Types
// =====================================================
// Type definitions for the PvP match settlement system.
// These types ensure strict typing across all settlement operations.

import { PickType, PickStatus, SlipStatus, MatchStatus } from '@prisma/client';

// ===========================================
// Input Types
// ===========================================

/**
 * Input for evaluating a single pick result.
 * Contains the pick details needed to determine HIT/MISS/PUSH/VOID.
 */
export interface PickResultInput {
  id: string;
  pickType: PickType;
  selection: string;        // 'home', 'away', 'over', 'under'
  line: number | null;      // Spread or total line (e.g., -7.5, 215.5)
  pointValue: number;       // Points this pick is worth if HIT
}

/**
 * Event scores needed for pick evaluation.
 * Represents the final state of a sports event.
 */
export interface EventScores {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;           // 'final', 'cancelled', 'postponed', etc.
}

/**
 * Combined pick and event data for settlement.
 */
export interface PickWithEvent {
  pick: PickResultInput;
  event: EventScores;
}

// ===========================================
// Output Types
// ===========================================

/**
 * Result of evaluating a single pick.
 */
export interface PickResultOutput {
  pickId: string;
  status: PickStatus;
  resultValue: number | null;   // The actual value used in calculation
  reason: string;               // Human-readable explanation
}

/**
 * Result of scoring a slip (collection of picks).
 */
export interface SlipScoreResult {
  slipId: string;
  pointsEarned: number;
  correctPicks: number;
  totalValidPicks: number;      // Excludes VOID picks
  pickResults: PickResultOutput[];
  status: SlipStatus;           // WON, LOST, or VOID
}

/**
 * Result of determining the match winner.
 */
export interface MatchWinnerResult {
  winnerId: string | null;      // null if draw
  isDraw: boolean;
  creatorPoints: number;
  opponentPoints: number;
  reason: string;
}

/**
 * Complete settlement result for a match.
 */
export interface SettlementResult {
  matchId: string;
  status: MatchStatus;
  winnerId: string | null;
  isDraw: boolean;
  creatorPoints: number;
  opponentPoints: number;
  totalPot: bigint;
  rakeAmount: bigint;
  winnerPayout: bigint | null;
  settlementTxId: string | null;
  rakeTxId: string | null;
  creatorRefundTxId: string | null;
  opponentRefundTxId: string | null;
  reason: string;
  settledAt: Date;
}

// ===========================================
// Database Query Types
// ===========================================

/**
 * Match data structure as retrieved from database for settlement.
 */
export interface MatchForSettlement {
  id: string;
  status: MatchStatus;
  stakeAmount: bigint;
  rakePercentage: number;
  creatorId: string;
  opponentId: string | null;
  creatorSlipId: string | null;
  opponentSlipId: string | null;
  version: number;
  creatorSlip: SlipForSettlement | null;
  opponentSlip: SlipForSettlement | null;
}

/**
 * Slip data structure as retrieved from database for settlement.
 */
export interface SlipForSettlement {
  id: string;
  userId: string;
  status: SlipStatus;
  totalPicks: number;
  pointPotential: number;
  picks: PickForSettlement[];
}

/**
 * Pick data structure as retrieved from database for settlement.
 */
export interface PickForSettlement {
  id: string;
  pickType: PickType;
  selection: string;
  line: number | null;
  pointValue: number;
  status: PickStatus;
  event: {
    id: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  };
}

// ===========================================
// Constants
// ===========================================

/**
 * Event statuses that indicate the game is complete and can be settled.
 */
export const FINAL_EVENT_STATUSES = ['final', 'FINAL', 'completed', 'COMPLETED'] as const;

/**
 * Event statuses that indicate the pick should be voided.
 */
export const VOID_EVENT_STATUSES = [
  'cancelled',
  'CANCELLED',
  'postponed',
  'POSTPONED',
  'suspended',
  'SUSPENDED',
] as const;

/**
 * Selection values for home team picks.
 */
export const HOME_SELECTIONS = ['home', 'HOME', 'h', 'H'] as const;

/**
 * Selection values for away team picks.
 */
export const AWAY_SELECTIONS = ['away', 'AWAY', 'a', 'A'] as const;

/**
 * Selection values for over picks.
 */
export const OVER_SELECTIONS = ['over', 'OVER', 'o', 'O'] as const;

/**
 * Selection values for under picks.
 */
export const UNDER_SELECTIONS = ['under', 'UNDER', 'u', 'U'] as const;
