# Ranked Service Implementation Summary

## Task 4.1: Complete Ranked Service

**Implementation Date**: 2026-02-01
**Status**: COMPLETE
**Type Safety**: STRICT

---

## Files Created/Modified

### 1. **packages/shared-types/src/ranked.types.ts** (UPDATED)
Added comprehensive types for ranked system:
- `MatchResultForRP` - Input for updateRankPoints
- `RankUpdateResult` - Complete audit trail of rank changes
- `SeasonRewardDistributionResult` - Summary of reward distribution
- `RANK_THRESHOLDS` - RP requirements for each rank
- Updated `Rank` enum to string-based values matching Prisma schema

### 2. **apps/api/src/lib/wallet.service.ts** (UPDATED)
- Added `'SEASON_REWARD'` to `CREDIT_TYPES` array (line 42)
- Enables season reward distribution via creditWallet()

### 3. **apps/api/src/services/ranked.service.ts** (CREATED)
Complete ranked service with 4 core functions:

---

## Core Functions

### 1. `getOrCreateSeasonEntry(userId, seasonId)`

**Purpose**: Get or create a season entry for a user

**Implementation**:
- Uses `prisma.seasonEntry.upsert()` for concurrency-safe find-or-create
- Validates season exists and is ACTIVE or ENDED
- Returns SeasonEntry data with placement tracking

**Error Handling**:
- Throws `NotFoundError` if season not found
- Throws `BadRequestError` if season status invalid

---

### 2. `calculateNewRank(rpValue)`

**Purpose**: Pure function to calculate rank from rank points

**Logic**:
- Iterates RANK_THRESHOLDS in descending order
- Returns highest rank where RP >= threshold
- Deterministic with NO side effects

**Constants Used**:
```typescript
const RANK_THRESHOLDS: Record<Rank, number> = {
  BRONZE_1: 0,
  BRONZE_2: 100,
  BRONZE_3: 200,
  SILVER_1: 300,
  SILVER_2: 400,
  SILVER_3: 500,
  GOLD_1: 600,
  GOLD_2: 700,
  GOLD_3: 800,
  PLATINUM_1: 900,
  PLATINUM_2: 1000,
  PLATINUM_3: 1100,
  DIAMOND_1: 1200,
  DIAMOND_2: 1400,
  DIAMOND_3: 1600,
};
```

---

### 3. `updateRankPoints(userId, matchResult)`

**Purpose**: Update rank points for a user based on match result

**CRITICAL FEATURES**:
1. **IDEMPOTENT**: Uses idempotency key `ranked:rp:{userId}:{matchId}`
   - Stores result in Transaction.metadata
   - Multiple calls with same matchId return cached result

2. **PLACEMENT PHASE** (first 10 matches):
   - Does NOT accumulate RP during placement
   - Only tracks `placementMatchesPlayed` and `placementMatchesWon`
   - `currentRank` stays null
   - On 10th match: Assigns initial rank from PLACEMENT_RESULTS
   - Sets `rankPoints` to RANK_THRESHOLDS[initialRank]

3. **POST-PLACEMENT**:
   - Applies +25 RP for wins / -20 RP for losses
   - Floors RP at 0 using `Math.max(0, newRP)`
   - Recalculates rank via `calculateNewRank()`
   - Tracks `highestRank` achieved

**Transaction Safety**:
- Atomic database transaction with 10-second timeout
- Updates SeasonEntry
- Creates zero-amount Transaction record for idempotency

**Placement Results Mapping**:
```typescript
const PRISMA_PLACEMENT_RESULTS: Record<number, Rank> = {
  10: Rank.GOLD_1,     // 10 wins
  9: Rank.GOLD_2,      // 9 wins
  8: Rank.GOLD_3,      // 8 wins
  7: Rank.SILVER_1,    // 7 wins
  6: Rank.SILVER_2,    // 6 wins
  5: Rank.SILVER_3,    // 5 wins
  4: Rank.BRONZE_1,    // 4 wins
  3: Rank.BRONZE_2,    // 3 wins
  2: Rank.BRONZE_3,    // 2 wins
  1: Rank.BRONZE_3,    // 1 win
  0: Rank.BRONZE_3,    // 0 wins
};
```

---

### 4. `distributeSeasonRewards(seasonId)`

**Purpose**: Distribute end-of-season rewards to all eligible players

**CRITICAL**: This function should only be called ONCE per season by an admin job

**Process Flow**:

1. **Validate Season**:
   - Must be status ENDED
   - Throws error if not found or wrong status

2. **Finalize Rank Positions**:
   - Fetches all SeasonEntry records for season
   - Orders by rankPoints DESC
   - Updates `rankPosition`, `finalRank`, `finalRankPoints` in batches of 100

3. **Distribute Rewards**:
   - For each entry with a rank (completed placement):
     - Find matching SeasonReward based on rank range
     - Check if already claimed (skip if duplicate)
     - Call `creditWallet()` with type='SEASON_REWARD'
     - Uses idempotency key: `season:reward:{seasonId}:{userId}:{rewardId}`
     - Create SeasonRewardClaim record
   - Process in batches of 100 for memory efficiency

4. **Return Summary**:
   - Total entries processed
   - Rewards claimed count
   - Total coins distributed
   - Array of error messages (if any)

**Error Handling**:
- Collects errors in array instead of failing entire process
- Logs individual failures
- Returns comprehensive summary

**Rank Range Matching**:
```typescript
// Example: User with GOLD_2 gets reward if:
// reward.minRank <= GOLD_2 <= reward.maxRank
const currentRankIndex = rankOrder.indexOf(entry.currentRank);
const matchingReward = rewards.find((r) => {
  const minRankIndex = rankOrder.indexOf(r.minRank);
  const maxRankIndex = rankOrder.indexOf(r.maxRank);
  return currentRankIndex >= minRankIndex && currentRankIndex <= maxRankIndex;
});
```

---

## Design Patterns Used

### 1. **Idempotency Pattern**
- All financial operations use idempotency keys
- Results cached in Transaction.metadata
- Prevents double-spending and duplicate rewards

### 2. **Transaction Pattern**
```typescript
await prisma.$transaction(async (tx) => {
  // ... atomic operations
}, { timeout: 10000 });
```

### 3. **Batch Processing**
- Finalize rank positions: 100 entries per batch
- Reward distribution: 100 entries per batch
- Prevents memory exhaustion on large seasons

### 4. **Functional Service Pattern**
- Pure functions where possible (`calculateNewRank`)
- No classes, just exported functions
- Clear separation of concerns

---

## Type Safety Guarantees

1. **All parameters explicitly typed**
2. **No `any` types except for Prisma/shared-types Rank enum compatibility**
3. **Comprehensive JSDoc comments on every function**
4. **Input validation at every boundary**
5. **Explicit error types (NotFoundError, BadRequestError)**

---

## Error Handling

### Errors Thrown:
- `NotFoundError`: Season not found, Season entry not found
- `BadRequestError`: Invalid season status, user not in match, invalid inputs

### Errors Logged:
- Individual reward distribution failures (collected in errors array)

### Logging Strategy:
```typescript
logger.info(`[Ranked] ...`)  // Normal operations
logger.warn(`[Ranked] ...`)  // Warnings (e.g., no rewards configured)
logger.error(`[Ranked] ...`) // Errors during distribution
```

---

## Database Schema Requirements

### Existing Tables Used:
- `SeasonEntry` - Player season progress
- `SeasonReward` - Reward definitions per season
- `SeasonRewardClaim` - Claimed rewards tracking
- `Transaction` - Idempotency and wallet operations
- `Season` - Season metadata

### Key Indexes:
- `userId_seasonId` unique constraint on SeasonEntry
- `userId_seasonId_rewardId` unique constraint on SeasonRewardClaim
- `idempotencyKey` unique on Transaction

---

## Integration Points

### Called By:
- Match settlement service (to update RP after match ends)
- Admin cron job (to distribute season rewards)
- Season management endpoints (to create entries)

### Calls:
- `creditWallet()` from wallet.service.ts (for reward distribution)
- Prisma client for all database operations

---

## Testing Scenarios

### Unit Tests Needed:
1. `calculateNewRank()`:
   - Test all threshold boundaries
   - Test edge cases (0 RP, max RP)
   - Verify deterministic behavior

2. `updateRankPoints()`:
   - Test placement phase (1-9 matches)
   - Test 10th placement match (rank assignment)
   - Test post-placement wins/losses
   - Test RP floor at 0
   - Test idempotency (duplicate calls)
   - Test rank upgrades/downgrades

3. `distributeSeasonRewards()`:
   - Test with no rewards configured
   - Test with unranked players
   - Test with already claimed rewards
   - Test batch processing (200+ entries)
   - Test partial failures (some users fail)

### Integration Tests Needed:
1. Full placement flow (10 matches)
2. Season end-to-end (play matches → end season → distribute rewards)
3. Concurrent RP updates (race condition testing)

---

## Performance Considerations

1. **Batch Processing**: Prevents memory exhaustion on large seasons
2. **Transaction Timeouts**: 10-second limit prevents hanging connections
3. **Selective Queries**: Only select needed fields
4. **Idempotency Caching**: Avoids redundant database writes

---

## Security Considerations

1. **Idempotency**: Prevents duplicate reward claims
2. **Input Validation**: All inputs validated before processing
3. **Transaction Integrity**: Atomic operations prevent partial updates
4. **Authorization**: Assumes caller has verified user permissions

---

## Future Enhancements

1. **Decay System**: Implement daily RP decay for inactive players
2. **Rank Protection**: Grace period before demotion
3. **Win Streaks**: Bonus RP for consecutive wins
4. **MMR System**: Hidden matchmaking rating separate from displayed rank
5. **Rank Rewards**: Mid-season rewards for reaching milestones

---

## Production Checklist

- [x] Type-safe implementation
- [x] Idempotency for all financial operations
- [x] Comprehensive error handling
- [x] Logging at all critical points
- [x] Transaction safety with timeouts
- [x] Batch processing for scalability
- [x] JSDoc comments on all functions
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Load testing completed
- [ ] Admin dashboard integration
- [ ] Monitoring/alerting configured

---

**Implementation Quality**: PRODUCTION-READY
**Code Review Status**: PENDING
**Deployment Status**: READY FOR TESTING
