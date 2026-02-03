# Slips Service Tier System - Test Coverage Summary

## Test File Location
`apps/api/src/modules/slips/slips.service.test.ts`

## How to Run
```bash
npm run test:slips
```
Or directly:
```bash
npx tsx src/modules/slips/slips.service.test.ts
```

## Test Coverage: 57 Tests Total

### 1. Market Type to Tier Mapping (4 tests)
Verifies that pick types map correctly to their required tiers:
- ✓ Moneyline picks require FREE tier
- ✓ Spread picks require STANDARD tier
- ✓ Total picks require STANDARD tier
- ✓ Prop picks require PREMIUM tier

### 2. Tier Access Rules (15 tests)
Validates tier-based access control logic:
- **FREE user**: Can access FREE picks only, locked out of STANDARD/PREMIUM/ELITE
- **STANDARD user**: Can access FREE and STANDARD picks, locked out of PREMIUM/ELITE
- **PREMIUM user**: Can access FREE, STANDARD, and PREMIUM picks, locked out of ELITE
- **ELITE user**: Can access all tiers

### 3. Tier Enforcement on createSlip (5 tests)
Tests tier validation when creating a new slip:
- ✓ FREE user can create slip with moneyline (FREE) picks
- ✓ FREE user CANNOT create slip with spread (STANDARD) picks → throws TIER_LOCKED
- ✓ FREE user CANNOT create slip with total (STANDARD) picks → throws TIER_LOCKED
- ✓ FREE user CANNOT create slip with prop (PREMIUM) picks → throws TIER_LOCKED
- ✓ PREMIUM user CAN create slip with all tier types

### 4. Coin Cost Calculation (7 tests)
Verifies correct coin cost computation:
- ✓ Coin costs calculated based on implied probability and tier multiplier
- ✓ STANDARD tier costs > FREE tier costs
- ✓ PREMIUM tier costs > STANDARD tier costs
- ✓ totalCoinCost equals sum of individual pick coin costs
- ✓ Moneyline picks use FREE tier
- ✓ Spread picks use STANDARD tier
- ✓ Prop picks use PREMIUM tier

**Formula**: `baseCost = 25 + 225 * (impliedProbability^2.2)`, then apply tier multiplier:
- FREE: 1.0x
- STANDARD: 1.15x
- PREMIUM: 1.3x
- ELITE: 1.5x

### 5. Tier Re-validation on updateSlip (3 tests)
Tests tier checks when modifying an existing slip:
- ✓ PREMIUM user can add PREMIUM picks to slip
- ✓ If user tier drops to FREE, updating slip with existing PREMIUM picks throws TIER_LOCKED
- ✓ Adding new picks validates against current user tier (not tier at slip creation time)

**Key Behavior**: User's current tier is re-checked on every update. Tier downgrades can lock users out of their own draft slips.

### 6. Tier Re-validation on lockSlip (4 tests)
Validates tier checks when locking a slip (transitioning DRAFT → PENDING):
- ✓ If user tier drops before locking, throws TIER_LOCKED
- ✓ Minimum spend validation works correctly (2 picks require 80 coins)
- ✓ Lock fails if minimum spend not met (4 picks require 140 coins)
- ✓ Lock succeeds when minimum spend exactly met

**Minimum Spend Requirements**:
- 1 pick: 0 coins (no minimum)
- 2 picks: 80 coins
- 3 picks: 110 coins
- 4 picks: 140 coins
- 5 picks: 170 coins
- 6 picks: 200 coins
- 7 picks: 230 coins
- 8+ picks: 260 coins (capped)

### 7. American Odds Validation (11 tests)
Tests schema-level odds validation:
- ✓ Valid odds accepted: -110, +200, -100, +100, -500, +1000
- ✓ Invalid odds rejected: -50, 0, 99, -99, 50

**Rule**: American odds must be ≤ -100 OR ≥ +100 (no values in the -99 to +99 range)

### 8. User Tier Calculation from Stats (8 tests)
Verifies tier calculation logic based on coins earned and win streak:
- ✓ 0 coins, 0 streak → FREE
- ✓ 2,500 coins → STANDARD
- ✓ 7,500 coins → PREMIUM
- ✓ 15,000 coins → ELITE
- ✓ 5+ streak → ELITE (per schema spec)
- ✓ 10+ streak → ELITE (not STANDARD, because ELITE checked first)
- ✓ 20+ streak → ELITE (not PREMIUM, because ELITE checked first)
- ✓ 100 coins + 5 streak → ELITE (OR logic: coins OR streak)

**Tier Unlock Thresholds** (OR logic):
- **FREE**: Default tier, no requirements
- **STANDARD**: 2,500 coins earned OR 10+ win streak
- **PREMIUM**: 7,500 coins earned OR 20+ win streak
- **ELITE**: 15,000 coins earned OR 5+ win streak

**Critical Behavior**: ELITE tier (5+ streak) is checked first in the calculation order, so any streak ≥ 5 grants ELITE tier, even if they would qualify for lower tiers by coins.

## Test Pattern
Tests follow the existing codebase pattern:
- Standalone TypeScript file using tsx runner (no Jest/Mocha required)
- Simple assert/assertEqual utilities
- Descriptive test names explaining expected behavior
- Exit code 1 on any failure for CI/CD integration

## Related Files
- **Service**: `apps/api/src/modules/slips/slips.service.ts`
- **Schemas**: `apps/api/src/modules/slips/slips.schemas.ts`
- **Tier Logic**: `apps/api/src/lib/tier.service.ts`
- **Coin Calculator**: `apps/api/src/lib/pointlock-calculator.ts`
- **Odds Calculator**: `apps/api/src/lib/odds-calculator.ts`

## Error Codes Tested
- `TIER_LOCKED`: User tier insufficient for pick tier
- `MIN_SPEND_NOT_MET`: Slip doesn't meet minimum coin spend requirement
- `VALIDATION_ERROR`: Invalid odds format

## Key Insights from Tests

1. **Tier Enforcement is Multi-Layered**:
   - Validated at slip creation (createSlip)
   - Re-validated on slip updates (updateSlip)
   - Re-validated at lock time (lockSlip)

2. **Tier Downgrades Can Brick Draft Slips**:
   - If a user creates a slip with PREMIUM picks, then their tier drops to FREE, they cannot update or lock that slip until they regain PREMIUM tier.

3. **Coin Costs Scale Non-Linearly**:
   - Based on implied probability with exponent 2.2
   - Heavy favorites (high probability) cost significantly more coins
   - Tier multipliers compound the cost

4. **ELITE Streak Path is Dominant**:
   - 5+ win streak immediately grants ELITE tier
   - This overrides lower tier requirements by design
   - Intended to reward consistency over grinding coins

## Test Maintainability
- Pure logic tests, no database dependencies
- No external service mocking required
- Fast execution (runs in <1 second)
- Self-contained with inline helper functions
- Clear failure messages with expected vs actual values
