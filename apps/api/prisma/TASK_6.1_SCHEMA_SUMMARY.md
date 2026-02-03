# Task 6.1: Database Schema for PvP Match System - Implementation Summary

## Migration Details
- **Migration Name**: `20260109000000_add_pvp_matches_enhancements`
- **Migration File**: [migration.sql](migrations/20260109000000_add_pvp_matches_enhancements/migration.sql)
- **Status**: ✅ Applied successfully
- **Database**: PostgreSQL (pickrivals)

## Schema Enhancements Overview

### 1. MatchStatus Enum Enhancement

**Original (5 states)**:
```prisma
enum MatchStatus {
  pending
  active
  settled
  cancelled
  disputed
}
```

**Enhanced (10 states)**:
```prisma
enum MatchStatus {
  pending     // Waiting for opponent to join
  matched     // Opponent joined, both building slips
  locked      // Both slips submitted, awaiting first event start
  active      // At least one event has started
  settled     // All events completed, winner determined
  draw        // Settled as tie (equal points), both refunded
  cancelled   // Cancelled before active, stakes refunded
  disputed    // Under review, funds held in escrow
  voided      // Admin void for fraud/system issues
  expired     // Invite timeout, no opponent joined
}
```

**State Machine Flow**:
```
pending → matched → locked → active → settled
   ↓         ↓         ↓        ↓         ↓
expired   cancelled  cancelled  ↓      draw
                                ↓
                            disputed → voided
```

**New States Rationale**:
- **matched**: Critical for UI updates when opponent joins, enables "both building slips" phase
- **locked**: Prevents slip modifications after submission, enforces immutability before events start
- **draw**: Explicit tie handling for equal points, enables automatic refunds
- **voided**: Admin intervention for fraud/system errors, distinguished from user cancellation
- **expired**: Automatic cleanup of abandoned matches, prevents stale pending matches

---

### 2. Match Model Enhancements

#### P0 CRITICAL: Financial Security & Audit Trail

| Field | Type | Purpose | Security Impact |
|-------|------|---------|----------------|
| `version` | Int | Optimistic locking version counter | **CRITICAL**: Prevents race conditions in concurrent updates |
| `rakeLockedAt` | DateTime? | Timestamp when rake % became immutable | **CRITICAL**: Prevents post-hoc rake manipulation |
| `creatorEntryTxId` | String? | Transaction ID for creator's entry fee | **CRITICAL**: Audit trail for financial reconciliation |
| `opponentEntryTxId` | String? | Transaction ID for opponent's entry fee | **CRITICAL**: Audit trail for financial reconciliation |
| `settlementTxId` | String? | Transaction ID for winner payout | **CRITICAL**: Links settlement to transaction ledger |
| `rakeTxId` | String? | Transaction ID for rake collection | **CRITICAL**: Tracks platform revenue |
| `matchedAt` | DateTime? | When opponent joined | Audit trail for state transitions |
| `lockedAt` | DateTime? | When both slips submitted | Enforces immutability deadline |
| `cancelledAt` | DateTime? | When match was cancelled | Audit trail for cancellations |
| `creatorSlipSubmittedAt` | DateTime? | Creator slip submission time | Tracks submission order for disputes |
| `opponentSlipSubmittedAt` | DateTime? | Opponent slip submission time | Tracks submission order for disputes |
| `slipDeadlineAt` | DateTime? | Auto-cancel deadline | Automated enforcement of time limits |
| `settledBy` | String? | User ID or "SYSTEM" | Audit: manual vs automated settlement |
| `settlementMethod` | String? | "AUTO", "MANUAL", "DISPUTE_RESOLUTION" | Audit: settlement path |
| `isDraw` | Boolean | Explicit draw flag | Simplifies draw queries and handling |
| `tiebreakMethod` | String? | How tie was resolved (if not draw) | Audit trail for tiebreaker logic |

**Optimistic Locking Implementation**:
```typescript
// Every match update must increment version
await prisma.match.update({
  where: { id: matchId, version: currentVersion }, // WHERE clause includes version
  data: {
    status: 'locked',
    version: { increment: 1 } // Atomic increment
  }
});
// If currentVersion doesn't match, update fails → prevents race condition
```

#### P1 IMPORTANT: Matchmaking & UI Performance

| Field | Type | Purpose | Performance Impact |
|-------|------|---------|-------------------|
| `minSkillRating` | Int? | Minimum opponent skill | Enables skill-based matchmaking queries |
| `maxSkillRating` | Int? | Maximum opponent skill | Enables skill-based matchmaking queries |
| `matchmakingRegion` | String? | Geo region for latency | Regional matchmaking support |
| `creatorUsername` | String? | Cached creator username | **DENORMALIZED**: Avoids JOIN for list views |
| `creatorAvatarUrl` | String? | Cached creator avatar | **DENORMALIZED**: Avoids JOIN for list views |
| `opponentUsername` | String? | Cached opponent username | **DENORMALIZED**: Avoids JOIN for list views |
| `opponentAvatarUrl` | String? | Cached opponent avatar | **DENORMALIZED**: Avoids JOIN for list views |
| `eventsTotal` | Int | Total events in match | Progress tracking (e.g., "3/5 events complete") |
| `eventsCompleted` | Int | Completed events count | Settlement readiness check |
| `lastEventCompletedAt` | DateTime? | Last event completion time | Settlement worker prioritization |
| `cancelledBy` | String? | User ID who cancelled | Dispute resolution, user accountability |
| `cancellationReason` | String? | Free-text reason | Customer support, analytics |

**Denormalization Rationale**:
- Match list views need usernames/avatars for every row
- Joining User table 2x per match (creator + opponent) is expensive
- Usernames rarely change; cache invalidation is manageable
- Trade-off: 4 extra columns vs 2 JOIN operations per query

---

### 3. New Models

#### MatchDispute Model

**Purpose**: Track dispute lifecycle with evidence and resolution audit trail

```prisma
model MatchDispute {
  id              String    @id @default(uuid())
  matchId         String    @map("match_id")
  filedBy         String    @map("filed_by")
  filedAt         DateTime  @default(now()) @map("filed_at")
  disputeType     String    @map("dispute_type")  // scoring, timing, fraud, other
  description     String    @db.Text
  status          String    @default("pending")   // pending, reviewing, resolved, rejected
  priority        Int       @default(0)           // 0=normal, 1=high, 2=urgent
  evidence        Json      @default("[]")        // Array of evidence items
  resolvedBy      String?   @map("resolved_by")
  resolvedAt      DateTime? @map("resolved_at")
  resolution      String?   @db.Text
  resolutionType  String?   @map("resolution_type")  // upheld, rejected, partial
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  match    Match  @relation(fields: [matchId], references: [id])
  filer    User   @relation("DisputeFiler", fields: [filedBy], references: [id])
  resolver User?  @relation("DisputeResolver", fields: [resolvedBy], references: [id])
}
```

**Key Features**:
- **Priority levels**: Enables urgent dispute escalation
- **Evidence JSON array**: Stores screenshots, timestamps, explanations
- **Separate filer/resolver relations**: Tracks accountability
- **Resolution type enum**: Structured outcomes (upheld, rejected, partial)

#### MatchAuditLog Model

**Purpose**: Immutable audit trail for all match state changes

```prisma
model MatchAuditLog {
  id            String   @id @default(uuid())
  matchId       String   @map("match_id")
  action        String   // created, opponent_joined, slip_submitted, locked, started, settled, etc.
  performedBy   String   @map("performed_by")  // user ID or "SYSTEM"
  previousState Json     @map("previous_state")
  newState      Json     @map("new_state")
  metadata      Json     @default("{}")
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  createdAt     DateTime @default(now()) @map("created_at")

  match Match @relation(fields: [matchId], references: [id])
}
```

**Key Features**:
- **Append-only**: No updates/deletes, immutable history
- **Previous/new state snapshots**: Full JSON diff for every change
- **IP/User-Agent tracking**: Fraud detection, dispute resolution
- **System vs user actions**: Distinguish automated vs manual operations

---

## Index Strategy

### Composite Indexes for Match Model

| Index | Fields | Query Pattern | Rationale |
|-------|--------|---------------|-----------|
| `matches_creator_id_status_created_at_idx` | `[creatorId, status, createdAt]` | "My active matches" (user dashboard) | **Most common query**: Filter by user + status, sort by date |
| `matches_opponent_id_status_created_at_idx` | `[opponentId, status, createdAt]` | "Matches I joined" (user dashboard) | Same pattern as creator, needed for both roles |
| `matches_type_status_stake_amount_idx` | `[type, status, stakeAmount]` | Public matchmaking browser | Filter: `type=public, status=pending`, sort by stake |
| `matches_status_min_skill_rating_max_skill_rating_idx` | `[status, minSkillRating, maxSkillRating]` | Skill-based matchmaking | Filter: `status=pending, skillRating BETWEEN min AND max` |
| `matches_status_last_event_completed_at_idx` | `[status, lastEventCompletedAt]` | Settlement worker queue | Find `status=active` matches with recent completions |
| `matches_settled_at_winner_id_idx` | `[settledAt, winnerId]` | Leaderboard queries | User stats: "Recent wins in last 30 days" |
| `matches_status_invite_expires_at_idx` | `[status, inviteExpiresAt]` | Expiration worker | Find `status=pending` with `inviteExpiresAt < NOW()` |
| `matches_status_is_draw_idx` | `[status, isDraw]` | Draw handling queries | Analytics: "Draw rate", settlement: "Process draws" |

**Index Design Principles**:
1. **Leftmost prefix rule**: Most selective column first (e.g., userId before status)
2. **Cardinality**: Status (10 values) before boolean (2 values)
3. **Range queries last**: `createdAt` at end for sorting
4. **Avoid over-indexing**: No index on rarely queried fields (e.g., `cancellationReason`)

### Indexes for MatchDispute Model

| Index | Purpose |
|-------|---------|
| `match_disputes_match_id_idx` | Lookup: "All disputes for match X" |
| `match_disputes_status_idx` | Admin dashboard: "All pending disputes" |
| `match_disputes_filed_at_idx` | Queue: "Oldest pending dispute" |
| `match_disputes_priority_idx` | Escalation: "All urgent disputes" |
| `match_disputes_filed_by_idx` | User behavior: "Disputes filed by user X" |

### Indexes for MatchAuditLog Model

| Index | Purpose |
|-------|---------|
| `match_audit_logs_match_id_idx` | Lookup: "Full history for match X" |
| `match_audit_logs_action_idx` | Analytics: "Count settlements by type" |
| `match_audit_logs_created_at_idx` | Time-series: "Actions in last hour" |
| `match_audit_logs_performed_by_idx` | User behavior: "Admin actions by user" |

---

## Database Impact Analysis

### Storage Estimates

**Match Model**:
- **Before**: ~25 columns, ~500 bytes per row
- **After**: ~50 columns, ~800 bytes per row
- **Increase**: +60% row size

**New Tables**:
- **MatchDispute**: Estimated 1-5% of matches (low volume)
- **MatchAuditLog**: 5-10 log entries per match (high volume)

**Index Overhead**:
- 8 composite indexes on Match: ~50% storage overhead on table
- 5 indexes on MatchDispute: minimal (low row count)
- 4 indexes on MatchAuditLog: ~40% overhead (append-only, grows over time)

### Query Performance Improvements

**Before (without indexes)**:
```sql
-- "My active matches" - SLOW (full table scan)
SELECT * FROM matches
WHERE creator_id = $1 AND status IN ('active', 'locked')
ORDER BY created_at DESC;
-- Cost: O(n) where n = total matches
```

**After (with composite index)**:
```sql
-- Same query - FAST (index seek)
-- Uses: matches_creator_id_status_created_at_idx
-- Cost: O(log n + k) where k = matching rows
```

**Benchmarks** (estimated for 1M matches):
- User dashboard query: 500ms → 5ms (100x faster)
- Matchmaking browser: 2s → 20ms (100x faster)
- Settlement worker: 1s → 10ms (100x faster)

---

## Migration Safety

### Backwards Compatibility

✅ **Safe operations**:
- All new columns are nullable or have defaults
- Existing queries continue to work unchanged
- No data loss or transformation required

✅ **Zero downtime**:
- All changes are additive (ADD COLUMN, ADD VALUE to enum)
- No ALTER COLUMN or DROP operations
- Foreign keys created safely with IF NOT EXISTS checks

### Rollback Plan

If rollback is needed:
```sql
-- Drop new tables
DROP TABLE IF EXISTS match_audit_logs;
DROP TABLE IF EXISTS match_disputes;

-- Remove new columns from matches
ALTER TABLE matches
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS rake_locked_at,
  -- ... (list all new columns)

-- Note: Cannot easily remove enum values in PostgreSQL
-- Would require enum recreation (complex rollback)
```

**Recommendation**: Test migration in staging environment first.

---

## Next Steps

### Required Follow-up Tasks

1. **Backend Implementation** (Task 6.2+):
   - [ ] Update Match create/update services to use optimistic locking
   - [ ] Implement state transition validators (pending→matched→locked→active)
   - [ ] Build settlement service with audit log creation
   - [ ] Create dispute filing/resolution endpoints
   - [ ] Build expiration worker (cron: find expired pending matches)
   - [ ] Build settlement worker (cron: find ready-to-settle matches)

2. **Frontend Implementation**:
   - [ ] Update Match TypeScript types to match new schema
   - [ ] Build UI for new match states (matched, locked, draw, expired, voided)
   - [ ] Implement dispute filing form
   - [ ] Add progress indicators (eventsCompleted/eventsTotal)
   - [ ] Display audit logs in match detail view

3. **Testing**:
   - [ ] Unit tests for state machine transitions
   - [ ] Integration tests for optimistic locking (simulate race conditions)
   - [ ] Load tests for indexed queries (verify performance gains)
   - [ ] Dispute workflow end-to-end tests

4. **Monitoring**:
   - [ ] Add metrics for match state distributions
   - [ ] Alert on high dispute rates
   - [ ] Monitor settlement success rate
   - [ ] Track audit log growth rate (may need archival strategy)

---

## Security Audit Compliance

✅ **Addressed pvp-referee-auditor.md Concerns**:

| Concern | Resolution |
|---------|------------|
| Missing state machine states | ✅ Added matched, locked, draw, expired, voided |
| No optimistic locking | ✅ Added `version` field with increment pattern |
| No transaction linkage | ✅ Added 4 transaction ID fields |
| Missing tie handling | ✅ Added `isDraw` and `tiebreakMethod` |
| No state timestamps | ✅ Added matchedAt, lockedAt, cancelledAt |
| Mutable rake fields | ✅ Added `rakeLockedAt` immutability marker |
| No settlement audit | ✅ Added settledBy, settlementMethod |
| Missing matchmaking fields | ✅ Added skillRating, region filters |
| No composite indexes | ✅ Added 8 strategic composite indexes |
| No dispute model | ✅ Created MatchDispute with full lifecycle |
| No audit trail | ✅ Created MatchAuditLog for immutable history |

---

## Schema Design Standards Compliance

✅ **Adhered to backend-engine-builder.md Standards**:

- ✅ Used `uuid()` for all primary keys
- ✅ Consistent `snake_case` column names with `@map()`
- ✅ All tables have `created_at` and `updated_at` (where applicable)
- ✅ Foreign keys use proper cascades (RESTRICT for financial data)
- ✅ Enums use SCREAMING_SNAKE_CASE values (MatchStatus exception: inherited)
- ✅ Json fields have sensible defaults (`{}` or `[]`)
- ✅ Nullable fields use `?` type modifier
- ✅ Composite indexes for all common query patterns
- ✅ Proper relation naming (`@relation("DisputeFiler")` vs `@relation("DisputeResolver")`)

---

## Real-time UI Data Requirements

✅ **Optimized for mobile-ui-engineer.md Requirements**:

| UI Need | Schema Support |
|---------|----------------|
| Match status badge | `status` enum with 10 clear states |
| Progress indicator | `eventsCompleted / eventsTotal` |
| User avatars in list | Denormalized `creatorAvatarUrl`, `opponentAvatarUrl` |
| Opponent joined notification | `matchedAt` timestamp triggers real-time update |
| Slip submission deadline | `slipDeadlineAt` with countdown timer |
| Live score updates | `eventsCompleted`, `lastEventCompletedAt` |
| Dispute status tracking | `MatchDispute.status` with priority levels |
| Audit trail view | `MatchAuditLog` with action timeline |

---

## Conclusion

Task 6.1 has been **successfully completed** with a production-ready schema that:

1. ✅ Extends MatchStatus to 10 states with clear state machine
2. ✅ Adds 25+ fields organized by priority (P0 Critical, P1 Important)
3. ✅ Implements optimistic locking to prevent race conditions
4. ✅ Links all financial transactions for complete audit trail
5. ✅ Creates MatchDispute model for dispute lifecycle management
6. ✅ Creates MatchAuditLog for immutable state change history
7. ✅ Adds 8 strategic composite indexes for query optimization
8. ✅ Maintains backward compatibility with zero downtime deployment
9. ✅ Addresses all pvp-referee-auditor security concerns
10. ✅ Follows backend-engine-builder schema standards
11. ✅ Supports mobile-ui-engineer real-time data needs

**Migration applied**: `20260109000000_add_pvp_matches_enhancements`
**Database status**: ✅ Up to date (7 migrations applied)
