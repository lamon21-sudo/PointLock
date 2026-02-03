// =====================================================
// Slip Fixture
// =====================================================
// Factory functions for creating test slips with picks.
// Handles the complex relationship between slips, picks, and events.

import {
  PrismaClient,
  Slip,
  SlipPick,
  SportsEvent,
  SlipStatus,
  PickType,
  PickStatus,
  SportType,
  EventStatus,
  PickTier,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Options for creating a test slip.
 */
export interface CreateTestSlipOptions {
  userId: string;
  matchId?: string | null;
  name?: string;
  status?: SlipStatus;
  stake?: number;
  totalOdds?: number;
  potentialPayout?: number;
  totalPicks?: number;
  correctPicks?: number;
  pointPotential?: number;
  pointsEarned?: number;
  totalCoinCost?: number;
  lockedAt?: Date | null;
  settledAt?: Date | null;
  picks?: CreateTestPickOptions[];
}

/**
 * Options for creating a test pick within a slip.
 */
export interface CreateTestPickOptions {
  sportsEventId?: string;
  pickType?: PickType;
  selection?: string;
  line?: number | null;
  odds?: number;
  oddsDecimal?: number;
  pointValue?: number;
  coinCost?: number;
  tier?: PickTier;
  status?: PickStatus;
  resultValue?: number | null;
  settledAt?: Date | null;
}

/**
 * Create a test sports event for picks.
 * Helper function to ensure events exist for picks.
 */
export async function createTestSportsEvent(
  db: PrismaClient,
  options: {
    sport?: SportType;
    status?: EventStatus;
    homeScore?: number | null;
    awayScore?: number | null;
    scheduledAt?: Date;
  } = {}
): Promise<SportsEvent> {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);

  return db.sportsEvent.create({
    data: {
      externalId: `test-event-${timestamp}-${random}`,
      sport: options.sport || 'NBA',
      league: 'NBA',
      homeTeamId: `team-home-${random}`,
      homeTeamName: `Home Team ${random}`,
      homeTeamAbbr: 'HOM',
      awayTeamId: `team-away-${random}`,
      awayTeamName: `Away Team ${random}`,
      awayTeamAbbr: 'AWY',
      scheduledAt: options.scheduledAt || new Date(),
      homeScore: options.homeScore,
      awayScore: options.awayScore,
      status: options.status || 'SCHEDULED',
      oddsData: {},
    },
  });
}

/**
 * Create a test slip with picks.
 * Automatically creates sports events for picks if needed.
 *
 * @param db - Prisma client instance
 * @param options - Slip customization options
 * @returns Created slip with picks relation
 */
export async function createTestSlip(
  db: PrismaClient,
  options: CreateTestSlipOptions
): Promise<Slip & { picks: SlipPick[] }> {
  const picks = options.picks || [];

  // Create slip
  const slip = await db.slip.create({
    data: {
      userId: options.userId,
      matchId: options.matchId,
      name: options.name || 'Test Slip',
      status: options.status || 'DRAFT',
      stake: new Decimal(options.stake || 0),
      totalOdds: new Decimal(options.totalOdds || 1),
      potentialPayout: new Decimal(options.potentialPayout || 0),
      totalPicks: options.totalPicks || picks.length,
      correctPicks: options.correctPicks || 0,
      pointPotential: new Decimal(options.pointPotential || 0),
      pointsEarned: new Decimal(options.pointsEarned || 0),
      totalCoinCost: options.totalCoinCost || 0,
      lockedAt: options.lockedAt,
      settledAt: options.settledAt,
    },
    include: {
      picks: true,
    },
  });

  // Create picks if provided
  for (const pickOptions of picks) {
    await createTestPick(db, slip.id, pickOptions);
  }

  // Fetch slip with picks
  const slipWithPicks = await db.slip.findUniqueOrThrow({
    where: { id: slip.id },
    include: { picks: true },
  });

  return slipWithPicks;
}

/**
 * Create a test pick for a slip.
 * Creates a sports event if none provided.
 */
async function createTestPick(
  db: PrismaClient,
  slipId: string,
  options: CreateTestPickOptions = {}
): Promise<SlipPick> {
  let sportsEventId = options.sportsEventId;

  // Create event if not provided
  if (!sportsEventId) {
    const event = await createTestSportsEvent(db);
    sportsEventId = event.id;
  }

  return db.slipPick.create({
    data: {
      slipId,
      sportsEventId,
      pickType: options.pickType || 'moneyline',
      selection: options.selection || 'home',
      line: options.line !== undefined ? new Decimal(options.line) : null,
      odds: options.odds || -110,
      oddsDecimal: options.oddsDecimal
        ? new Decimal(options.oddsDecimal)
        : new Decimal(1.91),
      pointValue: new Decimal(options.pointValue || 100),
      coinCost: options.coinCost || 0,
      tier: options.tier || 'FREE',
      marketModifier: new Decimal(1.0),
      status: options.status || 'PENDING',
      resultValue: options.resultValue
        ? new Decimal(options.resultValue)
        : null,
      settledAt: options.settledAt,
    },
  });
}

/**
 * Create a slip with moneyline picks (simplest case).
 */
export async function createTestSlipWithMoneylinePicks(
  db: PrismaClient,
  userId: string,
  pickCount: number = 3,
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  const picks: CreateTestPickOptions[] = [];

  for (let i = 0; i < pickCount; i++) {
    picks.push({
      pickType: 'moneyline',
      selection: i % 2 === 0 ? 'home' : 'away',
      odds: -110,
      pointValue: 100,
    });
  }

  return createTestSlip(db, {
    ...options,
    userId,
    picks,
  });
}

/**
 * Create a slip with spread picks.
 */
export async function createTestSlipWithSpreadPicks(
  db: PrismaClient,
  userId: string,
  pickCount: number = 3,
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  const picks: CreateTestPickOptions[] = [];

  for (let i = 0; i < pickCount; i++) {
    picks.push({
      pickType: 'spread',
      selection: 'home',
      line: -7.5 + i, // Vary the line
      odds: -110,
      pointValue: 100,
    });
  }

  return createTestSlip(db, {
    ...options,
    userId,
    picks,
  });
}

/**
 * Create a slip with total (over/under) picks.
 */
export async function createTestSlipWithTotalPicks(
  db: PrismaClient,
  userId: string,
  pickCount: number = 3,
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  const picks: CreateTestPickOptions[] = [];

  for (let i = 0; i < pickCount; i++) {
    picks.push({
      pickType: 'total',
      selection: i % 2 === 0 ? 'over' : 'under',
      line: 220.5,
      odds: -110,
      pointValue: 100,
    });
  }

  return createTestSlip(db, {
    ...options,
    userId,
    picks,
  });
}

/**
 * Create a locked slip (submitted, awaiting results).
 */
export async function createLockedTestSlip(
  db: PrismaClient,
  userId: string,
  matchId?: string,
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  return createTestSlip(db, {
    ...options,
    userId,
    matchId,
    status: 'PENDING',
    lockedAt: new Date(),
  });
}

/**
 * Create a settled slip (all picks graded).
 */
export async function createSettledTestSlip(
  db: PrismaClient,
  userId: string,
  status: 'WON' | 'LOST' | 'VOID',
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  const pickStatus: PickStatus = status === 'WON' ? 'HIT' : status === 'LOST' ? 'MISS' : 'VOID';

  return createTestSlip(db, {
    ...options,
    userId,
    status,
    lockedAt: new Date(Date.now() - 3600000), // 1 hour ago
    settledAt: new Date(),
    picks: [
      {
        pickType: 'moneyline',
        selection: 'home',
        pointValue: 100,
        status: pickStatus,
        settledAt: new Date(),
      },
    ],
  });
}

/**
 * Create a slip with mixed pick statuses (for tiebreaker tests).
 */
export async function createMixedResultSlip(
  db: PrismaClient,
  userId: string,
  hits: number,
  misses: number,
  options: Partial<CreateTestSlipOptions> = {}
): Promise<Slip & { picks: SlipPick[] }> {
  const picks: CreateTestPickOptions[] = [];

  // Add HIT picks
  for (let i = 0; i < hits; i++) {
    picks.push({
      pickType: 'moneyline',
      selection: 'home',
      pointValue: 100,
      status: 'HIT',
      settledAt: new Date(),
    });
  }

  // Add MISS picks
  for (let i = 0; i < misses; i++) {
    picks.push({
      pickType: 'moneyline',
      selection: 'away',
      pointValue: 100,
      status: 'MISS',
      settledAt: new Date(),
    });
  }

  return createTestSlip(db, {
    ...options,
    userId,
    status: misses > 0 ? 'LOST' : 'WON',
    picks,
    correctPicks: hits,
    totalPicks: hits + misses,
    pointsEarned: hits * 100,
    lockedAt: new Date(Date.now() - 3600000),
    settledAt: new Date(),
  });
}
