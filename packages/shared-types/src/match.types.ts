// =====================================================
// Match Types
// =====================================================

export type MatchStatus = 'pending' | 'active' | 'settled' | 'cancelled' | 'disputed';
export type MatchType = 'private' | 'public';

export interface Match {
  id: string;
  type: MatchType;
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
}

export interface MatchWithDetails extends Match {
  creator: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  opponent: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  creatorSlip: SlipSummary | null;
  opponentSlip: SlipSummary | null;
}

export interface SlipSummary {
  id: string;
  totalPicks: number;
  correctPicks: number;
  pointPotential: number;
  pointsEarned: number;
  status: string;
}

export interface CreateMatchInput {
  slipId: string;
  stakeAmount: number;
  type: MatchType;
}

export interface JoinMatchInput {
  slipId: string;
}

// Stake presets (in Rival Coins)
export const STAKE_PRESETS = [1000, 5000, 10000, 25000, 50000];

// Default rake percentage
export const DEFAULT_RAKE_PERCENTAGE = 5;
