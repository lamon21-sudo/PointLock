# PICK-RIVALS API Testing Infrastructure

## Phase 1: Foundation (COMPLETE)

This directory contains the core testing infrastructure for the PICK-RIVALS API.

## Directory Structure

```
test/
├── README.md                    # This file
├── setup.ts                     # Global test setup/teardown
├── helpers/                     # Test utilities
│   ├── db.helper.ts            # Database operations
│   ├── redis.helper.ts         # Redis/Queue operations
│   ├── api.helper.ts           # API/HTTP testing
│   └── index.ts                # Helper exports
└── fixtures/                    # Test data factories
    ├── user.fixture.ts         # User creation
    ├── slip.fixture.ts         # Slip/Pick creation
    ├── queue-entry.fixture.ts  # Queue entry creation
    └── index.ts                # Fixture exports
```

## Running Tests

### Prerequisites

Start test infrastructure (PostgreSQL + Redis):
```bash
docker-compose -f docker-compose.test.yml up -d
```

Wait for health checks to pass (5-10 seconds).

### Test Commands

```bash
# Run all unit tests
npm run test

# Run tests in watch mode (TDD)
npm run test:watch

# Run unit tests only (exclude integration/e2e)
npm run test:unit

# Run with coverage report
npm run test:coverage

# Run with interactive UI
npm run test:ui

# Full test cycle (start Docker, run tests, stop Docker)
npm run test:docker
```

## Test Helpers

### Database Helper (`db.helper.ts`)

```typescript
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '@/test/helpers';

describe('My Test Suite', () => {
  const db = getTestPrisma();

  beforeEach(async () => {
    await resetDatabase(); // Clean slate for each test
  });

  afterAll(async () => {
    await disconnectTestPrisma(); // Prevent connection leaks
  });

  it('should create user', async () => {
    const user = await db.user.create({ /* ... */ });
    expect(user).toBeDefined();
  });
});
```

**Key Functions:**
- `getTestPrisma()` - Get Prisma client connected to test DB
- `resetDatabase()` - Delete all data (fast, respects FK constraints)
- `disconnectTestPrisma()` - Close connections
- `isDatabaseReachable()` - Health check

### Redis Helper (`redis.helper.ts`)

```typescript
import { createTestQueue, waitForQueueEmpty, cleanTestQueues } from '@/test/helpers';

describe('Queue Tests', () => {
  const queue = createTestQueue('settlement');

  afterEach(async () => {
    await cleanTestQueues(); // Remove all test: keys
  });

  it('should process jobs', async () => {
    await queue.add('settle', { matchId: '123' });
    const isEmpty = await waitForQueueEmpty(queue, 5000);
    expect(isEmpty).toBe(true);
  });
});
```

**Key Functions:**
- `getTestRedis()` - Get Redis client (DB 15)
- `createTestQueue(name)` - Create BullMQ queue with `test:` prefix
- `waitForQueueEmpty(queue, timeout)` - Wait for all jobs to process
- `cleanTestQueues()` - Delete all test queue data
- `disconnectTestRedis()` - Close connections

### API Helper (`api.helper.ts`)

```typescript
import { generateTestToken, authenticatedGet, authenticatedPost } from '@/test/helpers';

describe('API Tests', () => {
  it('should authenticate user', async () => {
    const token = generateTestToken('user-123');

    const response = await authenticatedGet('/api/v1/users/me', token);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should reject invalid token', async () => {
    const response = await authenticatedGet('/api/v1/users/me', 'invalid-token');
    expect(response.status).toBe(401);
  });
});
```

**Key Functions:**
- `getTestApp()` - Get Express app instance
- `generateTestToken(userId)` - Create valid JWT
- `generateExpiredTestToken(userId)` - Create expired JWT
- `authenticatedGet/Post/Put/Patch/Delete(path, token)` - Supertest with auth
- `unauthenticatedRequest(method, path)` - Supertest without auth

## Test Fixtures

### User Fixture (`user.fixture.ts`)

```typescript
import { createTestUser, createTestUserWithBalance } from '@/test/fixtures';

it('should create user with wallet', async () => {
  const db = getTestPrisma();

  const user = await createTestUser(db, {
    email: 'test@example.com',
    username: 'testuser',
    skillRating: 1200,
  });

  expect(user.wallet).toBeDefined();
  expect(user.skillRating).toBe(1200);
});

it('should create user with balance', async () => {
  const user = await createTestUserWithBalance(db, BigInt(10000), BigInt(5000));

  expect(user.wallet.paidBalance).toBe(BigInt(10000));
  expect(user.wallet.bonusBalance).toBe(BigInt(5000));
});
```

**Key Functions:**
- `createTestUser(db, options)` - Create user with wallet
- `createTestUsers(db, count, options)` - Create multiple users
- `createTestUserWithBalance(db, paid, bonus)` - Create user with funds
- `createTestUserWithSkillRating(db, rating)` - For matchmaking tests
- `createTestUserWithStats(db, stats)` - For leaderboard tests

### Slip Fixture (`slip.fixture.ts`)

```typescript
import { createTestSlip, createTestSlipWithMoneylinePicks } from '@/test/fixtures';

it('should create slip with picks', async () => {
  const slip = await createTestSlipWithMoneylinePicks(db, userId, 3);

  expect(slip.picks).toHaveLength(3);
  expect(slip.picks[0].pickType).toBe('moneyline');
});

it('should create settled slip', async () => {
  const slip = await createSettledTestSlip(db, userId, 'WON');

  expect(slip.status).toBe('WON');
  expect(slip.settledAt).toBeDefined();
});
```

**Key Functions:**
- `createTestSlip(db, options)` - Create slip with custom picks
- `createTestSlipWithMoneylinePicks(db, userId, count)` - Simple moneyline slip
- `createTestSlipWithSpreadPicks(db, userId, count)` - Spread slip
- `createLockedTestSlip(db, userId, matchId)` - Submitted slip
- `createMixedResultSlip(db, userId, hits, misses)` - For scoring tests

### Queue Entry Fixture (`queue-entry.fixture.ts`)

```typescript
import { createWaitingQueueEntry, createCompatibleQueueEntries } from '@/test/fixtures';

it('should create queue entry', async () => {
  const entry = await createWaitingQueueEntry(db, userId, {
    stakeAmount: BigInt(1000),
    tier: 'FREE',
    slipSize: 3,
  });

  expect(entry.status).toBe('WAITING');
});

it('should create compatible entries for matching', async () => {
  const entries = await createCompatibleQueueEntries(db, 2, BigInt(1000), 'FREE', 3);

  expect(entries).toHaveLength(2);
  // Both have same stake, tier, slip size - ready to match
});
```

**Key Functions:**
- `createTestQueueEntry(db, options)` - Create queue entry
- `createWaitingQueueEntry(db, userId)` - Entry waiting for match
- `createMatchedQueueEntry(db, userId, matchId)` - Already matched
- `createCompatibleQueueEntries(db, count, stake, tier, size)` - Matching set

## Best Practices

### 1. Isolation
Each test should be independent. Use `beforeEach(() => resetDatabase())` to ensure clean state.

### 2. Cleanup
Always disconnect in `afterAll()` hooks:
```typescript
afterAll(async () => {
  await disconnectTestPrisma();
  await disconnectTestRedis();
});
```

### 3. Fixtures Over Manual Creation
Use fixtures for consistency:
```typescript
// Good
const user = await createTestUser(db);

// Avoid
const user = await db.user.create({ /* 20 lines of manual data */ });
```

### 4. Type Safety
All fixtures and helpers are fully typed. Use TypeScript's type inference:
```typescript
const user = await createTestUser(db); // user is User & { wallet: Wallet }
```

### 5. Idempotency
Test database operations should be idempotent. Running the same test twice should produce the same result.

## Environment Variables

Test environment uses `.env.test`:
- `DATABASE_URL` - Points to `pickrivals_test` on port 5433
- `REDIS_PORT` - Uses 6380 (not 6379) for isolation
- `NODE_ENV` - Forced to `test` for safety
- `JWT_*` - Test-only secrets (never use in production)

## Coverage Requirements

Calculator modules have 90% coverage requirement:
- `src/lib/odds-calculator.ts`
- `src/lib/pointlock-calculator.ts`
- `src/lib/tier.service.ts`
- `src/lib/player-tier.service.ts`

Run `npm run test:coverage` to generate HTML coverage report in `coverage/`.

## Debugging

Enable SQL query logging:
```bash
DEBUG_SQL=true npm run test
```

Run specific test file:
```bash
npx vitest src/lib/odds-calculator.test.ts
```

Run tests matching pattern:
```bash
npx vitest -t "should calculate odds"
```

## Next Steps (Future Phases)

- Phase 2: Integration tests (`*.integration.test.ts`)
- Phase 3: E2E tests (`*.e2e.test.ts`)
- Phase 4: Load/performance tests
- Phase 5: Contract tests for shared-types

## Troubleshooting

### "Cannot connect to database"
Start Docker containers:
```bash
docker-compose -f docker-compose.test.yml up -d
docker-compose -f docker-compose.test.yml ps  # Check health
```

### "Port 5433 already in use"
Stop existing containers:
```bash
docker-compose -f docker-compose.test.yml down
```

### "Tests hang/timeout"
Likely missing disconnect:
```typescript
afterAll(async () => {
  await disconnectTestPrisma();
  await disconnectTestRedis();
});
```

### "Foreign key constraint violation"
`resetDatabase()` handles FK order. If it fails, check schema changes in `schema.prisma`.
