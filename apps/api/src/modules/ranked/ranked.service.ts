import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../utils/errors';
import { PLACEMENT_MATCHES_REQUIRED } from '@pick-rivals/shared-types';
import type { PlacementStatus, RankedProgress, Rank } from '@pick-rivals/shared-types';

// ===========================================
// Rank Thresholds (must match ranked.service.ts)
// ===========================================
const RANK_THRESHOLDS: Record<string, number> = {
  BRONZE_1: 0,
  BRONZE_2: 100,
  BRONZE_3: 200,
  SILVER_1: 300,
  SILVER_2: 400,
  SILVER_3: 500,
  GOLD_1: 600,
  GOLD_2: 700,
  GOLD_3: 800,
  PLATINUM_1: 900,
  PLATINUM_2: 1000,
  PLATINUM_3: 1100,
  DIAMOND_1: 1200,
  DIAMOND_2: 1400,
  DIAMOND_3: 1600,
};

const RANK_ORDER = [
  'BRONZE_1',
  'BRONZE_2',
  'BRONZE_3',
  'SILVER_1',
  'SILVER_2',
  'SILVER_3',
  'GOLD_1',
  'GOLD_2',
  'GOLD_3',
  'PLATINUM_1',
  'PLATINUM_2',
  'PLATINUM_3',
  'DIAMOND_1',
  'DIAMOND_2',
  'DIAMOND_3',
];

// ===========================================
// Helper Functions
// ===========================================

function getNextRankThreshold(currentRank: string | null): number {
  if (!currentRank) return RANK_THRESHOLDS.BRONZE_2;
  const currentIndex = RANK_ORDER.indexOf(currentRank);
  if (currentIndex === -1 || currentIndex >= RANK_ORDER.length - 1) return 0;
  return RANK_THRESHOLDS[RANK_ORDER[currentIndex + 1]];
}

function getPrevRankThreshold(currentRank: string | null): number {
  if (!currentRank) return 0;
  const currentIndex = RANK_ORDER.indexOf(currentRank);
  if (currentIndex <= 0) return 0;
  return RANK_THRESHOLDS[RANK_ORDER[currentIndex - 1]];
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Get placement match status and history for a user in a season.
 * Returns full audit trail of placement matches.
 *
 * @param userId - The user ID
 * @param seasonId - The season ID
 * @returns PlacementStatus with match history
 * @throws NotFoundError if user has not participated in this season
 */
export async function getPlacementStatus(
  userId: string,
  seasonId: string
): Promise<PlacementStatus> {
  const entry = await prisma.seasonEntry.findUnique({
    where: { userId_seasonId: { userId, seasonId } },
    include: {
      placementMatches: {
        orderBy: { matchNumber: 'asc' },
      },
    },
  });

  if (!entry) {
    throw new NotFoundError('Season entry not found. User has not participated in this season.');
  }

  return {
    seasonId,
    isPlaced: entry.isPlaced,
    placementMatchesPlayed: entry.placementMatchesPlayed,
    placementMatchesRemaining: Math.max(
      0,
      PLACEMENT_MATCHES_REQUIRED - entry.placementMatchesPlayed
    ),
    placementMatchesWon: entry.placementMatchesWon,
    currentRank: entry.currentRank as Rank | null,
    initialRank: entry.initialRank as Rank | null,
    placedAt: entry.placedAt?.toISOString() ?? null,
    rankPoints: entry.rankPoints,
    matches: entry.placementMatches.map((pm) => ({
      matchNumber: pm.matchNumber,
      matchId: pm.matchId,
      outcome: pm.outcome as 'WIN' | 'LOSS' | 'DRAW',
      processedAt: pm.processedAt.toISOString(),
      rankAssigned: pm.rankAssigned as Rank | null,
    })),
  };
}

/**
 * Get ranked progression stats for a user in a season.
 * Returns win/loss record, rank, and RP progression info.
 *
 * @param userId - The user ID
 * @param seasonId - The season ID
 * @returns RankedProgress with stats and progression
 * @throws NotFoundError if user has not participated in this season
 */
export async function getRankedProgress(
  userId: string,
  seasonId: string
): Promise<RankedProgress> {
  const entry = await prisma.seasonEntry.findUnique({
    where: { userId_seasonId: { userId, seasonId } },
  });

  if (!entry) {
    throw new NotFoundError('Season entry not found. User has not participated in this season.');
  }

  const nextThreshold = getNextRankThreshold(entry.currentRank);
  const prevThreshold = getPrevRankThreshold(entry.currentRank);
  const matchesPlayed = entry.wins + entry.losses + entry.draws;
  const winRate = matchesPlayed > 0 ? entry.wins / matchesPlayed : 0;

  return {
    seasonId,
    isPlaced: entry.isPlaced,
    currentRank: entry.currentRank as Rank | null,
    highestRank: entry.highestRank as Rank | null,
    rankPoints: entry.rankPoints,
    rpToNextRank: nextThreshold > 0 ? nextThreshold - entry.rankPoints : 0,
    rpFromDemotion: entry.rankPoints - prevThreshold,
    wins: entry.wins,
    losses: entry.losses,
    draws: entry.draws,
    winRate: Math.round(winRate * 100) / 100,
  };
}
