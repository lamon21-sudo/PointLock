// =====================================================
// Events Service
// =====================================================
// Database operations for sports events.
// All queries are parameterized and optimized for performance.

import { Prisma, SportType, EventStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import {
  ListEventsQuery,
  EventListItem,
  EventDetails,
} from './events.schemas';

// ===========================================
// Types
// ===========================================

export interface PaginatedEvents {
  events: EventListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Raw odds data from the database (JSONB)
 */
interface RawOddsData {
  provider?: string;
  lastUpdated?: string;
  markets?: {
    moneyline?: { home: number; away: number };
    spread?: { home: number; away: number; homeOdds: number; awayOdds: number };
    totals?: { value: number; overOdds: number; underOdds: number };
  };
}

// ===========================================
// Select Fields
// ===========================================

/**
 * Fields to select for list view - optimized for performance
 */
const LIST_SELECT = {
  id: true,
  externalId: true,
  sport: true,
  league: true,
  homeTeamName: true,
  homeTeamAbbr: true,
  awayTeamName: true,
  awayTeamAbbr: true,
  scheduledAt: true,
  status: true,
  homeScore: true,
  awayScore: true,
  oddsData: true,
} as const;

/**
 * Fields to select for detail view - full event data
 */
const DETAIL_SELECT = {
  id: true,
  externalId: true,
  sport: true,
  league: true,
  homeTeamId: true,
  homeTeamName: true,
  homeTeamAbbr: true,
  homeTeamLogo: true,
  awayTeamId: true,
  awayTeamName: true,
  awayTeamAbbr: true,
  awayTeamLogo: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  status: true,
  homeScore: true,
  awayScore: true,
  oddsData: true,
  oddsUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ===========================================
// Helper Functions
// ===========================================

/**
 * Parse raw odds data from JSONB into typed structure.
 * Transforms from database format (markets wrapper, flat spread/totals)
 * to frontend format (nested spread, singular 'total').
 */
function parseOddsData(raw: Prisma.JsonValue): EventListItem['oddsData'] {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawOddsData;

  if (!data.markets) {
    return null;
  }

  const { moneyline, spread, totals } = data.markets;

  return {
    // Moneyline structure matches directly
    moneyline: moneyline,
    // Transform spread from flat to nested structure
    spread: spread
      ? {
          home: { line: spread.home, odds: spread.homeOdds },
          away: { line: spread.away, odds: spread.awayOdds },
        }
      : undefined,
    // Transform totals → total with renamed properties
    total: totals
      ? {
          line: totals.value,
          over: totals.overOdds,
          under: totals.underOdds,
        }
      : undefined,
  };
}

/**
 * Parse full odds data for detail view.
 * Uses same transformation as parseOddsData.
 */
function parseFullOddsData(raw: Prisma.JsonValue): EventDetails['oddsData'] {
  // Use the same transformation - detail view uses same structure
  return parseOddsData(raw);
}

/**
 * Build sort order from sort parameter
 */
function buildOrderBy(sort: string): Prisma.SportsEventOrderByWithRelationInput {
  const isDescending = sort.startsWith('-');
  const field = isDescending ? sort.slice(1) : sort;
  const direction: Prisma.SortOrder = isDescending ? 'desc' : 'asc';

  switch (field) {
    case 'startTime':
      return { scheduledAt: direction };
    case 'createdAt':
      return { createdAt: direction };
    default:
      return { scheduledAt: 'asc' };
  }
}

// ===========================================
// Service Functions
// ===========================================

/**
 * List events with filtering, sorting, and pagination.
 * Query is optimized to select only necessary fields.
 */
export async function listEvents(query: ListEventsQuery): Promise<PaginatedEvents> {
  const { sport, status, startDate, endDate, page, limit, sort } = query;

  // Build where clause
  const where: Prisma.SportsEventWhereInput = {};

  if (sport) {
    where.sport = sport as SportType;
  }

  if (status) {
    where.status = status as EventStatus;
  }

  // Date filtering: default to showing only upcoming/current events
  // Only show events from 3 hours ago onwards (to include games in progress)
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  if (startDate || endDate) {
    where.scheduledAt = {};

    if (startDate) {
      where.scheduledAt.gte = new Date(startDate);
    } else {
      // If no startDate specified but endDate is, still filter out old events
      where.scheduledAt.gte = threeHoursAgo;
    }

    if (endDate) {
      where.scheduledAt.lte = new Date(endDate);
    }
  } else {
    // No date filter specified - default to upcoming events only
    where.scheduledAt = { gte: threeHoursAgo };
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Execute count and data queries in parallel
  const [total, events] = await Promise.all([
    prisma.sportsEvent.count({ where }),
    prisma.sportsEvent.findMany({
      where,
      select: LIST_SELECT,
      orderBy: buildOrderBy(sort),
      skip,
      take: limit,
    }),
  ]);

  // Transform to response format
  const transformedEvents: EventListItem[] = events.map((event) => ({
    id: event.id,
    externalId: event.externalId,
    sport: event.sport,
    league: event.league,
    homeTeamName: event.homeTeamName,
    homeTeamAbbr: event.homeTeamAbbr,
    awayTeamName: event.awayTeamName,
    awayTeamAbbr: event.awayTeamAbbr,
    scheduledAt: event.scheduledAt,
    status: event.status,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    oddsData: parseOddsData(event.oddsData),
  }));

  const totalPages = Math.ceil(total / limit);

  logger.debug(`[EventsService] Listed ${events.length} events (page ${page}/${totalPages})`);

  return {
    events: transformedEvents,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Get a single event by ID with full details.
 * Returns null if event not found.
 */
export async function getEventById(id: string): Promise<EventDetails | null> {
  const event = await prisma.sportsEvent.findUnique({
    where: { id },
    select: DETAIL_SELECT,
  });

  if (!event) {
    logger.debug(`[EventsService] Event not found: ${id}`);
    return null;
  }

  logger.debug(`[EventsService] Retrieved event: ${id}`);

  return {
    id: event.id,
    externalId: event.externalId,
    sport: event.sport,
    league: event.league,
    homeTeamId: event.homeTeamId,
    homeTeamName: event.homeTeamName,
    homeTeamAbbr: event.homeTeamAbbr,
    homeTeamLogo: event.homeTeamLogo,
    awayTeamId: event.awayTeamId,
    awayTeamName: event.awayTeamName,
    awayTeamAbbr: event.awayTeamAbbr,
    awayTeamLogo: event.awayTeamLogo,
    scheduledAt: event.scheduledAt,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    status: event.status,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    oddsData: parseFullOddsData(event.oddsData),
    oddsUpdatedAt: event.oddsUpdatedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

/**
 * Get upcoming events for a specific sport.
 * Convenience method for common use case.
 */
export async function getUpcomingEvents(
  sport: SportType,
  limit: number = 10
): Promise<EventListItem[]> {
  const result = await listEvents({
    sport,
    status: EventStatus.SCHEDULED,
    startDate: new Date().toISOString(),
    page: 1,
    limit,
    sort: 'startTime',
  });

  return result.events;
}

/**
 * Check if an event exists by ID.
 * Efficient existence check without fetching full data.
 */
export async function eventExists(id: string): Promise<boolean> {
  const count = await prisma.sportsEvent.count({
    where: { id },
  });

  return count > 0;
}

/**
 * Get events by external IDs (for sync operations).
 */
export async function getEventsByExternalIds(
  externalIds: string[]
): Promise<Map<string, string>> {
  const events = await prisma.sportsEvent.findMany({
    where: {
      externalId: { in: externalIds },
    },
    select: {
      id: true,
      externalId: true,
    },
  });

  return new Map(events.map((e) => [e.externalId, e.id]));
}
