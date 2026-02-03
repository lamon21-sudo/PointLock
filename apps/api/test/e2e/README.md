# E2E Test Suite Documentation

## Overview

This directory contains end-to-end tests for PICK-RIVALS. These tests simulate complete user journeys from registration through match settlement, validating the full API flow across multiple endpoints.

## Architecture

### Files Created

1. **`c:\pick-rivals\apps\api\vitest.config.e2e.ts`**
   - Vitest configuration for E2E tests
   - Extends integration config with longer timeouts (60s)
   - Only runs `*.e2e.test.ts` files
   - Sequential execution to prevent race conditions

2. **`c:\pick-rivals\apps\api\test\helpers\e2e-setup.ts`**
   - Global setup/teardown for E2E tests
   - Creates test sports events in database
   - Extends integration setup with test fixtures
   - Runs once per test suite execution

3. **`c:\pick-rivals\apps\api\test\e2e\match-flow.e2e.test.ts`**
   - Complete match flow tests
   - Happy path: registration → match → settlement
   - Failure scenarios: insufficient balance, invalid slips, duplicates

### Test Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     E2E Test Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User Registration (POST /api/v1/auth/register)              │
│     ├─ Creates user account                                      │
│     ├─ Issues JWT tokens                                         │
│     └─ Creates wallet with starter balance                       │
│                                                                   │
│  2. Slip Creation (POST /api/v1/slips)                           │
│     ├─ User 1 creates slip with picks                            │
│     ├─ User 2 creates slip with picks                            │
│     └─ Both slips reference test events                          │
│                                                                   │
│  3. Slip Locking (POST /api/v1/slips/:id/lock)                   │
│     ├─ Lock User 1 slip (DRAFT → PENDING)                        │
│     └─ Lock User 2 slip (DRAFT → PENDING)                        │
│                                                                   │
│  4. Matchmaking Queue (POST /api/v1/matchmaking/queue)           │
│     ├─ User 1 joins queue with stake                             │
│     ├─ User 2 joins queue with stake                             │
│     └─ Debit-first: coins deducted on queue entry                │
│                                                                   │
│  5. Match Creation (Simulated Worker)                            │
│     ├─ Matchmaking logic pairs users                             │
│     ├─ Creates Match record (status: LOCKED)                     │
│     └─ Links both slips to match                                 │
│                                                                   │
│  6. Event Completion (Database Update)                           │
│     ├─ Update events to COMPLETED status                         │
│     ├─ Set homeScore and awayScore                               │
│     └─ Triggers settlement eligibility                           │
│                                                                   │
│  7. Match Settlement (Settlement Service)                        │
│     ├─ Evaluate all picks against results                        │
│     ├─ Calculate slip scores                                     │
│     ├─ Determine winner                                          │
│     ├─ Execute financial settlement (atomic)                     │
│     └─ Update match status to SETTLED                            │
│                                                                   │
│  8. Verification                                                 │
│     ├─ Match status = SETTLED                                    │
│     ├─ Winner determined correctly                               │
│     ├─ Winner wallet balance increased                           │
│     ├─ Loser wallet balance decreased                            │
│     └─ Transactions recorded (MATCH_ENTRY, MATCH_WIN)            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Running E2E Tests

### Prerequisites

1. PostgreSQL test database running
2. Redis test instance running
3. Environment variables configured (`.env.test` or `.env`)

### Commands

```bash
# Run all E2E tests once
pnpm test:e2e

# Run E2E tests in watch mode (development)
pnpm test:e2e:watch

# Run E2E tests with coverage
pnpm test:e2e:coverage
```

### Environment Setup

Create `.env.test` in `apps/api/`:

```env
NODE_ENV=test
DATABASE_URL=postgresql://user:password@localhost:5432/pickrivals_test
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=15

JWT_ACCESS_SECRET=test-access-secret
JWT_REFRESH_SECRET=test-refresh-secret
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

## Test Coverage

### Happy Path Tests

#### Full Match Flow
- **Test**: `should complete full match flow: registration -> match -> settlement`
- **Steps**:
  1. Register two users via API
  2. Create slips with picks for both users
  3. Lock both slips
  4. Join matchmaking queue
  5. Simulate matchmaking (create match)
  6. Complete events with scores
  7. Trigger settlement
  8. Verify winner, balances, and transactions

#### Draw Scenario
- **Test**: `should handle draw scenario correctly`
- **Steps**:
  1. Create identical slips for two users
  2. Complete full match flow
  3. Verify match status = DRAW
  4. Verify both users refunded

### Failure Scenario Tests

#### Insufficient Balance
- **Test**: `should reject queue entry with insufficient balance`
- **Expected**: 400 Bad Request with INSUFFICIENT_BALANCE error
- **Validates**: Wallet balance checks before queue entry

#### Invalid Slip (No Picks)
- **Test**: `should reject queue entry with invalid slip (no picks)`
- **Expected**: 400 Bad Request
- **Validates**: Slip must have at least one pick

#### Non-Existent Slip
- **Test**: `should reject queue entry with non-existent slip`
- **Expected**: 404 Not Found
- **Validates**: Slip existence check

#### Duplicate Queue Entry
- **Test**: `should reject duplicate queue entry with same slip`
- **Expected**: 409 Conflict with ALREADY_IN_QUEUE error
- **Validates**: User cannot join queue twice with same slip

#### Unauthenticated Request
- **Test**: `should reject unauthenticated queue entry`
- **Expected**: 401 Unauthorized
- **Validates**: Authentication required for protected endpoints

## Test Data Management

### Test Events

E2E setup creates 4 test sports events:
- **NFL**: Kansas City Chiefs vs Buffalo Bills
- **NBA**: Los Angeles Lakers vs Boston Celtics
- **MLB**: New York Yankees vs Los Angeles Dodgers
- **NHL**: Toronto Maple Leafs vs Montreal Canadiens

All events:
- Scheduled for tomorrow
- Status: SCHEDULED
- Include complete odds data (moneyline, spread, totals)

### Cleanup Strategy

- **afterEach**: Database reset + test events recreated
- **afterAll**: Disconnect Prisma and Redis
- **Isolation**: Each test gets fresh database state

## Helper Functions

### User Registration
```typescript
async function registerTestUser(username?: string, email?: string): Promise<TestUser>
```
- Generates unique email/username
- Calls `/api/v1/auth/register`
- Returns TestUser with tokens and wallet info

### Slip Creation
```typescript
async function createSlip(user: TestUser, eventIds: string[], slipName?: string): Promise<string>
```
- Creates slip with picks for given events
- Alternates picks between home/away
- Returns slip ID

### Matchmaking Simulation
```typescript
async function simulateMatchmaking(
  user1Id: string,
  user2Id: string,
  slip1Id: string,
  slip2Id: string,
  stakeAmount: number
): Promise<string>
```
- Directly creates match in database
- Simulates what matchmaking worker does
- Returns match ID

### Settlement Trigger
```typescript
async function settleMatch(matchId: string): Promise<void>
```
- Imports settlement service
- Calls `settleMatchById(matchId)`
- Triggers full settlement flow

## Best Practices

### 1. Test Isolation
- Each test creates its own users and slips
- Database reset after each test
- No shared state between tests

### 2. Realistic Flows
- Use actual API endpoints (Supertest)
- Validate HTTP status codes
- Check response body structure
- Verify database state changes

### 3. Error Handling
- Test both success and failure paths
- Validate error codes and messages
- Ensure proper HTTP status codes

### 4. Data Integrity
- Verify wallet balances before/after operations
- Check transaction records
- Validate match status transitions

### 5. Timeouts
- 60-second test timeout (covers multiple API calls)
- 60-second hook timeout (database cleanup)
- Sequential execution (no race conditions)

## Troubleshooting

### Tests Timing Out
- Check database connectivity
- Verify Redis is running
- Increase timeout in `vitest.config.e2e.ts`

### Event ID Errors
- Ensure `e2e-setup.ts` creates events successfully
- Check `afterEach` recreates events
- Verify event IDs are valid UUIDs

### Balance Errors
- Verify starter balance granted on registration
- Check wallet transactions are atomic
- Ensure cleanup resets wallets

### Settlement Failures
- Check all events have COMPLETED status
- Verify picks have valid predictions
- Ensure match status is LOCKED before settlement

## Future Enhancements

1. **Socket.IO Testing**: Test real-time match updates
2. **Ranked Mode**: E2E tests for ranked matchmaking
3. **Friend Challenges**: Test direct friend challenge flow
4. **Admin Actions**: Test manual settlement and void scenarios
5. **Dispute Flow**: Test dispute creation and resolution
6. **Performance Tests**: Load test with concurrent users

## Related Documentation

- [Integration Tests](../helpers/integration-setup.ts)
- [Settlement Service](../../src/services/settlement/settlement.service.ts)
- [Matchmaking Service](../../src/services/matchmaking.service.ts)
- [API Architecture](../../src/app.ts)
