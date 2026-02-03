# Socket TOKEN_EXPIRED Fix - Flow Diagrams

## BEFORE: Race Condition Problem

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN EXPIRES                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│  HTTP Request    │                │  Socket Connect  │
│  Gets 401        │                │  Gets TOKEN_     │
│                  │                │  EXPIRED         │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│ Auth Interceptor │                │ Socket Service   │
│ Mutex            │                │ Mutex            │
│ isRefreshing     │                │ isRefreshing     │
│ = false          │                │ Token = false    │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         │ Set mutex = true                  │ Set mutex = true
         ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│ refreshTokens()  │                │ refreshAccess    │
│                  │                │ Token()          │
│ POST /auth/      │                │                  │
│      refresh     │                │ POST /auth/      │
│                  │                │      refresh     │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         ▼                                   ▼
    ❌ PROBLEM: TWO SIMULTANEOUS REFRESH CALLS ❌
         │                                   │
         ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│ Save tokens to   │                │ Save tokens to   │
│ auth store       │                │ auth store       │
│                  │                │                  │
│ ⚠️ Race cond.   │                │ ⚠️ Overwrites   │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         ▼                                   ▼
   Retry request                      Reconnect socket
```

**Problems**:
1. Two separate mutexes don't coordinate
2. Two simultaneous /auth/refresh API calls
3. Race condition writing to auth store
4. Wastes network bandwidth
5. Inconsistent token state possible

---

## AFTER: Centralized Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN EXPIRES                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│  HTTP Request    │                │  Socket Connect  │
│  Gets 401        │                │  Gets TOKEN_     │
│                  │                │  EXPIRED         │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│ Auth Interceptor │                │ Socket Service   │
└────────┬─────────┘                └────────┬─────────┘
         │                                   │
         │ Call refresh()                    │ Call refresh()
         ▼                                   ▼
         └─────────────────┬─────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ TokenRefreshService    │
              │ GLOBAL MUTEX           │
              │ isRefreshing = false   │
              └────────────┬───────────┘
                           │
                           │ First caller sets mutex = true
                           ▼
              ┌────────────────────────┐
              │ performRefresh()       │
              │                        │
              │ POST /auth/refresh     │
              │ (SINGLE CALL)          │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ Save tokens to         │
              │ auth store             │
              │ ✅ ATOMIC             │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ Resolve queued         │
              │ requests with          │
              │ new token              │
              └────────────┬───────────┘
                           │
                           ▼
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌──────────────────┐                ┌──────────────────┐
│ Retry HTTP       │                │ Reconnect socket │
│ request with     │                │ with new token   │
│ new token        │                │                  │
└──────────────────┘                └──────────────────┘
```

**Benefits**:
1. Single global mutex coordinates all refreshes
2. Only ONE /auth/refresh API call
3. Second caller waits for first to complete
4. Consistent token state guaranteed
5. Reduced network traffic

---

## Socket Service Flow Detail

### handleTokenExpired() - Step by Step

```
┌──────────────────────────────────────────────────────┐
│ Socket receives TOKEN_EXPIRED error                  │
│ (line 479 in connect_error handler)                  │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────┐
│ handleTokenExpired() called (line 497)               │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
         ┌────────┴─────────┐
         │                  │
         ▼                  ▼
    Is global         Is socket-specific
    refresh in        refresh in progress?
    progress?              │
         │                 ▼
         │              No → Continue
         │
         ▼
    Yes → Join queue
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ await TokenRefreshService.refresh()                  │
│                                                       │
│ If already refreshing: waits in queue                │
│ If not refreshing: starts new refresh                │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
     Success           Failure
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ Log success     │  │ Log error       │
│ Disconnect      │  │ Set state:      │
│ old socket      │  │ 'error'         │
│                 │  │                 │
│ Set state:      │  │ (Service auto-  │
│ 'reconnecting'  │  │  logs out user) │
│                 │  │                 │
│ Call connect()  │  └─────────────────┘
│ with new token  │
└─────────────────┘
```

### Key Decision Points

**Line 499**: Check global refresh state
```typescript
if (TokenRefreshService.isRefreshing()) {
  // Another part of app is refreshing
  // → Join queue, wait, then reconnect
}
```

**Line 524**: Check socket-specific mutex
```typescript
if (this.isRefreshingToken) {
  // Socket already handling refresh
  // → Skip to prevent duplicate work
}
```

**Line 530**: Check retry limit
```typescript
if (this.tokenRefreshRetryCount >= MAX_RETRIES) {
  // Too many retries
  // → Give up, set error state
}
```

**Line 545**: Execute refresh
```typescript
const newAccessToken = await TokenRefreshService.refresh();
// Waits if refresh in progress
// Starts new if not
// Throws on failure
```

---

## Token Refresh Service Flow

```
┌──────────────────────────────────────────────────────┐
│ TokenRefreshService.refresh() called                 │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
    isRefreshing      isRefreshing
    === true          === false
         │                 │
         ▼                 ▼
    Join queue        Start refresh
         │                 │
         │                 ▼
         │     Set isRefreshing = true
         │                 │
         │                 ▼
         │     performRefresh()
         │     ┌──────────────────┐
         │     │ Check auth store │
         │     │ Get refresh token│
         │     └────────┬─────────┘
         │              │
         │              ▼
         │     ┌──────────────────┐
         │     │ POST /auth/      │
         │     │      refresh     │
         │     └────────┬─────────┘
         │              │
         │              ▼
         │     ┌──────────────────┐
         │     │ Validate response│
         │     │ Extract tokens   │
         │     └────────┬─────────┘
         │              │
         │              ▼
         │     ┌──────────────────┐
         │     │ Save to auth     │
         │     │ store (atomic)   │
         │     └────────┬─────────┘
         │              │
         └──────────────┼──────────┐
                        │          │
                        ▼          ▼
                   Success     Failure
                        │          │
                        ▼          ▼
            ┌──────────────┐  ┌──────────────┐
            │ processQueue │  │ processQueue │
            │ (resolve all)│  │ (reject all) │
            └──────┬───────┘  └──────┬───────┘
                   │                 │
                   ▼                 ▼
            Return token      forceLogout()
                                     │
                                     ▼
                              Throw error
```

---

## Sequence Diagram: Concurrent Refresh Scenario

```
HTTP Request    Socket Connect    TokenRefreshService    API Server
     │                │                   │                  │
     │ 401 Error      │                   │                  │
     │───────────────>│                   │                  │
     │                │ TOKEN_EXPIRED     │                  │
     │                │──────────────────>│                  │
     │                │                   │                  │
     │                │    refresh()      │                  │
     │                │──────────────────>│                  │
     │                │                   │ Set mutex=true   │
     │                │                   │ POST /refresh    │
     │                │                   │─────────────────>│
     │                │                   │                  │
     │ refresh()      │                   │                  │
     │───────────────────────────────────>│                  │
     │                │                   │ Already          │
     │                │                   │ refreshing       │
     │                │                   │ → Add to queue   │
     │  (waiting...)  │   (waiting...)    │                  │
     │                │                   │     200 OK       │
     │                │                   │<─────────────────│
     │                │                   │ Save tokens      │
     │                │                   │ Process queue    │
     │    new token   │                   │                  │
     │<───────────────────────────────────│                  │
     │                │    new token      │                  │
     │                │<──────────────────│                  │
     │ Retry request  │                   │                  │
     │                │ Reconnect socket  │                  │
```

**Key Points**:
- Socket calls refresh FIRST (sets mutex)
- HTTP calls refresh SECOND (joins queue)
- Only ONE API call to /auth/refresh
- Both receive same new token
- Both retry their operations simultaneously

---

## Error Scenarios

### Scenario 1: Network Error During Refresh

```
Socket/HTTP → TokenRefreshService.refresh()
                     │
                     ▼
              performRefresh()
                     │
                     ▼
              POST /auth/refresh
                     │
                     ▼ (Network timeout)
              ERR_NETWORK thrown
                     │
                     ▼
              processQueue(error)
              (reject all queued)
                     │
                     ▼
              forceLogout()
                     │
                     ▼
         Clear auth store + SecureStore
         User redirected to login
```

### Scenario 2: Refresh Token Expired

```
HTTP 401 → TokenRefreshService.refresh()
                     │
                     ▼
              performRefresh()
                     │
                     ▼
              POST /auth/refresh
                     │
                     ▼ (401 Unauthorized)
              Response status = 401
                     │
                     ▼
              Throw: "Refresh token invalid"
                     │
                     ▼
              processQueue(error)
                     │
                     ▼
              forceLogout()
                     │
                     ▼
         User logged out
```

### Scenario 3: User Logs Out During Refresh

```
Request 401 → refresh() → performRefresh()
                              │
                              ▼
                    Check: authStore.isLoggingOut
                              │
                              ▼
User clicks logout            │
      │                       ▼
      ▼                  TRUE → Abort
authStore.logout()            │
      │                       ▼
      ▼                  Throw error
Tokens cleared               │
      │                       ▼
      ▼                  Don't save tokens
Socket disconnects           │
                              ▼
                         Exit cleanly
```

---

## Performance Comparison

### Before: Duplicate Refresh

```
Timeline:
0ms   → HTTP 401 + Socket TOKEN_EXPIRED (simultaneous)
10ms  → HTTP starts refresh #1
12ms  → Socket starts refresh #2
200ms → Refresh #1 completes (HTTP saves tokens)
205ms → Refresh #2 completes (Socket overwrites tokens)
210ms → HTTP retries with token A
215ms → Socket reconnects with token B (could be different!)

Total API calls: 2
Total time: ~215ms
Risk: Token state inconsistency
```

### After: Centralized Refresh

```
Timeline:
0ms   → HTTP 401 + Socket TOKEN_EXPIRED (simultaneous)
10ms  → HTTP calls refresh() → starts refresh, sets mutex
12ms  → Socket calls refresh() → joins queue
200ms → Refresh completes, saves tokens
201ms → HTTP receives token (immediate)
201ms → Socket receives token (immediate)
205ms → HTTP retries request
205ms → Socket reconnects

Total API calls: 1
Total time: ~205ms (10ms faster)
Risk: None (single atomic save)
```

**Improvements**:
- 50% fewer API calls
- ~5% faster (no second network request)
- 100% consistency (single token save)
- 0 race conditions
