// =====================================================
// POINTLOCK Calculator - Coin Cost & Points Engine
// =====================================================
// Core math utilities for calculating coin costs and point values
// for the POINTLOCK PvP betting system.
//
// DESIGN PRINCIPLES:
// - Favorites (high probability) cost MORE coins, give FEWER points
// - Underdogs (low probability) cost LESS coins, give MORE points
// - Higher tiers pay more for access to premium picks
// - All outputs are integers (rounded)
// - Pure functions with no side effects
//
// SECURITY CONSTRAINTS (PvP Referee Auditor):
// - Probability clamped to [0.02, 0.98] to prevent extreme values
// - All calculations deterministic and server-side only
// - Invalid inputs return safe defaults with error flags

import { PickTier } from '@pointlock/shared-types';
import {
  COIN_FORMULA,
  POINTS_FORMULA,
  MIN_SLIP_SPEND,
} from '@pointlock/shared-types';

// ===========================================
// Constants
// ===========================================

/**
 * Probability clamping bounds to prevent extreme values.
 * - PROB_MIN (0.02) ≈ +4900 American odds
 * - PROB_MAX (0.98) ≈ -4900 American odds
 */
const PROB_MIN = 0.02;
const PROB_MAX = 0.98;

/**
 * Hard caps for final values to prevent exploitation.
 */
const MAX_COIN_COST = Math.ceil(COIN_FORMULA.C_MAX * COIN_FORMULA.TIER_MULTIPLIERS.ELITE); // 375
const MIN_POINTS = 5;
const MAX_POINTS = 40;

// ===========================================
// Type Definitions
// ===========================================

/**
 * Market types for pick costing.
 * Aligns with PickType from shared-types/slip.types.ts.
 */
export type MarketType = 'moneyline' | 'spread' | 'total' | 'prop';

/**
 * Pick input for minimum spend validation.
 * coinCost should be pre-calculated before calling validateMinimumSpend.
 */
export interface PickForValidation {
  coinCost: number;
  tier: PickTier;
}

/**
 * Result for coin cost calculation.
 */
export interface CoinCostResult {
  /** Final rounded coin cost (integer) */
  coinCost: number;
  /** Pre-rounding value for debugging */
  rawCoinCost: number;
  /** Input probability used (after clamping) */
  impliedProbability: number;
  /** Input tier used */
  tier: PickTier;
  /** Multiplier applied from tier */
  tierMultiplier: number;
  /** Whether the calculation was valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Result for points calculation.
 */
export interface PointsResult {
  /** Final rounded points (integer) */
  points: number;
  /** Pre-rounding value for debugging */
  rawPoints: number;
  /** Input probability used (after clamping) */
  impliedProbability: number;
  /** Input market type used */
  marketType: MarketType;
  /** Modifier applied from market type */
  marketModifier: number;
  /** Bonus points added for underdogs */
  underdogBonus: number;
  /** Whether the calculation was valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Result for minimum spend validation.
 */
export interface MinSpendValidationResult {
  /** True if minimum spend requirement is met */
  ok: boolean;
  /** Sum of all pick coin costs */
  totalCoinCost: number;
  /** Required minimum for this pick count */
  minCoinSpend: number;
  /** How many coins short (0 if ok) */
  shortfall: number;
  /** Number of picks in slip */
  pickCount: number;
  /** Human-readable failure reason */
  reason?: string;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Clamps a probability to the safe calculation range [0.02, 0.98].
 *
 * @example
 * clampProbability(0.5)   // 0.5
 * clampProbability(0.001) // 0.02
 * clampProbability(0.999) // 0.98
 *
 * @param p - Raw probability value
 * @returns Clamped probability in [0.02, 0.98]
 */
export function clampProbability(p: number): number {
  return Math.max(PROB_MIN, Math.min(PROB_MAX, p));
}

/**
 * Validates that a probability is a valid finite number in [0, 1].
 *
 * @param p - Probability to validate
 * @returns Object with valid flag and error message
 */
function validateProbability(p: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(p)) {
    return { valid: false, error: 'Probability must be a finite number' };
  }
  if (p < 0 || p > 1) {
    return { valid: false, error: 'Probability must be between 0 and 1' };
  }
  return { valid: true };
}

/**
 * Gets the tier multiplier for coin cost calculation.
 * Defaults to FREE (1.0) for unknown tiers.
 *
 * @param tier - PickTier enum value
 * @returns Tier multiplier
 */
export function getTierMultiplier(tier: PickTier): number {
  const tierMap: Record<PickTier, keyof typeof COIN_FORMULA.TIER_MULTIPLIERS> = {
    [PickTier.FREE]: 'FREE',
    [PickTier.STANDARD]: 'STANDARD',
    [PickTier.PREMIUM]: 'PREMIUM',
    [PickTier.ELITE]: 'ELITE',
  };

  const tierKey = tierMap[tier];
  if (tierKey && COIN_FORMULA.TIER_MULTIPLIERS[tierKey] !== undefined) {
    return COIN_FORMULA.TIER_MULTIPLIERS[tierKey];
  }

  // Default to FREE tier for unknown values
  return COIN_FORMULA.TIER_MULTIPLIERS.FREE;
}

/**
 * Gets the market modifier for points calculation.
 * Defaults to moneyline (1.0) for unknown market types.
 *
 * @param marketType - Market type string
 * @returns Market modifier
 */
export function getMarketModifier(marketType: MarketType): number {
  const modifier = POINTS_FORMULA.MARKET_MODIFIERS[marketType];
  if (modifier !== undefined) {
    return modifier;
  }

  // Default to moneyline for unknown market types
  return POINTS_FORMULA.MARKET_MODIFIERS.moneyline;
}

/**
 * Calculates underdog bonus based on American odds thresholds.
 *
 * Bonus is awarded for positive odds at specific thresholds:
 * - +500 or higher: +4 points
 * - +400 to +499: +3 points
 * - +300 to +399: +2 points
 * - Below +300: no bonus
 *
 * @example
 * calculateUnderdogBonus(500)  // 4
 * calculateUnderdogBonus(450)  // 3
 * calculateUnderdogBonus(350)  // 2
 * calculateUnderdogBonus(250)  // 0
 * calculateUnderdogBonus(null) // 0
 *
 * @param americanOdds - American odds value (or null/undefined)
 * @returns Bonus points to add
 */
export function calculateUnderdogBonus(americanOdds: number | null | undefined): number {
  if (americanOdds === null || americanOdds === undefined) {
    return 0;
  }

  if (!Number.isFinite(americanOdds)) {
    return 0;
  }

  // Check thresholds from highest to lowest
  if (americanOdds >= 500) {
    return POINTS_FORMULA.UNDERDOG_BONUS[500];
  }
  if (americanOdds >= 400) {
    return POINTS_FORMULA.UNDERDOG_BONUS[400];
  }
  if (americanOdds >= 300) {
    return POINTS_FORMULA.UNDERDOG_BONUS[300];
  }

  return 0;
}

// ===========================================
// Main Calculation Functions
// ===========================================

/**
 * Calculates the coin cost for a pick based on implied probability and tier.
 *
 * Formula:
 * ```
 * baseCoinCost = C_MIN + (C_MAX - C_MIN) * (clampedProb ^ ALPHA)
 * coinCost = round(baseCoinCost * TIER_MULTIPLIERS[tier])
 * ```
 *
 * Properties:
 * - Monotonically increasing with probability (favorites cost more)
 * - Higher tiers have higher multipliers (pay more for premium access)
 * - Output is always an integer in range [25, 375]
 *
 * @example
 * // Underdog at FREE tier
 * calculateCoinCost(0.20, PickTier.FREE)
 * // { coinCost: 26, tier: PickTier.FREE, ... }
 *
 * // Favorite at ELITE tier
 * calculateCoinCost(0.80, PickTier.ELITE)
 * // { coinCost: 225, tier: PickTier.ELITE, ... }
 *
 * @param impliedProbability - Decimal probability in [0, 1]
 * @param tier - PickTier enum value
 * @returns CoinCostResult with calculated cost and metadata
 */
export function calculateCoinCost(
  impliedProbability: number,
  tier: PickTier
): CoinCostResult {
  // Validate probability
  const validation = validateProbability(impliedProbability);
  if (!validation.valid) {
    // Return safe default with error
    const defaultTierMultiplier = getTierMultiplier(tier);
    const defaultCost = Math.round(
      (COIN_FORMULA.C_MIN + COIN_FORMULA.C_MAX) / 2 * defaultTierMultiplier
    );
    return {
      coinCost: defaultCost,
      rawCoinCost: defaultCost,
      impliedProbability: 0.5,
      tier,
      tierMultiplier: defaultTierMultiplier,
      isValid: false,
      error: validation.error,
    };
  }

  // Clamp probability to safe range
  const clampedProb = clampProbability(impliedProbability);

  // Get tier multiplier
  const tierMultiplier = getTierMultiplier(tier);

  // Calculate base cost using power curve
  // baseCoinCost = C_MIN + (C_MAX - C_MIN) * (clampedProb ^ ALPHA)
  const { C_MIN, C_MAX, ALPHA } = COIN_FORMULA;
  const baseCoinCost = C_MIN + (C_MAX - C_MIN) * Math.pow(clampedProb, ALPHA);

  // Apply tier multiplier
  const rawCoinCost = baseCoinCost * tierMultiplier;

  // Round and cap
  const coinCost = Math.min(MAX_COIN_COST, Math.round(rawCoinCost));

  return {
    coinCost,
    rawCoinCost,
    impliedProbability: clampedProb,
    tier,
    tierMultiplier,
    isValid: true,
  };
}

/**
 * Calculates points for a pick based on implied probability, odds, and market type.
 *
 * Formula:
 * ```
 * inverseProb = 1 - clampedProb
 * basePoints = P_MIN + (P_MAX - P_MIN) * (inverseProb ^ BETA)
 * modifiedPoints = basePoints * MARKET_MODIFIERS[marketType]
 * points = round(modifiedPoints + underdogBonus)
 * ```
 *
 * Properties:
 * - Monotonically decreasing with probability (underdogs earn more)
 * - Spread/prop/total picks earn slightly fewer points than moneyline
 * - Underdog bonus adds flat points for +300/+400/+500 odds
 * - Output is always an integer in range [5, 40]
 *
 * @example
 * // Underdog moneyline with +400 odds
 * calculatePoints(0.20, 400, 'moneyline')
 * // { points: 28, underdogBonus: 3, ... }
 *
 * // Favorite spread pick
 * calculatePoints(0.70, -200, 'spread')
 * // { points: 11, underdogBonus: 0, ... }
 *
 * @param impliedProbability - Decimal probability in [0, 1]
 * @param americanOdds - American odds (e.g., -110, +200) or null
 * @param marketType - Market type ('moneyline', 'spread', 'total', 'prop')
 * @returns PointsResult with calculated points and metadata
 */
export function calculatePoints(
  impliedProbability: number,
  americanOdds: number | null | undefined,
  marketType: MarketType
): PointsResult {
  // Validate probability
  const validation = validateProbability(impliedProbability);
  if (!validation.valid) {
    // Return safe default with error
    const marketModifier = getMarketModifier(marketType);
    const defaultPoints = Math.round(
      (POINTS_FORMULA.P_MIN + POINTS_FORMULA.P_MAX) / 2 * marketModifier
    );
    return {
      points: defaultPoints,
      rawPoints: defaultPoints,
      impliedProbability: 0.5,
      marketType,
      marketModifier,
      underdogBonus: 0,
      isValid: false,
      error: validation.error,
    };
  }

  // Clamp probability to safe range
  const clampedProb = clampProbability(impliedProbability);

  // Get market modifier
  const marketModifier = getMarketModifier(marketType);

  // Calculate base points using inverse probability power curve
  // inverseProb = 1 - clampedProb
  // basePoints = P_MIN + (P_MAX - P_MIN) * (inverseProb ^ BETA)
  const { P_MIN, P_MAX, BETA } = POINTS_FORMULA;
  const inverseProb = 1 - clampedProb;
  const basePoints = P_MIN + (P_MAX - P_MIN) * Math.pow(inverseProb, BETA);

  // Apply market modifier
  const modifiedPoints = basePoints * marketModifier;

  // Calculate underdog bonus
  const underdogBonus = calculateUnderdogBonus(americanOdds);

  // Add bonus and round
  const rawPoints = modifiedPoints + underdogBonus;

  // Clamp to valid range
  const points = Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.round(rawPoints)));

  return {
    points,
    rawPoints,
    impliedProbability: clampedProb,
    marketType,
    marketModifier,
    underdogBonus,
    isValid: true,
  };
}

/**
 * Validates that a slip meets the minimum coin spend requirement.
 *
 * The minimum spend scales with pick count:
 * - 1 pick: No minimum
 * - 2 picks: 80 coins
 * - 3 picks: 110 coins
 * - 4 picks: 140 coins
 * - 5 picks: 170 coins
 * - 6 picks: 200 coins
 * - 7 picks: 230 coins
 * - 8+ picks: 260 coins
 *
 * @example
 * // Valid slip
 * validateMinimumSpend([
 *   { coinCost: 50, tier: PickTier.FREE },
 *   { coinCost: 50, tier: PickTier.FREE },
 * ])
 * // { ok: true, totalCoinCost: 100, minCoinSpend: 80, shortfall: 0, ... }
 *
 * // Invalid slip (short by 30 coins)
 * validateMinimumSpend([
 *   { coinCost: 25, tier: PickTier.FREE },
 *   { coinCost: 25, tier: PickTier.FREE },
 * ])
 * // { ok: false, totalCoinCost: 50, minCoinSpend: 80, shortfall: 30, ... }
 *
 * @param picks - Array of picks with pre-calculated coinCost
 * @returns MinSpendValidationResult
 */
export function validateMinimumSpend(
  picks: PickForValidation[]
): MinSpendValidationResult {
  const pickCount = picks.length;

  // Calculate total coin cost
  const totalCoinCost = picks.reduce((sum, pick) => sum + pick.coinCost, 0);

  // No minimum spend requirement for single picks
  if (pickCount < 2) {
    return {
      ok: true,
      totalCoinCost,
      minCoinSpend: 0,
      shortfall: 0,
      pickCount,
    };
  }

  // Look up minimum spend (cap at 8 picks for lookup)
  const lookupCount = Math.min(pickCount, 8);
  const minCoinSpend = MIN_SLIP_SPEND[lookupCount] ?? MIN_SLIP_SPEND[8];

  // Calculate shortfall
  const shortfall = Math.max(0, minCoinSpend - totalCoinCost);
  const ok = totalCoinCost >= minCoinSpend;

  return {
    ok,
    totalCoinCost,
    minCoinSpend,
    shortfall,
    pickCount,
    reason: ok
      ? undefined
      : `Minimum spend for ${pickCount} picks is ${minCoinSpend} coins. Current total: ${totalCoinCost} (${shortfall} coins short)`,
  };
}
