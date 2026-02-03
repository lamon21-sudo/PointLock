// =====================================================
// Tier Service Test Suite
// =====================================================

import { describe, it, expect } from 'vitest';
import { PickTier } from '@prisma/client';
import {
  calculateTierFromStats,
  compareTiers,
  isPickLocked,
  TIER_RANK,
  TIER_THRESHOLDS,
  TIER_COIN_COST,
} from './tier.service';

// ===========================================
// Test: TIER_RANK ordering
// ===========================================

describe('TIER_RANK', () => {
  it('FREE is rank 0', () => {
    expect(TIER_RANK.FREE).toBe(0);
  });

  it('STANDARD is rank 1', () => {
    expect(TIER_RANK.STANDARD).toBe(1);
  });

  it('PREMIUM is rank 2', () => {
    expect(TIER_RANK.PREMIUM).toBe(2);
  });

  it('ELITE is rank 3', () => {
    expect(TIER_RANK.ELITE).toBe(3);
  });

  it('FREE < STANDARD', () => {
    expect(TIER_RANK.FREE < TIER_RANK.STANDARD).toBe(true);
  });

  it('STANDARD < PREMIUM', () => {
    expect(TIER_RANK.STANDARD < TIER_RANK.PREMIUM).toBe(true);
  });

  it('PREMIUM < ELITE', () => {
    expect(TIER_RANK.PREMIUM < TIER_RANK.ELITE).toBe(true);
  });
});

// ===========================================
// Test: TIER_THRESHOLDS
// ===========================================

describe('TIER_THRESHOLDS', () => {
  it('STANDARD requires 2500 coins', () => {
    expect(TIER_THRESHOLDS.STANDARD.coins).toBe(2500);
  });

  it('STANDARD requires 10 streak', () => {
    expect(TIER_THRESHOLDS.STANDARD.streak).toBe(10);
  });

  it('PREMIUM requires 7500 coins', () => {
    expect(TIER_THRESHOLDS.PREMIUM.coins).toBe(7500);
  });

  it('PREMIUM requires 20 streak', () => {
    expect(TIER_THRESHOLDS.PREMIUM.streak).toBe(20);
  });

  it('ELITE requires 15000 coins', () => {
    expect(TIER_THRESHOLDS.ELITE.coins).toBe(15000);
  });

  it('ELITE requires 5 streak (per schema)', () => {
    expect(TIER_THRESHOLDS.ELITE.streak).toBe(5);
  });
});

// ===========================================
// Test: TIER_COIN_COST
// ===========================================

describe('TIER_COIN_COST', () => {
  it('FREE tier picks cost 0', () => {
    expect(TIER_COIN_COST.FREE).toBe(0);
  });

  it('STANDARD tier picks cost 100', () => {
    expect(TIER_COIN_COST.STANDARD).toBe(100);
  });

  it('PREMIUM tier picks cost 250', () => {
    expect(TIER_COIN_COST.PREMIUM).toBe(250);
  });

  it('ELITE tier picks cost 500', () => {
    expect(TIER_COIN_COST.ELITE).toBe(500);
  });
});

// ===========================================
// Test: compareTiers
// ===========================================

describe('compareTiers', () => {
  it('FREE == FREE', () => {
    expect(compareTiers(PickTier.FREE, PickTier.FREE)).toBe(0);
  });

  it('STANDARD == STANDARD', () => {
    expect(compareTiers(PickTier.STANDARD, PickTier.STANDARD)).toBe(0);
  });

  it('FREE < STANDARD', () => {
    expect(compareTiers(PickTier.FREE, PickTier.STANDARD) < 0).toBe(true);
  });

  it('STANDARD > FREE', () => {
    expect(compareTiers(PickTier.STANDARD, PickTier.FREE) > 0).toBe(true);
  });

  it('FREE < ELITE', () => {
    expect(compareTiers(PickTier.FREE, PickTier.ELITE) < 0).toBe(true);
  });

  it('ELITE > FREE', () => {
    expect(compareTiers(PickTier.ELITE, PickTier.FREE) > 0).toBe(true);
  });

  it('PREMIUM < ELITE', () => {
    expect(compareTiers(PickTier.PREMIUM, PickTier.ELITE) < 0).toBe(true);
  });
});

// ===========================================
// Test: calculateTierFromStats - coin-based
// ===========================================

describe('calculateTierFromStats - coin thresholds', () => {
  it('0 coins = FREE', () => {
    expect(calculateTierFromStats(0, 0)).toBe(PickTier.FREE);
  });

  it('2499 coins = FREE', () => {
    expect(calculateTierFromStats(2499, 0)).toBe(PickTier.FREE);
  });

  it('2500 coins = STANDARD', () => {
    expect(calculateTierFromStats(2500, 0)).toBe(PickTier.STANDARD);
  });

  it('7499 coins = STANDARD', () => {
    expect(calculateTierFromStats(7499, 0)).toBe(PickTier.STANDARD);
  });

  it('7500 coins = PREMIUM', () => {
    expect(calculateTierFromStats(7500, 0)).toBe(PickTier.PREMIUM);
  });

  it('14999 coins = PREMIUM', () => {
    expect(calculateTierFromStats(14999, 0)).toBe(PickTier.PREMIUM);
  });

  it('15000 coins = ELITE', () => {
    expect(calculateTierFromStats(15000, 0)).toBe(PickTier.ELITE);
  });

  it('100000 coins = ELITE', () => {
    expect(calculateTierFromStats(100000, 0)).toBe(PickTier.ELITE);
  });
});

// ===========================================
// Test: calculateTierFromStats - streak-based
// ===========================================

describe('calculateTierFromStats - streak thresholds', () => {
  it('0 streak = FREE', () => {
    expect(calculateTierFromStats(0, 0)).toBe(PickTier.FREE);
  });

  it('4 streak = FREE', () => {
    expect(calculateTierFromStats(0, 4)).toBe(PickTier.FREE);
  });

  it('5 streak = ELITE (per schema)', () => {
    expect(calculateTierFromStats(0, 5)).toBe(PickTier.ELITE);
  });

  it('9 streak = ELITE', () => {
    expect(calculateTierFromStats(0, 9)).toBe(PickTier.ELITE);
  });

  it('10 streak = ELITE', () => {
    expect(calculateTierFromStats(0, 10)).toBe(PickTier.ELITE);
  });

  it('19 streak = ELITE', () => {
    expect(calculateTierFromStats(0, 19)).toBe(PickTier.ELITE);
  });

  it('20 streak = ELITE', () => {
    expect(calculateTierFromStats(0, 20)).toBe(PickTier.ELITE);
  });
});

// ===========================================
// Test: calculateTierFromStats - OR logic
// ===========================================

describe('calculateTierFromStats - OR logic (coins OR streak)', () => {
  it('ELITE via coins only', () => {
    expect(calculateTierFromStats(15000, 0)).toBe(PickTier.ELITE);
  });

  it('ELITE via streak only', () => {
    expect(calculateTierFromStats(0, 5)).toBe(PickTier.ELITE);
  });

  it('ELITE via both', () => {
    expect(calculateTierFromStats(15000, 5)).toBe(PickTier.ELITE);
  });

  it('PREMIUM via coins, no streak', () => {
    expect(calculateTierFromStats(7500, 0)).toBe(PickTier.PREMIUM);
  });

  it('PREMIUM via coins, 4 streak', () => {
    expect(calculateTierFromStats(7500, 4)).toBe(PickTier.PREMIUM);
  });

  it('STANDARD via coins', () => {
    expect(calculateTierFromStats(2500, 0)).toBe(PickTier.STANDARD);
  });

  it('STANDARD via coins, 4 streak', () => {
    expect(calculateTierFromStats(2500, 4)).toBe(PickTier.STANDARD);
  });

  it('ELITE: 100 coins but 5 streak', () => {
    expect(calculateTierFromStats(100, 5)).toBe(PickTier.ELITE);
  });

  it('ELITE: just below STANDARD coins but 5 streak', () => {
    expect(calculateTierFromStats(2499, 5)).toBe(PickTier.ELITE);
  });
});

// ===========================================
// Test: calculateTierFromStats - deterministic
// ===========================================

describe('calculateTierFromStats - determinism', () => {
  const inputs: [number, number][] = [
    [0, 0],
    [2500, 5],
    [7500, 10],
    [15000, 20],
  ];

  for (const [coins, streak] of inputs) {
    it(`Deterministic: (${coins}, ${streak}) call 1 == call 2`, () => {
      const result1 = calculateTierFromStats(coins, streak);
      const result2 = calculateTierFromStats(coins, streak);
      expect(result1).toBe(result2);
    });

    it(`Deterministic: (${coins}, ${streak}) call 2 == call 3`, () => {
      const result2 = calculateTierFromStats(coins, streak);
      const result3 = calculateTierFromStats(coins, streak);
      expect(result2).toBe(result3);
    });
  }
});

// ===========================================
// Test: isPickLocked
// ===========================================

describe('isPickLocked', () => {
  it('FREE user can access FREE pick', () => {
    expect(isPickLocked({ tier: PickTier.FREE }, PickTier.FREE)).toBe(false);
  });

  it('FREE user CANNOT access STANDARD pick', () => {
    expect(isPickLocked({ tier: PickTier.STANDARD }, PickTier.FREE)).toBe(true);
  });

  it('FREE user CANNOT access PREMIUM pick', () => {
    expect(isPickLocked({ tier: PickTier.PREMIUM }, PickTier.FREE)).toBe(true);
  });

  it('FREE user CANNOT access ELITE pick', () => {
    expect(isPickLocked({ tier: PickTier.ELITE }, PickTier.FREE)).toBe(true);
  });

  it('STANDARD user can access FREE pick', () => {
    expect(isPickLocked({ tier: PickTier.FREE }, PickTier.STANDARD)).toBe(false);
  });

  it('STANDARD user can access STANDARD pick', () => {
    expect(isPickLocked({ tier: PickTier.STANDARD }, PickTier.STANDARD)).toBe(false);
  });

  it('STANDARD user CANNOT access PREMIUM pick', () => {
    expect(isPickLocked({ tier: PickTier.PREMIUM }, PickTier.STANDARD)).toBe(true);
  });

  it('STANDARD user CANNOT access ELITE pick', () => {
    expect(isPickLocked({ tier: PickTier.ELITE }, PickTier.STANDARD)).toBe(true);
  });

  it('PREMIUM user can access FREE pick', () => {
    expect(isPickLocked({ tier: PickTier.FREE }, PickTier.PREMIUM)).toBe(false);
  });

  it('PREMIUM user can access STANDARD pick', () => {
    expect(isPickLocked({ tier: PickTier.STANDARD }, PickTier.PREMIUM)).toBe(false);
  });

  it('PREMIUM user can access PREMIUM pick', () => {
    expect(isPickLocked({ tier: PickTier.PREMIUM }, PickTier.PREMIUM)).toBe(false);
  });

  it('PREMIUM user CANNOT access ELITE pick', () => {
    expect(isPickLocked({ tier: PickTier.ELITE }, PickTier.PREMIUM)).toBe(true);
  });

  it('ELITE user can access FREE pick', () => {
    expect(isPickLocked({ tier: PickTier.FREE }, PickTier.ELITE)).toBe(false);
  });

  it('ELITE user can access STANDARD pick', () => {
    expect(isPickLocked({ tier: PickTier.STANDARD }, PickTier.ELITE)).toBe(false);
  });

  it('ELITE user can access PREMIUM pick', () => {
    expect(isPickLocked({ tier: PickTier.PREMIUM }, PickTier.ELITE)).toBe(false);
  });

  it('ELITE user can access ELITE pick', () => {
    expect(isPickLocked({ tier: PickTier.ELITE }, PickTier.ELITE)).toBe(false);
  });
});

// ===========================================
// Test: isPickLocked - null/undefined tier
// ===========================================

describe('isPickLocked - null/undefined handling', () => {
  it('null tier defaults to FREE (accessible to FREE user)', () => {
    expect(isPickLocked({ tier: null }, PickTier.FREE)).toBe(false);
  });

  it('undefined tier defaults to FREE', () => {
    expect(isPickLocked({ tier: undefined }, PickTier.FREE)).toBe(false);
  });

  it('missing tier defaults to FREE', () => {
    expect(isPickLocked({}, PickTier.FREE)).toBe(false);
  });

  it('null tier is accessible to ELITE user', () => {
    expect(isPickLocked({ tier: null }, PickTier.ELITE)).toBe(false);
  });
});
