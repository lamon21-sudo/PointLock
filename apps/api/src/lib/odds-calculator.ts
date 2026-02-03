// =====================================================
// Odds Calculator - Point Potential Scoring Engine
// =====================================================
// Core math utilities for converting odds and calculating
// point values for PvP betting slips.
//
// SECURITY CONSTRAINTS (PVP Referee Auditor):
// - All calculations are server-side only
// - Point values have hard caps to prevent exploitation
// - Invalid/extreme odds are handled defensively
// - No floating-point precision issues in critical paths

// ===========================================
// Constants
// ===========================================

/**
 * Base points awarded for a standard pick (-110 odds).
 * This is the benchmark - easier picks get fewer, harder picks get more.
 */
export const BASE_POINTS = 10;

/**
 * Maximum points a single pick can earn.
 * SECURITY: Prevents "infinite points" exploits from extreme longshot odds.
 * Even +10000 odds should be capped at a reasonable value.
 */
export const MAX_POINTS_PER_PICK = 100;

/**
 * Minimum points a pick can earn.
 * SECURITY: Even heavy favorites (-10000) still earn some points.
 * Prevents gaming the system with "free" low-risk picks.
 */
export const MIN_POINTS_PER_PICK = 1;

/**
 * Maximum cumulative points for a single slip.
 * SECURITY: Prevents abuse through many-pick slips.
 * 20 picks * 100 max = 2000, but we cap lower for balance.
 */
export const MAX_POINTS_PER_SLIP = 500;

/**
 * Odds boundaries for validation.
 * SECURITY: Reject obviously invalid odds that could cause calculation errors.
 */
export const MIN_VALID_ODDS = -99999;
export const MAX_VALID_ODDS = 99999;

/**
 * Implied probability at which a standard pick (-110) sits.
 * This is approximately 52.38% (110/210).
 */
const STANDARD_IMPLIED_PROBABILITY = 110 / 210; // ~0.5238

// ===========================================
// Type Definitions
// ===========================================

export interface OddsConversionResult {
  decimalOdds: number;
  impliedProbability: number;
  isValid: boolean;
  error?: string;
}

export interface PointCalculationResult {
  pointValue: number;
  impliedProbability: number;
  difficultyMultiplier: number;
  isValid: boolean;
  error?: string;
}

export interface SlipPointPotentialResult {
  totalPointPotential: number;
  pickPointValues: number[];
  combinedImpliedProbability: number;
  parlayBonus: number;
  isValid: boolean;
  errors: string[];
}

// ===========================================
// Odds Conversion Functions
// ===========================================

/**
 * Validates that American odds are within acceptable bounds.
 *
 * SECURITY: Rejects odds that could cause:
 * - Division by zero
 * - Extreme values leading to overflow
 * - Invalid probability calculations
 */
export function isValidAmericanOdds(odds: number): boolean {
  // Must be a finite number
  if (!Number.isFinite(odds)) {
    return false;
  }

  // Must be within bounds
  if (odds < MIN_VALID_ODDS || odds > MAX_VALID_ODDS) {
    return false;
  }

  // American odds cannot be between -100 and +100 (exclusive)
  // -100 means even money on favorites, +100 means even money on underdogs
  // Values like -50 or +50 are mathematically invalid in American odds
  if (odds > -100 && odds < 100) {
    return false;
  }

  return true;
}

/**
 * Converts American odds to decimal odds.
 *
 * Formula:
 * - Positive (+200): (odds / 100) + 1 = 3.00
 * - Negative (-150): (100 / |odds|) + 1 = 1.667
 *
 * @param americanOdds - American odds (e.g., -110, +200)
 * @returns Decimal odds (e.g., 1.91, 3.00)
 */
export function americanToDecimalOdds(americanOdds: number): number {
  if (!isValidAmericanOdds(americanOdds)) {
    // Return neutral odds for invalid input
    return 2.0;
  }

  if (americanOdds >= 100) {
    // Positive odds: +200 means win $200 on $100 bet
    return (americanOdds / 100) + 1;
  }

  // Negative odds: -150 means bet $150 to win $100
  return (100 / Math.abs(americanOdds)) + 1;
}

/**
 * Converts American odds to implied probability.
 *
 * Formula:
 * - Positive (+200): 100 / (odds + 100) = 33.33%
 * - Negative (-150): |odds| / (|odds| + 100) = 60%
 *
 * Note: This returns the "raw" implied probability without removing vig.
 * For fair probability, you'd need to normalize across all outcomes.
 *
 * @param americanOdds - American odds (e.g., -110, +200)
 * @returns Implied probability as decimal (0.0 to 1.0)
 */
export function americanToImpliedProbability(americanOdds: number): number {
  if (!isValidAmericanOdds(americanOdds)) {
    // Return 50% for invalid input (neutral assumption)
    return 0.5;
  }

  if (americanOdds >= 100) {
    // Positive odds: lower probability (underdog)
    return 100 / (americanOdds + 100);
  }

  // Negative odds: higher probability (favorite)
  const absOdds = Math.abs(americanOdds);
  return absOdds / (absOdds + 100);
}

/**
 * Full odds conversion with validation and error handling.
 */
export function convertAmericanOdds(americanOdds: number): OddsConversionResult {
  if (!isValidAmericanOdds(americanOdds)) {
    return {
      decimalOdds: 2.0,
      impliedProbability: 0.5,
      isValid: false,
      error: `Invalid American odds: ${americanOdds}. Must be >= +100 or <= -100.`,
    };
  }

  return {
    decimalOdds: americanToDecimalOdds(americanOdds),
    impliedProbability: americanToImpliedProbability(americanOdds),
    isValid: true,
  };
}

// ===========================================
// Point Value Calculation
// ===========================================

/**
 * Maximum difficulty multiplier allowed.
 * SECURITY: Caps the multiplier to prevent extreme point values.
 */
const MAX_DIFFICULTY_MULTIPLIER = 8.0;

/**
 * Minimum difficulty multiplier allowed.
 * SECURITY: Ensures favorites still earn meaningful (but small) points.
 */
const MIN_DIFFICULTY_MULTIPLIER = 0.25;

/**
 * Calculates the difficulty multiplier based on implied probability.
 *
 * The multiplier is inversely proportional to probability:
 * - 50% probability (even odds) = 1.0x multiplier
 * - 25% probability (longshot) = 2.0x multiplier
 * - 75% probability (favorite) = 0.67x multiplier
 *
 * We use a logarithmic curve to prevent extreme values:
 * - Very low probability caps at MAX_DIFFICULTY_MULTIPLIER (8x)
 * - Very high probability floors at MIN_DIFFICULTY_MULTIPLIER (0.25x)
 *
 * SECURITY: Hard caps prevent exploitation through extreme odds.
 *
 * @param impliedProbability - Probability as decimal (0.0 to 1.0)
 * @returns Difficulty multiplier (clamped between 0.25 and 8.0)
 */
export function calculateDifficultyMultiplier(impliedProbability: number): number {
  // Clamp probability to prevent division by zero or negative values
  const clampedProb = Math.max(0.01, Math.min(0.99, impliedProbability));

  // Base formula: inverse of probability normalized to standard odds
  // At -110 odds (~52.38% probability), multiplier should be ~1.0
  const baseMultiplier = STANDARD_IMPLIED_PROBABILITY / clampedProb;

  // Apply logarithmic dampening to prevent extreme values
  // This uses a soft cap curve instead of hard cutoffs
  let adjustedMultiplier: number;

  if (baseMultiplier > 2) {
    // For longshots: use sqrt to compress high multipliers
    // sqrt(4) = 2, so a 4x multiplier becomes ~2.83x after adjustment
    adjustedMultiplier = 1 + Math.sqrt(baseMultiplier - 1) * 1.5;
  } else if (baseMultiplier < 0.5) {
    // For heavy favorites: prevent going too low
    // Use a floor that approaches but never reaches 0.25
    adjustedMultiplier = 0.25 + (baseMultiplier * 0.5);
  } else {
    adjustedMultiplier = baseMultiplier;
  }

  // SECURITY: Apply hard caps to prevent exploitation
  return Math.max(MIN_DIFFICULTY_MULTIPLIER, Math.min(MAX_DIFFICULTY_MULTIPLIER, adjustedMultiplier));
}

/**
 * Calculates point value for a single pick based on American odds.
 *
 * SECURITY CONSTRAINTS:
 * - Result is always clamped between MIN and MAX points
 * - Invalid odds default to base points (no exploit advantage)
 * - All calculations use safe math operations
 *
 * @param americanOdds - American odds for the pick
 * @returns Point calculation result with detailed breakdown
 */
export function calculatePickPointValue(americanOdds: number): PointCalculationResult {
  // Validate input
  if (!isValidAmericanOdds(americanOdds)) {
    return {
      pointValue: BASE_POINTS,
      impliedProbability: 0.5,
      difficultyMultiplier: 1.0,
      isValid: false,
      error: `Invalid odds (${americanOdds}), using base points`,
    };
  }

  const impliedProbability = americanToImpliedProbability(americanOdds);
  const difficultyMultiplier = calculateDifficultyMultiplier(impliedProbability);

  // Calculate raw points
  const rawPoints = BASE_POINTS * difficultyMultiplier;

  // Clamp to valid range
  const pointValue = Math.round(
    Math.max(MIN_POINTS_PER_PICK, Math.min(MAX_POINTS_PER_PICK, rawPoints))
  );

  return {
    pointValue,
    impliedProbability,
    difficultyMultiplier,
    isValid: true,
  };
}

// ===========================================
// Slip-Level Calculations
// ===========================================

/**
 * Calculates parlay bonus multiplier based on number of picks.
 *
 * Parlays are harder to hit, so they deserve bonus points.
 * The bonus scales with pick count but has diminishing returns.
 *
 * SECURITY: Capped to prevent abuse with many-pick slips.
 *
 * @param pickCount - Number of picks in the slip
 * @returns Bonus multiplier (1.0 = no bonus)
 */
export function calculateParlayBonus(pickCount: number): number {
  if (pickCount <= 1) {
    return 1.0; // No bonus for single picks
  }

  // Diminishing returns: each additional pick adds less bonus
  // 2 picks: 1.1x, 3 picks: 1.18x, 4 picks: 1.24x, etc.
  // Formula: 1 + 0.1 * log2(pickCount)
  const bonus = 1 + (0.1 * Math.log2(pickCount));

  // Cap at 1.5x bonus (reached around 32 picks, but we limit to 20)
  return Math.min(1.5, bonus);
}

/**
 * Calculates the combined implied probability of a parlay.
 *
 * For independent events, multiply individual probabilities.
 * This is used for display purposes only, not for point calculation.
 *
 * @param probabilities - Array of implied probabilities for each pick
 * @returns Combined probability
 */
export function calculateCombinedProbability(probabilities: number[]): number {
  if (probabilities.length === 0) {
    return 0;
  }

  return probabilities.reduce((acc, prob) => acc * prob, 1);
}

/**
 * Calculates total point potential for a slip with multiple picks.
 *
 * The calculation:
 * 1. Calculate individual point values for each pick
 * 2. Sum all individual points
 * 3. Apply parlay bonus for multi-pick slips
 * 4. Cap at maximum slip points
 *
 * SECURITY CONSTRAINTS:
 * - Each pick's points are individually capped
 * - Total is capped at MAX_POINTS_PER_SLIP
 * - Invalid odds don't provide exploitable advantages
 *
 * @param oddsArray - Array of American odds for each pick
 * @returns Detailed point potential calculation
 */
export function calculateSlipPointPotential(oddsArray: number[]): SlipPointPotentialResult {
  const errors: string[] = [];
  const pickPointValues: number[] = [];
  const impliedProbabilities: number[] = [];

  // Calculate individual pick values
  for (let i = 0; i < oddsArray.length; i++) {
    const result = calculatePickPointValue(oddsArray[i]);
    pickPointValues.push(result.pointValue);
    impliedProbabilities.push(result.impliedProbability);

    if (!result.isValid && result.error) {
      errors.push(`Pick ${i + 1}: ${result.error}`);
    }
  }

  // Sum individual points
  const sumOfPoints = pickPointValues.reduce((acc, pts) => acc + pts, 0);

  // Calculate parlay bonus
  const parlayBonus = calculateParlayBonus(oddsArray.length);

  // Apply bonus and cap
  const rawTotal = sumOfPoints * parlayBonus;
  const totalPointPotential = Math.round(
    Math.min(MAX_POINTS_PER_SLIP, rawTotal)
  );

  // Combined probability for display
  const combinedImpliedProbability = calculateCombinedProbability(impliedProbabilities);

  return {
    totalPointPotential,
    pickPointValues,
    combinedImpliedProbability,
    parlayBonus,
    isValid: errors.length === 0,
    errors,
  };
}

// ===========================================
// Utility Exports for Testing
// ===========================================

/**
 * Lookup table for common odds -> points mapping.
 * Useful for testing and validation.
 */
export const COMMON_ODDS_POINT_VALUES: Record<number, number> = {
  // Heavy favorites (low points)
  [-1000]: calculatePickPointValue(-1000).pointValue,
  [-500]: calculatePickPointValue(-500).pointValue,
  [-300]: calculatePickPointValue(-300).pointValue,
  [-200]: calculatePickPointValue(-200).pointValue,
  [-150]: calculatePickPointValue(-150).pointValue,

  // Standard odds (base points)
  [-110]: calculatePickPointValue(-110).pointValue,
  [100]: calculatePickPointValue(100).pointValue,

  // Underdogs (higher points)
  [150]: calculatePickPointValue(150).pointValue,
  [200]: calculatePickPointValue(200).pointValue,
  [300]: calculatePickPointValue(300).pointValue,
  [500]: calculatePickPointValue(500).pointValue,
  [1000]: calculatePickPointValue(1000).pointValue,
  [5000]: calculatePickPointValue(5000).pointValue,
};
