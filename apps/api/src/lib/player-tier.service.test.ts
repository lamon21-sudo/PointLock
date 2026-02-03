// =====================================================
// Player Tier Service Tests
// =====================================================
// Unit tests for derivePlayerTier() function.
// Tests OR logic for ELITE tier, AND logic for STANDARD,
// position-specific NFL criteria, and edge cases.
// =====================================================

import { describe, it, expect } from 'vitest';
import {
  derivePlayerTier,
  NBAPlayerStats,
  NFLPlayerStats,
  MLBPlayerStats,
  NHLPlayerStats,
} from './player-tier.service';
import { PickTier, SportType } from '@prisma/client';

// ===========================================
// NBA Tests
// ===========================================

describe('NBA Tier Tests (OR Logic for ELITE/PREMIUM)', () => {
  it('NBA: 25 PPG only (no All-Star) → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 25,
        gamesPlayed: 40,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NBA: All-Star only (15 PPG) → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 15,
        gamesPlayed: 70,
        isAllStar: true,
        isStarter: true,
      } as NBAPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NBA: 28 PPG AND All-Star → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 28,
        gamesPlayed: 75,
        isAllStar: true,
        isStarter: true,
      } as NBAPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NBA: Exactly 25.0 PPG → ELITE (boundary, inclusive)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 25.0,
        gamesPlayed: 60,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NBA: 24.99 PPG, not All-Star, Starter → PREMIUM', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 24.99,
        gamesPlayed: 70,
        isAllStar: false,
        isStarter: true,
      } as NBAPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('NBA: 18 PPG only → PREMIUM (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 18,
        gamesPlayed: 50,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('NBA: Starter only (12 PPG) → PREMIUM (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 12,
        gamesPlayed: 70,
        isAllStar: false,
        isStarter: true,
      } as NBAPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('NBA: 10 PPG AND 50 games → STANDARD', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 10,
        gamesPlayed: 50,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.STANDARD);
  });

  it('NBA: 10 PPG AND 49 games → FREE (AND fails)', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 10,
        gamesPlayed: 49,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.FREE);
  });

  it('NBA: Below all thresholds → FREE', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: 5,
        gamesPlayed: 20,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.FREE);
  });
});

// ===========================================
// NFL Tests (Position-Specific)
// ===========================================

describe('NFL Tier Tests (Position-Specific)', () => {
  it('NFL QB: 4000 pass yds → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'QB',
        passingYards: 4000,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 10,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL QB: Pro Bowl (3000 yds) → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'QB',
        passingYards: 3000,
        isProBowl: true,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 20,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL RB: 1200 rush yds → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'RB',
        rushingYards: 1200,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 5,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL WR: 1200 rec yds → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'WR',
        receivingYards: 1200,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 3,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL TE: 1200 rec yds → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'TE',
        receivingYards: 1200,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 1,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL DEF: 10 sacks → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'DEF',
        sacks: 10,
        tackles: 50,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 8,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL DEF: 100 tackles → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'DEF',
        sacks: 5,
        tackles: 100,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 10,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL: Any position with Pro Bowl → ELITE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'RB',
        rushingYards: 500,
        isProBowl: true,
        gamesPlayed: 10,
        isOnRoster: true,
        positionRank: 25,
      } as NFLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NFL: Top 15 at position → PREMIUM', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'WR',
        receivingYards: 800,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 15,
      } as NFLPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('NFL: Rank 16 (outside top 15) + 17 games + roster → STANDARD', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'WR',
        receivingYards: 800,
        isProBowl: false,
        gamesPlayed: 17,
        isOnRoster: true,
        positionRank: 16,
      } as NFLPlayerStats)
    ).toBe(PickTier.STANDARD);
  });

  it('NFL: 16 games AND roster → STANDARD', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'QB',
        passingYards: 2000,
        isProBowl: false,
        gamesPlayed: 16,
        isOnRoster: true,
        positionRank: 25,
      } as NFLPlayerStats)
    ).toBe(PickTier.STANDARD);
  });

  it('NFL: 8 games → FREE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'QB',
        passingYards: 1000,
        isProBowl: false,
        gamesPlayed: 8,
        isOnRoster: true,
        positionRank: 40,
      } as NFLPlayerStats)
    ).toBe(PickTier.FREE);
  });
});

// ===========================================
// MLB Tests
// ===========================================

describe('MLB Tier Tests (OR Logic for ELITE)', () => {
  it('MLB: .900 OPS only → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.9,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('MLB: All-Star only (.750 OPS) → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.75,
        isAllStar: true,
      } as MLBPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('MLB: Exactly .900 OPS → ELITE (boundary)', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.9,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('MLB: .800 OPS → PREMIUM', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.8,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('MLB: .700 OPS → STANDARD', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.7,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.STANDARD);
  });

  it('MLB: .650 OPS → FREE', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 0.65,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.FREE);
  });

  it('MLB: OPS as integer 900 (normalized to 0.900) → ELITE', () => {
    expect(
      derivePlayerTier(SportType.MLB, {
        ops: 900,
        isAllStar: false,
      } as MLBPlayerStats)
    ).toBe(PickTier.ELITE);
  });
});

// ===========================================
// NHL Tests
// ===========================================

describe('NHL Tier Tests (OR Logic for ELITE)', () => {
  it('NHL: 80 pts only → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 80,
        isAllStar: false,
      } as NHLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NHL: All-Star only (40 pts) → ELITE (OR logic)', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 40,
        isAllStar: true,
      } as NHLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NHL: Exactly 80 pts → ELITE (boundary)', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 80,
        isAllStar: false,
      } as NHLPlayerStats)
    ).toBe(PickTier.ELITE);
  });

  it('NHL: 50 pts → PREMIUM', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 50,
        isAllStar: false,
      } as NHLPlayerStats)
    ).toBe(PickTier.PREMIUM);
  });

  it('NHL: 30 pts → STANDARD', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 30,
        isAllStar: false,
      } as NHLPlayerStats)
    ).toBe(PickTier.STANDARD);
  });

  it('NHL: 20 pts → FREE', () => {
    expect(
      derivePlayerTier(SportType.NHL, {
        points: 20,
        isAllStar: false,
      } as NHLPlayerStats)
    ).toBe(PickTier.FREE);
  });
});

// ===========================================
// Edge Cases
// ===========================================

describe('Edge Cases', () => {
  it('Null stats → FREE', () => {
    expect(derivePlayerTier(SportType.NBA, null)).toBe(PickTier.FREE);
  });

  it('NBA: Missing PPG → FREE', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: undefined as unknown as number,
        gamesPlayed: 50,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.FREE);
  });

  it('NFL: Missing gamesPlayed → FREE', () => {
    expect(
      derivePlayerTier(SportType.NFL, {
        position: 'QB',
        passingYards: 3000,
        isProBowl: false,
        gamesPlayed: undefined as unknown as number,
        isOnRoster: true,
      } as NFLPlayerStats)
    ).toBe(PickTier.FREE);
  });

  it('Unsupported sport (SOCCER) → FREE', () => {
    expect(
      derivePlayerTier(SportType.SOCCER, {
        ppg: 30,
        gamesPlayed: 50,
        isAllStar: true,
        isStarter: true,
      } as NBAPlayerStats)
    ).toBe(PickTier.FREE);
  });

  it('NBA: Negative PPG → FREE', () => {
    expect(
      derivePlayerTier(SportType.NBA, {
        ppg: -5,
        gamesPlayed: 50,
        isAllStar: false,
        isStarter: false,
      } as NBAPlayerStats)
    ).toBe(PickTier.FREE);
  });
});
