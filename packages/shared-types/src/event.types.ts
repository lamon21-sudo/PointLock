// =====================================================
// Sports Event Types
// =====================================================

export type SportType = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'SOCCER' | 'NCAAF' | 'NCAAB';

export type EventStatus =
  | 'scheduled'
  | 'in_progress'
  | 'halftime'
  | 'final'
  | 'postponed'
  | 'cancelled';

export interface SportsEvent {
  id: string;
  externalId: string;
  sport: SportType;
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamAbbr?: string;
  homeTeamLogo?: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamAbbr?: string;
  awayTeamLogo?: string;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
  status: EventStatus;
  oddsData: EventOdds;
  oddsUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventOdds {
  moneyline: MoneylineOdds;
  spread: SpreadOdds;
  total: TotalOdds;
  props?: PropOdds[];
}

export interface MoneylineOdds {
  home: number; // American odds, e.g., -150
  away: number; // American odds, e.g., +130
}

export interface SpreadOdds {
  home: {
    line: number; // e.g., -3.5
    odds: number; // e.g., -110
  };
  away: {
    line: number; // e.g., +3.5
    odds: number; // e.g., -110
  };
}

export interface TotalOdds {
  line: number; // e.g., 45.5
  over: number; // American odds
  under: number; // American odds
}

export interface PropOdds {
  playerId: string;
  playerName: string;
  propType: string; // e.g., "passing_yards", "touchdowns"
  line: number; // e.g., 280.5
  over: number; // American odds
  under: number; // American odds
}

export interface EventsQueryParams {
  sport?: SportType;
  date?: string; // ISO date string
  startDate?: string;
  endDate?: string;
  status?: EventStatus;
  page?: number;
  limit?: number;
}

// Supported sports for MVP
export const SUPPORTED_SPORTS: SportType[] = ['NFL', 'NBA'];

// Event display helpers
export function formatOdds(americanOdds: number): string {
  if (americanOdds > 0) {
    return `+${americanOdds}`;
  }
  return americanOdds.toString();
}

export function formatSpread(line: number): string {
  if (line > 0) {
    return `+${line}`;
  }
  return line.toString();
}
