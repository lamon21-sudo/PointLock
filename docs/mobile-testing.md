# Mobile E2E Testing Guide

This document covers the end-to-end testing setup for the Pick Rivals mobile app using Maestro.

## Prerequisites

### Required Software

1. **Maestro CLI** (v1.36.0+)
   ```bash
   # macOS/Linux
   curl -Ls "https://get.maestro.mobile.dev" | bash

   # Windows (via WSL or Git Bash)
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. **iOS Development** (macOS only)
   - Xcode 15+ from App Store
   - Xcode Command Line Tools: `xcode-select --install`
   - iOS Simulators (installed via Xcode > Settings > Platforms)

3. **Android Development**
   - Android Studio (latest)
   - Android SDK with API 33+
   - Android Emulator images via SDK Manager

4. **Node.js & pnpm**
   - Node.js 20+
   - pnpm 8+

### Environment Setup

1. Clone and install dependencies:
   ```bash
   git clone <repo>
   cd pick-rivals
   pnpm install
   ```

2. Set up the API:
   ```bash
   cd apps/api

   # Start test infrastructure
   docker-compose -f docker-compose.test.yml up -d

   # Push schema and seed E2E data
   pnpm db:push
   pnpm db:seed:e2e
   ```

3. Verify Maestro installation:
   ```bash
   maestro --version
   ```

## Test Configuration

### Maestro Config

Located at `apps/mobile/.maestro/config.yaml`:

```yaml
appId: com.pointlock.app
name: PickRivals E2E Tests
env:
  TEST_USER_EMAIL: e2e-test@pointlock.com
  TEST_USER_PASSWORD: TestPassword123!
retries: 2
waitForIdle: true
```

### Test User Credentials

| Field | Value |
|-------|-------|
| Email | e2e-test@pointlock.com |
| Password | TestPassword123! |
| Username | e2e_test_user |
| Initial Balance | 10,000 RC |

## Running Tests

### Individual Device Tests

```bash
cd apps/mobile

# Run all tests on default device
pnpm test:e2e

# Run specific flow category
pnpm test:e2e:auth
pnpm test:e2e:slip
pnpm test:e2e:match
```

### iOS Device-Specific Tests

```bash
# iPhone SE (3rd generation)
pnpm test:e2e:ios-se

# iPhone 14
pnpm test:e2e:ios-14

# iPhone 15 Pro Max
pnpm test:e2e:ios-15-pro-max
```

### Android Device-Specific Tests

```bash
# Pixel 4a (small)
pnpm test:e2e:android-small

# Pixel 6 (medium)
pnpm test:e2e:android-medium

# Pixel 7 Pro (large)
pnpm test:e2e:android-large
```

### Full Device Matrix

```bash
# macOS/Linux - runs all iOS and Android devices
pnpm test:e2e:matrix

# Windows (Android only)
pnpm test:e2e:matrix:win
```

## Test Flows

### Auth Flows (`flows/auth/`)

| Flow | Description | Key Assertions |
|------|-------------|----------------|
| `login-happy-path.yaml` | Valid user login | Navigates to home tab |
| `login-invalid.yaml` | Invalid credentials | Error message displayed |
| `register-happy-path.yaml` | New user registration | Navigates to home tab |

### Slip Flows (`flows/slip/`)

| Flow | Description | Key Assertions |
|------|-------------|----------------|
| `slip-creation.yaml` | Add picks to slip | FAB badge shows count |
| `slip-lock.yaml` | Lock slip with confirmation | Success state displayed |

### Match Flows (`flows/match/`)

| Flow | Description | Key Assertions |
|------|-------------|----------------|
| `create-challenge.yaml` | Create challenge from slip | Challenge screen loads |
| `full-flow.yaml` | Complete E2E journey | Login > picks > lock > challenge |

### Utility Flows (`flows/utils/`)

| Flow | Description |
|------|-------------|
| `ensure-logged-in.yaml` | Checks auth state, logs in if needed |

## Test Data Reset

To reset test data between runs:

```bash
cd apps/api

# Full reset and reseed
pnpm test:db:reset
pnpm db:seed:e2e
```

## Device Matrix

### iOS Simulators

| Size | Device | Resolution |
|------|--------|------------|
| Small | iPhone SE (3rd generation) | 375x667 |
| Medium | iPhone 14 | 390x844 |
| Large | iPhone 15 Pro Max | 430x932 |

### Android Emulators

| Size | Device | Resolution |
|------|--------|------------|
| Small | Pixel 4a | 393x851 |
| Medium | Pixel 6 | 411x914 |
| Large | Pixel 7 Pro | 411x891 |

## testID Naming Convention

All interactive elements use testIDs following the pattern:

```
{screen}_{component}_{element}
{screen}_{component}_{index}_{element}
```

Examples:
- `login_email_input`
- `events_card_0_spread_home`
- `slip_review_lock_button`

### testID Registry

All testIDs are centralized in `apps/mobile/src/constants/testIds.ts`:

```typescript
import { TEST_IDS } from '../constants/testIds';

// Usage in components
<Button testID={TEST_IDS.auth.login.submitButton} />
<View testID={TEST_IDS.events.spreadHome(0)} />
```

## CI/CD Integration

E2E tests run automatically via GitHub Actions on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop`
- Manual dispatch via workflow_dispatch

### Workflow: `.github/workflows/e2e-tests.yml`

Features:
- Parallel iOS and Android test jobs
- Device matrix strategy (3 iOS + 3 Android)
- AVD caching for faster Android startup
- Test artifact upload (screenshots)
- Summary report generation

### Required Secrets

| Secret | Description |
|--------|-------------|
| `E2E_API_URL` | API URL for test environment |

## Troubleshooting

### Maestro Issues

**"Device not found"**
```bash
# List available iOS simulators
xcrun simctl list devices available

# List available Android emulators
emulator -list-avds
```

**"App not installed"**
```bash
# Ensure Expo is running and app is installed
cd apps/mobile
npx expo start --ios  # or --android
```

**Tests timing out**
- Increase timeout in flow files: `timeout: 15000`
- Check network connectivity
- Verify API is running and seeded

### Simulator/Emulator Issues

**iOS Simulator won't boot**
```bash
# Reset simulator
xcrun simctl shutdown all
xcrun simctl erase all
```

**Android Emulator slow**
- Enable hardware acceleration (HAXM/KVM)
- Increase emulator RAM in AVD settings
- Use x86_64 images instead of ARM

### Test Data Issues

**"User not found" or "Invalid credentials"**
```bash
cd apps/api
pnpm db:seed:e2e
```

**Stale test data**
```bash
cd apps/api
pnpm test:db:reset
pnpm db:seed:e2e
```

## Expected Runtime

| Configuration | Approximate Time |
|--------------|------------------|
| Single flow | 30-60 seconds |
| Single device (all flows) | 3-5 minutes |
| Full iOS matrix | 10-15 minutes |
| Full Android matrix | 15-20 minutes |
| Complete matrix (all devices) | 25-35 minutes |

## Pass Criteria

A test run is considered passing when:

1. All flows complete without assertion failures
2. All UI elements are visible within specified timeouts
3. Navigation between screens works correctly
4. API calls succeed (login, slip lock, challenge creation)
5. Screenshots are captured at expected checkpoints

## Adding New Tests

1. Create new flow file in appropriate directory:
   ```yaml
   # flows/feature/my-new-test.yaml
   appId: com.pointlock.app
   name: My New Test

   ---
   - assertVisible:
       id: "my_element"
   ```

2. Add testIDs to components:
   ```typescript
   // In testIds.ts
   export const TEST_IDS = {
     myFeature: {
       element: 'my_element',
     },
   } as const;
   ```

3. Apply testID in component:
   ```tsx
   <View testID={TEST_IDS.myFeature.element} />
   ```

4. Run to verify:
   ```bash
   maestro test flows/feature/my-new-test.yaml
   ```

## Resources

- [Maestro Documentation](https://maestro.mobile.dev/)
- [Expo Testing Guide](https://docs.expo.dev/develop/unit-testing/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
