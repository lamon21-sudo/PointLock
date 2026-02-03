# Ranked Service Usage Guide

## Quick Reference

### Import the Service
```typescript
import {
  getOrCreateSeasonEntry,
  calculateNewRank,
  updateRankPoints,
  distributeSeasonRewards,
} from './services/ranked.service';
```

---

## Usage Examples

### 1. Create/Get Season Entry (On Match Join)

```typescript
// When a user joins their first ranked match of the season
async function onUserJoinRankedMatch(userId: string, seasonId: string) {
  try {
    const entry = await getOrCreateSeasonEntry(userId, seasonId);

    console.log(`User entry created/retrieved`);
    console.log(`- Placement matches: ${entry.placementMatchesPlayed}/10`);
    console.log(`- Current rank: ${entry.currentRank ?? 'UNRANKED'}`);
    console.log(`- Rank points: ${entry.rankPoints}`);

    return entry;
  } catch (error) {
    if (error.statusCode === 404) {
      // Season not found
      console.error('Season does not exist');
    } else if (error.statusCode === 400) {
      // Season not active
      console.error('Season is not active or ended');
    }
    throw error;
  }
}
```

---

### 2. Update Rank Points (On Match Settlement)

```typescript
// After a match is settled, update RP for both players
async function onMatchSettled(match: Match) {
  const matchResult = {
    matchId: match.id,
    seasonId: match.seasonId,
    winnerId: match.winnerId,
    loserId: match.loserId,
    isDraw: match.winnerId === null,
    settledAt: match.settledAt,
  };

  // Update winner
  if (match.winnerId) {
    const winnerResult = await updateRankPoints(match.winnerId, matchResult);

    console.log(`Winner RP Update:`);
    console.log(`- Change: +${winnerResult.rpChange} RP`);
    console.log(`- New RP: ${winnerResult.rpAfter}`);
    console.log(`- New Rank: ${winnerResult.rankAfter}`);

    if (winnerResult.isPlacement) {
      console.log(`- Placement: ${winnerResult.rpBefore}/10 matches`);
    }

    if (winnerResult.rankBefore !== winnerResult.rankAfter && !winnerResult.isPlacement) {
      console.log(`🎉 RANK UP! ${winnerResult.rankBefore} → ${winnerResult.rankAfter}`);
      // Trigger rank-up notification
    }
  }

  // Update loser
  if (match.loserId) {
    const loserResult = await updateRankPoints(match.loserId, matchResult);

    console.log(`Loser RP Update:`);
    console.log(`- Change: ${loserResult.rpChange} RP`);
    console.log(`- New RP: ${loserResult.rpAfter}`);
    console.log(`- New Rank: ${loserResult.rankAfter}`);

    if (loserResult.rankBefore !== loserResult.rankAfter && !loserResult.isPlacement) {
      console.log(`⬇️ RANK DOWN! ${loserResult.rankBefore} → ${loserResult.rankAfter}`);
      // Trigger rank-down notification
    }
  }
}
```

---

### 3. Handle Placement Completion

```typescript
async function handlePlacementCompletion(result: RankUpdateResult) {
  if (result.isPlacement && result.rankAfter !== null) {
    // User just completed 10th placement match
    console.log(`Placement complete for user ${result.userId}!`);
    console.log(`- Initial rank: ${result.rankAfter}`);
    console.log(`- Starting RP: ${result.rpAfter}`);

    // Send placement complete notification
    await sendNotification(result.userId, {
      type: 'PLACEMENT_COMPLETE',
      title: 'Placement Complete!',
      body: `You've been placed in ${result.rankAfter}. Good luck!`,
      data: {
        rank: result.rankAfter,
        rp: result.rpAfter,
      },
    });
  }
}
```

---

### 4. Calculate Rank from RP (UI Preview)

```typescript
// Show user what rank they'll achieve at X RP
function showRankPreview(currentRP: number) {
  const nextMilestones = [
    { rp: 300, rank: calculateNewRank(300) },
    { rp: 600, rank: calculateNewRank(600) },
    { rp: 900, rank: calculateNewRank(900) },
    { rp: 1200, rank: calculateNewRank(1200) },
  ];

  const nextMilestone = nextMilestones.find(m => m.rp > currentRP);

  if (nextMilestone) {
    const rpNeeded = nextMilestone.rp - currentRP;
    const winsNeeded = Math.ceil(rpNeeded / 25);

    console.log(`Next rank: ${nextMilestone.rank}`);
    console.log(`RP needed: ${rpNeeded}`);
    console.log(`Wins needed: ~${winsNeeded}`);
  }
}
```

---

### 5. Distribute Season Rewards (Admin Only)

```typescript
// Cron job or admin endpoint
async function endSeasonAndDistributeRewards(seasonId: string) {
  try {
    // Step 1: End the season (admin endpoint)
    await prisma.season.update({
      where: { id: seasonId },
      data: { status: 'ENDED' },
    });

    console.log(`Season ${seasonId} ended. Starting reward distribution...`);

    // Step 2: Distribute rewards
    const result = await distributeSeasonRewards(seasonId);

    console.log(`\n=== Reward Distribution Complete ===`);
    console.log(`Total players: ${result.totalEntries}`);
    console.log(`Rewards claimed: ${result.rewardsClaimed}`);
    console.log(`Total coins distributed: ${result.totalCoinsDistributed}`);

    if (result.errors.length > 0) {
      console.error(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.error(`${i + 1}. ${err}`);
      });
    }

    // Step 3: Archive the season
    await prisma.season.update({
      where: { id: seasonId },
      data: { status: 'ARCHIVED' },
    });

    return result;
  } catch (error) {
    console.error('Failed to distribute season rewards:', error);
    throw error;
  }
}
```

---

## Integration with Match Service

### Example: Match Settlement Hook

```typescript
// In match-settlement.service.ts
import { updateRankPoints } from '../services/ranked.service';

async function settleMatch(matchId: string) {
  // ... existing settlement logic

  // Get match details
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { season: true },
  });

  if (!match) {
    throw new NotFoundError('Match not found');
  }

  // Only update RP for ranked matches
  if (match.season && match.seasonId) {
    const matchResult = {
      matchId: match.id,
      seasonId: match.seasonId,
      winnerId: match.winnerId,
      loserId: match.loserId,
      isDraw: match.winnerId === null,
      settledAt: match.settledAt ?? new Date(),
    };

    // Update both players' RP (parallel for performance)
    const results = await Promise.allSettled([
      match.winnerId ? updateRankPoints(match.winnerId, matchResult) : null,
      match.loserId ? updateRankPoints(match.loserId, matchResult) : null,
    ]);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(
          `Failed to update RP for player ${index === 0 ? 'winner' : 'loser'}:`,
          result.reason
        );
      }
    });
  }
}
```

---

## Error Handling Best Practices

### 1. Handle Idempotency

```typescript
// Idempotent calls return cached results
const result1 = await updateRankPoints(userId, matchResult);
const result2 = await updateRankPoints(userId, matchResult); // Same result

console.log(result1.isIdempotent); // false
console.log(result2.isIdempotent); // true
```

### 2. Handle Missing Season Entry

```typescript
try {
  const result = await updateRankPoints(userId, matchResult);
} catch (error) {
  if (error instanceof NotFoundError && error.message.includes('Season entry')) {
    // Create entry first
    await getOrCreateSeasonEntry(userId, matchResult.seasonId);

    // Retry
    const result = await updateRankPoints(userId, matchResult);
  }
}
```

### 3. Handle Reward Distribution Failures

```typescript
const result = await distributeSeasonRewards(seasonId);

if (result.errors.length > 0) {
  // Log for manual review
  await logToSlack(`Season ${seasonId} had ${result.errors.length} reward failures`);

  // Store failed user IDs for retry
  const failedUserIds = result.errors
    .map(err => err.match(/user (\S+)/)?.[1])
    .filter(Boolean);

  // Retry logic or manual intervention
  await retryFailedRewards(seasonId, failedUserIds);
}
```

---

## Performance Tips

### 1. Batch RP Updates

```typescript
// When settling multiple matches at once
async function settleManyMatches(matches: Match[]) {
  const rpUpdates = matches.flatMap(match => {
    const matchResult = { /* ... */ };
    return [
      match.winnerId ? updateRankPoints(match.winnerId, matchResult) : null,
      match.loserId ? updateRankPoints(match.loserId, matchResult) : null,
    ].filter(Boolean);
  });

  // Limit concurrency to avoid overwhelming DB
  const results = await pLimit(10).map(rpUpdates, async (update) => update);
}
```

### 2. Cache Rank Thresholds

```typescript
// Client-side rank progression UI
const RANK_THRESHOLDS = {
  BRONZE_1: 0,
  BRONZE_2: 100,
  BRONZE_3: 200,
  // ... rest of ranks
};

function getNextRank(currentRank: Rank, currentRP: number) {
  const ranks = Object.keys(RANK_THRESHOLDS);
  const currentIndex = ranks.indexOf(currentRank);
  const nextRank = ranks[currentIndex + 1];

  if (nextRank) {
    return {
      rank: nextRank,
      rpNeeded: RANK_THRESHOLDS[nextRank] - currentRP,
    };
  }

  return null; // Max rank
}
```

---

## Testing Examples

### Unit Test: calculateNewRank

```typescript
describe('calculateNewRank', () => {
  test('returns correct rank for exact threshold', () => {
    expect(calculateNewRank(600)).toBe(Rank.GOLD_1);
    expect(calculateNewRank(1200)).toBe(Rank.DIAMOND_1);
  });

  test('returns correct rank for mid-range RP', () => {
    expect(calculateNewRank(650)).toBe(Rank.GOLD_1);
    expect(calculateNewRank(1450)).toBe(Rank.DIAMOND_2);
  });

  test('returns BRONZE_1 for 0 RP', () => {
    expect(calculateNewRank(0)).toBe(Rank.BRONZE_1);
  });

  test('returns DIAMOND_3 for max RP', () => {
    expect(calculateNewRank(9999)).toBe(Rank.DIAMOND_3);
  });
});
```

### Integration Test: Full Placement Flow

```typescript
describe('Placement Matches', () => {
  test('completes 10 placement matches and assigns rank', async () => {
    const userId = 'test-user';
    const seasonId = 'test-season';

    // Create entry
    await getOrCreateSeasonEntry(userId, seasonId);

    // Simulate 10 matches (8 wins, 2 losses)
    const wins = 8;
    for (let i = 0; i < 10; i++) {
      const result = await updateRankPoints(userId, {
        matchId: `match-${i}`,
        seasonId,
        winnerId: i < wins ? userId : 'opponent',
        loserId: i < wins ? 'opponent' : userId,
        isDraw: false,
        settledAt: new Date(),
      });

      if (i < 9) {
        expect(result.isPlacement).toBe(true);
        expect(result.rpChange).toBe(0);
        expect(result.rankAfter).toBeNull();
      } else {
        // 10th match
        expect(result.isPlacement).toBe(true);
        expect(result.rankAfter).toBe(Rank.GOLD_3); // 8 wins
        expect(result.rpAfter).toBe(800); // GOLD_3 threshold
      }
    }
  });
});
```

---

## Common Pitfalls

### ❌ DON'T: Call updateRankPoints before creating entry
```typescript
// This will fail
await updateRankPoints(userId, matchResult); // NotFoundError
```

### ✅ DO: Create entry first
```typescript
await getOrCreateSeasonEntry(userId, seasonId);
await updateRankPoints(userId, matchResult);
```

---

### ❌ DON'T: Distribute rewards multiple times
```typescript
// Second call will duplicate rewards
await distributeSeasonRewards(seasonId);
await distributeSeasonRewards(seasonId); // Some users already claimed
```

### ✅ DO: Check season status first
```typescript
const season = await prisma.season.findUnique({ where: { id: seasonId } });
if (season.status === 'ENDED' && !season.rewardsDistributed) {
  await distributeSeasonRewards(seasonId);
  await prisma.season.update({
    where: { id: seasonId },
    data: { rewardsDistributed: true },
  });
}
```

---

### ❌ DON'T: Assume Rank enum values match between Prisma and shared-types
```typescript
// Type mismatch
const rank: SharedTypesRank = prismaRank; // Error
```

### ✅ DO: Use type assertions when necessary
```typescript
const rank = prismaRank as any; // Runtime values are identical
```

---

## Monitoring & Alerts

### Metrics to Track

1. **RP Update Latency**: Time to process updateRankPoints()
2. **Idempotency Hit Rate**: % of duplicate RP update calls
3. **Placement Completion Rate**: % of users completing 10 matches
4. **Reward Distribution Failures**: Count of errors in distributeSeasonRewards()
5. **Rank Distribution**: Count of users per rank

### Sample Monitoring Code

```typescript
// Track RP update latency
const start = Date.now();
const result = await updateRankPoints(userId, matchResult);
const latency = Date.now() - start;

metrics.histogram('ranked.rp_update_latency', latency);
metrics.increment('ranked.rp_updates', {
  outcome: result.outcome,
  isPlacement: result.isPlacement,
  isIdempotent: result.isIdempotent,
});

if (latency > 1000) {
  logger.warn(`Slow RP update: ${latency}ms for user ${userId}`);
}
```

---

## Production Deployment Checklist

- [ ] Database migrations applied
- [ ] shared-types package built and deployed
- [ ] Environment variables configured
- [ ] Monitoring dashboards created
- [ ] Alerting rules configured
- [ ] Admin endpoints protected
- [ ] Rate limiting applied
- [ ] Cron job scheduled for season rewards
- [ ] Rollback plan documented
- [ ] Load testing completed

---

**Last Updated**: 2026-02-01
**Version**: 1.0.0
**Author**: Backend Engineering Team
