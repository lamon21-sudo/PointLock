// =====================================================
// Slips Service
// =====================================================
// Business logic and database operations for slips.
// All queries are parameterized and optimized for performance.

import { Prisma, SlipStatus, PickStatus, PickType, EventStatus, PickTier as PrismaPickTier } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import {
  CreateSlipInput,
  UpdateSlipInput,
  ListSlipsQuery,
  SlipListItem,
  SlipDetails,
  PickResponse,
  PickInput,
} from './slips.schemas';
import { Decimal } from '@prisma/client/runtime/library';
import {
  calculatePickPointValue,
  calculateSlipPointPotential,
  americanToDecimalOdds,
  americanToImpliedProbability,
} from '../../lib/odds-calculator';
import { calculateCoinCost, validateMinimumSpend, PickForValidation } from '../../lib/pointlock-calculator';
import { getUserTier, isPickLocked } from '../../lib/tier.service';
import { PickTier } from '@pick-rivals/shared-types';

// ===========================================
// Types
// ===========================================

export interface PaginatedSlips {
  slips: SlipListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ===========================================
// Select Fields
// ===========================================

/**
 * Fields to select for list view - optimized for performance
 */
const LIST_SELECT = {
  id: true,
  userId: true,
  name: true,
  stake: true,
  totalOdds: true,
  potentialPayout: true,
  actualPayout: true,
  totalPicks: true,
  correctPicks: true,
  pointPotential: true,
  pointsEarned: true,
  totalCoinCost: true,
  minCoinSpend: true,
  coinSpendMet: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lockedAt: true,
  settledAt: true,
} as const;

/**
 * Fields to select for picks with event data
 */
const PICK_SELECT = {
  id: true,
  slipId: true,
  sportsEventId: true,
  pickType: true,
  selection: true,
  line: true,
  odds: true,
  oddsDecimal: true,
  isLive: true,
  propType: true,
  propPlayerId: true,
  propPlayerName: true,
  pointValue: true,
  coinCost: true,
  tier: true,
  status: true,
  resultValue: true,
  settledAt: true,
  createdAt: true,
  event: {
    select: {
      id: true,
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
    },
  },
} as const;

// ===========================================
// Helper Functions
// ===========================================

/**
 * Convert Prisma Decimal to number
 */
function decimalToNumber(value: Decimal | null): number {
  if (value === null) return 0;
  return value.toNumber();
}

/**
 * Transform database slip to list item response
 */
function transformSlipToListItem(slip: {
  id: string;
  userId: string;
  name: string | null;
  stake: Decimal;
  totalOdds: Decimal;
  potentialPayout: Decimal;
  actualPayout: Decimal;
  totalPicks: number;
  correctPicks: number;
  pointPotential: Decimal;
  pointsEarned: Decimal;
  totalCoinCost: number;
  minCoinSpend: number;
  coinSpendMet: boolean;
  status: SlipStatus;
  createdAt: Date;
  updatedAt: Date;
  lockedAt: Date | null;
  settledAt: Date | null;
}): SlipListItem {
  return {
    id: slip.id,
    userId: slip.userId,
    name: slip.name,
    stake: decimalToNumber(slip.stake),
    totalOdds: decimalToNumber(slip.totalOdds),
    potentialPayout: decimalToNumber(slip.potentialPayout),
    actualPayout: decimalToNumber(slip.actualPayout),
    totalPicks: slip.totalPicks,
    correctPicks: slip.correctPicks,
    pointPotential: decimalToNumber(slip.pointPotential),
    pointsEarned: decimalToNumber(slip.pointsEarned),
    totalCoinCost: slip.totalCoinCost,
    minCoinSpend: slip.minCoinSpend,
    coinSpendMet: slip.coinSpendMet,
    status: slip.status,
    createdAt: slip.createdAt,
    updatedAt: slip.updatedAt,
    lockedAt: slip.lockedAt,
    settledAt: slip.settledAt,
  };
}

/**
 * Transform database pick to response
 */
function transformPick(pick: {
  id: string;
  slipId: string;
  sportsEventId: string;
  pickType: string;
  selection: string;
  line: Decimal | null;
  odds: number;
  oddsDecimal: Decimal | null;
  isLive: boolean;
  propType: string | null;
  propPlayerId: string | null;
  propPlayerName: string | null;
  pointValue: Decimal;
  coinCost: number;
  tier: PrismaPickTier;
  status: PickStatus;
  resultValue: Decimal | null;
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
}): PickResponse {
  return {
    id: pick.id,
    slipId: pick.slipId,
    sportsEventId: pick.sportsEventId,
    pickType: pick.pickType as PickResponse['pickType'],
    selection: pick.selection,
    line: pick.line ? pick.line.toNumber() : null,
    odds: pick.odds,
    oddsDecimal: pick.oddsDecimal ? pick.oddsDecimal.toNumber() : null,
    isLive: pick.isLive,
    propType: pick.propType,
    propPlayerId: pick.propPlayerId,
    propPlayerName: pick.propPlayerName,
    pointValue: decimalToNumber(pick.pointValue),
    coinCost: pick.coinCost,
    tier: pick.tier,
    status: pick.status,
    resultValue: pick.resultValue ? pick.resultValue.toNumber() : null,
    settledAt: pick.settledAt,
    createdAt: pick.createdAt,
    event: pick.event,
  };
}

/**
 * Calculate total odds from picks (parlay style - multiply decimal odds)
 */
function calculateTotalOdds(picks: PickInput[]): number {
  if (picks.length === 0) return 1;

  let totalDecimalOdds = 1;

  for (const pick of picks) {
    // Convert American odds to decimal if oddsDecimal not provided
    const decimalOdds = pick.oddsDecimal ?? americanToDecimal(pick.odds);
    totalDecimalOdds *= decimalOdds;
  }

  return totalDecimalOdds;
}

/**
 * Convert American odds to decimal odds
 * @deprecated Use americanToDecimalOdds from odds-calculator.ts instead
 */
function americanToDecimal(americanOdds: number): number {
  return americanToDecimalOdds(americanOdds);
}

/**
 * Calculate potential payout
 */
function calculatePotentialPayout(stake: number, totalOdds: number): number {
  return stake * totalOdds;
}

/**
 * Calculate point potential from picks using server-side odds-based calculation.
 *
 * SECURITY: Point values are calculated server-side based on odds difficulty,
 * not from client-provided values. This prevents point manipulation exploits.
 *
 * @param picks - Array of picks with odds
 * @returns Total point potential for the slip
 */
function calculatePointPotentialFromOdds(picks: PickInput[]): number {
  if (picks.length === 0) return 0;

  const oddsArray = picks.map((pick) => pick.odds);
  const result = calculateSlipPointPotential(oddsArray);

  return result.totalPointPotential;
}

/**
 * Calculate individual pick point values from odds.
 * Returns an array of point values corresponding to each pick.
 *
 * @param picks - Array of picks with odds
 * @returns Array of calculated point values
 */
function calculatePickPointValues(picks: PickInput[]): number[] {
  return picks.map((pick) => calculatePickPointValue(pick.odds).pointValue);
}

/**
 * Map Prisma PickTier string enum to shared-types numeric enum.
 * Required because pointlock-calculator expects numeric PickTier.
 * Includes runtime validation for type safety.
 */
function prismaTierToSharedTier(prismaTier: PrismaPickTier): PickTier {
  const map: Record<string, PickTier> = {
    'FREE': PickTier.FREE,
    'STANDARD': PickTier.STANDARD,
    'PREMIUM': PickTier.PREMIUM,
    'ELITE': PickTier.ELITE,
  };

  // Handle both string and numeric enum inputs safely
  const key = typeof prismaTier === 'string' ? prismaTier : String(prismaTier);
  const result = map[key];

  if (result === undefined) {
    logger.error(`Invalid Prisma tier: ${prismaTier} (type: ${typeof prismaTier})`);
    return PickTier.FREE; // Safe default
  }

  return result;
}

/**
 * Get pick tier based on market type (pickType).
 * Returns Prisma PickTier (string) for compatibility with tier.service.ts.
 */
function getPickTierFromMarket(pickType: PickType): PrismaPickTier {
  const tierMap: Record<PickType, PrismaPickTier> = {
    moneyline: 'FREE',
    spread: 'STANDARD',
    total: 'STANDARD',
    prop: 'PREMIUM',
  };
  return tierMap[pickType] ?? 'FREE';
}

/**
 * Calculate coin cost and tier for a single pick.
 * Also validates that user has access to this tier.
 *
 * @param pick - Pick input with pickType and odds
 * @param userTier - User's current tier (Prisma PickTier, from getUserTier)
 * @returns Object with coinCost and tier (Prisma enum for storage)
 */
function calculatePickCoinCostAndTier(
  pick: { pickType: PickType; odds: number },
  userTier: PrismaPickTier
): { coinCost: number; tier: PrismaPickTier } {
  // Get pick tier as Prisma enum
  const pickTier = getPickTierFromMarket(pick.pickType);

  // Enforce tier access using Prisma enums (tier.service uses Prisma types)
  if (isPickLocked({ tier: pickTier }, userTier)) {
    throw new ForbiddenError(
      `Pick requires ${pickTier} tier. Your tier: ${userTier}`,
      ERROR_CODES.TIER_LOCKED
    );
  }

  // Calculate implied probability
  const impliedProb = americanToImpliedProbability(pick.odds);

  // Convert to shared-types tier for pointlock-calculator
  const sharedTier = prismaTierToSharedTier(pickTier);
  const result = calculateCoinCost(impliedProb, sharedTier);

  return { coinCost: result.coinCost, tier: pickTier };
}

/**
 * Validate that all picks in a slip are accessible by the user's current tier.
 * Used for re-validation at lock time and when updating existing picks.
 *
 * @param picks - Array of picks with tier field
 * @param userTier - User's current tier (Prisma PickTier)
 * @throws ForbiddenError if any pick is locked
 */
function validatePickTiersAccessible(
  picks: Array<{ tier: PrismaPickTier }>,
  userTier: PrismaPickTier
): void {
  for (const pick of picks) {
    if (isPickLocked({ tier: pick.tier }, userTier)) {
      throw new ForbiddenError(
        `Pick requires ${pick.tier} tier. Your current tier: ${userTier}`,
        ERROR_CODES.TIER_LOCKED
      );
    }
  }
}

/**
 * Build sort order from sort parameter
 */
function buildOrderBy(sort: string): Prisma.SlipOrderByWithRelationInput {
  const isDescending = sort.startsWith('-');
  const field = isDescending ? sort.slice(1) : sort;
  const direction: Prisma.SortOrder = isDescending ? 'desc' : 'asc';

  switch (field) {
    case 'createdAt':
      return { createdAt: direction };
    case 'updatedAt':
      return { updatedAt: direction };
    default:
      return { createdAt: 'desc' };
  }
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Create a new slip with picks.
 * Validates that all events exist and haven't started.
 */
export async function createSlip(
  userId: string,
  input: CreateSlipInput
): Promise<SlipDetails> {
  const { name, picks, stake } = input;

  // Extract unique event IDs
  const eventIds = [...new Set(picks.map((p) => p.sportsEventId))];

  // Verify all events exist and are valid for betting
  const events = await prisma.sportsEvent.findMany({
    where: {
      id: { in: eventIds },
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
    },
  });

  // Check all events were found
  if (events.length !== eventIds.length) {
    const foundIds = new Set(events.map((e) => e.id));
    const missingIds = eventIds.filter((id) => !foundIds.has(id));
    throw new NotFoundError(
      `Sports events not found: ${missingIds.join(', ')}`,
      ERROR_CODES.EVENT_NOT_FOUND
    );
  }

  // Check no events have started
  const now = new Date();
  const startedEvents = events.filter(
    (e) => e.status !== EventStatus.SCHEDULED || e.scheduledAt <= now
  );

  if (startedEvents.length > 0) {
    throw new BadRequestError(
      `Cannot add picks for events that have already started: ${startedEvents.map((e) => e.id).join(', ')}`,
      ERROR_CODES.EVENT_ALREADY_STARTED
    );
  }

  // Get user tier
  const userTierInfo = await getUserTier(userId);

  // Calculate coin cost and tier for each pick (validates tier access)
  const pickCoinData = picks.map((pick) =>
    calculatePickCoinCostAndTier(
      { pickType: pick.pickType as PickType, odds: pick.odds },
      userTierInfo.tier
    )
  );

  // Calculate total coin cost
  const totalCoinCost = pickCoinData.reduce((sum, data) => sum + data.coinCost, 0);

  // Calculate slip aggregates
  const totalOdds = calculateTotalOdds(picks);
  const potentialPayout = calculatePotentialPayout(stake, totalOdds);
  const pointPotential = calculatePointPotentialFromOdds(picks);

  // Calculate server-side point values for each pick (NOT from client input)
  const pickPointValues = calculatePickPointValues(picks);

  // Create slip with picks in a transaction
  const slip = await prisma.$transaction(async (tx) => {
    // Create the slip
    const newSlip = await tx.slip.create({
      data: {
        userId,
        name,
        stake,
        totalOdds,
        potentialPayout,
        totalPicks: picks.length,
        pointPotential,
        totalCoinCost,
        status: SlipStatus.DRAFT,
        picks: {
          create: picks.map((pick, index) => ({
            event: { connect: { id: pick.sportsEventId } },
            pickType: pick.pickType as PickType,
            selection: pick.selection,
            line: pick.line,
            odds: pick.odds,
            oddsDecimal: pick.oddsDecimal ?? americanToDecimal(pick.odds),
            // SECURITY: Use server-calculated point value, NOT client-provided
            pointValue: pickPointValues[index],
            // Tier system fields
            tier: pickCoinData[index].tier,
            coinCost: pickCoinData[index].coinCost,
            propType: pick.propType,
            propPlayerId: pick.propPlayerId,
            propPlayerName: pick.propPlayerName,
            status: PickStatus.PENDING,
          })),
        },
      },
      select: {
        ...LIST_SELECT,
        picks: {
          select: PICK_SELECT,
        },
      },
    });

    return newSlip;
  });

  logger.info(`[SlipsService] Created slip ${slip.id} for user ${userId} with ${picks.length} picks (${totalCoinCost} coins)`);

  return {
    ...transformSlipToListItem(slip),
    picks: slip.picks.map(transformPick),
  };
}

/**
 * Get a slip by ID with all picks populated.
 * Returns null if not found.
 */
export async function getSlipById(
  slipId: string,
  userId?: string
): Promise<SlipDetails | null> {
  const whereClause: Prisma.SlipWhereInput = { id: slipId };

  // If userId provided, ensure the slip belongs to this user
  if (userId) {
    whereClause.userId = userId;
  }

  const slip = await prisma.slip.findFirst({
    where: whereClause,
    select: {
      ...LIST_SELECT,
      picks: {
        select: PICK_SELECT,
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!slip) {
    logger.debug(`[SlipsService] Slip not found: ${slipId}`);
    return null;
  }

  logger.debug(`[SlipsService] Retrieved slip: ${slipId}`);

  return {
    ...transformSlipToListItem(slip),
    picks: slip.picks.map(transformPick),
  };
}

/**
 * Get user slips with pagination and filtering.
 */
export async function getUserSlips(
  userId: string,
  query: ListSlipsQuery
): Promise<PaginatedSlips> {
  const { status, page, limit, sort } = query;

  // Build where clause
  const where: Prisma.SlipWhereInput = { userId };

  if (status && status.length > 0) {
    // Support filtering by multiple statuses using Prisma's 'in' operator
    where.status = status.length === 1
      ? status[0]  // Single value: direct equality
      : { in: status };  // Multiple values: IN clause
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Execute count and data queries in parallel
  const [total, slips] = await Promise.all([
    prisma.slip.count({ where }),
    prisma.slip.findMany({
      where,
      select: LIST_SELECT,
      orderBy: buildOrderBy(sort),
      skip,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  logger.debug(`[SlipsService] Listed ${slips.length} slips for user ${userId} (page ${page}/${totalPages})`);

  return {
    slips: slips.map(transformSlipToListItem),
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Update a slip (add/remove picks, update name or stake).
 * Only DRAFT slips can be updated.
 */
export async function updateSlip(
  slipId: string,
  userId: string,
  input: UpdateSlipInput
): Promise<SlipDetails> {
  const { name, addPicks, removePickIds, stake } = input;

  // Get existing slip with tier info for validation
  const existingSlip = await prisma.slip.findFirst({
    where: { id: slipId, userId },
    select: {
      id: true,
      status: true,
      picks: {
        select: {
          id: true,
          sportsEventId: true,
          odds: true,
          oddsDecimal: true,
          pointValue: true,
          tier: true, // Include tier for re-validation
        },
      },
    },
  });

  if (!existingSlip) {
    throw new NotFoundError(
      `Slip with ID ${slipId} not found`,
      ERROR_CODES.SLIP_NOT_FOUND
    );
  }

  // Only DRAFT slips can be modified
  if (existingSlip.status !== SlipStatus.DRAFT) {
    throw new ForbiddenError(
      `Cannot modify slip with status '${existingSlip.status}'. Only DRAFT slips can be modified.`,
      ERROR_CODES.SLIP_ALREADY_LOCKED
    );
  }

  // Validate picks to remove exist
  if (removePickIds && removePickIds.length > 0) {
    const existingPickIds = new Set(existingSlip.picks.map((p) => p.id));
    const invalidIds = removePickIds.filter((id) => !existingPickIds.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestError(
        `Pick IDs not found in this slip: ${invalidIds.join(', ')}`,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  // Get user tier for validation (needed for both existing and new picks)
  const userTierInfo = await getUserTier(userId);

  // Re-validate existing picks are still accessible with current user tier
  // (user's tier may have dropped since slip was created)
  const picksToKeep = removePickIds
    ? existingSlip.picks.filter((p) => !removePickIds.includes(p.id))
    : existingSlip.picks;
  validatePickTiersAccessible(picksToKeep, userTierInfo.tier);

  // Validate new picks' events exist and are valid
  let pickCoinData: { coinCost: number; tier: PrismaPickTier }[] = [];
  if (addPicks && addPicks.length > 0) {
    const eventIds = [...new Set(addPicks.map((p) => p.sportsEventId))];

    const events = await prisma.sportsEvent.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, status: true, scheduledAt: true },
    });

    if (events.length !== eventIds.length) {
      const foundIds = new Set(events.map((e) => e.id));
      const missingIds = eventIds.filter((id) => !foundIds.has(id));
      throw new NotFoundError(
        `Sports events not found: ${missingIds.join(', ')}`,
        ERROR_CODES.EVENT_NOT_FOUND
      );
    }

    const now = new Date();
    const startedEvents = events.filter(
      (e) => e.status !== EventStatus.SCHEDULED || e.scheduledAt <= now
    );

    if (startedEvents.length > 0) {
      throw new BadRequestError(
        `Cannot add picks for events that have already started: ${startedEvents.map((e) => e.id).join(', ')}`,
        ERROR_CODES.EVENT_ALREADY_STARTED
      );
    }

    // Calculate coin costs for new picks (user tier already fetched above)
    pickCoinData = addPicks.map((pick) =>
      calculatePickCoinCostAndTier(
        { pickType: pick.pickType as PickType, odds: pick.odds },
        userTierInfo.tier
      )
    );
  }

  // Perform update in transaction
  const updatedSlip = await prisma.$transaction(async (tx) => {
    // Remove picks if specified
    if (removePickIds && removePickIds.length > 0) {
      await tx.slipPick.deleteMany({
        where: {
          id: { in: removePickIds },
          slipId,
        },
      });
    }

    // Add new picks if specified
    if (addPicks && addPicks.length > 0) {
      // Calculate server-side point values for new picks
      const newPickPointValues = calculatePickPointValues(addPicks);

      await tx.slipPick.createMany({
        data: addPicks.map((pick, index) => ({
          slipId,
          sportsEventId: pick.sportsEventId,
          pickType: pick.pickType as PickType,
          selection: pick.selection,
          line: pick.line,
          odds: pick.odds,
          oddsDecimal: pick.oddsDecimal ?? americanToDecimal(pick.odds),
          // SECURITY: Use server-calculated point value, NOT client-provided
          pointValue: newPickPointValues[index],
          // Tier system fields
          tier: pickCoinData[index].tier,
          coinCost: pickCoinData[index].coinCost,
          propType: pick.propType,
          propPlayerId: pick.propPlayerId,
          propPlayerName: pick.propPlayerName,
          status: PickStatus.PENDING,
        })),
      });
    }

    // Get updated picks to recalculate aggregates
    const updatedPicks = await tx.slipPick.findMany({
      where: { slipId },
      select: {
        odds: true,
        oddsDecimal: true,
        pointValue: true,
        coinCost: true,
      },
    });

    // Recalculate aggregates
    const pickInputsForCalc: PickInput[] = updatedPicks.map((p) => ({
      sportsEventId: '',
      pickType: 'moneyline',
      selection: '',
      odds: p.odds,
      oddsDecimal: p.oddsDecimal?.toNumber(),
      pointValue: p.pointValue.toNumber(),
    }));

    const newStake = stake ?? 0;
    const newTotalOdds = calculateTotalOdds(pickInputsForCalc);
    const newPotentialPayout = calculatePotentialPayout(newStake, newTotalOdds);
    const newPointPotential = calculatePointPotentialFromOdds(pickInputsForCalc);

    // Recalculate total coin cost
    const newTotalCoinCost = updatedPicks.reduce((sum, p) => sum + p.coinCost, 0);

    // Update slip
    const slip = await tx.slip.update({
      where: { id: slipId },
      data: {
        name: name !== undefined ? name : undefined,
        stake: stake !== undefined ? stake : undefined,
        totalOdds: newTotalOdds,
        potentialPayout: newPotentialPayout,
        totalPicks: updatedPicks.length,
        pointPotential: newPointPotential,
        totalCoinCost: newTotalCoinCost,
      },
      select: {
        ...LIST_SELECT,
        picks: {
          select: PICK_SELECT,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return slip;
  });

  logger.info(`[SlipsService] Updated slip ${slipId} for user ${userId}`);

  return {
    ...transformSlipToListItem(updatedSlip),
    picks: updatedSlip.picks.map(transformPick),
  };
}

/**
 * Delete a slip.
 * Only DRAFT slips can be deleted.
 */
export async function deleteSlip(slipId: string, userId: string): Promise<void> {
  // Get existing slip
  const existingSlip = await prisma.slip.findFirst({
    where: { id: slipId, userId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existingSlip) {
    throw new NotFoundError(
      `Slip with ID ${slipId} not found`,
      ERROR_CODES.SLIP_NOT_FOUND
    );
  }

  // Only DRAFT slips can be deleted
  if (existingSlip.status !== SlipStatus.DRAFT) {
    throw new ForbiddenError(
      `Cannot delete slip with status '${existingSlip.status}'. Only DRAFT slips can be deleted.`,
      ERROR_CODES.SLIP_ALREADY_LOCKED
    );
  }

  // Delete slip (cascade will delete picks)
  await prisma.slip.delete({
    where: { id: slipId },
  });

  logger.info(`[SlipsService] Deleted slip ${slipId} for user ${userId}`);
}

/**
 * Check if a slip exists and belongs to a user.
 * Efficient existence check without fetching full data.
 */
export async function slipExists(slipId: string, userId?: string): Promise<boolean> {
  const where: Prisma.SlipWhereInput = { id: slipId };

  if (userId) {
    where.userId = userId;
  }

  const count = await prisma.slip.count({ where });
  return count > 0;
}

/**
 * Lock a slip (transition from DRAFT to PENDING).
 * This is called when the user submits/places the slip.
 * Validates minimum spend requirement and recalculates coin costs server-side.
 */
export async function lockSlip(slipId: string, userId: string): Promise<SlipDetails> {
  // Fetch slip with picks for validation
  const existingSlip = await prisma.slip.findFirst({
    where: { id: slipId, userId },
    select: {
      id: true,
      status: true,
      totalPicks: true,
      picks: {
        select: {
          id: true,
          pickType: true,
          odds: true,
          tier: true,
          coinCost: true,
        },
      },
    },
  });

  if (!existingSlip) {
    throw new NotFoundError(
      `Slip with ID ${slipId} not found`,
      ERROR_CODES.SLIP_NOT_FOUND
    );
  }

  if (existingSlip.status !== SlipStatus.DRAFT) {
    throw new BadRequestError(
      `Slip is already locked with status '${existingSlip.status}'`,
      ERROR_CODES.SLIP_ALREADY_LOCKED
    );
  }

  if (existingSlip.totalPicks === 0) {
    throw new BadRequestError(
      'Cannot lock a slip with no picks',
      ERROR_CODES.INVALID_PICK_COUNT
    );
  }

  // Re-validate tier access for all picks (user's tier may have changed)
  const userTierInfo = await getUserTier(userId);
  validatePickTiersAccessible(existingSlip.picks, userTierInfo.tier);

  // Recalculate coin costs server-side (authoritative)
  const recalculatedPicks: PickForValidation[] = existingSlip.picks.map((pick) => {
    const impliedProb = americanToImpliedProbability(pick.odds);
    const sharedTier = prismaTierToSharedTier(pick.tier);
    const result = calculateCoinCost(impliedProb, sharedTier);

    return {
      coinCost: result.coinCost,
      tier: sharedTier,
    };
  });

  // Validate minimum spend requirement
  const minSpendValidation = validateMinimumSpend(recalculatedPicks);

  if (!minSpendValidation.ok) {
    throw new BadRequestError(
      minSpendValidation.reason || 'Minimum spend requirement not met',
      ERROR_CODES.MIN_SPEND_NOT_MET
    );
  }

  // Lock the slip in a transaction
  const updatedSlip = await prisma.$transaction(async (tx) => {
    const slip = await tx.slip.update({
      where: { id: slipId },
      data: {
        status: SlipStatus.PENDING,
        lockedAt: new Date(),
        totalCoinCost: minSpendValidation.totalCoinCost,
        minCoinSpend: minSpendValidation.minCoinSpend,
        coinSpendMet: true,
      },
      select: {
        ...LIST_SELECT,
        picks: {
          select: PICK_SELECT,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return slip;
  });

  logger.info(
    `[SlipsService] Locked slip ${slipId} for user ${userId} ` +
    `(${minSpendValidation.totalCoinCost}/${minSpendValidation.minCoinSpend} coins)`
  );

  return {
    ...transformSlipToListItem(updatedSlip),
    picks: updatedSlip.picks.map(transformPick),
  };
}

// ===========================================
// Draft Validation (Offline Revalidation)
// ===========================================

/**
 * Input for validating a draft pick
 */
export interface ValidateDraftPickInput {
  sportsEventId: string;
  pickType: string;
  selection: string;
  line?: number | null;
  currentOdds: number;
}

/**
 * Result of validating a draft pick
 */
export interface ValidatedDraftPick {
  sportsEventId: string;
  pickType: string;
  selection: string;
  currentOdds: number;
  oddsChanged: boolean;
  isValid: boolean;
  reason?: string;
}

/**
 * Validate draft picks and return current odds.
 * Used for offline slip revalidation when client comes back online.
 *
 * @param picks - Array of draft picks to validate
 * @returns Validation results for each pick
 */
export async function validateDraftPicks(
  picks: ValidateDraftPickInput[]
): Promise<ValidatedDraftPick[]> {
  const results: ValidatedDraftPick[] = [];

  // Fetch all events in one query for efficiency
  const eventIds = [...new Set(picks.map((p) => p.sportsEventId))];
  const events = await prisma.sportsEvent.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      status: true,
      homeTeamName: true,
      awayTeamName: true,
      scheduledAt: true,
      oddsData: true,
    },
  });

  const eventMap = new Map(events.map((e) => [e.id, e]));

  for (const pick of picks) {
    const event = eventMap.get(pick.sportsEventId);

    // Event not found
    if (!event) {
      results.push({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        currentOdds: pick.currentOdds,
        oddsChanged: false,
        isValid: false,
        reason: 'Event not found',
      });
      continue;
    }

    // Event already started or completed
    if (event.status === EventStatus.LIVE || event.status === EventStatus.COMPLETED) {
      results.push({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        currentOdds: pick.currentOdds,
        oddsChanged: false,
        isValid: false,
        reason: 'Event has already started',
      });
      continue;
    }

    // Event cancelled or postponed
    if (event.status === EventStatus.CANCELED || event.status === EventStatus.POSTPONED) {
      results.push({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        currentOdds: pick.currentOdds,
        oddsChanged: false,
        isValid: false,
        reason: `Event has been ${event.status.toLowerCase()}`,
      });
      continue;
    }

    // Try to extract current odds from oddsData
    const currentOdds = extractOddsFromEvent(
      event.oddsData as Record<string, unknown> | null,
      pick.pickType,
      pick.selection,
      pick.line ?? null
    );

    // If we can extract odds, check if they changed
    if (currentOdds !== null) {
      const oddsChanged = currentOdds !== pick.currentOdds;
      results.push({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        currentOdds,
        oddsChanged,
        isValid: true,
      });
    } else {
      // Couldn't extract odds - use client's odds and mark as valid
      // The server will validate on actual submission
      results.push({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        currentOdds: pick.currentOdds,
        oddsChanged: false,
        isValid: true,
      });
    }
  }

  return results;
}

/**
 * Extract odds from event oddsData JSON.
 * Returns null if odds cannot be extracted.
 */
function extractOddsFromEvent(
  oddsData: Record<string, unknown> | null,
  pickType: string,
  selection: string,
  line: number | null
): number | null {
  if (!oddsData) return null;

  try {
    // Handle different pick types
    if (pickType === 'moneyline') {
      const moneyline = oddsData.moneyline as Record<string, unknown> | undefined;
      if (!moneyline) return null;
      const odds = moneyline[selection] as number | undefined;
      return odds ?? null;
    }

    if (pickType === 'spread') {
      const spread = oddsData.spread as Record<string, unknown> | undefined;
      if (!spread) return null;
      const selectionData = spread[selection] as { odds?: number; line?: number } | undefined;
      if (!selectionData) return null;
      // Only return if line matches (or close enough)
      if (line !== null && selectionData.line !== undefined) {
        if (Math.abs(selectionData.line - line) > 0.5) return null;
      }
      return selectionData.odds ?? null;
    }

    if (pickType === 'total') {
      const total = oddsData.total as Record<string, unknown> | undefined;
      if (!total) return null;
      const selectionData = total[selection] as { odds?: number; line?: number } | undefined;
      if (!selectionData) return null;
      // Only return if line matches (or close enough)
      if (line !== null && selectionData.line !== undefined) {
        if (Math.abs(selectionData.line - line) > 0.5) return null;
      }
      return selectionData.odds ?? null;
    }

    // Props are more complex - just return null and let server validate on submission
    return null;
  } catch {
    return null;
  }
}
