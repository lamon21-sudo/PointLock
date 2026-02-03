// =====================================================
// Pick Tier Types
// =====================================================

export enum PickTier {
  FREE = 1,      // Default unlocked
  STANDARD = 2,  // Unlock at 2,500 coins
  PREMIUM = 3,   // Unlock at 7,500+ coins
  ELITE = 4,     // High balance or 5+ win streak
}

export interface TierThreshold {
  tier: PickTier;
  coinThreshold: number;
  streakThreshold?: number;
  name: string;
}

export const TIER_THRESHOLDS: TierThreshold[] = [
  { tier: PickTier.FREE, coinThreshold: 0, name: 'Free' },
  { tier: PickTier.STANDARD, coinThreshold: 2500, name: 'Standard' },
  { tier: PickTier.PREMIUM, coinThreshold: 7500, name: 'Premium' },
  { tier: PickTier.ELITE, coinThreshold: 15000, streakThreshold: 5, name: 'Elite' },
];

// =====================================================
// Market Type to Tier Mapping
// =====================================================
// Determines which tier is required to access each market type.

export type MarketType = 'moneyline' | 'spread' | 'total' | 'prop';

export const MARKET_TIER_MAP: Record<MarketType, PickTier> = {
  moneyline: PickTier.FREE,
  spread: PickTier.STANDARD,
  total: PickTier.STANDARD,
  prop: PickTier.PREMIUM,
};

// =====================================================
// Tier Coin Costs
// =====================================================
// Coin cost for each tier's picks.

export const TIER_COIN_COST: Record<PickTier, number> = {
  [PickTier.FREE]: 0,
  [PickTier.STANDARD]: 100,
  [PickTier.PREMIUM]: 250,
  [PickTier.ELITE]: 500,
};

// =====================================================
// Tier Names for Display
// =====================================================

export const TIER_NAMES: Record<PickTier, string> = {
  [PickTier.FREE]: 'Free',
  [PickTier.STANDARD]: 'Standard',
  [PickTier.PREMIUM]: 'Premium',
  [PickTier.ELITE]: 'Elite',
};
