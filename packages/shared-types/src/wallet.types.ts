// =====================================================
// Wallet Types
// =====================================================

export type TransactionType =
  | 'purchase'
  | 'bonus'
  | 'match_entry'
  | 'match_win'
  | 'match_refund'
  | 'rake_fee'
  | 'utility_purchase'
  | 'adjustment';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface Wallet {
  id: string;
  userId: string;
  paidBalance: number;
  bonusBalance: number;
  totalBalance: number;
  totalDeposited: number;
  totalWon: number;
  totalLost: number;
  totalRakePaid: number;
  lastAllowanceAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  paidAmount: number;
  bonusAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  matchId: string | null;
  description: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface WalletBalance {
  paidBalance: number;
  bonusBalance: number;
  totalBalance: number;
}

export interface TransactionHistoryItem {
  id: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  createdAt: Date;
}

// Token pack definitions
export interface TokenPack {
  id: string;
  name: string;
  coins: number;
  bonusCoins: number;
  priceUsd: number;
  popular?: boolean;
}

export const TOKEN_PACKS: TokenPack[] = [
  { id: 'rookie', name: 'Rookie Pack', coins: 5000, bonusCoins: 0, priceUsd: 4.99 },
  { id: 'pro', name: 'Pro Pack', coins: 20000, bonusCoins: 2000, priceUsd: 19.99, popular: true },
  { id: 'high_roller', name: 'High Roller', coins: 50000, bonusCoins: 10000, priceUsd: 49.99 },
  { id: 'whale', name: 'Whale Pack', coins: 100000, bonusCoins: 30000, priceUsd: 99.99 },
];

// Weekly allowance
export const WEEKLY_ALLOWANCE_AMOUNT = 1000;
