// =====================================================
// Coin & Points Formula Types
// =====================================================

export const STARTER_COINS = 750;

export const COIN_FORMULA = {
  C_MIN: 25,
  C_MAX: 250,
  ALPHA: 2.2,
  TIER_MULTIPLIERS: {
    FREE: 1.0,
    STANDARD: 1.15,
    PREMIUM: 1.3,
    ELITE: 1.5,
  },
} as const;

export const POINTS_FORMULA = {
  P_MIN: 8,
  P_MAX: 30,
  BETA: 1.3,
  UNDERDOG_BONUS: {
    300: 2,
    400: 3,
    500: 4,
  },
  MARKET_MODIFIERS: {
    moneyline: 1.0,
    spread: 0.85,
    prop: 0.90,
    total: 0.90,
  },
} as const;

export const MIN_SLIP_SPEND: Record<number, number> = {
  2: 80,
  3: 110,
  4: 140,
  5: 170,
  6: 200,
  7: 230,
  8: 260,
};
