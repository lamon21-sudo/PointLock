# Monitoring & Logging Guide

## Overview

Pick-Rivals uses Sentry for error tracking, pino for structured logging, and lightweight analytics event tracking via structured logs.

---

## Sentry Error Tracking

### API Configuration

Set the `SENTRY_DSN` environment variable in Railway (or `.env` locally):

```env
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
```

When `SENTRY_DSN` is empty, Sentry is disabled (no-op).

### Mobile Configuration

Set `SENTRY_DSN_MOBILE` and `SENTRY_ENVIRONMENT` as EAS environment variables or in your local env. The mobile app reads them via `app.config.js` -> `Constants.expoConfig.extra`.

Sentry is disabled in `__DEV__` mode to avoid noise during development.

### Recommended Sentry Alert Rules

Configure these in the Sentry dashboard:

1. **High Error Count**: Alert when >10 events in 1 hour (per environment)
2. **New Issue**: Notify on first occurrence of any new error
3. **Regression**: Alert when a previously resolved issue reoccurs
4. **P1 Errors**: Alert immediately on 5xx errors in production

### Useful Tags

Sentry events include these tags for filtering:
- `environment`: development / staging / production
- `release`: `pick-rivals-api@{version}`
- Request context: `requestId`, `userId`, `route`, `method`

### Testing Sentry (Non-Production)

```bash
curl http://localhost:3000/health/debug-sentry
# Should trigger a test error visible in Sentry dashboard
```

---

## Structured Logging

### Format

- **Production**: Single-line JSON (parseable by Railway logs, Datadog, etc.)
- **Development**: Pretty-printed with colors via `pino-pretty`
- **Test**: Silent (unless `DEBUG=true`)

### Key Fields

Every log line includes:
| Field | Description |
|-------|-------------|
| `level` | Log level (debug/info/warn/error) |
| `time` | Unix timestamp |
| `msg` | Log message |
| `service` | Always `pick-rivals-api` |
| `env` | Current NODE_ENV |
| `req.id` | Request ID (on HTTP request logs) |
| `req.method` | HTTP method |
| `req.url` | Request URL |
| `res.statusCode` | Response status |
| `responseTime` | Request duration in ms |

### Request ID

Every request gets a unique ID (UUID v4):
- Propagated from `x-request-id` header if provided
- Auto-generated if not present
- Returned in `x-request-id` response header
- Included in all API response `meta.requestId`

### Log Level Configuration

```env
LOG_LEVEL=info  # debug | info | warn | error
```

Default: `debug` in development, `info` in production.

### Filtering Logs

```bash
# In Railway or any JSON log viewer:
# Filter analytics events
{"analytics": true}

# Filter errors
{"level": 50}

# Filter by request ID
{"req": {"id": "abc-123"}}
```

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /health` | Full health status | API + Database + Redis |
| `GET /health/ready` | Readiness probe | Database + Redis connectivity |
| `GET /health/live` | Liveness probe | Process alive |

### Response Format

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-02-09T...",
    "uptime": 123.456,
    "version": "0.1.0",
    "services": {
      "api": "up",
      "database": "up",
      "redis": "up"
    }
  }
}
```

Status values: `healthy` (all up), `degraded` (partial), `unhealthy` (503).

### Railway Integration

Railway is configured to use `/health` as the health check path (`railway.toml`). If the endpoint returns 503, Railway will restart the service.

### External Uptime Monitoring

For downtime alerting, configure an external monitor (e.g., BetterStack, UptimeRobot) to poll:
```
https://pointlock-production.up.railway.app/health
```

Alert if response is non-200 for >2 consecutive checks.

---

## Analytics Events

### Current Events

**API** (logged via structured logger with `analytics: true`):

| Event | Trigger | Properties |
|-------|---------|------------|
| `user.registered` | Successful registration | userId |
| `user.login_success` | Successful login | userId |
| `user.login_failed` | Failed login attempt | - |
| `slip.created` | Slip created | userId, pickCount |
| `slip.locked` | Slip locked/submitted | userId, slipId |
| `match.created` | Match created | userId |
| `match.joined` | Match joined | userId, matchId |

**Mobile** (console.log in dev, noop in prod):

The mobile analytics utility (`src/utils/analytics.ts`) is a placeholder. Call `trackEvent()` from any screen or hook.

### Adding New Events

**API:**
```typescript
import { trackEvent } from '../../utils/analytics';

trackEvent({
  name: 'your.event_name',
  userId: user.id,
  properties: { key: 'value' }
});
```

**Mobile:**
```typescript
import { trackEvent } from '../utils/analytics';

trackEvent({
  name: 'your.event_name',
  properties: { key: 'value' }
});
```

### PII Policy

Never include in event properties:
- Email addresses
- Real names
- IP addresses
- Passwords or tokens

`userId` (opaque UUID) is acceptable.

### Evolution Path

The analytics system is designed for easy provider swap:

1. **Current (MVP)**: Events logged to structured logs (API) or console (mobile)
2. **Next step**: Add PostHog or Amplitude SDK to `trackEvent()` internals
3. **No call-site changes needed** - all existing `trackEvent()` calls continue to work

To migrate:
- API: Update `apps/api/src/utils/analytics.ts` to also call the provider SDK
- Mobile: Update `apps/mobile/src/utils/analytics.ts` to call the provider SDK
