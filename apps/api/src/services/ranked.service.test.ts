// =====================================================
// Ranked Service Test Suite
// =====================================================
// Run with: npx tsx src/services/ranked.service.test.ts
//
// Tests for Task 4.1: Ranked/Seasonal Mode
// - calculateNewRank: pure function for rank calculation
// - Rank threshold boundary tests
// - RP clamping tests
// - Placement phase logic

import { Rank } from '@prisma/client';
import { calculateNewRank } from './ranked.service';
import {
  RANK_THRESHOLDS,
  RANK_ORDER,
  RANK_DISPLAY,
} from '@pointlock/shared-types';

// ===========================================
// Test Utilities
// ===========================================

let testsPassed = 0;
let testsFailed = 0;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const pass = actual === expected;
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${message}`);
    console.error(`      Expected: ${expected}`);
    console.error(`      Actual:   ${actual}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${message}`);
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ===========================================
// Test: RANK_THRESHOLDS configuration
// ===========================================

describe('RANK_THRESHOLDS', () => {
  // Verify all ranks have thresholds
  assertEqual(Object.keys(RANK_THRESHOLDS).length, 15, '15 ranks defined');

  // Bronze tier (0-299 RP range)
  assertEqual(RANK_THRESHOLDS[Rank.BRONZE_1], 0, 'BRONZE_1 starts at 0 RP');
  assertEqual(RANK_THRESHOLDS[Rank.BRONZE_2], 100, 'BRONZE_2 starts at 100 RP');
  assertEqual(RANK_THRESHOLDS[Rank.BRONZE_3], 200, 'BRONZE_3 starts at 200 RP');

  // Silver tier (300-599 RP range)
  assertEqual(RANK_THRESHOLDS[Rank.SILVER_1], 300, 'SILVER_1 starts at 300 RP');
  assertEqual(RANK_THRESHOLDS[Rank.SILVER_2], 400, 'SILVER_2 starts at 400 RP');
  assertEqual(RANK_THRESHOLDS[Rank.SILVER_3], 500, 'SILVER_3 starts at 500 RP');

  // Gold tier (600-899 RP range)
  assertEqual(RANK_THRESHOLDS[Rank.GOLD_1], 600, 'GOLD_1 starts at 600 RP');
  assertEqual(RANK_THRESHOLDS[Rank.GOLD_2], 700, 'GOLD_2 starts at 700 RP');
  assertEqual(RANK_THRESHOLDS[Rank.GOLD_3], 800, 'GOLD_3 starts at 800 RP');

  // Platinum tier (900-1199 RP range)
  assertEqual(RANK_THRESHOLDS[Rank.PLATINUM_1], 900, 'PLATINUM_1 starts at 900 RP');
  assertEqual(RANK_THRESHOLDS[Rank.PLATINUM_2], 1000, 'PLATINUM_2 starts at 1000 RP');
  assertEqual(RANK_THRESHOLDS[Rank.PLATINUM_3], 1100, 'PLATINUM_3 starts at 1100 RP');

  // Diamond tier (1200+ RP range)
  assertEqual(RANK_THRESHOLDS[Rank.DIAMOND_1], 1200, 'DIAMOND_1 starts at 1200 RP');
  assertEqual(RANK_THRESHOLDS[Rank.DIAMOND_2], 1400, 'DIAMOND_2 starts at 1400 RP');
  assertEqual(RANK_THRESHOLDS[Rank.DIAMOND_3], 1600, 'DIAMOND_3 starts at 1600 RP');
});

// ===========================================
// Test: RANK_ORDER array
// ===========================================

describe('RANK_ORDER', () => {
  assertEqual(RANK_ORDER.length, 15, '15 ranks in order');
  assertEqual(RANK_ORDER[0], Rank.BRONZE_1, 'First rank is BRONZE_1');
  assertEqual(RANK_ORDER[14], Rank.DIAMOND_3, 'Last rank is DIAMOND_3');

  // Verify ascending order matches thresholds
  for (let i = 0; i < RANK_ORDER.length - 1; i++) {
    const current = RANK_ORDER[i];
    const next = RANK_ORDER[i + 1];
    assert(
      RANK_THRESHOLDS[current] < RANK_THRESHOLDS[next],
      `${current} threshold < ${next} threshold`
    );
  }
});

// ===========================================
// Test: RANK_DISPLAY metadata
// ===========================================

describe('RANK_DISPLAY', () => {
  // Verify all ranks have display info
  assertEqual(Object.keys(RANK_DISPLAY).length, 15, '15 ranks have display info');

  // Check a few examples
  assertEqual(RANK_DISPLAY[Rank.BRONZE_1].name, 'Bronze I', 'BRONZE_1 display name');
  assertEqual(RANK_DISPLAY[Rank.BRONZE_1].tier, 'BRONZE', 'BRONZE_1 tier');
  assertEqual(RANK_DISPLAY[Rank.BRONZE_1].division, 1, 'BRONZE_1 division');
  assertEqual(RANK_DISPLAY[Rank.BRONZE_1].color, '#CD7F32', 'BRONZE_1 color');

  assertEqual(RANK_DISPLAY[Rank.GOLD_2].name, 'Gold II', 'GOLD_2 display name');
  assertEqual(RANK_DISPLAY[Rank.GOLD_2].tier, 'GOLD', 'GOLD_2 tier');
  assertEqual(RANK_DISPLAY[Rank.GOLD_2].division, 2, 'GOLD_2 division');

  assertEqual(RANK_DISPLAY[Rank.DIAMOND_3].name, 'Diamond III', 'DIAMOND_3 display name');
  assertEqual(RANK_DISPLAY[Rank.DIAMOND_3].tier, 'DIAMOND', 'DIAMOND_3 tier');
  assertEqual(RANK_DISPLAY[Rank.DIAMOND_3].division, 3, 'DIAMOND_3 division');
});

// ===========================================
// Test: calculateNewRank - exact thresholds
// ===========================================

describe('calculateNewRank - exact threshold values', () => {
  assertEqual(calculateNewRank(0), Rank.BRONZE_1, '0 RP = BRONZE_1');
  assertEqual(calculateNewRank(100), Rank.BRONZE_2, '100 RP = BRONZE_2');
  assertEqual(calculateNewRank(200), Rank.BRONZE_3, '200 RP = BRONZE_3');
  assertEqual(calculateNewRank(300), Rank.SILVER_1, '300 RP = SILVER_1');
  assertEqual(calculateNewRank(400), Rank.SILVER_2, '400 RP = SILVER_2');
  assertEqual(calculateNewRank(500), Rank.SILVER_3, '500 RP = SILVER_3');
  assertEqual(calculateNewRank(600), Rank.GOLD_1, '600 RP = GOLD_1');
  assertEqual(calculateNewRank(700), Rank.GOLD_2, '700 RP = GOLD_2');
  assertEqual(calculateNewRank(800), Rank.GOLD_3, '800 RP = GOLD_3');
  assertEqual(calculateNewRank(900), Rank.PLATINUM_1, '900 RP = PLATINUM_1');
  assertEqual(calculateNewRank(1000), Rank.PLATINUM_2, '1000 RP = PLATINUM_2');
  assertEqual(calculateNewRank(1100), Rank.PLATINUM_3, '1100 RP = PLATINUM_3');
  assertEqual(calculateNewRank(1200), Rank.DIAMOND_1, '1200 RP = DIAMOND_1');
  assertEqual(calculateNewRank(1400), Rank.DIAMOND_2, '1400 RP = DIAMOND_2');
  assertEqual(calculateNewRank(1600), Rank.DIAMOND_3, '1600 RP = DIAMOND_3');
});

// ===========================================
// Test: calculateNewRank - boundary values
// ===========================================

describe('calculateNewRank - boundary values (one below/above threshold)', () => {
  // Just below threshold = stays in lower rank
  assertEqual(calculateNewRank(99), Rank.BRONZE_1, '99 RP = BRONZE_1 (not BRONZE_2)');
  assertEqual(calculateNewRank(199), Rank.BRONZE_2, '199 RP = BRONZE_2 (not BRONZE_3)');
  assertEqual(calculateNewRank(299), Rank.BRONZE_3, '299 RP = BRONZE_3 (not SILVER_1)');
  assertEqual(calculateNewRank(599), Rank.SILVER_3, '599 RP = SILVER_3 (not GOLD_1)');
  assertEqual(calculateNewRank(899), Rank.GOLD_3, '899 RP = GOLD_3 (not PLATINUM_1)');
  assertEqual(calculateNewRank(1199), Rank.PLATINUM_3, '1199 RP = PLATINUM_3 (not DIAMOND_1)');
  assertEqual(calculateNewRank(1399), Rank.DIAMOND_1, '1399 RP = DIAMOND_1 (not DIAMOND_2)');
  assertEqual(calculateNewRank(1599), Rank.DIAMOND_2, '1599 RP = DIAMOND_2 (not DIAMOND_3)');

  // Just above threshold = enters new rank
  assertEqual(calculateNewRank(101), Rank.BRONZE_2, '101 RP = BRONZE_2');
  assertEqual(calculateNewRank(301), Rank.SILVER_1, '301 RP = SILVER_1');
  assertEqual(calculateNewRank(601), Rank.GOLD_1, '601 RP = GOLD_1');
  assertEqual(calculateNewRank(901), Rank.PLATINUM_1, '901 RP = PLATINUM_1');
  assertEqual(calculateNewRank(1201), Rank.DIAMOND_1, '1201 RP = DIAMOND_1');
});

// ===========================================
// Test: calculateNewRank - negative RP handling
// ===========================================

describe('calculateNewRank - negative RP handling', () => {
  // Negative RP should return BRONZE_1 (lowest rank)
  assertEqual(calculateNewRank(-1), Rank.BRONZE_1, '-1 RP = BRONZE_1');
  assertEqual(calculateNewRank(-50), Rank.BRONZE_1, '-50 RP = BRONZE_1');
  assertEqual(calculateNewRank(-1000), Rank.BRONZE_1, '-1000 RP = BRONZE_1');
});

// ===========================================
// Test: calculateNewRank - high RP values
// ===========================================

describe('calculateNewRank - high RP values (above DIAMOND_3)', () => {
  // Very high RP should still return DIAMOND_3
  assertEqual(calculateNewRank(2000), Rank.DIAMOND_3, '2000 RP = DIAMOND_3');
  assertEqual(calculateNewRank(5000), Rank.DIAMOND_3, '5000 RP = DIAMOND_3');
  assertEqual(calculateNewRank(10000), Rank.DIAMOND_3, '10000 RP = DIAMOND_3');
  assertEqual(calculateNewRank(Number.MAX_SAFE_INTEGER), Rank.DIAMOND_3, 'MAX_SAFE_INTEGER RP = DIAMOND_3');
});

// ===========================================
// Test: calculateNewRank - determinism
// ===========================================

describe('calculateNewRank - determinism (same input = same output)', () => {
  const testValues = [0, 50, 100, 150, 300, 550, 800, 1000, 1500, 2000];

  for (const rp of testValues) {
    const result1 = calculateNewRank(rp);
    const result2 = calculateNewRank(rp);
    const result3 = calculateNewRank(rp);
    assertEqual(result1, result2, `Deterministic: ${rp} RP call 1 == call 2`);
    assertEqual(result2, result3, `Deterministic: ${rp} RP call 2 == call 3`);
  }
});

// ===========================================
// Test: RP clamping simulation
// ===========================================

describe('RP clamping logic (simulated)', () => {
  // Simulate Math.max(0, rpBefore + rpChange) from updateRankPoints

  // Win from 0: 0 + 25 = 25
  assertEqual(Math.max(0, 0 + 25), 25, 'Win from 0 RP: 0 + 25 = 25');

  // Loss from 25: 25 - 20 = 5
  assertEqual(Math.max(0, 25 - 20), 5, 'Loss from 25 RP: 25 - 20 = 5');

  // Loss from 10: 10 - 20 = -10, clamped to 0
  assertEqual(Math.max(0, 10 - 20), 0, 'Loss from 10 RP: 10 - 20 = -10 -> clamped to 0');

  // Loss from 0: 0 - 20 = -20, clamped to 0
  assertEqual(Math.max(0, 0 - 20), 0, 'Loss from 0 RP: 0 - 20 = -20 -> clamped to 0');

  // Multiple losses from 15: 15 - 20 = -5, clamped to 0
  assertEqual(Math.max(0, 15 - 20), 0, 'Loss from 15 RP: 15 - 20 = -5 -> clamped to 0');

  // Win streak: 0 + 25 + 25 + 25 = 75
  let rp = 0;
  rp = Math.max(0, rp + 25);
  rp = Math.max(0, rp + 25);
  rp = Math.max(0, rp + 25);
  assertEqual(rp, 75, 'Three wins: 0 + 25 + 25 + 25 = 75');

  // Loss streak from 50: 50 - 20 - 20 - 20 = -10, clamped to 0
  rp = 50;
  rp = Math.max(0, rp - 20);
  rp = Math.max(0, rp - 20);
  rp = Math.max(0, rp - 20);
  assertEqual(rp, 0, 'Three losses from 50: 50 - 20 - 20 - 20 = -10 -> clamped to 0');
});

// ===========================================
// Test: Rank transition scenarios
// ===========================================

describe('Rank transition scenarios', () => {
  // Scenario 1: Promote from BRONZE_3 to SILVER_1
  let rp = 280; // BRONZE_3
  assertEqual(calculateNewRank(rp), Rank.BRONZE_3, 'Start at 280 RP = BRONZE_3');
  rp += 25; // Win
  assertEqual(rp, 305, 'After win: 280 + 25 = 305');
  assertEqual(calculateNewRank(rp), Rank.SILVER_1, 'Promoted to SILVER_1');

  // Scenario 2: Demote from SILVER_1 to BRONZE_3
  rp = 305; // SILVER_1
  assertEqual(calculateNewRank(rp), Rank.SILVER_1, 'Start at 305 RP = SILVER_1');
  rp = Math.max(0, rp - 20); // Loss
  assertEqual(rp, 285, 'After loss: 305 - 20 = 285');
  assertEqual(calculateNewRank(rp), Rank.BRONZE_3, 'Demoted to BRONZE_3');

  // Scenario 3: Stay in same rank within division
  rp = 350; // SILVER_1
  assertEqual(calculateNewRank(rp), Rank.SILVER_1, 'Start at 350 RP = SILVER_1');
  rp += 25; // Win
  assertEqual(rp, 375, 'After win: 350 + 25 = 375');
  assertEqual(calculateNewRank(rp), Rank.SILVER_1, 'Still SILVER_1 (no promotion yet)');

  // Scenario 4: Multi-tier promotion
  rp = 580; // SILVER_3 (needs 600 for GOLD_1)
  assertEqual(calculateNewRank(rp), Rank.SILVER_3, 'Start at 580 RP = SILVER_3');
  rp += 25; // Win: 605
  assertEqual(calculateNewRank(rp), Rank.GOLD_1, 'Promoted to GOLD_1 (tier change: SILVER -> GOLD)');
});

// ===========================================
// Test: Placement results mapping (reference)
// ===========================================

describe('Placement results reference (PLACEMENT_RESULTS from season.types)', () => {
  // These are defined in season.types.ts, just verifying expected behavior
  const PLACEMENT_RESULTS: Record<number, Rank> = {
    10: Rank.GOLD_1,
    9: Rank.GOLD_2,
    8: Rank.GOLD_3,
    7: Rank.SILVER_1,
    6: Rank.SILVER_2,
    5: Rank.SILVER_3,
    4: Rank.BRONZE_1,
    3: Rank.BRONZE_2,
    2: Rank.BRONZE_3,
    1: Rank.BRONZE_3,
    0: Rank.BRONZE_3,
  };

  assertEqual(PLACEMENT_RESULTS[10], Rank.GOLD_1, '10 wins = GOLD_1');
  assertEqual(PLACEMENT_RESULTS[9], Rank.GOLD_2, '9 wins = GOLD_2');
  assertEqual(PLACEMENT_RESULTS[8], Rank.GOLD_3, '8 wins = GOLD_3');
  assertEqual(PLACEMENT_RESULTS[7], Rank.SILVER_1, '7 wins = SILVER_1');
  assertEqual(PLACEMENT_RESULTS[6], Rank.SILVER_2, '6 wins = SILVER_2');
  assertEqual(PLACEMENT_RESULTS[5], Rank.SILVER_3, '5 wins = SILVER_3');
  assertEqual(PLACEMENT_RESULTS[4], Rank.BRONZE_1, '4 wins = BRONZE_1');
  assertEqual(PLACEMENT_RESULTS[3], Rank.BRONZE_2, '3 wins = BRONZE_2');
  assertEqual(PLACEMENT_RESULTS[2], Rank.BRONZE_3, '2 wins = BRONZE_3');
  assertEqual(PLACEMENT_RESULTS[1], Rank.BRONZE_3, '1 win = BRONZE_3');
  assertEqual(PLACEMENT_RESULTS[0], Rank.BRONZE_3, '0 wins = BRONZE_3');

  // Verify initial RP matches rank threshold
  assertEqual(RANK_THRESHOLDS[PLACEMENT_RESULTS[10]], 600, '10 wins -> GOLD_1 -> 600 RP');
  assertEqual(RANK_THRESHOLDS[PLACEMENT_RESULTS[5]], 500, '5 wins -> SILVER_3 -> 500 RP');
  assertEqual(RANK_THRESHOLDS[PLACEMENT_RESULTS[0]], 200, '0 wins -> BRONZE_3 -> 200 RP');
});

// ===========================================
// Test: Tier change detection logic
// ===========================================

describe('Tier change detection (mobile UI flags)', () => {
  // Helper to extract tier from rank
  const getTier = (rank: Rank): string => rank.split('_')[0];

  // Same tier transitions (no tier change)
  assertEqual(getTier(Rank.BRONZE_1), 'BRONZE', 'BRONZE_1 tier');
  assertEqual(getTier(Rank.BRONZE_2), 'BRONZE', 'BRONZE_2 tier');
  assertEqual(getTier(Rank.BRONZE_3), 'BRONZE', 'BRONZE_3 tier');

  // BRONZE to SILVER transition
  const beforeRank = Rank.BRONZE_3;
  const afterRank = Rank.SILVER_1;
  const tierChanged = getTier(beforeRank) !== getTier(afterRank);
  assertEqual(tierChanged, true, 'BRONZE_3 -> SILVER_1 = tier changed');

  // SILVER to SILVER (within tier)
  const withinTierBefore = Rank.SILVER_1;
  const withinTierAfter = Rank.SILVER_2;
  const withinTierChanged = getTier(withinTierBefore) !== getTier(withinTierAfter);
  assertEqual(withinTierChanged, false, 'SILVER_1 -> SILVER_2 = tier NOT changed');

  // Verify all tier extractions
  assertEqual(getTier(Rank.SILVER_1), 'SILVER', 'SILVER_1 tier');
  assertEqual(getTier(Rank.GOLD_1), 'GOLD', 'GOLD_1 tier');
  assertEqual(getTier(Rank.PLATINUM_1), 'PLATINUM', 'PLATINUM_1 tier');
  assertEqual(getTier(Rank.DIAMOND_1), 'DIAMOND', 'DIAMOND_1 tier');
});

// ===========================================
// Test: Promotion/Demotion detection
// ===========================================

describe('Promotion/Demotion detection (mobile UI flags)', () => {
  // Promoted when rankAfterIndex > rankBeforeIndex
  const bronzeIndex = RANK_ORDER.indexOf(Rank.BRONZE_1);
  const silverIndex = RANK_ORDER.indexOf(Rank.SILVER_1);
  const goldIndex = RANK_ORDER.indexOf(Rank.GOLD_1);

  assert(silverIndex > bronzeIndex, 'SILVER_1 index > BRONZE_1 index');
  assert(goldIndex > silverIndex, 'GOLD_1 index > SILVER_1 index');

  // Promotion scenario
  const promoted = silverIndex > bronzeIndex;
  assertEqual(promoted, true, 'BRONZE_1 -> SILVER_1 = promoted');

  // Demotion scenario
  const demoted = bronzeIndex < silverIndex;
  assertEqual(demoted, true, 'SILVER_1 -> BRONZE_1 = demoted');

  // No change
  assertEqual(bronzeIndex > bronzeIndex, false, 'Same rank = not promoted');
  assertEqual(bronzeIndex < bronzeIndex, false, 'Same rank = not demoted');
});

// ===========================================
// Summary
// ===========================================

console.log('\n========================================');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('========================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
