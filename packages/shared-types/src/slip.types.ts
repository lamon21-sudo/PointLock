// =====================================================
// Slip Types
// =====================================================

export type SlipStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' | 'VOID';
export type PickStatus = 'PENDING' | 'HIT' | 'MISS' | 'PUSH' | 'VOID';
export type PickType = 'moneyline' | 'spread' | 'total' | 'prop';

export interface Slip {
  id: string;
  userId: string;
  matchId: string | null;
  name: string | null;
  status: SlipStatus;
  totalPicks: number;
  correctPicks: number;
  pointPotential: number;
  pointsEarned: number;
  createdAt: Date;
  updatedAt: Date;
  lockedAt: Date | null;
  settledAt: Date | null;
}

export interface SlipPick {
  id: string;
  slipId: string;
  sportsEventId: string;
  pickType: PickType;
  selection: string;
  line: number | null;
  odds: number;
  propType: string | null;
  propPlayerName: string | null;
  pointValue: number;
  status: PickStatus;
  resultValue: number | null;
  createdAt: Date;
  settledAt: Date | null;
}

export interface SlipWithPicks extends Slip {
  picks: SlipPickWithEvent[];
}

export interface SlipPickWithEvent extends SlipPick {
  event: {
    id: string;
    homeTeamName: string;
    awayTeamName: string;
    scheduledAt: Date;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}

export interface CreateSlipInput {
  name?: string;
  picks: CreatePickInput[];
}

export interface CreatePickInput {
  sportsEventId: string;
  pickType: PickType;
  selection: string;
  line?: number;
  odds: number;
}

export interface UpdateSlipInput {
  name?: string;
  picks?: CreatePickInput[];
}

// Slip constraints
export const MIN_PICKS_PER_SLIP = 1;
export const MAX_PICKS_PER_SLIP = 10;

// Point value calculation helpers
export function calculatePointValue(americanOdds: number): number {
  // Convert American odds to implied probability, then to point value
  // Higher odds = higher point value (more risk = more reward)
  let impliedProbability: number;

  if (americanOdds > 0) {
    impliedProbability = 100 / (americanOdds + 100);
  } else {
    impliedProbability = Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }

  // Point value inversely proportional to probability
  // Base: 100 points, scaled by difficulty
  const pointValue = Math.round((1 / impliedProbability) * 100);

  return Math.min(Math.max(pointValue, 50), 500); // Clamp between 50-500
}

export function calculateSlipPointPotential(picks: { odds: number }[]): number {
  return picks.reduce((total, pick) => total + calculatePointValue(pick.odds), 0);
}
