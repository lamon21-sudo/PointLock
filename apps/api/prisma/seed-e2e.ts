// =====================================================
// E2E Test Data Seeding Script
// =====================================================
// Creates deterministic test data for mobile E2E testing
// CRITICAL: All data must be predictable and isolated from development/production seeds

import { PrismaClient, SportType, EventStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

// =====================================================
// E2E Test User Configuration
// =====================================================
// These credentials MUST match the Maestro flow expectations
const E2E_TEST_USER = {
  email: 'e2e-test@pointlock.com',
  username: 'e2e_test_user',
  password: 'TestPassword123!',
  displayName: 'E2E Test User',
  initialPaidBalance: 0n,
  initialBonusBalance: 10000n, // 10,000 RC starting balance
} as const;

// =====================================================
// E2E Test Events Configuration
// =====================================================
// Scheduled for tomorrow to ensure availability during test runs
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dayAfterTomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);

interface E2EEventData {
  externalId: string;
  sport: SportType;
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamAbbr: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamAbbr: string;
  scheduledAt: Date;
  status: EventStatus;
  oddsData: {
    spread: {
      home: { line: number; odds: number };
      away: { line: number; odds: number };
    };
    total: {
      line: number;
      over: number;
      under: number;
    };
    moneyline: {
      home: number;
      away: number;
    };
  };
}

const E2E_TEST_EVENTS: E2EEventData[] = [
  {
    externalId: 'e2e-nfl-001',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: 'nfl-kc',
    homeTeamName: 'Kansas City Chiefs',
    homeTeamAbbr: 'KC',
    awayTeamId: 'nfl-buf',
    awayTeamName: 'Buffalo Bills',
    awayTeamAbbr: 'BUF',
    scheduledAt: tomorrow,
    status: 'SCHEDULED' as EventStatus,
    oddsData: {
      spread: {
        home: { line: -3.5, odds: -110 },
        away: { line: 3.5, odds: -110 },
      },
      total: {
        line: 47.5,
        over: -110,
        under: -110,
      },
      moneyline: {
        home: -150,
        away: 130,
      },
    },
  },
  {
    externalId: 'e2e-nfl-002',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: 'nfl-sf',
    homeTeamName: 'San Francisco 49ers',
    homeTeamAbbr: 'SF',
    awayTeamId: 'nfl-dal',
    awayTeamName: 'Dallas Cowboys',
    awayTeamAbbr: 'DAL',
    scheduledAt: tomorrow,
    status: 'SCHEDULED' as EventStatus,
    oddsData: {
      spread: {
        home: { line: -7.0, odds: -110 },
        away: { line: 7.0, odds: -110 },
      },
      total: {
        line: 51.5,
        over: -115,
        under: -105,
      },
      moneyline: {
        home: -280,
        away: 230,
      },
    },
  },
  {
    externalId: 'e2e-nba-001',
    sport: 'NBA' as SportType,
    league: 'NBA',
    homeTeamId: 'nba-lal',
    homeTeamName: 'Los Angeles Lakers',
    homeTeamAbbr: 'LAL',
    awayTeamId: 'nba-bos',
    awayTeamName: 'Boston Celtics',
    awayTeamAbbr: 'BOS',
    scheduledAt: dayAfterTomorrow,
    status: 'SCHEDULED' as EventStatus,
    oddsData: {
      spread: {
        home: { line: -2.5, odds: -110 },
        away: { line: 2.5, odds: -110 },
      },
      total: {
        line: 225.5,
        over: -110,
        under: -110,
      },
      moneyline: {
        home: -130,
        away: 110,
      },
    },
  },
  {
    externalId: 'e2e-mlb-001',
    sport: 'MLB' as SportType,
    league: 'MLB',
    homeTeamId: 'mlb-nyy',
    homeTeamName: 'New York Yankees',
    homeTeamAbbr: 'NYY',
    awayTeamId: 'mlb-lad',
    awayTeamName: 'Los Angeles Dodgers',
    awayTeamAbbr: 'LAD',
    scheduledAt: dayAfterTomorrow,
    status: 'SCHEDULED' as EventStatus,
    oddsData: {
      spread: {
        home: { line: -1.5, odds: -140 },
        away: { line: 1.5, odds: 120 },
      },
      total: {
        line: 8.5,
        over: -115,
        under: -105,
      },
      moneyline: {
        home: -155,
        away: 135,
      },
    },
  },
];

// =====================================================
// E2E Data Seeding Functions
// =====================================================

/**
 * Creates E2E test user with wallet in atomic transaction
 * Deletes existing E2E user if present to ensure clean state
 */
async function seedE2EUser(): Promise<void> {
  console.log('🧹 Cleaning existing E2E test user...');

  // Delete existing E2E user (cascade deletes wallet, slips, etc.)
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: E2E_TEST_USER.email },
        { username: E2E_TEST_USER.username },
        { email: { startsWith: 'e2e-' } },
      ],
    },
  });

  console.log('👤 Creating E2E test user with wallet...');

  const passwordHash = await bcrypt.hash(E2E_TEST_USER.password, BCRYPT_ROUNDS);

  // CRITICAL: Atomic transaction - User and Wallet MUST be created together
  await prisma.user.create({
    data: {
      email: E2E_TEST_USER.email,
      username: E2E_TEST_USER.username,
      passwordHash,
      displayName: E2E_TEST_USER.displayName,
      status: 'active',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      wallet: {
        create: {
          paidBalance: E2E_TEST_USER.initialPaidBalance,
          bonusBalance: E2E_TEST_USER.initialBonusBalance,
        },
      },
    },
  });

  console.log(`✅ E2E test user created: ${E2E_TEST_USER.email}`);
  console.log(`   Username: ${E2E_TEST_USER.username}`);
  console.log(`   Password: ${E2E_TEST_USER.password}`);
  console.log(`   Initial Balance: ${E2E_TEST_USER.initialBonusBalance} RC (bonus)`);
}

/**
 * Creates deterministic E2E test events
 * Deletes existing E2E events to ensure clean state
 */
async function seedE2EEvents(): Promise<void> {
  console.log('\n🧹 Cleaning existing E2E test events...');

  await prisma.sportsEvent.deleteMany({
    where: {
      externalId: { startsWith: 'e2e-' },
    },
  });

  console.log('🏈 Creating E2E test events...');

  for (const eventData of E2E_TEST_EVENTS) {
    await prisma.sportsEvent.create({
      data: {
        externalId: eventData.externalId,
        sport: eventData.sport,
        league: eventData.league,
        homeTeamId: eventData.homeTeamId,
        homeTeamName: eventData.homeTeamName,
        homeTeamAbbr: eventData.homeTeamAbbr,
        awayTeamId: eventData.awayTeamId,
        awayTeamName: eventData.awayTeamName,
        awayTeamAbbr: eventData.awayTeamAbbr,
        scheduledAt: eventData.scheduledAt,
        status: eventData.status,
        oddsData: eventData.oddsData,
        oddsUpdatedAt: new Date(),
      },
    });

    console.log(
      `✅ Event created: ${eventData.sport} - ${eventData.awayTeamAbbr} @ ${eventData.homeTeamAbbr} (${eventData.externalId})`
    );
  }

  console.log(`\n✅ Created ${E2E_TEST_EVENTS.length} E2E test events`);
}

// =====================================================
// Main Seed Execution
// =====================================================

async function main(): Promise<void> {
  console.log('🌱 Starting E2E test data seeding...\n');
  console.log('=' .repeat(60));

  try {
    // Seed test user with wallet
    await seedE2EUser();

    // Seed test events
    await seedE2EEvents();

    console.log('=' .repeat(60));
    console.log('\n🎉 E2E test data seeding complete!\n');
    console.log('Test Credentials:');
    console.log(`  Email:    ${E2E_TEST_USER.email}`);
    console.log(`  Username: ${E2E_TEST_USER.username}`);
    console.log(`  Password: ${E2E_TEST_USER.password}`);
    console.log(`\nTest Data Summary:`);
    console.log(`  Users:  1`);
    console.log(`  Events: ${E2E_TEST_EVENTS.length}`);
    console.log(`  Balance: ${E2E_TEST_USER.initialBonusBalance} RC\n`);
  } catch (error) {
    console.error('\n❌ E2E seeding failed:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('Fatal error during E2E seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
