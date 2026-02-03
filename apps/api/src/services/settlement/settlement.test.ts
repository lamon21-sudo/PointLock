// =====================================================
// Settlement Service Tests
// =====================================================
// Verification tests for the settlement logic.
// Tests cover: pick results, slip scoring, match winner determination.

import { describe, it, expect } from 'vitest';

import { determinePickResult } from './pick-result';
import { calculateSlipScore, PickForScoring } from './slip-scorer';
import { determineMatchWinner, calculateSettlementAmounts } from './match-winner';
import { PickResultInput, EventScores, SlipScoreResult } from './settlement.types';

// ===========================================
// Test Helpers
// ===========================================

function createPickInput(overrides: Partial<PickResultInput> = {}): PickResultInput {
  return {
    id: 'pick-1',
    pickType: 'moneyline',
    selection: 'home',
    line: null,
    pointValue: 100,
    ...overrides,
  };
}

function createEventScores(overrides: Partial<EventScores> = {}): EventScores {
  return {
    id: 'event-1',
    homeScore: 100,
    awayScore: 95,
    status: 'final',
    ...overrides,
  };
}

function createSlipScoreResult(overrides: Partial<SlipScoreResult> = {}): SlipScoreResult {
  return {
    slipId: 'slip-1',
    pointsEarned: 0,
    correctPicks: 0,
    totalValidPicks: 0,
    pickResults: [],
    status: 'WON',
    ...overrides,
  };
}

// ===========================================
// Pick Result Tests
// ===========================================

describe('determinePickResult', () => {
  describe('Moneyline', () => {
    it('should return HIT when home team wins and selection is home', () => {
      const pick = createPickInput({ pickType: 'moneyline', selection: 'home' });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      expect(result.reason).toContain('Home won');
    });

    it('should return MISS when home team loses and selection is home', () => {
      const pick = createPickInput({ pickType: 'moneyline', selection: 'home' });
      const event = createEventScores({ homeScore: 90, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('MISS');
      expect(result.reason).toContain('Home lost');
    });

    it('should return HIT when away team wins and selection is away', () => {
      const pick = createPickInput({ pickType: 'moneyline', selection: 'away' });
      const event = createEventScores({ homeScore: 90, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      expect(result.reason).toContain('Away won');
    });

    it('should return MISS when away team loses and selection is away', () => {
      const pick = createPickInput({ pickType: 'moneyline', selection: 'away' });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('MISS');
      expect(result.reason).toContain('Away lost');
    });

    it('should return PUSH when game ends in tie', () => {
      const pick = createPickInput({ pickType: 'moneyline', selection: 'home' });
      const event = createEventScores({ homeScore: 100, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('PUSH');
      expect(result.reason).toContain('tie');
    });
  });

  describe('Spread', () => {
    it('should return HIT when home covers negative spread', () => {
      // Home favored by 7.5, wins by 10
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'home',
        line: -7.5,
      });
      const event = createEventScores({ homeScore: 100, awayScore: 90 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      // 100 + (-7.5) = 92.5 > 90
      expect(result.reason).toContain('Home covered');
    });

    it('should return MISS when home fails to cover negative spread', () => {
      // Home favored by 7.5, wins by only 5
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'home',
        line: -7.5,
      });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('MISS');
      // 100 + (-7.5) = 92.5 < 95
      expect(result.reason).toContain("Home didn't cover");
    });

    it('should return HIT when away covers as underdog', () => {
      // Home favored by 7.5, away loses by only 5
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'away',
        line: -7.5, // Line is from home perspective
      });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      // 100 + (-7.5) = 92.5 < 95, so home doesn't cover, away does
      expect(result.reason).toContain('Away covered');
    });

    it('should return PUSH on exact spread coverage', () => {
      // Home favored by 7, wins by exactly 7
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'home',
        line: -7,
      });
      const event = createEventScores({ homeScore: 100, awayScore: 93 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('PUSH');
      // 100 + (-7) = 93 = 93 (exact tie = push)
      expect(result.reason).toContain('push');
    });

    it('should handle positive spread (underdog)', () => {
      // Home is underdog by 5.5, home wins outright
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'home',
        line: 5.5,
      });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      // 100 + 5.5 = 105.5 > 95
    });
  });

  describe('Total', () => {
    it('should return HIT for over when total exceeds line', () => {
      const pick = createPickInput({
        pickType: 'total',
        selection: 'over',
        line: 200.5,
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      // 110 + 100 = 210 > 200.5
      expect(result.reason).toContain('Over hit');
    });

    it('should return MISS for over when total is under line', () => {
      const pick = createPickInput({
        pickType: 'total',
        selection: 'over',
        line: 220.5,
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('MISS');
      // 110 + 100 = 210 < 220.5
      expect(result.reason).toContain('Over missed');
    });

    it('should return HIT for under when total is below line', () => {
      const pick = createPickInput({
        pickType: 'total',
        selection: 'under',
        line: 220.5,
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('HIT');
      // 110 + 100 = 210 < 220.5
      expect(result.reason).toContain('Under hit');
    });

    it('should return MISS for under when total exceeds line', () => {
      const pick = createPickInput({
        pickType: 'total',
        selection: 'under',
        line: 200.5,
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('MISS');
      // 110 + 100 = 210 > 200.5
      expect(result.reason).toContain('Under missed');
    });

    it('should return PUSH when total equals line exactly', () => {
      const pick = createPickInput({
        pickType: 'total',
        selection: 'over',
        line: 210,
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('PUSH');
      // 110 + 100 = 210 = 210
      expect(result.reason).toContain('push');
    });
  });

  describe('VOID conditions', () => {
    it('should return VOID when event is cancelled', () => {
      const pick = createPickInput();
      const event = createEventScores({ status: 'cancelled' });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('VOID');
      expect(result.reason).toContain('cancelled');
    });

    it('should return VOID when event is postponed', () => {
      const pick = createPickInput();
      const event = createEventScores({ status: 'postponed' });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('VOID');
      expect(result.reason).toContain('postponed');
    });

    it('should return VOID when scores are null', () => {
      const pick = createPickInput();
      const event = createEventScores({ homeScore: null, awayScore: null });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('VOID');
      expect(result.reason).toContain('scores not available');
    });

    it('should return PENDING when event is not final', () => {
      const pick = createPickInput();
      const event = createEventScores({ status: 'in_progress' });

      const result = determinePickResult(pick, event);

      expect(result.status).toBe('PENDING');
    });
  });
});

// ===========================================
// Slip Scoring Tests
// ===========================================

describe('calculateSlipScore', () => {
  it('should sum points for all HIT picks', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
      {
        pickId: 'p3',
        pointValue: 200,
        result: { pickId: 'p3', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(450);
    expect(result.correctPicks).toBe(3);
    expect(result.totalValidPicks).toBe(3);
    expect(result.status).toBe('WON');
  });

  it('should return 0 points for all MISS picks', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'MISS', resultValue: null, reason: 'Miss' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'MISS', resultValue: null, reason: 'Miss' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(0);
    expect(result.correctPicks).toBe(0);
    expect(result.totalValidPicks).toBe(2);
    expect(result.status).toBe('LOST');
  });

  it('should handle mixed HIT/MISS picks', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'MISS', resultValue: null, reason: 'Miss' },
      },
      {
        pickId: 'p3',
        pointValue: 200,
        result: { pickId: 'p3', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(300); // 100 + 200
    expect(result.correctPicks).toBe(2);
    expect(result.totalValidPicks).toBe(3);
    expect(result.status).toBe('LOST'); // Has at least one MISS
  });

  it('should exclude PUSH picks from valid picks but not penalize', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'PUSH', resultValue: null, reason: 'Push' },
      },
      {
        pickId: 'p3',
        pointValue: 200,
        result: { pickId: 'p3', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(300); // 100 + 200 (PUSH excluded)
    expect(result.correctPicks).toBe(2);
    expect(result.totalValidPicks).toBe(2); // PUSH not counted
    expect(result.status).toBe('WON'); // No MISS = WON
  });

  it('should exclude VOID picks entirely', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'HIT', resultValue: null, reason: 'Hit' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'VOID', resultValue: null, reason: 'Void' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(100);
    expect(result.correctPicks).toBe(1);
    expect(result.totalValidPicks).toBe(1);
    expect(result.status).toBe('WON');
  });

  it('should return VOID status when all picks are VOID', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'VOID', resultValue: null, reason: 'Void' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'VOID', resultValue: null, reason: 'Void' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(0);
    expect(result.correctPicks).toBe(0);
    expect(result.totalValidPicks).toBe(0);
    expect(result.status).toBe('VOID');
  });

  it('should return WON when all picks are PUSH (no loss)', () => {
    const picks: PickForScoring[] = [
      {
        pickId: 'p1',
        pointValue: 100,
        result: { pickId: 'p1', status: 'PUSH', resultValue: null, reason: 'Push' },
      },
      {
        pickId: 'p2',
        pointValue: 150,
        result: { pickId: 'p2', status: 'PUSH', resultValue: null, reason: 'Push' },
      },
    ];

    const result = calculateSlipScore('slip-1', picks);

    expect(result.pointsEarned).toBe(0);
    expect(result.correctPicks).toBe(0);
    expect(result.totalValidPicks).toBe(0);
    expect(result.status).toBe('WON'); // No MISS = WON
  });
});

// ===========================================
// Match Winner Tests
// ===========================================

describe('determineMatchWinner', () => {
  it('should declare creator as winner when they have more points', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 300,
      correctPicks: 3,
      totalValidPicks: 5,
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 200,
      correctPicks: 2,
      totalValidPicks: 5,
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe('creator-id');
    expect(result.isDraw).toBe(false);
    expect(result.creatorPoints).toBe(300);
    expect(result.opponentPoints).toBe(200);
    expect(result.reason).toContain('Creator wins');
  });

  it('should declare opponent as winner when they have more points', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 150,
      correctPicks: 1,
      totalValidPicks: 5,
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 400,
      correctPicks: 4,
      totalValidPicks: 5,
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe('opponent-id');
    expect(result.isDraw).toBe(false);
    expect(result.reason).toContain('Opponent wins');
  });

  it('should declare draw when points are equal', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 250,
      correctPicks: 2,
      totalValidPicks: 5,
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 250,
      correctPicks: 2,
      totalValidPicks: 5,
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe(null);
    expect(result.isDraw).toBe(true);
    expect(result.reason).toContain('Draw');
    expect(result.reason).toContain('refunded');
  });

  it('should declare draw when both have 0 points', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 0,
      correctPicks: 0,
      totalValidPicks: 5,
      status: 'LOST',
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 0,
      correctPicks: 0,
      totalValidPicks: 5,
      status: 'LOST',
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe(null);
    expect(result.isDraw).toBe(true);
  });

  it('should handle both slips VOID (full refund)', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 0,
      correctPicks: 0,
      totalValidPicks: 0,
      status: 'VOID',
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 0,
      correctPicks: 0,
      totalValidPicks: 0,
      status: 'VOID',
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe(null);
    expect(result.isDraw).toBe(true);
    expect(result.reason).toContain('void');
    expect(result.reason).toContain('refunded');
  });

  it('should give win to opponent when creator slip is void', () => {
    const creatorScore = createSlipScoreResult({
      slipId: 'creator-slip',
      pointsEarned: 0,
      correctPicks: 0,
      totalValidPicks: 0,
      status: 'VOID',
    });
    const opponentScore = createSlipScoreResult({
      slipId: 'opponent-slip',
      pointsEarned: 100,
      correctPicks: 1,
      totalValidPicks: 3,
      status: 'WON',
    });

    const result = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(result.winnerId).toBe('opponent-id');
    expect(result.isDraw).toBe(false);
    expect(result.reason).toContain("Creator's slip voided");
  });

  // ===========================================
  // Tiebreaker Tests (Task 2.3)
  // ===========================================

  describe('Tiebreakers', () => {
    it('should award win by points without using tiebreaker', () => {
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 300,
        correctPicks: 3,
        totalValidPicks: 5, // More picks but higher points
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 200,
        correctPicks: 2,
        totalValidPicks: 3, // Fewer picks but lower points
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('creator-id');
      expect(result.isDraw).toBe(false);
      expect(result.reason).toContain('300 points vs 200 points');
      expect(result.reason).not.toContain('tiebreaker');
    });

    it('should use fewer valid picks as tiebreaker when points are equal', () => {
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 200,
        correctPicks: 2,
        totalValidPicks: 3, // Fewer picks = more efficient
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 200,
        correctPicks: 2,
        totalValidPicks: 5, // More picks = less efficient
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('creator-id');
      expect(result.isDraw).toBe(false);
      expect(result.reason).toContain('tiebreaker');
      expect(result.reason).toContain('3 picks vs 5 picks');
    });

    it('should award opponent via tiebreaker when they have fewer picks', () => {
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 250,
        correctPicks: 3,
        totalValidPicks: 6, // More picks
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 250,
        correctPicks: 3,
        totalValidPicks: 4, // Fewer picks
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('opponent-id');
      expect(result.isDraw).toBe(false);
      expect(result.reason).toContain('tiebreaker');
      expect(result.reason).toContain('4 picks vs 6 picks');
    });

    it('should declare draw when points AND valid picks are equal', () => {
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 200,
        correctPicks: 2,
        totalValidPicks: 4,
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 200,
        correctPicks: 2,
        totalValidPicks: 4,
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBeNull();
      expect(result.isDraw).toBe(true);
      expect(result.reason).toContain('Draw');
      expect(result.reason).toContain('200 points');
      expect(result.reason).toContain('4 valid picks');
    });

    it('should apply tiebreaker when both have zero points', () => {
      // Both players miss all picks, but creator had fewer picks
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 0,
        correctPicks: 0,
        totalValidPicks: 2, // Fewer picks = more efficient at failing
        status: 'LOST',
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 0,
        correctPicks: 0,
        totalValidPicks: 4, // More picks
        status: 'LOST',
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('creator-id');
      expect(result.isDraw).toBe(false);
      expect(result.reason).toContain('tiebreaker');
    });

    it('should correctly exclude VOID picks from tiebreaker count', () => {
      // Creator: 5 picks submitted, 2 got VOID = 3 valid
      // Opponent: 4 picks submitted, 0 VOID = 4 valid
      // Same points → Creator wins (3 < 4)
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 150,
        correctPicks: 1,
        totalValidPicks: 3, // After VOID exclusions
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 150,
        correctPicks: 1,
        totalValidPicks: 4,
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('creator-id');
      expect(result.reason).toContain('tiebreaker');
    });

    it('should be idempotent - same inputs always produce same output', () => {
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 200,
        totalValidPicks: 5,
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 200,
        totalValidPicks: 5,
      });

      const result1 = determineMatchWinner('c1', 'o1', creatorScore, opponentScore);
      const result2 = determineMatchWinner('c1', 'o1', creatorScore, opponentScore);
      const result3 = determineMatchWinner('c1', 'o1', creatorScore, opponentScore);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1.isDraw).toBe(true); // Complete tie = draw
    });

    it('should still bypass tiebreaker when one slip is VOID', () => {
      // VOID slips should lose regardless of pick count
      const creatorScore = createSlipScoreResult({
        slipId: 'creator-slip',
        pointsEarned: 0,
        correctPicks: 0,
        totalValidPicks: 0, // All picks VOID
        status: 'VOID',
      });
      const opponentScore = createSlipScoreResult({
        slipId: 'opponent-slip',
        pointsEarned: 50,
        correctPicks: 1,
        totalValidPicks: 5,
        status: 'WON',
      });

      const result = determineMatchWinner(
        'creator-id',
        'opponent-id',
        creatorScore,
        opponentScore
      );

      expect(result.winnerId).toBe('opponent-id');
      expect(result.reason).toContain('voided');
      expect(result.reason).not.toContain('tiebreaker');
    });
  });
});

// ===========================================
// Settlement Amount Tests
// ===========================================

describe('calculateSettlementAmounts', () => {
  it('should calculate winner payout with rake', () => {
    const stakeAmount = BigInt(1000); // $10 each
    const rakePercentage = 5; // 5%

    const result = calculateSettlementAmounts(
      stakeAmount,
      rakePercentage,
      'winner-id',
      false
    );

    expect(result.totalPot).toBe(BigInt(2000)); // $20 total
    expect(result.rakeAmount).toBe(BigInt(100)); // $1 rake (5% of $20)
    expect(result.winnerPayout).toBe(BigInt(1900)); // $19 to winner
    expect(result.creatorRefund).toBe(null);
    expect(result.opponentRefund).toBe(null);
  });

  it('should refund both players on draw (no rake)', () => {
    const stakeAmount = BigInt(1000);
    const rakePercentage = 5;

    const result = calculateSettlementAmounts(
      stakeAmount,
      rakePercentage,
      null,
      true // isDraw
    );

    expect(result.totalPot).toBe(BigInt(2000));
    expect(result.rakeAmount).toBe(BigInt(0)); // No rake on draw
    expect(result.winnerPayout).toBe(null);
    expect(result.creatorRefund).toBe(BigInt(1000)); // Full refund
    expect(result.opponentRefund).toBe(BigInt(1000)); // Full refund
  });

  it('should handle 0% rake', () => {
    const stakeAmount = BigInt(1000);
    const rakePercentage = 0;

    const result = calculateSettlementAmounts(
      stakeAmount,
      rakePercentage,
      'winner-id',
      false
    );

    expect(result.totalPot).toBe(BigInt(2000));
    expect(result.rakeAmount).toBe(BigInt(0));
    expect(result.winnerPayout).toBe(BigInt(2000)); // Full pot to winner
  });

  it('should handle high stake amounts', () => {
    const stakeAmount = BigInt(100000000); // $1,000,000 each
    const rakePercentage = 10;

    const result = calculateSettlementAmounts(
      stakeAmount,
      rakePercentage,
      'winner-id',
      false
    );

    expect(result.totalPot).toBe(BigInt(200000000)); // $2M total
    expect(result.rakeAmount).toBe(BigInt(20000000)); // $200K rake
    expect(result.winnerPayout).toBe(BigInt(180000000)); // $1.8M to winner
  });

  it('should handle fractional rake percentages', () => {
    const stakeAmount = BigInt(1000);
    const rakePercentage = 2.5; // 2.5%

    const result = calculateSettlementAmounts(
      stakeAmount,
      rakePercentage,
      'winner-id',
      false
    );

    expect(result.totalPot).toBe(BigInt(2000));
    expect(result.rakeAmount).toBe(BigInt(50)); // 2.5% of 2000 = 50
    expect(result.winnerPayout).toBe(BigInt(1950));
  });
});

// ===========================================
// Integration-Style Test
// ===========================================

describe('Full Settlement Flow', () => {
  it('should correctly settle a PvP match scenario', () => {
    // Scenario: Creator picks 3, hits 2. Opponent picks 3, hits 1.
    // Creator should win.

    // Create pick results for creator
    const creatorPicks: PickForScoring[] = [
      {
        pickId: 'c1',
        pointValue: 100,
        result: { pickId: 'c1', status: 'HIT', resultValue: 5, reason: 'Home won' },
      },
      {
        pickId: 'c2',
        pointValue: 150,
        result: { pickId: 'c2', status: 'MISS', resultValue: -3, reason: 'Home lost' },
      },
      {
        pickId: 'c3',
        pointValue: 200,
        result: { pickId: 'c3', status: 'HIT', resultValue: 10, reason: 'Over hit' },
      },
    ];

    // Create pick results for opponent
    const opponentPicks: PickForScoring[] = [
      {
        pickId: 'o1',
        pointValue: 100,
        result: { pickId: 'o1', status: 'MISS', resultValue: -5, reason: 'Away lost' },
      },
      {
        pickId: 'o2',
        pointValue: 150,
        result: { pickId: 'o2', status: 'HIT', resultValue: 3, reason: 'Home covered' },
      },
      {
        pickId: 'o3',
        pointValue: 200,
        result: { pickId: 'o3', status: 'MISS', resultValue: -2, reason: 'Under missed' },
      },
    ];

    // Calculate scores
    const creatorScore = calculateSlipScore('creator-slip', creatorPicks);
    const opponentScore = calculateSlipScore('opponent-slip', opponentPicks);

    // Verify slip scores
    expect(creatorScore.pointsEarned).toBe(300); // 100 + 200
    expect(creatorScore.correctPicks).toBe(2);
    expect(creatorScore.status).toBe('LOST'); // Has a MISS

    expect(opponentScore.pointsEarned).toBe(150); // Only one HIT
    expect(opponentScore.correctPicks).toBe(1);
    expect(opponentScore.status).toBe('LOST'); // Has MISSes

    // Determine winner
    const winnerResult = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(winnerResult.winnerId).toBe('creator-id');
    expect(winnerResult.isDraw).toBe(false);
    expect(winnerResult.creatorPoints).toBe(300);
    expect(winnerResult.opponentPoints).toBe(150);

    // Calculate financial settlement
    const amounts = calculateSettlementAmounts(
      BigInt(5000), // $50 each
      5, // 5% rake
      winnerResult.winnerId,
      winnerResult.isDraw
    );

    expect(amounts.totalPot).toBe(BigInt(10000)); // $100 total
    expect(amounts.rakeAmount).toBe(BigInt(500)); // $5 rake
    expect(amounts.winnerPayout).toBe(BigInt(9500)); // $95 to creator
  });

  it('should handle draw scenario with refunds', () => {
    // Both players score exactly 200 points
    const creatorPicks: PickForScoring[] = [
      {
        pickId: 'c1',
        pointValue: 200,
        result: { pickId: 'c1', status: 'HIT', resultValue: 5, reason: 'Hit' },
      },
    ];

    const opponentPicks: PickForScoring[] = [
      {
        pickId: 'o1',
        pointValue: 200,
        result: { pickId: 'o1', status: 'HIT', resultValue: 5, reason: 'Hit' },
      },
    ];

    const creatorScore = calculateSlipScore('creator-slip', creatorPicks);
    const opponentScore = calculateSlipScore('opponent-slip', opponentPicks);

    const winnerResult = determineMatchWinner(
      'creator-id',
      'opponent-id',
      creatorScore,
      opponentScore
    );

    expect(winnerResult.isDraw).toBe(true);
    expect(winnerResult.winnerId).toBe(null);

    const amounts = calculateSettlementAmounts(
      BigInt(5000),
      5,
      winnerResult.winnerId,
      winnerResult.isDraw
    );

    expect(amounts.rakeAmount).toBe(BigInt(0)); // No rake on draw
    expect(amounts.creatorRefund).toBe(BigInt(5000)); // Full refund
    expect(amounts.opponentRefund).toBe(BigInt(5000)); // Full refund
  });
});

// ===========================================
// Security & Edge Case Tests
// ===========================================

describe('Security Tests', () => {
  describe('Negative Point Value Protection', () => {
    it('should throw error for negative point values', () => {
      const maliciousPicks: PickForScoring[] = [
        {
          pickId: 'evil',
          pointValue: -100, // NEGATIVE - should be rejected
          result: { pickId: 'evil', status: 'HIT', resultValue: null, reason: 'Hit' },
        },
      ];

      expect(() => calculateSlipScore('slip-1', maliciousPicks)).toThrow(
        'Invalid negative point value'
      );
    });

    it('should accept zero point values', () => {
      const zeroPicks: PickForScoring[] = [
        {
          pickId: 'zero',
          pointValue: 0, // Zero is valid (edge case)
          result: { pickId: 'zero', status: 'HIT', resultValue: null, reason: 'Hit' },
        },
      ];

      const result = calculateSlipScore('slip-1', zeroPicks);
      expect(result.pointsEarned).toBe(0);
      expect(result.correctPicks).toBe(1);
    });
  });

  describe('Floating-Point Precision', () => {
    it('should handle spread PUSH with floating-point precision', () => {
      // Test case where floating-point math could cause issues
      // 100 + (-7) - 93 should equal 0, but might be 0.00000000000001
      const pick = createPickInput({
        pickType: 'spread',
        selection: 'home',
        line: -7, // Integer line
      });
      const event = createEventScores({ homeScore: 100, awayScore: 93 });

      const result = determinePickResult(pick, event);
      expect(result.status).toBe('PUSH');
    });

    it('should handle total PUSH with floating-point precision', () => {
      // Test case: 110 + 100 = 210, line = 210
      const pick = createPickInput({
        pickType: 'total',
        selection: 'over',
        line: 210, // Exact match
      });
      const event = createEventScores({ homeScore: 110, awayScore: 100 });

      const result = determinePickResult(pick, event);
      expect(result.status).toBe('PUSH');
    });

    it('should handle selections with whitespace', () => {
      const pick = createPickInput({
        pickType: 'moneyline',
        selection: '  home  ', // Whitespace around selection
      });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);
      expect(result.status).toBe('HIT'); // Should trim and match
    });

    it('should handle mixed case selections', () => {
      const pick = createPickInput({
        pickType: 'moneyline',
        selection: 'HOME', // Uppercase
      });
      const event = createEventScores({ homeScore: 100, awayScore: 95 });

      const result = determinePickResult(pick, event);
      expect(result.status).toBe('HIT');
    });
  });

  describe('Rake Ceiling Calculation', () => {
    it('should round rake UP to prevent house loss on fractional cents', () => {
      // Pot of 1001 cents at 5% = 50.05 cents
      // Should round UP to 51 cents (ceiling), not down to 50
      const stakeAmount = BigInt(501); // Each stakes 501 cents
      const rakePercentage = 5;

      const result = calculateSettlementAmounts(
        stakeAmount,
        rakePercentage,
        'winner-id',
        false
      );

      // Total pot: 1002 cents
      // 5% of 1002 = 50.1 cents
      // Ceiling: 51 cents
      expect(result.totalPot).toBe(BigInt(1002));
      expect(result.rakeAmount).toBe(BigInt(51)); // Ceiling, not 50
      expect(result.winnerPayout).toBe(BigInt(951)); // 1002 - 51
    });

    it('should not round when rake is exact', () => {
      // Pot of 2000 at 5% = 100 exactly
      const stakeAmount = BigInt(1000);
      const rakePercentage = 5;

      const result = calculateSettlementAmounts(
        stakeAmount,
        rakePercentage,
        'winner-id',
        false
      );

      expect(result.totalPot).toBe(BigInt(2000));
      expect(result.rakeAmount).toBe(BigInt(100)); // Exact, no rounding needed
      expect(result.winnerPayout).toBe(BigInt(1900));
    });
  });
});
