# Match Service API Reference

## Base URL
```
/api/v1/matches
```

---

## Endpoints

### 1. Create Match

**`POST /api/v1/matches`**

Create a new match with an invite code. Deducts stake from creator's wallet and locks their slip.

**Authentication**: Required

**Request Body**:
```json
{
  "slipId": "uuid",
  "stakeAmount": 1000,        // In cents (1000 = $10)
  "inviteExpiresIn": 24       // Optional, hours (default 24, max 168)
}
```

**Response**: `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "private",
    "stakeAmount": 1000,
    "status": "pending",
    "inviteCode": "ABC123XYZ4",
    "inviteExpiresAt": "2026-01-10T12:00:00.000Z",
    "creatorId": "uuid",
    "creatorSlipId": "uuid",
    "createdAt": "2026-01-09T12:00:00.000Z",
    "version": 1,
    // ... other fields
    "creator": {
      "id": "uuid",
      "username": "player1",
      "avatarUrl": null
    },
    "creatorSlip": {
      "id": "uuid",
      "status": "PENDING",
      "totalPicks": 3,
      "totalOdds": 8.5,
      "picks": [
        {
          "id": "uuid",
          "eventId": "uuid",
          "team": "Lakers",
          "odds": 2.5,
          "result": null
        }
        // ... more picks
      ]
    }
  },
  "meta": {
    "timestamp": "2026-01-09T12:00:00.000Z",
    "requestId": "req_123456789_abc"
  }
}
```

**Error Responses**:
- `400` - Invalid input, slip already locked, or slip has no picks
- `402` - Insufficient balance
- `403` - Slip not owned by user
- `404` - Slip not found

---

### 2. Join Match

**`POST /api/v1/matches/:id/join`**

Join an existing match as opponent. Deducts stake from opponent's wallet and locks their slip.

**Authentication**: Required

**URL Parameters**:
- `id` - Match UUID

**Request Body**:
```json
{
  "slipId": "uuid"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "matched",        // Status changed from pending
    "matchedAt": "2026-01-09T12:05:00.000Z",
    "opponentId": "uuid",
    "opponentSlipId": "uuid",
    "version": 2,               // Version incremented
    // ... other fields
    "opponent": {
      "id": "uuid",
      "username": "player2",
      "avatarUrl": null
    },
    "opponentSlip": {
      "id": "uuid",
      "status": "PENDING",
      "totalPicks": 2,
      "totalOdds": 5.2,
      "picks": [...]
    }
  },
  "meta": {
    "timestamp": "2026-01-09T12:05:00.000Z",
    "requestId": "req_123456789_def"
  }
}
```

**Error Responses**:
- `400` - Match not pending, invite expired, or self-join attempt
- `402` - Insufficient balance
- `403` - Slip not owned by user or already locked
- `404` - Match or slip not found
- `409` - Match already joined by another player (concurrent request)

---

### 3. List User Matches

**`GET /api/v1/matches`**

Get paginated list of user's matches with optional filters.

**Authentication**: Required

**Query Parameters**:
- `status` - Comma-separated list of statuses (e.g., `pending,matched`)
- `role` - Filter by user role: `creator`, `opponent`, or `any` (default: `any`)
- `page` - Page number (default: 1, min: 1)
- `limit` - Items per page (default: 20, max: 100)

**Example Request**:
```
GET /api/v1/matches?status=pending,matched&role=creator&page=1&limit=20
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "matches": [
      {
        "id": "uuid",
        "type": "private",
        "stakeAmount": 1000,
        "status": "pending",
        "creatorId": "uuid",
        "opponentId": null,
        "winnerId": null,
        "inviteCode": "ABC123XYZ4",
        "inviteExpiresAt": "2026-01-10T12:00:00.000Z",
        "createdAt": "2026-01-09T12:00:00.000Z",
        "matchedAt": null,
        "settledAt": null,
        "creatorUsername": "player1",
        "opponentUsername": null
      }
      // ... more matches
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  },
  "meta": {
    "timestamp": "2026-01-09T12:10:00.000Z",
    "requestId": "req_123456789_ghi"
  }
}
```

**Error Responses**:
- `400` - Invalid query parameters

---

### 4. Get Match by ID

**`GET /api/v1/matches/:id`**

Get full match details by ID. Only returns if user is a participant.

**Authentication**: Required

**URL Parameters**:
- `id` - Match UUID

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "private",
    "stakeAmount": 1000,
    "status": "matched",
    "creatorId": "uuid",
    "opponentId": "uuid",
    "winnerId": null,
    "createdAt": "2026-01-09T12:00:00.000Z",
    "matchedAt": "2026-01-09T12:05:00.000Z",
    // ... all match fields
    "creator": { /* user details */ },
    "opponent": { /* user details */ },
    "creatorSlip": { /* slip with picks */ },
    "opponentSlip": { /* slip with picks */ }
  },
  "meta": {
    "timestamp": "2026-01-09T12:15:00.000Z",
    "requestId": "req_123456789_jkl"
  }
}
```

**Error Responses**:
- `404` - Match not found or user not a participant

---

### 5. Get Match by Invite Code

**`GET /api/v1/matches/invite/:code`**

Look up a match by its invite code. Used by opponents before joining.

**Authentication**: Optional (allows unauthenticated lookups)

**URL Parameters**:
- `code` - 10-character invite code (case-insensitive)

**Example Request**:
```
GET /api/v1/matches/invite/ABC123XYZ4
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "private",
    "stakeAmount": 1000,
    "status": "pending",
    "inviteCode": "ABC123XYZ4",
    "inviteExpiresAt": "2026-01-10T12:00:00.000Z",
    "createdAt": "2026-01-09T12:00:00.000Z",
    // ... other fields
    "creator": {
      "id": "uuid",
      "username": "player1",
      "avatarUrl": null
    },
    "creatorSlip": {
      "id": "uuid",
      "status": "PENDING",
      "totalPicks": 3,
      "totalOdds": 8.5
      // NOTE: 'picks' array is excluded for privacy
    }
  },
  "meta": {
    "timestamp": "2026-01-09T12:20:00.000Z",
    "requestId": "req_123456789_mno"
  }
}
```

**Privacy Note**: Creator's pick details are excluded to prevent opponent from seeing picks before joining.

**Error Responses**:
- `404` - Invite code not found

---

## Match Status Flow

```
pending → matched → (future: settled/cancelled/disputed)
   ↓
expired (auto-expire after 24h)
```

### Status Meanings
- **`pending`** - Waiting for opponent to join
- **`matched`** - Opponent joined, both slips locked
- **`expired`** - Invite expired, creator refunded
- **`settled`** - Match completed, winner determined (future)
- **`cancelled`** - Match cancelled (future)
- **`disputed`** - Under dispute resolution (future)

---

## Validation Rules

### Stake Amount
- **Min**: 100 cents ($1)
- **Max**: 100,000 cents ($1,000)
- **Type**: Integer (no decimals)

### Invite Expiry
- **Min**: 1 hour
- **Max**: 168 hours (7 days)
- **Default**: 24 hours

### Slip Requirements
- **Status**: Must be `DRAFT` (not already locked)
- **Ownership**: Must belong to the user
- **Picks**: Must have at least 1 pick

### Match Join Requirements
- **Status**: Match must be `pending`
- **Expiry**: Invite must not be expired
- **Self-join**: User cannot join their own match
- **Uniqueness**: Each slip can only be used once

---

## Background Jobs

### Auto-Expiry Job
- **Schedule**: Every 5 minutes
- **Action**: Finds matches with `status=pending` and `inviteExpiresAt < now`
- **Process**:
  1. Update match status to `expired`
  2. Refund creator's entry fee
  3. Unlock creator's slip (PENDING → DRAFT)
  4. Create audit log
- **Idempotency**: Safe to run multiple times (uses optimistic locking)

---

## Error Codes

All errors follow this format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Detailed error message",
    "details": {} // Optional additional context
  },
  "meta": {
    "timestamp": "2026-01-09T12:00:00.000Z",
    "requestId": "req_123456789_abc"
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR` - Invalid input data
- `INSUFFICIENT_BALANCE` - Wallet balance too low
- `SLIP_NOT_FOUND` - Slip does not exist
- `SLIP_ALREADY_LOCKED` - Slip already in use
- `TOKEN_INVALID` - Authentication failed
- `FORBIDDEN` - User not authorized
- `INTERNAL_ERROR` - Generic server error

---

## Rate Limiting

- **Global**: 100 requests per 15 minutes per IP
- **Match Creation**: Subject to wallet balance checks
- **Background Jobs**: 5 jobs per minute (prevents DB overload)

---

## Example Workflows

### Creating and Joining a Match

1. **User A creates match**:
   ```bash
   curl -X POST https://api.pickrivals.com/api/v1/matches \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{
       "slipId": "slip-uuid-123",
       "stakeAmount": 1000,
       "inviteExpiresIn": 24
     }'
   ```
   Response: `inviteCode: "ABC123XYZ4"`

2. **User A shares invite code with User B**

3. **User B looks up match**:
   ```bash
   curl https://api.pickrivals.com/api/v1/matches/invite/ABC123XYZ4
   ```

4. **User B joins match**:
   ```bash
   curl -X POST https://api.pickrivals.com/api/v1/matches/match-uuid-456/join \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{
       "slipId": "slip-uuid-789"
     }'
   ```

5. **Both users can now view match details**:
   ```bash
   curl https://api.pickrivals.com/api/v1/matches/match-uuid-456 \
     -H "Authorization: Bearer {token}"
   ```

---

## Testing with cURL

### Create Match
```bash
curl -X POST http://localhost:3000/api/v1/matches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slipId": "your-slip-uuid",
    "stakeAmount": 500,
    "inviteExpiresIn": 48
  }'
```

### Join Match
```bash
curl -X POST http://localhost:3000/api/v1/matches/MATCH_UUID/join \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slipId": "your-slip-uuid"
  }'
```

### List Matches
```bash
curl "http://localhost:3000/api/v1/matches?status=pending&role=any&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get by Invite Code
```bash
curl http://localhost:3000/api/v1/matches/invite/ABC123XYZ4
```
