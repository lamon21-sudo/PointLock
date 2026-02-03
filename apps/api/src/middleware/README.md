# Authentication & Validation Middleware

This directory contains all middleware components for the PickRivals API backend.

## Available Middleware

### 1. Authentication Middleware (`auth.middleware.ts`)

JWT-based authentication with Bearer token extraction and user context attachment.

#### Middleware Functions

- **`requireAuth`** - Strict authentication. Returns 401 if no valid token.
- **`optionalAuth`** - Soft authentication. Attaches user if token present, continues if not.
- **`getAuthenticatedUser(req)`** - Helper to extract authenticated user from request.

#### Usage Examples

```typescript
import { requireAuth, optionalAuth } from './middleware';

// Protected route - authentication required
router.get('/profile', requireAuth, async (req, res) => {
  // req.user is guaranteed to exist and is properly typed
  const user = req.user;
  // ...
});

// Public route with optional user context
router.get('/events', optionalAuth, async (req, res) => {
  // req.user may or may not exist
  if (req.user) {
    // Show user-specific content
  } else {
    // Show public content
  }
});
```

#### Type Safety

The middleware extends Express Request interface via declaration merging:

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
```

This means TypeScript knows about `req.user` throughout your application.

---

### 2. Rate Limiting Middleware (`rate-limit.middleware.ts`)

Protects endpoints from abuse using sliding window rate limiting algorithm.

#### Pre-configured Rate Limiters

- **`defaultRateLimiter`** - General API endpoints (100 req / 15 min)
- **`authRateLimiter`** - Authentication endpoints (5 req / 15 min, skips successful attempts)
- **`creationRateLimiter`** - Resource creation endpoints (10 req / 1 min)
- **`createRateLimiter(config)`** - Custom rate limiter factory

#### Usage Examples

```typescript
import {
  authRateLimiter,
  creationRateLimiter,
  createRateLimiter
} from './middleware';

// Protect login endpoint from brute force
router.post('/auth/login', authRateLimiter, loginController);

// Prevent spam on resource creation
router.post('/picks', requireAuth, creationRateLimiter, createPickController);

// Custom rate limit for specific use case
const customLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many requests. Slow down.',
  skipSuccessfulRequests: true,
});

router.post('/special', customLimiter, specialController);
```

#### Response Format

When rate limit is exceeded, returns standardized error response:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  },
  "meta": {
    "timestamp": "2025-12-18T...",
    "requestId": "req_..."
  }
}
```

#### Production Considerations

The default configuration uses in-memory storage, which works for single-server deployments.

For distributed systems (multiple server instances), use Redis-backed store:

```typescript
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const distributedLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
  // ... other options
});
```

---

### 3. Validation Middleware (`validation.middleware.ts`)

Zod-based request validation with detailed error reporting.

#### Middleware Functions

- **`validateRequest(schema, property)`** - Validates single request property (body, query, params)
- **`validateMultiple(schemas)`** - Validates multiple properties in one middleware
- **`validateOptional(schema, property)`** - Only validates if data is present

#### Usage Examples

**Basic Body Validation:**

```typescript
import { validateRequest } from './middleware';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8),
});

router.post(
  '/users',
  validateRequest(createUserSchema, 'body'),
  createUserController
);
```

**Query Parameter Validation:**

```typescript
const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
});

router.get(
  '/search',
  validateRequest(searchSchema, 'query'),
  searchController
);
```

**URL Parameter Validation:**

```typescript
const userIdSchema = z.object({
  id: z.string().uuid(),
});

router.get(
  '/users/:id',
  validateRequest(userIdSchema, 'params'),
  getUserController
);
```

**Multiple Properties:**

```typescript
router.get(
  '/users/:id',
  validateMultiple({
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ include: z.enum(['profile', 'stats']).optional() }),
  }),
  getUserController
);
```

**Optional Validation (PATCH endpoints):**

```typescript
const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
}).strict();

router.patch(
  '/users/:id',
  requireAuth,
  validateRequest(updateUserSchema, 'body'),
  updateUserController
);
```

#### Error Response Format

When validation fails, returns detailed field-level errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: email: Invalid email format; password: Password must be at least 8 characters"
  },
  "meta": {
    "timestamp": "2025-12-18T...",
    "requestId": "req_..."
  }
}
```

#### Benefits Over Manual Validation

**Before (Manual):**
```typescript
router.post('/users', async (req, res, next) => {
  try {
    const validation = validateInput(schema, req.body);
    if (!validation.success || !validation.data) {
      throw new BadRequestError(formatValidationErrors(validation.errors || []));
    }
    const result = await createUser(validation.data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

**After (Middleware):**
```typescript
router.post(
  '/users',
  validateRequest(createUserSchema, 'body'),
  async (req, res) => {
    // req.body is already validated and typed
    const result = await createUser(req.body);
    res.json({ success: true, data: result });
  }
);
```

---

## Complete Route Example

Here's a complete example showing all middleware together:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  optionalAuth,
  authRateLimiter,
  creationRateLimiter,
  validateRequest,
  validateMultiple,
} from './middleware';

const router = Router();

// Public endpoint with optional auth
router.get(
  '/events',
  optionalAuth,
  async (req, res) => {
    const events = req.user
      ? await getEventsForUser(req.user.id)
      : await getPublicEvents();
    res.json({ success: true, data: events });
  }
);

// Protected endpoint with rate limiting
router.post(
  '/picks',
  requireAuth,
  creationRateLimiter,
  validateRequest(
    z.object({
      eventId: z.string().uuid(),
      amount: z.number().positive(),
      prediction: z.enum(['home', 'away']),
    }),
    'body'
  ),
  async (req, res) => {
    const pick = await createPick(req.user!.id, req.body);
    res.json({ success: true, data: pick });
  }
);

// Authentication endpoint with strict rate limiting
router.post(
  '/auth/login',
  authRateLimiter,
  validateRequest(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
    'body'
  ),
  async (req, res) => {
    const result = await login(req.body);
    res.json({ success: true, data: result });
  }
);

// Complex validation with params + query
router.get(
  '/users/:id/picks',
  requireAuth,
  validateMultiple({
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      status: z.enum(['pending', 'settled', 'cancelled']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  }),
  async (req, res) => {
    const picks = await getUserPicks(req.params.id, req.query);
    res.json({ success: true, data: picks });
  }
);

export default router;
```

---

## Environment Variables

The middleware system uses these environment variables:

```env
# JWT Configuration
JWT_ACCESS_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-key-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting (optional, defaults in config)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

---

## Testing Middleware

**Testing Authentication:**

```bash
# Without token - should return 401
curl -X GET http://localhost:3000/api/v1/profile

# With valid token
curl -X GET http://localhost:3000/api/v1/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Testing Rate Limiting:**

```bash
# Trigger rate limit (run multiple times quickly)
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

**Testing Validation:**

```bash
# Invalid email - should return validation error
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","username":"test","password":"Test123!"}'

# Valid request
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"Test123!"}'
```

---

## Security Best Practices

1. **JWT Secrets**: Never commit secrets to version control. Use environment variables.
2. **Token Expiration**: Keep access tokens short-lived (15 minutes). Use refresh tokens for longer sessions.
3. **Rate Limiting**: Adjust limits based on your use case. Authentication endpoints should be stricter.
4. **Validation**: Always validate at the boundary. Never trust client input.
5. **HTTPS Only**: In production, ensure all authentication happens over HTTPS.
6. **Token Storage**: Store refresh tokens securely (httpOnly cookies preferred over localStorage).

---

## Performance Considerations

1. **Rate Limiting Memory**: In-memory rate limiting stores data in RAM. For high-traffic APIs, use Redis.
2. **Validation Cost**: Zod validation is fast but not free. For high-frequency endpoints, profile performance.
3. **JWT Verification**: Each request with `requireAuth` hits the database to fetch user data. Consider caching user data in JWT payload if acceptable for your security model.
4. **Middleware Order**: Apply expensive middleware (like authentication) only on routes that need it, not globally.

---

## Troubleshooting

**"Invalid token" errors:**
- Check JWT secret matches between token generation and verification
- Ensure token hasn't expired
- Verify Bearer token format: `Authorization: Bearer <token>`

**Rate limit issues:**
- Check if client IP is being correctly identified (proxy headers)
- Adjust `windowMs` and `max` values for your use case
- Consider whitelisting certain IPs (internal services, health checks)

**Validation not working:**
- Ensure schema is imported correctly
- Check that middleware is applied before controller
- Verify request is sending data in expected format (JSON body, query string, etc.)
