# Task 8.5: Settlement Edge Cases - Implementation Plan

## Executive Summary

This plan addresses the high-risk financial task of handling settlement edge cases for PvP betting matches. Based on comprehensive analysis from the **pvp-referee-auditor** and **backend-engine-builder** agents, we have identified critical gaps in the current settlement infrastructure and defined a robust implementation strategy.

**Risk Level:** HIGH (Financial operations, user stakes)
**Affected Systems:** Settlement service, wallet service, queue system, admin API

---

## Current State Analysis

### What Exists
- Settlement service at `apps/api/src/services/settlement/settlement.service.ts`
- Wallet service with idempotency keys at `apps/api/src/lib/wallet.service.ts`
- Queue system with BullMQ at `apps/api/src/queues/game-settlement.queue.ts`
- Optimistic locking via `version` field on Match and Wallet
- Comprehensive audit logging via `MatchAuditLog` table
- Pick result determination for moneyline/spread/total with PUSH detection

### Critical Gaps Identified
1. **No void settlement handler** - Cancelled events leave matches in limbo
2. **Event status race condition** - Settlement doesn't re-check event status in transaction
3. **No postponed event monitoring** - No cron job to handle postponement timeouts
4. **No admin settlement endpoints** - No RBAC or manual override capability
5. **No settlement reversal logic** - Cannot undo incorrect settlements

---

## Implementation Plan

### Phase 1: Database Schema Updates

#### Step 1.1: Create Migration for Admin RBAC

**File:** `apps/api/prisma/migrations/[timestamp]_add_settlement_edge_cases/migration.sql`

```sql
-- Add AdminRole enum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SETTLEMENT_ADMIN', 'SUPPORT_ADMIN', 'VIEWER');

-- Add admin fields to users table
ALTER TABLE users
  ADD COLUMN admin_role "AdminRole" NULL,
  ADD COLUMN admin_granted_at TIMESTAMP NULL,
  ADD COLUMN admin_granted_by TEXT NULL;

CREATE INDEX users_admin_role_idx ON users(admin_role);

-- Add manual settlement tracking to matches table
ALTER TABLE matches
  ADD COLUMN is_manually_settled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN manual_settle_reason TEXT NULL,
  ADD COLUMN manual_settled_by TEXT NULL,
  ADD COLUMN manual_settled_at TIMESTAMP NULL,
  ADD COLUMN has_postponed_events BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN postponed_check_at TIMESTAMP NULL;

CREATE INDEX matches_postponed_check_idx ON matches(has_postponed_events, postponed_check_at)
  WHERE has_postponed_events = true;
CREATE INDEX matches_manual_settlement_idx ON matches(is_manually_settled, manual_settled_at);

-- Add postponement tracking to sports_events table
ALTER TABLE sports_events
  ADD COLUMN original_event_id TEXT NULL,
  ADD COLUMN rescheduled_to TIMESTAMP NULL,
  ADD COLUMN postponed_at TIMESTAMP NULL,
  ADD COLUMN postponed_reason TEXT NULL;

CREATE INDEX sports_events_original_event_id_idx ON sports_events(original_event_id);
CREATE INDEX sports_events_postponed_idx ON sports_events(status, postponed_at)
  WHERE status = 'POSTPONED';
```

#### Step 1.2: Update Prisma Schema

**File:** `apps/api/prisma/schema.prisma`

Add:
- `AdminRole` enum
- Admin fields to `User` model
- Manual settlement fields to `Match` model
- Postponement fields to `SportsEvent` model

---

### Phase 2: Settlement Edge Cases Service

#### Step 2.1: Create Types File

**File:** `apps/api/src/services/settlement/settlement-edge-cases.types.ts`

```typescript
export interface CancelledGameResult {
  matchId: string;
  affectedPicksCount: number;
  voidPicksCount: number;
  matchStatus: 'voided' | 'active';
  refunded: boolean;
  refundTransactionIds: string[];
  reason: string;
}

export interface PostponedGameResult {
  matchId: string;
  affectedPicksCount: number;
  nextCheckAt: Date;
  willAutoSettle: boolean;
  reason: string;
}

export interface ManualSettlementParams {
  matchId: string;
  adminId: string;
  action: 'force_settle' | 'void_and_refund' | 'resolve_dispute';
  winnerId?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ManualSettlementResult {
  matchId: string;
  action: string;
  status: string;
  winnerId?: string | null;
  refunded: boolean;
  auditLogId: string;
  performedBy: string;
  performedAt: Date;
}
```

#### Step 2.2: Create Main Service

**File:** `apps/api/src/services/settlement/settlement-edge-cases.service.ts`

Key functions to implement:

1. **`handleCancelledEvent(eventId, reason)`**
   - Mark event as CANCELED
   - Find all affected picks and void them
   - For each affected match:
     - If ALL picks void → void match, refund both players
     - If PARTIAL void → match continues with remaining picks
   - Create audit logs

2. **`processVoidMatchRefunds(matchId, creatorId, opponentId, stakeAmount)`**
   - Issue refunds with idempotency keys
   - Format: `void:{matchId}:refund:{userId}`

3. **`handlePostponedEvent(eventId, reason, rescheduledTo?)`**
   - Mark event as POSTPONED
   - Set `hasPostponedEvents=true` on affected matches
   - Schedule next check time

4. **`checkPostponedMatches()`** (scheduled worker)
   - Run every hour
   - Check if postponed events resolved
   - Clear flag and queue settlement if resolved
   - Reschedule check if still postponed

5. **`validateAdminPermission(userId, requiredRole)`**
   - RBAC check for admin operations
   - Throws `UnauthorizedError` if not authorized

6. **`manualSettleMatch(params)`**
   - Handle `force_settle`, `void_and_refund`, `resolve_dispute` actions
   - Full audit trail for all manual actions

---

### Phase 3: Settlement Service Updates

#### Step 3.1: Fix Event Status Race Condition

**File:** `apps/api/src/services/settlement/settlement.service.ts`

Add inside the settlement transaction:

```typescript
// Re-check event statuses INSIDE transaction to prevent race condition
const freshEvents = await tx.sportsEvent.findMany({
  where: { id: { in: eventIds } },
  select: { id: true, status: true, updatedAt: true }
});

for (const freshEvent of freshEvents) {
  const originalEvent = cachedEvents.find(e => e.id === freshEvent.id);
  if (freshEvent.status !== originalEvent.status) {
    throw new ConflictError(
      `Event ${freshEvent.id} status changed during settlement - was ${originalEvent.status}, now ${freshEvent.status}`
    );
  }
}
```

#### Step 3.2: Add Void Settlement Eligibility

Modify `areAllEventsFinal()` to also check for cancellation scenarios:

```typescript
export function checkSettlementEligibility(match): {
  eligible: boolean;
  action: 'settle' | 'void' | 'wait';
  reason: string;
} {
  const allPicks = [...creatorSlip.picks, ...opponentSlip.picks];

  const completedCount = allPicks.filter(p => p.event.status === 'COMPLETED').length;
  const cancelledCount = allPicks.filter(p => p.event.status === 'CANCELED').length;
  const postponedCount = allPicks.filter(p => p.event.status === 'POSTPONED').length;

  // All cancelled → void match
  if (cancelledCount === allPicks.length) {
    return { eligible: true, action: 'void', reason: 'All events cancelled' };
  }

  // Some postponed → wait
  if (postponedCount > 0) {
    return { eligible: false, action: 'wait', reason: 'Postponed events pending' };
  }

  // All completed or cancelled (partial cancellation) → settle
  if (completedCount + cancelledCount === allPicks.length) {
    return { eligible: true, action: 'settle', reason: 'All events finalized' };
  }

  return { eligible: false, action: 'wait', reason: 'Events still in progress' };
}
```

---

### Phase 4: Queue System Updates

#### Step 4.1: Add Void Settlement Job Type

**File:** `apps/api/src/queues/game-settlement.queue.ts`

Add new job type:

```typescript
interface VoidSettlementJobData {
  matchId: string;
  reason: string;
  triggerSource: 'event_cancelled' | 'admin_void' | 'postponement_timeout';
}

// New job processor
case 'void-match': {
  const { matchId, reason, triggerSource } = job.data as VoidSettlementJobData;

  // Fetch match and process void
  const match = await prisma.match.findUnique({ where: { id: matchId } });

  if (match.status === 'voided') {
    return { success: true, alreadyVoided: true };
  }

  // Call void settlement service
  await voidAndRefundMatch(matchId, 'SYSTEM', reason, { triggerSource });

  return { success: true, voided: true };
}
```

#### Step 4.2: Add Postponed Match Check Job

Add scheduled job that runs hourly:

```typescript
// Schedule with cron pattern
await queue.add('check-postponed-matches', {}, {
  repeat: { pattern: '0 * * * *' }, // Every hour
  jobId: 'scheduled-postponed-check',
});
```

---

### Phase 5: Admin API Endpoints

#### Step 5.1: Create Admin Module

**Files:**
- `apps/api/src/modules/admin/admin.controller.ts`
- `apps/api/src/modules/admin/admin.routes.ts`
- `apps/api/src/modules/admin/admin.schemas.ts`

Endpoints:

| Method | Path | Description | Role Required |
|--------|------|-------------|---------------|
| POST | `/api/v1/admin/matches/:id/settle` | Manual settlement | SETTLEMENT_ADMIN |
| GET | `/api/v1/admin/matches/:id/audit-log` | View audit trail | SETTLEMENT_ADMIN |
| POST | `/api/v1/admin/events/:id/cancel` | Cancel event | SETTLEMENT_ADMIN |
| GET | `/api/v1/admin/settlements/pending` | List pending settlements | VIEWER |

#### Step 5.2: Manual Settlement Request Schema

```typescript
const ManualSettlementSchema = z.object({
  action: z.enum(['force_settle', 'void_and_refund', 'resolve_dispute']),
  winnerId: z.string().uuid().optional(),
  reason: z.string().min(20).max(1000), // Require detailed justification
  metadata: z.record(z.unknown()).optional(),
});
```

---

### Phase 6: Idempotency Keys

All edge case operations use deterministic idempotency keys:

| Operation | Key Format | Example |
|-----------|------------|---------|
| Void refund (creator) | `void:{matchId}:refund:{userId}` | `void:match-123:refund:user-456` |
| Void refund (opponent) | `void:{matchId}:refund:{userId}` | `void:match-123:refund:user-789` |
| Cancel refund | `cancellation:{matchId}:refund:{userId}` | `cancellation:match-123:refund:user-456` |
| Manual payout | `manual:{matchId}:payout:{userId}` | `manual:match-123:payout:user-456` |
| Draw refund | `settlement:{matchId}:refund:{userId}` | `settlement:match-123:refund:user-456` |

---

## Critical "Ultra-Think" Requirements - Solutions

### 1. Idempotency (Double-Refund Prevention)

**Solution:** Every financial operation uses a deterministic idempotency key stored in `Transaction.idempotencyKey` (unique constraint).

```typescript
// Before any credit/debit
const existing = await tx.transaction.findUnique({
  where: { idempotencyKey }
});

if (existing && existing.status === 'completed') {
  return existing; // Return cached result, no duplicate operation
}
```

### 2. Atomic Transactions

**Solution:** All state changes happen in a single `prisma.$transaction()` block with 30-second timeout:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update match status (with version lock)
  // 2. Update all picks
  // 3. Update slips
  // 4. Create audit log
}, { timeout: 30000 });

// Financial operations OUTSIDE transaction (separate idempotent calls)
await creditWallet(...);
```

### 3. Audit Trails

**Solution:** Every manual action creates `MatchAuditLog` entry with:
- `performedBy`: Admin user ID (never "SYSTEM" for manual actions)
- `previousState`: Full snapshot before change
- `newState`: Full snapshot after change
- `metadata`: Includes IP address, user agent, justification text
- `createdAt`: Timestamp to millisecond precision

### 4. Race Conditions

**Solution:** Multi-layer protection:

1. **Optimistic Locking:** Match.version incremented on every update
   ```typescript
   updateMany({
     where: { id: matchId, version: expectedVersion },
     data: { version: { increment: 1 }, ... }
   })
   ```

2. **Event Status Re-check:** Inside transaction, re-fetch event statuses
   ```typescript
   const freshEvents = await tx.sportsEvent.findMany({ ... });
   if (statusChanged) throw ConflictError;
   ```

3. **Queue Deduplication:** BullMQ jobId prevents duplicate jobs
   ```typescript
   await queue.add('settle-match', data, { jobId: `settle-${matchId}` });
   ```

4. **Idempotency Keys:** Transaction-level deduplication for financial ops

---

## Business Rules Summary

### Cancelled Games
| Scenario | Match Status | Financial Outcome |
|----------|--------------|-------------------|
| All events cancelled | `voided` | 100% refund to both, 0% rake |
| Some events cancelled | `active` → `settled` | Normal settlement with remaining picks |
| One slip fully voided | `voided` | 100% refund to both, 0% rake |

### Postponed Games
| Scenario | Action | Timeout |
|----------|--------|---------|
| Event postponed, rescheduled | Hold, check after reschedule | +1 hour after new time |
| Event postponed, no reschedule | Hold, periodic check | 24 hours |
| Postponed > 72 hours | Auto-cancel, void match | N/A |

### Push Results
| Pick Type | Push Condition | Point Value |
|-----------|----------------|-------------|
| Moneyline | Game ties (where ties possible) | 0 points |
| Spread | `homeScore - awayScore === line` | 0 points |
| Total | `homeScore + awayScore === line` | 0 points |

All-push match result: DRAW with 100% refund, 0% rake

### Manual Settlement
| Action | Rake Applied | User Stats Updated |
|--------|--------------|-------------------|
| `force_settle` | Yes (5%) | Yes |
| `void_and_refund` | No (0%) | No |
| `resolve_dispute` | Depends on winner | Depends on outcome |

---

## Files to Create/Modify

### New Files
1. `apps/api/prisma/migrations/[timestamp]_add_settlement_edge_cases/migration.sql`
2. `apps/api/src/services/settlement/settlement-edge-cases.types.ts`
3. `apps/api/src/services/settlement/settlement-edge-cases.service.ts`
4. `apps/api/src/modules/admin/admin.controller.ts`
5. `apps/api/src/modules/admin/admin.routes.ts`
6. `apps/api/src/modules/admin/admin.schemas.ts`

### Modified Files
1. `apps/api/prisma/schema.prisma` - Add new enums and fields
2. `apps/api/src/services/settlement/settlement.service.ts` - Add race condition fix
3. `apps/api/src/services/settlement/index.ts` - Export new service
4. `apps/api/src/queues/game-settlement.queue.ts` - Add void job type
5. `apps/api/src/app.ts` - Register admin routes

---

## Testing Requirements

### Unit Tests
- [ ] Push detection for spread/total/moneyline
- [ ] Partial cancellation score recalculation
- [ ] Admin permission validation
- [ ] Idempotency key uniqueness

### Integration Tests
- [ ] TC-8.5.1: Single event cancelled → partial void
- [ ] TC-8.5.2: All events cancelled → full void + refund
- [ ] TC-8.5.3: Postponed event 73h → auto-cancel
- [ ] TC-8.5.4: All picks push → draw with 0% rake
- [ ] TC-8.5.5: Concurrent void + settlement → optimistic lock prevents double
- [ ] TC-8.5.6: Event status changes mid-settlement → conflict error
- [ ] TC-8.5.7: Double refund attempt → idempotency prevents duplicate
- [ ] TC-8.5.8: Admin manual void → audit log captured

---

## Implementation Order

1. **Day 1:** Schema migration + Prisma types
2. **Day 2:** Settlement edge cases service (cancelled/postponed handlers)
3. **Day 3:** Queue updates + postponed check worker
4. **Day 4:** Admin API endpoints + RBAC
5. **Day 5:** Settlement service race condition fix
6. **Day 6:** Integration testing
7. **Day 7:** Load testing + documentation

---

## Security Checklist

- [ ] Admin endpoints require authentication
- [ ] RBAC enforced on all admin actions
- [ ] All manual settlements logged with full audit trail
- [ ] Rate limiting on admin endpoints (10 requests/minute)
- [ ] High-value matches ($1000+) require additional approval
- [ ] No settlement reversal without C-level approval
- [ ] Idempotency keys prevent double financial operations

---

## Approval Required

This plan affects:
- User wallet balances (financial impact)
- Match settlement logic (game integrity)
- Admin access controls (security)

**Recommendation:** Review with product team before implementation, especially:
1. 72-hour postponement timeout policy
2. 0% rake on push-heavy draws policy
3. Multi-signature requirement for high-value matches

---

*Generated by Settlement Edge Cases Planning Session*
*Date: 2026-01-22*
*Agents: pvp-referee-auditor, backend-engine-builder*
