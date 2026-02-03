// =====================================================
// Domain Types
// =====================================================
// Core domain types for the Pick Rivals mobile app.
// These types define the contract between UI and backend.

// =====================================================
// Base Types
// =====================================================

export type Sport = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'UFC' | 'SOCCER' | 'NCAAF' | 'NCAAB';

export type MarketType = 'moneyline' | 'spread' | 'total';

export type SelectionType = 'home' | 'away' | 'over' | 'under';

export type GameStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

// =====================================================
// Team
// =====================================================

export interface Team {
  id: string;
  name: string;
  abbreviation: string; // e.g., "LAL", "KC"
  logoUrl?: string;
}

// =====================================================
// Odd Selection
// =====================================================

/**
 * The atomic betting unit - represents a single selectable odd.
 * This is what gets added to the slip when user taps an OddsButton.
 */
export interface OddSelection {
  /** Unique identifier for this selection */
  id: string;
  /** Type of market: moneyline, spread, or total */
  marketType: MarketType;
  /** Which side: home, away, over, or under */
  selectionType: SelectionType;
  /** American odds: -110, +250, etc. */
  price: number;
  /** The line value (spread: -5.5, total: 220.5). Null for moneyline. */
  point?: number;
}

// =====================================================
// Game Markets
// =====================================================

/**
 * Container for the 3 main betting markets.
 * Pre-structured for easy UI grid rendering.
 */
export interface GameMarkets {
  moneyline: {
    home: OddSelection;
    away: OddSelection;
  };
  spread: {
    home: OddSelection;
    away: OddSelection;
  };
  total: {
    over: OddSelection;
    under: OddSelection;
  };
}

// =====================================================
// Game Event
// =====================================================

/**
 * Complete event data for an EventCard.
 * Contains all information needed to render and interact with an event.
 */
export interface GameEvent {
  id: string;
  sport: Sport;
  status: GameStatus;
  startTime: string; // ISO string
  homeTeam: Team;
  awayTeam: Team;
  /** Pre-structured markets for UI rendering. Null if odds unavailable. */
  markets: GameMarkets | null;
  /** Current scores (for live/finished games) */
  score?: {
    home: number;
    away: number;
  };
}

// =====================================================
// Slip Item
// =====================================================

/**
 * A single selection in the betting slip.
 * This is the minimal data needed to track a bet.
 */
export interface SlipItem {
  /** The event this pick is for */
  eventId: string;
  /** Reference to the specific OddSelection.id */
  selectionId: string;
  /** The odds at time of selection (for display/history) */
  odds: number;
  /** Stake amount in cents (0 for point-based system) */
  stake: number;
  /** Denormalized event info for display */
  eventInfo: SlipItemEventInfo;
  /** Denormalized selection info for display */
  selectionInfo: SlipItemSelectionInfo;
}

/**
 * Event metadata cached in SlipItem for display.
 */
export interface SlipItemEventInfo {
  homeTeamName: string;
  homeTeamAbbr: string;
  awayTeamName: string;
  awayTeamAbbr: string;
  startTime: string;
  sport: Sport;
}

/**
 * Selection metadata cached in SlipItem for display.
 */
export interface SlipItemSelectionInfo {
  marketType: MarketType;
  selectionType: SelectionType;
  point?: number;
}

// =====================================================
// Helpers
// =====================================================

/**
 * Generate a unique selection ID for an event + market + side combination.
 * Used to track which selections are currently in the slip.
 */
export function generateSelectionId(
  eventId: string,
  marketType: MarketType,
  selectionType: SelectionType
): string {
  return `${eventId}:${marketType}:${selectionType}`;
}

/**
 * Parse a selection ID back into its components.
 */
export function parseSelectionId(selectionId: string): {
  eventId: string;
  marketType: MarketType;
  selectionType: SelectionType;
} | null {
  const parts = selectionId.split(':');
  if (parts.length !== 3) return null;

  return {
    eventId: parts[0],
    marketType: parts[1] as MarketType,
    selectionType: parts[2] as SelectionType,
  };
}

/**
 * Check if two selections conflict (same event, same market, different side).
 */
export function selectionsConflict(a: SlipItem, b: SlipItem): boolean {
  if (a.eventId !== b.eventId) return false;
  if (a.selectionInfo.marketType !== b.selectionInfo.marketType) return false;
  if (a.selectionInfo.selectionType === b.selectionInfo.selectionType) return false;
  return true; // Same event, same market, different side = conflict
}

/**
 * Format American odds for display.
 */
export function formatOddsDisplay(price: number): string {
  return price > 0 ? `+${price}` : price.toString();
}

/**
 * Format spread/total line for display.
 */
export function formatLineDisplay(point: number, type: 'spread' | 'total'): string {
  if (type === 'spread') {
    return point > 0 ? `+${point}` : point.toString();
  }
  return point.toString();
}
