// =====================================================
// Settlement Edge Cases Types
// Task 8.5: Settlement Edge Cases
// =====================================================

import { AdminRole } from '@prisma/client';

// =====================================================
// Cancelled Game Types
// =====================================================

export interface CancelledGameResult {
  matchId: string;
  affectedPicksCount: number;
  voidPicksCount: number;
  matchStatus: 'voided' | 'active';
  refunded: boolean;
  refundTransactionIds: string[];
  reason: string;
}

export interface VoidMatchRefundResult {
  matchId: string;
  creatorRefundTxId: string;
  opponentRefundTxId: string | null;
  totalRefunded: bigint;
}

// =====================================================
// Postponed Game Types
// =====================================================

export interface PostponedGameResult {
  matchId: string;
  affectedPicksCount: number;
  nextCheckAt: Date;
  willAutoSettle: boolean;
  reason: string;
}

export interface PostponedMatchCheckResult {
  matchId: string;
  resolved: boolean;
  action: 'settled' | 'rescheduled' | 'waiting' | 'auto_cancelled';
  nextCheckAt?: Date;
}

// =====================================================
// Manual Settlement Types
// =====================================================

export type ManualSettlementAction = 'force_settle' | 'void_and_refund' | 'resolve_dispute';

export interface ManualSettlementParams {
  matchId: string;
  adminId: string;
  action: ManualSettlementAction;
  winnerId?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ManualSettlementResult {
  matchId: string;
  action: ManualSettlementAction;
  status: string;
  winnerId?: string | null;
  refunded: boolean;
  auditLogId: string;
  performedBy: string;
  performedAt: Date;
  transactionIds: string[];
}

export interface ForceSettleResult {
  auditLogId: string;
  payoutTxId: string;
  winnerPayout: bigint;
  rakeAmount: bigint;
}

export interface VoidAndRefundResult {
  auditLogId: string;
  refundTransactionIds: string[];
  totalRefunded: bigint;
}

// =====================================================
// Settlement Eligibility Types
// =====================================================

export type SettlementAction = 'settle' | 'void' | 'wait';

export interface SettlementEligibility {
  eligible: boolean;
  action: SettlementAction;
  reason: string;
  details?: {
    completedEvents: number;
    cancelledEvents: number;
    postponedEvents: number;
    totalEvents: number;
  };
}

// =====================================================
// Push Result Types
// =====================================================

export interface PushAdjustedScore {
  score: number;
  validPicks: number;
  pushedPicks: number;
  voidedPicks: number;
}

export interface ZeroRakeDecision {
  shouldApplyZeroRake: boolean;
  reason: string;
}

// =====================================================
// Idempotency Key Types
// =====================================================

export type IdempotencyKeyType =
  | 'void_refund'
  | 'cancellation_refund'
  | 'manual_payout'
  | 'manual_refund'
  | 'draw_refund'
  | 'settlement_payout';

// =====================================================
// Admin Permission Types
// =====================================================

export interface AdminPermissionCheck {
  userId: string;
  requiredRole: AdminRole;
  action: string;
}

export interface AdminPermissionResult {
  authorized: boolean;
  userRole: AdminRole | null;
  reason?: string;
}

// =====================================================
// Audit Log Types
// =====================================================

export interface EdgeCaseAuditEntry {
  matchId: string;
  action: string;
  performedBy: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  metadata: {
    reason: string;
    transactionIds?: string[];
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}

// =====================================================
// Queue Job Types
// =====================================================

export interface VoidSettlementJobData {
  matchId: string;
  reason: string;
  triggerSource: 'event_cancelled' | 'admin_void' | 'postponement_timeout';
  performedBy?: string;
}

export interface PostponedCheckJobData {
  matchId?: string; // If undefined, check all postponed matches
  force?: boolean; // Force check even if not due
}

// =====================================================
// Constants
// =====================================================

export const SETTLEMENT_EDGE_CASE_CONSTANTS = {
  // Postponement timeout in milliseconds (72 hours)
  POSTPONEMENT_TIMEOUT_MS: 72 * 60 * 60 * 1000,

  // Postponement check interval in milliseconds (24 hours)
  POSTPONEMENT_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000,

  // Transaction timeout for edge case operations (30 seconds)
  TRANSACTION_TIMEOUT_MS: 30000,

  // Minimum justification length for manual settlements
  MIN_JUSTIFICATION_LENGTH: 20,

  // Maximum justification length
  MAX_JUSTIFICATION_LENGTH: 1000,

  // High-value match threshold in cents ($1000)
  HIGH_VALUE_MATCH_THRESHOLD: 100000,
} as const;

// =====================================================
// Idempotency Key Generators
// =====================================================

/**
 * Generates deterministic idempotency key for void match refunds.
 * Format: void:{matchId}:refund:{userId}
 */
export function generateVoidMatchRefundKey(matchId: string, userId: string): string {
  return `void:${matchId}:refund:${userId}`;
}

/**
 * Generates deterministic idempotency key for cancellation refunds.
 * Format: cancellation:{matchId}:refund:{userId}
 */
export function generateCancellationRefundKey(matchId: string, userId: string): string {
  return `cancellation:${matchId}:refund:${userId}`;
}

/**
 * Generates deterministic idempotency key for manual settlement payouts.
 * Format: manual:{matchId}:payout:{userId}
 */
export function generateManualPayoutKey(matchId: string, userId: string): string {
  return `manual:${matchId}:payout:${userId}`;
}

/**
 * Generates deterministic idempotency key for manual refunds.
 * Format: manual:{matchId}:refund:{userId}
 */
export function generateManualRefundKey(matchId: string, userId: string): string {
  return `manual:${matchId}:refund:${userId}`;
}
