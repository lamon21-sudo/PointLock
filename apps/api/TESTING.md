# PICK-RIVALS API Testing Guide

Comprehensive testing documentation for the PICK-RIVALS API.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Categories](#test-categories)
- [Running Tests](#running-tests)
- [Test Infrastructure](#test-infrastructure)
- [Writing Tests](#writing-tests)
- [Coverage](#coverage)
- [CI/CD](#cicd)
- [Troubleshooting](#troubleshooting)

---

## Overview

The API testing suite includes:

| Category | Location | Framework | Purpose |
|----------|----------|-----------|---------|
| **Unit** | `src/**/*.test.ts` | Vitest | Pure function testing |
| **Integration** | `test/integration/*.test.ts` | Vitest + Prisma | Database/queue testing |
| **E2E** | `test/e2e/*.test.ts` | Vitest + Supertest | Full API flow testing |
| **Load** | `load/*.k6.js` | k6 | Performance testing |

### Coverage Targets

| Module | Lines | Branches | Functions |
|--------|-------|----------|-----------|
| `odds-calculator.ts` | 90% | 90% | 90% |
| `pointlock-calculator.ts` | 90% | 90% | 90% |
| `tier.service.ts` | 90% | 90% | 90% |
| `player-tier.service.ts` | 90% | 90% | 90% |

---

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Test Infrastructure

```bash
pnpm test:infra:up
```

This starts:
- PostgreSQL on port `5433` (database: `pickrivals_test`)
- Redis on port `6380`

### 3. Run Tests

```bash
# Unit tests only
pnpm test:unit

# Integration tests (requires infrastructure)
pnpm test:integration

# E2E tests (requires infrastructure)
pnpm test:e2e

# All tests with coverage
pnpm test:coverage
```

### 4. Stop Infrastructure

```bash
pnpm test:infra:down
```

---

## Test Categories

### Unit Tests

Location: Colocated with source files (`src/**/*.test.ts`)

Tests pure functions without external dependencies:
- `odds-calculator.test.ts` - Odds conversion, point calculations
- `pointlock-calculator.test.ts` - Coin costs, points, minimum spend
- `tier.service.test.ts` - Tier progression logic
- `player-tier.service.test.ts` - Athlete tier categorization

```bash
pnpm test:unit
```

### Integration Tests

Location: `test/integration/*.test.ts`

Tests database operations and queue processing:
- `matchmaking.integration.test.ts` - Queue operations, matching logic

Requires:
- PostgreSQL test database
- Redis test instance

```bash
pnpm test:integration
```

### E2E Tests

Location: `test/e2e/*.test.ts`

Tests full API flows via HTTP:
- `match-flow.e2e.test.ts` - Complete match lifecycle

Requires:
- Full test infrastructure
- API endpoints accessible

```bash
pnpm test:e2e
```

### Load Tests

Location: `load/*.k6.js`

Performance testing with k6:
- `matchmaking-queue.k6.js` - 100+ concurrent queue users

Requires:
- k6 installed (`brew install k6` or `winget install k6`)
- Test users seeded
- API running

```bash
# Setup test users
pnpm load:setup

# Validate setup
pnpm load:validate

# Run load test (API must be running)
pnpm load:test
```

---

## Running Tests

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:unit` | Run unit tests only |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm test:coverage` | Run with coverage report |
| `pnpm test:ui` | Open Vitest UI |
| `pnpm load:test` | Run k6 load tests |

### Infrastructure Commands

| Command | Description |
|---------|-------------|
| `pnpm test:infra:up` | Start PostgreSQL + Redis |
| `pnpm test:infra:down` | Stop and remove volumes |
| `pnpm test:db:push` | Push schema to test DB |
| `pnpm test:db:reset` | Reset test database |

### Running Specific Tests

```bash
# Run a specific test file
pnpm vitest run src/lib/tier.service.test.ts

# Run tests matching a pattern
pnpm vitest run -t "calculateTierFromStats"

# Run in debug mode
DEBUG_SQL=true pnpm test:integration
```

---

## Test Infrastructure

### Docker Compose

File: `docker-compose.test.yml`

Services:
- **postgres-test**: PostgreSQL 16 Alpine on port 5433
  - Database: `pickrivals_test`
  - User: `postgres`
  - Password: `password`
  - Uses tmpfs for fast ephemeral storage

- **redis-test**: Redis 7 Alpine on port 6380
  - Persistence disabled for speed
  - Uses database 15 for isolation

### Environment

File: `.env.test`

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:password@localhost:5433/pickrivals_test
REDIS_HOST=localhost
REDIS_PORT=6380
JWT_ACCESS_SECRET=test-access-secret-key-for-testing
JWT_REFRESH_SECRET=test-refresh-secret-key-for-testing
```

### Test Helpers

Location: `test/helpers/`

| Helper | Purpose |
|--------|---------|
| `db.helper.ts` | Prisma client, `resetDatabase()`, `disconnectTestPrisma()` |
| `redis.helper.ts` | Redis client, test queues, `cleanTestQueues()` |
| `api.helper.ts` | Express app, JWT tokens, authenticated requests |

### Test Fixtures

Location: `test/fixtures/`

| Fixture | Purpose |
|---------|---------|
| `user.fixture.ts` | `createTestUser()`, `createTestUsers()` |
| `slip.fixture.ts` | `createTestSlip()` with picks |
| `queue-entry.fixture.ts` | `createTestQueueEntry()` |

---

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { calculateTierFromStats } from './tier.service';
import { PickTier } from '@prisma/client';

describe('calculateTierFromStats', () => {
  it('should return FREE tier for 0 coins and 0 streak', () => {
    expect(calculateTierFromStats(0, 0)).toBe(PickTier.FREE);
  });

  it('should return ELITE tier for 5+ streak', () => {
    expect(calculateTierFromStats(0, 5)).toBe(PickTier.ELITE);
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db.helper';
import { createTestUser } from '../fixtures/user.fixture';

describe('Matchmaking Integration', () => {
  const db = getTestPrisma();

  beforeAll(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await db.matchmakingQueue.deleteMany();
  });

  afterAll(async () => {
    await disconnectTestPrisma();
  });

  it('should create queue entry for user', async () => {
    const user = await createTestUser(db);
    // ... test implementation
  });
});
```

### E2E Test Example

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, generateTestToken } from '../helpers/api.helper';

describe('Match Flow E2E', () => {
  const app = getTestApp();

  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Test123!',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

---

## Coverage

### Viewing Coverage

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

### Coverage Configuration

File: `vitest.config.ts`

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  include: [
    'src/lib/odds-calculator.ts',
    'src/lib/pointlock-calculator.ts',
    'src/lib/tier.service.ts',
    'src/lib/player-tier.service.ts',
  ],
  thresholds: {
    lines: 90,
    branches: 90,
    functions: 90,
    statements: 90,
  },
}
```

---

## CI/CD

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: pickrivals_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6380:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm --filter @pointlock/api db:generate

      - run: pnpm --filter @pointlock/api test:db:push
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5433/pickrivals_test

      - run: pnpm --filter @pointlock/api test:coverage
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5433/pickrivals_test
          REDIS_HOST: localhost
          REDIS_PORT: 6380
```

---

## Troubleshooting

### Database Connection Issues

**Error:** `Can't reach database server`

**Solution:**
```bash
# Check if container is running
docker ps

# Start infrastructure
pnpm test:infra:up

# Wait for health check
docker-compose -f docker-compose.test.yml logs postgres-test
```

### Redis Connection Issues

**Error:** `ECONNREFUSED 127.0.0.1:6380`

**Solution:**
```bash
# Check Redis is running
redis-cli -p 6380 ping

# Start infrastructure
pnpm test:infra:up
```

### Test Timeout Issues

**Error:** `Test timed out`

**Solution:**
1. Increase timeout in test config
2. Check database is responsive
3. Check for deadlocks in transaction code

### Flaky Tests

**Symptoms:** Tests pass sometimes, fail other times

**Solutions:**
1. Use `beforeEach` to reset state
2. Use `afterEach` to clean up
3. Avoid shared state between tests
4. Use deterministic data (no random values without seeds)

### Coverage Below Threshold

**Error:** `Coverage thresholds not met`

**Solution:**
1. Run `pnpm test:coverage` to see uncovered lines
2. Add tests for missing branches
3. Check `coverage/index.html` for visual report

---

## File Structure

```
apps/api/
├── vitest.config.ts                    # Unit test config
├── vitest.config.integration.ts        # Integration test config
├── vitest.config.e2e.ts                # E2E test config
├── docker-compose.test.yml             # Test infrastructure
├── .env.test                           # Test environment
├── TESTING.md                          # This file
├── src/
│   └── lib/
│       ├── *.ts                        # Source files
│       └── *.test.ts                   # Unit tests (colocated)
├── test/
│   ├── setup.ts                        # Global setup
│   ├── helpers/
│   │   ├── db.helper.ts                # Database utilities
│   │   ├── redis.helper.ts             # Redis utilities
│   │   └── api.helper.ts               # API utilities
│   ├── fixtures/
│   │   ├── user.fixture.ts             # User factories
│   │   ├── slip.fixture.ts             # Slip factories
│   │   └── queue-entry.fixture.ts      # Queue entry factories
│   ├── integration/
│   │   └── *.integration.test.ts       # Integration tests
│   └── e2e/
│       └── *.e2e.test.ts               # E2E tests
└── load/
    ├── matchmaking-queue.k6.js         # k6 load test
    ├── setup-load-test-users.ts        # Test user seeding
    └── README.md                       # Load test docs
```

---

## Summary

| Suite | Command | Duration | Requirements |
|-------|---------|----------|--------------|
| Unit | `pnpm test:unit` | ~2s | None |
| Integration | `pnpm test:integration` | ~10s | PostgreSQL, Redis |
| E2E | `pnpm test:e2e` | ~15s | PostgreSQL, Redis |
| Load | `pnpm load:test` | ~2min | k6, API running |

**Total Test Count:** 350+ tests across all suites

For questions or issues, see the [troubleshooting](#troubleshooting) section or check the individual README files in each test directory.
