// =====================================================
// Wallet Types
// =====================================================
// Type definitions matching the backend wallet API responses.
// These types ensure strict type safety for wallet operations.

/**
 * Transaction types as defined by the backend.
 * Maps to the Prisma TransactionType enum.
 */
export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'MATCH_ENTRY'
  | 'MATCH_WIN'
  | 'MATCH_REFUND'
  | 'RAKE_FEE'
  | 'BONUS'
  | 'WEEKLY_ALLOWANCE'
  | 'ADMIN_ADJUSTMENT';

/**
 * Transaction status values.
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/**
 * Individual transaction record from the API.
 * Matches the backend TransactionResult interface.
 */
export interface Transaction {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  /** Amount in cents. Positive for credits, negative for debits. */
  amount: number;
  /** Portion of amount from paid balance (cents). */
  paidAmount: number;
  /** Portion of amount from bonus balance (cents). */
  bonusAmount: number;
  /** Total balance before this transaction (cents). */
  balanceBefore: number;
  /** Total balance after this transaction (cents). */
  balanceAfter: number;
  /** Associated match ID for match-related transactions. */
  matchId: string | null;
  /** Human-readable description. */
  description: string | null;
  /** ISO timestamp of transaction creation. */
  createdAt: string;
}

/**
 * Wallet statistics from cumulative tracking.
 */
export interface WalletStats {
  /** Total amount deposited (cents). */
  totalDeposited: number;
  /** Total amount won from matches (cents). */
  totalWon: number;
  /** Total amount lost in matches (cents). */
  totalLost: number;
  /** Total rake fees paid (cents). */
  totalRakePaid: number;
}

/**
 * Full wallet response from GET /wallet endpoint.
 */
export interface Wallet {
  id: string;
  userId: string;
  /** Withdrawable cash balance (cents). */
  paidBalance: number;
  /** Promotional/bonus balance (cents). Non-withdrawable. */
  bonusBalance: number;
  /** Combined total balance (cents). */
  totalBalance: number;
  /** Cumulative statistics. */
  stats: WalletStats;
}

/**
 * Pagination metadata from API responses.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Response structure for transaction history endpoint.
 */
export interface TransactionHistoryResponse {
  transactions: Transaction[];
  pagination: PaginationMeta;
}

/**
 * Weekly allowance eligibility details.
 */
export interface AllowanceEligibility {
  eligible: boolean;
  reason: string;
  lastClaimedAt: string | null;
  nextAvailableAt: string | null;
  daysUntilAvailable: number;
  hoursUntilAvailable: number;
}

/**
 * Response from allowance check endpoint.
 */
export interface AllowanceCheckResponse {
  eligible: boolean;
  eligibility: AllowanceEligibility;
  currentBalance: number;
  allowanceAmount: number;
}

/**
 * Response from allowance claim endpoint.
 */
export interface AllowanceClaimResponse {
  claimed: boolean;
  amount: number;
  newBalance: number;
  transactionId: string | null;
  nextClaimAt: string;
  message: string;
}

// =====================================================
// UI Helper Types
// =====================================================

/**
 * Simplified transaction type categories for UI display.
 * Groups similar transaction types for icon and color selection.
 */
export type TransactionCategory = 'credit' | 'debit' | 'bonus' | 'refund';

/**
 * Maps transaction types to UI-friendly categories.
 */
export function getTransactionCategory(type: TransactionType): TransactionCategory {
  switch (type) {
    case 'DEPOSIT':
    case 'MATCH_WIN':
      return 'credit';
    case 'WITHDRAWAL':
    case 'MATCH_ENTRY':
    case 'RAKE_FEE':
      return 'debit';
    case 'BONUS':
    case 'WEEKLY_ALLOWANCE':
    case 'ADMIN_ADJUSTMENT':
      return 'bonus';
    case 'MATCH_REFUND':
      return 'refund';
    default:
      return 'debit';
  }
}

/**
 * Formats cents value to display currency string.
 * @param cents - Amount in cents
 * @param showSign - Whether to show +/- prefix
 */
export function formatCurrency(cents: number, showSign: boolean = false): string {
  const dollars = Math.abs(cents) / 100;
  const formatted = dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (showSign) {
    return cents >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }

  return `$${formatted}`;
}

/**
 * Formats cents as RC (Rival Coins) for in-app display.
 * @param cents - Amount in cents
 * @param showSign - Whether to show +/- prefix
 */
export function formatRC(cents: number, showSign: boolean = false): string {
  const amount = Math.abs(cents);
  const formatted = amount.toLocaleString('en-US');

  if (showSign) {
    return cents >= 0 ? `+${formatted} RC` : `-${formatted} RC`;
  }

  return `${formatted} RC`;
}
