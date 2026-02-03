// =====================================================
// Events Sync Service
// =====================================================
// Handles synchronization of sports events from external
// providers to the database using idempotent upserts.

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { NFLFetcher, NBAFetcher } from './fetchers';
import {
  SportType,
  SportsFetcher,
  NormalizedEvent,
  SportSyncResult,
  FullSyncResult,
  OddsData,
} from './types';

// ===========================================
// Fetcher Registry
// ===========================================

/**
 * Get a fetcher for the given sport type.
 */
function createFetcher(sport: SportType): SportsFetcher | undefined {
  switch (sport) {
    case SportType.NFL:
      return new NFLFetcher();
    case SportType.NBA:
      return new NBAFetcher();
    default:
      return undefined;
  }
}

/**
 * Sports that are currently enabled for syncing.
 * Add more sports here as they become available.
 */
const ENABLED_SPORTS: SportType[] = [SportType.NFL, SportType.NBA];

/**
 * Convert OddsData to a Prisma-compatible JSON value.
 * Prisma expects InputJsonValue which is a plain object.
 */
function toJsonValue(odds: OddsData): object {
  // Parse and stringify to ensure it's a plain JSON object
  return JSON.parse(JSON.stringify(odds)) as object;
}

// ===========================================
// Events Sync Service
// ===========================================

/**
 * Service for syncing sports events from external providers.
 * All operations are idempotent - running twice produces the same result.
 */
export class EventsSyncService {
  private readonly fetchers: Map<SportType, SportsFetcher>;

  constructor() {
    // Initialize fetchers for enabled sports
    this.fetchers = new Map();
    for (const sport of ENABLED_SPORTS) {
      const fetcher = createFetcher(sport);
      if (fetcher) {
        this.fetchers.set(sport, fetcher);
      }
    }

    logger.info(`[EventsSyncService] Initialized with ${this.fetchers.size} sport fetchers`);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Sync events for a specific sport.
   * @param sport The sport type to sync
   * @returns Result containing counts and any errors
   */
  async syncSport(sport: SportType): Promise<SportSyncResult> {
    const startTime = Date.now();
    const result: SportSyncResult = {
      sport,
      success: false,
      eventsProcessed: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      errors: [],
      duration: 0,
    };

    try {
      const fetcher = this.fetchers.get(sport);
      if (!fetcher) {
        result.errors.push(`No fetcher registered for sport: ${sport}`);
        result.duration = Date.now() - startTime;
        return result;
      }

      logger.info(`[EventsSyncService] Starting sync for ${sport}`);

      // Fetch events from provider
      const events = await fetcher.fetchUpcomingEvents();
      result.eventsProcessed = events.length;

      if (events.length === 0) {
        logger.info(`[EventsSyncService] No events found for ${sport}`);
        result.success = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Upsert each event
      for (const event of events) {
        try {
          const upsertResult = await this.upsertEvent(event);
          if (upsertResult === 'created') {
            result.eventsCreated++;
          } else {
            result.eventsUpdated++;
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to upsert event ${event.externalId}: ${errorMessage}`);
          logger.error(`[EventsSyncService] Upsert failed for ${event.externalId}:`, error);
        }
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      logger.info(
        `[EventsSyncService] Completed sync for ${sport}: ` +
          `${result.eventsCreated} created, ${result.eventsUpdated} updated, ` +
          `${result.errors.length} errors in ${result.duration}ms`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Fatal error syncing ${sport}: ${errorMessage}`);
      result.duration = Date.now() - startTime;

      logger.error(`[EventsSyncService] Fatal error syncing ${sport}:`, error);
      return result;
    }
  }

  /**
   * Sync events for all enabled sports.
   * Runs each sport sync sequentially to avoid overwhelming the API.
   * @returns Aggregated results for all sports
   */
  async syncAllSports(): Promise<FullSyncResult> {
    const startTime = Date.now();
    const results: SportSyncResult[] = [];

    logger.info('[EventsSyncService] Starting full sync for all sports');

    for (const sport of ENABLED_SPORTS) {
      try {
        const result = await this.syncSport(sport);
        results.push(result);

        // Small delay between sports to be nice to the API
        if (ENABLED_SPORTS.indexOf(sport) < ENABLED_SPORTS.length - 1) {
          await this.sleep(500);
        }
      } catch (error) {
        logger.error(`[EventsSyncService] Error syncing ${sport}:`, error);
        results.push({
          sport,
          success: false,
          eventsProcessed: 0,
          eventsCreated: 0,
          eventsUpdated: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          duration: 0,
        });
      }
    }

    const fullResult: FullSyncResult = {
      success: results.every((r) => r.success),
      sports: results,
      totalEventsProcessed: results.reduce((sum, r) => sum + r.eventsProcessed, 0),
      totalEventsCreated: results.reduce((sum, r) => sum + r.eventsCreated, 0),
      totalEventsUpdated: results.reduce((sum, r) => sum + r.eventsUpdated, 0),
      totalDuration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    logger.info(
      `[EventsSyncService] Full sync complete: ` +
        `${fullResult.totalEventsProcessed} processed, ` +
        `${fullResult.totalEventsCreated} created, ` +
        `${fullResult.totalEventsUpdated} updated in ${fullResult.totalDuration}ms`
    );

    return fullResult;
  }

  /**
   * Get the list of enabled sports for syncing.
   */
  getEnabledSports(): SportType[] {
    return [...ENABLED_SPORTS];
  }

  /**
   * Check if a specific sport has a configured fetcher.
   */
  isSportConfigured(sport: SportType): boolean {
    const fetcher = this.fetchers.get(sport);
    return fetcher?.isConfigured() ?? false;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Upsert a single event to the database.
   * Uses externalId as the unique identifier.
   * @returns 'created' or 'updated' depending on the operation
   */
  private async upsertEvent(event: NormalizedEvent): Promise<'created' | 'updated'> {
    // Check if event exists
    const existing = await prisma.sportsEvent.findUnique({
      where: { externalId: event.externalId },
      select: { id: true },
    });

    const now = new Date();

    if (existing) {
      // Update existing event
      await prisma.sportsEvent.update({
        where: { externalId: event.externalId },
        data: {
          // Only update fields that may change
          scheduledAt: event.scheduledAt,
          status: event.status,
          homeScore: event.homeScore,
          awayScore: event.awayScore,
          oddsData: toJsonValue(event.oddsData),
          oddsUpdatedAt: now,
          // Team names might get corrected
          homeTeamName: event.homeTeamName,
          homeTeamAbbr: event.homeTeamAbbr,
          awayTeamName: event.awayTeamName,
          awayTeamAbbr: event.awayTeamAbbr,
        },
      });

      logger.debug(`[EventsSyncService] Updated event: ${event.externalId}`);
      return 'updated';
    } else {
      // Create new event
      await prisma.sportsEvent.create({
        data: {
          externalId: event.externalId,
          sport: event.sport,
          league: event.league,
          homeTeamId: event.homeTeamId,
          homeTeamName: event.homeTeamName,
          homeTeamAbbr: event.homeTeamAbbr,
          homeTeamLogo: event.homeTeamLogo,
          awayTeamId: event.awayTeamId,
          awayTeamName: event.awayTeamName,
          awayTeamAbbr: event.awayTeamAbbr,
          awayTeamLogo: event.awayTeamLogo,
          scheduledAt: event.scheduledAt,
          status: event.status,
          homeScore: event.homeScore,
          awayScore: event.awayScore,
          oddsData: toJsonValue(event.oddsData),
          oddsUpdatedAt: now,
        },
      });

      logger.debug(`[EventsSyncService] Created event: ${event.externalId}`);
      return 'created';
    }
  }

  /**
   * Helper to sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let serviceInstance: EventsSyncService | null = null;

/**
 * Get the singleton EventsSyncService instance.
 */
export function getEventsSyncService(): EventsSyncService {
  if (!serviceInstance) {
    serviceInstance = new EventsSyncService();
  }
  return serviceInstance;
}
