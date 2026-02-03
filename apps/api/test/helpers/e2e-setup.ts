// =====================================================
// E2E Test Setup
// =====================================================
// Global setup for end-to-end tests.
// Extends integration setup with test data fixtures needed for E2E flows.
//
// CRITICAL: This file runs ONCE per E2E test suite execution.
// Individual test files should handle per-test cleanup.

import { setup as integrationSetup, teardown as integrationTeardown } from './integration-setup';
import { getTestPrisma } from './db.helper';
import { logger } from '../../src/utils/logger';
import { SportType, EventStatus } from '@prisma/client';

// ===========================================
// Test Data Fixtures
// ===========================================

/**
 * Creates test sports events needed for picks.
 * These events are shared across E2E tests and are NOT cleaned up between tests.
 * They represent a stable set of pickable events for all test scenarios.
 *
 * Returns event IDs for use in test slips.
 */
async function createTestEvents(): Promise<string[]> {
  const prisma = getTestPrisma();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  logger.info('[E2E Setup] Creating test sports events...');

  const events = await Promise.all([
    // Event 1: NFL scheduled game
    prisma.sportsEvent.create({
      data: {
        externalId: 'test-nfl-001',
        sport: SportType.NFL,
        league: 'NFL',
        homeTeamId: 'team-chiefs',
        homeTeamName: 'Kansas City Chiefs',
        homeTeamAbbr: 'KC',
        awayTeamId: 'team-bills',
        awayTeamName: 'Buffalo Bills',
        awayTeamAbbr: 'BUF',
        scheduledAt: tomorrow,
        status: EventStatus.SCHEDULED,
        homeScore: null,
        awayScore: null,
        oddsData: {
          provider: 'test-provider',
          lastUpdated: now.toISOString(),
          markets: {
            moneyline: { home: -150, away: 130 },
            spread: { home: -3.5, away: 3.5, homeOdds: -110, awayOdds: -110 },
            totals: { value: 47.5, overOdds: -110, underOdds: -110 },
          },
        },
      },
    }),

    // Event 2: NBA scheduled game
    prisma.sportsEvent.create({
      data: {
        externalId: 'test-nba-001',
        sport: SportType.NBA,
        league: 'NBA',
        homeTeamId: 'team-lakers',
        homeTeamName: 'Los Angeles Lakers',
        homeTeamAbbr: 'LAL',
        awayTeamId: 'team-celtics',
        awayTeamName: 'Boston Celtics',
        awayTeamAbbr: 'BOS',
        scheduledAt: tomorrow,
        status: EventStatus.SCHEDULED,
        homeScore: null,
        awayScore: null,
        oddsData: {
          provider: 'test-provider',
          lastUpdated: now.toISOString(),
          markets: {
            moneyline: { home: -200, away: 170 },
            spread: { home: -5.5, away: 5.5, homeOdds: -110, awayOdds: -110 },
            totals: { value: 220.5, overOdds: -110, underOdds: -110 },
          },
        },
      },
    }),

    // Event 3: MLB scheduled game
    prisma.sportsEvent.create({
      data: {
        externalId: 'test-mlb-001',
        sport: SportType.MLB,
        league: 'MLB',
        homeTeamId: 'team-yankees',
        homeTeamName: 'New York Yankees',
        homeTeamAbbr: 'NYY',
        awayTeamId: 'team-dodgers',
        awayTeamName: 'Los Angeles Dodgers',
        awayTeamAbbr: 'LAD',
        scheduledAt: tomorrow,
        status: EventStatus.SCHEDULED,
        homeScore: null,
        awayScore: null,
        oddsData: {
          provider: 'test-provider',
          lastUpdated: now.toISOString(),
          markets: {
            moneyline: { home: 120, away: -140 },
            spread: { home: 1.5, away: -1.5, homeOdds: -115, awayOdds: -105 },
            totals: { value: 8.5, overOdds: -110, underOdds: -110 },
          },
        },
      },
    }),

    // Event 4: NHL scheduled game
    prisma.sportsEvent.create({
      data: {
        externalId: 'test-nhl-001',
        sport: SportType.NHL,
        league: 'NHL',
        homeTeamId: 'team-leafs',
        homeTeamName: 'Toronto Maple Leafs',
        homeTeamAbbr: 'TOR',
        awayTeamId: 'team-canadiens',
        awayTeamName: 'Montreal Canadiens',
        awayTeamAbbr: 'MTL',
        scheduledAt: tomorrow,
        status: EventStatus.SCHEDULED,
        homeScore: null,
        awayScore: null,
        oddsData: {
          provider: 'test-provider',
          lastUpdated: now.toISOString(),
          markets: {
            moneyline: { home: -180, away: 160 },
            spread: { home: -1.5, away: 1.5, homeOdds: -110, awayOdds: -110 },
            totals: { value: 6.5, overOdds: -110, underOdds: -110 },
          },
        },
      },
    }),
  ]);

  const eventIds = events.map((e) => e.id);
  logger.info(`[E2E Setup] Created ${eventIds.length} test events: ${eventIds.join(', ')}`);

  return eventIds;
}

/**
 * Stores test event IDs for use across E2E tests.
 * Accessed via getTestEventIds() in test files.
 */
let testEventIds: string[] = [];

/**
 * Get test event IDs created during setup.
 * Returns empty array if setup hasn't run yet.
 */
export function getTestEventIds(): string[] {
  return testEventIds;
}

// ===========================================
// Global Setup (Before All Tests)
// ===========================================

/**
 * Run before all E2E test suites.
 * 1. Runs integration setup (database, Redis)
 * 2. Creates test data fixtures (events)
 */
async function e2eSetup(): Promise<void> {
  logger.info('[E2E Setup] Starting E2E-specific setup...');

  // 1. Run standard integration setup
  await integrationSetup();

  // 2. Create test events
  testEventIds = await createTestEvents();

  logger.info('[E2E Setup] E2E setup complete');
}

// ===========================================
// Global Teardown (After All Tests)
// ===========================================

/**
 * Run after all E2E test suites.
 * Delegates to integration teardown for cleanup.
 */
async function e2eTeardown(): Promise<void> {
  logger.info('[E2E Teardown] Starting E2E-specific teardown...');

  // Clear test event IDs
  testEventIds = [];

  // Run standard integration teardown
  await integrationTeardown();

  logger.info('[E2E Teardown] E2E teardown complete');
}

// ===========================================
// Vitest Global Setup/Teardown Hooks
// ===========================================

beforeAll(async () => {
  await e2eSetup();
});

afterAll(async () => {
  await e2eTeardown();
});

// ===========================================
// Utility Exports
// ===========================================

/**
 * Re-export integration test utilities for convenience.
 */
export { getIntegrationTestPrisma, getIntegrationTestRedis } from './integration-setup';
