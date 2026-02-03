// =====================================================
// Live Scores Processor
// =====================================================
// Core business logic for processing live score updates.
// Validates scores, updates database, and triggers broadcasts.

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { EventStatus, MatchStatus } from '@prisma/client';
import {
  NormalizedScoreUpdate,
  ScoreValidationResult,
  ScoreProcessingResult,
  BatchProcessingResult,
  SPORT_SCORING_RULES,
} from './types';
import { broadcastScoreUpdate, broadcastStatusChange } from './live-scores.broadcaster';
import { queueSettlementCheck } from '../../queues/game-settlement.queue';

// ===========================================
// Idempotency Cache (In-Memory)
// ===========================================

// Simple in-memory cache for idempotency keys
// In production, consider using Redis for distributed systems
const processedKeys = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if an idempotency key has been processed recently.
 */
function isAlreadyProcessed(idempotencyKey: string): boolean {
  const timestamp = processedKeys.get(idempotencyKey);
  if (!timestamp) return false;

  // Check if still within TTL
  if (Date.now() - timestamp < IDEMPOTENCY_TTL_MS) {
    return true;
  }

  // Expired, remove from cache
  processedKeys.delete(idempotencyKey);
  return false;
}

/**
 * Mark an idempotency key as processed.
 */
function markAsProcessed(idempotencyKey: string): void {
  processedKeys.set(idempotencyKey, Date.now());

  // Cleanup old entries periodically (every 100 new entries)
  if (processedKeys.size > 0 && processedKeys.size % 100 === 0) {
    cleanupExpiredKeys();
  }
}

/**
 * Remove expired idempotency keys from cache.
 */
function cleanupExpiredKeys(): void {
  const now = Date.now();
  for (const [key, timestamp] of processedKeys) {
    if (now - timestamp >= IDEMPOTENCY_TTL_MS) {
      processedKeys.delete(key);
    }
  }
}

// ===========================================
// Score Validation
// ===========================================

/**
 * Validate a score change against sport-specific rules.
 */
export function validateScoreChange(
  sport: string,
  previousHome: number | null | undefined,
  previousAway: number | null | undefined,
  newHome: number,
  newAway: number
): ScoreValidationResult {
  const rules = SPORT_SCORING_RULES[sport as keyof typeof SPORT_SCORING_RULES];

  if (!rules) {
    // Unknown sport, allow but warn
    return {
      valid: true,
      warning: `Unknown sport: ${sport}, skipping validation`,
    };
  }

  // Check for score decrease (not allowed in most sports)
  if (!rules.canScoreDecrease) {
    if (previousHome !== null && previousHome !== undefined && newHome < previousHome) {
      return {
        valid: false,
        error: `Home score decreased from ${previousHome} to ${newHome} (not allowed for ${sport})`,
      };
    }
    if (previousAway !== null && previousAway !== undefined && newAway < previousAway) {
      return {
        valid: false,
        error: `Away score decreased from ${previousAway} to ${newAway} (not allowed for ${sport})`,
      };
    }
  }

  // Check for unrealistic score jumps (only if we have previous scores)
  if (previousHome !== null && previousHome !== undefined &&
      previousAway !== null && previousAway !== undefined) {
    const homeIncrement = newHome - previousHome;
    const awayIncrement = newAway - previousAway;

    // Both teams scoring simultaneously is unusual
    if (homeIncrement > 0 && awayIncrement > 0) {
      return {
        valid: true,
        warning: `Both teams scored simultaneously: home +${homeIncrement}, away +${awayIncrement}`,
      };
    }

    // Check valid increments
    const increment = homeIncrement || awayIncrement;
    if (increment > 0 && !rules.validIncrements.includes(increment)) {
      // Allow but warn for unusual increments
      return {
        valid: true,
        warning: `Unusual score increment: ${increment} for ${sport} (expected: ${rules.validIncrements.join(', ')})`,
      };
    }

    // Check for excessive single-play scoring
    if (increment > rules.maxScorePerPlay * 2) {
      return {
        valid: true,
        warning: `Large score jump: ${increment} points (max per play: ${rules.maxScorePerPlay})`,
      };
    }
  }

  // Sanity check on total score
  if (newHome > rules.maxTotalScore) {
    return {
      valid: false,
      error: `Home score ${newHome} exceeds maximum ${rules.maxTotalScore} for ${sport}`,
    };
  }
  if (newAway > rules.maxTotalScore) {
    return {
      valid: false,
      error: `Away score ${newAway} exceeds maximum ${rules.maxTotalScore} for ${sport}`,
    };
  }

  return { valid: true };
}

// ===========================================
// Core Processing Logic
// ===========================================

/**
 * Process a single score update.
 * This is the main entry point for score processing.
 */
export async function processScoreUpdate(
  update: NormalizedScoreUpdate
): Promise<ScoreProcessingResult> {
  const { externalEventId, idempotencyKey } = update;

  // 1. Check idempotency
  if (isAlreadyProcessed(idempotencyKey)) {
    logger.debug(`[LiveScores] Skipping duplicate update: ${idempotencyKey}`);
    return {
      success: true,
      eventId: update.eventId || '',
      externalEventId,
      updated: false,
      scoreChanged: false,
      statusChanged: false,
      affectedMatchIds: [],
    };
  }

  try {
    // 2. Find event by external ID
    const event = await prisma.sportsEvent.findUnique({
      where: { externalId: externalEventId },
      select: {
        id: true,
        sport: true,
        homeScore: true,
        awayScore: true,
        status: true,
        externalId: true,
      },
    });

    if (!event) {
      logger.warn(`[LiveScores] Event not found: ${externalEventId}`);
      return {
        success: false,
        eventId: '',
        externalEventId,
        updated: false,
        scoreChanged: false,
        statusChanged: false,
        affectedMatchIds: [],
        error: `Event not found: ${externalEventId}`,
      };
    }

    // 3. Validate score change
    const validation = validateScoreChange(
      event.sport,
      event.homeScore,
      event.awayScore,
      update.homeScore,
      update.awayScore
    );

    if (!validation.valid) {
      logger.warn(`[LiveScores] Invalid score update for ${externalEventId}: ${validation.error}`);
      return {
        success: false,
        eventId: event.id,
        externalEventId,
        updated: false,
        scoreChanged: false,
        statusChanged: false,
        affectedMatchIds: [],
        error: validation.error,
      };
    }

    if (validation.warning) {
      logger.warn(`[LiveScores] Score update warning for ${externalEventId}: ${validation.warning}`);
    }

    // 4. Check if anything actually changed
    const scoreChanged =
      event.homeScore !== update.homeScore || event.awayScore !== update.awayScore;
    const statusChanged = event.status !== update.status;

    if (!scoreChanged && !statusChanged) {
      // No change, mark as processed and skip
      markAsProcessed(idempotencyKey);
      return {
        success: true,
        eventId: event.id,
        externalEventId,
        updated: false,
        scoreChanged: false,
        statusChanged: false,
        affectedMatchIds: [],
      };
    }

    // 5. Update the event in the database
    const now = new Date();
    const updateData: Record<string, unknown> = {
      homeScore: update.homeScore,
      awayScore: update.awayScore,
      status: update.status,
      updatedAt: now,
    };

    // Set startedAt when transitioning to LIVE
    if (statusChanged && update.status === EventStatus.LIVE && event.status === EventStatus.SCHEDULED) {
      updateData.startedAt = now;
    }

    // Set endedAt when transitioning to COMPLETED
    if (statusChanged && update.status === EventStatus.COMPLETED && event.status !== EventStatus.COMPLETED) {
      updateData.endedAt = now;
    }

    await prisma.sportsEvent.update({
      where: { id: event.id },
      data: updateData,
    });

    // 6. Find affected matches (through picks -> slips -> matches)
    const affectedMatchIds = await findAffectedMatches(event.id);

    // 7. Broadcast updates
    if (scoreChanged) {
      broadcastScoreUpdate({
        eventId: event.id,
        externalId: event.externalId,
        homeScore: update.homeScore,
        awayScore: update.awayScore,
        previousHomeScore: event.homeScore,
        previousAwayScore: event.awayScore,
        gameTime: update.gameTime,
        timestamp: now.toISOString(),
      }, affectedMatchIds);
    }

    if (statusChanged) {
      broadcastStatusChange({
        eventId: event.id,
        externalId: event.externalId,
        status: update.status,
        previousStatus: event.status,
        startedAt: update.status === EventStatus.LIVE ? now.toISOString() : undefined,
        endedAt: update.status === EventStatus.COMPLETED ? now.toISOString() : undefined,
        finalScore: update.status === EventStatus.COMPLETED
          ? { homeScore: update.homeScore, awayScore: update.awayScore }
          : undefined,
        timestamp: now.toISOString(),
      }, affectedMatchIds);

      // 7a. Transition matches to 'active' when first event starts
      if (update.status === EventStatus.LIVE) {
        await transitionMatchesToActive(affectedMatchIds);
      }

      // 7b. Queue settlement checks when event completes
      if (update.status === EventStatus.COMPLETED) {
        await queueSettlementChecksForMatches(event.id, affectedMatchIds);
      }
    }

    // 8. Mark idempotency key as processed
    markAsProcessed(idempotencyKey);

    logger.info(`[LiveScores] Processed update for ${externalEventId}`, {
      scoreChanged,
      statusChanged,
      affectedMatches: affectedMatchIds.length,
    });

    return {
      success: true,
      eventId: event.id,
      externalEventId,
      updated: true,
      scoreChanged,
      statusChanged,
      affectedMatchIds,
    };
  } catch (error) {
    logger.error(`[LiveScores] Error processing update for ${externalEventId}:`, error);
    return {
      success: false,
      eventId: update.eventId || '',
      externalEventId,
      updated: false,
      scoreChanged: false,
      statusChanged: false,
      affectedMatchIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process a batch of score updates.
 */
export async function processBatchUpdates(
  updates: NormalizedScoreUpdate[]
): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const results: ScoreProcessingResult[] = [];

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const allAffectedMatchIds = new Set<string>();

  for (const update of updates) {
    const result = await processScoreUpdate(update);
    results.push(result);

    if (result.success) {
      if (result.updated) {
        updatedCount++;
        result.affectedMatchIds.forEach((id) => allAffectedMatchIds.add(id));
      } else {
        skippedCount++;
      }
    } else {
      failedCount++;
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info(`[LiveScores] Batch processing completed`, {
    total: updates.length,
    updated: updatedCount,
    skipped: skippedCount,
    failed: failedCount,
    durationMs,
  });

  return {
    success: failedCount === 0,
    totalReceived: updates.length,
    updatedCount,
    skippedCount,
    failedCount,
    broadcastCount: allAffectedMatchIds.size,
    results,
    durationMs,
  };
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Find all matches affected by an event score update.
 * Traces: Event -> SlipPicks -> Slips -> Matches
 */
async function findAffectedMatches(eventId: string): Promise<string[]> {
  try {
    // Find all picks for this event that are part of active/locked matches
    const picks = await prisma.slipPick.findMany({
      where: { sportsEventId: eventId },
      select: {
        slip: {
          select: {
            creatorMatch: {
              select: {
                id: true,
                status: true,
              },
            },
            opponentMatch: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const matchIds = new Set<string>();

    // Only include active/locked matches (not settled, cancelled, etc.)
    const relevantStatuses: MatchStatus[] = [
      MatchStatus.locked,
      MatchStatus.active,
      MatchStatus.matched,
    ];

    for (const pick of picks) {
      const creatorMatch = pick.slip.creatorMatch;
      const opponentMatch = pick.slip.opponentMatch;

      if (creatorMatch && relevantStatuses.includes(creatorMatch.status)) {
        matchIds.add(creatorMatch.id);
      }
      if (opponentMatch && relevantStatuses.includes(opponentMatch.status)) {
        matchIds.add(opponentMatch.id);
      }
    }

    return Array.from(matchIds);
  } catch (error) {
    logger.error(`[LiveScores] Error finding affected matches for event ${eventId}:`, error);
    return [];
  }
}

/**
 * Get the current score for an event by external ID.
 */
export async function getEventScore(
  externalEventId: string
): Promise<{ homeScore: number | null; awayScore: number | null; status: EventStatus } | null> {
  const event = await prisma.sportsEvent.findUnique({
    where: { externalId: externalEventId },
    select: {
      homeScore: true,
      awayScore: true,
      status: true,
    },
  });

  return event;
}

/**
 * Get all live events for a sport.
 */
export async function getLiveEvents(sport?: string): Promise<
  Array<{
    id: string;
    externalId: string;
    sport: string;
    homeTeamName: string;
    awayTeamName: string;
    homeScore: number | null;
    awayScore: number | null;
    status: EventStatus;
  }>
> {
  const where: Record<string, unknown> = {
    status: EventStatus.LIVE,
  };

  if (sport) {
    where.sport = sport;
  }

  return prisma.sportsEvent.findMany({
    where,
    select: {
      id: true,
      externalId: true,
      sport: true,
      homeTeamName: true,
      awayTeamName: true,
      homeScore: true,
      awayScore: true,
      status: true,
    },
    orderBy: {
      startedAt: 'desc',
    },
  });
}

// ===========================================
// Settlement Integration
// ===========================================

/**
 * Transition matches from 'locked' to 'active' when first event starts.
 * This is required before settlement can proceed (settlement requires 'active' status).
 *
 * @param matchIds - Array of match IDs that may need status transition
 */
async function transitionMatchesToActive(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;

  try {
    // Only update matches that are currently in 'locked' status
    const result = await prisma.match.updateMany({
      where: {
        id: { in: matchIds },
        status: MatchStatus.locked,
      },
      data: {
        status: MatchStatus.active,
        startedAt: new Date(),
      },
    });

    if (result.count > 0) {
      logger.info(`[LiveScores] Transitioned ${result.count} matches to active status`, {
        matchIds: matchIds.slice(0, 5), // Log first 5 for debugging
      });
    }
  } catch (error) {
    // Don't fail the score update if status transition fails
    logger.error('[LiveScores] Failed to transition matches to active:', error);
  }
}

/**
 * Queue settlement checks for all active matches affected by a completed event.
 * Only queues for matches in 'active' status (settlement-eligible).
 *
 * @param eventId - The event that completed
 * @param matchIds - Array of match IDs that may be affected
 */
async function queueSettlementChecksForMatches(
  eventId: string,
  matchIds: string[]
): Promise<void> {
  if (matchIds.length === 0) return;

  try {
    // Filter to only active matches (settlement-eligible)
    const activeMatches = await prisma.match.findMany({
      where: {
        id: { in: matchIds },
        status: MatchStatus.active,
      },
      select: { id: true },
    });

    if (activeMatches.length === 0) {
      logger.debug('[LiveScores] No active matches to check for settlement');
      return;
    }

    // Queue settlement check for each active match
    for (const match of activeMatches) {
      try {
        await queueSettlementCheck(match.id, eventId, 'event-completed');
        logger.debug(`[LiveScores] Queued settlement check for match ${match.id}`);
      } catch (error) {
        // Don't fail the entire process if one queue operation fails
        logger.error(`[LiveScores] Failed to queue settlement check for match ${match.id}:`, error);
      }
    }

    logger.info(`[LiveScores] Queued settlement checks for ${activeMatches.length} matches`, {
      eventId,
      matchCount: activeMatches.length,
    });
  } catch (error) {
    // Don't fail the score update if settlement queueing fails
    logger.error('[LiveScores] Failed to queue settlement checks:', error);
  }
}
