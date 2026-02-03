// =====================================================
// Sports Data Provider Types
// =====================================================
// Provider-agnostic type definitions for sports data

import { SportType, EventStatus } from '@prisma/client';

// Re-export for convenience
export { EventStatus, SportType };

/**
 * Supported sports for odds fetching (The Odds API format)
 */
export type Sport =
  | 'americanfootball_nfl'
  | 'americanfootball_ncaaf'
  | 'basketball_nba'
  | 'basketball_ncaab'
  | 'baseball_mlb'
  | 'icehockey_nhl'
  | 'soccer_usa_mls'
  | 'mma_mixed_martial_arts';

/**
 * Market types for betting odds
 */
export type MarketType = 'h2h' | 'spreads' | 'totals' | PlayerPropMarket;

/**
 * Player prop market types (The Odds API format)
 */
export type PlayerPropMarket =
  // NBA Props
  | 'player_points'
  | 'player_rebounds'
  | 'player_assists'
  | 'player_threes'
  | 'player_points_rebounds_assists'
  // NFL Props
  | 'player_pass_tds'
  | 'player_pass_yds'
  | 'player_rush_yds'
  | 'player_receptions'
  | 'player_reception_yds'
  | 'player_anytime_td';

/**
 * All player prop markets
 */
export const PLAYER_PROP_MARKETS: PlayerPropMarket[] = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'player_points_rebounds_assists',
  'player_pass_tds',
  'player_pass_yds',
  'player_rush_yds',
  'player_receptions',
  'player_reception_yds',
  'player_anytime_td',
];

/**
 * NBA-specific prop markets
 */
export const NBA_PROP_MARKETS: PlayerPropMarket[] = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'player_points_rebounds_assists',
];

/**
 * NFL-specific prop markets
 */
export const NFL_PROP_MARKETS: PlayerPropMarket[] = [
  'player_pass_tds',
  'player_pass_yds',
  'player_rush_yds',
  'player_receptions',
  'player_reception_yds',
  'player_anytime_td',
];

/**
 * Individual outcome within a market
 */
export interface Outcome {
  name: string;
  price: number; // Decimal odds (e.g., 2.05)
  point?: number; // Spread or total value
}

/**
 * Player prop outcome from The Odds API
 * Different from regular Outcome as it includes description for Over/Under
 */
export interface PlayerPropOutcome {
  name: string; // Player name (e.g., "LeBron James")
  description: string; // "Over" or "Under"
  price: number; // Decimal odds
  point: number; // The line (e.g., 25.5)
}

/**
 * Normalized player prop data
 */
export interface NormalizedPlayerProp {
  playerId: string;
  playerName: string;
  propType: PlayerPropMarket;
  line: number;
  overOdds: number; // Decimal odds
  underOdds: number; // Decimal odds
  lastUpdated?: string;
}

/**
 * Response from fetching player props for an event
 */
export interface EventPlayerPropsResponse {
  eventId: string;
  playerProps: NormalizedPlayerProp[];
  remainingRequests: number | null;
  usedRequests: number | null;
}

/**
 * A betting market (e.g., moneyline, spread)
 */
export interface Market {
  key: MarketType;
  lastUpdate: string;
  outcomes: Outcome[];
}

/**
 * A bookmaker's odds for an event
 */
export interface Bookmaker {
  key: string;
  title: string;
  lastUpdate: string;
  markets: Market[];
}

/**
 * A sporting event with odds from various bookmakers
 */
export interface SportingEvent {
  id: string;
  sportKey: Sport;
  sportTitle: string;
  commenceTime: string; // ISO 8601 timestamp
  homeTeam: string;
  awayTeam: string;
  bookmakers: Bookmaker[];
}

/**
 * Response from fetching events for a sport
 */
export interface EventsResponse {
  events: SportingEvent[];
  remainingRequests: number | null;
  usedRequests: number | null;
}

/**
 * Response from fetching odds for a specific event
 */
export interface EventOddsResponse {
  event: SportingEvent;
  remainingRequests: number | null;
  usedRequests: number | null;
}

/**
 * Options for fetching odds
 */
export interface FetchOddsOptions {
  sport: Sport;
  markets?: MarketType[];
  regions?: string[];
  eventId?: string;
  bookmakers?: string[];
}

/**
 * Provider-agnostic interface for sports data sources.
 * Implement this interface to add new data providers.
 */
export interface SportsDataProvider {
  /**
   * Unique identifier for this provider
   */
  readonly providerId: string;

  /**
   * Human-readable name
   */
  readonly providerName: string;

  /**
   * Fetch all upcoming events for a sport
   */
  getUpcomingEvents(sport: Sport): Promise<EventsResponse>;

  /**
   * Fetch odds for a specific event
   */
  getEventOdds(sport: Sport, eventId: string, markets?: MarketType[]): Promise<EventOddsResponse>;

  /**
   * Fetch all events with odds for a sport
   */
  getOdds(options: FetchOddsOptions): Promise<EventsResponse>;

  /**
   * Check if the provider is healthy/reachable
   */
  healthCheck(): Promise<boolean>;
}
