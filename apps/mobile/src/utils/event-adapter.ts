// =====================================================
// Event Adapter
// =====================================================
// Converts between backend SportsEvent and client GameEvent types.
// This adapter allows the UI to use a clean interface while the
// backend schema evolves independently.

import { SportsEvent, EventOdds } from '@pick-rivals/shared-types';
import {
  GameEvent,
  GameMarkets,
  OddSelection,
  Team,
  Sport,
  GameStatus,
  MarketType,
  generateSelectionId,
} from '../types/domain';

// =====================================================
// Adapter Functions
// =====================================================

/**
 * Convert a SportsEvent from the API to a GameEvent for the UI.
 */
export function toGameEvent(event: SportsEvent): GameEvent {
  return {
    id: event.id,
    sport: mapSport(event.sport),
    status: mapStatus(event.status),
    startTime: new Date(event.scheduledAt).toISOString(),
    homeTeam: toTeam(event.homeTeamId, event.homeTeamName, event.homeTeamAbbr, event.homeTeamLogo),
    awayTeam: toTeam(event.awayTeamId, event.awayTeamName, event.awayTeamAbbr, event.awayTeamLogo),
    markets: event.oddsData ? toGameMarkets(event.id, event.oddsData) : null,
    score: hasScore(event) ? { home: event.homeScore!, away: event.awayScore! } : undefined,
  };
}

/**
 * Convert an array of SportsEvents to GameEvents.
 */
export function toGameEvents(events: SportsEvent[]): GameEvent[] {
  return events.map(toGameEvent);
}

// =====================================================
// Internal Helpers
// =====================================================

function toTeam(
  id: string,
  name: string,
  abbr?: string,
  logoUrl?: string
): Team {
  return {
    id,
    name,
    abbreviation: abbr || name.substring(0, 3).toUpperCase(),
    logoUrl,
  };
}

function mapSport(sport: string): Sport {
  // Map backend sport types to domain Sport type
  const sportMap: Record<string, Sport> = {
    NFL: 'NFL',
    NBA: 'NBA',
    MLB: 'MLB',
    NHL: 'NHL',
    SOCCER: 'SOCCER',
    NCAAF: 'NCAAF',
    NCAAB: 'NCAAB',
    UFC: 'UFC',
  };
  return sportMap[sport] || 'NFL';
}

function mapStatus(status: string): GameStatus {
  // Map backend status to domain GameStatus
  const statusMap: Record<string, GameStatus> = {
    scheduled: 'scheduled',
    in_progress: 'live',
    halftime: 'live',
    final: 'finished',
    postponed: 'postponed',
    cancelled: 'cancelled',
  };
  return statusMap[status] || 'scheduled';
}

function hasScore(event: SportsEvent): boolean {
  return event.homeScore !== null && event.awayScore !== null;
}

function toGameMarkets(eventId: string, odds: EventOdds): GameMarkets {
  return {
    moneyline: {
      home: toOddSelection(eventId, 'moneyline', 'home', odds.moneyline.home),
      away: toOddSelection(eventId, 'moneyline', 'away', odds.moneyline.away),
    },
    spread: {
      home: toOddSelection(eventId, 'spread', 'home', odds.spread.home.odds, odds.spread.home.line),
      away: toOddSelection(eventId, 'spread', 'away', odds.spread.away.odds, odds.spread.away.line),
    },
    total: {
      over: toOddSelection(eventId, 'total', 'over', odds.total.over, odds.total.line),
      under: toOddSelection(eventId, 'total', 'under', odds.total.under, odds.total.line),
    },
  };
}

function toOddSelection(
  eventId: string,
  marketType: MarketType,
  selectionType: 'home' | 'away' | 'over' | 'under',
  price: number,
  point?: number
): OddSelection {
  return {
    id: generateSelectionId(eventId, marketType, selectionType),
    marketType,
    selectionType,
    price,
    point,
  };
}

// =====================================================
// Reverse Adapter (for API submission)
// =====================================================

/**
 * Convert a SlipItem selection info back to backend-compatible format.
 * Used when submitting a slip to the API.
 */
export function toBackendPickInput(
  eventId: string,
  selection: OddSelection,
  eventInfo: {
    homeTeamName: string;
    homeTeamAbbr: string;
    awayTeamName: string;
    awayTeamAbbr: string;
    startTime: string;
    sport: Sport;
  }
) {
  return {
    sportsEventId: eventId,
    pickType: selection.marketType,
    selection: selection.selectionType,
    line: selection.point ?? null,
    odds: selection.price,
    eventInfo: {
      homeTeamName: eventInfo.homeTeamName,
      homeTeamAbbr: eventInfo.homeTeamAbbr,
      awayTeamName: eventInfo.awayTeamName,
      awayTeamAbbr: eventInfo.awayTeamAbbr,
      scheduledAt: eventInfo.startTime,
      sport: eventInfo.sport,
      league: eventInfo.sport, // Use sport as league for simplicity
    },
  };
}
