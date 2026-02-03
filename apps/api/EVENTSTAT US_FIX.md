# EventStatus Runtime Crash Fix

## Problem Summary
The API was crashing on startup with:
```
TypeError: Cannot convert undefined or null to object
File: apps/api/src/modules/events/events.schemas.ts:21
Line: const VALID_STATUSES = Object.values(EventStatus) ...
```

## Root Cause
1. A database migration (`20251231234208_add_event_status_enum`) created an `EventStatus` enum in PostgreSQL with uppercase values: `SCHEDULED`, `LIVE`, `COMPLETED`, `CANCELED`, `POSTPONED`
2. The Prisma schema file (`prisma/schema.prisma`) was never updated to reflect this enum
3. Code was trying to import `EventStatus` from `@prisma/client`, but it didn't exist because the schema was out of sync
4. This caused `EventStatus` to be `undefined` at runtime, leading to the crash

## Solution Implemented

### 1. Added EventStatus Enum to Prisma Schema
**File:** `apps/api/prisma/schema.prisma`
```prisma
enum EventStatus {
  SCHEDULED
  LIVE
  COMPLETED
  CANCELED
  POSTPONED
}
```

### 2. Updated SportsEvent Model
**File:** `apps/api/prisma/schema.prisma`
```prisma
model SportsEvent {
  // ... other fields
  status EventStatus @default(SCHEDULED)
  // ... other fields
}
```

### 3. Regenerated Prisma Client
```bash
npx prisma generate --schema=apps/api/prisma/schema.prisma
```

### 4. Updated Code to Use Enum Correctly
All files now properly import and use `EventStatus` from `@prisma/client`:

**Files Updated:**
- `apps/api/src/modules/events/events.schemas.ts` - Imports EventStatus from Prisma
- `apps/api/src/modules/events/events.service.ts` - Uses EventStatus.SCHEDULED
- `apps/api/src/services/events/types.ts` - Re-exports EventStatus from Prisma
- `apps/api/src/services/odds/types.ts` - Re-exports EventStatus from Prisma
- `apps/api/src/services/events/fetchers/base.fetcher.ts` - Returns EventStatus.SCHEDULED
- `apps/api/src/services/events/fetchers/nba.fetcher.ts` - Uses EventStatus.SCHEDULED
- `apps/api/src/services/events/fetchers/nfl.fetcher.ts` - Uses EventStatus.SCHEDULED

## Verification
Server starts successfully and processes events:
```
[INFO] PickRivals API Server running on port 3000
[INFO] [EventsSyncService] Full sync complete: 12 processed, 0 created, 12 updated
```

## Key Takeaway
**Always keep Prisma schema in sync with database migrations.** When a migration creates or modifies an enum, the Prisma schema MUST be updated and the client regenerated before the code can use it.
