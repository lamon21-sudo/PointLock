# Ranked API Module

## Overview
Provides client-facing APIs for tracking ranked placement progress and post-placement progression stats.

## Endpoints

### GET `/api/v1/ranked/season/:seasonId/placement`
Get placement match status and full audit trail for the authenticated user.

**Authentication**: Required (Bearer token)

**Parameters**:
- `seasonId` (path): UUID of the season

**Response** (`PlacementStatus`):
```json
{
  "success": true,
  "data": {
    "seasonId": "uuid",
    "isPlaced": false,
    "placementMatchesPlayed": 7,
    "placementMatchesRemaining": 3,
    "placementMatchesWon": 4,
    "currentRank": null,
    "initialRank": null,
    "placedAt": null,
    "rankPoints": 0,
    "matches": [
      {
        "matchNumber": 1,
        "matchId": "match-uuid",
        "outcome": "WIN",
        "processedAt": "2026-02-01T12:00:00.000Z",
        "rankAssigned": null
      }
    ]
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid auth token
- `404 Not Found`: User has not participated in this season
- `400 Bad Request`: Invalid seasonId format

**Use Cases**:
- Display "X/10 placement matches complete" progress bar
- Show match-by-match win/loss history during placement
- Display assigned rank after 10th match completion

---

### GET `/api/v1/ranked/season/:seasonId/progress`
Get ranked progression stats for the authenticated user (post-placement).

**Authentication**: Required (Bearer token)

**Parameters**:
- `seasonId` (path): UUID of the season

**Response** (`RankedProgress`):
```json
{
  "success": true,
  "data": {
    "seasonId": "uuid",
    "isPlaced": true,
    "currentRank": "GOLD_2",
    "highestRank": "GOLD_3",
    "rankPoints": 750,
    "rpToNextRank": 50,
    "rpFromDemotion": 50,
    "wins": 15,
    "losses": 8,
    "draws": 2,
    "winRate": 0.6
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid auth token
- `404 Not Found`: User has not participated in this season
- `400 Bad Request`: Invalid seasonId format

**Use Cases**:
- Display rank badge with current rank
- Show "50 RP to next rank" progress bar
- Display W/L record and win rate statistics
- Track peak rank achieved during season

## Data Flow

### Placement Phase (Matches 1-10):
1. User completes match
2. Match settles → `updateRankPoints()` called
3. `PlacementMatch` record created with audit data
4. On 10th match: `isPlaced` flag set, rank assigned
5. Client calls `/placement` endpoint → Shows completion + assigned rank

### Post-Placement Phase:
1. User completes match
2. Match settles → Rank points updated
3. Client calls `/progress` endpoint → Shows current rank, RP, stats

## Service Layer

### `getPlacementStatus(userId: string, seasonId: string)`
Returns placement status with full match history.

**Throws**:
- `NotFoundError`: No SeasonEntry exists for user + season

**Query**:
- Includes `placementMatches` relation (up to 10 records)
- Ordered by `matchNumber` ascending

---

### `getRankedProgress(userId: string, seasonId: string)`
Calculates and returns ranked progression stats.

**Throws**:
- `NotFoundError`: No SeasonEntry exists for user + season

**Calculations**:
- `rpToNextRank`: Threshold for next rank - current RP
- `rpFromDemotion`: Current RP - threshold for current rank
- `winRate`: wins / (wins + losses + draws)

## Schema Dependencies

### `SeasonEntry` (required fields):
- `isPlaced`: Boolean flag indicating placement completion
- `placedAt`: Timestamp when placement completed
- `initialRank`: Rank assigned after placement
- `placementMatchesPlayed`: Counter (0-10)
- `placementMatchesWon`: Win counter during placement
- `rankPoints`: Current RP
- `currentRank`: Current rank (null during placement)
- `highestRank`: Peak rank achieved
- `wins`, `losses`, `draws`: Match record

### `PlacementMatch` (audit table):
- `seasonEntryId`: FK to SeasonEntry
- `matchId`: Reference to Match
- `matchNumber`: 1-10 (match sequence)
- `outcome`: WIN | LOSS | DRAW
- `rpBefore`, `rpAfter`: RP state
- `rankAssigned`: Rank if this was 10th match, else null
- `processedAt`: Settlement timestamp

## Error Handling

### API Layer:
- Zod validates path parameters
- Express error middleware catches and formats errors
- Returns standard `ApiResponse` format

### Service Layer:
- Throws `NotFoundError` for missing entries
- No silent failures - explicit error types

### Integration Layer (Game Settlement):
- Ranked updates are fire-and-forget
- Errors logged but don't block match settlement
- Uses `Promise.allSettled()` for resilience

## Performance Notes

### Query Optimization:
- Placement endpoint: Single query with relation include (max 10 records)
- Progress endpoint: Single query, no joins
- Both use compound unique index: `(userId, seasonId)`

### Caching Opportunities:
- Placement status rarely changes (only on match settlement)
- Progress stats update per-match (consider short TTL cache)
- Consider Redis cache with match settlement invalidation

## Security

### Authentication:
- All endpoints require `requireAuth` middleware
- JWT token validated before service layer access

### Authorization:
- Users can only access their own data
- Service layer uses authenticated user ID from token
- No admin bypass (future: add admin endpoints separately)

### Input Validation:
- `seasonId` validated as UUID (Zod schema)
- Path parameters sanitized by Express

## Testing

### Unit Tests:
- Mock Prisma client in service tests
- Test calculations: rpToNextRank, winRate
- Test edge cases: 0 matches, 10 matches, incomplete placement

### Integration Tests:
- Test full request/response cycle
- Verify 404 on non-existent season entry
- Test authentication enforcement
- Verify data structure matches types

### Example Test:
```typescript
describe('GET /api/v1/ranked/season/:seasonId/placement', () => {
  it('returns placement status with match history', async () => {
    const response = await request(app)
      .get(`/api/v1/ranked/season/${seasonId}/placement`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.placementMatchesPlayed).toBeLessThanOrEqual(10);
    expect(response.body.data.matches).toHaveLength(response.body.data.placementMatchesPlayed);
  });

  it('returns 404 for non-existent season entry', async () => {
    const response = await request(app)
      .get(`/api/v1/ranked/season/${uuidv4()}/placement`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
```

## Future Enhancements

### Potential Additions:
1. **Batch endpoint**: Get placement status for all seasons
2. **Historical endpoint**: Get placement history across seasons
3. **Analytics endpoint**: Aggregate placement stats (avg wins to reach rank)
4. **Leaderboard integration**: Filter leaderboard by rank range
5. **Decay tracking**: Add decay warnings to progress response
6. **Placement predictions**: Show estimated rank based on current W/L

## Related Files

### Core Logic:
- `apps/api/src/services/ranked.service.ts` - Core RP calculation
- `apps/api/src/queues/game-settlement.queue.ts` - Settlement integration

### Types:
- `packages/shared-types/src/ranked.types.ts` - Shared type definitions
- `packages/shared-types/src/season.types.ts` - Season constants

### Database:
- `apps/api/prisma/schema.prisma` - Schema definitions
- `apps/api/prisma/migrations/20260201000000_add_placement_tracking/` - Migration
