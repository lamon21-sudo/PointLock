# Mobile App Connectivity Fixes - Summary

## Issues Fixed

### 1. Wallet Timeout Error
**Problem:** `AxiosError: timeout of 10000ms exceeded` in `checkAllowance` method, causing the wallet screen to crash or hang.

**Root Cause:**
- 10-second timeout was too aggressive for slow connections
- `checkAllowance` was blocking critical wallet data fetching
- No graceful error handling for network failures

**Solution:**
- ✅ Increased global API timeout from 10s to 30s
- ✅ Made `checkAllowance` non-blocking - runs independently from wallet/transactions
- ✅ Added smart error detection - distinguishes network errors from API errors
- ✅ Network failures for allowance are now silent (it's a promotional feature, not critical)
- ✅ Wallet and transactions load successfully even if allowance check fails

---

### 2. Events Infinite Loading
**Problem:** "Upcoming Events" screen stuck in skeleton loading state indefinitely, never showing events or error state.

**Root Cause:**
- No retry logic on React Query
- Connection timeouts weren't being caught properly
- Error state wasn't showing detailed feedback
- API URL configuration might not match dev environment

**Solution:**
- ✅ Added React Query retry logic (2 attempts with exponential backoff)
- ✅ Increased cache time for better performance
- ✅ Enhanced error detection (timeout vs network vs API errors)
- ✅ Added "Try Again" button with one-tap retry
- ✅ Improved error messages that explain the issue and solution
- ✅ Added troubleshooting documentation

---

## Files Modified

### 1. `/apps/mobile/src/services/api.ts`
**Changes:**
- Timeout: `10000ms` → `30000ms` (3x more tolerant)
- Added comprehensive troubleshooting comments
- Documented IP configuration for different device types

### 2. `/apps/mobile/src/stores/wallet.store.ts`
**Changes:**
```typescript
// Before: All operations block each other
refreshAll: async () => {
  await Promise.all([
    get().fetchWallet(),
    get().fetchTransactions(1),
    get().checkAllowance(), // ❌ Blocks everything
  ]);
}

// After: Critical data loads first, allowance is independent
refreshAll: async () => {
  // Critical data loads in parallel
  await Promise.all([
    get().fetchWallet(),
    get().fetchTransactions(1),
  ]);

  // Allowance runs independently, won't block UI
  get().checkAllowance().catch(() => {
    console.warn('Allowance check failed (non-critical)');
  });
}
```

**Enhanced `checkAllowance` method:**
- Detects network errors vs API errors
- Network failures are silent (no error state)
- Only shows errors for actual API issues (not eligible, etc.)

### 3. `/apps/mobile/app/(tabs)/events.tsx`
**Changes:**
```typescript
// Before: No retry, no detailed errors
useQuery({
  queryKey: ['events', filter],
  queryFn: async () => { ... },
  staleTime: 30000,
})

// After: Retry logic and smart caching
useQuery({
  queryKey: ['events', filter],
  queryFn: async () => { ... },
  staleTime: 30000,
  retry: 2, // Try 2 more times
  retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),
  gcTime: 5 * 60 * 1000, // Cache for 5 minutes
})
```

**Enhanced error state:**
- Detects timeout errors specifically
- Detects network connection errors
- Shows actionable error messages with context
- Added "Try Again" button for manual retry
- Guides user to check API configuration

### 4. `/apps/mobile/app.config.js`
**Existing configuration documented:**
- Already has `LOCAL_DEV_IP` constant for physical devices
- Need to update this IP to match your development machine

---

## New Documentation

### `/apps/mobile/CONNECTIVITY_TROUBLESHOOTING.md`
Comprehensive guide for fixing connectivity issues:
- Step-by-step backend verification
- How to find your computer's IP address
- Platform-specific configuration (Android/iOS/Physical)
- Firewall configuration
- Common error codes and solutions

---

## User Experience Improvements

### Before:
- ❌ Wallet screen hangs on allowance timeout
- ❌ Events screen shows skeleton forever
- ❌ No way to retry without force-quitting
- ❌ No helpful error messages
- ❌ One failure blocks everything

### After:
- ✅ Wallet loads even if allowance fails
- ✅ Events show clear error with retry button
- ✅ Pull-to-refresh works on both screens
- ✅ Errors explain the problem and solution
- ✅ Independent features don't block each other
- ✅ 3x more tolerant of slow connections
- ✅ Automatic retry with smart backoff

---

## Performance Optimizations

1. **Request Timeout**: 10s → 30s (handles slow connections)
2. **Events Retry**: 0 → 2 attempts with exponential backoff
3. **Events Cache**: None → 5 minutes (reduces unnecessary requests)
4. **Allowance Check**: Blocking → Non-blocking (doesn't delay wallet display)

---

## Testing Checklist

### Test on Android Emulator:
- [ ] Backend running on `localhost:3000`
- [ ] Events screen loads matches
- [ ] Wallet screen shows balance
- [ ] Pull-to-refresh works on both tabs
- [ ] If backend is stopped, error states appear with retry button

### Test on iOS Simulator:
- [ ] Same as Android tests above

### Test on Physical Device:
- [ ] Set `LOCAL_DEV_IP` in `app.config.js` to your machine's IP
- [ ] Restart Expo dev server
- [ ] Verify "📡 API URL: http://YOUR_IP:3000/api/v1" in console
- [ ] All tests pass as above

### Test Error Recovery:
- [ ] Stop backend → See error states → Start backend → Hit retry → Data loads
- [ ] Allowance timeout doesn't break wallet
- [ ] Events error shows specific timeout/network message

---

## Technical Architecture

### Error Handling Strategy:

```
API Request Flow:
┌─────────────────────────────────────────┐
│ 1. Initial Request (30s timeout)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Success?     │
         └───┬───────┬───┘
             │       │
         YES │       │ NO
             │       │
             ▼       ▼
      ┌─────────┐  ┌──────────────────────┐
      │ Display │  │ React Query Retry    │
      │  Data   │  │ Attempt 1: wait 1s   │
      └─────────┘  │ Attempt 2: wait 2s   │
                   └──────────┬───────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Still Failed?│
                       └──┬───────┬───┘
                          │       │
                      YES │       │ NO → Display Data
                          │       │
                          ▼       ▼
                   ┌──────────────────────┐
                   │ Show Error State     │
                   │ - Timeout Message    │
                   │ - Network Message    │
                   │ - Retry Button       │
                   │ - Config Guidance    │
                   └──────────────────────┘
```

### Critical vs Non-Critical Features:

**Critical (Must Load):**
- Wallet balance
- Transaction history
- Upcoming events
- Match details

**Non-Critical (Can Fail Silently):**
- Weekly allowance check
- Promotional banners
- Optional metadata

---

## Future Improvements

Potential enhancements for production:

1. **Offline Support**: Cache events/wallet locally with AsyncStorage
2. **Connection Status**: Show banner when offline/reconnecting
3. **Retry Queue**: Queue failed requests and retry when connection returns
4. **Optimistic Updates**: Update UI immediately, sync in background
5. **Health Check**: Periodic ping to backend to detect issues early

---

## Deployment Notes

Before deploying to production:

1. Ensure production API URL is correct in `api.ts`
2. Test with real devices on cellular network (not just WiFi)
3. Test in low-connectivity scenarios
4. Verify timeout values work for your target regions
5. Consider reducing timeout for production (30s might be too long)

---

## Support

If you still experience connectivity issues after applying these fixes:

1. Check `CONNECTIVITY_TROUBLESHOOTING.md`
2. Verify backend is running and accessible
3. Check `app.config.js` has correct `LOCAL_DEV_IP`
4. Look for "📡 API URL:" in Expo console
5. Test API endpoint directly: `curl http://YOUR_IP:3000/api/v1/health`
