# POINTLOCK Implementation Phases

> Transformation from PickRivals to POINTLOCK - A coin-based progression and PvP gaming system

## Key Decisions Made

| Decision | Choice |
|----------|--------|
| Starter coins | **750 coins** |
| Launch leagues | **NBA + NFL + MLB + NHL** |
| Friends system | **Full friends list** with add/remove, online status, direct challenges |
| Player tier assignment | **Auto by popularity/stats** using external APIs |

---

## Phase 0: Foundation (Renaming, Types, Schema)

### 0.1 App Renaming [COMPLETED]
- [x] Root `package.json` - changed to `pointlock`
- [x] `apps/api/package.json` - changed to `@pointlock/api`
- [x] `apps/mobile/package.json` - changed to `@pointlock/mobile`
- [x] `packages/shared-types/package.json` - changed to `@pointlock/shared-types`
- [x] `apps/mobile/app.json` - updated name, slug, scheme, bundle IDs
- [x] `apps/mobile/app.config.js` - updated all branding

### 0.2 New Shared Types [PENDING]
Create these new type files in `packages/shared-types/src/`:

**tier.types.ts**
```typescript
export enum PickTier {
  FREE = 1,      // Default unlocked
  STANDARD = 2,  // Unlock at 2,500 coins
  PREMIUM = 3,   // Unlock at 7,500+ coins
  ELITE = 4,     // High balance or 5+ win streak
}

export const TIER_THRESHOLDS = [
  { tier: PickTier.FREE, coinThreshold: 0, name: 'Free' },
  { tier: PickTier.STANDARD, coinThreshold: 2500, name: 'Standard' },
  { tier: PickTier.PREMIUM, coinThreshold: 7500, name: 'Premium' },
  { tier: PickTier.ELITE, coinThreshold: 15000, streakThreshold: 5, name: 'Elite' },
];
```

**coin.types.ts**
```typescript
export const STARTER_COINS = 750;

export const COIN_FORMULA = {
  C_MIN: 25, C_MAX: 250, ALPHA: 2.2,
  TIER_MULTIPLIERS: { FREE: 1.0, STANDARD: 1.15, PREMIUM: 1.3, ELITE: 1.5 },
};

export const POINTS_FORMULA = {
  P_MIN: 8, P_MAX: 30, BETA: 1.3,
  UNDERDOG_BONUS: { 300: 2, 400: 3, 500: 4 },
  MARKET_MODIFIERS: { moneyline: 1.0, spread: 0.85, prop: 0.90, total: 0.90 },
};

export const MIN_SLIP_SPEND = { 2: 80, 3: 110, 4: 140, 5: 170, 6: 200, 7: 230, 8: 260 };
```

**gamemode.types.ts**
```typescript
export enum GameMode {
  INVITE_FRIEND = 'invite_friend',   // Mode A - link/code
  PLAY_FRIEND = 'play_friend',       // Mode B - direct challenge
  QUICK_MATCH = 'quick_match',       // Mode C - auto-queue
  RANDOM_MATCH = 'random_match',     // Mode D - manual filters
}
```

**ranked.types.ts**
```typescript
export enum Rank {
  BRONZE_1, BRONZE_2, BRONZE_3,
  SILVER_1, SILVER_2, SILVER_3,
  GOLD_1, GOLD_2, GOLD_3,
  PLATINUM_1, PLATINUM_2, PLATINUM_3,
  DIAMOND_1, DIAMOND_2, DIAMOND_3,
}
```

**Update index.ts** - Add exports for new types
**Update event.types.ts** - Change `SUPPORTED_SPORTS` to `['NBA', 'NFL', 'MLB', 'NHL']`

### 0.3 Database Schema Updates [PENDING]
Add to `apps/api/prisma/schema.prisma`:
- New enums: `PickTier`, `GameMode`, `Rank`, `FriendshipStatus`
- User model: `currentTier`, `highestTierUnlocked`, `totalCoinsEarned`, `currentRank`, `rankPoints`
- SlipPick model: `coinCost`, `tier`, `marketModifier`
- Slip model: `totalCoinCost`, `minCoinSpend`, `coinSpendMet`
- Match model: `gameMode`, `tiebreakRound`
- New models: `MatchmakingQueue`, `Season`, `SeasonEntry`, `SeasonReward`, `PlayerTierAssignment`, `Friendship`

### 0.4 Starter Coins [COMPLETE]
- Modified `apps/api/src/modules/auth/auth.service.ts`
- Added `STARTER_CREDIT` to `TransactionType` enum in `prisma/schema.prisma`
- Created migration `20260127100000_add_starter_credit`
- Updated `wallet.service.ts` CREDIT_TYPES array
- Credits exactly 750 coins on user registration (atomic with user + wallet creation)
- Creates audit trail via Transaction record with idempotencyKey

### 0.5 Database Migration [PENDING]
- Create migration: `20260127000000_pointlock_foundation`

---

## Phase 1: Core Mechanics

### 1.1 POINTLOCK Calculator [PENDING]
Create `apps/api/src/lib/pointlock-calculator.ts`:
- `calculateCoinCost(impliedProbability, tier)` - Coin cost formula
- `calculatePoints(impliedProbability, americanOdds, marketType)` - Points formula
- `validateMinimumSpend(picks, pickCount)` - Min spend validation

### 1.2 Tier Service [PENDING]
Create `apps/api/src/lib/tier.service.ts`:
- `getUserTier(userId)` - Calculate tier from balance + streak
- `checkTierUnlock(userId)` - Check if user qualifies for new tier
- `isPickLocked(pick, userTier)` - Validate pick tier access
- `getAvailablePicks(userId, eventId)` - Filter picks by user's tier

### 1.3 Auto Player Tier Assignment [PENDING]
Create `apps/api/src/services/player-tier.service.ts`:
- Auto-categorize players by stats (PPG, All-Star status, etc.)
- Daily sync job via BullMQ

Create `apps/api/src/queues/player-tier-sync.worker.ts`:
- Runs daily at 4 AM
- Fetches player stats from external API

**Tier Criteria:**
| Tier | NBA | NFL | MLB | NHL |
|------|-----|-----|-----|-----|
| ELITE | 25+ PPG, All-Star | 4000+ pass yds, Pro Bowl | .900+ OPS, All-Star | 80+ pts, All-Star |
| PREMIUM | 18+ PPG, Starter | Top 15 at position | .800+ OPS | 50+ pts |
| STANDARD | 10+ PPG, 50+ games | 16+ games, roster | .700+ OPS | 30+ pts |
| FREE | Everyone else | Everyone else | Everyone else | Everyone else |

### 1.4 Update Slip Service [PENDING]
Modify `apps/api/src/modules/slips/slips.service.ts`:
- Calculate `coinCost` for each pick
- Sum `totalCoinCost` for slip
- Validate minimum spend before lock
- Reject picks above user's tier

### 1.5 Mobile Updates [PENDING]
- Modify `apps/mobile/src/stores/slip.store.ts` - Add coin cost tracking
- Create `apps/mobile/src/hooks/useTierStatus.ts` - Tier progress hook

---

## Phase 2: Game Modes (Matchmaking, Queue, Friends)

### 2.0 Friends System [PENDING]
**API:**
- Create `apps/api/src/modules/friends/friends.controller.ts`
- Create `apps/api/src/modules/friends/friends.service.ts`
- Endpoints: GET /friends, POST /friends/request/:userId, etc.

**Mobile:**
- Create `apps/mobile/app/friends/index.tsx`
- Create `apps/mobile/src/components/friends/FriendCard.tsx`
- Create `apps/mobile/src/services/friends.service.ts`

### 2.1 Matchmaking Service [PENDING]
Create `apps/api/src/services/matchmaking.service.ts`:
- Matchmaking rules: slip size match, coin balance band, tier access, MMR
- `processMatchmakingQueue()` - Find compatible opponents

### 2.2 Match Controller Updates [PENDING]
Modify `apps/api/src/modules/matches/matches.controller.ts`:
- `POST /matches/quick` - Quick Match
- `POST /matches/random` - Random Match
- `POST /matches/friend/:userId` - Direct challenge
- `GET /matches/queue/status` - Queue position

### 2.3 Win Conditions & Tiebreakers [PENDING]
Modify `apps/api/src/services/settlement.service.ts`:
1. Higher total points wins
2. Tiebreaker 1: Fewer picks used
3. Tiebreaker 2: Lower total coin cost
4. Tiebreaker 3: Draw (both refunded)

### 2.4 Queue Worker [PENDING]
Create `apps/api/src/queues/matchmaking.worker.ts`:
- BullMQ worker runs every 5 seconds
- Processes queue, creates matches
- Notifies via Socket.io

### 2.5 Mobile Queue [DONE]
- Created `apps/mobile/src/stores/queue.store.ts` - Zustand store with polling, auto-stop on match found
- Created `apps/mobile/src/services/matchmaking.service.ts` - API service for queue/quick/random/friend endpoints

---

## Phase 3: UI Overhaul

### 3.1 Home Screen Redesign [PENDING]
Modify `apps/mobile/app/(tabs)/index.tsx`:
- Quick Match (primary CTA)
- Play Friend / Invite Friend / Random Match cards
- Tier progress bar
- Live matches carousel

**New Components:**
- `QuickMatchButton.tsx`
- `GameModeCard.tsx`
- `TierProgressBar.tsx`
- `LiveMatchesCarousel.tsx`

### 3.2 Slip Builder Overhaul [PENDING]
Modify `apps/mobile/app/slip/builder.tsx`:
- League filter bar (NFL, NBA, MLB, NHL)
- Pick cards show coin cost + point value
- Locked picks with "Unlocks at Tier X"
- Slip tray with min-spend progress

**New Components:**
- `SlipTray.tsx`
- `LockedPickOverlay.tsx`
- `PickCard.tsx`

### 3.3 Pick Card Design [PENDING]
- Player/Team name + market badge (PTS, ML, SPREAD)
- Prop line + odds
- Coin cost (gold icon) + Point value (star icon)
- Risk color coding (green=favorite, purple=underdog, red=extreme)

### 3.4 Live Match Screen [PENDING]
Modify `apps/mobile/app/match/[id].tsx`:
- Scoreboard (You vs Opponent with points)
- Momentum bar
- Pick progress feed with real-time status

**New Components:**
- `MomentumBar.tsx`
- `PickProgressFeed.tsx`
- `FinalResultsModal.tsx`

### 3.5 New Screens [PENDING]
- Create `apps/mobile/app/queue/waiting.tsx`
- Create `apps/mobile/app/match/found.tsx`

---

## Phase 4: Ranked/Seasonal Mode

### 4.1 Ranked Service [PENDING]
Create `apps/api/src/services/ranked.service.ts`:
- `getOrCreateSeasonEntry(userId, seasonId)`
- `updateRankPoints(userId, matchResult)` - +25 win / -20 loss base
- `calculateNewRank(currentRank, rpChange)`
- `distributeSeasonRewards(seasonId)`

### 4.2 Placement Matches [PENDING]
- 10 placement matches required
- 9+ wins = Gold I, 7+ = Silver III, 5+ = Silver I, etc.

### 4.3 Season Worker [PENDING]
Create `apps/api/src/queues/season.worker.ts`:
- Daily rank decay for inactive players
- Season end processing
- Reward distribution

### 4.4 Mobile Ranked UI [PENDING]
Create `apps/mobile/app/ranked/index.tsx`:
- Season info + countdown
- Rank badge + RP progress
- Placement progress / Record
- Rewards track

**New Components:**
- `RankBadge.tsx`
- `RPProgressBar.tsx`
- `PlacementProgress.tsx`
- `RewardsTrack.tsx`

---

## Phase 5: Polish & Testing

### 5.1 Testing [PENDING]
- Unit tests for coin/points calculators
- Integration tests for matchmaking queue
- E2E tests for full match flow
- Load tests for 100+ simultaneous queue users

### 5.2 Performance [PENDING]
- Redis caching for tier lookups
- Database query optimization
- Mobile list virtualization

### 5.3 Error Handling [PENDING]
- Queue timeout graceful degradation
- Offline slip building
- Retry logic for failed matches

---

## Dependencies

```
Phase 0 (Foundation)
    ↓
Phase 1 (Core Mechanics) ← needs types & schema
    ↓
Phase 2 (Game Modes) ← needs coin costs on slips
    ↓
Phase 3 (UI Overhaul) ← needs game modes working
    ↓
Phase 4 (Ranked) ← needs matchmaking working
    ↓
Phase 5 (Polish) ← needs all features complete
```

---

## File Summary

### New Files to Create (40+)
| Category | Files |
|----------|-------|
| Shared Types | `tier.types.ts`, `coin.types.ts`, `gamemode.types.ts`, `ranked.types.ts` |
| API Services | `pointlock-calculator.ts`, `tier.service.ts`, `matchmaking.service.ts`, `ranked.service.ts`, `player-tier.service.ts` |
| API Modules | `friends/friends.controller.ts`, `friends/friends.service.ts` |
| API Workers | `matchmaking.worker.ts`, `season.worker.ts`, `player-tier-sync.worker.ts` |
| Mobile Stores | `queue.store.ts` |
| Mobile Screens | `queue/waiting.tsx`, `ranked/index.tsx`, `friends/index.tsx` |
| Mobile Services | `friends.service.ts`, `matchmaking.service.ts` |
| Mobile Components | 20+ new components for home, slip, match, ranked, friends |

### Files to Modify (25+)
| Category | Files |
|----------|-------|
| Database | `schema.prisma` + new migration |
| API | `auth.service.ts`, `slips.service.ts`, `matches.service.ts`, `matches.controller.ts`, `settlement.service.ts` |
| Mobile | `(tabs)/index.tsx`, `slip/builder.tsx`, `match/[id].tsx`, `slip.store.ts`, `BettingEventCard.tsx` |
| Shared Types | `index.ts`, `event.types.ts` |

---

## Verification Checklist

### Phase 0
- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm db:migrate` applies cleanly
- [ ] `pnpm build` compiles without errors

### Phase 1
- [ ] Coin cost: -250 odds = ~200 coins, +400 odds = ~30 coins
- [ ] Points: Favorites = 8-12 pts, Underdogs = 25-30 pts
- [ ] Min spend validation rejects 4-pick slip with <140 coins
- [ ] Tier-locked picks rejected for lower-tier users

### Phase 2
- [ ] Quick Match finds opponent within 30 seconds
- [ ] Random Match filters work correctly
- [ ] Tiebreaker cascade works

### Phase 3
- [ ] Home screen displays all 4 game modes
- [ ] Slip builder shows coin costs and locked picks
- [ ] Live match shows real-time point updates

### Phase 4
- [ ] Placement matches (10) complete before rank shown
- [ ] RP gain/loss calculated correctly
- [ ] Season end triggers reward distribution
