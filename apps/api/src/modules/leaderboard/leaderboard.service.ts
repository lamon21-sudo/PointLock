// =====================================================
// Leaderboard Service
// =====================================================
// Business logic for leaderboard queries and updates.
// Handles both global (all-time) and weekly leaderboards.

import { Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';
import {
  LeaderboardQuery,
  LeaderboardEntryResponse,
  PaginatedLeaderboard,
} from './leaderboard.schemas';

// ===========================================
// Constants
// ===========================================

export const GLOBAL_LEADERBOARD_SLUG = 'global-all-time';
export const WEEKLY_LEADERBOARD_SLUG_PREFIX = 'weekly-';

// ===========================================
// Helper Functions
// ===========================================

/**
 * Converts Prisma Decimal to number safely.
 */
function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value.toString());
}

/**
 * Get the start of the current week (Monday 00:00:00 UTC).
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay();
  // Sunday = 0, Monday = 1, ..., Saturday = 6
  // We want Monday as start, so if Sunday (0), go back 6 days
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysToSubtract);
  return d;
}

/**
 * Get the end of the current week (Sunday 23:59:59.999 UTC).
 */
export function getWeekEnd(date: Date = new Date()): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Get ISO week number for a date.
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Generate slug for a weekly leaderboard.
 * Format: weekly-2026-W04
 */
export function generateWeeklySlug(weekStart: Date): string {
  const year = weekStart.getUTCFullYear();
  const weekNum = getISOWeekNumber(weekStart);
  return `${WEEKLY_LEADERBOARD_SLUG_PREFIX}${year}-W${weekNum.toString().padStart(2, '0')}`;
}

// ===========================================
// Raw Query Result Types
// ===========================================

interface RawLeaderboardEntry {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  score: Prisma.Decimal;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
  win_rate: Prisma.Decimal;
  current_streak: number;
  previous_rank: number | null;
  dynamic_rank: bigint;
}

// ===========================================
// Query Functions
// ===========================================

/**
 * Get global all-time leaderboard with pagination.
 * Ranks are calculated dynamically using window functions.
 */
export async function getGlobalLeaderboard(
  query: LeaderboardQuery
): Promise<PaginatedLeaderboard> {
  const { page, limit } = query;
  const offset = (page - 1) * limit;

  // Find the global leaderboard
  const leaderboard = await prisma.leaderboard.findUnique({
    where: { slug: GLOBAL_LEADERBOARD_SLUG },
  });

  if (!leaderboard) {
    throw new NotFoundError(
      'Global leaderboard not found. Please contact support.',
      ERROR_CODES.INTERNAL_ERROR
    );
  }

  // Get total count for pagination
  const total = await prisma.leaderboardEntry.count({
    where: { leaderboardId: leaderboard.id },
  });

  // Query entries with dynamic rank calculation
  // ORDER BY: score DESC, winRate DESC, matchesPlayed DESC (tiebreakers)
  const entries = await prisma.$queryRaw<RawLeaderboardEntry[]>`
    SELECT
      le.id,
      le.user_id,
      u.username,
      u.avatar_url,
      le.score,
      le.wins,
      le.losses,
      le.draws,
      le.matches_played,
      le.win_rate,
      le.current_streak,
      le.previous_rank,
      ROW_NUMBER() OVER (
        ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
      ) as dynamic_rank
    FROM leaderboard_entries le
    JOIN users u ON le.user_id = u.id
    WHERE le.leaderboard_id = ${leaderboard.id}
    ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const transformedEntries = transformEntries(entries);
  const totalPages = Math.ceil(total / limit);

  return {
    leaderboard: {
      id: leaderboard.id,
      name: leaderboard.name,
      timeframe: 'GLOBAL',
      periodStart: null,
      periodEnd: null,
      entries: transformedEntries,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get current weekly leaderboard with pagination.
 */
export async function getWeeklyLeaderboard(
  query: LeaderboardQuery
): Promise<PaginatedLeaderboard> {
  const { page, limit } = query;
  const offset = (page - 1) * limit;

  const weekStart = getWeekStart();
  const slug = generateWeeklySlug(weekStart);

  // Find or create current weekly leaderboard
  let leaderboard = await prisma.leaderboard.findUnique({
    where: { slug },
  });

  if (!leaderboard) {
    // Create it on-demand if cron hasn't run yet
    leaderboard = await createWeeklyLeaderboard(weekStart);
  }

  // Get total count
  const total = await prisma.leaderboardEntry.count({
    where: { leaderboardId: leaderboard.id },
  });

  // Query with dynamic ranking (same tiebreaker logic)
  const entries = await prisma.$queryRaw<RawLeaderboardEntry[]>`
    SELECT
      le.id,
      le.user_id,
      u.username,
      u.avatar_url,
      le.score,
      le.wins,
      le.losses,
      le.draws,
      le.matches_played,
      le.win_rate,
      le.current_streak,
      le.previous_rank,
      ROW_NUMBER() OVER (
        ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
      ) as dynamic_rank
    FROM leaderboard_entries le
    JOIN users u ON le.user_id = u.id
    WHERE le.leaderboard_id = ${leaderboard.id}
    ORDER BY le.score DESC, le.win_rate DESC, le.matches_played DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const transformedEntries = transformEntries(entries);
  const totalPages = Math.ceil(total / limit);

  return {
    leaderboard: {
      id: leaderboard.id,
      name: leaderboard.name,
      timeframe: 'WEEKLY',
      periodStart: leaderboard.periodStart?.toISOString() ?? null,
      periodEnd: leaderboard.periodEnd?.toISOString() ?? null,
      entries: transformedEntries,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Transform raw query results to response format.
 */
function transformEntries(entries: RawLeaderboardEntry[]): LeaderboardEntryResponse[] {
  return entries.map((entry) => {
    const rank = Number(entry.dynamic_rank);
    const previousRank = entry.previous_rank;
    // Positive rankChange = improved (went from 5 to 3 = +2)
    // Negative rankChange = dropped (went from 3 to 5 = -2)
    const rankChange = previousRank !== null ? previousRank - rank : null;

    return {
      rank,
      previousRank,
      rankChange,
      userId: entry.user_id,
      username: entry.username,
      avatarUrl: entry.avatar_url,
      score: decimalToNumber(entry.score),
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      matchesPlayed: entry.matches_played,
      winRate: decimalToNumber(entry.win_rate),
      currentStreak: entry.current_streak,
    };
  });
}

// ===========================================
// Leaderboard Creation Functions
// ===========================================

/**
 * Create a weekly leaderboard record.
 */
async function createWeeklyLeaderboard(weekStart: Date) {
  const weekEnd = getWeekEnd(weekStart);
  const slug = generateWeeklySlug(weekStart);
  const weekNum = getISOWeekNumber(weekStart);

  return prisma.leaderboard.create({
    data: {
      name: `Weekly Leaderboard - Week ${weekNum}, ${weekStart.getUTCFullYear()}`,
      slug,
      timeframe: 'WEEKLY',
      status: 'active',
      periodStart: weekStart,
      periodEnd: weekEnd,
    },
  });
}

// ===========================================
// Leaderboard Entry Update Functions
// ===========================================

/**
 * Updates leaderboard entries for both players after a match settlement.
 * MUST be called within the settlement transaction for atomicity.
 *
 * @param tx - Prisma transaction client
 * @param creatorId - Creator user ID
 * @param opponentId - Opponent user ID
 * @param winnerId - Winner user ID (null if draw)
 * @param isDraw - Whether match was a draw
 * @param creatorPoints - Points earned by creator
 * @param opponentPoints - Points earned by opponent
 */
export async function updateLeaderboardEntries(
  tx: PrismaTransactionClient,
  creatorId: string,
  opponentId: string,
  winnerId: string | null,
  isDraw: boolean,
  creatorPoints: number,
  opponentPoints: number
): Promise<void> {
  // Get global leaderboard
  const globalLeaderboard = await tx.leaderboard.findUnique({
    where: { slug: GLOBAL_LEADERBOARD_SLUG },
  });

  // Get or create weekly leaderboard
  const weekStart = getWeekStart();
  const weeklySlug = generateWeeklySlug(weekStart);
  let weeklyLeaderboard = await tx.leaderboard.findUnique({
    where: { slug: weeklySlug },
  });

  // Create weekly if it doesn't exist
  if (!weeklyLeaderboard) {
    const weekEnd = getWeekEnd(weekStart);
    const weekNum = getISOWeekNumber(weekStart);
    weeklyLeaderboard = await tx.leaderboard.create({
      data: {
        name: `Weekly Leaderboard - Week ${weekNum}, ${weekStart.getUTCFullYear()}`,
        slug: weeklySlug,
        timeframe: 'WEEKLY',
        status: 'active',
        periodStart: weekStart,
        periodEnd: weekEnd,
      },
    });
    logger.info(`[Leaderboard] Created weekly leaderboard during settlement: ${weeklySlug}`);
  }

  if (!globalLeaderboard) {
    logger.error('[Leaderboard] Global leaderboard not found during settlement!');
    // Don't fail settlement, but log the error for investigation
    return;
  }

  // Update entries for both leaderboards
  const leaderboardIds = [globalLeaderboard.id, weeklyLeaderboard.id];

  for (const leaderboardId of leaderboardIds) {
    await updateUserEntry(tx, leaderboardId, creatorId, winnerId, isDraw, creatorPoints);
    await updateUserEntry(tx, leaderboardId, opponentId, winnerId, isDraw, opponentPoints);
  }

  // Update entry counts and lastCalculatedAt on leaderboards
  for (const leaderboardId of leaderboardIds) {
    const count = await tx.leaderboardEntry.count({ where: { leaderboardId } });
    await tx.leaderboard.update({
      where: { id: leaderboardId },
      data: {
        entryCount: count,
        lastCalculatedAt: new Date(),
      },
    });
  }

  logger.info(
    `[Leaderboard] Updated entries for users ${creatorId} and ${opponentId} ` +
      `(winner: ${winnerId ?? 'draw'}, creator: ${creatorPoints}pts, opponent: ${opponentPoints}pts)`
  );
}

/**
 * Update or create a user's leaderboard entry.
 */
async function updateUserEntry(
  tx: PrismaTransactionClient,
  leaderboardId: string,
  userId: string,
  winnerId: string | null,
  isDraw: boolean,
  pointsEarned: number
): Promise<void> {
  const isWinner = winnerId === userId;
  const isLoser = !isDraw && winnerId !== null && winnerId !== userId;

  // Find existing entry
  const existing = await tx.leaderboardEntry.findUnique({
    where: {
      leaderboardId_userId: { leaderboardId, userId },
    },
  });

  if (existing) {
    // Calculate new values
    const newWins = existing.wins + (isWinner ? 1 : 0);
    const newLosses = existing.losses + (isLoser ? 1 : 0);
    const newDraws = existing.draws + (isDraw ? 1 : 0);
    const newMatchesPlayed = existing.matchesPlayed + 1;
    const newScore = decimalToNumber(existing.score) + pointsEarned;

    // Win rate: wins / matchesPlayed (draws count toward matchesPlayed)
    const newWinRate = newMatchesPlayed > 0 ? newWins / newMatchesPlayed : 0;

    // Streak calculation
    let newCurrentStreak = existing.currentStreak;
    let newBestStreak = existing.bestStreak;

    if (isWinner) {
      // Winning extends positive streak or starts new one
      newCurrentStreak = newCurrentStreak >= 0 ? newCurrentStreak + 1 : 1;
      newBestStreak = Math.max(newBestStreak, newCurrentStreak);
    } else if (isLoser) {
      // Loss resets streak to 0
      newCurrentStreak = 0;
    }
    // Draw: streak unchanged

    await tx.leaderboardEntry.update({
      where: { id: existing.id },
      data: {
        score: newScore,
        wins: newWins,
        losses: newLosses,
        draws: newDraws,
        matchesPlayed: newMatchesPlayed,
        winRate: newWinRate,
        currentStreak: newCurrentStreak,
        bestStreak: newBestStreak,
        lastMatchAt: new Date(),
      },
    });
  } else {
    // Create new entry
    const wins = isWinner ? 1 : 0;
    const losses = isLoser ? 1 : 0;
    const draws = isDraw ? 1 : 0;
    const matchesPlayed = 1;
    const winRate = wins / matchesPlayed; // 1.0 or 0.0 for first match
    const currentStreak = isWinner ? 1 : 0;

    await tx.leaderboardEntry.create({
      data: {
        leaderboardId,
        userId,
        rank: 0, // Will be calculated dynamically on query
        score: pointsEarned,
        wins,
        losses,
        draws,
        matchesPlayed,
        winRate,
        currentStreak,
        bestStreak: currentStreak,
        lastMatchAt: new Date(),
      },
    });
  }
}
