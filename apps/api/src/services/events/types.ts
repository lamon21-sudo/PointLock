// =====================================================
// Events Sync Types
// =====================================================
// Type definitions for sports event fetching and syncing

import { SportType, EventStatus } from '@prisma/client';

// Re-export for convenience
export { EventStatus, SportType };

/**
 * Mapping from The Odds API sport keys to our SportType enum
 */
export const SPORT_KEY_MAP: Record<string, SportType> = {
  americanfootball_nfl: SportType.NFL,
  basketball_nba: SportType.NBA,
  baseball_mlb: SportType.MLB,
  icehockey_nhl: SportType.NHL,
  americanfootball_ncaaf: SportType.NCAAF,
  basketball_ncaab: SportType.NCAAB,
};

/**
 * Reverse mapping from SportType to The Odds API sport key
 */
export const SPORT_TYPE_TO_KEY: Record<SportType, string> = {
  [SportType.NFL]: 'americanfootball_nfl',
  [SportType.NBA]: 'basketball_nba',
  [SportType.MLB]: 'baseball_mlb',
  [SportType.NHL]: 'icehockey_nhl',
  [SportType.NCAAF]: 'americanfootball_ncaaf',
  [SportType.NCAAB]: 'basketball_ncaab',
  [SportType.SOCCER]: 'soccer_usa_mls', // Default to MLS for US
};

/**
 * Normalized event data ready for database upsert
 */
export interface NormalizedEvent {
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
  status: EventStatus;
  homeScore?: number;
  awayScore?: number;
  oddsData: OddsData;
}

/**
 * Player prop data stored in OddsData
 */
export interface PlayerPropData {
  playerId: string;
  playerName: string;
  propType: string; // e.g., "player_points", "player_pass_yds"
  line: number; // e.g., 25.5
  overOdds: number; // Decimal odds
  underOdds: number; // Decimal odds
}

/**
 * Odds data structure stored as JSONB.
 * CRITICAL: This interface must match the database schema exactly.
 */
export interface OddsData {
  provider: string;
  lastUpdated: string;
  markets: {
    moneyline?: {
      home: number;
      away: number;
    };
    spread?: {
      home: number;      // Spread line (e.g., -3.5)
      away: number;      // Spread line (e.g., +3.5)
      homeOdds: number;  // Decimal odds for home spread
      awayOdds: number;  // Decimal odds for away spread
    };
    totals?: {
      value: number;     // Total line (e.g., 45.5)
      overOdds: number;  // Decimal odds for over
      underOdds: number; // Decimal odds for under
    };
    props?: {
      lastUpdated: string;
      players: PlayerPropData[];
    };
  };
}

/**
 * Result of a sync operation for a single sport
 */
export interface SportSyncResult {
  sport: SportType;
  success: boolean;
  eventsProcessed: number;
  eventsCreated: number;
  eventsUpdated: number;
  errors: string[];
  duration: number; // milliseconds
}

/**
 * Result of a full sync operation (all sports)
 */
export interface FullSyncResult {
  success: boolean;
  sports: SportSyncResult[];
  totalEventsProcessed: number;
  totalEventsCreated: number;
  totalEventsUpdated: number;
  totalDuration: number;
  timestamp: string;
}

/**
 * Interface for sport-specific event fetchers.
 * Implement this to add support for new sports or data providers.
 */
export interface SportsFetcher {
  /**
   * The sport type this fetcher handles
   */
  readonly sportType: SportType;

  /**
   * Human-readable name for logging
   */
  readonly name: string;

  /**
   * Fetch upcoming events for this sport
   * @returns Array of normalized events ready for database upsert
   */
  fetchUpcomingEvents(): Promise<NormalizedEvent[]>;

  /**
   * Check if the fetcher is configured and ready
   */
  isConfigured(): boolean;
}
