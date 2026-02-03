# Mobile App Connectivity Troubleshooting

## Quick Fixes for "Cannot Connect to Server" Errors

### Problem: Events or Wallet screens show timeout/connection errors

This happens when the mobile app cannot reach the backend API server. Here's how to fix it:

---

## Step 1: Verify Backend is Running

```bash
# From the project root
cd apps/api
pnpm dev

# Test the API is accessible
curl http://localhost:3000/api/v1/health
```

You should see a success response. If not, start the backend first.

---

## Step 2: Configure API URL for Your Device

The API URL needs to be different depending on what device you're testing on:

### Android Emulator
- **Already configured** - Uses `10.0.2.2:3000` (special IP that routes to host machine)
- Should work out of the box

### iOS Simulator
- **Already configured** - Uses `localhost:3000`
- Should work out of the box

### Physical Device (Android or iOS)
- **Needs manual configuration** - Must use your computer's local IP address
- Edit `apps/mobile/app.config.js` and set `LOCAL_DEV_IP`

#### Find Your Computer's IP Address:

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Example: 192.168.1.175
```

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show
# Look for your local network IP (usually 192.168.x.x or 10.0.x.x)
```

#### Update app.config.js:

```javascript
// apps/mobile/app.config.js
const LOCAL_DEV_IP = '192.168.1.175'; // Replace with YOUR IP
```

---

## Step 3: Restart the Expo Dev Server

After changing `app.config.js`, restart Expo:

```bash
# Kill the current dev server (Ctrl+C)
# Then restart
cd apps/mobile
pnpm start
```

---

## Step 4: Check Firewall Settings

Make sure your firewall allows incoming connections on port 3000:

**Windows:**
- Windows Defender Firewall > Advanced Settings > Inbound Rules
- Create rule allowing port 3000 for Node.js

**Mac:**
- System Preferences > Security & Privacy > Firewall > Firewall Options
- Allow Node.js to accept incoming connections

---

## Verification

Once configured, you should see in the Expo console:
```
📡 API URL: http://192.168.1.175:3000/api/v1
```

And the app should load events and wallet data without timeouts.

---

## Common Issues

### "timeout of 30000ms exceeded"
- Backend is not running or not accessible
- Check firewall settings
- Verify IP address is correct

### "Network Error"
- Device is on a different network than your computer
- Ensure both are on the same WiFi network
- Try disabling VPN if active

### "ECONNREFUSED"
- Backend is not running on port 3000
- Wrong IP address configured
- Port 3000 is blocked by firewall

---

## Technical Details

### API Configuration Flow

1. App checks `Constants.expoConfig.extra.apiUrl` (from app.config.js)
2. Falls back to platform-specific defaults:
   - Android Emulator: `http://10.0.2.2:3000/api/v1`
   - iOS Simulator: `http://localhost:3000/api/v1`
3. In production: `https://api.pickrivals.com/api/v1`

### Timeout Settings

- **Global API timeout**: 30 seconds (increased from 10s for slower connections)
- **React Query retry**: 2 attempts with exponential backoff (1s, 2s, 5s max)

### Error Handling Strategy

- **Events Screen**: Shows error state with retry button and detailed message
- **Wallet Screen**: Wallet and transactions load independently from allowance check
- **Allowance Check**: Non-critical feature - network failures are silent to prevent disruption

---

## Files Modified in This Fix

1. `apps/mobile/src/services/api.ts` - Increased timeout, added troubleshooting docs
2. `apps/mobile/src/stores/wallet.store.ts` - Made allowance check non-blocking
3. `apps/mobile/app/(tabs)/events.tsx` - Added retry logic and better error messages
4. `apps/mobile/app.config.js` - Contains LOCAL_DEV_IP configuration

---

## Quick Test

```bash
# Terminal 1: Start backend
cd apps/api
pnpm dev

# Terminal 2: Start mobile app
cd apps/mobile
pnpm start

# Scan QR code with Expo Go
# Events and Wallet tabs should load without errors
```
