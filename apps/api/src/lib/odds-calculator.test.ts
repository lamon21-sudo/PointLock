// =====================================================
// Odds Calculator Tests
// =====================================================
// These tests verify the odds conversion and point calculation
// logic, including edge cases and security constraints.

import { describe, it, expect } from 'vitest';
import {
  isValidAmericanOdds,
  americanToDecimalOdds,
  americanToImpliedProbability,
  convertAmericanOdds,
  calculateDifficultyMultiplier,
  calculatePickPointValue,
  calculateParlayBonus,
  calculateSlipPointPotential,
  calculateCombinedProbability,
  BASE_POINTS,
  MAX_POINTS_PER_PICK,
  MIN_POINTS_PER_PICK,
  MAX_POINTS_PER_SLIP,
} from './odds-calculator';

// ===========================================
// Test: Odds Validation
// ===========================================

describe('Odds Validation', () => {
  it('Standard favorite (-110) is valid', () => {
    expect(isValidAmericanOdds(-110)).toBe(true);
  });

  it('Even money (+100) is valid', () => {
    expect(isValidAmericanOdds(+100)).toBe(true);
  });

  it('Underdog (+200) is valid', () => {
    expect(isValidAmericanOdds(+200)).toBe(true);
  });

  it('Heavy favorite (-1000) is valid', () => {
    expect(isValidAmericanOdds(-1000)).toBe(true);
  });

  it('Longshot (+5000) is valid', () => {
    expect(isValidAmericanOdds(+5000)).toBe(true);
  });

  it('Minimum favorite (-100) is valid', () => {
    expect(isValidAmericanOdds(-100)).toBe(true);
  });

  it('Zero odds are invalid', () => {
    expect(isValidAmericanOdds(0)).toBe(false);
  });

  it('Odds between -100 and +100 are invalid (+50)', () => {
    expect(isValidAmericanOdds(50)).toBe(false);
  });

  it('Odds between -100 and +100 are invalid (-50)', () => {
    expect(isValidAmericanOdds(-50)).toBe(false);
  });

  it('Odds at +99 are invalid', () => {
    expect(isValidAmericanOdds(99)).toBe(false);
  });

  it('Odds at -99 are invalid', () => {
    expect(isValidAmericanOdds(-99)).toBe(false);
  });

  it('NaN odds are invalid', () => {
    expect(isValidAmericanOdds(NaN)).toBe(false);
  });

  it('Infinity odds are invalid', () => {
    expect(isValidAmericanOdds(Infinity)).toBe(false);
  });

  it('-Infinity odds are invalid', () => {
    expect(isValidAmericanOdds(-Infinity)).toBe(false);
  });
});

// ===========================================
// Test: American to Decimal Odds Conversion
// ===========================================

describe('American to Decimal Odds Conversion', () => {
  it('-110 → 1.909 decimal', () => {
    expect(americanToDecimalOdds(-110)).toBeCloseTo(1.909, 2);
  });

  it('+100 → 2.000 decimal', () => {
    expect(americanToDecimalOdds(+100)).toBeCloseTo(2.0, 2);
  });

  it('+200 → 3.000 decimal', () => {
    expect(americanToDecimalOdds(+200)).toBeCloseTo(3.0, 2);
  });

  it('-200 → 1.500 decimal', () => {
    expect(americanToDecimalOdds(-200)).toBeCloseTo(1.5, 2);
  });

  it('+150 → 2.500 decimal', () => {
    expect(americanToDecimalOdds(+150)).toBeCloseTo(2.5, 2);
  });

  it('-150 → 1.667 decimal', () => {
    expect(americanToDecimalOdds(-150)).toBeCloseTo(1.667, 2);
  });

  it('-1000 → 1.100 decimal', () => {
    expect(americanToDecimalOdds(-1000)).toBeCloseTo(1.1, 2);
  });

  it('+1000 → 11.000 decimal', () => {
    expect(americanToDecimalOdds(+1000)).toBeCloseTo(11.0, 2);
  });

  it('+5000 → 51.000 decimal', () => {
    expect(americanToDecimalOdds(+5000)).toBeCloseTo(51.0, 2);
  });

  it('Invalid odds (0) → 2.0 default', () => {
    expect(americanToDecimalOdds(0)).toBeCloseTo(2.0, 2);
  });

  it('Invalid odds (+50) → 2.0 default', () => {
    expect(americanToDecimalOdds(50)).toBeCloseTo(2.0, 2);
  });
});

// ===========================================
// Test: American to Implied Probability
// ===========================================

describe('American to Implied Probability', () => {
  it('-110 → 52.38% probability', () => {
    expect(americanToImpliedProbability(-110)).toBeCloseTo(0.5238, 2);
  });

  it('+100 → 50.00% probability', () => {
    expect(americanToImpliedProbability(+100)).toBeCloseTo(0.5, 2);
  });

  it('+200 → 33.33% probability', () => {
    expect(americanToImpliedProbability(+200)).toBeCloseTo(0.3333, 2);
  });

  it('-200 → 66.67% probability', () => {
    expect(americanToImpliedProbability(-200)).toBeCloseTo(0.6667, 2);
  });

  it('-150 → 60.00% probability', () => {
    expect(americanToImpliedProbability(-150)).toBeCloseTo(0.6, 2);
  });

  it('+150 → 40.00% probability', () => {
    expect(americanToImpliedProbability(+150)).toBeCloseTo(0.4, 2);
  });

  it('-1000 → 90.91% probability', () => {
    expect(americanToImpliedProbability(-1000)).toBeCloseTo(0.9091, 2);
  });

  it('+1000 → 9.09% probability', () => {
    expect(americanToImpliedProbability(+1000)).toBeCloseTo(0.0909, 2);
  });

  it('+5000 → 1.96% probability', () => {
    expect(americanToImpliedProbability(+5000)).toBeCloseTo(0.0196, 2);
  });
});

// ===========================================
// Test: Full Odds Conversion
// ===========================================

describe('Full Odds Conversion', () => {
  it('Valid odds conversion returns isValid=true', () => {
    const result = convertAmericanOdds(-110);
    expect(result.isValid).toBe(true);
  });

  it('Valid odds conversion has no error', () => {
    const result = convertAmericanOdds(-110);
    expect(result.error).toBeUndefined();
  });

  it('Invalid odds conversion returns isValid=false', () => {
    const result = convertAmericanOdds(50);
    expect(result.isValid).toBe(false);
  });

  it('Invalid odds conversion includes error message', () => {
    const result = convertAmericanOdds(50);
    expect(result.error).toBeDefined();
  });
});

// ===========================================
// Test: Difficulty Multiplier
// ===========================================

describe('Difficulty Multiplier', () => {
  it('52.38% (standard) → ~1.0x multiplier', () => {
    const multiplier = calculateDifficultyMultiplier(0.5238);
    expect(Math.abs(multiplier - 1.0)).toBeLessThanOrEqual(0.1);
  });

  it('10% probability gives higher multiplier (> 1.5x)', () => {
    const longshot = calculateDifficultyMultiplier(0.1);
    expect(longshot).toBeGreaterThan(1.5);
  });

  it('90% probability gives lower multiplier (< 0.7x)', () => {
    const favorite = calculateDifficultyMultiplier(0.9);
    expect(favorite).toBeLessThan(0.7);
  });

  it('1% probability is capped (< 10x)', () => {
    const extreme = calculateDifficultyMultiplier(0.01);
    expect(extreme).toBeLessThan(10);
  });
});

// ===========================================
// Test: Pick Point Value Calculation
// ===========================================

describe('Pick Point Value Calculation', () => {
  it('-110 calculation is valid', () => {
    const result = calculatePickPointValue(-110);
    expect(result.isValid).toBe(true);
  });

  it(`-110 → ~${BASE_POINTS} points (base)`, () => {
    const result = calculatePickPointValue(-110);
    expect(Math.abs(result.pointValue - BASE_POINTS)).toBeLessThanOrEqual(2);
  });

  it('+100 → close to base points', () => {
    const result = calculatePickPointValue(100);
    expect(Math.abs(result.pointValue - BASE_POINTS)).toBeLessThanOrEqual(3);
  });

  it('-500 gives fewer points', () => {
    const result = calculatePickPointValue(-500);
    expect(result.pointValue).toBeLessThan(BASE_POINTS);
  });

  it('-500 respects minimum', () => {
    const result = calculatePickPointValue(-500);
    expect(result.pointValue).toBeGreaterThanOrEqual(MIN_POINTS_PER_PICK);
  });

  it('+500 gives more points', () => {
    const result = calculatePickPointValue(500);
    expect(result.pointValue).toBeGreaterThan(BASE_POINTS);
  });

  it('+5000 is capped', () => {
    const result = calculatePickPointValue(5000);
    expect(result.pointValue).toBeLessThanOrEqual(MAX_POINTS_PER_PICK);
  });

  it('+5000 still gives significant points (> 30)', () => {
    const result = calculatePickPointValue(5000);
    expect(result.pointValue).toBeGreaterThan(30);
  });

  it('Invalid odds returns isValid=false', () => {
    const result = calculatePickPointValue(0);
    expect(result.isValid).toBe(false);
  });

  it('Invalid odds defaults to base points', () => {
    const result = calculatePickPointValue(0);
    expect(result.pointValue).toBe(BASE_POINTS);
  });
});

// ===========================================
// Test: Point Value Ordering
// ===========================================

describe('Point Value Ordering (Harder = More Points)', () => {
  const odds = [-1000, -500, -200, -110, 100, 150, 300, 500, 1000, 5000];
  const points = odds.map((o) => calculatePickPointValue(o).pointValue);

  // After standard odds, trend should be upward
  for (let i = 4; i < points.length - 1; i++) {
    it(`Points increase: ${odds[i + 1]} (${points[i + 1]}) >= ${odds[i]} (${points[i]})`, () => {
      expect(points[i + 1]).toBeGreaterThanOrEqual(points[i] - 1);
    });
  }
});

// ===========================================
// Test: Parlay Bonus
// ===========================================

describe('Parlay Bonus', () => {
  it('Single pick: no bonus (1.0x)', () => {
    expect(calculateParlayBonus(1)).toBeCloseTo(1.0, 2);
  });

  it('2-pick parlay gets bonus', () => {
    expect(calculateParlayBonus(2)).toBeGreaterThan(1.0);
  });

  it('3-pick > 2-pick bonus', () => {
    expect(calculateParlayBonus(3)).toBeGreaterThan(calculateParlayBonus(2));
  });

  it('10-pick > 5-pick bonus', () => {
    expect(calculateParlayBonus(10)).toBeGreaterThan(calculateParlayBonus(5));
  });

  it('Parlay bonus capped at 1.5x', () => {
    expect(calculateParlayBonus(20)).toBeLessThanOrEqual(1.5);
  });
});

// ===========================================
// Test: Combined Probability
// ===========================================

describe('Combined Probability', () => {
  it('50% × 50% = 25%', () => {
    expect(calculateCombinedProbability([0.5, 0.5])).toBeCloseTo(0.25, 2);
  });

  it('50% × 50% × 50% = 12.5%', () => {
    expect(calculateCombinedProbability([0.5, 0.5, 0.5])).toBeCloseTo(0.125, 2);
  });

  it('90% × 90% = 81%', () => {
    expect(calculateCombinedProbability([0.9, 0.9])).toBeCloseTo(0.81, 2);
  });

  it('Empty array = 0', () => {
    expect(calculateCombinedProbability([])).toBeCloseTo(0, 2);
  });
});

// ===========================================
// Test: Slip Point Potential
// ===========================================

describe('Slip Point Potential', () => {
  it('Single pick slip is valid', () => {
    const result = calculateSlipPointPotential([-110]);
    expect(result.isValid).toBe(true);
  });

  it('Single pick has one point value', () => {
    const result = calculateSlipPointPotential([-110]);
    expect(result.pickPointValues.length).toBe(1);
  });

  it('Single pick has no parlay bonus', () => {
    const result = calculateSlipPointPotential([-110]);
    expect(result.parlayBonus).toBeCloseTo(1.0, 2);
  });

  it('Multi-pick slip is valid', () => {
    const result = calculateSlipPointPotential([-110, +200, +150]);
    expect(result.isValid).toBe(true);
  });

  it('Multi-pick has three point values', () => {
    const result = calculateSlipPointPotential([-110, +200, +150]);
    expect(result.pickPointValues.length).toBe(3);
  });

  it('Multi-pick has parlay bonus', () => {
    const result = calculateSlipPointPotential([-110, +200, +150]);
    expect(result.parlayBonus).toBeGreaterThan(1.0);
  });

  it('Multi-pick has positive point potential', () => {
    const result = calculateSlipPointPotential([-110, +200, +150]);
    expect(result.totalPointPotential).toBeGreaterThan(0);
  });

  it(`Large slip capped at ${MAX_POINTS_PER_SLIP}`, () => {
    const result = calculateSlipPointPotential(Array(20).fill(1000));
    expect(result.totalPointPotential).toBeLessThanOrEqual(MAX_POINTS_PER_SLIP);
  });
});

// ===========================================
// Test: Security Edge Cases
// ===========================================

describe('Security Edge Cases', () => {
  it('Extreme positive odds capped', () => {
    const result = calculatePickPointValue(99999);
    expect(result.pointValue).toBeLessThanOrEqual(MAX_POINTS_PER_PICK);
  });

  it('Extreme positive odds is finite', () => {
    const result = calculatePickPointValue(99999);
    expect(Number.isFinite(result.pointValue)).toBe(true);
  });

  it('Extreme negative odds has minimum', () => {
    const result = calculatePickPointValue(-99999);
    expect(result.pointValue).toBeGreaterThanOrEqual(MIN_POINTS_PER_PICK);
  });

  it('Extreme negative odds is finite', () => {
    const result = calculatePickPointValue(-99999);
    expect(Number.isFinite(result.pointValue)).toBe(true);
  });

  it('NaN is handled gracefully', () => {
    const result = calculatePickPointValue(NaN);
    expect(result.isValid).toBe(false);
  });

  it('Infinity is handled gracefully', () => {
    const result = calculatePickPointValue(Infinity);
    expect(result.isValid).toBe(false);
  });

  it('Mixed slip reports errors', () => {
    const result = calculateSlipPointPotential([-110, 0, +200]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('Mixed slip still calculates all picks', () => {
    const result = calculateSlipPointPotential([-110, 0, +200]);
    expect(result.pickPointValues.length).toBe(3);
  });
});
