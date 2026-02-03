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
  oddsData: EventOdds | null;
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
export const SUPPORTED_SPORTS: SportType[] = ['NBA', 'NFL', 'MLB', 'NHL'];

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

// ===========================================
// Player Prop Display Helpers
// ===========================================

/**
 * Human-readable display names for prop types
 */
export const PROP_TYPE_DISPLAY: Record<string, string> = {
  // NBA Props
  player_points: 'Points',
  player_rebounds: 'Rebounds',
  player_assists: 'Assists',
  player_threes: '3-Pointers',
  player_points_rebounds_assists: 'PRA',
  player_steals: 'Steals',
  player_blocks: 'Blocks',
  // NFL Props
  player_pass_tds: 'Pass TDs',
  player_pass_yds: 'Pass Yards',
  player_rush_yds: 'Rush Yards',
  player_receptions: 'Receptions',
  player_reception_yds: 'Rec Yards',
  player_anytime_td: 'Anytime TD',
};

/**
 * Format a prop type to human-readable text
 */
export function formatPropType(propType: string): string {
  return PROP_TYPE_DISPLAY[propType] || propType.replace(/_/g, ' ').replace(/player /i, '');
}

/**
 * Format a prop line with Over/Under prefix
 */
export function formatPropLine(line: number, selection: 'over' | 'under'): string {
  const prefix = selection === 'over' ? 'O' : 'U';
  return `${prefix} ${line}`;
}
