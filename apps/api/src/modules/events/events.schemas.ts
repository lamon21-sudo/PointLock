// =====================================================
// Events Validation Schemas (Zod)
// =====================================================
// Query parameter validation for events endpoints.
// All validation happens at the boundary before DB queries.

import { z } from 'zod';
import { SportType, EventStatus } from '@prisma/client';

// ===========================================
// Constants
// ===========================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_PAGE = 1;

// Valid sport types for filtering
const VALID_SPORTS = Object.values(SportType) as [string, ...string[]];
const VALID_STATUSES = Object.values(EventStatus) as [string, ...string[]];

// ===========================================
// List Events Query Schema
// ===========================================

export const listEventsQuerySchema = z.object({
  // Sport filter (optional)
  sport: z
    .enum(VALID_SPORTS)
    .optional()
    .describe('Filter by sport type (NFL, NBA, etc.)'),

  // Status filter (optional)
  status: z
    .enum(VALID_STATUSES)
    .optional()
    .describe('Filter by event status'),

  // Date range filters (optional)
  startDate: z
    .string()
    .datetime({ message: 'startDate must be a valid ISO 8601 date string' })
    .optional()
    .describe('Filter events starting on or after this date'),

  endDate: z
    .string()
    .datetime({ message: 'endDate must be a valid ISO 8601 date string' })
    .optional()
    .describe('Filter events starting on or before this date'),

  // Pagination
  page: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val || String(DEFAULT_PAGE), 10);
      return isNaN(parsed) || parsed < MIN_PAGE ? DEFAULT_PAGE : parsed;
    })
    .describe('Page number (1-indexed)'),

  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val || String(DEFAULT_LIMIT), 10);
      if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
      return Math.min(parsed, MAX_LIMIT);
    })
    .describe('Number of results per page (max 100)'),

  // Sorting
  sort: z
    .enum(['startTime', '-startTime', 'createdAt', '-createdAt'])
    .optional()
    .default('startTime')
    .describe('Sort order. Prefix with - for descending.'),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

// ===========================================
// Get Event by ID Schema
// ===========================================

export const getEventByIdSchema = z.object({
  id: z
    .string()
    .uuid('Invalid event ID format. Must be a valid UUID.')
    .describe('Event UUID'),
});

export type GetEventByIdParams = z.infer<typeof getEventByIdSchema>;

// ===========================================
// Response Types
// ===========================================

/**
 * Event list item - subset of fields for list view
 * Note: odds structure matches shared-types EventOdds interface
 */
export interface EventListItem {
  id: string;
  externalId: string;
  sport: SportType;
  league: string;
  homeTeamName: string;
  homeTeamAbbr: string | null;
  awayTeamName: string;
  awayTeamAbbr: string | null;
  scheduledAt: Date;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
  oddsData: {
    moneyline?: {
      home: number;
      away: number;
    };
    spread?: {
      home: { line: number; odds: number };
      away: { line: number; odds: number };
    };
    total?: {
      line: number;
      over: number;
      under: number;
    };
  } | null;
}

/**
 * Full event details - includes all metadata
 * Note: oddsData structure matches shared-types EventOdds interface
 */
export interface EventDetails {
  id: string;
  externalId: string;
  sport: SportType;
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamAbbr: string | null;
  homeTeamLogo: string | null;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamAbbr: string | null;
  awayTeamLogo: string | null;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
  oddsData: {
    moneyline?: {
      home: number;
      away: number;
    };
    spread?: {
      home: { line: number; odds: number };
      away: { line: number; odds: number };
    };
    total?: {
      line: number;
      over: number;
      under: number;
    };
  } | null;
  oddsUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Validation Helper
// ===========================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: { path: (string | number)[]; message: string }[];
}

/**
 * Validate list events query parameters
 */
export function validateListEventsQuery(
  input: unknown
): ValidationResult<ListEventsQuery> {
  const result = listEventsQuerySchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map((e) => ({
      path: e.path,
      message: e.message,
    })),
  };
}

/**
 * Validate event ID parameter
 */
export function validateEventId(
  input: unknown
): ValidationResult<GetEventByIdParams> {
  const result = getEventByIdSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map((e) => ({
      path: e.path,
      message: e.message,
    })),
  };
}
