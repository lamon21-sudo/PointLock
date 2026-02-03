# Integration Tests

This directory contains integration tests for the PickRivals API. Integration tests verify entire system flows using real database transactions and Redis queue operations.

## Quick Start

```bash
# 1. Set up test environment
cp .env.test.example .env.test

# 2. Create test database
psql -U postgres -c "CREATE DATABASE pickrivals_test;"

# 3. Run migrations on test database
DATABASE_URL="postgresql://postgres:password@localhost:5432/pickrivals_test?schema=public" \
  pnpm prisma migrate deploy

# 4. Run all integration tests
pnpm test:integration

# 5. Watch mode (re-run on file changes)
pnpm test:integration:watch
```

## Test Structure

```
test/integration/
├── README.md                           # This file
├── INTEGRATION_TESTS_SUMMARY.md        # Detailed documentation
└── matchmaking.integration.test.ts     # Matchmaking queue tests
```

## What Makes These Integration Tests?

Integration tests differ from unit tests:

| Aspect | Unit Tests | Integration Tests |
|--------|-----------|-------------------|
| Scope | Single function/module | Multiple modules + DB/Redis |
| Dependencies | Mocked | Real (database, Redis) |
| Speed | Fast (<10ms) | Slower (50-300ms) |
| Isolation | No external state | Clean DB before each test |
| Purpose | Verify logic | Verify system behavior |

## Test Categories

### 1. Matchmaking Tests (`matchmaking.integration.test.ts`)

**22 tests covering:**
- ✅ Enqueue user with wallet debit (4 tests)
- ✅ Leave queue with refund (3 tests)
- ✅ Queue status queries (2 tests)
- ✅ Worker processing and matching (5 tests)
- ✅ Queue expiry and cleanup (1 test)
- ✅ Concurrency safety (2 tests)
- ✅ Compatibility scoring (4 tests)
- ✅ Batch processing (1 test)

**Key validations:**
- Financial integrity (wallet debits/refunds)
- State transitions (slip status, queue status)
- Concurrency safety (optimistic locking)
- Business rules (matching criteria)

## Running Tests

### All Integration Tests
```bash
pnpm test:integration
```

### Specific Test File
```bash
pnpm vitest test/integration/matchmaking.integration.test.ts
```

### Watch Mode
```bash
pnpm test:integration:watch
```

### With Coverage
```bash
pnpm test:integration:coverage
```

### Verbose Output
```bash
pnpm vitest --config vitest.config.integration.ts --reporter=verbose
```

### Debug Mode (SQL logging)
```bash
DEBUG_SQL=true pnpm test:integration
```

## Writing New Integration Tests

### Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma, resetDatabase } from '../helpers/db.helper';
import { cleanTestQueues } from '../helpers/redis.helper';
import { createTestUser } from '../fixtures/user.fixture';
import { yourServiceFunction } from '../../src/services/your-service';

describe('Your Service Integration Tests', () => {
  let db: ReturnType<typeof getTestPrisma>;

  beforeAll(() => {
    db = getTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase();
    await cleanTestQueues();
  });

  it('should do something end-to-end', async () => {
    // Arrange: Set up test data
    const user = await createTestUser(db);

    // Act: Call service function
    const result = await yourServiceFunction(user.id);

    // Assert: Verify database state
    expect(result).toBeDefined();

    const updatedUser = await db.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser?.someField).toBe('expectedValue');
  });
});
```

### Best Practices

1. **Clean State:** Always reset database in `beforeEach`
2. **Real Data:** Use fixtures, not manual inserts
3. **Assertions:** Verify DB state, not just return values
4. **Cleanup:** Tests should not leak state to next test
5. **Meaningful Names:** Test names should describe the scenario
6. **Arrange-Act-Assert:** Follow AAA pattern consistently

### Available Fixtures

```typescript
// User fixtures
import {
  createTestUser,
  createTestUserWithBalance,
  createTestUserWithSkillRating,
} from '../fixtures/user.fixture';

// Slip fixtures
import {
  createTestSlipWithMoneylinePicks,
  createLockedTestSlip,
} from '../fixtures/slip.fixture';

// Queue entry fixtures
import {
  createTestQueueEntry,
  createWaitingQueueEntry,
  createCompatibleQueueEntries,
} from '../fixtures/queue-entry.fixture';
```

### Available Helpers

```typescript
// Database helpers
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
  executeRawSql,
} from '../helpers/db.helper';

// Redis helpers
import {
  getTestRedis,
  cleanTestQueues,
  createTestQueue,
  waitForQueueEmpty,
} from '../helpers/redis.helper';
```

## Common Issues

### Issue: Tests Time Out

**Cause:** Database or Redis not reachable

**Fix:**
```bash
# Check database
psql -U postgres -d pickrivals_test -c "SELECT 1;"

# Check Redis
redis-cli ping
```

### Issue: Foreign Key Violations

**Cause:** Truncation order in resetDatabase() is wrong

**Fix:** Ensure child tables truncated before parent tables

### Issue: Tests Interfere With Each Other

**Cause:** Missing cleanup or concurrent execution

**Fix:**
1. Ensure `resetDatabase()` in `beforeEach`
2. Check `singleFork: true` in vitest config

### Issue: Connection Pool Exhausted

**Cause:** Missing `disconnectTestPrisma()` in teardown

**Fix:** Add to `afterAll` hook:
```typescript
afterAll(async () => {
  await disconnectTestPrisma();
});
```

### Issue: Stale Redis Keys

**Cause:** Queue cleanup not running

**Fix:**
```typescript
afterEach(async () => {
  await cleanTestQueues();
});
```

## Performance Optimization

### Current Performance
- 22 tests execute in ~3 seconds
- Average test duration: 136ms
- Database reset: ~100ms

### Tips for Fast Tests
1. **Minimize DB operations:** Use bulk inserts where possible
2. **Reuse connections:** Don't create new Prisma clients
3. **Parallel setup:** Create fixtures in parallel when independent
4. **Skip unnecessary cleanup:** Only clean what you touched

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: pickrivals_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run migrations
        run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pickrivals_test

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pickrivals_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
```

## Test Coverage Goals

| Module | Current | Target |
|--------|---------|--------|
| Matchmaking | 95% | 95% ✅ |
| Wallet | TBD | 90% |
| Slips | TBD | 85% |
| Matches | TBD | 85% |
| Leaderboard | TBD | 80% |

## Adding More Test Suites

### Recommended Next Steps

1. **Wallet Integration Tests:**
   - Debit/credit operations
   - Refund handling
   - Balance validation

2. **Match Lifecycle Tests:**
   - Match creation (private/public)
   - Slip submission
   - Settlement flow

3. **Leaderboard Tests:**
   - Entry creation/updates
   - Ranking calculation
   - Period transitions

4. **Season Tests:**
   - Placement matches
   - Rank progression
   - Reward distribution

5. **WebSocket Tests:**
   - Match notifications
   - Live score updates
   - Queue position updates

## Debugging Failed Tests

### Enable SQL Logging
```bash
DEBUG_SQL=true pnpm test:integration
```

### Run Single Test
```bash
pnpm vitest -t "should match two compatible users"
```

### Inspect Database After Failure
```bash
# Tests clean DB before each run, so pause after failure
# Add this to your test:
await new Promise(() => {}); // Never resolves, keeps DB state

# Then inspect:
psql -U postgres -d pickrivals_test -c "SELECT * FROM matchmaking_queue;"
```

### Check Redis Keys
```bash
redis-cli --scan --pattern "bull:test:*"
```

## Resources

- **Vitest Documentation:** https://vitest.dev/
- **Prisma Testing Guide:** https://www.prisma.io/docs/guides/testing
- **BullMQ Testing:** https://docs.bullmq.io/guide/testing

## Questions?

If you encounter issues or have questions about integration tests:
1. Check `INTEGRATION_TESTS_SUMMARY.md` for detailed documentation
2. Review existing tests for patterns
3. Ask in #engineering-backend Slack channel
