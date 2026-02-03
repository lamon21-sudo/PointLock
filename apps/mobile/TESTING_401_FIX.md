# Testing Guide: 401 Unauthorized Fix

## What Was Fixed

We fixed a race condition where API requests were being made before authentication tokens were loaded from SecureStore, causing 401 Unauthorized errors on the Active Slips tab.

## Pre-Test Checklist

- [ ] Backend API is running at `http://localhost:3000`
- [ ] You have a valid user account to test with
- [ ] Mobile app development server is ready to start

## Test 1: Cold App Start (Main Test)

**Objective:** Verify that the Active Slips tab loads successfully on a fresh app start without 401 errors.

**Steps:**
1. **Ensure you're logged in first** (if not, login and complete test 2 first)
2. **Kill the app completely**
   - iOS Simulator: Cmd+Q the app or swipe up from app switcher
   - Android Emulator: Force stop the app
3. **Clear Metro bundler cache:**
   ```bash
   cd apps/mobile
   npx expo start --clear
   ```
4. **Launch the app fresh** (don't use Fast Refresh)
5. **Immediately navigate to the Matches tab** (⚔️ icon) as soon as app loads
6. **Observe the Active Slips section**

**Expected Results:**
✅ Loading skeleton appears briefly
✅ Slips load successfully (or "No active slips" if empty)
✅ NO 401 errors in the console
✅ Console shows: `✅ Auth interceptors configured`
✅ Console shows API request logs with Authorization headers

**What to Look For in Console:**
```
✅ Auth interceptors configured
🌐 API Request: GET http://10.0.2.2:3000/api/v1/slips?status=PENDING,ACTIVE&page=1&limit=20
  Headers: { Authorization: "Bearer <token>", ... }
✅ API Response: GET /slips - Status: 200
```

**Red Flags (These should NOT appear):**
❌ `❌ Error Type: UNAUTHORIZED (401)`
❌ `⚠️ API request to /slips has no auth token`
❌ `🚨 Request already retried. Forcing logout.`

---

## Test 2: Login Flow

**Objective:** Verify that login still works and tokens are properly saved.

**Steps:**
1. If you're already logged in, **logout first**:
   - Navigate to Profile tab
   - Tap Logout button
2. **You should be redirected to Login screen**
3. **Enter valid credentials and login**
4. **You should be redirected to Matches tab**
5. **Verify Active Slips loads** (same checks as Test 1)

**Expected Results:**
✅ Login succeeds
✅ Tokens are saved to SecureStore
✅ User is redirected to main app
✅ Active Slips loads without 401 errors

---

## Test 3: Token Refresh Flow

**Objective:** Verify that expired tokens are refreshed correctly.

**Steps:**
1. **Make the access token expire soon** (this requires backend cooperation)
   - OR wait for natural token expiration
2. **Make an API request after token expires**
3. **Observe the console logs**

**Expected Results:**
✅ Request gets 401
✅ Token refresh is triggered automatically
✅ New tokens are saved to SecureStore
✅ Original request is retried with new token
✅ Original request succeeds

**Console Log Pattern:**
```
🌐 API Request: GET /slips
❌ Error Type: UNAUTHORIZED (401)
🔄 Attempting token refresh...
✅ Token refresh successful
🌐 API Request: GET /slips (retry)
✅ API Response: GET /slips - Status: 200
```

---

## Test 4: Multiple Concurrent Requests

**Objective:** Verify that multiple API requests made simultaneously all wait for initialization.

**Steps:**
1. **Kill the app completely**
2. **Launch the app fresh**
3. **Navigate to Wallet tab** (this makes multiple API calls on mount)
4. **Quickly navigate to Matches tab**
5. **Observe console logs**

**Expected Results:**
✅ Multiple requests show in console
✅ ALL requests have Authorization headers
✅ NO 401 errors
✅ All requests succeed

---

## Test 5: First Launch (No Stored Tokens)

**Objective:** Verify graceful handling when user has never logged in.

**Steps:**
1. **Clear all app data:**
   - iOS Simulator: Reset simulator or delete app
   - Android Emulator: Clear app data in settings
2. **Launch the app**
3. **You should see the Login screen**

**Expected Results:**
✅ App doesn't crash
✅ Login screen appears
✅ No 401 errors (no requests should be made)
✅ `isAuthenticated` is `false`

---

## Test 6: Network Delay Simulation

**Objective:** Verify the fix works even with slow SecureStore access.

**Steps:**
1. **Enable network throttling** in Chrome DevTools (if using web)
   - OR use Android Emulator's network throttling
   - Set to "Slow 3G"
2. **Kill and relaunch the app**
3. **Navigate to Active Slips immediately**

**Expected Results:**
✅ Requests wait for initialization (may take longer)
✅ Eventually loads successfully
✅ NO 401 errors even with delay

---

## Debugging Tips

### If you still see 401 errors:

1. **Check if tokens are actually stored:**
   ```typescript
   // Add this to auth.store.ts temporarily
   console.log('🔐 Loading tokens from SecureStore...');
   const tokens = await Promise.all([...]);
   console.log('🔐 Loaded:', { hasAccess: !!accessToken, hasRefresh: !!refreshToken });
   ```

2. **Verify the interceptor is waiting:**
   ```typescript
   // auth-interceptor.ts line 253
   console.log('⏳ Waiting for auth initialization...');
   await waitForAuthInitialization();
   console.log('✅ Auth initialization complete');
   ```

3. **Check initialization promise resolution:**
   ```typescript
   // auth.store.ts line 126
   console.log('✅ Resolving initialization promise');
   if (resolveInitialization) {
     resolveInitialization();
     console.log('✅ Initialization promise resolved');
   }
   ```

### If the app hangs/freezes:

This might indicate the initialization promise is never resolving.

1. **Check if `initialize()` is being called:**
   - Look for the call in `_layout.tsx` line 40
2. **Verify the promise is being created:**
   - Check `auth.store.ts` lines 40-42
3. **Ensure `resolveInitialization` is not null:**
   - Add logs in the finally block

---

## Expected Console Output (Successful Flow)

```
╔════════════════════════════════════════════════════╗
║          PICK RIVALS API CONFIGURATION             ║
╚════════════════════════════════════════════════════╝
📡 API Base URL: http://10.0.2.2:3000/api/v1
🔧 Environment: DEVELOPMENT
📱 Platform: android
⏱️  Timeout: 30000ms (30 seconds)

✅ Auth interceptors configured

🌐 API Request: GET http://10.0.2.2:3000/api/v1/slips?status=PENDING,ACTIVE&page=1&limit=20
  Headers: {
    Authorization: "Bearer eyJhbGc...",
    Content-Type: "application/json"
  }

✅ API Response: GET /slips - Status: 200
```

---

## Success Criteria

All tests pass with:
- ✅ No 401 errors on app startup
- ✅ Active Slips tab loads successfully
- ✅ Authorization headers are attached to all protected requests
- ✅ Token refresh works correctly
- ✅ Multiple concurrent requests work
- ✅ Graceful handling of missing tokens

---

## Rollback Plan (If Tests Fail)

If critical issues are found:

1. **Revert the changes:**
   ```bash
   git checkout apps/mobile/src/stores/auth.store.ts
   git checkout apps/mobile/src/services/auth-interceptor.ts
   git checkout apps/mobile/src/hooks/useSlips.ts
   git checkout apps/mobile/app/(tabs)/wallet.tsx
   git checkout apps/mobile/src/services/api.ts
   ```

2. **Investigate the root cause** with the logs above

3. **Re-apply with fixes** if needed
