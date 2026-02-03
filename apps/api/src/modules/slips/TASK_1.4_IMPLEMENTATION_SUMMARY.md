# Task 1.4 - Slip Service Tier System Integration

## Implementation Complete

### Files Modified

#### Primary Changes
- **`apps/api/src/modules/slips/slips.service.ts`** - Main service integration
- **`apps/api/src/modules/slips/slips.schemas.ts`** - Response type updates

#### Supporting Changes
- **`packages/shared-types/src/api.types.ts`** - Added error codes:
  - `MIN_SPEND_NOT_MET: 'SLIP_005'`
  - `TIER_LOCKED: 'SLIP_006'`

---

## Changes Summary

### 1. Added Imports (slips.service.ts)
```typescript
import { PickTier as PrismaPickTier } from '@prisma/client';
import { americanToImpliedProbability } from '../../lib/odds-calculator';
import { calculateCoinCost, validateMinimumSpend, PickForValidation } from '../../lib/pointlock-calculator';
import { getUserTier, isPickLocked } from '../../lib/tier.service';
import { PickTier } from '@pick-rivals/shared-types';
```

### 2. Updated SELECT Constants

**LIST_SELECT** - Added:
- `totalCoinCost: true`
- `minCoinSpend: true`
- `coinSpendMet: true`

**PICK_SELECT** - Added:
- `coinCost: true`
- `tier: true`

### 3. Updated Response Types (slips.schemas.ts)

**PickResponse** - Added:
- `coinCost: number`
- `tier: string`

**SlipListItem** - Added:
- `totalCoinCost: number`
- `minCoinSpend: number`
- `coinSpendMet: boolean`

### 4. Added Helper Functions (slips.service.ts)

#### `prismaTierToSharedTier(prismaTier: PrismaPickTier): PickTier`
Maps Prisma string enum (`'FREE'`, `'STANDARD'`, `'PREMIUM'`, `'ELITE'`) to shared-types numeric enum (`1`, `2`, `3`, `4`).

**Critical for type compatibility between Prisma and pointlock-calculator.**

#### `getPickTierFromMarket(pickType: PickType): PrismaPickTier`
Determines required tier based on market type:
- `moneyline` → `FREE`
- `spread`, `total` → `STANDARD`
- `prop` → `PREMIUM`

#### `calculatePickCoinCostAndTier(pick, userTier): { coinCost, tier }`
Calculates coin cost for a single pick and validates tier access:
1. Determines pick tier from market type
2. Validates user has access (throws `TIER_LOCKED` if not)
3. Calculates implied probability from odds
4. Calls `calculateCoinCost()` from pointlock-calculator
5. Returns coin cost and tier

**Enforces tier-locking at the service layer.**

### 5. Updated Transform Functions

**`transformSlipToListItem()`** - Now includes:
- `totalCoinCost`
- `minCoinSpend`
- `coinSpendMet`

**`transformPick()`** - Now includes:
- `coinCost`
- `tier`

### 6. Modified createSlip()

**Before Transaction:**
1. Fetch user tier via `getUserTier(userId)`
2. Calculate coin cost and tier for each pick (validates tier access)
3. Calculate `totalCoinCost` as sum of all pick costs

**In Transaction:**
Added to pick creation:
- `tier: pickCoinData[index].tier`
- `coinCost: pickCoinData[index].coinCost`

Added to slip creation:
- `totalCoinCost`

**Error Handling:**
Throws `TIER_LOCKED` error if user attempts to add a pick above their tier.

### 7. Modified updateSlip()

**When Adding Picks:**
1. Fetch user tier
2. Calculate coin costs for new picks (validates tier access)

**In Transaction:**
Added to pick creation:
- `tier: pickCoinData[index].tier`
- `coinCost: pickCoinData[index].coinCost`

**After Pick Updates:**
1. Fetch updated picks including `coinCost`
2. Recalculate `totalCoinCost` as sum
3. Update slip with new `totalCoinCost`

### 8. Modified lockSlip()

**Critical Changes - This is where minimum spend validation occurs:**

**Pre-Lock Validation:**
1. Fetch slip with picks (including `tier` and `coinCost`)
2. Recalculate coin costs **server-side** (authoritative):
   - Calculate implied probability from odds
   - Call `calculateCoinCost()` for each pick
   - Create `PickForValidation[]` array
3. Call `validateMinimumSpend(picks)`
4. Throw `MIN_SPEND_NOT_MET` if validation fails

**In Transaction:**
Update slip with:
- `status: SlipStatus.PENDING`
- `lockedAt: new Date()`
- `totalCoinCost: minSpendValidation.totalCoinCost`
- `minCoinSpend: minSpendValidation.minCoinSpend`
- `coinSpendMet: true`

**Security Note:** Coin costs are recalculated server-side at lock time to prevent client manipulation.

---

## Security Properties

### 1. Server-Side Calculation
All coin costs are calculated server-side. Client-provided values are ignored.

### 2. Tier Enforcement
Users cannot add picks above their tier. Enforced in:
- `createSlip()` - Initial pick validation
- `updateSlip()` - When adding picks
- `calculatePickCoinCostAndTier()` - Throws `TIER_LOCKED` error

### 3. Authoritative Validation
At lock time, coin costs are **recalculated** from scratch using stored odds. This prevents:
- Race conditions (tier changed since creation)
- Client manipulation (modified coin costs)
- Stale data (odds/tiers changed)

### 4. Minimum Spend Enforcement
Minimum spend requirement is validated at lock time only, not during draft editing. This allows users to:
- Build slips incrementally
- Experiment with picks
- Only validate when committing

---

## Minimum Spend Rules

From `pointlock-calculator.ts`:

| Pick Count | Minimum Coins |
|-----------|---------------|
| 1         | No minimum    |
| 2         | 80 coins      |
| 3         | 110 coins     |
| 4         | 140 coins     |
| 5         | 170 coins     |
| 6         | 200 coins     |
| 7         | 230 coins     |
| 8+        | 260 coins     |

---

## Error Codes

### TIER_LOCKED (`SLIP_006`)
**Thrown when:** User attempts to add a pick that requires a tier above their current tier.

**Example:**
```
User tier: FREE
Attempts to add: prop pick (requires PREMIUM)
Result: ForbiddenError with TIER_LOCKED
```

### MIN_SPEND_NOT_MET (`SLIP_005`)
**Thrown when:** User attempts to lock a slip that doesn't meet the minimum coin spend.

**Example:**
```
2 picks with 30 coins each = 60 total
Minimum for 2 picks = 80 coins
Shortfall = 20 coins
Result: BadRequestError with MIN_SPEND_NOT_MET
```

---

## Testing Scenarios

### 1. Basic Tier Access
- FREE user can add moneyline picks ✓
- FREE user cannot add spread picks ✗ (TIER_LOCKED)
- STANDARD user can add spread/total picks ✓
- STANDARD user cannot add prop picks ✗ (TIER_LOCKED)

### 2. Minimum Spend Validation
- 1 pick with 25 coins → Locks successfully ✓
- 2 picks with 40 coins each → Locks successfully (80 total) ✓
- 2 picks with 30 coins each → Lock fails (60 < 80) ✗
- 3 picks with 40 coins each → Locks successfully (120 > 110) ✓

### 3. Server-Side Recalculation
- Create slip with picks (stored coin costs)
- User tier changes externally
- Lock slip → Recalculates with new tier ✓
- Validation uses fresh calculation, not stale data ✓

### 4. Partial Slip Building
- User creates slip with 1 pick (no minimum) ✓
- User adds second pick (total < 80) ✓ (still DRAFT)
- User attempts to lock → Fails with MIN_SPEND_NOT_MET ✗
- User adds higher-tier pick to meet minimum ✓
- User locks successfully ✓

---

## Integration Points

### Dependencies Used
1. **`tier.service.ts`**
   - `getUserTier(userId)` - Fetches user's current tier
   - `isPickLocked(pick, userTier)` - Validates tier access

2. **`pointlock-calculator.ts`**
   - `calculateCoinCost(probability, tier)` - Calculates pick cost
   - `validateMinimumSpend(picks)` - Validates slip meets minimum

3. **`odds-calculator.ts`**
   - `americanToImpliedProbability(odds)` - Converts odds to probability

### Data Flow
```
Client Request
    ↓
createSlip() / updateSlip()
    ↓
getUserTier(userId)
    ↓
calculatePickCoinCostAndTier() [per pick]
    ↓
  - getPickTierFromMarket()
  - isPickLocked() [validation]
  - americanToImpliedProbability()
  - calculateCoinCost()
    ↓
Store in database (tier, coinCost)
    ↓
lockSlip()
    ↓
Recalculate server-side [authoritative]
    ↓
validateMinimumSpend()
    ↓
Update slip (totalCoinCost, minCoinSpend, coinSpendMet)
```

---

## Database Fields Modified

### Slip Model
- `totalCoinCost: Int` - Sum of all pick coin costs
- `minCoinSpend: Int` - Required minimum for this pick count
- `coinSpendMet: Boolean` - Whether minimum was met at lock time

### SlipPick Model
- `coinCost: Int` - Coin cost for this individual pick
- `tier: PickTier` - Tier required for this pick

All fields were already present in schema (Task 0.3). This task implements the business logic.

---

## Performance Considerations

1. **Tier Lookup**: Single query per slip operation (`getUserTier`)
2. **Coin Calculation**: Pure math functions, no I/O
3. **Lock Validation**: Recalculates N picks (N ≤ 20), negligible overhead
4. **Transaction Safety**: Lock operation wrapped in Prisma transaction

No N+1 queries. No heavy computations. No external API calls.

---

## Verification Checklist

- [x] Imports added correctly
- [x] SELECT constants updated
- [x] Response types updated in schemas
- [x] Helper functions implemented
- [x] Transform functions updated
- [x] createSlip() integrates tier system
- [x] updateSlip() integrates tier system
- [x] lockSlip() validates minimum spend
- [x] Error codes added to shared-types
- [x] TypeScript compilation passes
- [x] No unused imports/variables
- [x] Server-side recalculation at lock time
- [x] Tier enforcement at pick addition
- [x] All coin costs calculated server-side

---

## Next Steps

### Task 1.5 - Controller & Route Integration
Update slip endpoints to handle new response fields and error codes.

### Task 1.6 - Testing
Write unit tests for:
- `calculatePickCoinCostAndTier()`
- Tier access validation
- Minimum spend validation
- Server-side recalculation

### Task 1.7 - Documentation
Document API changes for frontend team:
- New response fields
- New error codes
- Minimum spend requirements
