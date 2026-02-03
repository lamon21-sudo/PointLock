#!/usr/bin/env tsx
// =====================================================
// Odds API Connection Test Script
// =====================================================
// Run with: pnpm --filter @pick-rivals/api test:odds
//
// This script verifies:
// 1. ODDS_API_KEY is configured
// 2. API connection is working
// 3. Redis connection is working
// 4. Caching is functioning properly

import 'dotenv/config';
import { Redis } from 'ioredis';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';
import { OddsApiClient } from '../src/services/odds/odds-api.client';
import { OddsService } from '../src/services/odds/odds.service';
import { SportsDataException } from '../src/services/odds/errors';
import type { Sport } from '../src/services/odds/types';

// ===========================================
// Test Configuration
// ===========================================

const TEST_SPORT: Sport = 'basketball_nba';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

function logResult(result: TestResult): void {
  const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`\n${icon} ${result.name}`);
  console.log(`  ${result.message}`);
  if (result.details) {
    console.log(`  Details:`, JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

// ===========================================
// Tests
// ===========================================

async function testApiKeyPresent(): Promise<void> {
  const hasKey = !!config.oddsApi.apiKey && config.oddsApi.apiKey.length > 0;

  logResult({
    name: 'API Key Configuration',
    passed: hasKey,
    message: hasKey
      ? 'ODDS_API_KEY is configured'
      : 'ODDS_API_KEY is missing! Add it to your .env file',
  });

  if (!hasKey) {
    console.log('\n\x1b[33mTo get an API key:\x1b[0m');
    console.log('  1. Visit https://the-odds-api.com/#get-access');
    console.log('  2. Sign up for a free account (500 requests/month)');
    console.log('  3. Add ODDS_API_KEY=your_key_here to apps/api/.env\n');
    process.exit(1);
  }
}

async function testRedisConnection(): Promise<Redis | null> {
  let redis: Redis | null = null;

  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    await redis.connect();
    const pong = await redis.ping();

    logResult({
      name: 'Redis Connection',
      passed: pong === 'PONG',
      message: `Connected to Redis at ${config.redis.host}:${config.redis.port}`,
      details: { response: pong },
    });

    return redis;
  } catch (error) {
    logResult({
      name: 'Redis Connection',
      passed: false,
      message: `Failed to connect to Redis: ${(error as Error).message}`,
      details: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });

    if (redis) {
      await redis.quit().catch(() => {});
    }

    return null;
  }
}

async function testApiConnection(): Promise<void> {
  try {
    const client = new OddsApiClient();
    const healthy = await client.healthCheck();

    logResult({
      name: 'Odds API Connection',
      passed: healthy,
      message: healthy
        ? 'Successfully connected to The Odds API'
        : 'API connection failed',
    });
  } catch (error) {
    const message =
      error instanceof SportsDataException
        ? `${error.code}: ${error.message}`
        : (error as Error).message;

    logResult({
      name: 'Odds API Connection',
      passed: false,
      message: `API connection failed: ${message}`,
    });
  }
}

async function testFetchOdds(): Promise<void> {
  try {
    const client = new OddsApiClient();
    const response = await client.getOdds({
      sport: TEST_SPORT,
      markets: ['h2h'],
    });

    const eventCount = response.events.length;
    const hasEvents = eventCount > 0;

    logResult({
      name: 'Fetch Live Odds',
      passed: true,
      message: `Fetched ${eventCount} ${TEST_SPORT} events`,
      details: {
        remainingRequests: response.remainingRequests,
        usedRequests: response.usedRequests,
        sampleEvent: hasEvents
          ? {
              id: response.events[0].id,
              matchup: `${response.events[0].awayTeam} @ ${response.events[0].homeTeam}`,
              bookmakerCount: response.events[0].bookmakers.length,
            }
          : null,
      },
    });

    if (!hasEvents) {
      console.log(
        '\n\x1b[33mNote: No live events found for ' +
          TEST_SPORT +
          '. This may be normal if the season is inactive.\x1b[0m'
      );
    }
  } catch (error) {
    const message =
      error instanceof SportsDataException
        ? `${error.code}: ${error.message}`
        : (error as Error).message;

    logResult({
      name: 'Fetch Live Odds',
      passed: false,
      message: `Failed to fetch odds: ${message}`,
    });
  }
}

async function testCaching(redis: Redis): Promise<void> {
  try {
    const service = new OddsService(new OddsApiClient(), redis);

    // First call - should be a cache MISS
    const firstCall = await service.getOdds({
      sport: TEST_SPORT,
      markets: ['h2h'],
    });

    // Second call - should be a cache HIT
    const secondCall = await service.getOdds({
      sport: TEST_SPORT,
      markets: ['h2h'],
    });

    const cachingWorks = !firstCall.fromCache && secondCall.fromCache;

    logResult({
      name: 'Redis Caching',
      passed: cachingWorks,
      message: cachingWorks
        ? 'Caching is working correctly (MISS → HIT)'
        : 'Caching may not be working as expected',
      details: {
        firstCallFromCache: firstCall.fromCache,
        secondCallFromCache: secondCall.fromCache,
        cacheTtlSeconds: config.oddsApi.cacheTtlSeconds,
      },
    });
  } catch (error) {
    logResult({
      name: 'Redis Caching',
      passed: false,
      message: `Caching test failed: ${(error as Error).message}`,
    });
  }
}

// ===========================================
// Main
// ===========================================

async function main(): Promise<void> {
  console.log('\n\x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║   Pick-Rivals Odds API Connection Test   ║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════╝\x1b[0m');

  console.log(`\nEnvironment: ${config.nodeEnv}`);
  console.log(`Test Sport: ${TEST_SPORT}`);
  console.log(`Cache TTL: ${config.oddsApi.cacheTtlSeconds}s`);

  // Run tests
  await testApiKeyPresent();
  const redis = await testRedisConnection();
  await testApiConnection();
  await testFetchOdds();

  if (redis) {
    await testCaching(redis);
    await redis.quit();
  }

  // Summary
  console.log('\n\x1b[36m──────────────────────────────────────────\x1b[0m');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(
      `\x1b[32m✓ All tests passed (${passed}/${total})\x1b[0m`
    );
    console.log('\nThe Odds API integration is ready for use!\n');
  } else {
    console.log(
      `\x1b[31m✗ Some tests failed (${passed}/${total} passed)\x1b[0m`
    );
    console.log('\nPlease fix the issues above before proceeding.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Test script failed:', error);
  process.exit(1);
});
