// =====================================================
// Tier Service
// =====================================================
// Handles user tier calculations and pick tier-locking logic.
// Tiers unlock access to higher-value betting markets.
//
// TIER RULES (ascending order):
// - FREE: Default, no requirements
// - STANDARD: 2,500 coins earned OR 10+ win streak
// - PREMIUM: 7,500 coins earned OR 20+ win streak
// - ELITE: 15,000 coins earned OR 5+ win streak (per schema spec)
//
// IMPORTANT: Tier is calculated from totalCoinsEarned (lifetime),
// not current wallet balance. This means users cannot lose their
// tier by spending coins.

import { PickTier, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import { bigIntToNumber } from './wallet.service';
import { getOrFetch, del } from './cache.service';

// ===========================================
// Constants
// ===========================================

/**
 * Tier rank mapping for comparison operations.
 * Higher number = higher tier.
 */
export const TIER_RANK: Record<PickTier, number> = {
  FREE: 0,
  STANDARD: 1,
  PREMIUM: 2,
  ELITE: 3,
};

/**
 * Tier unlock thresholds.
 * - coins: Lifetime totalCoinsEarned required
 * - streak: Current win streak required (harder path to prevent farming)
 *
 * Note: ELITE has a lower streak requirement (5) per schema specification
 * ("15,000 coins OR 5+ win streak"). Lower tiers have higher streak
 * requirements to make streak farming less viable.
 */
export const TIER_THRESHOLDS = {
  STANDARD: { coins: 2500, streak: 10 },
  PREMIUM: { coins: 7500, streak: 20 },
  ELITE: { coins: 15000, streak: 5 },
} as const;

/**
 * Coin cost for each tier's picks.
 * FREE picks have no cost, higher tiers cost more.
 */
export const TIER_COIN_COST: Record<PickTier, number> = {
  FREE: 0,
  STANDARD: 100,
  PREMIUM: 250,
  ELITE: 500,
};

/**
 * Market type to tier mapping.
 * Determines which tier is required to access each market type.
 */
const MARKET_TIER_MAP: Record<string, PickTier> = {
  moneyline: PickTier.FREE,
  spread: PickTier.STANDARD,
  total: PickTier.STANDARD,
  prop: PickTier.PREMIUM,
};

// ===========================================
// Cache Keys & TTLs
// ===========================================

const USER_TIER_CACHE_KEY = (userId: string) => `tier:user:${userId}`;
const USER_TIER_TTL = 300; // 5 minutes

// ===========================================
// Types
// ===========================================

export interface UserTierInfo {
  tier: PickTier;
  coinsEarned: number;
  currentStreak: number;
}

export interface TierUnlockResult {
  unlocked: boolean;
  newTier?: PickTier;
  previousTier: PickTier;
}

export interface AvailablePick {
  marketType: 'moneyline' | 'spread' | 'total' | 'prop';
  selection: string;
  line?: number;
  odds: number;
  tier: PickTier;
  coinCost: number;
  propType?: string;
  propPlayerId?: string;
  propPlayerName?: string;
}

// OddsData structure from SportsEvent
interface OddsDataMoneyline {
  home: number;
  away: number;
}

interface OddsDataSpread {
  home: { line: number; odds: number };
  away: { line: number; odds: number };
}

interface OddsDataTotal {
  line: number;
  over: number;
  under: number;
}

interface OddsDataProp {
  playerId: string;
  playerName: string;
  propType: string;
  line: number;
  over: number;
  under: number;
}

interface OddsData {
  moneyline?: OddsDataMoneyline;
  spread?: OddsDataSpread;
  total?: OddsDataTotal;
  props?: OddsDataProp[];
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Compare two tiers and return their relative ordering.
 * @returns Negative if a < b, 0 if equal, positive if a > b
 */
export function compareTiers(a: PickTier, b: PickTier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/**
 * Pure function: Calculate tier from user stats.
 * Deterministic - same inputs always produce same output.
 *
 * @param coinsEarned - Lifetime coins earned (totalCoinsEarned)
 * @param currentStreak - Current win streak
 * @returns The calculated tier
 */
export function calculateTierFromStats(
  coinsEarned: number,
  currentStreak: number
): PickTier {
  // ELITE: 15,000 coins OR 5+ streak (per schema)
  if (coinsEarned >= TIER_THRESHOLDS.ELITE.coins || currentStreak >= TIER_THRESHOLDS.ELITE.streak) {
    return PickTier.ELITE;
  }
  // PREMIUM: 7,500 coins OR 20+ streak
  if (coinsEarned >= TIER_THRESHOLDS.PREMIUM.coins || currentStreak >= TIER_THRESHOLDS.PREMIUM.streak) {
    return PickTier.PREMIUM;
  }
  // STANDARD: 2,500 coins OR 10+ streak
  if (coinsEarned >= TIER_THRESHOLDS.STANDARD.coins || currentStreak >= TIER_THRESHOLDS.STANDARD.streak) {
    return PickTier.STANDARD;
  }
  // FREE: default
  return PickTier.FREE;
}

/**
 * Parse oddsData JSON from SportsEvent into typed structure.
 * Handles missing or malformed data gracefully.
 */
function parseOddsData(raw: Prisma.JsonValue): OddsData | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const result: OddsData = {};

  // Handle nested markets structure (some fetchers wrap in 'markets')
  const source = (data.markets as Record<string, unknown>) ?? data;

  // Parse moneyline
  if (source.moneyline && typeof source.moneyline === 'object') {
    const ml = source.moneyline as Record<string, unknown>;
    if (typeof ml.home === 'number' && typeof ml.away === 'number') {
      result.moneyline = { home: ml.home, away: ml.away };
    }
  }

  // Parse spread
  if (source.spread && typeof source.spread === 'object') {
    const sp = source.spread as Record<string, unknown>;
    const home = sp.home as Record<string, unknown> | undefined;
    const away = sp.away as Record<string, unknown> | undefined;
    if (
      home && typeof home.line === 'number' && typeof home.odds === 'number' &&
      away && typeof away.line === 'number' && typeof away.odds === 'number'
    ) {
      result.spread = {
        home: { line: home.line, odds: home.odds },
        away: { line: away.line, odds: away.odds },
      };
    }
  }

  // Parse total
  if (source.total && typeof source.total === 'object') {
    const tot = source.total as Record<string, unknown>;
    if (
      typeof tot.line === 'number' &&
      typeof tot.over === 'number' &&
      typeof tot.under === 'number'
    ) {
      result.total = { line: tot.line, over: tot.over, under: tot.under };
    }
  }

  // Parse props
  if (Array.isArray(source.props)) {
    result.props = source.props.filter((p): p is OddsDataProp => {
      if (!p || typeof p !== 'object') return false;
      const prop = p as Record<string, unknown>;
      return (
        typeof prop.playerId === 'string' &&
        typeof prop.playerName === 'string' &&
        typeof prop.propType === 'string' &&
        typeof prop.line === 'number' &&
        typeof prop.over === 'number' &&
        typeof prop.under === 'number'
      );
    });
  }

  return result;
}

/**
 * Convert parsed odds data into AvailablePick array.
 * Applies tier assignments based on market type.
 */
function oddsToAvailablePicks(odds: OddsData): AvailablePick[] {
  const picks: AvailablePick[] = [];

  // Moneyline picks (FREE tier)
  if (odds.moneyline) {
    const tier = MARKET_TIER_MAP.moneyline;
    picks.push({
      marketType: 'moneyline',
      selection: 'home',
      odds: odds.moneyline.home,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
    picks.push({
      marketType: 'moneyline',
      selection: 'away',
      odds: odds.moneyline.away,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
  }

  // Spread picks (STANDARD tier)
  if (odds.spread) {
    const tier = MARKET_TIER_MAP.spread;
    picks.push({
      marketType: 'spread',
      selection: 'home',
      line: odds.spread.home.line,
      odds: odds.spread.home.odds,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
    picks.push({
      marketType: 'spread',
      selection: 'away',
      line: odds.spread.away.line,
      odds: odds.spread.away.odds,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
  }

  // Total picks (STANDARD tier)
  if (odds.total) {
    const tier = MARKET_TIER_MAP.total;
    picks.push({
      marketType: 'total',
      selection: 'over',
      line: odds.total.line,
      odds: odds.total.over,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
    picks.push({
      marketType: 'total',
      selection: 'under',
      line: odds.total.line,
      odds: odds.total.under,
      tier,
      coinCost: TIER_COIN_COST[tier],
    });
  }

  // Prop picks (PREMIUM tier)
  if (odds.props && odds.props.length > 0) {
    const tier = MARKET_TIER_MAP.prop;
    for (const prop of odds.props) {
      picks.push({
        marketType: 'prop',
        selection: 'over',
        line: prop.line,
        odds: prop.over,
        tier,
        coinCost: TIER_COIN_COST[tier],
        propType: prop.propType,
        propPlayerId: prop.playerId,
        propPlayerName: prop.playerName,
      });
      picks.push({
        marketType: 'prop',
        selection: 'under',
        line: prop.line,
        odds: prop.under,
        tier,
        coinCost: TIER_COIN_COST[tier],
        propType: prop.propType,
        propPlayerId: prop.playerId,
        propPlayerName: prop.playerName,
      });
    }
  }

  return picks;
}

// ===========================================
// Main Service Functions
// ===========================================

/**
 * Get the computed tier for a user based on their stats.
 *
 * Note: This returns the CALCULATED tier based on totalCoinsEarned
 * and currentStreak, NOT the stored currentTier field. Use this to
 * determine what tier a user should have.
 *
 * @param userId - The user's ID
 * @returns User tier info including calculated tier, coins earned, and streak
 * @throws NotFoundError if user doesn't exist
 */
export async function getUserTier(userId: string): Promise<UserTierInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      totalCoinsEarned: true,
      currentStreak: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  // Handle null/undefined with safe defaults
  const coinsEarned = bigIntToNumber(user.totalCoinsEarned ?? BigInt(0));
  const currentStreak = user.currentStreak ?? 0;

  const tier = calculateTierFromStats(coinsEarned, currentStreak);

  logger.debug(`getUserTier: userId=${userId}, tier=${tier}, coins=${coinsEarned}, streak=${currentStreak}`);

  return {
    tier,
    coinsEarned,
    currentStreak,
  };
}

/**
 * Get user tier with Redis caching.
 * Falls back to DB on cache miss or Redis failure.
 */
export async function getUserTierCached(userId: string): Promise<UserTierInfo> {
  return getOrFetch(
    USER_TIER_CACHE_KEY(userId),
    () => getUserTier(userId),
    USER_TIER_TTL
  );
}

/**
 * Invalidate user tier cache.
 * Call after operations that change totalCoinsEarned or currentStreak.
 */
export async function invalidateUserTierCache(userId: string): Promise<void> {
  await del(USER_TIER_CACHE_KEY(userId));
  logger.debug(`[TierService] Invalidated tier cache for user ${userId}`);
}

/**
 * Check if a user has unlocked a new tier.
 *
 * Compares the user's stored currentTier with their calculated tier.
 * Returns unlock info if the calculated tier is higher than stored.
 *
 * IMPORTANT: This function does NOT update the database. The caller
 * is responsible for persisting tier changes if needed.
 *
 * @param userId - The user's ID
 * @returns Unlock result with previous and new tier info
 * @throws NotFoundError if user doesn't exist
 */
export async function checkTierUnlock(userId: string): Promise<TierUnlockResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentTier: true,
      totalCoinsEarned: true,
      currentStreak: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  const previousTier = user.currentTier;
  const coinsEarned = bigIntToNumber(user.totalCoinsEarned ?? BigInt(0));
  const currentStreak = user.currentStreak ?? 0;
  const calculatedTier = calculateTierFromStats(coinsEarned, currentStreak);

  // Check if calculated tier is higher than stored tier
  const tierDiff = compareTiers(calculatedTier, previousTier);

  if (tierDiff > 0) {
    logger.info(
      `Tier unlock detected: userId=${userId}, ` +
      `${previousTier} -> ${calculatedTier} (coins=${coinsEarned}, streak=${currentStreak})`
    );

    return {
      unlocked: true,
      newTier: calculatedTier,
      previousTier,
    };
  }

  return {
    unlocked: false,
    previousTier,
  };
}

/**
 * Check if a pick is locked for a given user tier.
 *
 * A pick is "locked" if the user's tier is lower than the pick's
 * required tier. Locked picks cannot be added to slips.
 *
 * @param pick - Object with a tier field (e.g., SlipPick, AvailablePick)
 * @param userTier - The user's current tier
 * @returns true if the pick is locked (user cannot access), false if accessible
 */
export function isPickLocked(pick: { tier?: PickTier | null }, userTier: PickTier): boolean {
  // Default to FREE tier if pick has no tier specified
  const pickTier = pick.tier ?? PickTier.FREE;

  // Pick is locked if user tier rank is lower than pick tier rank
  const isLocked = TIER_RANK[userTier] < TIER_RANK[pickTier];

  return isLocked;
}

/**
 * Get available betting picks for an event filtered by user's tier.
 *
 * Parses the event's oddsData JSON to extract available markets
 * (moneyline, spread, total, props), assigns tiers based on market
 * type, and filters to only include picks the user can access.
 *
 * @param userId - The user's ID
 * @param eventId - The sports event ID
 * @returns Array of available picks sorted by tier (easiest first)
 * @throws NotFoundError if user or event doesn't exist
 */
export async function getAvailablePicks(
  userId: string,
  eventId: string
): Promise<AvailablePick[]> {
  // Fetch user tier (cached) and event in parallel
  const [userTierInfo, event] = await Promise.all([
    getUserTierCached(userId),
    prisma.sportsEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        oddsData: true,
      },
    }),
  ]);

  if (!event) {
    throw new NotFoundError('Event not found', ERROR_CODES.EVENT_NOT_FOUND);
  }

  // Parse odds data from event
  const oddsData = parseOddsData(event.oddsData);

  if (!oddsData) {
    logger.warn(`getAvailablePicks: No valid oddsData for event ${eventId}`);
    return [];
  }

  // Convert odds to available picks
  const allPicks = oddsToAvailablePicks(oddsData);

  // Filter by user tier
  const availablePicks = allPicks.filter(
    (pick) => !isPickLocked(pick, userTierInfo.tier)
  );

  // Sort by tier (lowest first)
  availablePicks.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  logger.debug(
    `getAvailablePicks: userId=${userId}, eventId=${eventId}, ` +
    `userTier=${userTierInfo.tier}, total=${allPicks.length}, available=${availablePicks.length}`
  );

  return availablePicks;
}
