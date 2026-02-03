// =====================================================
// POINTLOCK Calculator Test Suite
// =====================================================

import { describe, it, expect } from 'vitest';
import { PickTier } from '@pick-rivals/shared-types';
import {
  calculateCoinCost,
  calculatePoints,
  validateMinimumSpend,
  clampProbability,
  calculateUnderdogBonus,
  getTierMultiplier,
  getMarketModifier,
  type MarketType,
  type PickForValidation,
} from './pointlock-calculator';

// ===========================================
// Test: clampProbability
// ===========================================

describe('clampProbability', () => {
  it('returns same value for valid probability', () => {
    expect(clampProbability(0.5)).toBe(0.5);
  });

  it('returns PROB_MIN at lower bound', () => {
    expect(clampProbability(0.02)).toBe(0.02);
  });

  it('returns PROB_MAX at upper bound', () => {
    expect(clampProbability(0.98)).toBe(0.98);
  });

  it('clamps values below PROB_MIN', () => {
    expect(clampProbability(0.001)).toBe(0.02);
  });

  it('clamps zero to PROB_MIN', () => {
    expect(clampProbability(0)).toBe(0.02);
  });

  it('clamps one to PROB_MAX', () => {
    expect(clampProbability(1)).toBe(0.98);
  });

  it('clamps values above PROB_MAX', () => {
    expect(clampProbability(0.999)).toBe(0.98);
  });

  it('clamps negative values to PROB_MIN', () => {
    expect(clampProbability(-0.5)).toBe(0.02);
  });

  it('clamps values > 1 to PROB_MAX', () => {
    expect(clampProbability(1.5)).toBe(0.98);
  });
});

// ===========================================
// Test: calculateUnderdogBonus
// ===========================================

describe('calculateUnderdogBonus', () => {
  it('returns 0 for null', () => {
    expect(calculateUnderdogBonus(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(calculateUnderdogBonus(undefined)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(calculateUnderdogBonus(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(calculateUnderdogBonus(Infinity)).toBe(0);
  });

  it('returns 0 for +299', () => {
    expect(calculateUnderdogBonus(299)).toBe(0);
  });

  it('returns 0 for +200', () => {
    expect(calculateUnderdogBonus(200)).toBe(0);
  });

  it('returns 0 for negative odds', () => {
    expect(calculateUnderdogBonus(-110)).toBe(0);
  });

  it('returns 2 for exactly +300', () => {
    expect(calculateUnderdogBonus(300)).toBe(2);
  });

  it('returns 2 for +399', () => {
    expect(calculateUnderdogBonus(399)).toBe(2);
  });

  it('returns 3 for exactly +400', () => {
    expect(calculateUnderdogBonus(400)).toBe(3);
  });

  it('returns 3 for +499', () => {
    expect(calculateUnderdogBonus(499)).toBe(3);
  });

  it('returns 4 for exactly +500', () => {
    expect(calculateUnderdogBonus(500)).toBe(4);
  });

  it('returns 4 for +1000', () => {
    expect(calculateUnderdogBonus(1000)).toBe(4);
  });

  it('returns 4 for +5000', () => {
    expect(calculateUnderdogBonus(5000)).toBe(4);
  });
});

// ===========================================
// Test: getTierMultiplier
// ===========================================

describe('getTierMultiplier', () => {
  it('FREE tier = 1.0x', () => {
    expect(getTierMultiplier(PickTier.FREE)).toBe(1.0);
  });

  it('STANDARD tier = 1.15x', () => {
    expect(getTierMultiplier(PickTier.STANDARD)).toBe(1.15);
  });

  it('PREMIUM tier = 1.3x', () => {
    expect(getTierMultiplier(PickTier.PREMIUM)).toBe(1.3);
  });

  it('ELITE tier = 1.5x', () => {
    expect(getTierMultiplier(PickTier.ELITE)).toBe(1.5);
  });

  it('unknown tier defaults to FREE (1.0x)', () => {
    expect(getTierMultiplier(999 as PickTier)).toBe(1.0);
  });
});

// ===========================================
// Test: getMarketModifier
// ===========================================

describe('getMarketModifier', () => {
  it('moneyline = 1.0x', () => {
    expect(getMarketModifier('moneyline')).toBe(1.0);
  });

  it('spread = 0.85x', () => {
    expect(getMarketModifier('spread')).toBe(0.85);
  });

  it('prop = 0.90x', () => {
    expect(getMarketModifier('prop')).toBe(0.9);
  });

  it('total = 0.90x', () => {
    expect(getMarketModifier('total')).toBe(0.9);
  });

  it('unknown market defaults to moneyline (1.0x)', () => {
    expect(getMarketModifier('unknown' as MarketType)).toBe(1.0);
  });
});

// ===========================================
// Test: calculateCoinCost
// ===========================================

describe('calculateCoinCost - Basic Cases', () => {
  it('p=0.20 FREE is valid', () => {
    const result = calculateCoinCost(0.2, PickTier.FREE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.20 FREE ≈ 32 coins', () => {
    const result = calculateCoinCost(0.2, PickTier.FREE);
    expect(Math.abs(result.coinCost - 32)).toBeLessThanOrEqual(2);
  });

  it('p=0.50 FREE is valid', () => {
    const result = calculateCoinCost(0.5, PickTier.FREE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.50 FREE ≈ 74 coins', () => {
    const result = calculateCoinCost(0.5, PickTier.FREE);
    expect(Math.abs(result.coinCost - 74)).toBeLessThanOrEqual(5);
  });

  it('p=0.80 FREE is valid', () => {
    const result = calculateCoinCost(0.8, PickTier.FREE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.80 FREE ≈ 163 coins', () => {
    const result = calculateCoinCost(0.8, PickTier.FREE);
    expect(Math.abs(result.coinCost - 163)).toBeLessThanOrEqual(10);
  });

  it('p=0.50 ELITE is valid', () => {
    const result = calculateCoinCost(0.5, PickTier.ELITE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.50 ELITE ≈ 111 coins (74 * 1.5)', () => {
    const result = calculateCoinCost(0.5, PickTier.ELITE);
    expect(Math.abs(result.coinCost - 111)).toBeLessThanOrEqual(10);
  });

  it('p=0.80 ELITE is valid', () => {
    const result = calculateCoinCost(0.8, PickTier.ELITE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.80 ELITE ≈ 244 coins (163 * 1.5)', () => {
    const result = calculateCoinCost(0.8, PickTier.ELITE);
    expect(Math.abs(result.coinCost - 244)).toBeLessThanOrEqual(15);
  });
});

describe('calculateCoinCost - Edge Cases', () => {
  it('NaN probability is invalid', () => {
    const result = calculateCoinCost(NaN, PickTier.FREE);
    expect(result.isValid).toBe(false);
  });

  it('NaN has error message', () => {
    const result = calculateCoinCost(NaN, PickTier.FREE);
    expect(result.error).toBeDefined();
  });

  it('Infinity probability is invalid', () => {
    const result = calculateCoinCost(Infinity, PickTier.FREE);
    expect(result.isValid).toBe(false);
  });

  it('negative probability is invalid', () => {
    const result = calculateCoinCost(-0.5, PickTier.FREE);
    expect(result.isValid).toBe(false);
  });

  it('probability > 1 is invalid', () => {
    const result = calculateCoinCost(1.5, PickTier.FREE);
    expect(result.isValid).toBe(false);
  });

  it('p=0.01 is valid (clamped)', () => {
    const result = calculateCoinCost(0.01, PickTier.FREE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.01 clamped to 0.02', () => {
    const result = calculateCoinCost(0.01, PickTier.FREE);
    expect(result.impliedProbability).toBe(0.02);
  });

  it('p=0.99 is valid (clamped)', () => {
    const result = calculateCoinCost(0.99, PickTier.FREE);
    expect(result.isValid).toBe(true);
  });

  it('p=0.99 clamped to 0.98', () => {
    const result = calculateCoinCost(0.99, PickTier.FREE);
    expect(result.impliedProbability).toBe(0.98);
  });
});

describe('calculateCoinCost - Monotonicity', () => {
  const probabilities = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  for (const tier of [PickTier.FREE, PickTier.ELITE]) {
    const tierName = tier === PickTier.FREE ? 'FREE' : 'ELITE';
    const costs = probabilities.map((p) => calculateCoinCost(p, tier).coinCost);

    for (let i = 1; i < costs.length; i++) {
      it(`${tierName}: coinCost[${probabilities[i]}] >= coinCost[${probabilities[i - 1]}]`, () => {
        expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
      });
    }
  }
});

// ===========================================
// Test: calculatePoints
// ===========================================

describe('calculatePoints - Basic Cases', () => {
  it('p=0.20 moneyline is valid', () => {
    const result = calculatePoints(0.2, 400, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('p=0.20 +400 moneyline ≈ 25+3 = 28 pts', () => {
    const result = calculatePoints(0.2, 400, 'moneyline');
    expect(Math.abs(result.points - 28)).toBeLessThanOrEqual(3);
  });

  it('underdog bonus = 3 for +400', () => {
    const result = calculatePoints(0.2, 400, 'moneyline');
    expect(result.underdogBonus).toBe(3);
  });

  it('p=0.50 moneyline is valid', () => {
    const result = calculatePoints(0.5, 100, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('p=0.50 moneyline ≈ 17 pts', () => {
    const result = calculatePoints(0.5, 100, 'moneyline');
    expect(Math.abs(result.points - 17)).toBeLessThanOrEqual(2);
  });

  it('p=0.80 moneyline is valid', () => {
    const result = calculatePoints(0.8, -400, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('p=0.80 moneyline ≈ 10 pts', () => {
    const result = calculatePoints(0.8, -400, 'moneyline');
    expect(Math.abs(result.points - 10)).toBeLessThanOrEqual(2);
  });

  it('p=0.50 spread is valid', () => {
    const result = calculatePoints(0.5, -110, 'spread');
    expect(result.isValid).toBe(true);
  });

  it('p=0.50 spread ≈ 17 * 0.85 = 14 pts', () => {
    const result = calculatePoints(0.5, -110, 'spread');
    expect(Math.abs(result.points - 14)).toBeLessThanOrEqual(2);
  });

  it('p=0.50 prop is valid', () => {
    const result = calculatePoints(0.5, -110, 'prop');
    expect(result.isValid).toBe(true);
  });

  it('p=0.50 prop ≈ 17 * 0.90 = 15 pts', () => {
    const result = calculatePoints(0.5, -110, 'prop');
    expect(Math.abs(result.points - 15)).toBeLessThanOrEqual(2);
  });
});

describe('calculatePoints - Null American Odds', () => {
  it('null americanOdds is valid', () => {
    const result = calculatePoints(0.5, null, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('null americanOdds = no underdog bonus', () => {
    const result = calculatePoints(0.5, null, 'moneyline');
    expect(result.underdogBonus).toBe(0);
  });

  it('undefined americanOdds is valid', () => {
    const result = calculatePoints(0.5, undefined, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('undefined americanOdds = no underdog bonus', () => {
    const result = calculatePoints(0.5, undefined, 'moneyline');
    expect(result.underdogBonus).toBe(0);
  });
});

describe('calculatePoints - Edge Cases', () => {
  it('NaN probability is invalid', () => {
    const result = calculatePoints(NaN, 100, 'moneyline');
    expect(result.isValid).toBe(false);
  });

  it('NaN has error message', () => {
    const result = calculatePoints(NaN, 100, 'moneyline');
    expect(result.error).toBeDefined();
  });

  it('p=0.01 is valid (clamped)', () => {
    const result = calculatePoints(0.01, 500, 'moneyline');
    expect(result.isValid).toBe(true);
  });

  it('p=0.01 clamped to 0.02', () => {
    const result = calculatePoints(0.01, 500, 'moneyline');
    expect(result.impliedProbability).toBe(0.02);
  });

  it('points capped at MAX_POINTS (40)', () => {
    const result = calculatePoints(0.02, 5000, 'moneyline');
    expect(result.points).toBeLessThanOrEqual(40);
  });
});

describe('calculatePoints - Monotonicity', () => {
  const probabilities = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  for (const marketType of ['moneyline', 'spread'] as MarketType[]) {
    const points = probabilities.map((p) => calculatePoints(p, null, marketType).points);

    for (let i = 1; i < points.length; i++) {
      it(`${marketType}: points[${probabilities[i]}] <= points[${probabilities[i - 1]}]`, () => {
        expect(points[i]).toBeLessThanOrEqual(points[i - 1]);
      });
    }
  }
});

// ===========================================
// Test: validateMinimumSpend
// ===========================================

describe('validateMinimumSpend - Basic Cases', () => {
  it('1 pick = no minimum required', () => {
    const result = validateMinimumSpend([{ coinCost: 25, tier: PickTier.FREE }]);
    expect(result.ok).toBe(true);
  });

  it('1 pick minCoinSpend = 0', () => {
    const result = validateMinimumSpend([{ coinCost: 25, tier: PickTier.FREE }]);
    expect(result.minCoinSpend).toBe(0);
  });

  it('2 picks at 80 coins = ok', () => {
    const result = validateMinimumSpend([
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
    ]);
    expect(result.ok).toBe(true);
  });

  it('2 picks minCoinSpend = 80', () => {
    const result = validateMinimumSpend([
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
    ]);
    expect(result.minCoinSpend).toBe(80);
  });

  it('2 picks at 60 coins = not ok', () => {
    const result = validateMinimumSpend([
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
    ]);
    expect(result.ok).toBe(false);
  });

  it('shortfall = 20 coins', () => {
    const result = validateMinimumSpend([
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
    ]);
    expect(result.shortfall).toBe(20);
  });

  it('has reason message', () => {
    const result = validateMinimumSpend([
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
    ]);
    expect(result.reason).toBeDefined();
  });

  it('4 picks at 160 coins = ok', () => {
    const result = validateMinimumSpend([
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
    ]);
    expect(result.ok).toBe(true);
  });

  it('4 picks minCoinSpend = 140', () => {
    const result = validateMinimumSpend([
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
      { coinCost: 40, tier: PickTier.FREE },
    ]);
    expect(result.minCoinSpend).toBe(140);
  });

  it('4 picks at 120 coins = not ok', () => {
    const result = validateMinimumSpend([
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
    ]);
    expect(result.ok).toBe(false);
  });

  it('4 picks shortfall = 20 coins', () => {
    const result = validateMinimumSpend([
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
      { coinCost: 30, tier: PickTier.FREE },
    ]);
    expect(result.shortfall).toBe(20);
  });
});

describe('validateMinimumSpend - All Thresholds', () => {
  const thresholds: Record<number, number> = {
    2: 80,
    3: 110,
    4: 140,
    5: 170,
    6: 200,
    7: 230,
    8: 260,
  };

  for (const [count, minSpend] of Object.entries(thresholds)) {
    it(`${count} picks minCoinSpend = ${minSpend}`, () => {
      const pickCount = parseInt(count);
      const picks: PickForValidation[] = Array(pickCount).fill({
        coinCost: Math.ceil(minSpend / pickCount) + 1,
        tier: PickTier.FREE,
      });
      const result = validateMinimumSpend(picks);
      expect(result.minCoinSpend).toBe(minSpend);
    });
  }
});

describe('validateMinimumSpend - 9+ Picks Uses 8-Pick Threshold', () => {
  it('9 picks uses 8-pick threshold (260)', () => {
    const picks9: PickForValidation[] = Array(9).fill({ coinCost: 30, tier: PickTier.FREE });
    const result9 = validateMinimumSpend(picks9);
    expect(result9.minCoinSpend).toBe(260);
  });

  it('9 picks pickCount = 9', () => {
    const picks9: PickForValidation[] = Array(9).fill({ coinCost: 30, tier: PickTier.FREE });
    const result9 = validateMinimumSpend(picks9);
    expect(result9.pickCount).toBe(9);
  });

  it('10 picks uses 8-pick threshold (260)', () => {
    const picks10: PickForValidation[] = Array(10).fill({ coinCost: 30, tier: PickTier.FREE });
    const result10 = validateMinimumSpend(picks10);
    expect(result10.minCoinSpend).toBe(260);
  });
});

describe('validateMinimumSpend - Empty Array', () => {
  it('empty array = ok (no picks = no minimum)', () => {
    const result = validateMinimumSpend([]);
    expect(result.ok).toBe(true);
  });

  it('empty array totalCoinCost = 0', () => {
    const result = validateMinimumSpend([]);
    expect(result.totalCoinCost).toBe(0);
  });

  it('empty array pickCount = 0', () => {
    const result = validateMinimumSpend([]);
    expect(result.pickCount).toBe(0);
  });
});

// ===========================================
// Test: Behavior Table Verification
// ===========================================

describe('Behavior Table - Coin Costs (actual formula values)', () => {
  const expectedCosts: Record<number, Record<string, number>> = {
    0.1: { FREE: 26, ELITE: 40 },
    0.2: { FREE: 32, ELITE: 47 },
    0.35: { FREE: 47, ELITE: 71 },
    0.5: { FREE: 74, ELITE: 111 },
    0.65: { FREE: 112, ELITE: 168 },
    0.8: { FREE: 163, ELITE: 244 },
    0.9: { FREE: 203, ELITE: 305 },
  };

  for (const [probStr, expected] of Object.entries(expectedCosts)) {
    const prob = parseFloat(probStr);

    it(`p=${prob} FREE coinCost ≈ ${expected.FREE}`, () => {
      const freeCost = calculateCoinCost(prob, PickTier.FREE).coinCost;
      expect(Math.abs(freeCost - expected.FREE)).toBeLessThanOrEqual(5);
    });

    it(`p=${prob} ELITE coinCost ≈ ${expected.ELITE}`, () => {
      const eliteCost = calculateCoinCost(prob, PickTier.ELITE).coinCost;
      expect(Math.abs(eliteCost - expected.ELITE)).toBeLessThanOrEqual(8);
    });
  }
});

describe('Behavior Table - Points (from plan)', () => {
  const expectedPoints: Record<number, Record<string, number>> = {
    0.35: { moneyline: 21, spread: 18 },
    0.5: { moneyline: 17, spread: 14 },
    0.65: { moneyline: 13, spread: 11 },
    0.8: { moneyline: 10, spread: 9 },
    0.9: { moneyline: 8, spread: 7 },
  };

  for (const [probStr, expected] of Object.entries(expectedPoints)) {
    const prob = parseFloat(probStr);

    it(`p=${prob} moneyline points ≈ ${expected.moneyline}`, () => {
      const mlPoints = calculatePoints(prob, null, 'moneyline').points;
      expect(Math.abs(mlPoints - expected.moneyline)).toBeLessThanOrEqual(2);
    });

    it(`p=${prob} spread points ≈ ${expected.spread}`, () => {
      const spreadPoints = calculatePoints(prob, null, 'spread').points;
      expect(Math.abs(spreadPoints - expected.spread)).toBeLessThanOrEqual(2);
    });
  }
});
