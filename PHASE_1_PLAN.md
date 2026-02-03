# PickRivals Phase 1: "Handshake" MVP Implementation Plan

## Overview

**Goal**: Validate the core mechanic (Slip Building + PvP Settlement)

**Scope**:

- NFL & NBA only
- 1v1 Private Challenges (Invite Link only)
- Basic Virtual Currency (No redemption, leaderboard clout only)
- Simple Leaderboard

**Success Metric**: 50% Day-1 Retention

**Estimated Duration**: 8-12 weeks

---

## Phase 1 Task Breakdown

### Sprint 0: Project Foundation (Week 1)

#### Task 0.1: Monorepo Setup

- [ ] Initialize pnpm workspace with Turborepo
- [ ] Create root `package.json` with workspace configuration
- [ ] Set up `turbo.json` for build pipeline
- [ ] Configure shared ESLint and Prettier configs
- [ ] Create `.env.example` with all required environment variables
- [ ] Set up `.gitignore` for all workspaces

#### Task 0.2: Shared Packages Setup

- [ ] Create `packages/shared-types` with base TypeScript types
- [ ] Create `packages/utils` with shared utility functions
- [ ] Configure TypeScript project references
- [ ] Set up package exports and build scripts

#### Task 0.3: Backend Project Initialization

- [ ] Initialize `apps/api` with Node.js + TypeScript
- [ ] Set up Express.js with basic middleware (cors, helmet, compression)
- [ ] Configure Prisma ORM with PostgreSQL connection
- [ ] Set up Redis client configuration
- [ ] Create basic health check endpoint (`GET /health`)
- [ ] Configure environment-based config management

#### Task 0.4: Mobile Project Initialization

- [ ] Initialize `apps/mobile` with Expo (managed workflow)
- [ ] Configure Expo Router for file-based navigation
- [ ] Set up NativeWind (Tailwind CSS)
- [ ] Configure React Query client
- [ ] Set up Zustand for client state
- [ ] Create base API service with Axios

#### Task 0.5: Development Environment

- [ ] Create Docker Compose for local PostgreSQL + Redis
- [ ] Set up database migration scripts
- [ ] Configure hot reload for both apps
- [ ] Create README with setup instructions

---

### Sprint 1: Authentication System (Week 2)

#### Task 1.1: Database Schema - Users & Auth

- [ ] Create Prisma schema for `users` table
- [ ] Create Prisma schema for `refresh_tokens` table
- [ ] Generate and run initial migration
- [ ] Create seed script for test users

#### Task 1.2: Auth Service - Backend

- [ ] Implement password hashing utility (bcrypt)
- [ ] Implement JWT token generation (access + refresh)
- [ ] Create `POST /api/v1/auth/register` endpoint
  - Email validation
  - Username uniqueness check
  - Password strength validation
  - Create user + wallet atomically
- [ ] Create `POST /api/v1/auth/login` endpoint
  - Email/password verification
  - Return tokens + user data
- [ ] Create `POST /api/v1/auth/refresh` endpoint
  - Validate refresh token
  - Rotate refresh token
  - Return new token pair
- [ ] Create `POST /api/v1/auth/logout` endpoint
  - Invalidate refresh token

#### Task 1.3: Auth Middleware - Backend

- [ ] Create JWT verification middleware
- [ ] Create user context middleware (attach user to request)
- [ ] Implement rate limiting middleware
- [ ] Create validation middleware using Zod schemas

#### Task 1.4: Auth UI - Mobile

- [ ] Create `(auth)/_layout.tsx` with auth navigation stack
- [ ] Build Login screen
  - Email input with validation
  - Password input with show/hide toggle
  - Login button with loading state
  - "Forgot Password" link (placeholder for MVP)
  - "Create Account" navigation
- [ ] Build Register screen
  - Email input with validation
  - Username input with availability check
  - Password input with strength indicator
  - Confirm password input
  - Terms acceptance checkbox
  - Register button with loading state
- [ ] Implement secure token storage (expo-secure-store)
- [ ] Create auth context/store for global auth state

#### Task 1.5: Auth Flow Integration

- [ ] Implement auto-login on app launch (check stored tokens)
- [ ] Create authenticated API interceptor (attach Bearer token)
- [ ] Implement token refresh interceptor (auto-refresh on 401)
- [ ] Create logout flow (clear tokens, reset state)
- [ ] Implement auth-based navigation guards

---

### Sprint 2: Wallet System (Week 3)

#### Task 2.1: Database Schema - Wallets & Transactions

- [ ] Create Prisma schema for `wallets` table
- [ ] Create Prisma schema for `transactions` table
- [ ] Create database function for atomic wallet operations
- [ ] Generate and run migration
- [ ] Update user creation to auto-create wallet

#### Task 2.2: Wallet Service - Backend

- [ ] Create wallet repository with transaction support
- [ ] Implement `getWalletByUserId` with balance calculation
- [ ] Implement `processTransaction` with idempotency
- [ ] Implement `getTransactionHistory` with pagination
- [ ] Create `GET /api/v1/wallet` endpoint
- [ ] Create `GET /api/v1/wallet/transactions` endpoint

#### Task 2.3: Weekly Allowance System

- [ ] Create BullMQ job for weekly allowance distribution
- [ ] Implement allowance eligibility check
- [ ] Create manual claim endpoint `POST /api/v1/wallet/claim-allowance`
- [ ] Track last allowance timestamp per user

#### Task 2.4: Wallet UI - Mobile

- [ ] Create `BalanceDisplay` component (header widget)
- [ ] Build Wallet screen (`wallet/index.tsx`)
  - Current balance (paid + bonus breakdown)
  - Transaction history list
  - Pull-to-refresh
- [ ] Create `TransactionItem` component
  - Type icon (purchase, win, loss, bonus)
  - Amount with color coding (+green, -red)
  - Timestamp
  - Description
- [ ] Integrate balance display in main tab bar

#### Task 2.5: Wallet Integration

- [ ] Add wallet data to auth response
- [ ] Create `useWallet` hook for balance access
- [ ] Implement real-time balance updates (after match settlement)
- [ ] Add loading and error states

---

### Sprint 3: Sports Data Integration (Week 4)

#### Task 3.1: Sports Data Service Setup

- [ ] Choose and configure sports data provider (SportRadar or OddsAPI)
- [ ] Create API client with authentication
- [ ] Implement request caching with Redis (TTL: 60 seconds for odds)
- [ ] Create error handling and retry logic

#### Task 3.2: Database Schema - Sports Events

- [ ] Create Prisma schema for `sports_events` table
- [ ] Create indexes for efficient querying
- [ ] Generate and run migration

#### Task 3.3: Events Sync Service - Backend

- [ ] Create BullMQ job for periodic events sync
- [ ] Implement NFL games fetcher
- [ ] Implement NBA games fetcher
- [ ] Create upsert logic for events (handle updates)
- [ ] Store odds data as JSONB

#### Task 3.4: Events API - Backend

- [ ] Create `GET /api/v1/events` endpoint
  - Filter by sport (NFL, NBA)
  - Filter by date range
  - Sort by start time
  - Pagination
- [ ] Create `GET /api/v1/events/:id` endpoint
  - Full event details
  - Current odds (moneyline, spread, total)

#### Task 3.5: Events UI - Mobile

- [ ] Create `SportFilter` component (NFL/NBA tabs)
- [ ] Create `EventCard` component
  - Team names and logos (placeholder images for MVP)
  - Game time
  - Current spread/moneyline display
- [ ] Build Events list screen (part of slip builder)
  - Grouped by date
  - Pull-to-refresh
  - Loading skeletons

---

### Sprint 4: Slip Builder - Core (Week 5)

#### Task 4.1: Database Schema - Slips & Picks

- [ ] Create Prisma schema for `slips` table
- [ ] Create Prisma schema for `slip_picks` table
- [ ] Generate and run migration

#### Task 4.2: Slip Service - Backend

- [ ] Create slip repository
- [ ] Implement `createSlip` with picks
- [ ] Implement `getSlipById` with picks populated
- [ ] Implement `getUserSlips` with pagination
- [ ] Implement `updateSlip` (add/remove picks)
- [ ] Implement `deleteSlip` (draft only)
- [ ] Create `POST /api/v1/slips` endpoint
- [ ] Create `GET /api/v1/slips` endpoint
- [ ] Create `GET /api/v1/slips/:id` endpoint
- [ ] Create `PATCH /api/v1/slips/:id` endpoint
- [ ] Create `DELETE /api/v1/slips/:id` endpoint

#### Task 4.3: Point Potential Calculator

- [ ] Implement American odds to implied probability conversion
- [ ] Implement point value calculation based on odds difficulty
- [ ] Create `calculateSlipPointPotential` function
- [ ] Add point potential to slip response

#### Task 4.4: Slip Builder Store - Mobile

- [ ] Create `slipStore` with Zustand
  - Current picks array
  - Add pick action
  - Remove pick action
  - Clear slip action
  - Point potential (computed)
- [ ] Persist draft slip to AsyncStorage

#### Task 4.5: Slip Builder UI - Mobile (Part 1)

- [ ] Create `OddsButton` component
  - Display odds value
  - Selected state styling
  - Tap to add/remove from slip
- [ ] Enhance `EventCard` with odds buttons
  - Moneyline (Home/Away)
  - Spread (Home/Away)
  - Total (Over/Under)
- [ ] Create slip builder screen (`slip/builder.tsx`)
  - Events list with odds buttons
  - Sport filter tabs

---

### Sprint 5: Slip Builder - Complete (Week 6)

#### Task 5.1: Slip Summary UI - Mobile

- [ ] Create `PickItem` component
  - Event info (teams, time)
  - Pick type and selection
  - Odds display
  - Remove button
- [ ] Create `SlipCard` component (collapsible bottom sheet)
  - Pick count badge
  - List of current picks
  - Point potential display
  - Clear all button
- [ ] Create `PointPotential` component
  - Visual meter/bar
  - Numerical display
  - Difficulty indicator

#### Task 5.2: Slip Submission Flow

- [ ] Add "Lock Slip" button to slip card
- [ ] Create slip preview/confirmation modal
  - All picks summary
  - Point potential
  - Confirm button
- [ ] Implement slip creation API call
- [ ] Show success state with slip ID
- [ ] Navigate to challenge creation

#### Task 5.3: Slip Validation

- [ ] Implement minimum picks validation (1 pick minimum)
- [ ] Implement maximum picks validation (10 picks maximum for MVP)
- [ ] Validate all events haven't started yet
- [ ] Show validation errors inline

#### Task 5.4: My Slips Screen

- [ ] Build slips list screen (`(tabs)/matches.tsx` - "My Picks" section)
  - Filter: Draft / Active / Completed
  - Slip cards with status
- [ ] Create slip detail screen (`slip/[id].tsx`)
  - All picks with results (for settled)
  - Point potential / points earned
  - Associated match (if any)

---

### Sprint 6: PvP Match System (Week 7)

#### Task 6.1: Database Schema - Matches

- [ ] Create Prisma schema for `matches` table
- [ ] Create indexes for efficient querying
- [ ] Generate and run migration

#### Task 6.2: Match Service - Backend

- [ ] Create match repository
- [ ] Implement `createMatch` (private challenge)
  - Generate unique invite code
  - Set expiration (24 hours)
  - Deduct stake from creator wallet
- [ ] Implement `joinMatch`
  - Validate invite code
  - Check not expired
  - Check opponent has sufficient balance
  - Deduct stake from opponent wallet
  - Link opponent slip to match
- [ ] Implement `getMatchById` with full details
- [ ] Implement `getUserMatches` with pagination
- [ ] Create `POST /api/v1/matches` endpoint
- [ ] Create `GET /api/v1/matches` endpoint
- [ ] Create `GET /api/v1/matches/:id` endpoint
- [ ] Create `POST /api/v1/matches/:id/join` endpoint
- [ ] Create `GET /api/v1/matches/invite/:code` endpoint

#### Task 6.3: Stake Selection UI - Mobile

- [ ] Create stake amount selector component
  - Preset amounts (1K, 5K, 10K, 25K RC)
  - Custom amount input
  - Balance check with warning
- [ ] Integrate into challenge creation flow

#### Task 6.4: Challenge Creation Flow - Mobile

- [ ] Create challenge modal/screen
  - Show slip summary
  - Stake selector
  - "Create Challenge" button
- [ ] Generate and display invite link
- [ ] Implement share functionality (native share sheet)
- [ ] Show pending challenge state

#### Task 6.5: Challenge Accept Flow - Mobile

- [ ] Create deep link handler for invite codes
- [ ] Build join challenge screen (`match/join/[code].tsx`)
  - Show creator's challenge details (stake, not their picks)
  - "Accept Challenge" button
  - Slip builder for opponent's picks
- [ ] Implement join match with slip submission
- [ ] Show match active confirmation

---

### Sprint 7: Live Match Experience (Week 8)

#### Task 7.1: WebSocket Infrastructure - Backend

- [ ] Set up Socket.io server alongside Express
- [ ] Implement connection authentication (JWT)
- [ ] Create room management for matches
- [ ] Implement `join:match` event handler
- [ ] Implement `leave:match` event handler

#### Task 7.2: Live Score Updates - Backend

- [ ] Create sports data webhook/polling handler
- [ ] Implement score update processor
- [ ] Broadcast `event:score` to subscribed clients
- [ ] Broadcast `event:status` on game status change

#### Task 7.3: WebSocket Client - Mobile

- [ ] Set up Socket.io client with reconnection
- [ ] Create `useSocket` hook
- [ ] Implement room join/leave on match screen mount/unmount
- [ ] Handle incoming score updates
- [ ] Handle connection state (connected/disconnected indicator)

#### Task 7.4: Live Match UI - Mobile

- [ ] Build match detail screen (`match/[id].tsx`)
  - Header: Match status, stake amount
  - Versus display (User vs Opponent)
- [ ] Create `VersusView` component
  - Side-by-side slip comparison
  - Current points for each user
  - Visual "winning" indicator
- [ ] Create `LiveTracker` component
  - Pick-by-pick status (pending/won/lost)
  - Live progress for in-game events
  - Real-time point updates

#### Task 7.5: Match Status Updates

- [ ] Update UI on pick settlement
- [ ] Show toast/notification on pick result
- [ ] Animate point changes
- [ ] Handle match completion state

---

### Sprint 8: Settlement System (Week 9)

#### Task 8.1: Settlement Service - Backend

- [ ] Create settlement service
- [ ] Implement pick result determination logic
  - Moneyline: Compare final scores
  - Spread: Apply spread to final scores
  - Total: Compare combined score to line
- [ ] Implement slip scoring (sum of won pick point values)
- [ ] Implement match winner determination
  - Higher points wins
  - Handle tie (push - return stakes)

#### Task 8.2: Settlement Job - Backend

- [ ] Create BullMQ job for game settlement
- [ ] Listen for "game final" events from sports data
- [ ] Process all picks for completed game
- [ ] Update pick statuses
- [ ] Recalculate slip points
- [ ] Check if all picks in match are settled
- [ ] Trigger match settlement when complete

#### Task 8.3: Match Settlement - Backend

- [ ] Implement match settlement logic
- [ ] Calculate rake (5% from each user = 10% total)
- [ ] Credit winner's wallet (total pot - rake)
- [ ] Update match status to "settled"
- [ ] Update user statistics (wins, losses, streak)
- [ ] Create settlement transactions for audit

#### Task 8.4: Settlement Notifications

- [ ] Emit WebSocket event on match settlement
- [ ] Create push notification for match result
- [ ] Update match detail screen with final result

#### Task 8.5: Settlement Edge Cases

- [ ] Handle cancelled games (void picks, refund stakes)
- [ ] Handle postponed games (keep picks pending)
- [ ] Handle push results (return stakes, no rake)
- [ ] Implement manual settlement admin endpoint (for disputes)

---

### Sprint 9: Leaderboard & Profile (Week 10)

#### Task 9.1: Database Schema - Leaderboards

- [ ] Create Prisma schema for `leaderboards` table
- [ ] Create Prisma schema for `leaderboard_entries` table
- [ ] Generate and run migration

#### Task 9.2: Leaderboard Service - Backend

- [ ] Create leaderboard repository
- [ ] Implement global leaderboard query
  - Rank by total points earned
  - Include win rate, matches played
- [ ] Implement weekly leaderboard (reset Mondays)
- [ ] Create `GET /api/v1/leaderboard` endpoint
- [ ] Create `GET /api/v1/leaderboard/weekly` endpoint

#### Task 9.3: Leaderboard Update Job

- [ ] Create BullMQ job for leaderboard recalculation
- [ ] Run after each match settlement
- [ ] Update rankings efficiently (batch updates)
- [ ] Cache top 100 in Redis for fast access

#### Task 9.4: Leaderboard UI - Mobile

- [ ] Build leaderboard screen (`(tabs)/leaderboard.tsx`)
  - Tab: All Time / This Week
  - User rank card (your position)
  - Top players list
- [ ] Create leaderboard entry component
  - Rank number
  - Username and avatar
  - Points / Win rate
  - Highlight current user

#### Task 9.5: User Profile - Mobile

- [ ] Build profile screen (`(tabs)/profile.tsx`)
  - Avatar and display name
  - Username
  - Stats card (matches, wins, streak)
  - Win rate percentage
- [ ] Create edit profile modal
  - Change display name
  - Change avatar (predefined options for MVP)
- [ ] Build public profile screen (`users/[id].tsx`)
  - Same layout as own profile
  - "Challenge" button

---

### Sprint 10: Polish & Testing (Week 11)

#### Task 10.1: Error Handling

- [ ] Implement global error boundary (mobile)
- [ ] Create user-friendly error messages
- [ ] Add retry mechanisms for failed requests
- [ ] Implement offline detection and handling

#### Task 10.2: Loading States

- [ ] Add skeleton loaders to all list screens
- [ ] Add loading spinners to buttons
- [ ] Implement optimistic updates where appropriate
- [ ] Add pull-to-refresh to all data screens

#### Task 10.3: Empty States

- [ ] Design empty state for no matches
- [ ] Design empty state for no slips
- [ ] Design empty state for no transactions
- [ ] Add call-to-action buttons in empty states

#### Task 10.4: Input Validation

- [ ] Add form validation to all inputs
- [ ] Show inline validation errors
- [ ] Disable submit buttons when invalid
- [ ] Add character counters where needed

#### Task 10.5: Backend Testing

- [ ] Write unit tests for wallet service
- [ ] Write unit tests for settlement service
- [ ] Write unit tests for point calculation
- [ ] Write integration tests for auth flow
- [ ] Write integration tests for match flow

#### Task 10.6: Mobile Testing

- [ ] Test on iOS simulator (multiple device sizes)
- [ ] Test on Android emulator (multiple device sizes)
- [ ] Test auth flow end-to-end
- [ ] Test slip creation end-to-end
- [ ] Test match flow end-to-end

---

### Sprint 11: Deployment & Launch Prep (Week 12)

#### Task 11.1: Backend Deployment

- [ ] Set up production PostgreSQL (AWS RDS or similar)
- [ ] Set up production Redis (AWS ElastiCache or similar)
- [ ] Configure production environment variables
- [ ] Deploy API to Railway/Render/AWS
- [ ] Set up SSL certificates
- [ ] Configure domain and DNS

#### Task 11.2: CI/CD Pipeline

- [ ] Set up GitHub Actions for API
  - Run tests on PR
  - Deploy to staging on merge to develop
  - Deploy to production on merge to main
- [ ] Set up GitHub Actions for mobile
  - Run type checks and lints on PR
  - Build previews for PR

#### Task 11.3: Mobile Build Setup

- [ ] Configure EAS Build for iOS
- [ ] Configure EAS Build for Android
- [ ] Set up app signing (iOS certificates, Android keystore)
- [ ] Create development builds for testing
- [ ] Submit to TestFlight (iOS)
- [ ] Submit to Play Store Internal Testing (Android)

#### Task 11.4: Monitoring & Logging

- [ ] Set up Sentry for error tracking (API + Mobile)
- [ ] Configure structured logging (API)
- [ ] Set up basic alerting (API errors, downtime)
- [ ] Implement basic analytics events

#### Task 11.5: Pre-Launch Checklist

- [ ] Security audit (check auth, validate all inputs)
- [ ] Rate limiting verification
- [ ] Load testing (basic)
- [ ] Data backup verification
- [ ] Create admin tools for user management
- [ ] Prepare rollback procedure

---

## MVP Feature Summary

### Included in Phase 1 ✅

- User registration and authentication
- Virtual wallet with Rival Coins
- Weekly free coin allowance
- NFL and NBA event odds display
- Slip builder (Moneyline, Spread, Total picks)
- Point potential calculation
- Private 1v1 challenges via invite link
- Real-time match tracking
- Automated settlement
- Basic leaderboard (global and weekly)
- User profile with stats

### Deferred to Phase 2 ❌

- Public matchmaking
- In-app purchases
- Player props betting
- Friend lists and social features
- Push notifications (basic only in Phase 1)
- Advanced analytics
- Cosmetics and utilities (streak freeze, boosts)
- Additional sports (MLB, Soccer)
- Chat features

---

## Risk Mitigation

| Risk                        | Impact   | Mitigation                                                     |
| --------------------------- | -------- | -------------------------------------------------------------- |
| Sports data API rate limits | High     | Implement aggressive caching, use Redis                        |
| Settlement bugs             | Critical | Extensive testing, manual override capability                  |
| Real-time sync issues       | Medium   | Implement reconnection logic, show stale data warning          |
| App store rejection         | High     | Follow guidelines strictly, categorize as Sports/Entertainment |
| Slow API response           | Medium   | Implement loading states, optimize queries                     |

---

## Success Criteria for Phase 1

1. **Functional**: Users can complete full flow (register → build slip → challenge friend → track live → see result)
2. **Reliable**: Settlement correctly calculates winners 100% of the time
3. **Performant**: API responses < 500ms, real-time updates < 2s delay
4. **Stable**: < 1% crash rate on mobile
5. **Engaging**: 50% Day-1 retention (users return next day)

---

## Next Steps After Phase 1

Upon successful MVP validation:

1. Implement public matchmaking (Phase 2 priority)
2. Add in-app purchases
3. Expand to MLB and Soccer
4. Build friend system
5. Add push notifications

---

_Document Version: 1.0_
_Last Updated: December 2024_

---

## Task 7.2 Implementation Summary (Completed January 2026)

### Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/services/live-scores/types.ts` | Type definitions, sport scoring rules, status normalization |
| `apps/api/src/services/live-scores/live-scores.processor.ts` | Core score processing & validation logic |
| `apps/api/src/services/live-scores/live-scores.broadcaster.ts` | Socket.IO broadcasting to match/event rooms |
| `apps/api/src/services/live-scores/providers/base.provider.ts` | Abstract base class for data providers |
| `apps/api/src/services/live-scores/providers/odds-api.provider.ts` | The Odds API implementation |
| `apps/api/src/services/live-scores/providers/index.ts` | Provider registry & polling functions |
| `apps/api/src/services/live-scores/index.ts` | Service exports |
| `apps/api/src/modules/live-scores/live-scores.schemas.ts` | Zod validation schemas |
| `apps/api/src/modules/live-scores/live-scores.controller.ts` | HTTP endpoints (webhook, admin) |
| `apps/api/src/modules/live-scores/live-scores.routes.ts` | Express route definitions |
| `apps/api/src/modules/live-scores/index.ts` | Module exports |
| `apps/api/src/queues/live-scores.queue.ts` | BullMQ queue & worker |

### Files Modified

| File | Changes |
|------|---------|
| `apps/api/src/socket/socket.types.ts` | Added `event:score`, `event:status` events, `getEventRoomId()` |
| `apps/api/src/config/index.ts` | Added `liveScores` configuration block |
| `apps/api/src/app.ts` | Registered live-scores routes |
| `apps/api/src/index.ts` | Worker initialization & graceful shutdown |

### API Endpoints

- `POST /api/v1/webhooks/live-scores` - Webhook receiver (HMAC verified)
- `POST /api/v1/admin/live-scores/poll` - Manual poll trigger
- `GET /api/v1/admin/live-scores/queue-status` - Queue monitoring
- `GET /api/v1/admin/live-scores/live-events` - Current live events
- `POST /api/v1/admin/live-scores/manual-update` - Admin score override

### Socket Events

- `event:score` - Broadcast when game scores change
- `event:status` - Broadcast when game status changes (SCHEDULED → LIVE → COMPLETED)

### Configuration (Environment Variables)

```
LIVE_SCORES_WEBHOOK_SECRET=<hmac-secret>
LIVE_SCORES_POLL_INTERVAL=30000
LIVE_SCORES_ENABLE_POLLING=true
```

### Security Audit Findings (pvp-referee-auditor)

**Critical Issues to Address Before Production:**

1. Replace in-memory idempotency cache with Redis (distributed systems)
2. Add webhook timestamp validation (reject >5 min old)
3. Calculate HMAC on raw request body (before JSON parsing)
4. Add event status transition guards (auto-flag canceled games for review)
5. Implement Redis-backed rate limiting on webhook endpoint

**Medium Priority:**

- Race condition in match lookup query (wrap in transaction)
- Socket room join TOCTOU vulnerability
- Circuit breaker for provider polling
