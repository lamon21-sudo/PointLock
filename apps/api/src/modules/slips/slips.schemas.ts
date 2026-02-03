// =====================================================
// Slips Validation Schemas (Zod)
// =====================================================
// Request/response validation for slip endpoints.
// All validation happens at the boundary before DB operations.

import { z } from 'zod';
import { SlipStatus, PickStatus, PickType } from '@prisma/client';

// ===========================================
// Constants
// ===========================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_PAGE = 1;

const VALID_SLIP_STATUSES = Object.values(SlipStatus) as [string, ...string[]];
const VALID_PICK_TYPES = Object.values(PickType) as [string, ...string[]];

// ===========================================
// Pick Input Schema
// ===========================================

export const pickInputSchema = z.object({
  sportsEventId: z
    .string()
    .uuid('Invalid sports event ID format. Must be a valid UUID.')
    .describe('The UUID of the sports event'),

  pickType: z
    .enum(VALID_PICK_TYPES)
    .describe('Type of pick: moneyline, spread, total, or prop'),

  selection: z
    .string()
    .min(1, 'Selection is required')
    .max(100, 'Selection must be 100 characters or less')
    .describe('The selection made (e.g., "home", "away", "over", "under")'),

  line: z
    .number()
    .optional()
    .describe('The line for spread/total picks (e.g., -7.5, 215.5)'),

  odds: z
    .number()
    .int('Odds must be an integer')
    .refine(
      (val) => val <= -100 || val >= 100,
      { message: 'American odds must be >= +100 or <= -100' }
    )
    .describe('American odds at time of pick (e.g., -110, +200)'),

  oddsDecimal: z
    .number()
    .positive('Decimal odds must be positive')
    .optional()
    .describe('Decimal odds (e.g., 1.91, 3.00)'),

  pointValue: z
    .number()
    .min(0, 'Point value cannot be negative')
    .describe('Fantasy points value for PvP scoring'),

  // Prop-specific fields
  propType: z
    .string()
    .max(50, 'Prop type must be 50 characters or less')
    .optional()
    .describe('Type of prop bet (e.g., "player_points", "player_rebounds")'),

  propPlayerId: z
    .string()
    .max(100, 'Prop player ID must be 100 characters or less')
    .optional()
    .describe('External player ID for prop bets'),

  propPlayerName: z
    .string()
    .max(100, 'Prop player name must be 100 characters or less')
    .optional()
    .describe('Player name for prop bets'),
});

export type PickInput = z.infer<typeof pickInputSchema>;

// ===========================================
// Create Slip Schema
// ===========================================

export const createSlipSchema = z.object({
  name: z
    .string()
    .max(100, 'Slip name must be 100 characters or less')
    .optional()
    .describe('Optional name for the slip'),

  picks: z
    .array(pickInputSchema)
    .min(1, 'At least one pick is required')
    .max(20, 'Maximum 20 picks per slip')
    .describe('Array of picks to add to the slip'),

  stake: z
    .number()
    .min(0, 'Stake cannot be negative')
    .optional()
    .default(0)
    .describe('Amount wagered on the slip'),
});

export type CreateSlipInput = z.infer<typeof createSlipSchema>;

// ===========================================
// Update Slip Schema
// ===========================================

export const updateSlipSchema = z.object({
  name: z
    .string()
    .max(100, 'Slip name must be 100 characters or less')
    .optional()
    .describe('Optional name for the slip'),

  addPicks: z
    .array(pickInputSchema)
    .max(20, 'Maximum 20 picks can be added at once')
    .optional()
    .describe('Picks to add to the slip'),

  removePickIds: z
    .array(z.string().uuid('Invalid pick ID format'))
    .max(20, 'Maximum 20 picks can be removed at once')
    .optional()
    .describe('IDs of picks to remove from the slip'),

  stake: z
    .number()
    .min(0, 'Stake cannot be negative')
    .optional()
    .describe('Updated stake amount'),
});

export type UpdateSlipInput = z.infer<typeof updateSlipSchema>;

// ===========================================
// List Slips Query Schema
// ===========================================

export const listSlipsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;

      // Split comma-separated values and trim whitespace
      const values = val.split(',').map(s => s.trim()).filter(Boolean);

      // Validate each value is a valid SlipStatus
      const invalidValues = values.filter(
        v => !VALID_SLIP_STATUSES.includes(v as SlipStatus)
      );

      if (invalidValues.length > 0) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['status'],
          message: `Invalid slip status values: ${invalidValues.join(', ')}. Expected: ${VALID_SLIP_STATUSES.join(' | ')}`,
        }]);
      }

      return values as SlipStatus[];
    })
    .describe('Filter by slip status (comma-separated for multiple)'),

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

  sort: z
    .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt'])
    .optional()
    .default('-createdAt')
    .describe('Sort order. Prefix with - for descending.'),
});

export type ListSlipsQuery = {
  status?: SlipStatus[];
  page: number;
  limit: number;
  sort: string;
};

// ===========================================
// ID Parameter Schema
// ===========================================

export const slipIdSchema = z.object({
  id: z
    .string()
    .uuid('Invalid slip ID format. Must be a valid UUID.')
    .describe('Slip UUID'),
});

export type SlipIdParams = z.infer<typeof slipIdSchema>;

// ===========================================
// Response Types
// ===========================================

/**
 * Pick response - populated with event data
 */
export interface PickResponse {
  id: string;
  slipId: string;
  sportsEventId: string;
  pickType: PickType;
  selection: string;
  line: number | null;
  odds: number;
  oddsDecimal: number | null;
  isLive: boolean;
  propType: string | null;
  propPlayerId: string | null;
  propPlayerName: string | null;
  pointValue: number;
  coinCost: number;
  tier: string;
  status: PickStatus;
  resultValue: number | null;
  settledAt: Date | null;
  createdAt: Date;
  event: {
    id: string;
    sport: string;
    league: string;
    homeTeamName: string;
    homeTeamAbbr: string | null;
    awayTeamName: string;
    awayTeamAbbr: string | null;
    scheduledAt: Date;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}

/**
 * Slip list item - condensed for list view
 */
export interface SlipListItem {
  id: string;
  userId: string;
  name: string | null;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout: number;
  totalPicks: number;
  correctPicks: number;
  pointPotential: number;
  pointsEarned: number;
  totalCoinCost: number;
  minCoinSpend: number;
  coinSpendMet: boolean;
  status: SlipStatus;
  createdAt: Date;
  updatedAt: Date;
  lockedAt: Date | null;
  settledAt: Date | null;
}

/**
 * Full slip details with populated picks
 */
export interface SlipDetails extends SlipListItem {
  picks: PickResponse[];
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
 * Validate create slip input
 */
export function validateCreateSlip(input: unknown): ValidationResult<CreateSlipInput> {
  const result = createSlipSchema.safeParse(input);

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
 * Validate update slip input
 */
export function validateUpdateSlip(input: unknown): ValidationResult<UpdateSlipInput> {
  const result = updateSlipSchema.safeParse(input);

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
 * Validate list slips query parameters
 */
export function validateListSlipsQuery(input: unknown): ValidationResult<ListSlipsQuery> {
  const result = listSlipsQuerySchema.safeParse(input);

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
 * Validate slip ID parameter
 */
export function validateSlipId(input: unknown): ValidationResult<SlipIdParams> {
  const result = slipIdSchema.safeParse(input);

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
