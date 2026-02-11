# Rate Limiting Configuration

## Overview

Pick-Rivals uses `express-rate-limit` with a Redis-backed store for distributed rate limiting. All rate limit counters are shared across API instances via Redis.

---

## Rate Limiters

| Name | Window | Max Requests | Applied To | Notes |
|------|--------|-------------|------------|-------|
| `defaultRateLimiter` | 15 min | 100 | All routes (global) | Catch-all protection |
| `authRateLimiter` | 15 min | 5 | `/auth/register`, `/auth/login`, `/auth/refresh` | Skips successful requests |
| `creationRateLimiter` | 1 min | 10 | `POST /slips`, `POST /matches/*`, `POST /friends/request`, `POST /matchmaking/queue` | Resource creation spam prevention |
| `usernameCheckRateLimiter` | 1 min | 20 | `GET /auth/check-username` | Username enumeration prevention |
| `allowanceClaimRateLimiter` | 1 hour | 10 | `POST /wallet/claim-allowance` | Defense-in-depth (service also enforces) |

## Keying

All rate limiters key by client IP address by default. In a reverse proxy setup (Railway), ensure `trust proxy` is configured in Express so the real client IP is used.

## Redis Store

Rate limit counters are stored in Redis with prefix `rl:<name>:`. This ensures limits are enforced across multiple API instances.

- **Prefix pattern**: `rl:default:`, `rl:auth:`, `rl:creation:`, `rl:username:`, `rl:allowance:`
- **Fallback**: If Redis is unavailable, rate limiters fall back to in-memory store (per-instance only)

## Response Format

When rate limited, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  },
  "meta": {
    "timestamp": "2026-02-10T12:00:00.000Z",
    "requestId": "req_..."
  }
}
```

HTTP status: `429 Too Many Requests`

## Headers

Standard rate limit headers are included in all responses:
- `RateLimit-Limit`: Maximum requests in window
- `RateLimit-Remaining`: Remaining requests in current window
- `RateLimit-Reset`: Seconds until window resets

## Adjusting Limits

To adjust rate limits for production:
1. Edit `apps/api/src/middleware/rate-limit.middleware.ts`
2. Modify `windowMs` and `max` for the desired limiter
3. Deploy -- limits take effect immediately (Redis counters reset on window expiry)

## Testing Rate Limits

```bash
# Test auth rate limit (should get 429 after 5 failed attempts)
for i in $(seq 1 6); do
  echo -n "Attempt $i: "
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo
done
```

## Custom Rate Limiter

Use the factory function for endpoint-specific limits:

```typescript
import { createRateLimiter } from '../middleware/rate-limit.middleware';

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Custom limit reached',
  prefix: 'custom',
});

router.post('/custom-endpoint', customLimiter, handler);
```
