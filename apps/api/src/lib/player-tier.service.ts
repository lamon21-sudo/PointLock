// =====================================================
// Player Tier Service
// =====================================================
// Auto-categorizes sports PLAYERS (athletes) into tiers based on
// their performance stats. This is separate from USER tier
// calculations in tier.service.ts.
//
// TIER RULES (using OR logic for ELITE):
// - ELITE: Exceptional stats OR All-Star/Pro Bowl selection
// - PREMIUM: Good stats OR starter status
// - STANDARD: Minimum stats AND games played
// - FREE: Everyone else (default)
//
// Daily sync runs at 4 AM UTC via BullMQ worker.
// =====================================================

import { PickTier, SportType } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getOrFetch, delPattern } from './cache.service';

// ===========================================
// Types
// ===========================================

/**
 * NBA player stats for tier calculation.
 */
export interface NBAPlayerStats {
  ppg: number;           // Points per game
  gamesPlayed: number;   // Games played this season
  isAllStar: boolean;    // Selected to All-Star game
  isStarter: boolean;    // Starting player (not bench)
}

/**
 * NFL player stats with position-specific criteria.
 */
export interface NFLPlayerStats {
  position: NFLPosition;   // Required for position-specific criteria
  passingYards?: number;   // QB stat
  rushingYards?: number;   // RB stat
  receivingYards?: number; // WR/TE stat
  sacks?: number;          // DEF stat
  tackles?: number;        // DEF stat
  isProBowl: boolean;      // Pro Bowl selection
  gamesPlayed: number;     // Games played
  isOnRoster: boolean;     // Currently on active roster
  positionRank?: number;   // Rank at position (1-based, lower is better)
}

export type NFLPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF';

/**
 * MLB player stats for tier calculation.
 */
export interface MLBPlayerStats {
  ops: number;          // On-base Plus Slugging (0.000 to ~1.200)
  isAllStar: boolean;   // Selected to All-Star game
}

/**
 * NHL player stats for tier calculation.
 */
export interface NHLPlayerStats {
  points: number;       // Goals + Assists
  isAllStar: boolean;   // Selected to All-Star game
}

/**
 * Union type for all sport stats.
 */
export type PlayerStats = NBAPlayerStats | NFLPlayerStats | MLBPlayerStats | NHLPlayerStats;

/**
 * Input for creating/updating a player tier assignment.
 */
export interface PlayerTierInput {
  playerId: string;
  playerName: string;
  sport: SportType;
  stats: PlayerStats;
}

/**
 * Result of a player tier sync operation.
 */
export interface SyncResult {
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ===========================================
// Constants - Tier Thresholds
// ===========================================

export const NBA_THRESHOLDS = {
  ELITE_PPG: 25,
  PREMIUM_PPG: 18,
  STANDARD_PPG: 10,
  STANDARD_GAMES: 50,
} as const;

export const NFL_THRESHOLDS = {
  QB_ELITE_PASSING_YARDS: 4000,
  RB_ELITE_RUSHING_YARDS: 1200,
  WR_ELITE_RECEIVING_YARDS: 1200,
  TE_ELITE_RECEIVING_YARDS: 1200,
  DEF_ELITE_SACKS: 10,
  DEF_ELITE_TACKLES: 100,
  PREMIUM_POSITION_RANK: 15,
  STANDARD_GAMES: 16,
} as const;

export const MLB_THRESHOLDS = {
  ELITE_OPS: 0.900,
  PREMIUM_OPS: 0.800,
  STANDARD_OPS: 0.700,
} as const;

export const NHL_THRESHOLDS = {
  ELITE_POINTS: 80,
  PREMIUM_POINTS: 50,
  STANDARD_POINTS: 30,
} as const;

// ===========================================
// Cache Keys & TTLs
// ===========================================

const PLAYER_TIER_CACHE_KEY = (playerId: string, sport: SportType) =>
  `tier:player:${sport}:${playerId}`;
const PLAYER_TIER_TTL = 3600; // 1 hour (syncs daily at 4 AM)

// ===========================================
// Pure Functions - Tier Derivation
// ===========================================

/**
 * Derive the tier for a player based on sport and stats.
 * Uses OR logic for ELITE tier, AND logic for STANDARD.
 *
 * @param sport - The sport type (NBA, NFL, MLB, NHL)
 * @param stats - The player's stats (null = FREE tier)
 * @returns The calculated tier
 */
export function derivePlayerTier(sport: SportType, stats: PlayerStats | null): PickTier {
  // Fail-safe: missing stats = FREE
  if (!stats) {
    return PickTier.FREE;
  }

  switch (sport) {
    case SportType.NBA:
      return deriveNBATier(stats as NBAPlayerStats);

    case SportType.NFL:
      return deriveNFLTier(stats as NFLPlayerStats);

    case SportType.MLB:
      return deriveMLBTier(stats as MLBPlayerStats);

    case SportType.NHL:
      return deriveNHLTier(stats as NHLPlayerStats);

    default:
      // Unsupported sports default to FREE
      return PickTier.FREE;
  }
}

/**
 * NBA tier derivation.
 * ELITE: 25+ PPG OR All-Star
 * PREMIUM: 18+ PPG OR Starter
 * STANDARD: 10+ PPG AND 50+ games
 */
function deriveNBATier(stats: NBAPlayerStats): PickTier {
  // Validate required fields
  if (typeof stats.ppg !== 'number' || typeof stats.gamesPlayed !== 'number') {
    return PickTier.FREE;
  }

  // ELITE: 25+ PPG OR All-Star
  if (stats.ppg >= NBA_THRESHOLDS.ELITE_PPG || stats.isAllStar === true) {
    return PickTier.ELITE;
  }

  // PREMIUM: 18+ PPG OR Starter
  if (stats.ppg >= NBA_THRESHOLDS.PREMIUM_PPG || stats.isStarter === true) {
    return PickTier.PREMIUM;
  }

  // STANDARD: 10+ PPG AND 50+ games
  if (stats.ppg >= NBA_THRESHOLDS.STANDARD_PPG && stats.gamesPlayed >= NBA_THRESHOLDS.STANDARD_GAMES) {
    return PickTier.STANDARD;
  }

  return PickTier.FREE;
}

/**
 * NFL tier derivation with position-specific criteria.
 * Pro Bowl = ELITE for any position.
 * Position-specific stat thresholds for ELITE.
 */
function deriveNFLTier(stats: NFLPlayerStats): PickTier {
  // Validate required fields
  if (typeof stats.gamesPlayed !== 'number') {
    return PickTier.FREE;
  }

  // Pro Bowl = ELITE for any position
  if (stats.isProBowl === true) {
    return PickTier.ELITE;
  }

  // Position-specific ELITE thresholds
  switch (stats.position) {
    case 'QB':
      if ((stats.passingYards ?? 0) >= NFL_THRESHOLDS.QB_ELITE_PASSING_YARDS) {
        return PickTier.ELITE;
      }
      break;

    case 'RB':
      if ((stats.rushingYards ?? 0) >= NFL_THRESHOLDS.RB_ELITE_RUSHING_YARDS) {
        return PickTier.ELITE;
      }
      break;

    case 'WR':
      if ((stats.receivingYards ?? 0) >= NFL_THRESHOLDS.WR_ELITE_RECEIVING_YARDS) {
        return PickTier.ELITE;
      }
      break;

    case 'TE':
      if ((stats.receivingYards ?? 0) >= NFL_THRESHOLDS.TE_ELITE_RECEIVING_YARDS) {
        return PickTier.ELITE;
      }
      break;

    case 'DEF':
      if (
        (stats.sacks ?? 0) >= NFL_THRESHOLDS.DEF_ELITE_SACKS ||
        (stats.tackles ?? 0) >= NFL_THRESHOLDS.DEF_ELITE_TACKLES
      ) {
        return PickTier.ELITE;
      }
      break;
  }

  // PREMIUM: Top 15 at position
  if (stats.positionRank && stats.positionRank <= NFL_THRESHOLDS.PREMIUM_POSITION_RANK) {
    return PickTier.PREMIUM;
  }

  // STANDARD: 16+ games AND on roster
  if (stats.gamesPlayed >= NFL_THRESHOLDS.STANDARD_GAMES && stats.isOnRoster === true) {
    return PickTier.STANDARD;
  }

  return PickTier.FREE;
}

/**
 * MLB tier derivation.
 * ELITE: .900+ OPS OR All-Star
 * PREMIUM: .800+ OPS
 * STANDARD: .700+ OPS
 */
function deriveMLBTier(stats: MLBPlayerStats): PickTier {
  // Validate required fields
  if (typeof stats.ops !== 'number') {
    return PickTier.FREE;
  }

  // Normalize OPS if provided as integer (e.g., 900 instead of 0.900)
  const ops = stats.ops > 10 ? stats.ops / 1000 : stats.ops;

  // ELITE: .900+ OPS OR All-Star
  if (ops >= MLB_THRESHOLDS.ELITE_OPS || stats.isAllStar === true) {
    return PickTier.ELITE;
  }

  // PREMIUM: .800+ OPS
  if (ops >= MLB_THRESHOLDS.PREMIUM_OPS) {
    return PickTier.PREMIUM;
  }

  // STANDARD: .700+ OPS
  if (ops >= MLB_THRESHOLDS.STANDARD_OPS) {
    return PickTier.STANDARD;
  }

  return PickTier.FREE;
}

/**
 * NHL tier derivation.
 * ELITE: 80+ pts OR All-Star
 * PREMIUM: 50+ pts
 * STANDARD: 30+ pts
 */
function deriveNHLTier(stats: NHLPlayerStats): PickTier {
  // Validate required fields
  if (typeof stats.points !== 'number') {
    return PickTier.FREE;
  }

  // ELITE: 80+ pts OR All-Star
  if (stats.points >= NHL_THRESHOLDS.ELITE_POINTS || stats.isAllStar === true) {
    return PickTier.ELITE;
  }

  // PREMIUM: 50+ pts
  if (stats.points >= NHL_THRESHOLDS.PREMIUM_POINTS) {
    return PickTier.PREMIUM;
  }

  // STANDARD: 30+ pts
  if (stats.points >= NHL_THRESHOLDS.STANDARD_POINTS) {
    return PickTier.STANDARD;
  }

  return PickTier.FREE;
}

// ===========================================
// Mock Data (for development/testing)
// ===========================================

const MOCK_NBA_PLAYERS: PlayerTierInput[] = [
  { playerId: 'lebron-james', playerName: 'LeBron James', sport: SportType.NBA, stats: { ppg: 25.7, gamesPlayed: 71, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'jayson-tatum', playerName: 'Jayson Tatum', sport: SportType.NBA, stats: { ppg: 26.9, gamesPlayed: 74, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'luka-doncic', playerName: 'Luka Doncic', sport: SportType.NBA, stats: { ppg: 33.9, gamesPlayed: 70, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'anthony-edwards', playerName: 'Anthony Edwards', sport: SportType.NBA, stats: { ppg: 25.9, gamesPlayed: 79, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'tyrese-haliburton', playerName: 'Tyrese Haliburton', sport: SportType.NBA, stats: { ppg: 20.1, gamesPlayed: 69, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'jalen-brunson', playerName: 'Jalen Brunson', sport: SportType.NBA, stats: { ppg: 28.7, gamesPlayed: 77, isAllStar: true, isStarter: true } as NBAPlayerStats },
  { playerId: 'bench-player-1', playerName: 'Bench Player One', sport: SportType.NBA, stats: { ppg: 12.5, gamesPlayed: 65, isAllStar: false, isStarter: false } as NBAPlayerStats },
  { playerId: 'role-player-1', playerName: 'Role Player One', sport: SportType.NBA, stats: { ppg: 8.2, gamesPlayed: 45, isAllStar: false, isStarter: false } as NBAPlayerStats },
];

const MOCK_NFL_PLAYERS: PlayerTierInput[] = [
  { playerId: 'patrick-mahomes', playerName: 'Patrick Mahomes', sport: SportType.NFL, stats: { position: 'QB', passingYards: 4183, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 1 } as NFLPlayerStats },
  { playerId: 'josh-allen', playerName: 'Josh Allen', sport: SportType.NFL, stats: { position: 'QB', passingYards: 4306, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 2 } as NFLPlayerStats },
  { playerId: 'derrick-henry', playerName: 'Derrick Henry', sport: SportType.NFL, stats: { position: 'RB', rushingYards: 1538, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 1 } as NFLPlayerStats },
  { playerId: 'ceedee-lamb', playerName: 'CeeDee Lamb', sport: SportType.NFL, stats: { position: 'WR', receivingYards: 1749, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 1 } as NFLPlayerStats },
  { playerId: 'tj-watt', playerName: 'T.J. Watt', sport: SportType.NFL, stats: { position: 'DEF', sacks: 19, tackles: 68, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 1 } as NFLPlayerStats },
  { playerId: 'micah-parsons', playerName: 'Micah Parsons', sport: SportType.NFL, stats: { position: 'DEF', sacks: 14, tackles: 64, isProBowl: true, gamesPlayed: 17, isOnRoster: true, positionRank: 2 } as NFLPlayerStats },
  { playerId: 'backup-qb-1', playerName: 'Backup QB One', sport: SportType.NFL, stats: { position: 'QB', passingYards: 850, isProBowl: false, gamesPlayed: 8, isOnRoster: true, positionRank: 35 } as NFLPlayerStats },
];

const MOCK_MLB_PLAYERS: PlayerTierInput[] = [
  { playerId: 'shohei-ohtani', playerName: 'Shohei Ohtani', sport: SportType.MLB, stats: { ops: 1.036, isAllStar: true } as MLBPlayerStats },
  { playerId: 'mookie-betts', playerName: 'Mookie Betts', sport: SportType.MLB, stats: { ops: 0.906, isAllStar: true } as MLBPlayerStats },
  { playerId: 'ronald-acuna-jr', playerName: 'Ronald Acuna Jr', sport: SportType.MLB, stats: { ops: 1.012, isAllStar: true } as MLBPlayerStats },
  { playerId: 'corey-seager', playerName: 'Corey Seager', sport: SportType.MLB, stats: { ops: 0.854, isAllStar: true } as MLBPlayerStats },
  { playerId: 'solid-hitter-1', playerName: 'Solid Hitter One', sport: SportType.MLB, stats: { ops: 0.765, isAllStar: false } as MLBPlayerStats },
  { playerId: 'average-player-1', playerName: 'Average Player One', sport: SportType.MLB, stats: { ops: 0.680, isAllStar: false } as MLBPlayerStats },
];

const MOCK_NHL_PLAYERS: PlayerTierInput[] = [
  { playerId: 'connor-mcdavid', playerName: 'Connor McDavid', sport: SportType.NHL, stats: { points: 132, isAllStar: true } as NHLPlayerStats },
  { playerId: 'nathan-mackinnon', playerName: 'Nathan MacKinnon', sport: SportType.NHL, stats: { points: 140, isAllStar: true } as NHLPlayerStats },
  { playerId: 'nikita-kucherov', playerName: 'Nikita Kucherov', sport: SportType.NHL, stats: { points: 144, isAllStar: true } as NHLPlayerStats },
  { playerId: 'leon-draisaitl', playerName: 'Leon Draisaitl', sport: SportType.NHL, stats: { points: 106, isAllStar: true } as NHLPlayerStats },
  { playerId: 'solid-scorer-1', playerName: 'Solid Scorer One', sport: SportType.NHL, stats: { points: 55, isAllStar: false } as NHLPlayerStats },
  { playerId: 'role-player-nhl-1', playerName: 'Role Player NHL One', sport: SportType.NHL, stats: { points: 25, isAllStar: false } as NHLPlayerStats },
];

/**
 * Get mock player data for a specific sport (or all sports if none specified).
 */
export function getMockPlayers(sport?: SportType): PlayerTierInput[] {
  if (!sport) {
    return [
      ...MOCK_NBA_PLAYERS,
      ...MOCK_NFL_PLAYERS,
      ...MOCK_MLB_PLAYERS,
      ...MOCK_NHL_PLAYERS,
    ];
  }

  switch (sport) {
    case SportType.NBA:
      return MOCK_NBA_PLAYERS;
    case SportType.NFL:
      return MOCK_NFL_PLAYERS;
    case SportType.MLB:
      return MOCK_MLB_PLAYERS;
    case SportType.NHL:
      return MOCK_NHL_PLAYERS;
    default:
      return [];
  }
}

// ===========================================
// Database Operations
// ===========================================

/**
 * Upsert player tier assignments in batches.
 * Uses Prisma transactions for atomicity.
 *
 * @param assignments - Array of player tier inputs
 * @returns Count of updated records
 */
export async function upsertPlayerTierAssignments(
  assignments: PlayerTierInput[]
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  // Process in batches of 100
  const batchSize = config.playerTiers?.batchSize ?? 100;

  for (let i = 0; i < assignments.length; i += batchSize) {
    const batch = assignments.slice(i, i + batchSize);

    try {
      await prisma.$transaction(async (tx) => {
        for (const input of batch) {
          const tier = derivePlayerTier(input.sport, input.stats);

          await tx.playerTierAssignment.upsert({
            where: {
              playerId_sport: {
                playerId: input.playerId,
                sport: input.sport,
              },
            },
            update: {
              tier,
              playerName: input.playerName,
              stats: input.stats as object,
              updatedAt: new Date(),
            },
            create: {
              playerId: input.playerId,
              playerName: input.playerName,
              sport: input.sport,
              tier,
              stats: input.stats as object,
            },
          });

          updated++;
        }
      });

      logger.debug(`Player tier batch ${Math.floor(i / batchSize) + 1} processed: ${batch.length} players`);
    } catch (error) {
      failed += batch.length;
      logger.error(`Player tier batch ${Math.floor(i / batchSize) + 1} failed:`, error);
    }
  }

  return { updated, failed };
}

/**
 * Get player tier assignment from database.
 */
export async function getPlayerTierAssignment(
  playerId: string,
  sport: SportType
): Promise<{ tier: PickTier; stats: object } | null> {
  const assignment = await prisma.playerTierAssignment.findUnique({
    where: {
      playerId_sport: {
        playerId,
        sport,
      },
    },
    select: {
      tier: true,
      stats: true,
    },
  });

  if (!assignment) {
    return null;
  }

  return {
    tier: assignment.tier,
    stats: assignment.stats as object,
  };
}

/**
 * Get player tier assignment with Redis caching.
 * Falls back to DB on cache miss or Redis failure.
 */
export async function getPlayerTierAssignmentCached(
  playerId: string,
  sport: SportType
): Promise<{ tier: PickTier; stats: object } | null> {
  const cacheKey = PLAYER_TIER_CACHE_KEY(playerId, sport);

  return getOrFetch<{ tier: PickTier; stats: object } | null>(
    cacheKey,
    () => getPlayerTierAssignment(playerId, sport),
    PLAYER_TIER_TTL
  );
}

// ===========================================
// Main Sync Function
// ===========================================

/**
 * Sync player tiers for all sports (or a specific sport).
 * Uses mock data for now, will use real API when available.
 *
 * @param sport - Optional: sync only this sport
 * @returns Sync result summary
 */
export async function syncPlayerTiers(sport?: SportType): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: true,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  logger.info(`Starting player tier sync${sport ? ` for ${sport}` : ' for all sports'}`);

  try {
    // Get players (mock data for now)
    const players = getMockPlayers(sport);
    result.processed = players.length;

    if (players.length === 0) {
      logger.info('No players to sync');
      return result;
    }

    // Log tier distribution before processing
    const tierCounts: Record<string, number> = { ELITE: 0, PREMIUM: 0, STANDARD: 0, FREE: 0 };
    for (const player of players) {
      const tier = derivePlayerTier(player.sport, player.stats);
      tierCounts[tier]++;
    }
    logger.info(`Tier distribution: ${JSON.stringify(tierCounts)}`);

    // Upsert assignments
    const { updated, failed } = await upsertPlayerTierAssignments(players);
    result.updated = updated;
    result.failed = failed;
    result.skipped = result.processed - updated - failed;

    if (failed > 0) {
      result.errors.push(`${failed} players failed to update`);
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Player tier sync complete in ${duration}ms: ` +
      `processed=${result.processed}, updated=${result.updated}, ` +
      `skipped=${result.skipped}, failed=${result.failed}`
    );

    // Invalidate all player tier caches after sync
    await delPattern('tier:player:*');
    logger.info('[PlayerTierService] Player tier cache invalidated');

  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMessage);
    logger.error('Player tier sync failed:', error);
  }

  return result;
}

/**
 * Get tier distribution summary from database.
 */
export async function getPlayerTierDistribution(sport?: SportType): Promise<Record<string, number>> {
  const where = sport ? { sport } : {};

  const counts = await prisma.playerTierAssignment.groupBy({
    by: ['tier'],
    where,
    _count: {
      tier: true,
    },
  });

  const distribution: Record<string, number> = {
    ELITE: 0,
    PREMIUM: 0,
    STANDARD: 0,
    FREE: 0,
  };

  for (const count of counts) {
    distribution[count.tier] = count._count.tier;
  }

  return distribution;
}
